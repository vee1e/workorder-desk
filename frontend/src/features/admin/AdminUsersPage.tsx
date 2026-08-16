import { useState } from 'react';
import type { Role } from '@workorders/shared';
import { useAdminUsers, useUpdateRole, useUpdateStatus } from './queries';
import { useMe } from '../../hooks/useAuth';
import { PageHeader, EmptyState, ErrorBanner } from '../../components/primitives/Feedback';
import { FullPageSpinner } from '../../components/primitives/Spinner';
import { Card, CardBody } from '../../components/primitives/Card';
import { Input, Select } from '../../components/primitives/Input';
import { formatDate } from '../../lib/utils';
import { messageFromError } from '../../lib/errors';

export function AdminUsersPage() {
  const { data: me } = useMe();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');

  const { data, isPending, isError, error } = useAdminUsers(page, 20, role || undefined, search || undefined);
  const updateRole = useUpdateRole();
  const updateStatus = useUpdateStatus();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <PageHeader kicker="Crew" title="Team" description="Manage accounts, roles and access." />

      <Card className="mb-5">
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Input
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role | '');
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            <option value="user">Technician</option>
            <option value="admin">Dispatcher</option>
          </Select>
        </CardBody>
      </Card>

      {isPending && <FullPageSpinner />}
      {isError && <ErrorBanner message={messageFromError(error)} />}

      {data && data.items.length === 0 && <EmptyState title="No users found" />}

      {data && data.items.length > 0 && (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-wider text-steel-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Last login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((u) => {
                  const isSelf = u.id === me?.id;
                  return (
                    <tr key={u.id}>
                      <td className="px-5 py-3 font-medium text-ice">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-700 font-display text-lg font-bold uppercase text-hi-300">
                            {u.name.charAt(0)}
                          </span>
                          <span>
                            {u.name}
                            {isSelf && <span className="ml-2 font-mono text-[11px] text-steel-500">(you)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-[13px] text-steel-300">{u.email}</td>
                      <td className="px-5 py-3">
                        <Select
                          className="w-auto"
                          value={u.role}
                          disabled={isSelf}
                          onChange={async (e) => {
                            try {
                              await updateRole.mutateAsync({ id: u.id, role: e.target.value as Role });
                            } catch (err) {
                              alert(messageFromError(err, 'Role change failed'));
                            }
                          }}
                        >
                          <option value="user">Technician</option>
                          <option value="admin">Dispatcher</option>
                          <option value="viewer">Viewer</option>
                        </Select>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            u.isActive
                              ? 'font-mono text-[11px] font-medium uppercase tracking-wider text-go-400'
                              : 'font-mono text-[11px] font-medium uppercase tracking-wider text-steel-400'
                          }
                        >
                          {u.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-steel-300">
                        <div className="flex items-center gap-3">
                          <span>{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</span>
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={async () => {
                              try {
                                await updateStatus.mutateAsync({ id: u.id, isActive: !u.isActive });
                              } catch (err) {
                                alert(messageFromError(err, 'Status change failed'));
                              }
                            }}
                            className="font-mono text-[11px] uppercase tracking-wider text-hi-400 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {u.isActive ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <div className="mt-4 flex items-center justify-between font-mono text-xs uppercase tracking-wider text-steel-400">
            <span>
              Page {page} of {totalPages} · {data.total} crew
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