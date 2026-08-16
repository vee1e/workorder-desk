import type { Actor } from '../utils/actor.js';

declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
      sessionId?: string;
    }
  }
}

export {};