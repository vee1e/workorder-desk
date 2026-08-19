import type { NextFunction, Request, Response } from 'express';
import type { SseEvent } from '@workorders/shared';
import { env } from '../config/env.js';
import { copilotRuntime } from '../agent/runtime.js';
import { actorOf, paramOf } from '../utils/request.js';
import { HttpError } from '../utils/http-error.js';

const activeTurns = new Map<string, AbortController>();

let sweeperStarted = false;
function startSweeper(): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  setInterval(() => void copilotRuntime.sweepExpiredApprovals(), 30_000).unref();
}

export const aiController = {
  async sessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await copilotRuntime.listSessions(actorOf(req));
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await copilotRuntime.createSession(actorOf(req));
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async decide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const approve = (req.body as { approve: boolean }).approve;
      const data = await copilotRuntime.decide(paramOf(req, 'id'), actorOf(req), approve);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async messages(req: Request, res: Response, _next: NextFunction): Promise<void> {
    startSweeper();
    const sessionId = paramOf(req, 'id');
    const actor = actorOf(req);
    const content = (req.body as { content: string }).content;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: SseEvent): void => {
      if (res.writableEnded) return;
      res.write(`event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    const keepalive = setInterval(() => send({ event: 'ping', ts: new Date().toISOString() }), env.AI_SSE_KEEPALIVE_MS);

    const ac = new AbortController();
    activeTurns.set(sessionId, ac);

    res.on('close', () => {
      clearInterval(keepalive);
      ac.abort();
      void copilotRuntime.abortSession(sessionId);
    });

    try {
      await copilotRuntime.runTurn({ sessionId, actor, content, signal: ac.signal, onEvent: send });
      res.end();
    } catch (err) {
      if (!res.writableEnded) {
        const code = err instanceof HttpError ? err.code : 'INTERNAL';
        const message = err instanceof HttpError ? err.message : 'Internal server error';
        send({ event: 'error', code, message, requestId: String((req as { id?: string }).id ?? '') });
      }
      res.end();
    } finally {
      activeTurns.delete(sessionId);
    }
  },
};
