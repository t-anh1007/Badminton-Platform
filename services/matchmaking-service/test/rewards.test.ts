import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { allocatePrizes, approveFinal, getPublicProgram, scoreProgram, sweepRewardPrograms } from '../src/domain/rewards.js';
import { purgeResultCases } from './resultTestUtils.js';

const app = createApp({ accountClient: { getPublicMatchProfile: async () => null, getPublicDisplayNames: async (ids) => ids.map((userId) => ({ userId, displayName: 'Tên', avatarUrl: null })) } });
const admin = `Bearer ${jwt.sign({ sub: randomUUID(), roles: ['admin'], type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env')}`;
const playerAuth = (userId: string) => `Bearer ${jwt.sign({ sub: userId, roles: ['player'], type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env')}`;
const matchIds: string[] = [];
const programIds: string[] = [];
let seasonId = '';

beforeAll(async () => {
  seasonId = (await prisma.season.create({ data: { name: 'Kỳ 2099', startAt: new Date('2099-01-01T00:00:00Z'), endAt: new Date('2099-12-01T00:00:00Z') } })).id;
});

afterAll(async () => {
  await purgeResultCases(matchIds);
  await prisma.outbox.deleteMany({ where: { OR: [{ aggregateId: { in: programIds } }, ...programIds.map((id) => ({ aggregateId: { contains: id } }))] } });
  await prisma.rewardAward.deleteMany({ where: { programId: { in: programIds } } });
  await prisma.rewardTier.deleteMany({ where: { programId: { in: programIds } } });
  await prisma.rewardProgram.deleteMany({ where: { id: { in: programIds } } });
  await prisma.matchRatingChange.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.playerSeasonProfile.deleteMany({ where: { seasonId } });
  await prisma.season.deleteMany({ where: { id: seasonId } });
  await prisma.$disconnect();
});

const payload = (overrides: Record<string, unknown> = {}) => ({
  name: 'Vua đơn tháng 3', seasonId, criterion: 'most_wins', discipline: 'singles', band: 'under_1600', scope: 'global',
  startAt: '2099-03-01T00:00:00.000Z', endAt: '2099-03-31T23:59:59.000Z',
  tiers: [{ rank: 1, amount: '100000' }, { rank: 2, amount: '60000' }, { rank: 3, amount: '30001' }], ...overrides,
});

async function create(overrides: Record<string, unknown> = {}) {
  const response = await request(app).post('/rewards/admin/programs').set('Authorization', admin).send(payload(overrides));
  if (response.status === 201) programIds.push(response.body.program.id);
  return response;
}

/** Một kết quả đã tính rating: trận ranked kết thúc tại endAt, có kết quả final. */
async function rated(userId: string, endAt: string, change: { after: number; delta: number; won: boolean }, discipline: 'singles' | 'doubles' = 'singles') {
  const match = await prisma.match.create({
    data: { bookingId: randomUUID(), organizerUserId: userId, capacity: 2, discipline, feePerSlot: 0n, status: 'completed', mode: 'ranked', cutoffAt: new Date(endAt), endAt: new Date(endAt) },
  });
  matchIds.push(match.id);
  await prisma.matchResultCase.create({ data: { matchId: match.id, status: 'final', outcome: 'TEAM_A_WIN', declarationDeadlineAt: new Date(endAt), finalizedAt: new Date(endAt) } });
  await prisma.matchRatingChange.create({
    data: { matchId: match.id, userId, discipline, ratingBefore: change.after - change.delta, ratingAfter: change.after, delta: change.delta, won: change.won },
  });
}

describe('Task 20 program administration', () => {
  it('accepts exactly the create payload, validates range/tiers, and keeps funding source as metadata', async () => {
    expect((await create({ extra: 1 })).status).toBe(400);
    expect((await create({ endAt: '2099-12-02T00:00:00.000Z' })).body.error.code).toBe('REWARD_RANGE_INVALID');
    expect((await create({ startAt: '2099-04-01T00:00:00.000Z', endAt: '2099-03-01T00:00:00.000Z' })).body.error.code).toBe('REWARD_RANGE_INVALID');
    expect((await create({ tiers: [] })).status).toBe(400);
    expect((await create({ tiers: [{ rank: 2, amount: '1' }] })).body.error.code).toBe('REWARD_TIERS_INVALID');
    expect((await create({ scope: 'province' })).body.error.code).toBe('REWARD_SCOPE_INVALID');
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.body.program).toMatchObject({ status: 'draft', tiers: [{ rank: 1, amount: '100000' }, { rank: 2, amount: '60000' }, { rank: 3, amount: '30001' }] });

    const list = await request(app).get('/rewards/admin/programs?page=1&pageSize=1&status=draft').set('Authorization', admin).expect(200);
    expect(list.body).toMatchObject({ page: 1, pageSize: 1 });
    expect(list.body.items[0]).toHaveProperty('locked', false);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    await request(app).get('/rewards/admin/programs').set('Authorization', playerAuth(randomUUID())).expect(403);
  });

  it('locks a published program, and cancels directly before start or with a reason while running', async () => {
    const program = (await create()).body.program;
    await request(app).post(`/rewards/admin/programs/${program.id}/publish`).set('Authorization', admin).expect(200);
    expect((await request(app).post(`/rewards/admin/programs/${program.id}/publish`).set('Authorization', admin)).body.error.code).toBe('REWARD_ALREADY_PUBLISHED');
    await request(app).patch(`/rewards/admin/programs/${program.id}`).set('Authorization', admin).send({ tiers: [] }).expect(404);
    await request(app).post(`/rewards/admin/programs/${program.id}/cancel`).set('Authorization', admin).send({}).expect(200);

    const running = (await create()).body.program;
    await request(app).post(`/rewards/admin/programs/${running.id}/publish`).set('Authorization', admin).expect(200);
    const participant = randomUUID();
    await rated(participant, '2099-03-05T10:00:00Z', { after: 1510, delta: 10, won: true });
    await sweepRewardPrograms(new Date('2099-03-10T00:00:00Z'), [running.id]);
    expect((await request(app).post(`/rewards/admin/programs/${running.id}/cancel`).set('Authorization', admin).send({})).body.error.code)
      .toBe('REWARD_CANCEL_REASON_REQUIRED');
    // Chương trình thật đang chạy theo giờ test 2099 chỉ mô phỏng: gọi domain với lý do.
    const { cancelProgram } = await import('../src/domain/rewards.js');
    await cancelProgram(running.id, 'Nhà tài trợ rút', new Date('2099-03-10T00:00:00Z'));
    expect(await prisma.outbox.count({ where: { aggregateId: `reward.cancelled:${running.id}:${participant}` } })).toBe(1);
  });
});

describe('Task 20 scoring and finalization', () => {
  it('scores all four criteria from rated results inside the inclusive window, with band by ending rating', async () => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    await rated(a, '2099-05-01T00:00:00Z', { after: 1520, delta: 20, won: true });
    await rated(a, '2099-05-02T00:00:00Z', { after: 1540, delta: 20, won: true });
    await rated(a, '2099-05-03T00:00:00Z', { after: 1530, delta: -10, won: false });
    await rated(b, '2099-05-01T00:00:00Z', { after: 1580, delta: 15, won: true });
    await rated(b, '2099-05-31T23:59:59Z', { after: 1610, delta: 30, won: true }); // vượt 1600 đúng mốc kết thúc
    await rated(c, '2099-04-30T23:59:59Z', { after: 1500, delta: 50, won: true }); // ngoài cửa sổ
    await rated(c, '2099-05-10T00:00:00Z', { after: 1490, delta: -5, won: false });
    // Trận ngày 4 tranh chấp nên rating ghi sau trận ngày 5: điểm cuối là lần ghi mới nhất, không phải trận muộn nhất.
    const [d] = [randomUUID()];
    const extra: string[] = [];
    await rated(d, '2099-05-05T00:00:00Z', { after: 1560, delta: 10, won: true });
    await rated(d, '2099-05-04T00:00:00Z', { after: 1575, delta: 15, won: true });
    const base = { startAt: '2099-05-01T00:00:00.000Z', endAt: '2099-05-31T23:59:59.000Z' };
    const score = async (criterion: string, band = 'under_1600') => {
      const program = await prisma.rewardProgram.findUniqueOrThrow({ where: { id: (await create({ ...base, criterion, band })).body.program.id } });
      return (await scoreProgram(prisma, program, new Date('2099-06-01T00:00:00Z'))).filter((row) => [a, b, c, ...extra].includes(row.userId));
    };
    expect(await score('ending_rating')).toEqual([{ userId: a, score: 1530, rank: 2 }, { userId: c, score: 1490, rank: 3 }]);
    expect(await score('ending_rating', 'from_1600')).toEqual([{ userId: b, score: 1610, rank: 1 }]);
    expect(await score('most_wins')).toEqual([{ userId: a, score: 2, rank: 1 }]);
    expect(await score('largest_rating_gain')).toEqual([{ userId: a, score: 30, rank: 1 }]);
    expect(await score('longest_streak', 'from_1600')).toEqual([{ userId: b, score: 2, rank: 1 }]);
    extra.push(d);
    expect((await score('ending_rating')).find((row) => row.userId === d)).toMatchObject({ score: 1575, rank: 1 });
  });

  it('splits consecutive tied positions equally with the remainder to the last user id', () => {
    const tiers = [{ rank: 1, amount: 100_000n }, { rank: 2, amount: 60_000n }, { rank: 3, amount: 30_001n }];
    const ids = ['u1', 'u2', 'u3', 'u4'];
    expect(allocatePrizes([{ userId: ids[1]!, rank: 1, score: 9 }, { userId: ids[0]!, rank: 1, score: 9 }, { userId: ids[2]!, rank: 3, score: 5 }], tiers)
      .map((award) => [award.userId, award.amount])).toEqual([['u1', 80_000n], ['u2', 80_000n], ['u3', 30_001n]]);
    expect(allocatePrizes(ids.slice(0, 3).map((userId) => ({ userId, rank: 1, score: 9 })), tiers).map((award) => award.amount))
      .toEqual([63_333n, 63_333n, 63_335n]);
    expect(allocatePrizes([{ userId: 'u4', rank: 4, score: 1 }], tiers)).toEqual([]);
    // Giải 1 đồng cho hai người đồng hạng: không tạo khoản 0 đồng, tổng vẫn bảo toàn.
    expect(allocatePrizes([{ userId: 'u1', rank: 1, score: 3 }, { userId: 'u2', rank: 1, score: 3 }], [{ rank: 1, amount: 1n }])
      .map((award) => [award.userId, award.amount])).toEqual([['u2', 1n]]);
  });

  it('waits for every in-window result, then lets Admin approve the computed list and emits one finalized event', async () => {
    const program = (await create({ criterion: 'most_wins', startAt: '2099-07-01T00:00:00.000Z', endAt: '2099-07-31T00:00:00.000Z' })).body.program;
    await request(app).post(`/rewards/admin/programs/${program.id}/publish`).set('Authorization', admin).expect(200);
    const winner = randomUUID();
    await rated(winner, '2099-07-05T00:00:00Z', { after: 1510, delta: 10, won: true });
    const pending = await prisma.match.create({
      data: { bookingId: randomUUID(), organizerUserId: randomUUID(), capacity: 2, feePerSlot: 0n, status: 'completed', mode: 'ranked', cutoffAt: new Date('2099-07-20T00:00:00Z'), endAt: new Date('2099-07-20T00:00:00Z') },
    });
    matchIds.push(pending.id);
    const after = new Date('2099-08-01T00:00:00Z');
    await sweepRewardPrograms(after, [program.id]);
    await sweepRewardPrograms(after, [program.id]);
    const detail = await request(app).get(`/rewards/programs/${program.id}`).set('Authorization', playerAuth(winner)).expect(200);
    expect(detail.body.program).toMatchObject({ status: 'reconciling', reconciling: true, criterionLabel: 'Nhiều trận thắng xếp hạng nhất' });
    expect((await getPublicProgram(program.id, winner, after)).viewer).toEqual({ rank: 1, score: 1 });
    await expect(approveFinal(program.id, randomUUID(), after)).rejects.toMatchObject({ code: 'REWARD_NOT_AWAITING_APPROVAL' });

    await prisma.matchResultCase.create({ data: { matchId: pending.id, status: 'final', outcome: 'NO_RESULT', declarationDeadlineAt: after } });
    // Kết quả đã final nhưng rating đã giữ suất còn chờ consumer ghi: vẫn đang đối soát.
    await prisma.ratedEncounter.create({ data: { matchId: pending.id, userId: winner, discipline: 'singles', opponentKey: 'x', finalizedAt: after, rated: true } });
    await sweepRewardPrograms(after, [program.id]);
    expect((await prisma.rewardProgram.findUniqueOrThrow({ where: { id: program.id } })).status).toBe('reconciling');
    await prisma.ratedEncounter.deleteMany({ where: { matchId: pending.id } });
    await sweepRewardPrograms(after, [program.id]);
    const adminView = await request(app).get(`/rewards/admin/programs/${program.id}`).set('Authorization', admin).expect(200);
    expect(adminView.body.program).toMatchObject({
      status: 'awaiting_admin_approval', awardTotal: '100000',
      awards: [{ userId: winner, displayName: 'Tên', rank: 1, score: 1, amount: '100000' }],
    });
    expect(await prisma.rewardAward.findMany({ where: { programId: program.id } })).toEqual([
      expect.objectContaining({ userId: winner, rank: 1, amount: 100_000n }),
    ]);
    await request(app).post(`/rewards/admin/programs/${program.id}/approve-final`).set('Authorization', admin).send({}).expect(400);
    await request(app).post(`/rewards/admin/programs/${program.id}/approve-final`).set('Authorization', admin).send({ confirm: true }).expect(200);
    const events = await prisma.outbox.findMany({ where: { aggregateId: program.id, eventType: 'RewardAwardsFinalized' } });
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ programId: program.id, programName: 'Vua đơn tháng 3', awards: [{ userId: winner, rank: 1, amount: '100000' }] });
    const [award] = (events[0]!.payload as { awards: Array<{ claimDeadlineAt: string }> }).awards;
    expect(new Date(award!.claimDeadlineAt).getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60_000);
    const list = await request(app).get('/rewards/programs').expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(program.id);
  });
});
