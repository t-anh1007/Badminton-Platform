import { releaseMatureRevenue } from '../domain/revenueRelease.js';

export function startRevenueReleaseScheduler(intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    void releaseMatureRevenue().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[finance-service] lỗi đáo hạn doanh thu:', error);
    });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
