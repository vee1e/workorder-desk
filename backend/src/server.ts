import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { app } from './app.js';

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  logger.info({ uri: redact(env.MONGODB_URI) }, 'connected to mongodb');

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

function redact(uri: string): string {
  try {
    const u = new URL(uri);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '(mongodb)';
  }
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});