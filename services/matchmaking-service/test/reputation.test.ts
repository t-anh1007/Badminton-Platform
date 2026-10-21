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
