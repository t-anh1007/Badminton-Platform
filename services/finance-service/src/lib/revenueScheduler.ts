import { releaseMatureRevenue } from '../domain/revenueRelease.js';

export function startRevenueReleaseScheduler(intervalMs = 60_000): () => Promise<void> {
  let inFlight: Promise<unknown> = Promise.resolve();
  const tick = () => {
    inFlight = releaseMatureRevenue().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[finance-service] lỗi đáo hạn doanh thu:', error);
    });
  };
  // Service có thể vừa ngủ nhiều giờ: đáo hạn bù ngay khi thức, không chờ hết chu kỳ đầu.
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  // Chờ lượt đang chạy xong: idle release gọi prisma.$disconnect() ngay sau khi dừng.
  return async () => {
    clearInterval(timer);
    await inFlight;
  };
}
