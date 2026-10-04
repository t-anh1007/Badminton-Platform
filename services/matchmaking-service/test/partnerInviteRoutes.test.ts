import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import type { AccountClient } from '../src/clients/account.js';
import type { VenueBookingClient } from '../src/clients/venueBooking.js';

// BR-CM-79/80: route mời đồng đội bằng email, SĐT hoặc người từng chơi cùng.

const emailUser = randomUUID();
const phoneUser = randomUUID();
const accountClient: AccountClient = {
  getPublicMatchProfile: async () => null,
  getPublicDisplayNames: async (ids) => ids.map((userId) => ({ userId, displayName: `P-${userId.slice(0, 4)}`, avatarUrl: null })),
  findPlayerIdByEmail: async (email) => (email === 'ban@example.test' ? emailUser : null),
  findPlayerIdByPhone: async (phone) => (phone === '0911111111' ? { userId: phoneUser }
    : phone === '0922222222' ? { error: 'ambiguous' } : { error: 'not_found' }),
};
const venueClient = { getMatchContext: async () => null } as unknown as VenueBookingClient;
const app = createApp({ venueBookingClient: venueClient, accountClient });
const matchIds: string[] = [];

const token = (userId: string) => jwt.sign(
  { sub: userId, roles: ['player'], type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env', { expiresIn: 300 },
);

async function openDoubles(organizerUserId: string) {
  const match = await prisma.match.create({
    data: {
      bookingId: randomUUID(), organizerUserId, discipline: 'doubles', capacity: 4, feePerSlot: 50000n,
      sourceType: 'paid_booking', skillConfiguredAt: new Date(), cutoffAt: new Date(Date.now() + 3600_000),
    },
  });
  matchIds.push(match.id);
  return match;
}

async function playedWith(organizerUserId: string, mate: string) {
  const match = await prisma.match.create({
    data: {
      bookingId: randomUUID(), organizerUserId, discipline: 'doubles', capacity: 4, feePerSlot: 0n,
      sourceType: 'paid_booking', status: 'completed', cutoffAt: new Date(Date.now() - 3 * 3600_000),
      startAt: new Date(Date.now() - 2 * 3600_000), endAt: new Date(Date.now() - 3600_000),
      joins: { create: [{ participantUserId: mate, status: 'confirmed', teamSide: 'A' }] },
    },
  });
  matchIds.push(match.id);
}

const invite = (matchId: string, organizer: string, body: object) => request(app)
  .post(`/matches/${matchId}/partner-invite`).set('Authorization', `Bearer ${token(organizer)}`).send(body);

afterAll(async () => {
  for (const matchId of matchIds) await prisma.outbox.deleteMany({ where: { aggregateId: { contains: matchId } } });
  await prisma.partnerInvite.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.$disconnect();
});

describe('POST /matches/:id/partner-invite', () => {
  it('mời bằng email', async () => {
    const organizer = randomUUID();
    const match = await openDoubles(organizer);
    const res = await invite(match.id, organizer, { email: 'ban@example.test', payMode: 'self' });
    expect(res.status).toBe(201);
    expect(res.body.invite.inviteeUserId).toBe(emailUser);
  });

  it('mời bằng SĐT khớp duy nhất; báo lỗi theo mã khi trùng hoặc không có', async () => {
    const organizer = randomUUID();
    const match = await openDoubles(organizer);
    const ok = await invite(match.id, organizer, { phone: '0911111111', payMode: 'self' });
    expect(ok.status).toBe(201);
    expect(ok.body.invite.inviteeUserId).toBe(phoneUser);
    const ambiguous = await invite(match.id, organizer, { phone: '0922222222', payMode: 'self' });
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.error?.code ?? ambiguous.body.code).toBe('PLAYER_PHONE_AMBIGUOUS');
    const missing = await invite(match.id, organizer, { phone: '0933333333', payMode: 'self' });
    expect(missing.status).toBe(404);
    expect(missing.body.error?.code ?? missing.body.code).toBe('PLAYER_NOT_FOUND');
  });

  it('mời người từng chơi cùng; chặn người không có trong danh sách', async () => {
    const organizer = randomUUID();
    const mate = randomUUID();
    await playedWith(organizer, mate);
    const match = await openDoubles(organizer);
    const stranger = await invite(match.id, organizer, { userId: randomUUID(), payMode: 'self' });
    expect(stranger.status).toBe(404);
    expect(stranger.body.error?.code ?? stranger.body.code).toBe('PLAYER_NOT_FOUND');
    const ok = await invite(match.id, organizer, { userId: mate, payMode: 'self' });
    expect(ok.status).toBe(201);
    expect(ok.body.invite.inviteeUserId).toBe(mate);
  });

  it('từ chối body có nhiều hơn một cách mời', async () => {
    const organizer = randomUUID();
    const match = await openDoubles(organizer);
    const res = await invite(match.id, organizer, { email: 'ban@example.test', phone: '0911111111', payMode: 'self' });
    expect(res.status).toBe(400);
  });
});

describe('GET /matches/me/recent-players', () => {
  it('trả danh sách kèm tên hiển thị', async () => {
    const me = randomUUID();
    const mate = randomUUID();
    await playedWith(me, mate);
    const res = await request(app).get('/matches/me/recent-players').set('Authorization', `Bearer ${token(me)}`);
    expect(res.status).toBe(200);
    expect(res.body.players).toEqual([expect.objectContaining({ userId: mate, relation: 'teammate', displayName: expect.any(String) })]);
  });
});
