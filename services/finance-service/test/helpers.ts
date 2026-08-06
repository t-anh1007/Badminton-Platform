import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { getOrCreateWallet, postLedgerEntry } from '../src/domain/wallet.js';

export function fakeUserId(): string {
  return randomUUID();
}

/** Test-only: nạp thẳng số dư ví personal, bỏ qua luồng SePay thật (FIN-02
 * đã tự có test riêng cho chính luồng đó) — dùng làm fixture cho FIN-03/04/06. */
export async function seedPersonalBalance(userId: string, amount: bigint) {
  return prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(tx, userId, 'personal');
    await postLedgerEntry(tx, { walletId: wallet.id, amount, type: 'topup', refType: 'topup', refId: 'seed' });
    return tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  });
}

export async function seedBusinessBalance(userId: string, amount: bigint) {
  return prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(tx, userId, 'business');
    await postLedgerEntry(tx, { walletId: wallet.id, amount, type: 'topup', refType: 'topup', refId: 'seed' });
    return tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  });
}

export async function waitFor<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 8000, intervalMs = 150): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  for (;;) {
    last = await fn();
    if (predicate(last)) return last;
    if (Date.now() > deadline) throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
