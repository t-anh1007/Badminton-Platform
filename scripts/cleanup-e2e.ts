// Xóa toàn bộ dữ liệu do E2E/test sinh ra làm ô nhiễm DB dev.
// Nhận diện:
//   - User email khớp ^(e2e-|phase2-e2e-).*@example\.test$ (test factory)
//   - Provider có orgName bắt đầu 'E2E' hoặc bằng 'NCC Test'
//   - Venue có name bắt đầu 'E2E', 'Venue ' hoặc 'V '
// Chỉ xóa dữ liệu thuộc các entity kể trên. KHÔNG đụng dữ liệu demo hoặc dev khác.
import { PrismaClient as AccountDb } from '../services/account-service/node_modules/@prisma/client/index.js';
import { PrismaClient as VenueDb } from '../services/venue-booking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as FinanceDb } from '../services/finance-service/node_modules/@prisma/client/index.js';
import { PrismaClient as MatchDb } from '../services/matchmaking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as CommunityDb } from '../services/community-service/node_modules/@prisma/client/index.js';

const account = new AccountDb();
const venue = new VenueDb();
const finance = new FinanceDb();
const match = new MatchDb();
const community = new CommunityDb();

async function main() {
  const users = await account.user.findMany({
    where: { email: { endsWith: '@example.test' } },
    select: { id: true, email: true },
  });
  const userIds = users.map((u) => u.id);
  console.log(`E2E users: ${userIds.length}`);

  const providers = await venue.provider.findMany({
    where: {
      OR: [
        { orgName: { startsWith: 'E2E' } },
        { orgName: 'NCC Test' },
        { userId: { in: userIds } },
      ],
    },
    select: { id: true, orgName: true },
  });
  const providerIds = providers.map((p) => p.id);
  const venues = await venue.venue.findMany({
    where: {
      OR: [
        { name: { startsWith: 'E2E' } },
        { name: { startsWith: 'Venue ' } },
        { name: { startsWith: 'V ' } },
        { name: 'V' },
        { name: { startsWith: 'P2 E2E' } },
        { name: { contains: 'E2E' } },
        { providerId: { in: providerIds } },
      ],
    },
    select: { id: true, providerId: true },
  });
  const venueIds = venues.map((v) => v.id);
  // Include providers reachable via the newly discovered polluted venues.
  const extraProviderIds = Array.from(new Set(venues.map((v) => v.providerId).filter((id): id is string => Boolean(id) && !providerIds.includes(id))));
  providerIds.push(...extraProviderIds);
  const courts = await venue.court.findMany({ where: { venueId: { in: venueIds } }, select: { id: true } });
  const courtIds = courts.map((c) => c.id);
  console.log(`E2E providers: ${providerIds.length}, venues: ${venueIds.length}, courts: ${courtIds.length}`);

  const bookings = await venue.booking.findMany({
    where: { OR: [{ userId: { in: userIds } }, { courtId: { in: courtIds } }] },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);
  console.log(`E2E bookings: ${bookingIds.length}`);

  // Matchmaking
  const matches = await match.match.findMany({
    where: { OR: [{ organizerUserId: { in: userIds } }, { bookingId: { in: bookingIds } }] },
    select: { id: true },
  });
  const matchIds = matches.map((m) => m.id);
  if (matchIds.length) {
    await match.evaluation.deleteMany({ where: { matchId: { in: matchIds } } });
    await match.join.deleteMany({ where: { matchId: { in: matchIds } } });
    await match.matchResolution.deleteMany({ where: { matchId: { in: matchIds } } });
    await match.match.deleteMany({ where: { id: { in: matchIds } } });
  }
  if (userIds.length) {
    await match.evaluation.deleteMany({ where: { OR: [{ raterUserId: { in: userIds } }, { rateeUserId: { in: userIds } }] } });
    await match.join.deleteMany({ where: { participantUserId: { in: userIds } } });
    await match.passport.deleteMany({ where: { userId: { in: userIds } } });
  }

  // Community
  if (userIds.length) {
    const posts = await community.post.findMany({ where: { authorUserId: { in: userIds } }, select: { id: true } });
    const postIds = posts.map((p) => p.id);
    if (postIds.length) {
      await community.comment.deleteMany({ where: { postId: { in: postIds } } });
      await community.report.deleteMany({ where: { targetType: 'post', targetId: { in: postIds } } });
    }
    await community.comment.deleteMany({ where: { authorUserId: { in: userIds } } });
    await community.report.deleteMany({ where: { reporterUserId: { in: userIds } } });
    await community.ticketMessage.deleteMany({ where: { senderUserId: { in: userIds } } });
    await community.ticket.deleteMany({ where: { requesterUserId: { in: userIds } } });
    await community.accountLock.deleteMany({ where: { userId: { in: userIds } } });
    await community.post.deleteMany({ where: { authorUserId: { in: userIds } } });
  }

  // Finance
  if (userIds.length) {
    const wallets = await finance.wallet.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const walletIds = wallets.map((w) => w.id);
    if (walletIds.length) await finance.ledgerEntry.deleteMany({ where: { walletId: { in: walletIds } } });
    await finance.matchContribution.deleteMany({ where: { userId: { in: userIds } } });
    if (matchIds.length) await finance.matchFunding.deleteMany({ where: { matchId: { in: matchIds } } });
    await finance.bookingRevenue.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { businessUserId: { in: userIds } }] } });
    if (bookingIds.length) await finance.dispute.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await finance.withdrawalRequest.deleteMany({ where: { sellerUserId: { in: userIds } } });
    await finance.paymentIntent.deleteMany({ where: { userId: { in: userIds } } });
    await finance.financeAudit.deleteMany({ where: { actorUserId: { in: userIds } } });
    if (walletIds.length) await finance.wallet.deleteMany({ where: { id: { in: walletIds } } });
  }

  // Venue booking
  if (bookingIds.length) {
    await venue.matchBookingCommand.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await venue.booking.deleteMany({ where: { id: { in: bookingIds } } });
  }
  if (courtIds.length) {
    await venue.hold.deleteMany({ where: { courtId: { in: courtIds } } });
    await venue.pricingRule.deleteMany({ where: { courtId: { in: courtIds } } });
    await venue.operatingHour.deleteMany({ where: { courtId: { in: courtIds } } });
    await venue.bookingRule.deleteMany({ where: { courtId: { in: courtIds } } });
    await venue.closure.deleteMany({ where: { courtId: { in: courtIds } } });
    await venue.court.deleteMany({ where: { id: { in: courtIds } } });
  }
  if (venueIds.length) await venue.venue.deleteMany({ where: { id: { in: venueIds } } });
  if (providerIds.length) await venue.provider.deleteMany({ where: { id: { in: providerIds } } });

  // Account
  if (userIds.length) {
    await account.accountAudit.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetUserId: { in: userIds } }] } });
    await account.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
    await account.verification.deleteMany({ where: { userId: { in: userIds } } });
    await account.playerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await account.user.deleteMany({ where: { id: { in: userIds } } });
  }

  console.log('== Đã dọn dữ liệu E2E ==');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => {
    await Promise.all([account.$disconnect(), venue.$disconnect(), finance.$disconnect(), match.$disconnect(), community.$disconnect()]);
  });
