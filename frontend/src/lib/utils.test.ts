import { describe, expect, it } from 'vitest';
import { cn, formatDate } from './utils';

describe('cn', () => {
  it('merges tailwind classes, deduplicating conflicts', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('ignores falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });
});

describe('formatDate', () => {
  it('formats an ISO date to a localized string', () => {
    const out = formatDate('2026-08-16T12:00:00Z');
    expect(out).toContain('2026');
    expect(out.length).toBeGreaterThan(0);
  });
});