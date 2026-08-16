import type { ErrorCode } from '@workorders/shared';

export interface FieldError {
  field: string;
  message: string;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const validation = (details?: FieldError[]): HttpError =>
  new HttpError(400, 'VALIDATION_ERROR', 'Validation failed', details);

export const unauthorized = (message = 'Unauthorized'): HttpError =>
  new HttpError(401, 'UNAUTHORIZED', message);

export const authGeneric = (message = 'Invalid email or password'): HttpError =>
  new HttpError(401, 'AUTH_GENERIC', message);

export const refreshReuse = (): HttpError =>
  new HttpError(401, 'REFRESH_REUSE', 'Refresh token reuse detected');

export const forbidden = (message = 'Forbidden'): HttpError => new HttpError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Not found'): HttpError => new HttpError(404, 'NOT_FOUND', message);

export const conflictVersion = (): HttpError =>
  new HttpError(409, 'CONFLICT_VERSION', 'Resource was modified; reload and retry');

export const emailTaken = (): HttpError =>
  new HttpError(409, 'EMAIL_TAKEN', 'Email is already registered');