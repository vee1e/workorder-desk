import { useState } from 'react';
import type { AgentRun, AgentRunStatus } from '@workorders/shared';
import { useAgentRunDetail, useAgentRuns } from './queries';
import { usePageTitle } from '../../hooks/usePageTitle';
import { PageHeader, EmptyState, ErrorBanner } from '../../components/primitives/Feedback';
import { FullPageSpinner } from '../../components/primitives/Spinner';
import { Card } from '../../components/primitives/Card';
import { formatDate } from '../../lib/utils';
import { messageFromError } from '../../lib/errors';
import { Markdown } from '../../components/Markdown';
import { cn } from '../../lib/utils';

const statusStyles: Record<AgentRunStatus, string> = {
  running: 'bg-work-400/10 text-work-400 ring-work-400/30',
  complete: 'bg-go-400/10 text-go-400 ring-go-400/30',
  error: 'bg-signal-500/10 text-signal-400 ring-signal-500/40',
  budget_exceeded: 'bg-signal-500/10 text-signal-400 ring-signal-500/40',
  expired: 'bg-steel-500/10 text-steel-300 ring-steel-500/40',
  aborted: 'bg-steel-500/10 text-steel-300 ring-steel-500/40',
};

function StatusBadge({ status }: { status: AgentRunStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider ring-1 ring-inset',
        statusStyles[status],
      )}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export function AgentRunsPage() {
  usePageTitle('Agent Runs');
  const [page, setPage] = useState(1);
  const limit = 10;
  const { data, isPending, isError, error } = useAgentRuns(page, limit);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useAgentRunDetail(selectedId);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  function toggleRow(run: AgentRun) {
    setSelectedId((current) => (current === run.id ? null : run.id));
  }

  return (
    <div>
      <PageHeader
        kicker="Agent"
        title="Agent Runs"
        description="History of autonomous and copilot agent runs."
      />

      {isPending && <FullPageSpinner />}
      {isError && <ErrorBanner message={messageFromError(error)} />}

      {data && data.items.length === 0 && <EmptyState title="No runs yet" />}

      {data && data.items.length > 0 && (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-wider text-steel-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Run</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Tokens</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((run) => (
                  <FragmentRow key={run.id} run={run} selected={selectedId === run.id} onToggle={() => toggleRow(run)}>
                    {selectedId === run.id && detail.isPending && (
                      <div className="flex items-center gap-2 text-sm text-steel-400">
                        <FullPageSpinner />
                        Loading run detail…
                      </div>
                    )}
                    {detail.data && selectedId === run.id && (
                      <RunDetail
                        messages={detail.data.messages}
                        toolCalls={detail.data.toolCalls}
                      />
                    )}
                  </FragmentRow>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="mt-4 flex items-center justify-between font-mono text-xs uppercase tracking-wider text-steel-400">
            <span>
              Page {page} of {totalPages} · {data.total} runs
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-line px-3 py-1.5 hover:text-ice disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-line px-3 py-1.5 hover:text-ice disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FragmentRow({
  run,
  selected,
  onToggle,
  children,
}: {
  run: AgentRun;
  selected: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          'cursor-pointer transition-colors hover:bg-ink-800',
          selected && 'bg-ink-800',
        )}
      >
        <td className="px-4 py-3 font-mono text-[13px] text-hi-300">{shortId(run.id)}</td>
        <td className="px-4 py-3 font-mono text-[13px] text-steel-300">{run.mode}</td>
        <td className="px-4 py-3 text-steel-300">{run.agentName ?? '—'}</td>
        <td className="px-4 py-3">
          <StatusBadge status={run.status} />
        </td>
        <td className="px-4 py-3 font-mono text-[13px] text-steel-300">{run.model}</td>
        <td className="px-4 py-3 font-mono text-[13px] text-steel-300">
          {run.inputTokens}→{run.outputTokens}
        </td>
        <td className="px-4 py-3 text-steel-300">{formatDate(run.startedAt)}</td>
        <td className="px-4 py-3 text-steel-300">{run.finishedAt ? formatDate(run.finishedAt) : '—'}</td>
      </tr>
      {selected && (
        <tr className="bg-ink-800/40">
          <td colSpan={8} className="px-4 py-4">
            {children}
          </td>
        </tr>
      )}
    </>
  );
}

function RunDetail({
  messages,
  toolCalls,
}: {
  messages: { role: string; content: string; toolCallId?: string; name?: string }[];
  toolCalls: {
    id: string;
    tool: string;
    outcome: string;
    args?: unknown;
    result?: unknown;
    createdAt: string;
  }[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-steel-500">Messages</p>
        {messages.length === 0 && <p className="text-sm text-steel-400">No messages recorded.</p>}
        <div className="space-y-2">
          {messages.map((m, i) => (
            <div key={i} className="rounded-md border border-line bg-ink-900 px-3 py-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-hi-300">
                  {m.role}
                </span>
                {m.name && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-steel-500">
                    {m.name}
                  </span>
                )}
              </div>
              {m.role === 'user' || m.role === 'assistant' ? (
                <Markdown text={m.content} />
              ) : (
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12px] text-steel-300">
                  {m.content}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-steel-500">Tool calls</p>
        {toolCalls.length === 0 && <p className="text-sm text-steel-400">No tool calls recorded.</p>}
        <div className="space-y-2">
          {toolCalls.map((tc) => (
            <div key={tc.id} className="rounded-md border border-line bg-ink-900 px-3 py-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-[11px] text-hi-300">{tc.tool}</span>
                <span className="font-mono text-[11px] uppercase tracking-wider text-steel-500">
                  {tc.outcome}
                </span>
                <span className="ml-auto font-mono text-[11px] text-steel-500">
                  {formatDate(tc.createdAt)}
                </span>
              </div>
              {tc.args !== undefined && (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-ink-800 px-2 py-1 font-mono text-[12px] text-steel-300">
                  {JSON.stringify(tc.args, null, 2)}
                </pre>
              )}
              {tc.result !== undefined && (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-ink-800 px-2 py-1 font-mono text-[12px] text-go-400">
                  {JSON.stringify(tc.result, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}