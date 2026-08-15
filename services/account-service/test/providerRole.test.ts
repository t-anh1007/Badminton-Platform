import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { grantProviderRole } from '../src/domain/providerRole.js';
import { uniqueEmail, VALID_PASSWORD } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

async function createPlayer() {
  return prisma.user.create({
    data: { email: uniqueEmail('prov'), passwordHash: VALID_PASSWORD, roles: ['player'], verified: true },
  });
}

describe('AC-VEN-02-1/02-4 (D25) — Consumer ProviderApproved cộng vai provider', () => {
  it('Duyệt NCC -> tài khoản được cộng vai `provider`, giữ nguyên `player`', async () => {
    const user = await createPlayer();

    await grantProviderRole(randomUUID(), { providerId: randomUUID(), userId: user.id });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.roles).toContain('player'); // D3: vai trò là tập hợp, không thay thế
    expect(updated.roles).toContain('provider');
  });

  it('Idempotent: cùng eventId hai lần -> không nhân đôi vai, không lỗi', async () => {
    const user = await createPlayer();
    const eventId = randomUUID();

    await grantProviderRole(eventId, { providerId: randomUUID(), userId: user.id });
    await grantProviderRole(eventId, { providerId: randomUUID(), userId: user.id }); // redeliver

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.roles.filter((r) => r === 'provider')).toHaveLength(1);
  });

  it('Đã có vai provider từ trước -> cộng lại không đổi gì (hợp tập)', async () => {
    const user = await prisma.user.create({
      data: { email: uniqueEmail('prov2'), passwordHash: VALID_PASSWORD, roles: ['player', 'provider'], verified: true },
    });

    await grantProviderRole(randomUUID(), { providerId: randomUUID(), userId: user.id });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.roles.filter((r) => r === 'provider')).toHaveLength(1);
  });
});
