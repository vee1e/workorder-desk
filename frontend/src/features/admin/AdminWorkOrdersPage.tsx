import { useEffect, useState } from 'react';
import type { WorkOrderPriority, WorkOrderStatus } from '@workorders/shared';
import { useAdminWorkOrders } from './queries';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { PageHeader, EmptyState, ErrorBanner } from '../../components/primitives/Feedback';
import { FullPageSpinner } from '../../components/primitives/Spinner';
import { FilterTabs } from '../../components/primitives/FilterTabs';
import { Input, Select } from '../../components/primitives/Input';
import { CursorPagination } from '../../components/primitives/CursorPagination';
import { TicketRow } from '../../components/TicketRow';
import { messageFromError } from '../../lib/errors';

import { usePageTitle } from '../../hooks/usePageTitle';

export function AdminWorkOrdersPage() {
  usePageTitle('All work orders');
  const [status, setStatus] = useState<WorkOrderStatus | ''>('');
  const [priority, setPriority] = useState<WorkOrderPriority | ''>('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [prevStack, setPrevStack] = useState<string[]>([]);
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    setCursor(undefined);
    setPrevStack([]);
  }, [debouncedSearch]);

  const { data, isPending, isError, error } = useAdminWorkOrders(
    { status: status || undefined, priority: priority || undefined, search: debouncedSearch.trim() || undefined },
    cursor,
  );

  function reset() {
    setCursor(undefined);
    setPrevStack([]);
  }

  return (
    <div>
      <PageHeader
        kicker="Dispatch · every job"
        title="All work orders"
        description="Every job across the team."
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterTabs
          value={status}
          onChange={(v) => {
            setStatus(v as WorkOrderStatus | '');
            reset();
          }}
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
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value as WorkOrderPriority | '');
              reset();
            }}
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isPending && <FullPageSpinner />}
      {isError && <ErrorBanner message={messageFromError(error)} />}

      {data && data.items.length === 0 && <EmptyState title="No work orders found" />}

      {data && data.items.length > 0 && (
        <>
          <ul className="space-y-2.5">
            {data.items.map((wo) => (
              <TicketRow key={wo.id} wo={wo} to={`/app/work-orders/${wo.id}`} />
            ))}
          </ul>
          <CursorPagination
            nextCursor={data.nextCursor}
            onPrev={() => {
              const previous = prevStack[prevStack.length - 1];
              if (previous === undefined) return;
              setPrevStack((s) => s.slice(0, -1));
              setCursor(previous);
            }}
            onNext={() => {
              if (data.nextCursor) {
                setPrevStack((s) => [...s, cursor ?? '']);
                setCursor(data.nextCursor);
              }
            }}
            disabledPrev={prevStack.length === 0}
          />
        </>
      )}
    </div>
  );
}