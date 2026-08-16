import { Button } from './Spinner';
import { cn } from '../../lib/utils';

export function CursorPagination({
  nextCursor,
  onPrev,
  onNext,
  disabledPrev,
}: {
  nextCursor: string | null;
  onPrev: () => void;
  onNext: () => void;
  disabledPrev: boolean;
}) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <Button variant="secondary" onClick={onPrev} disabled={disabledPrev} className={cn(!disabledPrev && 'visible')}>
        ← Prev
      </Button>
      <Button variant="secondary" onClick={onNext} disabled={!nextCursor}>
        Next →
      </Button>
    </div>
  );
}