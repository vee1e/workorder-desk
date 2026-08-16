import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { WorkOrderPriority, WorkOrderStatus } from '@workorders/shared';
import { useWorkOrderBoard, type WorkOrderFilters } from './queries';
import { useMe } from '../../hooks/useAuth';
import { PageHeader, EmptyState, ErrorBanner } from '../../components/primitives/Feedback';
import { Button, FullPageSpinner } from '../../components/primitives/Spinner';
import { FilterTabs } from '../../components/primitives/FilterTabs';
import { Input, Select } from '../../components/primitives/Input';
import { CursorPagination } from '../../components/primitives/CursorPagination';
import { TicketRow } from '../../components/TicketRow';
import { messageFromError } from '../../lib/errors';

export function WorkOrderListPage() {
  const { data: me } = useMe();
  const isViewer = me?.role === 'viewer';
  const [filters, setFilters] = useState<WorkOrderFilters>({});
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [prevStack, setPrevStack] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');

  const { data, isPending, isError, error } = useWorkOrderBoard(filters, cursor, isViewer ? 'all' : 'own');

  function applyFilters(next: Partial<WorkOrderFilters>) {
    setFilters((f) => ({ ...f, ...next }));
    setCursor(undefined);
    setPrevStack([]);
  }

  function nextPage() {
    if (data?.nextCursor) {
      setPrevStack((s) => [...s, cursor ?? '']);
      setCursor(data.nextCursor);
    }
  }

  function prevPage() {
    const previous = prevStack[prevStack.length - 1];
    if (previous === undefined) return;
    setPrevStack((s) => s.slice(0, -1));
    setCursor(previous);
  }

  return (
    <div>
      <PageHeader
        kicker={isViewer ? 'Read only · every job' : 'Your route'}
        title="Work orders"
        description={isViewer ? 'Browse all jobs on the team. Viewing is read only.' : 'Jobs on your board, from request to completion.'}
      >
        {!isViewer && (
          <Link to="/app/work-orders/new">
            <Button>+ New ticket</Button>
          </Link>
        )}
      </PageHeader>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterTabs
          value={filters.status ?? ''}
          onChange={(v) => applyFilters({ status: (v || undefined) as WorkOrderStatus | undefined })}
          options={[
            { value: '', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'done', label: 'Done' },
          ]}
        />
        <div className="flex gap-3 sm:ml-auto">
          <Select
            className="w-36"
            value={filters.priority ?? ''}
            onChange={(e) => applyFilters({ priority: (e.target.value || undefined) as WorkOrderPriority | undefined })}
            aria-label="Filter by priority"
          >
            <option value="">All priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
          <Input
            className="sm:w-52"
            placeholder="Search by title"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyFilters({ search: searchInput.trim() || undefined });
            }}
          />
        </div>
      </div>

      {isPending && <FullPageSpinner />}
      {isError && <ErrorBanner message={messageFromError(error)} />}

      {data && data.items.length === 0 && (
        <EmptyState
          title="No tickets on the board"
          description={isViewer ? 'There are no work orders to show.' : 'Log your first job to start tracking field work.'}
          action={
            !isViewer ? (
              <Link to="/app/work-orders/new">
                <Button>+ New ticket</Button>
              </Link>
            ) : undefined
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="space-y-2.5">
            {data.items.map((wo) => (
              <TicketRow key={wo.id} wo={wo} to={`/app/work-orders/${wo.id}`} />
            ))}
          </ul>
          <CursorPagination nextCursor={data.nextCursor} onPrev={prevPage} onNext={nextPage} disabledPrev={prevStack.length === 0} />
        </>
      )}
    </div>
  );
}