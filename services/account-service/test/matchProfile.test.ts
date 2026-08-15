import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();
const userIds: string[] = [];

afterAll(async () => {
  await prisma.playerProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('matchmaking public organizer profile contract', () => {
  it('D31: hides the real display name for a private organizer profile', async () => {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        passwordHash: 'not-used',
        roles: ['player'],
        verified: true,
        playerProfile: { create: { displayName: 'Nguyễn Minh', visibility: 'private' } },
      },
    });
    userIds.push(user.id);

    const response = await request(app)
      .get(`/internal/players/${user.id}/public-match-profile`)
      .expect(200);

    expect(response.body).toEqual({
      userId: user.id,
      displayName: 'Người tổ chức',
      identityVisibility: 'hidden',
    });
  });

  it('D31: returns the real display name for a public organizer profile', async () => {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        passwordHash: 'not-used',
        roles: ['player'],
        verified: true,
        playerProfile: { create: { displayName: 'Nguyễn Minh', visibility: 'public' } },
      },
    });
    userIds.push(user.id);

    const response = await request(app)
      .get(`/internal/players/${user.id}/public-match-profile`)
      .expect(200);

    expect(response.body).toEqual({
      userId: user.id,
      displayName: 'Nguyễn Minh',
      identityVisibility: 'public',
    });
  });
});
