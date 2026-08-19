import type { ReactNode } from 'react';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function boldSegments(text: string, baseKey: number): ReactNode[] {
  const out: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      out.push(
        <strong key={`b-${baseKey}-${i}`} className="font-semibold text-ice">
          {part.slice(2, -2)}
        </strong>,
      );
    } else if (part.length > 0) {
      out.push(<span key={`t-${baseKey}-${i}`}>{part}</span>);
    }
  });
  return out;
}

function inlineNodes(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const segments = text.split(/`([^`]*)`/g);
  segments.forEach((seg, i) => {
    if (i % 2 === 1) {
      out.push(
        <code
          key={`code-${i}`}
          className="rounded bg-ink-800 px-1 py-0.5 font-mono text-[12px] text-hi-300"
        >
          {seg}
        </code>,
      );
    } else {
      out.push(...boldSegments(seg, i));
    }
  });
  return out;
}

export function Markdown({ text }: { text: string }) {
  const escaped = escapeHtml(text);
  const blocks = escaped.split(/\n\s*\n/);
  return (
    <div className="space-y-2">
      {blocks
        .filter((b) => b.trim().length > 0)
        .map((block, i) => {
          const lines = block.split('\n').filter((l) => l.trim().length > 0);
          const isList = lines.every((l) => l.trim().startsWith('- '));
          if (isList) {
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {lines.map((l, j) => (
                  <li key={j}>{inlineNodes(l.trim().slice(2))}</li>
                ))}
              </ul>
            );
          }
          return <p key={i}>{inlineNodes(block.replace(/\n/g, ' ').trim())}</p>;
        })}
    </div>
  );
}