import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';

export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

export const VALID_PASSWORD = 'Passw0rd123';

export async function getLatestVerificationCode(userId: string): Promise<string> {
  const row = await prisma.verification.findFirst({
    where: { userId, channel: 'email' },
    orderBy: { expiresAt: 'desc' },
  });
  if (!row) throw new Error('No verification row found for user');
  return row.code;
}

export async function getLatestResetToken(userId: string): Promise<string> {
  const row = await prisma.passwordReset.findFirst({
    where: { userId },
    orderBy: { expiresAt: 'desc' },
  });
  if (!row) throw new Error('No password reset row found for user');
  return row.token;
}
