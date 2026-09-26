import { Prisma, type Match, type MatchDiscipline, type TeamSide } from '@prisma/client';
import { writeOutbox } from '../lib/outbox.js';
import type { RatingPeriodReadyPayload } from '../lib/ratingEventConsumer.js';
import type { MatchOutcome } from './matchRules.js';

export const RATING_REPEAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** BR-CM-47: đơn = đối thủ; đôi = cặp hai người đội đối phương đã sắp xếp (không xét đồng đội). */
export function opponentKey(opponents: string[]): string {
  return [...opponents].sort().join(':');
}

/**
 * BR-CM-43..48: chạy trong transaction chốt kết quả (đang giữ khóa kèo). Khóa người chơi theo thứ tự
 * userId, ghi quyết định suất rating theo finalizedAt rồi mới phát RatingPeriodReady. Consumer chỉ áp
 * dụng quyết định đã lưu, nên thứ tự RabbitMQ không bao giờ chọn trận nào được tính.
 */
export async function reserveRatedResults(
  tx: Prisma.TransactionClient,
  match: Pick<Match, 'id' | 'mode' | 'discipline'>,
  teams: Record<TeamSide, string[]>,
  outcome: MatchOutcome,
  finalizedAt: Date,
) {
  if (match.mode !== 'ranked' || outcome === 'NO_RESULT') return;
  const winner: TeamSide = outcome === 'TEAM_A_WIN' ? 'A' : 'B';
  const players = [...teams.A, ...teams.B].sort();
  for (const userId of players) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
  }
  const passports = new Map((await tx.passport.findMany({
    where: { userId: { in: players }, discipline: match.discipline },
  })).map((passport) => [passport.userId, passport]));

  for (const userId of players) {
    const side: TeamSide = teams.A.includes(userId) ? 'A' : 'B';
    const opponents = teams[side === 'A' ? 'B' : 'A'];
    const key = opponentKey(opponents);
    // Đúng 7 ngày vẫn đủ điều kiện: chỉ suất đã tính với finalizedAt sau mốc (now - 7 ngày) mới chặn.
    const recent = await tx.ratedEncounter.findFirst({
      where: {
        userId, discipline: match.discipline, opponentKey: key, rated: true,
        finalizedAt: { gt: new Date(finalizedAt.getTime() - RATING_REPEAT_WINDOW_MS) },
      },
    });
    const opponentStates = opponents.map((id) => passports.get(id));
    // Người thiếu Passport của loại hình này không nhận/gây rating (không có trạng thái để tính).
    const rated = !recent && passports.has(userId) && opponentStates.every(Boolean);
    // BR-CM-45: đôi nhận một kết quả với rating/RD đối thủ là trung bình cộng hai người.
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const result = rated
      ? {
          opponentRating: mean(opponentStates.map((state) => state!.ratingMu)),
          opponentRd: mean(opponentStates.map((state) => state!.ratingRd)),
          score: side === winner ? 1 : 0,
        }
      : null;
    await tx.ratedEncounter.create({
      data: { matchId: match.id, userId, discipline: match.discipline, opponentKey: key, finalizedAt, rated, ...result },
    });
    if (!result) continue;
    await writeOutbox(tx, {
      aggregateType: 'Match', aggregateId: match.id, eventType: 'RatingPeriodReady',
      payload: { matchId: match.id, userId, discipline: match.discipline, results: [result] } satisfies RatingPeriodReadyPayload,
    });
  }
}

/**
 * Còn kết quả chưa hoàn tất trong cửa sổ [from, to] (bao gồm hai đầu): trận ranked chưa có kết quả final,
 * hoặc suất rating đã giữ nhưng rating chưa được ghi. Dùng cho khóa giải thưởng và đóng kỳ.
 */
export async function countPendingRatedWork(
  db: Prisma.TransactionClient,
  window: { from: Date; to: Date; discipline?: MatchDiscipline },
) {
  const disciplineFilter = window.discipline ? { discipline: window.discipline } : {};
  const unresolved = await db.match.count({
    where: {
      ...disciplineFilter, mode: 'ranked', endAt: { gte: window.from, lte: window.to }, status: { in: ['confirmed', 'completed'] },
      OR: [{ resultCase: null }, { resultCase: { status: { not: 'final' } } }],
    },
  });
  const discipline = window.discipline ? Prisma.sql`AND e.discipline = ${window.discipline}::"MatchDiscipline"` : Prisma.empty;
  const rows = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count FROM rated_encounters e
    JOIN matches m ON m.id = e."matchId"
    LEFT JOIN match_rating_changes c ON c."matchId" = e."matchId" AND c."userId" = e."userId"
    WHERE e.rated AND c.id IS NULL AND m."endAt" >= ${window.from} AND m."endAt" <= ${window.to} ${discipline}`;
  return unresolved + Number(rows[0]?.count ?? 0);
}
