import express, { type Express } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import { env, corsOrigins } from './config/env.js';
import { httpLogger } from './config/logger.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { rejectDangerousKeys } from './middleware/security.middleware.js';
import { globalLimiter } from './middleware/rate-limit.middleware.js';
import { errorMiddleware, notFoundHandler } from './middleware/error.middleware.js';
import { healthRoutes } from './routes/health.routes.js';
import { routes } from './routes/index.js';

if (corsOrigins.includes('*')) {
  throw new Error('CORS_ORIGIN must not be "*" when credentials are enabled');
}

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(requestIdMiddleware);
  app.use(httpLogger);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
        },
      },
    }),
  );
  app.use(
    compression({
      filter: (req, res) => {
        const type = res.getHeader('Content-Type');
        if (typeof type === 'string' && type.includes('text/event-stream')) return false;
        return compression.filter(req, res);
      },
    }),
  );
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(express.json({ limit: '32kb' }));
  app.use(hpp());
  app.use(rejectDangerousKeys);
  app.use(globalLimiter);

  app.use(healthRoutes);
  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorMiddleware);

  return app;
}

export const app = createApp();
