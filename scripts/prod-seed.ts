// Prod seed — an toàn & idempotent. Chạy nhiều lần không nhân đôi.
//  1) Nâng tài khoản THẬT (ADMIN_EMAIL) lên quyền admin — KHÔNG đụng mật khẩu / Google.
//  2) Seed 2 chủ sân demo (1 approved + 1 pending) và 1-2 mẫu mỗi phần để test.
// Mọi bản ghi demo gắn email @khoaluantn-demo.local / venue tên "DEMO" → xóa bằng
// Tài khoản admin thật KHÔNG bị script nào khác đụng tới.
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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'teo10072004@gmail.com';
const DEMO_PASSWORD = 'Demo@123456';
const DEMO_DOMAIN = '@khoaluantn-demo.local';

async function promoteAdmin(): Promise<void> {
  const user = await accountDb.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!user) {
    console.warn(`[admin] Chưa thấy tài khoản ${ADMIN_EMAIL}. Hãy đăng nhập ứng dụng ít nhất 1 lần rồi chạy lại.`);
    return;
  }
  const roles = new Set<UserRole>(user.roles as UserRole[]);
  roles.add(UserRole.player);
  roles.add(UserRole.admin);
  await accountDb.user.update({ where: { id: user.id }, data: { roles: [...roles] } });
  console.log(`[admin] ${ADMIN_EMAIL} -> roles ${[...roles].join(', ')}`);
}

async function upsertDemoUser(emailLocal: string, displayName: string, roles: UserRole[]) {
  const email = `${emailLocal}${DEMO_DOMAIN}`;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const existing = await accountDb.user.findUnique({ where: { email } });
  if (existing) return existing;
  return accountDb.user.create({
    data: { id: randomUUID(), email, passwordHash, roles, verified: true, playerProfile: { create: { displayName } } },
  });
}

async function main() {
  console.log('== Prod seed ==');
  await promoteAdmin();

  // Idempotency: nếu đã seed (venue DEMO tồn tại) thì bỏ qua phần dữ liệu mẫu.
  const seeded = await venueDb.venue.findFirst({ where: { name: { startsWith: 'DEMO' } } });
  if (seeded) {
    console.log('[seed] Dữ liệu mẫu DEMO đã tồn tại — bỏ qua (idempotent).');
    return;
  }

  // Người dùng mẫu
  const player1 = await upsertDemoUser('demo-player1', 'Demo Player Một', [UserRole.player]);
  const player2 = await upsertDemoUser('demo-player2', 'Demo Player Hai', [UserRole.player]);
  const ownerApproved = await upsertDemoUser('demo-owner', 'Demo Chủ Sân (đã duyệt)', [UserRole.player, UserRole.provider]);
  const ownerPending = await upsertDemoUser('demo-owner-pending', 'Demo Chủ Sân (chờ duyệt)', [UserRole.player, UserRole.provider]);

  // Ví (finance) — 1-2 mẫu
  await financeDb.wallet.create({ data: { userId: player1.id, walletType: 'personal', available: 500000n } });
  await financeDb.wallet.create({ data: { userId: player2.id, walletType: 'personal', available: 200000n } });
  const bizWallet = await financeDb.wallet.create({ data: { userId: ownerApproved.id, walletType: 'business', available: 0n } });
  await financeDb.ledgerEntry.create({ data: { walletId: bizWallet.id, amount: 0n, type: 'topup', refType: 'topup', refId: randomUUID(), before: 0n, after: 0n } });

  // Chủ sân ĐÃ DUYỆT + cơ sở đầy đủ (searchable) + 2 sân + giờ mở + bảng giá
  const provider = await venueDb.provider.create({ data: { userId: ownerApproved.id, orgName: 'DEMO Sân Cầu Lông Phú Nhuận', status: 'approved' } });
  const venue = await venueDb.venue.create({
    data: {
      providerId: provider.id, name: 'DEMO Nhà thi đấu Phú Nhuận', lat: 10.7991, lng: 106.6797,
      address: '123 Đường Demo, Phú Nhuận, TP.HCM',
      amenities: ['Bãi giữ xe', 'Phòng tắm', 'Nước uống', 'Máy lạnh'],
    },
  });
  const court1 = await venueDb.court.create({ data: { venueId: venue.id, name: 'Sân 1' } });
  const court2 = await venueDb.court.create({ data: { venueId: venue.id, name: 'Sân 2' } });
  for (const court of [court1, court2]) {
    for (let weekday = 0; weekday <= 6; weekday++) {
      await venueDb.operatingHour.create({ data: { courtId: court.id, weekday, openMinute: 360, closeMinute: 1320 } });
      await venueDb.pricingRule.create({ data: { courtId: court.id, weekday, startMinute: 360, endMinute: 1320, price: 180000n, effectiveFrom: new Date(Date.now() - 86_400_000) } });
    }
    await venueDb.bookingRule.create({ data: { courtId: court.id, stepMinutes: 60, minDurationMinutes: 60, maxDurationMinutes: 120 } });
  }

  // Chủ sân CHỜ DUYỆT
  await venueDb.provider.create({ data: { userId: ownerPending.id, orgName: 'DEMO Sân Tân Bình chờ duyệt', status: 'pending' } });

  const refundTiers = { tiers: [
    { minHoursBeforeStart: 24, refundPercent: 100 },
    { minHoursBeforeStart: 6, refundPercent: 50 },
    { minHoursBeforeStart: 0, refundPercent: 0 },
  ] };

  // 1 booking confirmed sắp tới (test hủy/hoàn tiền)
  const startAt = new Date(Date.now() + 26 * 3_600_000); startAt.setMinutes(0, 0, 0);
  const booking = await venueDb.booking.create({
    data: { courtId: court1.id, startAt, endAt: new Date(startAt.getTime() + 3_600_000), userId: player1.id, source: 'marketplace', status: 'confirmed', priceSnapshot: 180000n, policySnapshot: refundTiers },
  });
  await financeDb.paymentIntent.create({ data: { userId: player1.id, amount: 180000n, method: 'sepay', refType: 'booking', refId: booking.id, status: 'completed' } });

  // 1 trận đấu mở (matchmaking) + hộ chiếu kỹ năng
  const matchStart = new Date(Date.now() + 50 * 3_600_000); matchStart.setMinutes(0, 0, 0);
  const matchBooking = await venueDb.booking.create({
    data: { courtId: court2.id, startAt: matchStart, endAt: new Date(matchStart.getTime() + 3_600_000), userId: player2.id, source: 'marketplace', status: 'confirmed', priceSnapshot: 180000n, policySnapshot: refundTiers },
  });
  const match = await matchDb.match.create({
    data: { organizerUserId: player2.id, bookingId: matchBooking.id, capacity: 4, feePerSlot: 45000n, skillMin: 'beginner', skillMax: 'intermediate', status: 'open', cutoffAt: new Date(matchStart.getTime() - 3_600_000) },
  });
  await matchDb.passport.create({ data: { userId: player1.id, ratingMu: 25, ratingRd: 8, ratingSigma: 0.06, declaredTier: 'beginner', declaredAt: new Date() } });
  await matchDb.passport.create({ data: { userId: player2.id, ratingMu: 27, ratingRd: 7, ratingSigma: 0.06, declaredTier: 'intermediate', declaredAt: new Date() } });

  // 1 bài viết cộng đồng + 1 bình luận
  const post = await communityDb.post.create({ data: { authorUserId: player1.id, body: '[DEMO] Cuối tuần này có ai rủ đánh cầu lông ở Phú Nhuận không?' } });
  await communityDb.comment.create({ data: { postId: post.id, authorUserId: player2.id, body: '[DEMO] Mình tham gia được nè, mấy giờ vậy bạn?' } });

  console.log(JSON.stringify({
    adminPromoted: ADMIN_EMAIL,
    demoPassword: DEMO_PASSWORD,
    ownerApproved: ownerApproved.email,
    ownerPending: ownerPending.email,
    player1: player1.email,
    player2: player2.email,
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
