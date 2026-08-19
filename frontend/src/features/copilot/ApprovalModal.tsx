import { useEffect, useState } from 'react';
import type { ApprovalView } from './useCopilotStream';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Spinner';

function diffEntries(value: unknown): [string, unknown][] {
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>);
  }
  return [];
}

function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function ApprovalModal({
  approval,
  onDecide,
}: {
  approval: ApprovalView;
  onDecide: (approve: boolean) => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<boolean | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expiresAtMs = new Date(approval.expiresAt).getTime();
  const remainingMs = Math.max(0, expiresAtMs - now);
  const expired = remainingMs <= 0;
  const seconds = Math.ceil(remainingMs / 1000);

  const beforeEntries = diffEntries(approval.preImage);
  const afterEntries = diffEntries(approval.afterDiff);
  const keys = Array.from(
    new Set([...beforeEntries.map(([k]) => k), ...afterEntries.map(([k]) => k)]),
  );
  const beforeMap = new Map(beforeEntries);
  const afterMap = new Map(afterEntries);

  async function decide(approve: boolean) {
    if (expired || busy !== null) return;
    setBusy(approve);
    try {
      await onDecide(approve);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-line bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <p id="approval-title" className="font-display text-xl font-semibold uppercase tracking-wide text-ice">
              Tool approval
            </p>
            <Badge kind="status" value="pending" />
          </div>
          <span
            className={
              expired
                ? 'font-mono text-xs uppercase tracking-wider text-signal-400'
                : 'font-mono text-xs uppercase tracking-wider text-hi-300'
            }
          >
            {expired ? 'Expired' : `${seconds}s`}
          </span>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-steel-500">Tool</p>
            <p className="font-mono text-sm text-hi-300">{approval.tool}</p>
          </div>
          <p className="text-sm text-steel-300">{approval.summary}</p>

          {keys.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-ink-800 text-[11px] uppercase tracking-wider text-steel-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Field</th>
                    <th className="px-3 py-2 font-medium">Before</th>
                    <th className="px-3 py-2 font-medium">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-mono text-[13px]">
                  {keys.map((key) => (
                    <tr key={key}>
                      <td className="px-3 py-2 text-steel-300">{key}</td>
                      <td className="px-3 py-2 text-steel-400">{formatValue(beforeMap.get(key))}</td>
                      <td className="px-3 py-2 text-hi-300">{formatValue(afterMap.get(key))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-line px-5 py-4">
          <Button
            variant="secondary"
            disabled={expired || busy !== null}
            onClick={() => void decide(false)}
          >
            Reject
          </Button>
          <Button
            variant="primary"
            isLoading={busy === true}
            disabled={expired || busy !== null}
            onClick={() => void decide(true)}
          >
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}