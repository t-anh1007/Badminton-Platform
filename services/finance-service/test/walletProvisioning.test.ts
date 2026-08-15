import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { handleUserRegistered } from '../src/domain/walletProvisioning.js';
import { fakeUserId } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AC-ACC-02-5 (blocked từ G1) — Consumer UserRegistered tạo ví personal', () => {
  it('UserRegistered về -> ví personal số dư 0 được tạo cho đúng userId', async () => {
    const userId = fakeUserId();
    await handleUserRegistered(randomUUID(), { userId, email: 'player@test.com' });

    const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId, walletType: 'personal' } });
    expect(wallet.available).toBe(0n);
  });

  it('Idempotent: cùng eventId xử lý hai lần -> không tạo ví trùng', async () => {
    const userId = fakeUserId();
    const eventId = randomUUID();

    await handleUserRegistered(eventId, { userId, email: 'player2@test.com' });
    await handleUserRegistered(eventId, { userId, email: 'player2@test.com' }); // redeliver

    const wallets = await prisma.wallet.findMany({ where: { userId, walletType: 'personal' } });
    expect(wallets).toHaveLength(1);
  });
});
