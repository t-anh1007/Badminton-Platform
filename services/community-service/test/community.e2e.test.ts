import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';

process.env.JWT_SECRET ??= 'community-test-jwt-secret';
import { prisma } from '../src/lib/prisma.js';
import { handleAccountLocked } from '../src/lib/accountLockedConsumer.js';

const verifiedPlayers = new Set<string>();
const app = createApp({
  accountEligibilityClient: {
    async isVerifiedPlayer(userId: string) {
      return verifiedPlayers.has(userId);
    },
  },
});

function token(userId: string, roles: string[]): string {
  return jwt.sign(
    { sub: userId, roles, type: 'access' },
    process.env.JWT_SECRET ?? 'change-me-in-real-env',
    { expiresIn: 300 },
  );
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
  await prisma.post.deleteMany();
  await prisma.accountLock.deleteMany();
  verifiedPlayers.clear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('COM-01..08 — public community and asynchronous support', () => {
  it('lists only published posts publicly, including an empty feed', async () => {
    const author = player();
    const created = await request(app).post('/posts').set('Authorization', author.authorization)
      .send({ body: 'Bài hiển thị công khai' }).expect(201);
    await prisma.post.createMany({
      data: [
        { authorUserId: randomUUID(), body: 'ẩn', status: 'hidden' },
        { authorUserId: randomUUID(), body: 'gỡ', status: 'removed' },
      ],
    });

    await request(app).get('/posts').expect(200).expect(({ body }) => {
      expect(body.posts).toHaveLength(1);
      expect(body.posts[0].id).toBe(created.body.id);
    });

    await prisma.post.deleteMany();
    await request(app).get('/posts').expect(200).expect(({ body }) => expect(body.posts).toEqual([]));
  });

  it('allows only verified unlocked players to create valid text-only posts', async () => {
    const author = player();
    await request(app).post('/posts').set('Authorization', author.authorization)
      .send({ body: '' }).expect(400);
    await request(app).post('/posts').set('Authorization', author.authorization)
      .send({ body: 'x'.repeat(5001) }).expect(400);
    await request(app).post('/posts').set('Authorization', author.authorization)
      .send({ body: 'Bài hợp lệ' }).expect(201).expect(({ body }) => expect(body.status).toBe('published'));

    const locked = player();
    await handleAccountLocked('account-unlock-v2', { userId: locked.userId, locked: false, stateVersion: 2 });
    await handleAccountLocked('account-lock-v1', { userId: locked.userId, locked: true, stateVersion: 1 });
    await request(app).post('/posts').set('Authorization', locked.authorization)
      .send({ body: 'Sự kiện lock cũ không được ghi đè unlock mới' }).expect(201);
    await handleAccountLocked('account-lock-v3', { userId: locked.userId, locked: true, stateVersion: 3 });
    expect(await prisma.processedEvent.count({ where: { eventId: { in: ['account-unlock-v2', 'account-lock-v1', 'account-lock-v3'] } } })).toBe(3);
    await request(app).post('/posts').set('Authorization', locked.authorization)
      .send({ body: 'Không được đăng' }).expect(403);
  });

  it('edits and soft-removes only the author post', async () => {
    const author = player();
    const other = player();
    const post = await request(app).post('/posts').set('Authorization', author.authorization)
      .send({ body: 'Bản đầu' }).expect(201);
    await request(app).patch(`/posts/${post.body.id}`).set('Authorization', other.authorization)
      .send({ body: 'Chiếm quyền' }).expect(403);
    await request(app).patch(`/posts/${post.body.id}`).set('Authorization', author.authorization)
      .send({ body: 'Bản đã sửa' }).expect(200).expect(({ body }) => {
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
    const post = await request(app).post('/posts').set('Authorization', author.authorization)
      .send({ body: 'Bài để bình luận' }).expect(201);
    const comment = await request(app).post(`/posts/${post.body.id}/comments`).set('Authorization', other.authorization)
      .send({ body: 'Bình luận hợp lệ' }).expect(201);
    await request(app).get(`/posts/${post.body.id}`).expect(200).expect(({ body }) => {
      expect(body.comments).toEqual([expect.objectContaining({ id: comment.body.id, body: 'Bình luận hợp lệ' })]);
    });
    await request(app).delete(`/comments/${comment.body.id}`).set('Authorization', author.authorization).expect(403);
    await request(app).delete(`/comments/${comment.body.id}`).set('Authorization', other.authorization).expect(200);
    expect(await prisma.comment.findUniqueOrThrow({ where: { id: comment.body.id } })).toMatchObject({ status: 'removed' });
    await request(app).post(`/posts/${post.body.id}/comments`).set('Authorization', other.authorization)
      .send({ body: 'Không đăng được vì bài đã public nhưng comment cũ removed' }).expect(201);
    await prisma.post.update({ where: { id: post.body.id }, data: { status: 'removed' } });
    await request(app).post(`/posts/${post.body.id}/comments`).set('Authorization', other.authorization)
      .send({ body: 'Không được' }).expect(409);
  });

  it('creates one open report plus an outbox event without auto-removing its target', async () => {
    const author = player();
    const reporter = player();
    const post = await request(app).post('/posts').set('Authorization', author.authorization)
      .send({ body: 'Cần kiểm duyệt' }).expect(201);
    await request(app).post('/reports').set('Authorization', reporter.authorization)
      .send({ targetType: 'post', targetId: post.body.id, reason: 'Nội dung vi phạm' }).expect(201);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.body.id } })).toMatchObject({ status: 'published' });
    expect(await prisma.outbox.findFirstOrThrow({ where: { eventType: 'ContentReported' } })).toMatchObject({
      aggregateType: 'Report', aggregateId: expect.any(String),
    });
    await request(app).post('/reports').set('Authorization', reporter.authorization)
      .send({ targetType: 'post', targetId: post.body.id, reason: 'Lặp lại' }).expect(409);
  });

  it('lets only admin moderate reports and leaves an append-only audit', async () => {
    const author = player();
    const reporter = player();
    const moderator = admin();
    const post = await request(app).post('/posts').set('Authorization', author.authorization)
      .send({ body: 'Bài bị gỡ' }).expect(201);
    const report = await request(app).post('/reports').set('Authorization', reporter.authorization)
      .send({ targetType: 'post', targetId: post.body.id, reason: 'Vi phạm' }).expect(201);
    await request(app).post(`/admin/reports/${report.body.id}/actions`).set('Authorization', author.authorization)
      .send({ action: 'remove', reason: 'Đã xác minh' }).expect(403);
    await request(app).post(`/admin/reports/${report.body.id}/actions`).set('Authorization', moderator.authorization)
      .send({ action: 'remove', reason: 'Đã xác minh' }).expect(200);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.body.id } })).toMatchObject({ status: 'removed' });
    expect(await prisma.report.findUniqueOrThrow({ where: { id: report.body.id } })).toMatchObject({ status: 'actioned' });
    expect(await prisma.moderationAudit.findFirstOrThrow({ where: { targetId: post.body.id } })).toMatchObject({
      adminUserId: moderator.userId, action: 'remove',
    });
  });

  it('dismisses reports without changing published content', async () => {
    const author = player();
    const reporter = player();
    const moderator = admin();
    const post = await request(app).post('/posts').set('Authorization', author.authorization)
      .send({ body: 'Bài hợp lệ' }).expect(201);
    const report = await request(app).post('/reports').set('Authorization', reporter.authorization)
      .send({ targetType: 'post', targetId: post.body.id, reason: 'Nhầm' }).expect(201);
    await request(app).post(`/admin/reports/${report.body.id}/actions`).set('Authorization', moderator.authorization)
      .send({ action: 'dismiss', reason: 'Không vi phạm' }).expect(200);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.body.id } })).toMatchObject({ status: 'published' });
    expect(await prisma.report.findUniqueOrThrow({ where: { id: report.body.id } })).toMatchObject({ status: 'dismissed' });
  });

  it('lets admin temporarily hide reported content without deleting its record', async () => {
    const author = player();
    const reporter = player();
    const moderator = admin();
    const post = await request(app).post('/posts').set('Authorization', author.authorization)
      .send({ body: 'Bài cần ẩn tạm' }).expect(201);
    const report = await request(app).post('/reports').set('Authorization', reporter.authorization)
      .send({ targetType: 'post', targetId: post.body.id, reason: 'Chờ xem xét' }).expect(201);
    await request(app).get('/admin/reports').set('Authorization', moderator.authorization)
      .expect(200).expect(({ body }) => expect(body.reports).toEqual([expect.objectContaining({ id: report.body.id, status: 'open' })]));
    await request(app).post(`/admin/reports/${report.body.id}/actions`).set('Authorization', moderator.authorization)
      .send({ action: 'hide', reason: 'Ẩn tạm' }).expect(200);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.body.id } })).toMatchObject({ status: 'hidden' });
    await request(app).post(`/admin/content/post/${post.body.id}/restore`).set('Authorization', moderator.authorization)
      .send({ reason: 'Đã xem xét' }).expect(200);
    expect(await prisma.post.findUniqueOrThrow({ where: { id: post.body.id } })).toMatchObject({ status: 'published' });
    expect(await prisma.moderationAudit.findFirstOrThrow({ where: { targetId: post.body.id, action: 'restore' } }))
      .toMatchObject({ adminUserId: moderator.userId });
  });

  it('keeps tickets private, makes admin replies in-progress, and allows resolve then close', async () => {
    const requester = player();
    const stranger = player();
    const moderator = admin();
    const ticket = await request(app).post('/tickets').set('Authorization', requester.authorization)
      .send({ subject: 'Cần hỗ trợ', body: 'Mô tả vấn đề' }).expect(201).expect(({ body }) => expect(body.status).toBe('open'));
    await request(app).get('/tickets').set('Authorization', requester.authorization)
      .expect(200).expect(({ body }) => expect(body.tickets).toEqual([expect.objectContaining({ id: ticket.body.id })]));
    await request(app).get('/tickets').set('Authorization', moderator.authorization)
      .expect(200).expect(({ body }) => expect(body.tickets).toEqual([expect.objectContaining({ id: ticket.body.id })]));
    await request(app).get(`/tickets/${ticket.body.id}`).set('Authorization', stranger.authorization).expect(403);
    await request(app).post(`/tickets/${ticket.body.id}/messages`).set('Authorization', moderator.authorization)
      .send({ body: 'Admin đã tiếp nhận' }).expect(201);
    await request(app).get(`/tickets/${ticket.body.id}`).set('Authorization', requester.authorization)
      .expect(200).expect(({ body }) => {
        expect(body.status).toBe('in_progress');
        expect(body.messages).toHaveLength(2);
      });
    await request(app).post(`/tickets/${ticket.body.id}/status`).set('Authorization', moderator.authorization)
      .send({ status: 'resolved' }).expect(200).expect(({ body }) => expect(body.status).toBe('resolved'));
    await request(app).post(`/tickets/${ticket.body.id}/status`).set('Authorization', moderator.authorization)
      .send({ status: 'closed' }).expect(200).expect(({ body }) => expect(body.status).toBe('closed'));
  });
});
