import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export interface RegisterProviderInput {
  orgName: string;
  contact?: unknown;
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

/** VEN-02 (phần venue-booking-service) — Duyệt hồ sơ (AC-VEN-02-1 phần trạng thái).
 *
 * CHƯA cộng vai `provider` cho tài khoản, CHƯA tạo ví `business` — hai việc đó
 * đòi hỏi sửa account-service/finance-service ngoài scope boundary G2 đã ghi ở
 * phase-1-handoff.md, và cần thêm sự kiện `ProviderApproved` chưa có trong
 * catalog kiến trúc (system-architecture.md §6.3). Đã hỏi Codex (xem
 * chat/progress log) và đang CHỜ PO XÁC NHẬN phạm vi trước khi thêm event mới +
 * sửa account-service. AC-VEN-02-1 (đầy đủ) và AC-VEN-02-4 đánh dấu `blocked`
 * trong test ledger cho tới khi có xác nhận.
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
  await prisma.provider.update({
    where: { id: providerId },
    data: { status: 'approved', decisionReason: null, decidedAt: new Date() },
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
