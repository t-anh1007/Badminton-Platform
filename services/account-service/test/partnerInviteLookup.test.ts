import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { handleNotificationRequested } from '../src/lib/eventConsumer.js';
import { findPlayerIdByPhone } from '../src/domain/profile.js';

// BR-CM-79, BR-CM-81: tra cứu người chơi theo SĐT và link về kèo trong email lời mời.

const userIds: string[] = [];
const sourceEventIds: string[] = [];

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { sourceEventId: { in: sourceEventIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

async function player(phone: string | null, overrides: { verified?: boolean } = {}) {
  const created = await prisma.user.create({
    data: { email: `pi-${randomUUID()}@example.test`, roles: ['player'], phone, verified: overrides.verified ?? true },
  });
  userIds.push(created.id);
  return created;
}

const uniquePhone = () => `09${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;

describe('BR-CM-79 tìm người chơi theo SĐT', () => {
  it('trả về người chơi khi đúng một tài khoản hợp lệ dùng số này', async () => {
    const phone = uniquePhone();
    const user = await player(phone);
    await player(phone, { verified: false });
    await expect(findPlayerIdByPhone(` ${phone} `)).resolves.toEqual({ userId: user.id });
  });

  it('báo PLAYER_PHONE_AMBIGUOUS khi nhiều tài khoản dùng chung số', async () => {
    const phone = uniquePhone();
    await player(phone);
    await player(phone);
    await expect(findPlayerIdByPhone(phone)).rejects.toMatchObject({ code: 'PLAYER_PHONE_AMBIGUOUS' });
  });

  it('báo PLAYER_NOT_FOUND khi không ai dùng số này', async () => {
    await expect(findPlayerIdByPhone(uniquePhone())).rejects.toMatchObject({ code: 'PLAYER_NOT_FOUND' });
  });
});

describe('BR-CM-81 email lời mời có link về kèo', () => {
  it('email bắt buộc gắn kèo chứa link đăng nhập rồi quay về kèo', async () => {
    const user = await player(null);
    const matchId = randomUUID();
    const id = `UserNotificationRequested:${randomUUID()}`;
    sourceEventIds.push(id);
    const sender = { send: vi.fn().mockResolvedValue(undefined) };
    await handleNotificationRequested(id, {
      recipient: { type: 'user', userId: user.id, targetRole: 'player' }, category: 'match', kind: 'match.partner_invited',
      title: 'Bạn được mời đánh cặp', body: 'Chủ kèo mời bạn đánh cùng đội.', priority: 'action_required',
      entityType: 'match', entityId: matchId, actionKind: 'match.view', actionExpiresAt: null, emailPolicy: 'required',
    }, sender);
    expect(sender.send).toHaveBeenCalledWith(user.email, 'Bạn được mời đánh cặp',
      expect.stringContaining(`https://courtin-web.vercel.app/auth?next=${encodeURIComponent(`/matches/${matchId}`)}`), expect.stringContaining("Mở kèo"));
  });
});
