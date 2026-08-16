import type { NextFunction, Request, Response } from 'express';
import { validation } from '../utils/http-error.js';

function containsDangerousKeys(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsDangerousKeys(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).some((key) => {
      if (key.startsWith('$') || key === '__proto__' || key === 'constructor') return true;
      return containsDangerousKeys((value as Record<string, unknown>)[key]);
    });
  }
  return false;
}

export function rejectDangerousKeys(req: Request, _res: Response, next: NextFunction): void {
  if (containsDangerousKeys(req.body) || containsDangerousKeys(req.query)) {
    return next(validation([{ field: '_', message: 'Object keys starting with $ or prototype keys are not allowed' }]));
  }
  next();
}