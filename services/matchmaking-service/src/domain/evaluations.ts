import type { Prisma, SkillTier } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const EVALUATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const COLLABORATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const TIER_VALUE: Record<SkillTier, number> = {
  newcomer: 0,
  beginner: 1,
  intermediate: 2,
  intermediate_plus: 3,
  advanced: 4,
};

type SubmitEvaluationInput = {
  matchId: string;
  raterUserId: string;
  rateeUserId: string;
  perceivedTier: SkillTier;
  labels?: unknown;
};

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function isConfirmedParticipant(match: {
  organizerUserId: string;
  joins: Array<{ participantUserId: string; status: string }>;
}, userId: string): boolean {
  return match.organizerUserId === userId || match.joins.some((join) =>
    join.participantUserId === userId && join.status === 'confirmed');
}

async function isReciprocalTopTier(
  tx: Prisma.TransactionClient,
  input: SubmitEvaluationInput,
  now: Date,
): Promise<boolean> {
  if (input.perceivedTier !== 'advanced') return false;
  const records = await tx.evaluation.findMany({
    where: {
      createdAt: { gte: new Date(now.getTime() - COLLABORATION_WINDOW_MS) },
      perceivedTier: 'advanced',
      match: {
        status: 'completed',
        completedAt: { gte: new Date(now.getTime() - COLLABORATION_WINDOW_MS) },
      },
      OR: [
        { raterUserId: input.raterUserId, rateeUserId: input.rateeUserId },
        { raterUserId: input.rateeUserId, rateeUserId: input.raterUserId },
      ],
    },
    select: { matchId: true, raterUserId: true, rateeUserId: true },
  });
  records.push({
    matchId: input.matchId,
    raterUserId: input.raterUserId,
    rateeUserId: input.rateeUserId,
  });
  const directions = new Map<string, Set<string>>();
  for (const record of records) {
    const entry = directions.get(record.matchId) ?? new Set<string>();
    entry.add(`${record.raterUserId}:${record.rateeUserId}`);
    directions.set(record.matchId, entry);
  }
  const forward = `${input.raterUserId}:${input.rateeUserId}`;
  const reverse = `${input.rateeUserId}:${input.raterUserId}`;
  return [...directions.values()].filter((entry) => entry.has(forward) && entry.has(reverse)).length >= 3;
}

export async function submitEvaluation(input: SubmitEvaluationInput, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.matchId}, 0))`;
    const pairLock = [input.raterUserId, input.rateeUserId].sort().join(':');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${pairLock}, 0))`;
    const match = await tx.match.findUnique({
      where: { id: input.matchId },
      include: { joins: { select: { participantUserId: true, status: true } } },
    });
    if (!match || match.status !== 'completed' || !match.completedAt) {
      throw new AppError(409, 'EVALUATION_MATCH_NOT_COMPLETED', 'Kèo chưa hoàn thành để đánh giá.');
    }
    if (now.getTime() > match.completedAt.getTime() + EVALUATION_WINDOW_MS) {
      throw new AppError(409, 'EVALUATION_WINDOW_CLOSED', 'Đã quá cửa sổ 72 giờ để đánh giá.');
    }
    if (!isConfirmedParticipant(match, input.raterUserId) || !isConfirmedParticipant(match, input.rateeUserId)) {
      throw new AppError(403, 'EVALUATION_NOT_MATCH_PARTICIPANT', 'Chỉ người cùng kèo đã xác nhận mới được đánh giá.');
    }
    if (input.raterUserId === input.rateeUserId) {
      throw new AppError(409, 'SELF_EVALUATION', 'Không thể tự đánh giá mình.');
    }
    if (await tx.evaluation.findUnique({
      where: { matchId_raterUserId_rateeUserId: {
        matchId: input.matchId, raterUserId: input.raterUserId, rateeUserId: input.rateeUserId,
      } },
    })) {
      throw new AppError(409, 'EVALUATION_ALREADY_SUBMITTED', 'Đã gửi đánh giá cho người này trong kèo.');
    }

    const prior = await tx.evaluation.findMany({
      where: {
        matchId: input.matchId,
        rateeUserId: input.rateeUserId,
        flagged: false,
        perceivedTier: { not: null },
      },
      select: { perceivedTier: true },
    });
    const outlier = prior.length >= 3 && Math.abs(
      TIER_VALUE[input.perceivedTier] - median(prior.map((evaluation) => TIER_VALUE[evaluation.perceivedTier!])),
    ) >= 2;
    const collusion = !outlier && await isReciprocalTopTier(tx, input, now);
    const flagReason = outlier
      ? 'outlier_median_2_tiers'
      : collusion ? 'reciprocal_top_tier_3_matches_30_days' : null;

    return tx.evaluation.create({
      data: {
        matchId: input.matchId,
        raterUserId: input.raterUserId,
        rateeUserId: input.rateeUserId,
        perceivedTier: input.perceivedTier,
        labels: input.labels as Prisma.InputJsonValue | undefined,
        flagged: Boolean(flagReason),
        flagReason,
        countedAt: flagReason ? null : now,
        reviewStatus: flagReason ? 'pending' : null,
      },
    });
  });
}

export async function reviewEvaluation(
  matchId: string,
  evaluationId: string,
  adminUserId: string,
  decision: 'approve' | 'reject',
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${matchId}, 0))`;
    const evaluation = await tx.evaluation.findFirst({ where: { id: evaluationId, matchId } });
    if (!evaluation) throw new AppError(404, 'EVALUATION_NOT_FOUND', 'Không tìm thấy đánh giá.');
    if (!evaluation.flagged || evaluation.reviewStatus !== 'pending') {
      throw new AppError(409, 'EVALUATION_ALREADY_REVIEWED', 'Đánh giá đã được xử lý hoặc không cần duyệt.');
    }
    return tx.evaluation.update({
      where: { id: evaluation.id },
      data: decision === 'approve'
        ? {
          flagged: false,
          flagReason: null,
          countedAt: now,
          reviewStatus: 'approved',
          reviewedAt: now,
          reviewedByUserId: adminUserId,
        }
        : {
          reviewStatus: 'rejected',
          reviewedAt: now,
          reviewedByUserId: adminUserId,
        },
    });
  });
}
