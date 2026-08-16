import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'signal';

const variants: Record<Variant, string> = {
  primary: 'bg-hi-400 text-ink-950 hover:bg-hi-300 font-semibold',
  secondary: 'border border-line bg-ink-800 text-ice hover:bg-ink-700',
  danger: 'bg-signal-500 text-white hover:bg-signal-400 font-semibold',
  signal: 'hazard-bar text-white hover:brightness-110 font-semibold',
  ghost: 'text-steel-300 hover:bg-ink-800 hover:text-ice',
};

export function Button({
  variant = 'primary',
  className,
  isLoading,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; isLoading?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    >
      {isLoading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-3.5 w-3.5 border-2' : 'h-8 w-8 border-[3px]';
  return (
    <span
      aria-label="Loading"
      role="status"
      className={cn('inline-block animate-spin rounded-full border-line border-t-hi-400', cls)}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}