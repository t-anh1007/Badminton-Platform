import { releaseMatureRevenue } from '../domain/revenueRelease.js';

export function startRevenueReleaseScheduler(intervalMs = 60_000): () => void {
  const tick = () => {
    void releaseMatureRevenue().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[finance-service] lỗi đáo hạn doanh thu:', error);
    });
  };
  // Service có thể vừa ngủ nhiều giờ: đáo hạn bù ngay khi thức, không chờ hết chu kỳ đầu.
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
