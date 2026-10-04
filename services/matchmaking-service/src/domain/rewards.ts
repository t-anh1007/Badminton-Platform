import type { MatchDiscipline, Prisma, RewardCriterion, RewardProgram, RewardProgramStatus, RewardTier } from '@prisma/client';
import type { RewardAwardsFinalizedPayload } from '@khoaluantn/shared';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';
import { prisma } from '../lib/prisma.js';
import { countPendingRatedWork } from './ratedResults.js';
import { identities } from './leaderboards.js';
import type { AccountClient } from '../clients/account.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REWARD_CLAIM_WINDOW_MS = 7 * DAY_MS;
const CRITERION_LABELS: Record<RewardCriterion, string> = {
  ending_rating: 'Điểm xếp hạng cao nhất khi kết thúc',
  most_wins: 'Nhiều trận thắng xếp hạng nhất',
  largest_rating_gain: 'Tăng điểm xếp hạng nhiều nhất',
  longest_streak: 'Chuỗi thắng dài nhất',
};

export interface CreateProgramInput {
  name: string;
  seasonId: string;
  criterion: RewardCriterion;
  discipline: MatchDiscipline;
  band: 'under_1600' | 'from_1600';
  scope: 'global' | 'province';
  provinceCode?: string;
  startAt: Date;
  endAt: Date;
  tiers: Array<{ rank: number; amount: bigint }>;
}

export async function createProgram(adminUserId: string, input: CreateProgramInput) {
  const season = await prisma.season.findUnique({ where: { id: input.seasonId } });
  if (!season) throw new AppError(404, 'SEASON_NOT_FOUND', 'Không tìm thấy kỳ thi đấu.');
  if (input.endAt <= input.startAt || input.startAt < season.startAt || input.endAt > season.endAt) {
    throw new AppError(400, 'REWARD_RANGE_INVALID', 'Thời gian chương trình phải nằm trong kỳ và kết thúc sau khi bắt đầu.');
  }
  if ((input.scope === 'province') !== Boolean(input.provinceCode)) {
    throw new AppError(400, 'REWARD_SCOPE_INVALID', 'Phạm vi tỉnh/thành cần đúng một tỉnh/thành.');
  }
  const ranks = input.tiers.map((tier) => tier.rank).sort((a, b) => a - b);
  if (ranks.length === 0 || ranks.some((rank, index) => rank !== index + 1) || input.tiers.some((tier) => tier.amount <= 0n)) {
    throw new AppError(400, 'REWARD_TIERS_INVALID', 'Mức giải phải liên tục từ hạng 1 và có số tiền dương.');
  }
  return prisma.rewardProgram.create({
    data: {
      name: input.name, seasonId: input.seasonId, criterion: input.criterion, discipline: input.discipline, band: input.band,
      scope: input.scope, provinceCode: input.provinceCode ?? null, startAt: input.startAt, endAt: input.endAt,
      createdByUserId: adminUserId,
      tiers: { create: input.tiers.map((tier) => ({ rank: tier.rank, amount: tier.amount })) },
    },
    include: { tiers: { orderBy: { rank: 'asc' } } },
  });
}

async function lockProgram(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reward:${id}`}, 0))`;
  const program = await tx.rewardProgram.findUnique({ where: { id } });
  if (!program) throw new AppError(404, 'REWARD_PROGRAM_NOT_FOUND', 'Không tìm thấy chương trình.');
  return program;
}

/** BR-CM-64: công bố xong thì tiêu chí, phạm vi, thời gian và mức giải bất biến (không có API sửa). */
export async function publishProgram(id: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const program = await lockProgram(tx, id);
    if (program.status !== 'draft') throw new AppError(409, 'REWARD_ALREADY_PUBLISHED', 'Chương trình đã được công bố.');
    if (program.startAt <= now) throw new AppError(409, 'REWARD_START_PASSED', 'Chỉ công bố chương trình chưa bắt đầu.');
    return tx.rewardProgram.update({ where: { id }, data: { status: 'scheduled', publishedAt: now } });
  });
}

/** BR-CM-64: trước khi bắt đầu hủy tự do; đang chạy phải có lý do và thông báo mọi người tham gia. */
export async function cancelProgram(id: string, reason: string | undefined, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const program = await lockProgram(tx, id);
    if (!['draft', 'scheduled', 'active'].includes(program.status)) {
      throw new AppError(409, 'REWARD_NOT_CANCELLABLE', 'Chương trình đã kết thúc nên không thể hủy.');
    }
    const running = program.status === 'active' || (program.status === 'scheduled' && program.startAt <= now);
    if (running && !reason) throw new AppError(400, 'REWARD_CANCEL_REASON_REQUIRED', 'Hủy chương trình đang diễn ra cần lý do.');
    if (running) {
      const participants = [...new Set((await ratedChanges(tx, program, now)).map((change) => change.userId))];
      await Promise.all(participants.map((userId) => writeOutbox(tx, {
        aggregateType: 'Notification', aggregateId: `reward.cancelled:${program.id}:${userId}`, eventType: 'UserNotificationRequested',
        payload: {
          recipient: { type: 'user', userId, targetRole: 'player' }, category: 'match', kind: 'reward.cancelled',
          title: 'Chương trình thưởng đã bị hủy',
          body: `Chương trình thưởng "${program.name}" bạn đang tham gia đã bị hủy. Lý do: ${reason}.`, priority: 'update', entityType: 'reward_program',
          entityId: program.id, actionKind: 'reward.view', actionExpiresAt: null, emailPolicy: 'required',
        },
      })));
    }
    return tx.rewardProgram.update({ where: { id }, data: { status: 'cancelled', cancelledAt: now, cancelReason: reason ?? null } });
  });
}

type Db = Prisma.TransactionClient | typeof prisma;

/** Chỉ kết quả đã tính rating có Match.endAt trong [startAt, endAt] (bao gồm hai đầu) của chương trình. */
function ratedChanges(db: Db, program: RewardProgram, now = new Date()) {
  const until = program.endAt < now ? program.endAt : now;
  return db.$queryRaw<Array<{ userId: string; ratingAfter: number; delta: number; won: boolean; endAt: Date; createdAt: Date; provinceCode: string | null }>>`
    SELECT c."userId", c."ratingAfter", c.delta, c.won, m."endAt", c."createdAt", r."provinceCode"
    FROM match_rating_changes c
    JOIN matches m ON m.id = c."matchId"
    LEFT JOIN player_season_profiles r ON r."seasonId" = ${program.seasonId} AND r."userId" = c."userId"
    WHERE c.discipline = ${program.discipline}::"MatchDiscipline"
      AND m."endAt" >= ${program.startAt} AND m."endAt" <= ${until}
    ORDER BY m."endAt" ASC, c."createdAt" ASC`;
}

/**
 * BR-CM-62/63: điểm theo tiêu chí hệ thống; nhóm rating và phạm vi xét theo rating cuối (ratingAfter cuối
 * cùng trong chương trình), nên người vượt 1600 giữa chừng thi ở nhóm trên. Đồng điểm thì đồng hạng.
 */
export async function scoreProgram(db: Db, program: RewardProgram, now = new Date()) {
  const byUser = new Map<string, {
    ending: number; endingWrittenAt: number; wins: number; gain: number; streak: number; best: number; province: string | null;
  }>();
  // Chuỗi thắng theo thứ tự trận (endAt); điểm cuối là lần ghi rating mới nhất, vì trận tranh chấp có thể được ghi muộn.
  for (const change of await ratedChanges(db, program, now)) {
    const entry = byUser.get(change.userId)
      ?? { ending: 0, endingWrittenAt: -Infinity, wins: 0, gain: 0, streak: 0, best: 0, province: change.provinceCode };
    if (change.createdAt.getTime() >= entry.endingWrittenAt) {
      entry.ending = change.ratingAfter;
      entry.endingWrittenAt = change.createdAt.getTime();
    }
    entry.gain += change.delta;
    entry.wins += change.won ? 1 : 0;
    entry.streak = change.won ? entry.streak + 1 : 0;
    entry.best = Math.max(entry.best, entry.streak);
    byUser.set(change.userId, entry);
  }
  const scored = [...byUser.entries()]
    .filter(([, entry]) => (program.band === 'under_1600' ? entry.ending < 1600 : entry.ending >= 1600))
    .filter(([, entry]) => program.scope === 'global' || entry.province === program.provinceCode)
    .map(([userId, entry]) => ({
      userId,
      score: program.criterion === 'ending_rating' ? Math.round(entry.ending)
        : program.criterion === 'most_wins' ? entry.wins
          : program.criterion === 'largest_rating_gain' ? Math.round(entry.gain)
            : entry.best,
    }))
    // Tiêu chí đếm/tăng điểm cần thành tích dương; top rating luôn xếp hạng.
    .filter((row) => program.criterion === 'ending_rating' || row.score > 0)
    .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
  let rank = 0;
  return scored.map((row, index) => {
    if (index === 0 || row.score !== scored[index - 1]!.score) rank = index + 1;
    return { ...row, rank };
  });
}

/**
 * BR-CM-66: nhóm đồng hạng chiếm các vị trí liên tiếp; cộng tiền các vị trí đó rồi chia đều,
 * phần lẻ cho người có userId lớn nhất (sắp tăng dần) để kết quả tất định.
 */
export function allocatePrizes(ranked: Array<{ userId: string; rank: number; score: number }>, tiers: Pick<RewardTier, 'rank' | 'amount'>[]) {
  const amountAt = new Map(tiers.map((tier) => [tier.rank, tier.amount]));
  const awards: Array<{ userId: string; rank: number; score: number; amount: bigint }> = [];
  const groups = new Map<number, typeof ranked>();
  for (const row of ranked) groups.set(row.rank, [...(groups.get(row.rank) ?? []), row]);
  for (const [rank, members] of groups) {
    let pool = 0n;
    for (let position = rank; position < rank + members.length; position += 1) pool += amountAt.get(position) ?? 0n;
    if (pool === 0n) continue;
    const sorted = [...members].sort((a, b) => a.userId.localeCompare(b.userId));
    const share = pool / BigInt(sorted.length);
    sorted.forEach((member, index) => {
      const amount = share + (index === sorted.length - 1 ? pool - share * BigInt(sorted.length) : 0n);
      // Phần 0 đồng không tạo khoản chi (tổng vẫn bảo toàn); Finance chỉ nhận số tiền dương.
      if (amount > 0n) awards.push({ ...member, amount });
    });
  }
  return awards;
}

/** BR-CM-65: còn kết quả final hoặc rating chưa ghi cho trận có endAt trong chương trình thì tiếp tục đối soát. */
async function hasPendingResults(db: Prisma.TransactionClient, program: RewardProgram) {
  return await countPendingRatedWork(db, { from: program.startAt, to: program.endAt, discipline: program.discipline }) > 0;
}

/** Scheduler: scheduled -> active -> reconciling -> awaiting_admin_approval (tính giải tự động). */
export async function sweepRewardPrograms(now = new Date(), programIds?: string[]) {
  const scope = programIds ? { id: { in: programIds } } : {};
  const due = await prisma.rewardProgram.findMany({
    where: {
      ...scope,
      OR: [
        { status: 'scheduled', startAt: { lte: now } },
        { status: 'active', endAt: { lt: now } },
        { status: 'reconciling' },
      ],
    },
    select: { id: true },
  });
  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      const program = await lockProgram(tx, id);
      let status: RewardProgramStatus = program.status;
      if (status === 'scheduled' && program.startAt <= now) status = 'active';
      if (status === 'active' && program.endAt < now) status = 'reconciling';
      if (status === 'reconciling' && !(await hasPendingResults(tx, program))) {
        const tiers = await tx.rewardTier.findMany({ where: { programId: id } });
        const awards = allocatePrizes(await scoreProgram(tx, program, now), tiers);
        await tx.rewardAward.createMany({ data: awards.map((award) => ({ programId: id, ...award })) });
        status = 'awaiting_admin_approval';
      }
      if (status !== program.status) await tx.rewardProgram.update({ where: { id }, data: { status } });
    });
  }
  return due.length;
}

/** BR-CM-67: Admin chỉ duyệt danh sách hệ thống tính; không có đường sửa điểm/hạng/người thắng. */
export async function approveFinal(id: string, adminUserId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const program = await lockProgram(tx, id);
    if (program.status !== 'awaiting_admin_approval') {
      throw new AppError(409, 'REWARD_NOT_AWAITING_APPROVAL', 'Chương trình chưa sẵn sàng để duyệt kết quả.');
    }
    const awards = await tx.rewardAward.findMany({ where: { programId: id }, orderBy: [{ rank: 'asc' }, { userId: 'asc' }] });
    const claimDeadlineAt = new Date(now.getTime() + REWARD_CLAIM_WINDOW_MS).toISOString();
    await writeOutbox(tx, {
      aggregateType: 'RewardProgram', aggregateId: id, eventType: 'RewardAwardsFinalized',
      payload: {
        programId: id, programName: program.name,
        awards: awards.map((award) => ({ awardId: award.id, userId: award.userId, rank: award.rank, amount: award.amount.toString(), claimDeadlineAt })),
      } satisfies RewardAwardsFinalizedPayload,
    });
    return tx.rewardProgram.update({ where: { id }, data: { status: 'final', finalizedAt: now, approvedByUserId: adminUserId } });
  });
}

function programView(program: RewardProgram & { tiers: RewardTier[] }, now: Date) {
  return {
    id: program.id, name: program.name, seasonId: program.seasonId, status: program.status,
    criterion: program.criterion, criterionLabel: CRITERION_LABELS[program.criterion],
    discipline: program.discipline, band: program.band, scope: program.scope, provinceCode: program.provinceCode,
    serverNow: now.toISOString(), startAt: program.startAt.toISOString(), endAt: program.endAt.toISOString(),
    reconciling: program.status === 'reconciling',
    tiers: [...program.tiers].sort((a, b) => a.rank - b.rank).map((tier) => ({ rank: tier.rank, amount: tier.amount.toString() })),
  };
}

export async function listPublicPrograms(now = new Date()) {
  const programs = await prisma.rewardProgram.findMany({
    where: { status: { not: 'draft' } }, orderBy: { startAt: 'desc' }, include: { tiers: true }, take: 100,
  });
  return { items: programs.map((program) => programView(program, now)) };
}

export async function getPublicProgram(id: string, viewerUserId: string | undefined, now = new Date()) {
  const program = await prisma.rewardProgram.findFirst({ where: { id, status: { not: 'draft' } }, include: { tiers: true } });
  if (!program) throw new AppError(404, 'REWARD_PROGRAM_NOT_FOUND', 'Không tìm thấy chương trình.');
  let viewer: { rank: number; score: number } | null = null;
  if (viewerUserId && ['active', 'reconciling', 'awaiting_admin_approval', 'final'].includes(program.status)) {
    const row = (await scoreProgram(prisma, program, now)).find((entry) => entry.userId === viewerUserId);
    viewer = row ? { rank: row.rank, score: row.score } : null;
  }
  return { ...programView(program, now), viewer };
}

export async function listAdminPrograms(input: { page: number; pageSize: number; status?: RewardProgramStatus }, now = new Date()) {
  const where = input.status ? { status: input.status } : {};
  const [rows, total] = await Promise.all([
    prisma.rewardProgram.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
      include: { tiers: true, _count: { select: { awards: true } } },
    }),
    prisma.rewardProgram.count({ where }),
  ]);
  return {
    items: rows.map((program) => ({
      ...programView(program, now), locked: program.status !== 'draft', awardCount: program._count.awards,
    })),
    total, page: input.page, pageSize: input.pageSize,
  };
}

/** BR-CM-67: Admin duyệt đúng danh sách đã lưu (người nhận, hạng, điểm, tiền) trước approve-final; chỉ đọc. */
export async function getAdminProgram(accountClient: AccountClient, id: string, now = new Date()) {
  const program = await prisma.rewardProgram.findUnique({
    where: { id }, include: { tiers: true, awards: { orderBy: [{ rank: 'asc' }, { userId: 'asc' }] } },
  });
  if (!program) throw new AppError(404, 'REWARD_PROGRAM_NOT_FOUND', 'Không tìm thấy chương trình.');
  const identity = await identities(accountClient, program.awards.map((award) => award.userId));
  return {
    ...programView(program, now), locked: program.status !== 'draft',
    cancelReason: program.cancelReason,
    awards: program.awards.map((award) => ({
      userId: award.userId, ...identity(award.userId), rank: award.rank, score: award.score, amount: award.amount.toString(),
    })),
    awardTotal: program.awards.reduce((sum, award) => sum + award.amount, 0n).toString(),
  };
}
