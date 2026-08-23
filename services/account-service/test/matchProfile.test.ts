import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import type { ObjectStorageClient } from '@khoaluantn/object-storage';

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
        playerProfile: { create: { displayName: 'Nguyễn Minh', avatarUrl: 'https://cdn.test/private.webp', visibility: 'private' } },
      },
    });
    userIds.push(user.id);

    const response = await request(app)
      .get(`/internal/players/${user.id}/public-match-profile`)
      .expect(200);

    expect(response.body).toEqual({
      userId: user.id,
      displayName: 'Người tổ chức',
      avatarUrl: null,
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
        playerProfile: { create: { displayName: 'Nguyễn Minh', avatarUrl: 'https://cdn.test/public.webp', visibility: 'public' } },
      },
    });
    userIds.push(user.id);

    const response = await request(app)
      .get(`/internal/players/${user.id}/public-match-profile`)
      .expect(200);

    expect(response.body).toEqual({
      userId: user.id,
      displayName: 'Nguyễn Minh',
      avatarUrl: 'https://cdn.test/public.webp',
      identityVisibility: 'public',
    });
  });
});

describe('profile avatar upload', () => {
  it('authorizes an owned upload, verifies it, then stores and returns the avatar URL', async () => {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        passwordHash: 'not-used',
        roles: ['player'],
        verified: true,
        playerProfile: { create: { displayName: 'Người chơi' } },
      },
    });
    userIds.push(user.id);
    const objectKey = `profile/avatars/${user.id}/avatar.webp`;
    const storage: ObjectStorageClient = {
      authorizeUpload: vi.fn().mockResolvedValue({ objectKey, uploadUrl: 'https://storage.test/put', headers: { 'Content-Type': 'image/webp' }, expiresAt: '2026-08-23T00:10:00.000Z' }),
      assertOwnedObject: vi.fn().mockResolvedValue(undefined),
      getReadUrl: vi.fn().mockResolvedValue('https://cdn.test/avatar.webp'),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };
    const avatarApp = createApp({ objectStorage: storage });
    const token = jwt.sign({ sub: user.id, roles: ['player'], type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env');

    const authorized = await request(avatarApp)
      .post('/profile/me/avatar-upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'image/webp' })
      .expect(201);
    expect(authorized.body).toEqual(expect.objectContaining({ objectKey }));

    const committed = await request(avatarApp)
      .put('/profile/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ objectKey, mimeType: 'image/webp' })
      .expect(200);

    expect(storage.assertOwnedObject).toHaveBeenCalledWith(expect.objectContaining({ objectKey, namespace: 'profile/avatars', ownerUserId: user.id }));
    expect(committed.body.playerProfile.avatarUrl).toBe('https://cdn.test/avatar.webp');
    expect((await prisma.playerProfile.findUniqueOrThrow({ where: { userId: user.id } })).avatarUrl).toBe(objectKey);
  });
});
