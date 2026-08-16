import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { User } from '../models/user.model.js';
import { hashPassword } from '../utils/passwords.js';
import type { Role } from '@workorders/shared';

async function upsert(seed: {
  email: string;
  password: string;
  name: string;
  role: Role;
}): Promise<void> {
  const existing = await User.findOne({ email: seed.email });
  if (existing) {
    logger.info({ email: seed.email }, 'seed user already exists');
    return;
  }
  await User.create({
    email: seed.email,
    name: seed.name,
    passwordHash: await hashPassword(seed.password),
    role: seed.role,
    isActive: true,
  });
  logger.info({ email: seed.email, role: seed.role }, 'seeded user');
}

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  logger.info('seed: connected');

  await upsert({
    email: env.SEED_ADMIN_EMAIL,
    password: env.SEED_ADMIN_PASSWORD,
    name: 'Seed Admin',
    role: 'admin',
  });
  await upsert({
    email: env.SEED_USER_EMAIL,
    password: env.SEED_USER_PASSWORD,
    name: 'Seed User',
    role: 'user',
  });
  await upsert({
    email: env.SEED_VIEWER_EMAIL,
    password: env.SEED_VIEWER_PASSWORD,
    name: 'Read-only Viewer',
    role: 'viewer',
  });

  logger.info('seed: complete');
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'seed failed');
  process.exit(1);
});