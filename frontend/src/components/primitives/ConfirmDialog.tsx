import { useEffect, useRef, useState } from 'react';
import { Button } from './Spinner';

const titleId = 'confirm-dialog-title';
const descId = 'confirm-dialog-desc';

function focusablesIn(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const cancelButton = panel?.querySelector<HTMLButtonElement>('button[data-dialog-cancel]');
    cancelButton?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = focusablesIn(panel);
      if (items.length === 0) return;
      const first = items[0] as HTMLElement | undefined;
      const last = items[items.length - 1] as HTMLElement | undefined;
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onCancel]);

  async function handleConfirm() {
    setBusy(true);
    await onConfirm();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div ref={panelRef} className="w-full max-w-sm rounded-lg border border-line bg-ink-900 p-6 shadow-2xl">
        <p className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-signal-400">Confirm</p>
        <h3 id={titleId} className="font-display text-2xl font-semibold uppercase tracking-wide text-ice">
          {title}
        </h3>
        <p id={descId} className="mt-2 text-sm text-steel-300">
          {message}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" data-dialog-cancel onClick={onCancel}>
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