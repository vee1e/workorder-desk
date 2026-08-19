import './ai-helpers.js';
import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import {
  assertAIEnabled,
  assertBudget,
  billSpend,
  compactWorkOrder,
  isWorkingHours,
  serializeResult,
} from '../src/agent/policy.js';
import { agentRepo } from '../src/repositories/agent.repo.js';
import { HttpError } from '../src/utils/http-error.js';

function setAIEnabled(value: boolean): void {
  Object.defineProperty(env, 'AI_ENABLED', { value, configurable: true, writable: true });
}

afterEach(() => {
  setAIEnabled(true);
});

describe('policy.assertAIEnabled', () => {
  it('passes when AI is enabled', () => {
    setAIEnabled(true);
    expect(() => assertAIEnabled()).not.toThrow();
  });

  it('throws 503 AI_UNAVAILABLE when AI is disabled', () => {
    setAIEnabled(false);
    try {
      assertAIEnabled();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err).toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
    }
  });
});

describe('policy.isWorkingHours', () => {
  it('accepts the wildcard spec', () => {
    expect(isWorkingHours('*', new Date('2026-01-01T00:00:00Z'))).toBe(true);
  });

  it('checks the current UTC hour inclusively', () => {
    expect(isWorkingHours('09-17', new Date('2026-01-01T09:00:00Z'))).toBe(true);
    expect(isWorkingHours('09-17', new Date('2026-01-01T10:00:00Z'))).toBe(true);
    expect(isWorkingHours('09-17', new Date('2026-01-01T17:00:00Z'))).toBe(true);
    expect(isWorkingHours('09-17', new Date('2026-01-01T20:00:00Z'))).toBe(false);
    expect(isWorkingHours('09-17', new Date('2026-01-01T08:00:00Z'))).toBe(false);
  });

  it('rejects invalid specs', () => {
    expect(isWorkingHours('', new Date('2026-01-01T10:00:00Z'))).toBe(false);
    expect(isWorkingHours('   ', new Date('2026-01-01T10:00:00Z'))).toBe(false);
    expect(isWorkingHours('bogus', new Date('2026-01-01T10:00:00Z'))).toBe(false);
    expect(isWorkingHours('9-17-20', new Date('2026-01-01T10:00:00Z'))).toBe(false);
    expect(isWorkingHours('24-25', new Date('2026-01-01T10:00:00Z'))).toBe(false);
    expect(isWorkingHours('5-2', new Date('2026-01-01T10:00:00Z'))).toBe(false);
    expect(isWorkingHours('9.5-10', new Date('2026-01-01T10:00:00Z'))).toBe(false);
  });
});

describe('policy.serializeResult', () => {
  it('serializes plain values', () => {
    expect(serializeResult({ a: 1, b: ['x'] })).toBe('{"a":1,"b":["x"]}');
    expect(serializeResult(null)).toBe('null');
    expect(serializeResult(undefined)).toBe('null');
    expect(serializeResult('plain')).toBe('"plain"');
  });

  it('truncates results longer than 8000 characters', () => {
    const out = serializeResult({ blob: 'y'.repeat(9000) });
    expect(out.length).toBe(8000 + '…[truncated]'.length);
    expect(out.endsWith('…[truncated]')).toBe(true);
    expect(out.startsWith('{"blob":"')).toBe(true);
    expect(out.length).toBeLessThan(8500);
  });

  it('returns a placeholder for unserializable values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(serializeResult(circular)).toBe('[Unserializable value]');
  });
});

describe('policy.compactWorkOrder', () => {
  const base = {
    id: 'wo-1',
    title: 'Fix the pipe',
    description: 'x'.repeat(400),
    priority: 'medium' as const,
    status: 'pending' as const,
    owner: { id: 'u1', name: 'N', email: 'n@example.com' },
    version: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T01:00:00.000Z',
  };

  it('truncates long descriptions to 300 characters', () => {
    const out = compactWorkOrder(base);
    expect(out.description).toBe('x'.repeat(300) + '…');
    expect(out).toMatchObject({ id: 'wo-1', title: 'Fix the pipe', priority: 'medium', status: 'pending', version: 3 });
  });

  it('keeps null descriptions as-is', () => {
    const out = compactWorkOrder({ ...base, description: null });
    expect(out.description).toBeNull();
  });

  it('keeps short descriptions untouched', () => {
    const out = compactWorkOrder({ ...base, description: 'short' });
    expect(out.description).toBe('short');
  });
});

describe('policy.assertBudget', () => {
  it('resolves when spend is below the daily limits', async () => {
    await expect(assertBudget('budget-ok-user')).resolves.toBeUndefined();
  });

  it('throws 429 AI_BUDGET_EXCEEDED when the user spend is exhausted', async () => {
    await agentRepo.chargeSpend('user:budget-spent-user', env.AI_DAILY_SPEND_USD);
    await expect(assertBudget('budget-spent-user')).rejects.toMatchObject({
      status: 429,
      code: 'AI_BUDGET_EXCEEDED',
    });
  });

  it('throws 429 AI_BUDGET_EXCEEDED when the global spend is exhausted', async () => {
    await agentRepo.chargeSpend('global', env.AI_GLOBAL_DAILY_SPEND_USD);
    await expect(assertBudget('budget-any-user')).rejects.toMatchObject({
      status: 429,
      code: 'AI_BUDGET_EXCEEDED',
    });
  });
});

describe('policy.billSpend', () => {
  it('charges the user and global spend keys', async () => {
    await billSpend('bill-user', 1_000_000, 0);
    const cost = (1_000_000 / 1e6) * env.AI_PRICE_PER_1M_INPUT + (0 / 1e6) * env.AI_PRICE_PER_1M_OUTPUT;
    expect(await agentRepo.getSpend('user:bill-user')).toBeCloseTo(cost, 6);
    expect(await agentRepo.getSpend('global')).toBeCloseTo(cost, 6);
  });
});
