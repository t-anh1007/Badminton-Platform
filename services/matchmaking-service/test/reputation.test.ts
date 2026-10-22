import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { reputationOf } from '../src/domain/reputation.js';
import { declareTier } from '../src/domain/passport.js';
import { accountClient, fakeAi, token, venueBookingClient } from './resultV2TestUtils.js';

const userId = randomUUID();
afterAll(async () => {
  await prisma.playerViolation.deleteMany({ where: { userId } });
  await prisma.passport.deleteMany({ where: { userId } });
  await prisma.$disconnect();
});

const DAY = 24 * 3_600_000;
const now = new Date('2026-10-21T03:00:00.000Z');

describe('player reputation', () => {
  it('counts violations in the last 90 days: 0 good, 1 watch, 2+ low, and recovers after 90 days', async () => {
    expect(await reputationOf(userId, now)).toBe('good');
    await prisma.playerViolation.create({ data: { userId, caseId: randomUUID(), kind: 'x', source: 'admin', createdAt: new Date(now.getTime() - 10 * DAY) } });
    expect(await reputationOf(userId, now)).toBe('watch');
    await prisma.playerViolation.create({ data: { userId, caseId: randomUUID(), kind: 'x', source: 'auto', createdAt: new Date(now.getTime() - 89 * DAY) } });
    expect(await reputationOf(userId, now)).toBe('low');
    expect(await reputationOf(userId, new Date(now.getTime() + 2 * DAY))).toBe('watch');
  });

  it('is visible to the player only, never on the public passport', async () => {
    const app = createApp({ venueBookingClient, accountClient, aiChains: fakeAi().ai });
    const own = await request(app).get('/passports/me/reputation').set('Authorization', `Bearer ${token(userId)}`);
    expect(own.status).toBe(200);
    expect(['good', 'watch', 'low']).toContain(own.body.reputation);
    await declareTier(userId, 'singles', 'beginner');
    const viewer = randomUUID();
    const publicView = await request(app).get(`/passports/${userId}`).set('Authorization', `Bearer ${token(viewer)}`);
    expect(publicView.status).toBe(200);
    expect(JSON.stringify(publicView.body).toLowerCase()).not.toMatch(/reputation|violation|uy tín/);
  });
});

describe('my reputation lists active violations (plan web A4, B4)', () => {
  it('returns active violations with match code, expiry and recovery date; only for the caller', async () => {
    const { v2Fixture, cleanupV2 } = await import('./resultV2TestUtils.js');
    try {
      const fixture = await v2Fixture();
      const me = fixture.b1;
      const recent = new Date(Date.now() - 10 * DAY);
      const older = new Date(Date.now() - 30 * DAY);
      await prisma.playerViolation.createMany({
        data: [
          { userId: me, caseId: fixture.resultCase.id, kind: 'exact_duplicate_photo', source: 'auto', createdAt: recent },
          { userId: me, caseId: randomUUID(), kind: 'false_claim', source: 'admin', createdAt: older },
          { userId: me, caseId: randomUUID(), kind: 'false_claim', source: 'admin', createdAt: new Date(Date.now() - 100 * DAY) },
        ],
      });
      const app = createApp({ venueBookingClient, accountClient, aiChains: fakeAi().ai });
      const own = await request(app).get('/passports/me/reputation').set('Authorization', `Bearer ${token(me)}`);
      expect(own.status).toBe(200);
      expect(own.body.reputation).toBe('low');
      expect(own.body.violations).toEqual([
        { matchCode: fixture.match.businessCode, kind: 'exact_duplicate_photo', createdAt: recent.toISOString(), expiresAt: new Date(recent.getTime() + 90 * DAY).toISOString() },
        { matchCode: null, kind: 'false_claim', createdAt: older.toISOString(), expiresAt: new Date(older.getTime() + 90 * DAY).toISOString() },
      ]);
      expect(own.body.recoversAt).toBe(new Date(recent.getTime() + 90 * DAY).toISOString());
      const other = await request(app).get('/passports/me/reputation').set('Authorization', `Bearer ${token(fixture.organizer)}`);
      expect(other.body).toEqual({ reputation: 'good', violations: [], recoversAt: null });
      await prisma.playerViolation.deleteMany({ where: { userId: me } });
    } finally {
      await cleanupV2();
    }
  });
});
