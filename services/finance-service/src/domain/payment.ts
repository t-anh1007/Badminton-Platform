import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';
import { postLedgerEntry } from './wallet.js';
import { fetchPaymentStatus } from '../lib/venueBookingClient.js';

function generateMatchCode(): string {
  return `KLT${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/** FIN-03 — Thanh toán booking bằng số dư (AC-FIN-03-1..4). Toàn bộ kiểm
 * tra + ghi bút toán + phát PaymentCompleted trong MỘT transaction — số dư
 * không đổi nếu bất kỳ bước nào từ chối (AC-03-2/3/4). */
export async function payBookingWithBalance(userId: string, bookingId: string): Promise<void> {
  const status = await fetchPaymentStatus(bookingId);
  if (status.userId !== userId) {
    throw new AppError('FORBIDDEN', 'Không phải booking của bạn.', 403);
  }
  if (!status.stillPayable) {
    throw new AppError('HOLD_EXPIRED', 'Hold đã hết hạn, không thể thanh toán.', 409); // AC-03-4
  }
  const gross = BigInt(status.gross);

  // AC-03-3: CHỈ ví personal — không có nhánh nào ở đây chạm ví business,
  // nên "trả bằng ví business" không có đường đi hợp lệ tới hàm này (ranh
  // giới ADR 0003 giữ nguyên bằng thiết kế, không phải kiểm tra runtime).
  const walletRef = await prisma.wallet.findFirst({ where: { userId, walletType: 'personal' } });
  if (!walletRef) {
    throw new AppError('INSUFFICIENT_BALANCE', 'Số dư không đủ.', 402); // chưa có ví -> coi như 0đ
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Khóa ví + ĐỌC LẠI số dư TRONG transaction rồi mới kiểm — số dư đọc
      // ngoài tx có thể cũ (một giao dịch khác vừa trừ). postLedgerEntry đã
      // SELECT FOR UPDATE, nên đọc sau đó là số dư mới nhất, đã khóa.
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${walletRef.id} FOR UPDATE`;
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletRef.id } });
      if (wallet.available < gross) {
        throw new AppError('INSUFFICIENT_BALANCE', 'Số dư không đủ.', 402); // AC-03-2, BR-FIN-03
      }
      await postLedgerEntry(tx, {
        walletId: wallet.id,
        amount: -gross,
        type: 'payment',
        refType: 'booking',
        refId: bookingId,
        referenceSummary: { kind: 'booking', title: 'Thanh toán đặt sân' },
      });
      await writeOutbox(tx, {
        aggregateType: 'PaymentIntent',
        aggregateId: bookingId,
        eventType: 'PaymentCompleted',
        payload: { bookingId },
      });
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Unique index `ledger_payment_once` vi phạm = đã có bút toán payment cho
    // booking này (double-pay đồng thời) — coi như đã trả, không phát
    // PaymentCompleted lần hai, không trừ tiền lần hai.
    if (isUniqueViolation(err, 'ledger_payment_once')) {
      throw new AppError('ALREADY_PAID', 'Booking này đã được thanh toán.', 409);
    }
    throw err;
  }
}

/** Prisma bọc lỗi unique_violation Postgres (23505) — nhận diện theo tên index
 * để phân biệt double-pay với lỗi khác. */
function isUniqueViolation(err: unknown, indexName: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const message = String((err as { message?: string }).message ?? '');
  const code = (err as { code?: string }).code;
  return code === 'P2002' || message.includes('23505') || message.includes(indexName);
}

/** FIN-04 bước 1 — Tạo PaymentIntent SePay gắn với booking, sinh mã nội
 * dung. Chỉ chủ booking (kiểm qua payment-status trả về userId). */
export async function createBookingSepayIntent(userId: string, bookingId: string) {
  const status = await fetchPaymentStatus(bookingId);
  if (status.userId !== userId) {
    throw new AppError('FORBIDDEN', 'Không phải booking của bạn.', 403);
  }
  if (!status.stillPayable) {
    throw new AppError('HOLD_EXPIRED', 'Hold đã hết hạn, không thể thanh toán.', 409);
  }
  const matchCode = generateMatchCode();
  const intent = await prisma.paymentIntent.create({
    data: {
      userId,
      amount: BigInt(status.gross),
      method: 'sepay',
      refType: 'booking',
      refId: bookingId,
      matchCode,
    },
  });
  return { intentId: intent.id, matchCode, amount: status.gross };
}
