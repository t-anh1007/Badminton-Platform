// Seed dữ liệu DEMO để test thủ công trong browser. Mọi bản ghi đều gắn tiền tố
// "demo-" / "DEMO" để nhận diện và xóa sạch sau khi test xong (xem demo-cleanup.ts).
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient as AccountPrismaClient, UserRole } from '../services/account-service/node_modules/@prisma/client/index.js';
import { PrismaClient as VenuePrismaClient } from '../services/venue-booking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as FinancePrismaClient } from '../services/finance-service/node_modules/@prisma/client/index.js';
import { PrismaClient as MatchmakingPrismaClient } from '../services/matchmaking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as CommunityPrismaClient } from '../services/community-service/node_modules/@prisma/client/index.js';

const accountDb = new AccountPrismaClient();
const venueDb = new VenuePrismaClient();
const financeDb = new FinancePrismaClient();
const matchDb = new MatchmakingPrismaClient();
const communityDb = new CommunityPrismaClient();

const DEMO_PASSWORD = 'Demo@123456';

async function makeUser(emailLocal: string, displayName: string, roles: UserRole[]) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await accountDb.user.create({
    data: {
      id: randomUUID(),
      email: `${emailLocal}@khoaluantn-demo.local`,
      passwordHash,
      roles,
      verified: true,
      playerProfile: { create: { displayName } },
    },
  });
  return user;
}

async function main() {
  console.log('== Seeding DEMO data ==');

  const admin = await makeUser('demo-admin', 'Demo Admin', [UserRole.player, UserRole.admin]);
  const player1 = await makeUser('demo-player1', 'Demo Player Một', [UserRole.player]);
  const player2 = await makeUser('demo-player2', 'Demo Player Hai', [UserRole.player]);
  const player3 = await makeUser('demo-player3', 'Demo Player Ba', [UserRole.player]);
  const providerUser = await makeUser('demo-provider', 'Demo Chủ Sân', [UserRole.player, UserRole.provider]);

  // Ví cho từng player + provider (business wallet do FinanceService quản, seed trực tiếp để demo)
  await financeDb.wallet.create({ data: { userId: player1.id, walletType: 'personal', available: 500000n } });
  await financeDb.wallet.create({ data: { userId: player2.id, walletType: 'personal', available: 300000n } });
  await financeDb.wallet.create({ data: { userId: player3.id, walletType: 'personal', available: 0n } });
  await financeDb.wallet.create({ data: { userId: providerUser.id, walletType: 'personal', available: 100000n } });
  const bizWallet = await financeDb.wallet.create({ data: { userId: providerUser.id, walletType: 'business', available: 0n } });
  await financeDb.ledgerEntry.create({ data: { walletId: bizWallet.id, amount: 0n, type: 'topup', refType: 'topup', refId: randomUUID(), before: 0n, after: 0n } });

  // Provider đã duyệt + venue + court + lịch + giá
  const provider = await venueDb.provider.create({ data: { userId: providerUser.id, orgName: 'DEMO Sân Cầu Lông Phú Nhuận', status: 'approved' } });
  const venue = await venueDb.venue.create({ data: { providerId: provider.id, name: 'DEMO Nhà thi đấu Phú Nhuận', lat: 10.7991, lng: 106.6797, address: '123 Đường Demo, Phú Nhuận, TP.HCM' } });
  const court1 = await venueDb.court.create({ data: { venueId: venue.id, name: 'Sân 1' } });
  const court2 = await venueDb.court.create({ data: { venueId: venue.id, name: 'Sân 2' } });
  for (const court of [court1, court2]) {
    for (let weekday = 0; weekday <= 6; weekday++) {
      await venueDb.operatingHour.create({ data: { courtId: court.id, weekday, openMinute: 360, closeMinute: 1320 } });
      await venueDb.pricingRule.create({ data: { courtId: court.id, weekday, startMinute: 360, endMinute: 1320, price: 180000n, effectiveFrom: new Date(Date.now() - 86_400_000) } });
    }
    await venueDb.bookingRule.create({ data: { courtId: court.id, stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 120 } });
  }

  // Một booking confirmed sắp tới của player1 tại court1 (để test hủy/hoàn tiền, ví...)
  const startAt = new Date(Date.now() + 26 * 3_600_000);
  startAt.setMinutes(0, 0, 0);
  const endAt = new Date(startAt.getTime() + 3_600_000);
  const booking = await venueDb.booking.create({
    data: {
      courtId: court1.id, startAt, endAt, userId: player1.id,
      source: 'marketplace', status: 'confirmed', priceSnapshot: 180000n,
      policySnapshot: { tiers: [
        { minHoursBeforeStart: 24, refundPercent: 100 },
        { minHoursBeforeStart: 6, refundPercent: 50 },
        { minHoursBeforeStart: 0, refundPercent: 0 },
      ] },
    },
  });
  await financeDb.paymentIntent.create({ data: { userId: player1.id, amount: 180000n, method: 'sepay', refType: 'booking', refId: booking.id, status: 'completed' } });

  // Một trận đấu mở (matchmaking) gắn với booking demo thứ hai của player2 tại court2
  const matchStart = new Date(Date.now() + 50 * 3_600_000);
  matchStart.setMinutes(0, 0, 0);
  const matchEnd = new Date(matchStart.getTime() + 3_600_000);
  const matchBooking = await venueDb.booking.create({
    data: {
      courtId: court2.id, startAt: matchStart, endAt: matchEnd, userId: player2.id,
      source: 'marketplace', status: 'confirmed', priceSnapshot: 180000n,
      policySnapshot: { tiers: [{ minHoursBeforeStart: 24, refundPercent: 100 }, { minHoursBeforeStart: 6, refundPercent: 50 }, { minHoursBeforeStart: 0, refundPercent: 0 }] },
    },
  });
  const match = await matchDb.match.create({
    data: {
      organizerUserId: player2.id, bookingId: matchBooking.id, capacity: 4, feePerSlot: 45000n,
      skillMin: 'beginner', skillMax: 'intermediate', status: 'open', cutoffAt: new Date(matchStart.getTime() - 3_600_000),
    },
  });
  await matchDb.passport.create({ data: { userId: player1.id, ratingMu: 25, ratingRd: 8, ratingSigma: 0.06, declaredTier: 'beginner', declaredAt: new Date() } });
  await matchDb.passport.create({ data: { userId: player2.id, ratingMu: 27, ratingRd: 7, ratingSigma: 0.06, declaredTier: 'intermediate', declaredAt: new Date() } });
  await matchDb.passport.create({ data: { userId: player3.id, ratingMu: 22, ratingRd: 9, ratingSigma: 0.07, declaredTier: 'newcomer', declaredAt: new Date() } });

  // Bài viết cộng đồng + bình luận demo
  const post = await communityDb.post.create({ data: { authorUserId: player1.id, body: '[DEMO] Cuối tuần này có ai rủ đánh cầu lông ở Phú Nhuận không?' } });
  await communityDb.comment.create({ data: { postId: post.id, authorUserId: player2.id, body: '[DEMO] Mình tham gia được nè, mấy giờ vậy bạn?' } });

  console.log(JSON.stringify({
    password: DEMO_PASSWORD,
    admin: admin.email,
    player1: player1.email,
    player2: player2.email,
    player3: player3.email,
    provider: providerUser.email,
    venueId: venue.id,
    bookingId: booking.id,
    matchId: match.id,
    postId: post.id,
  }, null, 2));
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => {
    await Promise.all([accountDb.$disconnect(), venueDb.$disconnect(), financeDb.$disconnect(), matchDb.$disconnect(), communityDb.$disconnect()]);
  });
