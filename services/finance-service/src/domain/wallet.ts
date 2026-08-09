import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

/** Tạo ví — dùng chung cho ví personal (AC-ACC-02-5, userId bắt buộc) và ví
 * platform (D16, userId null, tạo thủ công/seed — ngoài phạm vi G4). */
export async function getOrCreateWallet(
  tx: Prisma.TransactionClient,
  userId: string | null,
  walletType: 'personal' | 'business' | 'platform',
) {
  const existing = await tx.wallet.findFirst({ where: { userId, walletType } });
  if (existing) return existing;
  return tx.wallet.create({ data: { userId, walletType, available: 0n } });
}

/** D16: tạo ví platform singleton trước transaction doanh thu. Partial unique
 * index `wallets_platform_singleton` là chốt cuối cùng khi hai BookingConfirmed
 * đầu tiên đến đồng thời; sau P2002, transaction tạo ví đã kết thúc nên có thể
 * đọc lại an toàn bằng Prisma client mới. */
export async function ensurePlatformWallet() {
  const existing = await prisma.wallet.findFirst({ where: { userId: null, walletType: 'platform' } });
  if (existing) return existing;

  try {
    return await prisma.wallet.create({ data: { userId: null, walletType: 'platform', available: 0n } });
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    return prisma.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } });
  }
}

/** FIN-01 — Xem số dư ví của chính mình (AC-FIN-01-1..4). Trả về cả ví
 * personal lẫn business nếu có (một user có thể có cả hai — BR-FIN, D3). */
export async function getWalletsForUser(userId: string) {
  return prisma.wallet.findMany({ where: { userId }, orderBy: { walletType: 'asc' } });
}

/** AC-FIN-01-2/3: lịch sử giao dịch của MỘT ví cụ thể, mới nhất trước. Kiểm
 * tra quyền sở hữu ở đây (không phải ví của mình -> từ chối). */
export async function getWalletLedger(userId: string, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet || wallet.userId !== userId) {
    throw new AppError('FORBIDDEN', 'Không có quyền xem ví này.', 403);
  }
  const entries = await prisma.ledgerEntry.findMany({
    where: { walletId },
    orderBy: { ts: 'desc' },
  });
  return { wallet, entries };
}

/** Ghi một bút toán ledger + cập nhật số dư `available` của ví TRONG CÙNG
 * transaction — mọi thay đổi số dư trong G4 đều phải đi qua hàm này để đảm
 * bảo before/after luôn khớp (đối tượng kiểm chứng trực tiếp trên
 * LEDGER_ENTRY theo yêu cầu PO, không chỉ số dư hiển thị). */
export async function postLedgerEntry(
  tx: Prisma.TransactionClient,
  params: {
    walletId: string;
    amount: bigint;
    type: 'topup' | 'payment' | 'refund' | 'payout' | 'commission' | 'release' | 'reserve' | 'settlement';
    refType: string;
    refId: string;
    /** ADR 0003 + BR-FIN-16: doanh thu chủ sân (`release`) đọng ở `pending`
     * của ví business chờ hết cửa sổ tranh chấp — mọi bút toán khác đi thẳng
     * `available`. `before`/`after` LUÔN phản ánh field bị đổi thật sự. */
    field?: 'available' | 'pending' | 'reserved';
  },
) {
  const field = params.field ?? 'available';
  // KHÓA hàng ví (SELECT ... FOR UPDATE) TRƯỚC khi đọc số dư — chống race
  // read-modify-write: hai transaction đồng thời trên cùng ví sẽ tuần tự hóa
  // qua khóa này thay vì cùng đọc số dư cũ rồi ghi đè nhau làm mất bút toán
  // (lỗi P1 Codex bắt ở G4). Prisma không có API FOR UPDATE nên dùng $queryRaw.
  await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${params.walletId} FOR UPDATE`;
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: params.walletId } });
  const before = field === 'pending' ? wallet.pending : field === 'reserved' ? wallet.reserved : wallet.available;
  const after = before + params.amount;
  if (after < 0n) throw new AppError('NEGATIVE_BALANCE', 'Số dư ví không thể âm.', 409);
  await tx.wallet.update({ where: { id: wallet.id }, data: { [field]: after } });
  return tx.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      amount: params.amount,
      type: params.type,
      refType: params.refType,
      refId: params.refId,
      before,
      after,
    },
  });
}
