import { cn } from '../../lib/utils';

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterTabs({
  options,
  value,
  onChange,
}: {
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-ink-900 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'rounded-md px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-colors',
            value === o.value ? 'bg-hi-400 text-ink-950' : 'text-steel-300 hover:text-ice',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}