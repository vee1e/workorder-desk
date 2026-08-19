import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { ApiError } from '../../lib/errors';
import { useCopilotSession, useDecideApproval } from './queries';
import { useCopilotStream } from './useCopilotStream';
import { ApprovalModal } from './ApprovalModal';
import { Markdown } from '../../components/Markdown';
import { Button, Spinner } from '../../components/primitives/Spinner';
import { Card } from '../../components/primitives/Card';

function isDisabledError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status === 403 || error.code === 'AI_UNAVAILABLE' || error.status === 503;
}

export function CopilotPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: session, isPending: sessionPending, error: sessionError } = useCopilotSession();
  const {
    messages,
    pendingApproval,
    isStreaming,
    error: streamError,
    send,
    clearError,
  } = useCopilotStream();
  const decide = useDecideApproval();
  const [draft, setDraft] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  const blocked = isStreaming || Boolean(pendingApproval);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !session || blocked) return;
    setDraft('');
    clearError();
    abortRef.current = new AbortController();
    await send(content, session.id, abortRef.current.signal);
  }

  async function handleDecide(approve: boolean) {
    if (!pendingApproval) return;
    try {
      await decide.mutateAsync({ id: pendingApproval.toolCallId, approve });
    } catch {
      // surfaced on the next stream turn; keep the modal open for a retry decision
    }
  }

  const unavailableNote =
    sessionError && isDisabledError(sessionError)
      ? 'AI is not available for your account. Ask an admin to enable AI access.'
      : null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-40 lg:left-auto',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      aria-hidden={!open}
    >
      <div
        className={cn(
          'absolute inset-0 bg-ink-950/60 backdrop-blur-sm transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Copilot"
        className={cn(
          'absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-line bg-ink-900 shadow-2xl transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span aria-hidden className="hazard-chip" />
            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ice">Copilot</h2>
            {isStreaming && <Spinner size="sm" />}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close copilot"
            className="rounded-md border border-line px-2.5 py-1 font-mono text-xs uppercase tracking-wider text-steel-300 hover:text-ice"
          >
            Close
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {unavailableNote && (
            <div
              role="alert"
              className="rounded-md border border-signal-500/40 bg-signal-500/10 px-4 py-3 text-sm text-signal-400"
            >
              {unavailableNote}
            </div>
          )}
          {streamError && (
            <div
              role="alert"
              className="rounded-md border border-signal-500/40 bg-signal-500/10 px-4 py-3 text-sm text-signal-400"
            >
              {streamError}
            </div>
          )}

          {messages.length === 0 && !unavailableNote && (
            <p className="px-1 py-6 text-center text-sm text-steel-400">
              Ask me to draft, update or triage work orders. Changes are previewed for your approval.
            </p>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-ice">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <Card className="max-w-[92%] px-3 py-2">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-steel-500">
                    Copilot
                  </div>
                  <Markdown text={m.content} />
                </Card>
              </div>
            ),
          )}
        </div>

        <form onSubmit={handleSend} className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <textarea
              aria-label="Message Copilot"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              disabled={blocked || Boolean(unavailableNote) || sessionPending || !session}
              placeholder={
                blocked
                  ? isStreaming
                    ? 'Copilot is working…'
                    : 'Waiting for approval…'
                  : 'Ask Copilot…'
              }
              rows={2}
              className="flex-1 resize-none rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-ice placeholder:text-steel-500 focus:border-hi-400 focus:outline-none focus:ring-1 focus:ring-hi-400 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Button
              type="submit"
              disabled={
                blocked || !draft.trim() || Boolean(unavailableNote) || sessionPending || !session
              }
            >
              Send
            </Button>
          </div>
          {pendingApproval ? (
            <p className="mt-2 text-xs text-steel-400">
              Complete the pending approval to resume the conversation.
            </p>
          ) : (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-steel-500">
              Copilot can draft, update and triage work orders
            </p>
          )}
        </form>
      </div>

      {open && pendingApproval && <ApprovalModal approval={pendingApproval} onDecide={handleDecide} />}
    </div>
  );
}