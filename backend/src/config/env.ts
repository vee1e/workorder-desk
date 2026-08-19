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

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(0).max(65535).default(4000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET must be at least 32 characters')
      .refine((s) => !placeholderRegex.test(s), {
        message: 'JWT_SECRET must not be a placeholder value',
      }),
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
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
      .default('info'),
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
    AI_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    AI_BASE_URL: z.string().optional(),
    AI_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default('gpt-4o-mini'),
    AI_MAX_STEPS_PER_RUN: z.coerce.number().int().positive().default(8),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(2048),
    AI_MAX_CONTEXT_TOKENS: z.coerce.number().int().positive().default(16384),
    AI_PRICE_PER_1M_INPUT: z.coerce.number().nonnegative().default(0.15),
    AI_PRICE_PER_1M_OUTPUT: z.coerce.number().nonnegative().default(0.6),
    AI_DAILY_SPEND_USD: z.coerce.number().nonnegative().default(1),
    AGENT_DAILY_SPEND_USD: z.coerce.number().nonnegative().default(1),
    AI_GLOBAL_DAILY_SPEND_USD: z.coerce.number().nonnegative().default(5),
    AI_APPROVAL_TTL_MS: z.coerce.number().int().positive().default(600000),
    AI_SSE_KEEPALIVE_MS: z.coerce.number().int().positive().default(15000),
    AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    AGENT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
    AGENT_LEASE_MS: z.coerce.number().int().positive().default(15000),
    AGENT_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
    AGENT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
    AGENT_RECONCILE_AFTER_MS: z.coerce.number().int().positive().default(60000),
    AGENT_TRIAGE_MODE: z.enum(['suggest', 'auto-apply']).default('suggest'),
    AGENT_WORKING_HOURS: z.string().default('*'),
    AGENT_CONCURRENCY: z.coerce.number().int().positive().default(2),
  })
  .superRefine((data, ctx) => {
    if (data.AI_ENABLED) {
      if (!data.AI_BASE_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['AI_BASE_URL'],
          message: 'AI_BASE_URL is required when AI_ENABLED=true',
        });
      }
      if (!data.AI_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['AI_API_KEY'],
          message: 'AI_API_KEY is required when AI_ENABLED=true',
        });
      }
    }
    if (data.AI_BASE_URL) {
      let url: URL;
      try {
        url = new URL(data.AI_BASE_URL);
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['AI_BASE_URL'],
          message: 'AI_BASE_URL must be a valid absolute https URL',
        });
        return;
      }
      if (url.protocol !== 'https:') {
        ctx.addIssue({
          code: 'custom',
          path: ['AI_BASE_URL'],
          message: 'AI_BASE_URL must use the https protocol',
        });
      }
      if (isPrivateHostname(url.hostname)) {
        ctx.addIssue({
          code: 'custom',
          path: ['AI_BASE_URL'],
          message: 'AI_BASE_URL must not point to a private, loopback, or link-local address',
        });
      }
    }
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
