import { cn } from '../../lib/utils';

export type BadgeKind = 'status' | 'priority';

const styles: Record<BadgeKind, Record<string, string>> = {
  status: {
    pending: 'bg-hi-400/10 text-hi-300 ring-hi-400/30',
    in_progress: 'bg-work-400/10 text-work-400 ring-work-400/30',
    done: 'bg-go-400/10 text-go-400 ring-go-400/30',
  },
  priority: {
    low: 'bg-steel-500/10 text-steel-300 ring-steel-500/40',
    medium: 'bg-hi-400/10 text-hi-300 ring-hi-400/30',
    high: 'bg-signal-500/10 text-signal-400 ring-signal-500/40',
  },
};

const labels: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export function Badge({ kind, value, className }: { kind: BadgeKind; value: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider ring-1 ring-inset',
        styles[kind][value] ?? 'bg-steel-500/10 text-steel-300 ring-steel-500/40',
        className,
      )}
    >
      {kind === 'priority' && value === 'high' && <span aria-hidden className="hazard-chip" />}
      {labels[value] ?? value}
    </span>
  );
}