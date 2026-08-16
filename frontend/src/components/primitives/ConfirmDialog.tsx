import { useState } from 'react';
import { Button } from './Spinner';

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    await onConfirm();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-lg border border-line bg-ink-900 p-6 shadow-2xl">
        <p className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-signal-400">Confirm</p>
        <h3 className="font-display text-2xl font-semibold uppercase tracking-wide text-ice">{title}</h3>
        <p className="mt-2 text-sm text-steel-300">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} isLoading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}