import './ai-helpers.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatComplete, chatStream, ProviderError } from '../src/agent/provider.js';

// Exercises the REAL provider HTTP client with a stubbed global fetch.

type FetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
  body?: ReadableStream<Uint8Array>;
};

function jsonResponse(
  body: unknown,
  options: { ok?: boolean; status?: number; text?: string } = {},
): FetchResponse {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    text: vi.fn().mockResolvedValue(options.text ?? JSON.stringify(body)),
    json: vi.fn().mockResolvedValue(body),
  };
}

function sseResponse(...chunks: string[]): FetchResponse {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    text: vi.fn(),
    json: vi.fn(),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  };
}

const sse = (obj: unknown): string => `data: ${JSON.stringify(obj)}\n\n`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('provider.chatComplete', () => {
  it('returns content, tool calls and usage on the happy path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: 'Hello',
              tool_calls: [{ id: 't1', type: 'function', function: { name: 'get_profile', arguments: '{}' } }],
            },
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 5 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await chatComplete(
      [{ role: 'user', content: 'hi' }],
      [{ type: 'function', function: { name: 'get_profile', description: 'd', parameters: {} } }],
      { maxTokens: 100 },
    );

    expect(result).toEqual({
      content: 'Hello',
      tool_calls: [{ id: 't1', type: 'function', function: { name: 'get_profile', arguments: '{}' } }],
      inputTokens: 12,
      outputTokens: 5,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://llm.example.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer test-key' });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-4o-mini',
      stream: false,
      max_tokens: 100,
      tool_choice: 'auto',
    });
    expect(body.tools).toHaveLength(1);
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('omits tools when none are provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    await chatComplete([{ role: 'user', content: 'hi' }], []);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as Record<string, unknown>;
    expect(body.tools).toBeUndefined();
  });

  it('maps non-2xx responses to a bad_status ProviderError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null, { ok: false, status: 503, text: 'Overloaded' })));
    await expect(chatComplete([{ role: 'user', content: 'hi' }], [])).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'bad_status',
      message: 'bad_status 503: Overloaded',
    });
  });

  it('maps a JSON parse failure to an invalid_response ProviderError', async () => {
    const res = jsonResponse(null);
    res.json = vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
    await expect(chatComplete([{ role: 'user', content: 'hi' }], [])).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'invalid_response',
    });
  });

  it('maps a fetch rejection to a network ProviderError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(chatComplete([{ role: 'user', content: 'hi' }], [])).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'network',
    });
  });

  it('maps a TimeoutError to a timeout ProviderError', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));
    await expect(chatComplete([{ role: 'user', content: 'hi' }], [])).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'timeout',
    });
  });

  it('rethrows AbortError as-is', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    await expect(chatComplete([{ role: 'user', content: 'hi' }], [])).rejects.toBe(abort);
  });
});

describe('provider.chatStream', () => {
  it('assembles content deltas across line-buffered chunks and reports usage', async () => {
    const deltas: string[] = [];
    // First enqueue carries no newline, so the line is completed by the second enqueue.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse(
          'data: {"choices":[{"delta":{"content":"Hel', // no newline: continues mid-line
          `lo"}}]}\n\n${sse({ choices: [{ delta: { content: ' world' } }] })}${
            sse({ usage: { prompt_tokens: 9, completion_tokens: 4 } })
          }data: [DONE]\n\n`,
        ),
      ),
    );

    const result = await chatStream([{ role: 'user', content: 'hi' }], [], { onToken: (delta) => deltas.push(delta) });

    expect(result).toEqual({ content: 'Hello world', tool_calls: [], inputTokens: 9, outputTokens: 4 });
    expect(deltas).toEqual(['Hello', ' world']);
  });

it('assembles tool-call deltas by index with arguments split across chunks', async () => {
    // Build raw SSE payloads as strings: nested object literals containing
    // single-quoted strings that end in "}" confuse esbuild's TS type parser.
    const chunk = (payload: string): string => `data: ${payload}\n\n`;
    const toolCallDelta = (
      index: number,
      id: string | null,
      name: string | null,
      argumentsJson: string | null,
    ): string => {
      const parts = [`{"index":${index}`];
      if (id) parts.push(`"id":${JSON.stringify(id)}`);
      const fn = [
        ...(name ? [`"name":${JSON.stringify(name)}`] : []),
        ...(argumentsJson !== null ? [`"arguments":${JSON.stringify(argumentsJson)}`] : []),
      ];
      parts.push(`"function":{${fn.join(',')}}`);
      return chunk(`{"choices":[{"delta":{"tool_calls":[${parts.join(',')}}]}}]}`);
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse(
          toolCallDelta(0, 'call_a', 'search', ''),
          toolCallDelta(0, null, null, '{"q":"'),
          toolCallDelta(0, null, null, 'needle"}'),
          toolCallDelta(1, 'call_b', 'read', '{}'),
          sse({ usage: { prompt_tokens: 11, completion_tokens: 6 } }),
          'data: [DONE]\n\n',
        ),
      ),
    );

    const result = await chatStream([{ role: 'user', content: 'hi' }], []);

    expect(result.tool_calls).toEqual([
      { id: 'call_a', type: 'function', function: { name: 'search', arguments: '{"q":"needle"}' } },
      { id: 'call_b', type: 'function', function: { name: 'read', arguments: '{}' } },
    ]);
    expect(result.inputTokens).toBe(11);
    expect(result.outputTokens).toBe(6);
    expect(result.content).toBe('');
  });

  it('rejects streams that exceed the 1MB content cap', async () => {
    const big = 'x'.repeat(1024 * 1024 + 1);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse(sse({ choices: [{ delta: { content: big } }] }), 'data: [DONE]\n\n')),
    );
    await expect(chatStream([{ role: 'user', content: 'hi' }], [])).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'size',
    });
  });

  it('rejects malformed SSE JSON payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse('data: definitely-not-json\n\n')));
    await expect(chatStream([{ role: 'user', content: 'hi' }], [])).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'invalid_response',
    });
  });

  it('maps a missing response body to a network ProviderError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: vi.fn(), json: vi.fn() }));
    await expect(chatStream([{ role: 'user', content: 'hi' }], [])).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'network',
    });
  });

  it('is an instance of ProviderError for typed failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null, { ok: false, status: 500, text: 'boom' })));
    try {
      await chatStream([{ role: 'user', content: 'hi' }], []);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).code).toBe('bad_status');
    }
  });
});
