import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { HttpError } from '../src/utils/http-error.js';

const mockEnv = vi.hoisted(() => ({ AI_ENABLED: false, AI_RATE_LIMIT_MAX: 2 }));

vi.mock('../src/config/env.js', () => ({ env: mockEnv }));

import express from 'express';
import request from 'supertest';
import { aiLimiter, requireAIAvailable } from '../src/middleware/ai.middleware.js';

describe('requireAIAvailable', () => {
  it('rejects with 503 AI_UNAVAILABLE when AI is disabled', () => {
    mockEnv.AI_ENABLED = false;
    const next = vi.fn();
    requireAIAvailable({} as Request, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(503);
    expect(err.code).toBe('AI_UNAVAILABLE');
  });

  it('calls next without an error when AI is enabled', () => {
    mockEnv.AI_ENABLED = true;
    const next = vi.fn();
    requireAIAvailable({} as Request, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toBeUndefined();
  });
});

describe('aiLimiter', () => {
  it('responds 429 RATE_LIMITED once the per-minute limit is hit', async () => {
    mockEnv.AI_RATE_LIMIT_MAX = 2;
    const app = express();
    app.get('/ai', aiLimiter, (_req, res) => res.json({ ok: true }));
    const agent = request.agent(app);

    const first = await agent.get('/ai');
    expect(first.status).toBe(200);

    const second = await agent.get('/ai');
    expect(second.status).toBe(200);

    const limited = await agent.get('/ai');
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' },
    });
    expect(typeof limited.body.requestId).toBe('string');
  });
});
