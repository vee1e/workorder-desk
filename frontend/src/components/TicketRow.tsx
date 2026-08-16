import { Link } from 'react-router-dom';
import type { WorkOrderPublic } from '@workorders/shared';
import { cn, ticketNo, timeAgo } from '../lib/utils';
import { Badge } from './primitives/Badge';

export function TicketRow({ wo, to }: { wo: WorkOrderPublic; to: string }) {
  const edge =
    wo.priority === 'high' ? 'hazard-bar' : wo.priority === 'medium' ? 'bg-hi-400/70' : 'bg-steel-600';
  return (
    <li className="animate-fade-up">
      <Link
        to={to}
        className="group block overflow-hidden rounded-lg border border-line bg-ink-900 transition-colors hover:border-steel-500 hover:bg-ink-800"
      >
        <div className="flex items-stretch">
          <div aria-hidden className={cn('w-1.5 shrink-0', edge)} />
          <div className="flex flex-1 items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] tracking-wide text-steel-400">{ticketNo(wo.id)}</span>
                <p className="truncate font-display text-xl font-semibold uppercase leading-tight tracking-wide text-ice transition-colors group-hover:text-hi-300">
                  {wo.title}
                </p>
              </div>
              <p className="mt-1 text-sm text-steel-300">
                {wo.owner.name} · updated {timeAgo(wo.updatedAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge kind="priority" value={wo.priority} />
              <Badge kind="status" value={wo.status} />
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}