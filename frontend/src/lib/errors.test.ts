import { describe, expect, it } from 'vitest';
import { ApiError } from './errors';

describe('ApiError', () => {
  it('carries code, message, details and status', () => {
    const err = new ApiError('Validation failed', 'VALIDATION_ERROR', [{ field: 'email', message: 'Invalid email' }], 'req-1', 400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.status).toBe(400);
    expect(err.requestId).toBe('req-1');
    expect(err.fieldErrors()).toEqual({ email: 'Invalid email' });
  });

  it('maps duplicate fields to the first error only', () => {
    const err = new ApiError('x', 'VALIDATION_ERROR', [
      { field: 'email', message: 'first' },
      { field: 'email', message: 'second' },
    ]);
    expect(err.fieldErrors()).toEqual({ email: 'first' });
  });

  it('returns empty field errors when none present', () => {
    expect(new ApiError('x', 'INTERNAL').fieldErrors()).toEqual({});
  });
});

describe('messageFromError', () => {
  it('uses the ApiError message', () => {
    expect(new ApiError('boom', 'INTERNAL').message).toBe('boom');
  });
});