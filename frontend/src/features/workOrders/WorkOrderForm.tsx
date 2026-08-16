import { useState } from 'react';
import type { WorkOrderPriority, WorkOrderStatus } from '@workorders/shared';
import { Field, Input, Select } from '../../components/primitives/Input';
import { Button } from '../../components/primitives/Spinner';

export interface WorkOrderFormValues {
  title: string;
  description: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
}

export interface WorkOrderSubmitValues {
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
}

export function WorkOrderForm({
  initial,
  submitting,
  error,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<WorkOrderFormValues>;
  submitting: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (values: WorkOrderSubmitValues) => void;
}) {
  const [values, setValues] = useState<WorkOrderFormValues>({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    priority: initial?.priority ?? 'medium',
    status: initial?.status ?? 'pending',
  });
  const [fieldError, setFieldError] = useState<string | null>(null);

  function set<K extends keyof WorkOrderFormValues>(key: K, value: WorkOrderFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const title = values.title.trim();
    if (title.length < 3) {
      setFieldError('Title must be at least 3 characters');
      return;
    }
    setFieldError(null);
    onSubmit({
      title,
      description: values.description.trim() || null,
      priority: values.priority,
      status: values.status,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="title" error={fieldError ?? undefined}>
        <Input
          id="title"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Fix leaking pipe at 14th St"
        />
      </Field>
      <Field label="Description" htmlFor="description">
        <textarea
          id="description"
          rows={4}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Job details, notes, parts needed…"
          className="w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-ice placeholder:text-steel-500 focus:border-hi-400 focus:outline-none focus:ring-1 focus:ring-hi-400"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" value={values.priority} onChange={(e) => set('priority', e.target.value as WorkOrderPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" value={values.status} onChange={(e) => set('status', e.target.value as WorkOrderStatus)}>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </Select>
        </Field>
      </div>
      {error && <p className="text-sm text-signal-400">{error}</p>}
      <Button type="submit" isLoading={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}