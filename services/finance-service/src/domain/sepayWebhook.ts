import { prisma } from '../lib/prisma.js';
import { writeOutbox } from '../lib/outbox.js';
import { postLedgerEntry, getOrCreateWallet } from './wallet.js';
import { fetchPaymentStatus } from '../lib/venueBookingClient.js';
import { ensurePlatformWallet } from './wallet.js';
import { reserveMatchContributionFromSepay } from './matchFee.js';

export interface IncomingTransfer {
  externalRef: string;
  amount: bigint;
  rawRef: string;
}

/** FIN-02 bước 4-5, FIN-04 bước 4-6, FIN-06 — MỘT webhook "tiền vào" duy
 * nhất từ SePay, khớp theo `matchCode` để rẽ vào đúng nhánh nghiệp vụ.
 * Idempotent theo `externalRef` (mã giao dịch phía SePay, KHÔNG phải id nội
 * bộ) — BR-FIN-09, AC-FIN-02-2/04-4/06 luồng lỗi "webhook trùng -> bỏ qua". */
export async function handleIncomingTransfer(transfer: IncomingTransfer): Promise<void> {
  const already = await prisma.sepayEvent.findUnique({ where: { externalRef: transfer.externalRef } });
  if (already) return;

  const matchingIntent = await prisma.paymentIntent.findFirst({
    where: { matchCode: transfer.rawRef },
  });

  // A second real bank transfer can legitimately carry the same match code
  // after the original match-fee intent has completed or failed. It is not a
  // manual-reconciliation item: credit the payer without reopening funding.
  if (matchingIntent?.refType === 'matchFee' && matchingIntent.status !== 'pending') {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${transfer.externalRef}))) AS event_lock`;
      if (await tx.sepayEvent.findUnique({ where: { externalRef: transfer.externalRef } })) return;
      const contribution = await tx.matchContribution.findUnique({ where: { id: matchingIntent.refId } });
      if (!contribution) throw new Error('PaymentIntent matchFee contribution no longer exists');
      await creditAdditionalMatchFeeReceipt(tx, transfer, matchingIntent, contribution.id);
    });
    return;
  }

  const intent = matchingIntent?.status === 'pending' ? matchingIntent : null;

  if (!intent) {
    // AC-FIN-02-4: không khớp mã nào -> hàng chờ đối soát tay, không ví nào đổi.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${transfer.externalRef}))) AS event_lock`;
      if (await tx.sepayEvent.findUnique({ where: { externalRef: transfer.externalRef } })) return;
      await tx.sepayEvent.create({
        data: { direction: 'in', amount: transfer.amount, rawRef: transfer.rawRef, externalRef: transfer.externalRef, status: 'unmatched' },
      });
    });
    return;
  }

  if (intent.refType === 'topup') {
    await prisma.$transaction(async (tx) => {
      if (!(await lockPendingIntent(tx, intent.id, transfer))) return;
      const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
      // BR-FIN-02 luồng thay thế: ghi có ĐÚNG số tiền thực nhận, không phải
      // số đã khai (AC-FIN-02-3).
      const topupEntry = await postLedgerEntry(tx, { walletId: wallet.id, amount: transfer.amount, type: 'topup', refType: 'topup', refId: intent.id });
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'completed' } });
      const event = await tx.sepayEvent.create({
        data: {
          direction: 'in',
          amount: transfer.amount,
          rawRef: transfer.rawRef,
          externalRef: transfer.externalRef,
          status: 'matched_auto',
          matchedType: 'PaymentIntent',
          matchedId: intent.id,
        },
      });
      await tx.sepayAllocation.create({ data: { sepayEventId: event.id, kind: 'topup', amount: transfer.amount, refId: topupEntry.id } });
    });
    return;
  }

  if (intent.refType === 'matchFee') {
    const contribution = await prisma.matchContribution.findUnique({
      where: { id: intent.refId },
      include: { funding: true },
    });
    if (!contribution) throw new Error('PaymentIntent matchFee không khớp contribution');
    const expired = contribution.status !== 'pending'
      || contribution.funding.status !== 'collecting'
      || contribution.funding.cutoffAt <= new Date()
      || (contribution.expiresAt !== null && contribution.expiresAt <= new Date());
    if (expired) {
      await prisma.$transaction(async (tx) => {
        const state = await lockMatchFeeIntent(tx, intent.id, transfer);
        if (state === 'duplicate') return;
        if (state === 'terminal') {
          await creditAdditionalMatchFeeReceipt(tx, transfer, intent, contribution.id);
          return;
        }
        const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
        const entry = await postLedgerEntry(tx, {
          walletId: wallet.id,
          amount: transfer.amount,
          type: 'topup',
          refType: 'late_match_fee',
          refId: contribution.id,
        });
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'failed' } });
        await recordSepayEvent(tx, transfer, intent.id, [{ kind: 'topup', amount: transfer.amount, refId: entry.id }]);
      });
      return;
    }
    if (transfer.amount >= intent.amount) {
      await ensurePlatformWallet();
      const excess = transfer.amount - intent.amount;
      await prisma.$transaction(async (tx) => {
        const state = await lockMatchFeeIntent(tx, intent.id, transfer);
        if (state === 'duplicate') return;
        if (state === 'terminal') {
          await creditAdditionalMatchFeeReceipt(tx, transfer, intent, contribution.id);
          return;
        }
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${contribution.matchId}, 0))`;
        const freshContribution = await tx.matchContribution.findUnique({
          where: { id: contribution.id },
          include: { funding: true },
        });
        if (!freshContribution) throw new Error('PaymentIntent matchFee contribution no longer exists');
        if (await isMatchContributionNoLongerPayable(tx, freshContribution, new Date())) {
          await creditLateMatchFee(tx, transfer, intent, freshContribution.id);
          return;
        }
        await reserveMatchContributionFromSepay(tx, contribution.id, intent.id);
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'completed' } });
        let excessEntryId: string | null = null;
        if (excess > 0n) {
          const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
          const entry = await postLedgerEntry(tx, {
            walletId: wallet.id,
            amount: excess,
            type: 'topup',
            refType: 'overpay_match_fee',
            refId: contribution.id,
          });
          excessEntryId = entry.id;
        }
        await recordSepayEvent(tx, transfer, intent.id, [
          { kind: 'matchFee', amount: intent.amount, refId: contribution.id },
          ...(excessEntryId ? [{ kind: 'topup', amount: excess, refId: excessEntryId }] : []),
        ]);
      });
      return;
    }
    await prisma.$transaction(async (tx) => {
      const state = await lockMatchFeeIntent(tx, intent.id, transfer);
      if (state === 'duplicate') return;
      if (state === 'terminal') {
        await creditAdditionalMatchFeeReceipt(tx, transfer, intent, contribution.id);
        return;
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${contribution.matchId}, 0))`;
      const freshContribution = await tx.matchContribution.findUnique({
        where: { id: contribution.id },
        include: { funding: true },
      });
      if (!freshContribution) throw new Error('PaymentIntent matchFee contribution no longer exists');
      if (await isMatchContributionNoLongerPayable(tx, freshContribution, new Date())) {
        await creditLateMatchFee(tx, transfer, intent, freshContribution.id);
        return;
      }
      const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
      const entry = await postLedgerEntry(tx, {
        walletId: wallet.id,
        amount: transfer.amount,
        type: 'topup',
        refType: 'partial_match_fee',
        refId: contribution.id,
      });
      await recordSepayEvent(tx, transfer, intent.id, [{ kind: 'topup', amount: transfer.amount, refId: entry.id }]);
    });
    return;
  }

  // refType === 'booking' (FIN-04 / FIN-06)
  const status = await fetchPaymentStatus(intent.refId);

  if (!status.stillPayable) {
    // FIN-06 / AC-FIN-04-3: hold/booking đã hết hạn -> ghi có ví personal
    // TOÀN BỘ số tiền, KHÔNG phục hồi booking, KHÔNG phát PaymentCompleted.
    // refType='late_payment' để lịch sử NÊU RÕ đây là tiền về muộn (AC-FIN-06-3),
    // phân biệt với topup thường và với chuyển thiếu.
    await prisma.$transaction(async (tx) => {
      if (!(await lockPendingIntent(tx, intent.id, transfer))) return;
      const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
      const topupEntry = await postLedgerEntry(tx, { walletId: wallet.id, amount: transfer.amount, type: 'topup', refType: 'late_payment', refId: intent.refId });
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'failed' } });
      await recordSepayEvent(tx, transfer, intent.id, [{ kind: 'topup', amount: transfer.amount, refId: topupEntry.id }]);
    });
    return;
  }

  if (transfer.amount >= intent.amount) {
    // AC-FIN-04-1: đủ tiền, còn hạn -> xác nhận booking (phần đúng giá không đi
    // qua ví nào, chuyển thẳng cho booking). D24: phần THỪA (nếu chuyển dư) ghi
    // có vào ví personal — bảo toàn tiền, không để mất đối ứng (lỗi P1 Codex).
    const excess = transfer.amount - intent.amount;
    await prisma.$transaction(async (tx) => {
      if (!(await lockPendingIntent(tx, intent.id, transfer))) return;
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'completed' } });
      let excessEntryId: string | null = null;
      if (excess > 0n) {
        const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
        const entry = await postLedgerEntry(tx, { walletId: wallet.id, amount: excess, type: 'topup', refType: 'overpay', refId: intent.refId });
        excessEntryId = entry.id;
      }
      await writeOutbox(tx, {
        aggregateType: 'PaymentIntent',
        aggregateId: intent.refId,
        eventType: 'PaymentCompleted',
        payload: { bookingId: intent.refId },
      });
      await recordSepayEvent(tx, transfer, intent.id, [
        { kind: 'booking', amount: intent.amount, refId: intent.refId },
        ...(excessEntryId ? [{ kind: 'topup', amount: excess, refId: excessEntryId }] : []),
      ]);
    });
    return;
  }

  // AC-FIN-04-2: chuyển thiếu -> ghi có ví personal đúng số thực nhận, booking
  // vẫn `held`, PaymentIntent giữ nguyên `pending` (hold vẫn tiếp tục chạy).
  // refType='partial_payment' để phân biệt với topup thường và tiền về muộn.
  await prisma.$transaction(async (tx) => {
    if (!(await lockPendingIntent(tx, intent.id, transfer))) return;
    const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
    const topupEntry = await postLedgerEntry(tx, { walletId: wallet.id, amount: transfer.amount, type: 'topup', refType: 'partial_payment', refId: intent.refId });
    await recordSepayEvent(tx, transfer, intent.id, [{ kind: 'topup', amount: transfer.amount, refId: topupEntry.id }]);
  });
}

async function isMatchContributionNoLongerPayable(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  contribution: {
    status: string;
    role: string;
    matchId: string;
    expiresAt: Date | null;
    funding: { status: string; cutoffAt: Date; capacity: number };
  },
  now: Date,
) {
  const noLongerPayable = contribution.status !== 'pending'
    || contribution.funding.status !== 'collecting'
    || contribution.funding.cutoffAt <= now
    || (contribution.expiresAt !== null && contribution.expiresAt <= now);
  if (noLongerPayable || contribution.role !== 'organizer') return noLongerPayable;
  const paidParticipants = await tx.matchContribution.count({
    where: { matchId: contribution.matchId, role: 'participant', status: 'paid' },
  });
  return paidParticipants !== contribution.funding.capacity - 1;
}

async function creditLateMatchFee(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  transfer: IncomingTransfer,
  intent: { id: string; userId: string },
  contributionId: string,
): Promise<void> {
  const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
  const entry = await postLedgerEntry(tx, {
    walletId: wallet.id,
    amount: transfer.amount,
    type: 'topup',
    refType: 'late_match_fee',
    refId: contributionId,
  });
  await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'failed' } });
  await recordSepayEvent(tx, transfer, intent.id, [{ kind: 'topup', amount: transfer.amount, refId: entry.id }]);
}

async function creditAdditionalMatchFeeReceipt(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  transfer: IncomingTransfer,
  intent: { id: string; userId: string },
  contributionId: string,
): Promise<void> {
  const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
  const entry = await postLedgerEntry(tx, {
    walletId: wallet.id,
    amount: transfer.amount,
    type: 'topup',
    refType: 'late_match_fee',
    refId: contributionId,
  });
  await recordSepayEvent(tx, transfer, intent.id, [{ kind: 'topup', amount: transfer.amount, refId: entry.id }]);
}

async function lockMatchFeeIntent(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  intentId: string,
  transfer: IncomingTransfer,
): Promise<'pending' | 'terminal' | 'duplicate'> {
  await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${transfer.externalRef}))) AS event_lock`;
  if (await tx.sepayEvent.findUnique({ where: { externalRef: transfer.externalRef } })) return 'duplicate';
  await tx.$queryRaw`SELECT id FROM payment_intents WHERE id = ${intentId} FOR UPDATE`;
  const fresh = await tx.paymentIntent.findUnique({ where: { id: intentId } });
  if (!fresh || fresh.refType !== 'matchFee') throw new Error('PaymentIntent matchFee no longer exists');
  return fresh.status === 'pending' ? 'pending' : 'terminal';
}

async function lockPendingIntent(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  intentId: string,
  transfer: IncomingTransfer,
): Promise<boolean> {
  await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${transfer.externalRef}))) AS event_lock`;
  if (await tx.sepayEvent.findUnique({ where: { externalRef: transfer.externalRef } })) return false;
  await tx.$queryRaw`SELECT id FROM payment_intents WHERE id = ${intentId} FOR UPDATE`;
  const fresh = await tx.paymentIntent.findUnique({ where: { id: intentId } });
  if (fresh?.status === 'pending') return true;
  // Một giao dịch ngân hàng khác thật sự dùng lại mã đã hoàn tất: không được
  // bỏ qua, cũng không được xử lý lần hai; đưa vào FIN-14 để hoàn về đúng người.
  await tx.sepayEvent.create({
    data: { direction: 'in', amount: transfer.amount, rawRef: transfer.rawRef, externalRef: transfer.externalRef, status: 'unmatched' },
  });
  return false;
}

/** Ghi một SepayEvent đã khớp tự động — gom lại vì lặp ở mọi nhánh webhook. */
async function recordSepayEvent(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  transfer: IncomingTransfer,
  intentId: string,
  allocations: Array<{ kind: string; amount: bigint; refId: string }>,
): Promise<void> {
  const event = await tx.sepayEvent.create({
    data: {
      direction: 'in',
      amount: transfer.amount,
      rawRef: transfer.rawRef,
      externalRef: transfer.externalRef,
      status: 'matched_auto',
      matchedType: 'PaymentIntent',
      matchedId: intentId,
    },
  });
  await tx.sepayAllocation.createMany({
    data: allocations.map((allocation) => ({ ...allocation, sepayEventId: event.id })),
  });
}
