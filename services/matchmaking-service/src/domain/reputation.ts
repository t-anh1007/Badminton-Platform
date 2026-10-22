import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// Uy tín người chơi (BR-RA-50..53): đếm vi phạm 90 ngày lúc đọc; chỉ chính chủ và Admin thấy.

export type Reputation = 'good' | 'watch' | 'low';
const WINDOW_MS = 90 * 24 * 3_600_000;

export async function reputationOf(userId: string, now: Date, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<Reputation> {
  const count = await db.playerViolation.count({ where: { userId, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } } });
  return count === 0 ? 'good' : count === 1 ? 'watch' : 'low';
}

/**
 * Plan web A4 (B4): uy tín của chính mình kèm vi phạm còn hiệu lực và ngày tự về Tốt (vi phạm cuối cùng hết hạn).
 * Vi phạm không gắn hồ sơ còn tồn tại thì `matchCode` là null.
 */
export async function myReputation(userId: string, now: Date) {
  const rows = await prisma.playerViolation.findMany({
    where: { userId, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } }, orderBy: { createdAt: 'desc' },
  });
  const cases = await prisma.matchResultCase.findMany({
    where: { id: { in: rows.map((row) => row.caseId) } }, select: { id: true, match: { select: { businessCode: true } } },
  });
  const codeOf = new Map(cases.map((row) => [row.id, row.match.businessCode]));
  const violations = rows.map((row) => ({
    matchCode: codeOf.get(row.caseId) ?? null, kind: row.kind,
    createdAt: row.createdAt.toISOString(), expiresAt: new Date(row.createdAt.getTime() + WINDOW_MS).toISOString(),
  }));
  return {
    reputation: (rows.length === 0 ? 'good' : rows.length === 1 ? 'watch' : 'low') as Reputation,
    violations,
    recoversAt: violations[0]?.expiresAt ?? null,
  };
}
