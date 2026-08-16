import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-lg border border-line bg-ink-900 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]', className)}>{children}</div>;
}

export function CardHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-ice">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-steel-300">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}