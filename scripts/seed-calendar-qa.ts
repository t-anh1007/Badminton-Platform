import { PrismaClient as AccountPrismaClient } from '../services/account-service/node_modules/@prisma/client/index.js';
import { PrismaClient as VenuePrismaClient } from '../services/venue-booking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as FinancePrismaClient } from '../services/finance-service/node_modules/@prisma/client/index.js';

const accountDb = new AccountPrismaClient();
const venueDb = new VenuePrismaClient();
const financeDb = new FinancePrismaClient();

const PLAYER_EMAIL = 'player@demo.vn';
const VENUE_NAME = 'Sân Linh Xuân';
const FIXTURE_MARKER = 'calendar-qa-random-10';
const BOOKING_COUNT = 10;
const PRICE = 60_000n;

const bookingId = (index: number) => `ca1e0000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
const paymentId = (index: number) => `ca1e1000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

async function main() {
  const player = await accountDb.user.findFirst({
    where: { email: { equals: PLAYER_EMAIL, mode: 'insensitive' } },
    include: { playerProfile: true },
  });
  if (!player) throw new Error(`Không tìm thấy tài khoản ${PLAYER_EMAIL}.`);

  const venue = await venueDb.venue.findFirst({
    where: { name: VENUE_NAME },
    include: { courts: { where: { active: true }, orderBy: { name: 'asc' } } },
  });
  if (!venue || venue.courts.length === 0) throw new Error(`Không tìm thấy sân đang hoạt động tại ${VENUE_NAME}.`);

  const ids = Array.from({ length: BOOKING_COUNT }, (_, index) => bookingId(index));
  const existingFixture = await venueDb.booking.findMany({ where: { id: { in: ids } } });
  const existingIds = new Set(existingFixture.map((booking) => booking.id));

  const rangeStart = new Date('2026-08-24T00:00:00.000Z');
  const rangeEnd = new Date('2026-08-31T00:00:00.000Z');
  const occupied = await venueDb.booking.findMany({
    where: {
      courtId: { in: venue.courts.map((court) => court.id) },
      startAt: { lt: rangeEnd },
      endAt: { gt: rangeStart },
      status: { in: ['held', 'confirmed'] },
    },
    select: { courtId: true, startAt: true, endAt: true },
  });

  const random = seededRandom(20260823);
  const created: Array<{ id: string; court: string; startAt: Date; endAt: Date }> = [];
  for (let index = 0; index < BOOKING_COUNT; index += 1) {
    const id = bookingId(index);
    if (existingIds.has(id)) continue;

    let selected: { courtId: string; courtName: string; startAt: Date; endAt: Date } | null = null;
    for (let attempt = 0; attempt < 200 && !selected; attempt += 1) {
      const court = venue.courts[Math.floor(random() * venue.courts.length)]!;
      const dayOffset = Math.floor(random() * 7);
      const hour = 7 + Math.floor(random() * 14);
      const startAt = new Date(rangeStart.getTime() + dayOffset * 86_400_000 + hour * 3_600_000);
      const endAt = new Date(startAt.getTime() + 3_600_000);
      const conflict = occupied.some((slot) => slot.courtId === court.id && slot.startAt < endAt && slot.endAt > startAt);
      if (!conflict) selected = { courtId: court.id, courtName: court.name, startAt, endAt };
    }
    if (!selected) throw new Error('Không tìm được đủ khung giờ trống cho fixture calendar QA.');

    const booking = await venueDb.booking.create({
      data: {
        id,
        courtId: selected.courtId,
        startAt: selected.startAt,
        endAt: selected.endAt,
        userId: player.id,
        source: 'marketplace',
        status: 'confirmed',
        priceSnapshot: PRICE,
        policySnapshot: { fixture: FIXTURE_MARKER },
      },
    });
    await financeDb.paymentIntent.upsert({
      where: { id: paymentId(index) },
      update: { userId: player.id, amount: PRICE, refType: 'booking', refId: booking.id, status: 'completed' },
      create: { id: paymentId(index), userId: player.id, amount: PRICE, method: 'sepay', refType: 'booking', refId: booking.id, status: 'completed' },
    });
    occupied.push({ courtId: selected.courtId, startAt: selected.startAt, endAt: selected.endAt });
    created.push({ id, court: selected.courtName, startAt: selected.startAt, endAt: selected.endAt });
  }

  const allFixture = await venueDb.booking.findMany({
    where: { id: { in: ids } },
    include: { court: { select: { name: true } } },
    orderBy: { startAt: 'asc' },
  });
  console.log(JSON.stringify({
    fixture: FIXTURE_MARKER,
    player: { email: player.email, displayName: player.playerProfile?.displayName ?? null },
    venue: venue.name,
    createdNow: created.length,
    totalFixtureBookings: allFixture.length,
    bookings: allFixture.map((booking) => ({
      id: booking.id,
      court: booking.court.name,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: booking.status,
      price: booking.priceSnapshot.toString(),
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([accountDb.$disconnect(), venueDb.$disconnect(), financeDb.$disconnect()]);
  });
