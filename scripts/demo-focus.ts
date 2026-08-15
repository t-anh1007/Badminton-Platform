// Seed dữ liệu DEMO tập trung vào 4 tài khoản:
//   admin@demo.vn     — admin (duyệt provider, xử lý report/dispute/rút tiền)
//   player@demo.vn    — người chơi (ví, booking, trận đấu, bài viết)
//   owner@demo.vn     — chủ sân ĐÃ duyệt (venue/court/doanh thu/rút tiền)
//   newowner@demo.vn  — chủ sân MỚI đăng ký, provider status=pending (chưa duyệt, chưa có sân)
// Idempotent: dọn sạch dữ liệu liên quan của đúng 4 tài khoản này rồi seed lại.
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient as AccountDb, UserRole } from '../services/account-service/node_modules/@prisma/client/index.js';
import { PrismaClient as VenueDb } from '../services/venue-booking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as FinanceDb } from '../services/finance-service/node_modules/@prisma/client/index.js';
import { PrismaClient as MatchDb } from '../services/matchmaking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as CommunityDb } from '../services/community-service/node_modules/@prisma/client/index.js';

const account = new AccountDb();
const venue = new VenueDb();
const finance = new FinanceDb();
const match = new MatchDb();
const community = new CommunityDb();

const PASSWORD = 'Demo@123456';

async function upsertUser(email: string, displayName: string, roles: UserRole[]) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  return account.user.upsert({
    where: { email },
    update: { passwordHash, roles, verified: true },
    create: { id: randomUUID(), email, passwordHash, roles, verified: true, playerProfile: { create: { displayName } } },
  });
}

async function cleanup(ids: string[]) {
  // venue: tìm cây provider->venue->court của các tài khoản này
  const providers = await venue.provider.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  const venues = await venue.venue.findMany({ where: { providerId: { in: providers.map((p) => p.id) } }, select: { id: true } });
  const courts = await venue.court.findMany({ where: { venueId: { in: venues.map((v) => v.id) } }, select: { id: true } });
  const courtIds = courts.map((c) => c.id);
  const bookings = await venue.booking.findMany({ where: { OR: [{ courtId: { in: courtIds } }, { userId: { in: ids } }] }, select: { id: true } });
  const bookingIds = bookings.map((b) => b.id);
  if (bookingIds.length) await venue.matchBookingCommand.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await venue.booking.deleteMany({ where: { OR: [{ courtId: { in: courtIds } }, { userId: { in: ids } }] } });
  await venue.hold.deleteMany({ where: { OR: [{ courtId: { in: courtIds } }, { userId: { in: ids } }] } });
  if (courtIds.length) {
    await venue.pricingRule.deleteMany({ where: { courtId: { in: courtIds } } });
    await venue.operatingHour.deleteMany({ where: { courtId: { in: courtIds } } });
    await venue.closure.deleteMany({ where: { courtId: { in: courtIds } } });
    await venue.bookingRule.deleteMany({ where: { courtId: { in: courtIds } } });
    await venue.court.deleteMany({ where: { id: { in: courtIds } } });
  }
  await venue.venue.deleteMany({ where: { id: { in: venues.map((v) => v.id) } } });
  await venue.provider.deleteMany({ where: { userId: { in: ids } } });

  // finance
  const wallets = await finance.wallet.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  const walletIds = wallets.map((w) => w.id);
  if (walletIds.length) await finance.ledgerEntry.deleteMany({ where: { walletId: { in: walletIds } } });
  await finance.bookingRevenue.deleteMany({ where: { businessUserId: { in: ids } } });
  await finance.wallet.deleteMany({ where: { userId: { in: ids } } });
  await finance.paymentIntent.deleteMany({ where: { userId: { in: ids } } });
  await finance.matchContribution.deleteMany({ where: { userId: { in: ids } } });
  await finance.matchFunding.deleteMany({ where: { organizerUserId: { in: ids } } });
  await finance.withdrawalRequest.deleteMany({ where: { sellerUserId: { in: ids } } });
  await finance.dispute.deleteMany({ where: { raiserUserId: { in: ids } } });

  // matchmaking
  const matches = await match.match.findMany({ where: { organizerUserId: { in: ids } }, select: { id: true } });
  const matchIds = matches.map((m) => m.id);
  if (matchIds.length) {
    await match.evaluation.deleteMany({ where: { matchId: { in: matchIds } } });
    await match.matchResolution.deleteMany({ where: { matchId: { in: matchIds } } });
    await match.join.deleteMany({ where: { matchId: { in: matchIds } } });
  }
  await match.evaluation.deleteMany({ where: { OR: [{ raterUserId: { in: ids } }, { rateeUserId: { in: ids } }] } });
  await match.join.deleteMany({ where: { participantUserId: { in: ids } } });
  await match.match.deleteMany({ where: { organizerUserId: { in: ids } } });
  await match.passport.deleteMany({ where: { userId: { in: ids } } });

  // community
  const posts = await community.post.findMany({ where: { authorUserId: { in: ids } }, select: { id: true } });
  const postIds = posts.map((p) => p.id);
  if (postIds.length) {
    await community.comment.deleteMany({ where: { postId: { in: postIds } } });
    await community.report.deleteMany({ where: { targetType: 'post', targetId: { in: postIds } } });
  }
  await community.comment.deleteMany({ where: { authorUserId: { in: ids } } });
  await community.report.deleteMany({ where: { reporterUserId: { in: ids } } });
  await community.accountLock.deleteMany({ where: { userId: { in: ids } } });
  await community.post.deleteMany({ where: { authorUserId: { in: ids } } });
}

async function main() {
  console.log('== Ensure users ==');
  const admin = await upsertUser('admin@demo.vn', 'Admin Demo', [UserRole.player, UserRole.admin]);
  const player = await upsertUser('player@demo.vn', 'Player Demo', [UserRole.player]);
  const owner = await upsertUser('owner@demo.vn', 'Chủ Sân Demo', [UserRole.player, UserRole.provider]);
  const newowner = await upsertUser('newowner@demo.vn', 'Chủ Sân Mới', [UserRole.player, UserRole.provider]);
  const ids = [admin.id, player.id, owner.id, newowner.id];

  console.log('== Cleanup dữ liệu cũ của 4 tài khoản ==');
  await cleanup(ids);

  console.log('== Seed ==');
  // ---- Provider ĐÃ duyệt + venue + court + giờ + giá ----
  const provider = await venue.provider.create({
    data: { userId: owner.id, orgName: 'Sân Cầu Lông Demo Phú Nhuận', status: 'approved', decidedByUserId: admin.id, decidedAt: new Date(), decisionReason: 'Hồ sơ hợp lệ', contact: { phone: '0901234567' } },
  });
  const venueRec = await venue.venue.create({
    data: {
      providerId: provider.id, name: 'Nhà thi đấu Demo Phú Nhuận', lat: 10.7991, lng: 106.6797,
      address: '123 Đường Demo, Phú Nhuận, TP.HCM',
      amenities: ['Bãi giữ xe', 'Phòng tắm', 'Nước uống', 'Máy lạnh'],
      images: ['/demo/demo-phu-nhuan-courts.png', '/demo/demo-phu-nhuan-exterior.png'],
    },
  });
  const court1 = await venue.court.create({ data: { venueId: venueRec.id, name: 'Sân 1' } });
  const court2 = await venue.court.create({ data: { venueId: venueRec.id, name: 'Sân 2' } });
  for (const court of [court1, court2]) {
    for (let weekday = 0; weekday <= 6; weekday++) {
      await venue.operatingHour.create({ data: { courtId: court.id, weekday, openMinute: 360, closeMinute: 1320 } });
      await venue.pricingRule.create({ data: { courtId: court.id, weekday, startMinute: 360, endMinute: 1320, price: 180000n, effectiveFrom: new Date(Date.now() - 86_400_000) } });
    }
    await venue.bookingRule.create({ data: { courtId: court.id, stepMinutes: 60, minDurationMinutes: 60, maxDurationMinutes: 120 } });
  }

  // ---- Provider MỚI đăng ký, chờ duyệt (chưa có venue) ----
  await venue.provider.create({
    data: { userId: newowner.id, orgName: 'Sân Cầu Lông Mới (chờ duyệt)', status: 'pending', contact: { phone: '0987654321', note: 'Vừa đăng ký, chờ admin duyệt' } },
  });

  // ---- Ví ----
  const playerWallet = await finance.wallet.create({ data: { userId: player.id, walletType: 'personal', available: 500000n } });
  await finance.ledgerEntry.create({ data: { walletId: playerWallet.id, amount: 500000n, type: 'topup', refType: 'topup', refId: randomUUID(), before: 0n, after: 500000n } });
  await finance.wallet.create({ data: { userId: admin.id, walletType: 'personal', available: 0n } });
  await finance.wallet.create({ data: { userId: newowner.id, walletType: 'personal', available: 0n } });
  await finance.wallet.create({ data: { userId: owner.id, walletType: 'personal', available: 50000n } });
  const ownerBiz = await finance.wallet.create({ data: { userId: owner.id, walletType: 'business', available: 162000n } });

  // ---- Booking đã xác nhận của player tại court1 (test hủy/hoàn tiền) ----
  const startAt = new Date(Date.now() + 26 * 3_600_000); startAt.setMinutes(0, 0, 0);
  const endAt = new Date(startAt.getTime() + 3_600_000);
  const policySnapshot = { tiers: [{ minHoursBeforeStart: 24, refundPercent: 100 }, { minHoursBeforeStart: 6, refundPercent: 50 }, { minHoursBeforeStart: 0, refundPercent: 0 }] };
  const booking = await venue.booking.create({
    data: { courtId: court1.id, startAt, endAt, userId: player.id, source: 'marketplace', status: 'confirmed', priceSnapshot: 180000n, policySnapshot },
  });
  await finance.paymentIntent.create({ data: { userId: player.id, amount: 180000n, method: 'sepay', refType: 'booking', refId: booking.id, status: 'completed' } });
  await finance.ledgerEntry.create({ data: { walletId: ownerBiz.id, amount: 162000n, type: 'release', refType: 'booking', refId: booking.id, before: 0n, after: 162000n } });
  await finance.bookingRevenue.create({
    data: { bookingId: booking.id, businessWalletId: ownerBiz.id, businessUserId: owner.id, venueId: venueRec.id, gross: 180000n, net: 162000n, commission: 18000n, endAt, releaseAt: new Date(Date.now() - 3_600_000), releasedAt: new Date() },
  });

  // ---- Booking thứ hai của player tại court2 gắn 1 trận mở (matchmaking) ----
  const matchStart = new Date(Date.now() + 74 * 3_600_000); matchStart.setMinutes(0, 0, 0);
  const matchEnd = new Date(matchStart.getTime() + 3_600_000);
  const matchBooking = await venue.booking.create({
    data: { courtId: court2.id, startAt: matchStart, endAt: matchEnd, userId: player.id, source: 'marketplace', status: 'confirmed', priceSnapshot: 180000n, policySnapshot },
  });
  const openMatch = await match.match.create({
    data: { organizerUserId: player.id, bookingId: matchBooking.id, capacity: 4, feePerSlot: 45000n, skillMin: 'beginner', skillMax: 'intermediate', status: 'open', cutoffAt: new Date(matchStart.getTime() - 3_600_000) },
  });
  // owner gửi yêu cầu tham gia (pending) -> player là organizer có cái để duyệt
  await match.join.create({ data: { matchId: openMatch.id, participantUserId: owner.id, status: 'pending' } });
  await match.passport.create({ data: { userId: player.id, ratingMu: 27, ratingRd: 7, ratingSigma: 0.06, declaredTier: 'intermediate', declaredAt: new Date() } });
  await match.passport.create({ data: { userId: owner.id, ratingMu: 24, ratingRd: 8, ratingSigma: 0.06, declaredTier: 'beginner', declaredAt: new Date() } });

  // ---- Bài viết cộng đồng của player + comment của owner ----
  const post = await community.post.create({ data: { authorUserId: player.id, body: '[DEMO] Cuối tuần này có ai đánh đôi ở Phú Nhuận không?' } });
  await community.comment.create({ data: { postId: post.id, authorUserId: owner.id, body: '[DEMO] Sân mình còn slot tối thứ 7 nè!' } });

  // ---- Hàng chờ xử lý cho ADMIN ----
  // Report bài viết (open) — moderation queue
  await community.report.create({ data: { reporterUserId: owner.id, targetType: 'post', targetId: post.id, reason: '[DEMO] Nghi ngờ spam' } });
  // Dispute trên booking (open)
  await finance.dispute.create({ data: { refType: 'booking', refId: booking.id, bookingId: booking.id, raiserUserId: player.id, reason: '[DEMO] Sân không đúng mô tả', status: 'open', deadlineAt: new Date(Date.now() + 3 * 86_400_000) } });
  // Yêu cầu rút tiền của owner (pending) — admin/đối soát
  await finance.withdrawalRequest.create({ data: { sellerUserId: owner.id, amount: 100000n, status: 'pending', transferCode: `WD${randomUUID().slice(0, 8).toUpperCase()}`, bankCode: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'CHU SAN DEMO' } });

  console.log(JSON.stringify({
    password: PASSWORD,
    accounts: { admin: admin.email, player: player.email, owner: owner.email, newowner: newowner.email },
    seeded: {
      approvedProviderVenue: venueRec.name,
      pendingProvider: 'newowner@demo.vn (status=pending, chưa có sân)',
      playerBookingId: booking.id,
      openMatchId: openMatch.id,
      postId: post.id,
      adminQueue: ['1 pending provider', '1 report', '1 dispute', '1 withdrawal request'],
    },
  }, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await Promise.all([account.$disconnect(), venue.$disconnect(), finance.$disconnect(), match.$disconnect(), community.$disconnect()]); });
