import { useCallback, useRef, useState } from 'react';
import { postEventStream } from '../../api/stream';

export interface StreamMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ApprovalView {
  toolCallId: string;
  tool: string;
  summary: string;
  args: unknown;
  preImage: unknown;
  afterDiff: unknown;
  expiresAt: string;
}

function resultText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result === undefined || result === null) return '';
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

export function useCopilotStream() {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalView | null>(null);
  const [toolResults, setToolResults] = useState<Record<string, string>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const inFlight = useRef(false);

  const appendToken = useCallback((content: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant') {
        return [...prev.slice(0, -1), { role: 'assistant', content: last.content + content }];
      }
      return [...prev, { role: 'assistant', content }];
    });
  }, []);

  const finalizeAssistant = useCallback((content: string) => {
    if (!content) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant') {
        return [...prev.slice(0, -1), { role: 'assistant', content }];
      }
      return [...prev, { role: 'assistant', content }];
    });
  }, []);

  const send = useCallback(
    async (content: string, sessionId: string, signal?: AbortSignal): Promise<void> => {
      if (inFlight.current || pendingApproval) return;
      inFlight.current = true;
      setMessages((prev) => [...prev, { role: 'user', content }]);
      setToolResults({});
      setRunId(null);
      setError(null);
      setIsStreaming(true);
      try {
        await postEventStream(
          `/ai/sessions/${sessionId}/messages`,
          { content },
          {
            signal,
            onEvent: (event, data) => {
              switch (event) {
                case 'token': {
                  const d = data as { content: string };
                  appendToken(d.content);
                  break;
                }
                case 'tool_approval_required': {
                  const d = data as {
                    toolCallId: string;
                    tool: string;
                    args?: unknown;
                    preImage?: unknown;
                    afterDiff?: unknown;
                    summary: string;
                    expiresAt: string;
                  };
                  setPendingApproval({
                    toolCallId: d.toolCallId,
                    tool: d.tool,
                    args: d.args,
                    preImage: d.preImage,
                    afterDiff: d.afterDiff,
                    summary: d.summary,
                    expiresAt: d.expiresAt,
                  });
                  break;
                }
                case 'tool_approval_expired': {
                  const d = data as { toolCallId: string };
                  setPendingApproval((prev) => (prev && prev.toolCallId === d.toolCallId ? null : prev));
                  break;
                }
                case 'tool_result': {
                  const d = data as { toolCallId: string; outcome: string; result?: unknown };
                  const text = resultText(d.result);
                  if (text) {
                    setToolResults((prev) => ({ ...prev, [d.toolCallId]: text }));
                  }
                  setPendingApproval((prev) => (prev && prev.toolCallId === d.toolCallId ? null : prev));
                  break;
                }
                case 'message_done': {
                  const d = data as { runId: string; content: string };
                  setRunId(d.runId);
                  finalizeAssistant(d.content);
                  setPendingApproval(null);
                  break;
                }
                case 'error': {
                  const d = data as { code: string; message: string };
                  setError(d.message || `AI error (${d.code})`);
                  break;
                }
                default:
                  break;
              }
            },
            onDone: () => setIsStreaming(false),
            onError: (err) => setError(err.message),
          },
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setPendingApproval(null);
        } else {
          setError(err instanceof Error ? err.message : 'Stream failed');
          setPendingApproval(null);
        }
      } finally {
        inFlight.current = false;
        setIsStreaming(false);
      }
    },
    [appendToken, finalizeAssistant, pendingApproval],
  );

  const clearError = useCallback(() => setError(null), []);

  return { messages, pendingApproval, toolResults, isStreaming, error, runId, send, clearError };
}