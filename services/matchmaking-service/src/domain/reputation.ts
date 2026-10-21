import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// Uy tín người chơi (BR-RA-50..53): đếm vi phạm 90 ngày lúc đọc; chỉ chính chủ và Admin thấy.

export type Reputation = 'good' | 'watch' | 'low';
const WINDOW_MS = 90 * 24 * 3_600_000;

export async function reputationOf(userId: string, now: Date, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<Reputation> {
  const count = await db.playerViolation.count({ where: { userId, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } } });
  return count === 0 ? 'good' : count === 1 ? 'watch' : 'low';
}
