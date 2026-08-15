import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';

export interface RegisterProviderInput {
  orgName: string;
  contact?: { contact?: string; email?: string; phone?: string };
}

export function listProviders(status?: 'pending' | 'approved' | 'rejected' | 'suspended') {
  return prisma.provider.findMany({ where: status ? { status } : undefined, orderBy: { id: 'asc' } });
}

export async function getProviderSelf(userId: string) {
  const provider = await prisma.provider.findFirst({
    where: { userId },
    select: { id: true, orgName: true, contact: true, status: true, decisionReason: true, decidedAt: true },
  });
  return provider;
}

/** VEN-01 — Đăng ký nhà cung cấp sân (AC-VEN-01-1..3).
 *
 * AC-VEN-01-4 (chưa xác minh email -> từ chối) được bảo đảm Ở TẦNG KHÁC, không
 * phải trong hàm này: venue-booking-service không thể tự kiểm tra
 * `User.verified` (schema account, cấm truy vấn chéo — D17). Nhưng
 * account-service/src/domain/session.ts (G1, AC-ACC-03-2) đã chặn: tài khoản
 * `verified=false` không đăng nhập được, nên KHÔNG THỂ có access token hợp lệ.
 * Route `/providers` đòi `requireAuth` — một request không có token hợp lệ bị
 * chặn ở tầng middleware trước khi vào tới hàm này, nên "chưa xác minh" không
 * bao giờ tới được đây. Test ở test/provider.test.ts xác nhận middleware chặn
 * request không có token hợp lệ.
 */
export async function registerProvider(userId: string, input: RegisterProviderInput) {
  if (!input.orgName.trim()) {
    throw new AppError('ORG_NAME_REQUIRED', 'Tên tổ chức không được để trống.', 400);
  }

  const existing = await prisma.provider.findFirst({ where: { userId } });

  if (!existing) {
    return prisma.provider.create({
      data: { userId, orgName: input.orgName, contact: input.contact as never, status: 'pending' },
    });
  }

  if (existing.status === 'rejected') {
    // AC-VEN-01-3: nộp lại — CHÍNH hồ sơ đó quay về pending, không tạo bản ghi mới.
    return prisma.provider.update({
      where: { id: existing.id },
      data: {
        orgName: input.orgName,
        contact: input.contact as never,
        status: 'pending',
        decisionReason: null,
        decidedByUserId: null,
        decidedAt: null,
      },
    });
  }

  // AC-VEN-01-2: đã có hồ sơ pending/approved/suspended -> từ chối, không tạo bản ghi thứ hai.
  throw new AppError(
    'PROVIDER_PROFILE_EXISTS',
    `Bạn đã có hồ sơ nhà cung cấp ở trạng thái "${existing.status}".`,
    409,
    { status: existing.status },
  );
}

/** VEN-02 (phần venue-booking-service) — Duyệt hồ sơ (AC-VEN-02-1..4).
 *
 * D25 (PO chốt 2026-08-06): phát `ProviderApproved{providerId, userId}` qua
 * Outbox trong CÙNG transaction với việc chuyển status -> approved. finance-
 * service tiêu thụ để tạo ví `business` rỗng; account-service tiêu thụ để cộng
 * vai `provider` cho tài khoản. Đóng dứt điểm AC-VEN-02-1/02-4 (treo từ G2).
 * venue-booking-service KHÔNG tự đụng schema account/finance (D17) — chỉ phát
 * sự kiện, mỗi service tự xử lý phần của mình.
 */
export async function approveProvider(providerId: string): Promise<void> {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
  if (provider.status !== 'pending') {
    throw new AppError(
      'NOT_PENDING',
      `Hồ sơ hiện ở trạng thái "${provider.status}", không phải "pending".`,
      409,
      { status: provider.status },
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.provider.update({
      where: { id: providerId },
      data: { status: 'approved', decisionReason: null, decidedAt: new Date() },
    });
    await writeOutbox(tx, {
      aggregateType: 'Provider',
      aggregateId: providerId,
      eventType: 'ProviderApproved',
      payload: { providerId, userId: provider.userId },
    });
  });
}

/** VEN-02 — Từ chối hồ sơ (AC-VEN-02-2..3). */
export async function rejectProvider(providerId: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new AppError('REASON_REQUIRED', 'Phải nhập lý do khi từ chối hồ sơ.', 400);
  }
  const provider = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
  if (provider.status !== 'pending') {
    throw new AppError(
      'NOT_PENDING',
      `Hồ sơ hiện ở trạng thái "${provider.status}", không phải "pending".`,
      409,
      { status: provider.status },
    );
  }
  await prisma.provider.update({
    where: { id: providerId },
    data: { status: 'rejected', decisionReason: reason, decidedAt: new Date() },
  });
}
