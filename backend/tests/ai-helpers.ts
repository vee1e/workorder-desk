import type * as supertest from 'supertest';
import type { Express } from 'express';
import type { ProviderResult, ProviderToolCall } from '../src/agent/provider.js';

export type TestAgent = ReturnType<typeof supertest.agent>;

// AI env must be set before config/env is evaluated (env validates at import
// time). This module applies the vars at import time, so AI test files must
// import this module FIRST — before any static import that pulls in app.ts or
// config/env.ts — or call setupAIEnv() before dynamically importing the app.
export const AI_ENV = {
  AI_ENABLED: 'true',
  AI_BASE_URL: 'https://llm.example.com/v1',
  AI_API_KEY: 'test-key',
  AI_RATE_LIMIT_MAX: '100000',
  AI_MAX_STEPS_PER_RUN: '3',
};

export function setupAIEnv(): void {
  for (const [key, value] of Object.entries(AI_ENV)) process.env[key] = value;
}

setupAIEnv();

export async function importAIApp(): Promise<Express> {
  const { app } = await import('../src/app.js');
  return app;
}

export async function createAIApp(): Promise<TestAgent> {
  const { default: request } = await import('supertest');
  return request.agent(await importAIApp());
}

export function providerResult(overrides?: Partial<ProviderResult>): ProviderResult {
  return { content: '', tool_calls: [], inputTokens: 10, outputTokens: 5, ...overrides };
}

export function makeToolCall(id: string, name: string, args: unknown): ProviderToolCall {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

export async function waitFor<T>(
  probe: () => Promise<T | null | undefined>,
  opts: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const timeout = opts.timeout ?? 5000;
  const interval = opts.interval ?? 50;
  const deadline = Date.now() + timeout;
  let last: T | null | undefined;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

// Sends the request immediately (supertest only sends on .end()/.then()) while
// resolving once the response completes — needed to drive long-lived SSE turns
// that pause mid-stream awaiting an approval decision.
export function startSSE(test: supertest.Test): Promise<supertest.Response> {
  return new Promise((resolve, reject) => {
    test.end((err, res) => (err ? reject(err) : resolve(res)));
  });
}