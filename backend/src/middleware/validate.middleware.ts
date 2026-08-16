import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { validation, type FieldError } from '../utils/http-error.js';

function detailsFromError(error: { issues: { path: (string | number)[]; message: string }[] }): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '_',
    message: issue.message,
  }));
}

export const validate =
  <T>(schema: ZodType<T>) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(validation(detailsFromError(result.error)));
    }
    req.body = result.data;
    next();
  };

export const validateQuery =
  <T>(schema: ZodType<T>) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(validation(detailsFromError(result.error)));
    }
    req.query = result.data as unknown as Request['query'];
    next();
  };