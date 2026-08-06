import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { lockCourtSchedule } from '../lib/courtScheduleLock.js';

const HOLD_DURATION_MS = 10 * 60_000; // BR-BOK-02

/** Postgres báo exclusion_violation (mã 23P01) khi INSERT vi phạm EXCLUDE
 * constraint (holds_no_overlap) — đây CHÍNH LÀ cơ chế chống đua thật ở tầng
 * CSDL mà BR-BOK-03 yêu cầu, không phải suy luận ở tầng ứng dụng. */
function isExclusionViolation(err: unknown): boolean {
  // Prisma bọc lỗi Postgres 23P01 (exclusion_violation) trong
  // PrismaClientUnknownRequestError — KHÔNG có field .code như P2002 (unique),
  // nên không được dùng "'code' in err" làm điều kiện bắt buộc (đã tự bắt lỗi
  // này khi test đồng thời AC-BOK-06-2: mọi rejection rơi vào nhánh `throw err`
  // thay vì SLOT_ON_HOLD). Chỉ cần kiểm message chứa mã lỗi hoặc tên ràng buộc.
  if (typeof err !== 'object' || err === null) return false;
  const message = String((err as { message?: string }).message ?? '');
  return (
    message.includes('23P01') ||
    message.toLowerCase().includes('exclusion constraint') ||
    message.includes('holds_no_overlap')
  );
}

export interface CreateHoldInput {
  courtId: string;
  startAt: Date;
  endAt: Date;
}

/** BOK-06 — Giữ slot trong 10 phút (AC-BOK-06-1..5). Chống đua THẬT bằng
 * EXCLUDE constraint ở CSDL (migration g3_hold_exclude_constraint) — không
 * chỉ kiểm tra ở tầng ứng dụng (đúng yêu cầu BR-BOK-03 + Stop/pause của G3). */
export async function createHold(userId: string, input: CreateHoldInput) {
  if (input.startAt.getTime() < Date.now()) {
    throw new AppError('SLOT_IN_PAST', 'Không thể giữ chỗ cho khung giờ đã qua.', 400); // BR-BOK-11
  }
  if (input.startAt.getTime() >= input.endAt.getTime()) {
    throw new AppError('INVALID_RANGE', 'Giờ kết thúc phải sau giờ bắt đầu.', 400);
  }

  // BR-BOK-01: "Chỉ cơ sở thỏa BR-VEN-03 mới xuất hiện trong tìm kiếm VÀ MỚI
  // ĐẶT ĐƯỢC." Hoàn thành AC-ACC-08-4 (blocked từ G1): NCC bị khóa ->
  // provider.status=suspended (consumer AccountLocked, G2) -> chặn ngay tại
  // bước sớm nhất của luồng đặt sân (giữ chỗ), không chỉ ẩn khỏi tìm kiếm.
  const court = await prisma.court.findUniqueOrThrow({
    where: { id: input.courtId },
    include: { venue: { include: { provider: true } } },
  });
  if (court.venue.provider.status !== 'approved') {
    throw new AppError('VENUE_NOT_AVAILABLE', 'Cơ sở hiện không khả dụng để đặt sân.', 403);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      await lockCourtSchedule(tx, input.courtId);

      // Reap hold hết hạn của CHÍNH sân này — giữ đúng nghĩa cho EXCLUDE
      // constraint vô điều kiện (xem migration): mọi dòng còn lại trong bảng
      // đều là hold hiệu lực.
      await tx.hold.deleteMany({ where: { courtId: input.courtId, expiresAt: { lte: now } } });

      // A-BOK-01: một người chơi tối đa MỘT hold đang hoạt động — giải
      // phóng hold cũ (bất kỳ sân nào) TRONG CÙNG giao dịch (AC-BOK-06-4).
      await tx.hold.deleteMany({ where: { userId } });

      // AC-BOK-06-5: đã có booking confirmed trùng slot -> từ chối. EXCLUDE
      // constraint của bảng booking không chặn được Hold (khác bảng), nên
      // kiểm tra + khóa tường minh ở đây (đúng "ràng buộc CSDL CỘNG khóa" của
      // BR-BOK-03).
      const overlappingBooking = await tx.booking.findFirst({
        where: {
          courtId: input.courtId,
          status: 'confirmed',
          startAt: { lt: input.endAt },
          endAt: { gt: input.startAt },
        },
      });
      if (overlappingBooking) {
        throw new AppError('SLOT_ALREADY_BOOKED', 'Slot đã có booking xác nhận.', 409);
      }

      const expiresAt = new Date(now.getTime() + HOLD_DURATION_MS);
      // INSERT này chính là điểm Postgres kiểm tra EXCLUDE constraint —
      // nếu một giao dịch khác đã commit một hold chồng lấn, câu lệnh này
      // ném exclusion_violation, bắt ở catch bên dưới.
      return await tx.hold.create({
        data: { courtId: input.courtId, startAt: input.startAt, endAt: input.endAt, userId, expiresAt },
      });
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (isExclusionViolation(err)) {
      throw new AppError('SLOT_ON_HOLD', 'Slot vừa có người khác giữ chỗ.', 409);
    }
    throw err;
  }
}

/** Dọn hold hết hạn — dùng cho tác vụ nền định kỳ (AC-BOK-06-3) và cho các
 * truy vấn lịch trống muốn "nhìn thấy" trạng thái mới nhất ngay lập tức
 * (isRangeFree đã tự loại hold hết hạn qua điều kiện expiresAt>now trong
 * WHERE, nên việc dọn ở đây chỉ để giữ bảng gọn, không ảnh hưởng tính đúng). */
export async function reapExpiredHolds(): Promise<number> {
  const result = await prisma.hold.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return result.count;
}
