import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { handleNotificationRequested } from '../src/lib/eventConsumer.js';
import { REQUIRED_EMAIL_RETRY_DELAY_MS, retryPendingRequiredEmails } from '../src/domain/notifications.js';

const userIds: string[] = [];
const sourceEventIds: string[] = [];

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { sourceEventId: { in: sourceEventIds } } });
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

async function user(roles: Array<'player' | 'admin'>) {
  const created = await prisma.user.create({ data: { email: `cm-${randomUUID()}@example.test`, roles } });
  userIds.push(created.id);
  return created;
}

const eventId = () => {
  const id = `UserNotificationRequested:${randomUUID()}`;
  sourceEventIds.push(id);
  return id;
};

const playerPayload = (userId: string) => ({
  recipient: { type: 'user', userId, targetRole: 'player' }, category: 'match', kind: 'match.result.final',
  title: 'Kết quả kèo đã chốt', body: 'Khoản giữ cho kết quả sẽ được phân bổ.', priority: 'update',
  entityType: 'match', entityId: randomUUID(), actionKind: 'match.result.view', actionExpiresAt: null, emailPolicy: 'required',
});

describe('Task 22 required in-app + email delivery', () => {
  it('projects and emails an opted-out player once, and replay neither duplicates the inbox nor the email', async () => {
    const player = await user(['player']);
    await prisma.notificationPreference.create({ data: { userId: player.id, targetRole: 'player', category: 'match', enabled: false } });
    const sender = { send: vi.fn().mockResolvedValue(undefined) };
    const id = eventId();
    const payload = playerPayload(player.id);
    await handleNotificationRequested(id, payload, sender);
    await handleNotificationRequested(id, payload, sender);
    expect(await prisma.notification.count({ where: { sourceEventId: id } })).toBe(1);
    expect(sender.send).toHaveBeenCalledOnce();
    expect(sender.send).toHaveBeenCalledWith(player.email, 'Kết quả kèo đã chốt', expect.stringContaining('Khoản giữ cho kết quả'));
    expect(await prisma.notification.findFirstOrThrow({ where: { sourceEventId: id } })).toMatchObject({ emailSentAt: expect.any(Date) });
  });

  it('keeps the durable inbox row when the email provider fails and retries only the email on redelivery', async () => {
    const player = await user(['player']);
    const failing = { send: vi.fn().mockRejectedValue(new Error('provider down')) };
    const id = eventId();
    const payload = playerPayload(player.id);
    await expect(handleNotificationRequested(id, payload, failing)).rejects.toThrow('provider down');
    const stored = await prisma.notification.findFirstOrThrow({ where: { sourceEventId: id } });
    expect(stored).toMatchObject({ emailSentAt: null, emailLastAttemptAt: expect.any(Date) });

    const working = { send: vi.fn().mockResolvedValue(undefined) };
    await handleNotificationRequested(id, payload, working);
    expect(working.send).toHaveBeenCalledOnce();
    expect(await prisma.notification.count({ where: { sourceEventId: id } })).toBe(1);
  });

  it('still emails after the event is dropped following two provider failures, with backoff', async () => {
    const player = await user(['player']);
    const failing = { send: vi.fn().mockRejectedValue(new Error('provider down')) };
    const id = eventId();
    const payload = playerPayload(player.id);
    await expect(handleNotificationRequested(id, payload, failing)).rejects.toThrow('provider down');
    await expect(handleNotificationRequested(id, payload, failing)).rejects.toThrow('provider down');
    const stored = await prisma.notification.findFirstOrThrow({ where: { sourceEventId: id } });
    const working = { send: vi.fn().mockResolvedValue(undefined) };
    // Chưa đủ giãn cách thì chưa gửi lại.
    await retryPendingRequiredEmails(working, new Date(stored.emailLastAttemptAt!.getTime() + 1_000));
    expect(working.send).not.toHaveBeenCalledWith(player.email, expect.anything(), expect.anything());
    await retryPendingRequiredEmails(working, new Date(stored.emailLastAttemptAt!.getTime() + REQUIRED_EMAIL_RETRY_DELAY_MS));
    expect(working.send).toHaveBeenCalledWith(player.email, 'Kết quả kèo đã chốt', expect.any(String));
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: stored.id } })).toMatchObject({ emailSentAt: expect.any(Date) });
    // Đã gửi thì lượt quét sau không gửi trùng.
    working.send.mockClear();
    await retryPendingRequiredEmails(working, new Date(Date.now() + 60 * 60_000));
    expect(working.send).not.toHaveBeenCalledWith(player.email, expect.anything(), expect.anything());
  });

  it('emails every admin for role recipients and sends nothing when email is not required', async () => {
    const [adminA, adminB] = [await user(['admin']), await user(['admin'])];
    const sender = { send: vi.fn().mockResolvedValue(undefined) };
    const id = eventId();
    await handleNotificationRequested(id, {
      recipient: { type: 'role', targetRole: 'admin' }, category: 'dispute', kind: 'match.result.admin_review',
      title: 'Có tranh chấp kết quả kèo cần quyết định', body: 'Hồ sơ đang chờ Admin.', priority: 'action_required',
      entityType: 'match_result_case', entityId: randomUUID(), actionKind: 'admin.match-result.review', actionExpiresAt: null, emailPolicy: 'required',
    }, sender);
    const recipients = sender.send.mock.calls.map(([to]) => to);
    expect(recipients).toEqual(expect.arrayContaining([adminA.email, adminB.email]));

    const player = await user(['player']);
    const silent = { send: vi.fn() };
    await handleNotificationRequested(eventId(), { ...playerPayload(player.id), emailPolicy: 'none' }, silent);
    expect(silent.send).not.toHaveBeenCalled();
  });
});
