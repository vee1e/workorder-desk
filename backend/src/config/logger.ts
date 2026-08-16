import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'password',
      'passwordHash',
      'token',
      'tokenHash',
      'currentPassword',
      'newPassword',
    ],
    censor: '[redacted]',
  },
  transport:
    env.NODE_ENV === 'development' && env.LOG_LEVEL === 'debug'
      ? { target: 'pino-pretty' }
      : undefined,
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as { id?: string }).id ?? randomUUID(),
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization'],
    censor: '[redacted]',
  },
});