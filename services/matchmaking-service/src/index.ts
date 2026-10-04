import { startWithIdleRelease } from '@khoaluantn/eventbus';
import { prisma } from './lib/prisma.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';
import { bootstrapRatingEventConsumption } from './lib/ratingEventConsumer.js';
import { createApp } from './app.js';
import { HttpVenueBookingClient } from './clients/venueBooking.js';
import { startJoinExpiryScheduler } from './domain/joins.js';
import { expireSelfPayPartnerInvites } from './domain/partnerInvites.js';
import { bootstrapMatchLifecycleEventConsumption } from './lib/matchLifecycleEventConsumer.js';
import { attachQuickMatchGateway } from './lib/quickMatchGateway.js';
import { startMatchCutoffScheduler } from './domain/matchLifecycle.js';
import { createPrivateObjectStorageClientFromEnv } from '@khoaluantn/object-storage';
import { sweepResultEvidenceRetention } from './domain/resultEvidence.js';
import { sweepResultDeadlines, sweepResultReviews } from './domain/resultLifecycle.js';
import { sweepRatingAging } from './domain/passport.js';
import { sweepRewardPrograms } from './domain/rewards.js';

const SERVICE_NAME = 'matchmaking-service';
const PORT = Number(process.env.MATCHMAKING_PORT ?? 3004);

const venueBookingClient = new HttpVenueBookingClient();
const app = createApp({ venueBookingClient });

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
});
// Gateway WebSocket bám vào http server, không buông theo chu kỳ rảnh: phiên
// Tìm nhanh đang mở phải sống tới khi người dùng đóng.
const stopQuickMatchGateway = attachQuickMatchGateway(server, venueBookingClient);

// Xem ghi chú ở finance-service/src/index.ts về cơ chế buông khi rảnh.
const idle = startWithIdleRelease({
  label: SERVICE_NAME,
  start: async () => [
    startJoinExpiryScheduler(),
    // Partner tự trả đã nhận lời quá 30 phút chưa thanh toán: coi như từ chối, nhả slot.
    startJoinExpiryScheduler(60_000, () => expireSelfPayPartnerInvites()),
    startMatchCutoffScheduler(),
    // BR-CM-32: hạn khai/phản đối/sự cố chốt trong vòng 5 phút; sweep idempotent.
    startMatchCutoffScheduler(60_000, sweepResultDeadlines),
    // BR-CM-39/40: provider quá hạn chuyển Admin, nhắc SLA Admin; không đổi tiền/kết quả.
    startMatchCutoffScheduler(5 * 60_000, sweepResultReviews),
    // BR-CM-49: tăng RD theo kỳ 7 ngày không hoạt động; idempotent theo lastAgedAt.
    startMatchCutoffScheduler(60 * 60_000, () => sweepRatingAging()),
    // BR-CM-64/65: chuyển trạng thái chương trình thưởng và tính giải khi mọi kết quả đã final.
    startMatchCutoffScheduler(60_000, () => sweepRewardPrograms()),
    // Retention bằng chứng kết quả (BR-CM-27); client private tạo lười để thiếu cấu hình chỉ log lỗi.
    startMatchCutoffScheduler(60 * 60_000, () => sweepResultEvidenceRetention(createPrivateObjectStorageClientFromEnv())),
    await bootstrapRatingEventConsumption(),
    await bootstrapMatchLifecycleEventConsumption(),
    await bootstrapEventPublishing(),
  ],
  onRelease: () => prisma.$disconnect(),
});

async function shutdown(): Promise<void> {
  await idle.stop();
  await stopQuickMatchGateway();
  await prisma.$disconnect();
  server.close();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });