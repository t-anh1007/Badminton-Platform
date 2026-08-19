import { prisma } from '../lib/prisma.js';
import { DEMO_USER_ID, DEMO_IDS } from '@khoaluantn/shared';

/** Seed hộ chiếu (trình độ + rating có độ bất định) và 1 kèo đã hoàn tất do
 * tài khoản demo tổ chức, để trang Tìm kèo / Hộ chiếu không rỗng. Idempotent. */
const MATCH_BOOKING_ID = DEMO_IDS.matchCompletedBooking;
const OPEN_MATCH_ID = DEMO_IDS.matchOpen;
const OPEN_MATCH_BOOKING_ID = DEMO_IDS.matchOpenBooking;

async function main(): Promise<void> {
  const day = 86_400_000;
  const now = Date.now();

  // Dọn kèo demo còn sót từ lần seed trước có id khác (tránh đụng unique bookingId).
  await prisma.match.deleteMany({
    where: { organizerUserId: DEMO_USER_ID, id: { notIn: [DEMO_IDS.match, OPEN_MATCH_ID] } },
  });

  // Passport: đã khai trình độ TB, rating có độ bất định (rd < initial 350),
  // đã chơi 6 trận. (Thang 5 bậc — không đổi theo hard rule.)
  await prisma.passport.upsert({
    where: { userId: DEMO_USER_ID },
    create: {
      userId: DEMO_USER_ID, declaredTier: 'intermediate',
      ratingMu: 1520, ratingRd: 180, ratingSigma: 0.06,
      matchesPlayed: 6, declaredAt: new Date(now - 40 * day),
    },
    update: { declaredTier: 'intermediate', ratingMu: 1520, ratingRd: 180, ratingSigma: 0.06, matchesPlayed: 6 },
  });

  // 1 kèo đã hoàn tất do demo tổ chức.
  await prisma.match.upsert({
    where: { id: DEMO_IDS.match },
    create: {
      id: DEMO_IDS.match, organizerUserId: DEMO_USER_ID, bookingId: MATCH_BOOKING_ID,
      capacity: 4, feePerSlot: 60_000n, skillMin: 'beginner', skillMax: 'intermediate_plus',
      status: 'completed', cutoffAt: new Date(now - 8 * day), completedAt: new Date(now - 7 * day),
      createdAt: new Date(now - 10 * day),
    },
    update: { status: 'completed', capacity: 4, feePerSlot: 60_000n },
  });

  // 1 kèo đang mở (cutoff tương lai) để trang Tìm kèo không rỗng.
  await prisma.match.upsert({
    where: { id: OPEN_MATCH_ID },
    create: {
      id: OPEN_MATCH_ID, organizerUserId: DEMO_USER_ID, bookingId: OPEN_MATCH_BOOKING_ID,
      capacity: 4, feePerSlot: 60_000n, skillMin: 'beginner', skillMax: 'intermediate_plus',
      status: 'open', cutoffAt: new Date(now + 5 * day), createdAt: new Date(now - 1 * day),
    },
    update: { status: 'open', cutoffAt: new Date(now + 5 * day), capacity: 4, feePerSlot: 60_000n },
  });

  console.log('[seed:demo][matchmaking] passport + 1 completed + 1 open match ready');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => { console.error('[seed:demo][matchmaking]', err); await prisma.$disconnect(); process.exit(1); });
