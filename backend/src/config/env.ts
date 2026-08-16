import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const envPaths = [resolve(process.cwd(), '.env'), join(repoRoot, '.env')];
for (const p of envPaths) {
  if (existsSync(p)) {
    dotenv.config({ path: p });
  }
}

const placeholderRegex = /^(secret|changeme|replace-me)$/i;

const envSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine((s) => !placeholderRegex.test(s), { message: 'JWT_SECRET must not be a placeholder value' }),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
  APP_URL: z.string().min(1, 'APP_URL is required'),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  DEBUG_ERRORS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_FORGOT_MAX: z.coerce.number().int().positive().default(3),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin1234'),
  SEED_USER_EMAIL: z.string().email().default('user@example.com'),
  SEED_USER_PASSWORD: z.string().min(8).default('User1234'),
  SEED_VIEWER_EMAIL: z.string().email().default('viewer@example.com'),
  SEED_VIEWER_PASSWORD: z.string().min(8).default('Viewer1234'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export type Env = z.infer<typeof envSchema>;

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);