import type { Request } from 'express';
import type { Actor } from './actor.js';

export function actorOf(req: Request): Actor {
  if (!req.actor) {
    throw new Error('Actor missing: route must run authenticate before this handler');
  }
  return req.actor;
}

export function paramOf(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing route parameter: ${name}`);
  }
  return value;
}