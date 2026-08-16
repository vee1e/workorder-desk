import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz-012345';
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET ?? 'test-cookie-secret-0123456789-abcdefghijklmnopqrstuvwxyz-0123';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
process.env.APP_URL = process.env.APP_URL ?? 'http://localhost:5173';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MAX = '100000';
process.env.RATE_LIMIT_LOGIN_MAX = '100000';
process.env.RATE_LIMIT_FORGOT_MAX = '100000';

let mongod: MongoMemoryServer | null = null;

if (!process.env.MONGODB_URI) {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
});

afterEach(async () => {
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});