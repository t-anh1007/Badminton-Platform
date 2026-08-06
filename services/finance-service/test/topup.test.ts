import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { createTopupIntent } from '../src/domain/topup.js';
import { handleIncomingTransfer } from '../src/domain/sepayWebhook.js';
import { getWalletsForUser } from '../src/domain/wallet.js';
import { fakeUserId } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('FIN-02 — Nạp số dư qua SePay', () => {
  it('AC-FIN-02-1: webhook 200k đúng mã nội dung -> ví personal tăng 200k, một bút toán topup được ghi', async () => {
    const userId = fakeUserId();
    const { matchCode } = await createTopupIntent(userId, 200000n);

    await handleIncomingTransfer({ externalRef: randomUUID(), amount: 200000n, rawRef: matchCode });

    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(200000n);
    const entries = await prisma.ledgerEntry.findMany({ where: { walletId: wallet!.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.type).toBe('topup');
  });

  it('AC-FIN-02-2 [idempotent]: cùng webhook gửi lại lần hai -> không bút toán thứ hai, số dư không đổi', async () => {
    const userId = fakeUserId();
    const { matchCode } = await createTopupIntent(userId, 200000n);
    const externalRef = randomUUID();

    await handleIncomingTransfer({ externalRef, amount: 200000n, rawRef: matchCode });
    await handleIncomingTransfer({ externalRef, amount: 200000n, rawRef: matchCode }); // redeliver

    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(200000n);
    const entries = await prisma.ledgerEntry.findMany({ where: { walletId: wallet!.id } });
    expect(entries).toHaveLength(1);
  });

  it('AC-FIN-02-3: khai nạp 200k nhưng chuyển thực tế 150k -> ví ghi có đúng 150k', async () => {
    const userId = fakeUserId();
    const { matchCode } = await createTopupIntent(userId, 200000n);

    await handleIncomingTransfer({ externalRef: randomUUID(), amount: 150000n, rawRef: matchCode });

    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(150000n);
  });

  it('AC-FIN-02-4: webhook có nội dung không khớp mã nào -> không ví nào đổi, vào hàng chờ đối soát', async () => {
    const externalRef = randomUUID();
    await handleIncomingTransfer({ externalRef, amount: 100000n, rawRef: 'KLTKHONGKHOP' });

    const event = await prisma.sepayEvent.findUniqueOrThrow({ where: { externalRef } });
    expect(event.status).toBe('unmatched');
  });
});
