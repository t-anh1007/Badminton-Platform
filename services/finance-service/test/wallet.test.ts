import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { getWalletsForUser, getWalletLedger, postLedgerEntry } from '../src/domain/wallet.js';
import { fakeUserId, seedPersonalBalance, seedBusinessBalance } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('FIN-01 — Xem số dư và lịch sử giao dịch', () => {
  it('AC-FIN-01-1: chỉ có vai player -> chỉ một số dư personal, không có ví kinh doanh', async () => {
    const userId = fakeUserId();
    await seedPersonalBalance(userId, 100000n);

    const wallets = await getWalletsForUser(userId);
    expect(wallets).toHaveLength(1);
    expect(wallets[0]!.walletType).toBe('personal');
  });

  it('AC-FIN-01-2: có cả vai provider -> hai ví tách biệt, ví kinh doanh có đủ pending/available/reserved', async () => {
    const userId = fakeUserId();
    await seedPersonalBalance(userId, 50000n);
    await seedBusinessBalance(userId, 500000n);

    const wallets = await getWalletsForUser(userId);
    expect(wallets).toHaveLength(2);
    const business = wallets.find((w) => w.walletType === 'business')!;
    expect(business).toBeTruthy();
    expect(typeof business.pending).toBe('bigint');
    expect(typeof business.available).toBe('bigint');
    expect(typeof business.reserved).toBe('bigint');
  });

  it('AC-FIN-01-3: ví có 5 bút toán -> số dư hiển thị đúng bằng after của bút toán mới nhất', async () => {
    const userId = fakeUserId();
    const wallet = await seedPersonalBalance(userId, 10000n);
    // Ghi thêm 4 bút toán nữa (tổng 5) để after cuối cùng khác biệt rõ initial.
    for (let i = 0; i < 4; i++) {
      await prisma.$transaction((tx) => postLedgerEntry(tx, { walletId: wallet.id, amount: 1000n, type: 'topup', refType: 'topup', refId: `t${i}` }));
    }

    const { wallet: freshWallet, entries } = await getWalletLedger(userId, wallet.id);
    expect(entries).toHaveLength(5);
    expect(freshWallet.available).toBe(entries[0]!.after); // mới nhất trước (desc)
  });

  it('AC-FIN-01-4: người dùng A gọi API xem ví của người dùng B -> từ chối', async () => {
    const userA = fakeUserId();
    const userB = fakeUserId();
    const walletB = await seedPersonalBalance(userB, 20000n);

    await expect(getWalletLedger(userA, walletB.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('BR-FIN-03: primitive ledger từ chối mọi bút toán làm bất kỳ phân vùng nào âm', async () => {
    const wallet = await seedBusinessBalance(fakeUserId(), 100000n);
    await expect(prisma.$transaction((tx) => postLedgerEntry(tx, {
      walletId: wallet.id, amount: -1n, type: 'payout', refType: 'withdrawal', refId: fakeUserId(), field: 'reserved',
    }))).rejects.toMatchObject({ code: 'NEGATIVE_BALANCE' });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).reserved).toBe(0n);
  });
});
