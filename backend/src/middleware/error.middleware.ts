import type { NextFunction, Request, Response } from 'express';
import type { ErrorCode, ErrorEnvelope } from '@workorders/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { HttpError } from '../utils/http-error.js';

function envelope(requestId: unknown, code: ErrorCode, message: string, details?: { field: string; message: string }[]): ErrorEnvelope {
  return {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
    requestId: requestId === undefined || requestId === null ? '' : String(requestId),
  };
}

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json(envelope(req.id, 'NOT_FOUND', 'Not found'));
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json(envelope(req.id, err.code, err.message, err.details));
    return;
  }

  const bodyParseError = err as {
    type?: string;
    status?: number;
    statusCode?: number;
  };
  if (bodyParseError.type === 'entity.too.large' || bodyParseError.type === 'entity.parse.failed') {
    res
      .status(400)
      .json(envelope(req.id, 'VALIDATION_ERROR', 'Invalid request body', [{ field: '_', message: 'Request body is invalid' }]));
    return;
  }

  logger.error({ err, requestId: req.id }, 'unhandled error');
  const message = env.DEBUG_ERRORS && err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json(envelope(req.id, 'INTERNAL', message));
}