import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';

process.env.JWT_SECRET ??= 'community-test-jwt-secret';
import { prisma } from '../src/lib/prisma.js';
import { handleAccountLocked } from '../src/lib/accountLockedConsumer.js';
import type { ObjectStorageClient } from '@khoaluantn/object-storage';

const verifiedPlayers = new Set<string>();
const app = createApp({
  accountEligibilityClient: {
    async isVerifiedPlayer(userId: string) {
      return verifiedPlayers.has(userId);
    },
    async getPublicDisplayNames(userIds: string[]) {
      return userIds.map((userId) => ({ userId, displayName: null }));
    },
  },
});

function token(userId: string, roles: string[]): string {
  return jwt.sign({ sub: userId, roles, type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env', {
    expiresIn: 300,
  });
}

function player(): { userId: string; authorization: string } {
  const userId = randomUUID();
  verifiedPlayers.add(userId);
  return { userId, authorization: `Bearer ${token(userId, ['player'])}` };
}

function admin(): { userId: string; authorization: string } {
  const userId = randomUUID();
  return { userId, authorization: `Bearer ${token(userId, ['admin'])}` };
}

afterEach(async () => {
  await prisma.processedEvent.deleteMany();
  await prisma.outbox.deleteMany();
  await prisma.moderationAudit.deleteMany();
  await prisma.report.deleteMany();
  await prisma.ticketMessage.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.postImage.deleteMany();
  await prisma.post.deleteMany();
  await prisma.accountLock.deleteMany();
  verifiedPlayers.clear();
});

describe('Task 15 — ảnh bài viết có quyền sở hữu', () => {
  it('verifies owned uploads before one transaction and keeps at most four ordered images', async () => {
    const author = player();
    const assertOwnedObject = vi.fn< ObjectStorageClient['assertOwnedObject'] >().mockResolvedValue(undefined);
    const authorizeUpload = vi.fn< ObjectStorageClient['authorizeUpload'] >().mockResolvedValue({
      objectKey: `community/posts/${author.userId}/authorized.jpg`, uploadUrl: 'https://storage.test/upload', headers: { 'Content-Type': 'image/jpeg' }, expiresAt: '2026-08-14T00:10:00.000Z',
    });
    const storage: ObjectStorageClient = {
      authorizeUpload,
      assertOwnedObject,
      getReadUrl: vi.fn(),
      deleteObject: vi.fn(),
    };
    const imageKeys = [0, 1, 2, 3].map((position) => `community/posts/${author.userId}/post-${position}.jpg`);
    const appWithStorage = createApp({
      accountEligibilityClient: {
        async isVerifiedPlayer(userId) { return userId === author.userId; },
        async getPublicDisplayNames(userIds) { return userIds.map((userId) => ({ userId, displayName: null })); },
      },
      objectStorage: storage,
    });

    await request(appWithStorage)
      .post('/uploads/posts')
      .set('Authorization', author.authorization)
      .send({ mimeType: 'image/jpeg', objectKey: `community/posts/${author.userId}/attacker.jpg` })
      .expect(400);
    await request(appWithStorage)
      .post('/uploads/posts')
      .set('Authorization', author.authorization)
      .send({ mimeType: 'image/jpeg' })
      .expect(201)
      .expect(({ body }) => expect(body.objectKey).toBe(`community/posts/${author.userId}/authorized.jpg`));
    expect(authorizeUpload).toHaveBeenCalledWith({ namespace: 'community/posts', ownerUserId: author.userId, mimeType: 'image/jpeg' });

    const created = await request(appWithStorage)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({
        body: 'Bài có bốn ảnh',
        images: imageKeys.map((objectKey, position) => ({ objectKey, width: 1200, height: 800, alt: `Ảnh ${position}`, position })),
      })
      .expect(201);

    expect(assertOwnedObject).toHaveBeenCalledTimes(4);
    expect(created.body.images.map((image: { objectKey: string }) => image.objectKey)).toEqual(imageKeys);
    const edited = await request(appWithStorage)
      .patch(`/posts/${created.body.id}`)
      .set('Authorization', author.authorization)
      .send({ body: 'Giữ lại một ảnh', images: [{ objectKey: imageKeys[0], width: 1200, height: 800, alt: 'Ảnh đầu', position: 0 }] })
      .expect(200);
    expect(edited.body.images.map((image: { objectKey: string }) => image.objectKey)).toEqual([imageKeys[0]]);
    expect(await prisma.outbox.count({ where: { eventType: 'ObjectCleanupScheduled' } })).toBe(3);
    await request(appWithStorage)
      .delete(`/posts/${created.body.id}`)
      .set('Authorization', author.authorization)
      .expect(200);
    expect(await prisma.outbox.count({ where: { eventType: 'ObjectCleanupScheduled' } })).toBe(4);
    await request(appWithStorage)
      .patch(`/posts/${created.body.id}`)
      .set('Authorization', author.authorization)
      .send({
        body: 'Năm ảnh là không hợp lệ',
        images: [...imageKeys, `community/posts/${author.userId}/post-4.jpg`].map((objectKey, position) => ({ objectKey, width: 1200, height: 800, alt: `Ảnh ${position}`, position })),
      })
      .expect(400);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('COM-01..08 — public community and asynchronous support', () => {
  it('lists only published posts publicly, including an empty feed', async () => {
    const author = player();
    const created = await request(app)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({ body: 'Bài hiển thị công khai' })
      .expect(201);
    await prisma.post.createMany({
      data: [
        { authorUserId: randomUUID(), body: 'ẩn', status: 'hidden' },
        { authorUserId: randomUUID(), body: 'gỡ', status: 'removed' },
      ],
    });

    await request(app)
      .get('/posts')
      .expect(200)
      .expect(({ body }) => {
        expect(body.posts).toHaveLength(1);
        expect(body.posts[0].id).toBe(created.body.id);
      });

    await prisma.post.deleteMany();
    await request(app)
      .get('/posts')
      .expect(200)
      .expect(({ body }) => expect(body.posts).toEqual([]));
  });

  it('returns a published comment count on each public feed post', async () => {
    const author = player();
    const post = await request(app)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({ body: 'Bài có bình luận' })
      .expect(201);
    await prisma.comment.createMany({
      data: [
        { postId: post.body.id, authorUserId: randomUUID(), body: 'Công khai' },
        {
          postId: post.body.id,
          authorUserId: randomUUID(),
          body: 'Đã gỡ',
          status: 'removed',
        },
      ],
    });

    await request(app)
      .get('/posts')
      .expect(200)
      .expect(({ body }) => {
        expect(body.posts[0]).toMatchObject({
          id: post.body.id,
          commentCount: 1,
        });
      });
  });

  it('lets an author read only their posts across moderation states', async () => {
    const author = player();
    const other = player();
    await prisma.post.createMany({
      data: [
        { authorUserId: author.userId, body: 'Công khai', status: 'published' },
        { authorUserId: author.userId, body: 'Đang ẩn', status: 'hidden' },
        { authorUserId: author.userId, body: 'Đã gỡ', status: 'removed' },
        { authorUserId: other.userId, body: 'Không được lộ', status: 'hidden' },
      ],
    });

    await request(app)
      .get('/posts/mine')
      .set('Authorization', author.authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.posts).toHaveLength(3);
        expect(body.posts.map((post: { status: string }) => post.status).sort()).toEqual([
          'hidden',
          'published',
          'removed',
        ]);
        expect(body.posts.some((post: { body: string }) => post.body === 'Không được lộ')).toBe(false);
      });
  });

  it('lets a reporter read only their reports including resolved statuses', async () => {
    const author = player();
    const reporter = player();
    const other = player();
    const moderator = admin();
    const post = await request(app)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({ body: 'Bài được báo cáo' })
      .expect(201);
    const report = await request(app)
      .post('/reports')
      .set('Authorization', reporter.authorization)
      .send({
        targetType: 'post',
        targetId: post.body.id,
        reason: 'Cần xem xét',
      })
      .expect(201);
    await request(app)
      .post(`/admin/reports/${report.body.id}/actions`)
      .set('Authorization', moderator.authorization)
      .send({ action: 'dismiss', reason: 'Không vi phạm' })
      .expect(200);

    await request(app)
      .get('/reports/mine')
      .set('Authorization', reporter.authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.reports).toEqual([expect.objectContaining({ id: report.body.id, status: 'dismissed' })]);
      });
    await request(app)
      .get('/reports/mine')
      .set('Authorization', other.authorization)
      .expect(200)
      .expect(({ body }) => expect(body.reports).toEqual([]));
  });

  it('allows only verified unlocked players to create valid text-only posts', async () => {
    const author = player();
    await request(app).post('/posts').set('Authorization', author.authorization).send({ body: '' }).expect(400);
    await request(app)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({ body: 'x'.repeat(5001) })
      .expect(400);
    await request(app)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({ body: 'Bài hợp lệ' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('published'));

    const locked = player();
    await handleAccountLocked('account-unlock-v2', {
      userId: locked.userId,
      locked: false,
      stateVersion: 2,
    });
    await handleAccountLocked('account-lock-v1', {
      userId: locked.userId,
      locked: true,
      stateVersion: 1,
    });
    await request(app)
      .post('/posts')
      .set('Authorization', locked.authorization)
      .send({ body: 'Sự kiện lock cũ không được ghi đè unlock mới' })
      .expect(201);
    await handleAccountLocked('account-lock-v3', {
      userId: locked.userId,
      locked: true,
      stateVersion: 3,
    });
    expect(
      await prisma.processedEvent.count({
        where: {
          eventId: {
            in: ['account-unlock-v2', 'account-lock-v1', 'account-lock-v3'],
          },
        },
      }),
    ).toBe(3);
    await request(app)
      .post('/posts')
      .set('Authorization', locked.authorization)
      .send({ body: 'Không được đăng' })
      .expect(403);
  });

  it('edits and soft-removes only the author post', async () => {
    const author = player();
    const other = player();
    const post = await request(app)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({ body: 'Bản đầu' })
      .expect(201);
    await request(app)
      .patch(`/posts/${post.body.id}`)
      .set('Authorization', other.authorization)
      .send({ body: 'Chiếm quyền' })
      .expect(403);
    await request(app)
      .patch(`/posts/${post.body.id}`)
      .set('Authorization', author.authorization)
      .send({ body: 'Bản đã sửa' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.body).toBe('Bản đã sửa');
        expect(body.editedAt).toEqual(expect.any(String));
      });
    await request(app).delete(`/posts/${post.body.id}`).set('Authorization', author.authorization).expect(200);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.body.id } })).toMatchObject({ status: 'removed' });
    await request(app).delete(`/posts/${post.body.id}`).set('Authorization', other.authorization).expect(403);
  });

  it('allows comments only on published posts and soft-removes only the author comment', async () => {
    const author = player();
    const other = player();
    const post = await request(app)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({ body: 'Bài để bình luận' })
      .expect(201);
    const comment = await request(app)
      .post(`/posts/${post.body.id}/comments`)
      .set('Authorization', other.authorization)
      .send({ body: 'Bình luận hợp lệ' })
      .expect(201);
    await request(app)
      .get(`/posts/${post.body.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.comments).toEqual([
          expect.objectContaining({
            id: comment.body.id,
            body: 'Bình luận hợp lệ',
          }),
        ]);
      });
    await request(app).delete(`/comments/${comment.body.id}`).set('Authorization', author.authorization).expect(403);
    await request(app).delete(`/comments/${comment.body.id}`).set('Authorization', other.authorization).expect(200);
    expect(
      await prisma.comment.findUniqueOrThrow({
        where: { id: comment.body.id },
      }),
    ).toMatchObject({ status: 'removed' });
    await request(app)
      .post(`/posts/${post.body.id}/comments`)
      .set('Authorization', other.authorization)
      .send({
        body: 'Không đăng được vì bài đã public nhưng comment cũ removed',
      })
      .expect(201);
    await prisma.post.update({
      where: { id: post.body.id },
      data: { status: 'removed' },
    });
    await request(app)
      .post(`/posts/${post.body.id}/comments`)
      .set('Authorization', other.authorization)
      .send({ body: 'Không được' })
      .expect(409);
  });

  it('creates one open report plus an outbox event without auto-removing its target', async () => {
    const author = player();
    const reporter = player();
    const post = await request(app)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({ body: 'Cần kiểm duyệt' })
      .expect(201);
    await request(app)
      .post('/reports')
      .set('Authorization', reporter.authorization)
      .send({
        targetType: 'post',
        targetId: post.body.id,
        reason: 'Nội dung vi phạm',
      })
      .expect(201);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.body.id } })).toMatchObject({ status: 'published' });
    expect(
      await prisma.outbox.findFirstOrThrow({
        where: { eventType: 'ContentReported' },
      }),
    ).toMatchObject({
      aggregateType: 'Report',
      aggregateId: expect.any(String),
    });
    await request(app)
      .post('/reports')
      .set('Authorization', reporter.authorization)
      .send({ targetType: 'post', targetId: post.body.id, reason: 'Lặp lại' })
      .expect(409);
  });

  it('lets only admin moderate reports and leaves an append-only audit', async () => {
    const author = player();
    const reporter = player();
    const moderator = admin();
    const post = await request(app)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({ body: 'Bài bị gỡ' })
      .expect(201);
    const report = await request(app)
      .post('/reports')
      .set('Authorization', reporter.authorization)
      .send({ targetType: 'post', targetId: post.body.id, reason: 'Vi phạm' })
      .expect(201);
    await request(app)
      .post(`/admin/reports/${report.body.id}/actions`)
      .set('Authorization', author.authorization)
      .send({ action: 'remove', reason: 'Đã xác minh' })
      .expect(403);
    await request(app)
      .post(`/admin/reports/${report.body.id}/actions`)
      .set('Authorization', moderator.authorization)
      .send({ action: 'remove', reason: 'Đã xác minh' })
      .expect(200);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.body.id } })).toMatchObject({ status: 'removed' });
    expect(await prisma.report.findUniqueOrThrow({ where: { id: report.body.id } })).toMatchObject({
      status: 'actioned',
    });
    expect(
      await prisma.moderationAudit.findFirstOrThrow({
        where: { targetId: post.body.id },
      }),
    ).toMatchObject({
      adminUserId: moderator.userId,
      action: 'remove',
    });
  });

  it('dismisses reports without changing published content', async () => {
    const author = player();
    const reporter = player();
    const moderator = admin();
    const post = await request(app)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({ body: 'Bài hợp lệ' })
      .expect(201);
    const report = await request(app)
      .post('/reports')
      .set('Authorization', reporter.authorization)
      .send({ targetType: 'post', targetId: post.body.id, reason: 'Nhầm' })
      .expect(201);
    await request(app)
      .post(`/admin/reports/${report.body.id}/actions`)
      .set('Authorization', moderator.authorization)
      .send({ action: 'dismiss', reason: 'Không vi phạm' })
      .expect(200);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.body.id } })).toMatchObject({ status: 'published' });
    expect(await prisma.report.findUniqueOrThrow({ where: { id: report.body.id } })).toMatchObject({
      status: 'dismissed',
    });
  });

  it('lets admin temporarily hide reported content without deleting its record', async () => {
    const author = player();
    const reporter = player();
    const moderator = admin();
    const post = await request(app)
      .post('/posts')
      .set('Authorization', author.authorization)
      .send({ body: 'Bài cần ẩn tạm' })
      .expect(201);
    const report = await request(app)
      .post('/reports')
      .set('Authorization', reporter.authorization)
      .send({
        targetType: 'post',
        targetId: post.body.id,
        reason: 'Chờ xem xét',
      })
      .expect(201);
    await request(app)
      .get('/admin/reports')
      .set('Authorization', moderator.authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body.reports).toEqual([expect.objectContaining({ id: report.body.id, status: 'open' })]),
      );
    await request(app)
      .post(`/admin/reports/${report.body.id}/actions`)
      .set('Authorization', moderator.authorization)
      .send({ action: 'hide', reason: 'Ẩn tạm' })
      .expect(200);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.body.id } })).toMatchObject({ status: 'hidden' });
    await request(app)
      .post(`/admin/content/post/${post.body.id}/restore`)
      .set('Authorization', moderator.authorization)
      .send({ reason: 'Đã xem xét' })
      .expect(200);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.body.id } })).toMatchObject({ status: 'published' });
    expect(
      await prisma.moderationAudit.findFirstOrThrow({
        where: { targetId: post.body.id, action: 'restore' },
      }),
    ).toMatchObject({ adminUserId: moderator.userId });
  });

  it('keeps tickets private, makes admin replies in-progress, and allows resolve then close', async () => {
    const requester = player();
    const stranger = player();
    const moderator = admin();
    const ticket = await request(app)
      .post('/tickets')
      .set('Authorization', requester.authorization)
      .send({ subject: 'Cần hỗ trợ', body: 'Mô tả vấn đề' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('open'));
    await request(app)
      .get('/tickets')
      .set('Authorization', requester.authorization)
      .expect(200)
      .expect(({ body }) => expect(body.tickets).toEqual([expect.objectContaining({ id: ticket.body.id })]));
    await request(app)
      .get('/tickets')
      .set('Authorization', moderator.authorization)
      .expect(200)
      .expect(({ body }) => expect(body.tickets).toEqual([expect.objectContaining({ id: ticket.body.id })]));
    await request(app).get(`/tickets/${ticket.body.id}`).set('Authorization', stranger.authorization).expect(403);
    await request(app)
      .post(`/tickets/${ticket.body.id}/messages`)
      .set('Authorization', moderator.authorization)
      .send({ body: 'Admin đã tiếp nhận' })
      .expect(201);
    await request(app)
      .get(`/tickets/${ticket.body.id}`)
      .set('Authorization', requester.authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('in_progress');
        expect(body.messages).toHaveLength(2);
      });
    await request(app)
      .post(`/tickets/${ticket.body.id}/status`)
      .set('Authorization', moderator.authorization)
      .send({ status: 'resolved' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('resolved'));
    await request(app)
      .post(`/tickets/${ticket.body.id}/status`)
      .set('Authorization', moderator.authorization)
      .send({ status: 'closed' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('closed'));
  });
});
