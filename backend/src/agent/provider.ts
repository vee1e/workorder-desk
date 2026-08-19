import { env } from '../config/env.js';

const TIMEOUT_MS = 60_000;
const MAX_CONTENT_LENGTH = 1024 * 1024;
const BAD_STATUS_BODY_LIMIT = 500;

function endpoint(): string {
  return env.AI_BASE_URL!.replace(/\/+$/, '') + '/chat/completions';
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.AI_API_KEY!}`,
  };
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ProviderToolCall[];
}

export interface ProviderToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ProviderTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ProviderResult {
  content: string;
  tool_calls: ProviderToolCall[];
  inputTokens: number;
  outputTokens: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: 'timeout' | 'network' | 'bad_status' | 'invalid_response' | 'size',
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export const providerModel: string = env.AI_MODEL;

export function makeToolCall(id: string, name: string, args: unknown): ProviderToolCall {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function combinedSignal(signal: AbortSignal | undefined): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
}

function buildBody(
  messages: ProviderMessage[],
  tools: ProviderTool[],
  maxTokens: number | undefined,
  stream: boolean,
): Record<string, unknown> {
  return {
    model: env.AI_MODEL,
    messages,
    max_tokens: maxTokens ?? env.AI_MAX_OUTPUT_TOKENS,
    stream,
    ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  };
}

function mapError(err: unknown): never {
  if (err instanceof ProviderError) throw err;
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'AbortError') throw err;
  if (name === 'TimeoutError') throw new ProviderError('timeout', 'timeout');
  throw new ProviderError('network', 'network');
}

async function assertOk(res: Response): Promise<void> {
  if (res.ok) return;
  const body = (await res.text()).slice(0, BAD_STATUS_BODY_LIMIT);
  throw new ProviderError(`bad_status ${res.status}: ${body}`, 'bad_status');
}

function normalizeToolCalls(value: unknown): ProviderToolCall[] {
  if (!Array.isArray(value)) return [];
  const out: ProviderToolCall[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const call = raw as Record<string, unknown>;
    const fn = (call.function ?? {}) as Record<string, unknown>;
    out.push({
      id: typeof call.id === 'string' ? call.id : '',
      type: 'function',
      function: {
        name: typeof fn.name === 'string' ? fn.name : '',
        arguments: typeof fn.arguments === 'string' ? fn.arguments : '',
      },
    });
  }
  return out;
}

export async function chatComplete(
  messages: ProviderMessage[],
  tools: ProviderTool[],
  opts: { maxTokens?: number; signal?: AbortSignal } = {},
): Promise<ProviderResult> {
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(buildBody(messages, tools, opts.maxTokens, false)),
      redirect: 'error',
      signal: combinedSignal(opts.signal),
    });
  } catch (err) {
    mapError(err);
  }
  await assertOk(res!);
  let data: Record<string, unknown>;
  try {
    data = (await res!.json()) as Record<string, unknown>;
  } catch {
    throw new ProviderError('invalid_response', 'invalid_response');
  }
  const obj = (data ?? {}) as Record<string, unknown>;
  const choice = ((obj.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message ?? {}) as Record<
    string,
    unknown
  >;
  const usage = (obj.usage ?? {}) as Record<string, unknown>;
  return {
    content: typeof choice.content === 'string' ? choice.content : '',
    tool_calls: normalizeToolCalls(choice.tool_calls),
    inputTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0,
    outputTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0,
  };
}

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

export async function chatStream(
  messages: ProviderMessage[],
  tools: ProviderTool[],
  opts: { maxTokens?: number; signal?: AbortSignal; onToken?: (delta: string) => void } = {},
): Promise<ProviderResult> {
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(buildBody(messages, tools, opts.maxTokens, true)),
      redirect: 'error',
      signal: combinedSignal(opts.signal),
    });
  } catch (err) {
    mapError(err);
  }
  await assertOk(res!);
  if (!res!.body) throw new ProviderError('network', 'network');

  const reader = res!.body.getReader();
  const decoder = new TextDecoder();
  const pending = new Map<number, PendingToolCall>();
  let buffer = '';
  let content = '';
  let received = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const handleLine = (line: string): boolean => {
    if (!line.startsWith('data:')) return false;
    const payload = line.slice('data:'.length).trim();
    if (!payload) return false;
    if (payload === '[DONE]') return true;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      throw new ProviderError('invalid_response', 'invalid_response');
    }
    const obj = (data ?? {}) as Record<string, unknown>;
    const choices = (obj.choices ?? []) as Array<Record<string, unknown>>;
    const delta = (choices[0]?.delta ?? {}) as Record<string, unknown>;
    if (typeof delta.content === 'string') {
      received += delta.content.length;
      content += delta.content;
      if (delta.content.length) opts.onToken?.(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const raw of delta.tool_calls) {
        if (!raw || typeof raw !== 'object') continue;
        const call = raw as Record<string, unknown>;
        if (typeof call.index !== 'number') continue;
        const fn = (call.function ?? {}) as Record<string, unknown>;
        const entry = pending.get(call.index) ?? { id: '', name: '', arguments: '' };
        if (typeof call.id === 'string') entry.id = call.id;
        if (typeof fn.name === 'string') entry.name = fn.name;
        if (typeof fn.arguments === 'string') {
          entry.arguments += fn.arguments;
          received += fn.arguments.length;
        }
        pending.set(call.index, entry);
      }
    }
    const usage = obj.usage as Record<string, unknown> | undefined;
    if (usage && typeof usage.prompt_tokens === 'number') inputTokens = usage.prompt_tokens;
    if (usage && typeof usage.completion_tokens === 'number') outputTokens = usage.completion_tokens;
    if (received > MAX_CONTENT_LENGTH) throw new ProviderError('size', 'size');
    return false;
  };

  let streamDone = false;
  try {
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (handleLine(line.trim())) {
          streamDone = true;
          break;
        }
      }
    }
    if (buffer.trim()) handleLine(buffer.trim());
  } catch (err) {
    mapError(err);
  }

  const tool_calls: ProviderToolCall[] = [...pending.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    }));
  return { content, tool_calls, inputTokens, outputTokens };
}