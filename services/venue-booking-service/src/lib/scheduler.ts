import { reapExpiredHolds } from '../domain/hold.js';
import { reapExpiredHeldBookings } from '../domain/booking.js';

/** Tác vụ nền định kỳ: dọn HOLD hết hạn (BR-BOK-02, AC-BOK-06-3) và chuyển
 * booking `held` quá hạn -> `cancelled` (AC-BOK-07-5). Trước G4-fix hai hàm này
 * CHỈ được gọi trong test — booking không thanh toán sẽ kẹt `held` vô thời hạn
 * ở runtime (lỗi P1 Codex). Đăng ký ở đây để chạy thật khi service khởi động. */
export function startReapScheduler(intervalMs = 30_000): () => void {
  const tick = async () => {
    try {
      await reapExpiredHolds();
      await reapExpiredHeldBookings();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[reap-scheduler] error:', err);
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  void tick();
  return () => clearInterval(timer);
}
