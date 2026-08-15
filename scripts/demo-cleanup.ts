// Xóa sạch dữ liệu DEMO đã tạo bởi demo-seed.ts (+ mọi thứ user tạo thêm khi test
// dưới các tài khoản demo đó). Nhận diện bằng email đuôi @khoaluantn-demo.local
// và venue tên bắt đầu "DEMO". KHÔNG đụng tới dữ liệu khác.
import { PrismaClient as AccountPrismaClient } from '../services/account-service/node_modules/@prisma/client/index.js';
import { PrismaClient as VenuePrismaClient } from '../services/venue-booking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as FinancePrismaClient } from '../services/finance-service/node_modules/@prisma/client/index.js';
import { PrismaClient as MatchmakingPrismaClient } from '../services/matchmaking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as CommunityPrismaClient } from '../services/community-service/node_modules/@prisma/client/index.js';

const accountDb = new AccountPrismaClient();
const venueDb = new VenuePrismaClient();
const financeDb = new FinancePrismaClient();
const matchDb = new MatchmakingPrismaClient();
const communityDb = new CommunityPrismaClient();

async function main() {
  const demoUsers = await accountDb.user.findMany({ where: { email: { endsWith: '@khoaluantn-demo.local' } } });
  const userIds = demoUsers.map((u) => u.id);
  console.log(`Xóa dữ liệu cho ${userIds.length} tài khoản demo:`, demoUsers.map((u) => u.email));

  const demoVenues = await venueDb.venue.findMany({ where: { name: { startsWith: 'DEMO' } } });
  const venueIds = demoVenues.map((v) => v.id);
  const demoCourts = await venueDb.court.findMany({ where: { venueId: { in: venueIds } } });
  const courtIds = demoCourts.map((c) => c.id);
  const demoProviders = await venueDb.provider.findMany({ where: { OR: [{ userId: { in: userIds } }, { id: { in: demoVenues.map((v) => v.providerId) } }] } });
  const providerIds = demoProviders.map((p) => p.id);

  const bookings = await venueDb.booking.findMany({ where: { OR: [{ userId: { in: userIds } }, { courtId: { in: courtIds } }] } });
  const bookingIds = bookings.map((b) => b.id);

  // Matchmaking (phụ thuộc bookingIds/userIds)
  const matches = await matchDb.match.findMany({ where: { OR: [{ organizerUserId: { in: userIds } }, { bookingId: { in: bookingIds } }] } });
  const matchIds = matches.map((m) => m.id);
  await matchDb.evaluation.deleteMany({ where: { matchId: { in: matchIds } } });
  await matchDb.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await matchDb.matchResolution.deleteMany({ where: { matchId: { in: matchIds } } });
  await matchDb.match.deleteMany({ where: { id: { in: matchIds } } });
  await matchDb.passport.deleteMany({ where: { userId: { in: userIds } } });

  // Community
  const posts = await communityDb.post.findMany({ where: { authorUserId: { in: userIds } } });
  const postIds = posts.map((p) => p.id);
  await communityDb.comment.deleteMany({ where: { OR: [{ postId: { in: postIds } }, { authorUserId: { in: userIds } }] } });
  await communityDb.report.deleteMany({ where: { reporterUserId: { in: userIds } } });
  await communityDb.ticketMessage.deleteMany({ where: { senderUserId: { in: userIds } } });
  await communityDb.ticket.deleteMany({ where: { requesterUserId: { in: userIds } } });
  await communityDb.post.deleteMany({ where: { id: { in: postIds } } });
  await communityDb.accountLock.deleteMany({ where: { userId: { in: userIds } } });

  // Finance
  const wallets = await financeDb.wallet.findMany({ where: { userId: { in: userIds } } });
  const walletIds = wallets.map((w) => w.id);
  await financeDb.ledgerEntry.deleteMany({ where: { walletId: { in: walletIds } } });
  await financeDb.matchContribution.deleteMany({ where: { userId: { in: userIds } } });
  await financeDb.matchFunding.deleteMany({ where: { matchId: { in: matchIds } } });
  await financeDb.bookingRevenue.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { businessUserId: { in: userIds } }] } });
  await financeDb.dispute.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await financeDb.withdrawalRequest.deleteMany({ where: { sellerUserId: { in: userIds } } });
  await financeDb.paymentIntent.deleteMany({ where: { userId: { in: userIds } } });
  await financeDb.financeAudit.deleteMany({ where: { actorUserId: { in: userIds } } });
  await financeDb.wallet.deleteMany({ where: { id: { in: walletIds } } });

  // Venue booking
  await venueDb.matchBookingCommand.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await venueDb.hold.deleteMany({ where: { courtId: { in: courtIds } } });
  await venueDb.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await venueDb.pricingRule.deleteMany({ where: { courtId: { in: courtIds } } });
  await venueDb.operatingHour.deleteMany({ where: { courtId: { in: courtIds } } });
  await venueDb.bookingRule.deleteMany({ where: { courtId: { in: courtIds } } });
  await venueDb.closure.deleteMany({ where: { courtId: { in: courtIds } } });
  await venueDb.court.deleteMany({ where: { id: { in: courtIds } } });
  await venueDb.venue.deleteMany({ where: { id: { in: venueIds } } });
  await venueDb.provider.deleteMany({ where: { id: { in: providerIds } } });

  // Account
  await accountDb.accountAudit.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetUserId: { in: userIds } }] } });
  await accountDb.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
  await accountDb.verification.deleteMany({ where: { userId: { in: userIds } } });
  await accountDb.playerProfile.deleteMany({ where: { userId: { in: userIds } } });
  await accountDb.user.deleteMany({ where: { id: { in: userIds } } });

  console.log('== Đã xóa xong dữ liệu demo ==');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => {
    await Promise.all([accountDb.$disconnect(), venueDb.$disconnect(), financeDb.$disconnect(), matchDb.$disconnect(), communityDb.$disconnect()]);
  });
