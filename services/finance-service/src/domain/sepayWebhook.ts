import { prisma } from '../lib/prisma.js';
import { writeOutbox } from '../lib/outbox.js';
import { postLedgerEntry, getOrCreateWallet } from './wallet.js';
import { fetchPaymentStatus } from '../lib/venueBookingClient.js';

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

  const intent = await prisma.paymentIntent.findFirst({
    where: { matchCode: transfer.rawRef, status: 'pending' },
  });

  if (!intent) {
    // AC-FIN-02-4: không khớp mã nào -> hàng chờ đối soát tay, không ví nào đổi.
    await prisma.sepayEvent.create({
      data: { direction: 'in', amount: transfer.amount, rawRef: transfer.rawRef, externalRef: transfer.externalRef, status: 'unmatched' },
    });
    return;
  }

  if (intent.refType === 'topup') {
    await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
      // BR-FIN-02 luồng thay thế: ghi có ĐÚNG số tiền thực nhận, không phải
      // số đã khai (AC-FIN-02-3).
      await postLedgerEntry(tx, { walletId: wallet.id, amount: transfer.amount, type: 'topup', refType: 'topup', refId: intent.id });
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'completed' } });
      await tx.sepayEvent.create({
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
      const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
      await postLedgerEntry(tx, { walletId: wallet.id, amount: transfer.amount, type: 'topup', refType: 'late_payment', refId: intent.refId });
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'failed' } });
      await recordSepayEvent(tx, transfer, intent.id);
    });
    return;
  }

  if (transfer.amount >= intent.amount) {
    // AC-FIN-04-1: đủ tiền, còn hạn -> xác nhận booking (phần đúng giá không đi
    // qua ví nào, chuyển thẳng cho booking). D24: phần THỪA (nếu chuyển dư) ghi
    // có vào ví personal — bảo toàn tiền, không để mất đối ứng (lỗi P1 Codex).
    const excess = transfer.amount - intent.amount;
    await prisma.$transaction(async (tx) => {
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'completed' } });
      if (excess > 0n) {
        const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
        await postLedgerEntry(tx, { walletId: wallet.id, amount: excess, type: 'topup', refType: 'overpay', refId: intent.refId });
      }
      await writeOutbox(tx, {
        aggregateType: 'PaymentIntent',
        aggregateId: intent.refId,
        eventType: 'PaymentCompleted',
        payload: { bookingId: intent.refId },
      });
      await recordSepayEvent(tx, transfer, intent.id);
    });
    return;
  }

  // AC-FIN-04-2: chuyển thiếu -> ghi có ví personal đúng số thực nhận, booking
  // vẫn `held`, PaymentIntent giữ nguyên `pending` (hold vẫn tiếp tục chạy).
  // refType='partial_payment' để phân biệt với topup thường và tiền về muộn.
  await prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(tx, intent.userId, 'personal');
    await postLedgerEntry(tx, { walletId: wallet.id, amount: transfer.amount, type: 'topup', refType: 'partial_payment', refId: intent.refId });
    await recordSepayEvent(tx, transfer, intent.id);
  });
}

/** Ghi một SepayEvent đã khớp tự động — gom lại vì lặp ở mọi nhánh webhook. */
async function recordSepayEvent(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  transfer: IncomingTransfer,
  intentId: string,
): Promise<void> {
  await tx.sepayEvent.create({
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
}
