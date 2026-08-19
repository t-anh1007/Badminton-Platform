import { prisma } from '../lib/prisma.js';
import { DEMO_USER_ID, DEMO_IDS } from '@khoaluantn/shared';
import type { LedgerEntryType } from '@prisma/client';

/** Seed ví demo + lịch sử giao dịch. Số dư CHỈ đến từ chuỗi bút toán ledger
 * nối before→after (append-only, bảo toàn giá trị) — không set thẳng available
 * ngoài giá trị `after` cuối cùng của chuỗi. Idempotent theo id bút toán cố định. */
const LEDGER_PREFIX = '00000000-0000-4000-8000-0000000d38';
const lid = (n: number): string => `${LEDGER_PREFIX}${n.toString().padStart(2, '0')}`;

interface Step { id: string; amount: bigint; type: LedgerEntryType; refType: string; refId: string; summary: string }

async function main(): Promise<void> {
  const wallet = await prisma.wallet.upsert({
    where: { userId_walletType: { userId: DEMO_USER_ID, walletType: 'personal' } },
    create: { userId: DEMO_USER_ID, walletType: 'personal', available: 0n },
    update: {},
  });

  // Chuỗi giao dịch mẫu: nạp → thanh toán 3 booking → hoàn 1 booking hủy.
  const steps: Step[] = [
    { id: lid(1), amount: 500_000n, type: 'topup', refType: 'topup', refId: 'demo-topup-1', summary: 'Nạp ví qua SePay (demo)' },
    { id: lid(2), amount: -120_000n, type: 'payment', refType: 'booking', refId: DEMO_IDS.bookingUpcoming, summary: 'Thanh toán đặt sân (sắp tới)' },
    { id: lid(3), amount: -100_000n, type: 'payment', refType: 'booking', refId: DEMO_IDS.bookingPast, summary: 'Thanh toán đặt sân (đã qua)' },
    { id: lid(4), amount: -80_000n, type: 'payment', refType: 'booking', refId: DEMO_IDS.bookingCancelled, summary: 'Thanh toán đặt sân (đã hủy)' },
    { id: lid(5), amount: 80_000n, type: 'refund', refType: 'booking', refId: DEMO_IDS.bookingCancelled, summary: 'Hoàn tiền hủy sân (100%)' },
  ];

  let balance = 0n;
  await prisma.$transaction(async (tx) => {
    for (const step of steps) {
      const before = balance;
      const after = before + step.amount;
      balance = after;
      await tx.ledgerEntry.upsert({
        where: { id: step.id },
        create: { id: step.id, walletId: wallet.id, amount: step.amount, type: step.type, refType: step.refType, refId: step.refId, referenceSummary: { note: step.summary }, before, after },
        update: { amount: step.amount, before, after, referenceSummary: { note: step.summary } },
      });
    }
    // available = `after` cuối chuỗi (dẫn xuất từ ledger, không phải gán tùy ý).
    await tx.wallet.update({ where: { id: wallet.id }, data: { available: balance } });
  });

  console.log('[seed:demo][finance] wallet personal + 5 ledger entries ready, balance =', balance.toString());
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => { console.error('[seed:demo][finance]', err); await prisma.$disconnect(); process.exit(1); });
