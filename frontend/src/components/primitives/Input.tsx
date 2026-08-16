import type { InputHTMLAttributes, ReactElement, SelectHTMLAttributes } from 'react';
import { cloneElement, isValidElement } from 'react';
import { cn } from '../../lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-ice placeholder:text-steel-500 focus:border-hi-400 focus:outline-none focus:ring-1 focus:ring-hi-400',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-ice focus:border-hi-400 focus:outline-none focus:ring-1 focus:ring-hi-400',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  let control = children;
  if (isValidElement(children)) {
    control = cloneElement(children as ReactElement<{ 'aria-invalid'?: boolean; 'aria-describedby'?: string }>, {
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? errorId : undefined,
    });
  }
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-steel-300">
        {label}
      </label>
      {control}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-signal-400">
          {error}
        </p>
      )}
    </div>
  );
}