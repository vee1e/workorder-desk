import { cn } from '../../lib/utils';

export function PageHeader({
  title,
  description,
  kicker,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  kicker?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && (
          <p className="mb-1 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-hi-400">
            <span aria-hidden className="hazard-chip" />
            {kicker}
          </p>
        )}
        <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-tight text-ice">{title}</h1>
        {description && <p className="mt-2 text-sm text-steel-300">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-steel-600 bg-ink-900 px-6 py-20 text-center">
      <span aria-hidden className="mb-4 block h-10 w-10 rounded-md hazard-bar opacity-70" />
      <p className="font-display text-2xl font-semibold uppercase tracking-wide text-ice">{title}</p>
      {description && <p className="mt-2 max-w-md text-sm text-steel-300">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={cn('rounded-md border border-signal-500/40 bg-signal-500/10 px-4 py-3 text-sm text-signal-400', className)}
    >
      {message}
    </div>
  );
}