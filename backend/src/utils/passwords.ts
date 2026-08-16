import bcrypt from 'bcryptjs';

const COST = 12;

let dummyHash: string | null = null;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export async function dummyCompare(): Promise<void> {
  if (!dummyHash) {
    dummyHash = await bcrypt.hash('timing-equalizer', COST);
  }
  await bcrypt.compare('timing-equalizer', dummyHash);
}