import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDeleteWorkOrder, useUpdateWorkOrder, useWorkOrder } from './queries';
import { WorkOrderForm, type WorkOrderSubmitValues } from './WorkOrderForm';
import { useMe } from '../../hooks/useAuth';
import { PageHeader, ErrorBanner } from '../../components/primitives/Feedback';
import { Button, FullPageSpinner } from '../../components/primitives/Spinner';
import { Card, CardBody, CardHeader } from '../../components/primitives/Card';
import { Badge } from '../../components/primitives/Badge';
import { ConfirmDialog } from '../../components/primitives/ConfirmDialog';
import { cn, formatDate, ticketNo } from '../../lib/utils';
import { ApiError, messageFromError } from '../../lib/errors';
import { usePageTitle } from '../../hooks/usePageTitle';

export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<WorkOrderSubmitValues | null>(null);
  const [formKey, setFormKey] = useState(0);

  const { data: me } = useMe();
  const isViewer = me?.role === 'viewer';
  const { data: wo, isPending, isError, error: queryError, refetch } = useWorkOrder(id);
  const update = useUpdateWorkOrder(id!);
  const remove = useDeleteWorkOrder(id!);
  usePageTitle(wo?.title ?? 'Work order');

  if (isPending && !wo) return <FullPageSpinner />;
  if (isError || !wo) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={messageFromError(queryError)} />
        <Link to="/app/work-orders">
          <Button variant="secondary">← Back to work orders</Button>
        </Link>
      </div>
    );
  }

  const formInitial = conflict && lastAttempt
    ? {
        title: lastAttempt.title,
        description: lastAttempt.description ?? '',
        priority: lastAttempt.priority,
        status: lastAttempt.status,
      }
    : {
        title: wo.title,
        description: wo.description ?? '',
        priority: wo.priority,
        status: wo.status,
      };

  return (
    <div>
      <PageHeader
        kicker={`${ticketNo(wo.id)} · ${wo.status === 'done' ? 'closed' : 'on the board'}`}
        title={wo.title}
        description={
          <>
            by {wo.owner.name} · opened {formatDate(wo.createdAt)}
          </>
        }
      >
        {isViewer ? (
          <span className="rounded-md border border-line bg-ink-800 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-steel-300">
            Read only
          </span>
        ) : (
          <div className="flex gap-2">
            {!editing && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </div>
        )}
      </PageHeader>

      {error && <ErrorBanner className="mb-4" message={error} />}

      {editing ? (
        <Card className="max-w-2xl">
          <CardBody>
            <WorkOrderForm
              key={formKey}
              initial={formInitial}
              submitting={update.isPending}
              error={update.isError ? messageFromError(update.error) : null}
              submitLabel="Save changes"
              onSubmit={async (values) => {
                try {
                  await update.mutateAsync({ ...values, version: wo.version });
                  setEditing(false);
                  setError(null);
                  setConflict(false);
                  setLastAttempt(null);
                } catch (err) {
                  if (err instanceof ApiError && err.code === 'CONFLICT_VERSION') {
                    setConflict(true);
                    setLastAttempt(values);
                    setError('This work order was changed elsewhere. Review the latest version, then save again.');
                    setFormKey((k) => k + 1);
                    await refetch();
                  } else {
                    setError(err instanceof ApiError ? err.message : 'Update failed');
                  }
                }
              }}
            />
            <div className="mt-4">
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card className="max-w-2xl overflow-hidden">
          <div className="flex items-stretch">
            <div
              aria-hidden
              className={cn(
                'w-1.5 shrink-0',
                wo.priority === 'high' ? 'hazard-bar' : wo.priority === 'medium' ? 'bg-hi-400/70' : 'bg-steel-600',
              )}
            />
            <div className="min-w-0 flex-1">
              <CardHeader
                title="Details"
                description={`Version ${wo.version}`}
                children={
                  <div className="flex items-center gap-2">
                    <Badge kind="priority" value={wo.priority} />
                    <Badge kind="status" value={wo.status} />
                  </div>
                }
              />
              <CardBody>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-steel-300">
                  {wo.description || 'No description.'}
                </p>
                <dl className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-wider text-steel-500">Owner</dt>
                    <dd className="mt-0.5 text-ice">
                      {wo.owner.name} <span className="text-steel-400">({wo.owner.email})</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-wider text-steel-500">Last updated</dt>
                    <dd className="mt-0.5 text-ice">{formatDate(wo.updatedAt)}</dd>
                  </div>
                </dl>
              </CardBody>
            </div>
          </div>
        </Card>
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete work order"
          message="This work order will be archived. This cannot be undone."
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            try {
              await remove.mutateAsync(wo.version);
              navigate('/app/work-orders');
            } catch (err) {
              if (err instanceof ApiError && err.code === 'CONFLICT_VERSION') {
                setConfirming(false);
                setError('This work order was changed elsewhere. Reloading latest version.');
                void refetch();
              } else {
                setConfirming(false);
                setError(err instanceof ApiError ? err.message : 'Delete failed');
              }
            }
          }}
        />
      )}
    </div>
  );
}