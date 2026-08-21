import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { prisma as venuePrisma } from '../../services/venue-booking-service/src/lib/prisma.js';
import { prisma as matchmakingPrisma } from '../../services/matchmaking-service/src/lib/prisma.js';
import { filterAndSortVenues, type VenueSearchResult } from '../../services/venue-booking-service/src/domain/search.js';
import { findPublicMatches } from '../../services/matchmaking-service/src/domain/matches.js';
import { HttpVenueBookingClient } from '../../services/matchmaking-service/src/clients/venueBooking.js';

const VENUES = 50;
const COURTS_PER_VENUE = 4;
const MATCHES = 100;
const RUNS = 5;

const id = (prefix: number, value: number) =>
  `${prefix.toString(16).padStart(8, '0')}-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;

const providerIds = Array.from({ length: VENUES + 1 }, (_, i) => id(0x10, i + 1));
const venueIds = Array.from({ length: VENUES + 1 }, (_, i) => id(0x20, i + 1));
const courtIds = Array.from({ length: VENUES * COURTS_PER_VENUE + MATCHES }, (_, i) => id(0x30, i + 1));
const availabilityBookingIds = Array.from({ length: VENUES * (COURTS_PER_VENUE - 1) }, (_, i) => id(0x40, i + 1));
const contextBookingIds = Array.from({ length: MATCHES }, (_, i) => id(0x41, i + 1));
const matchIds = Array.from({ length: MATCHES }, (_, i) => id(0x50, i + 1));

const startAt = new Date('2026-09-01T19:00:00.000Z');
const endAt = new Date('2026-09-01T21:00:00.000Z');

async function clean() {
  await matchmakingPrisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await venuePrisma.booking.deleteMany({ where: { id: { in: [...availabilityBookingIds, ...contextBookingIds] } } });
  await venuePrisma.court.deleteMany({ where: { id: { in: courtIds } } });
  await venuePrisma.venue.deleteMany({ where: { id: { in: venueIds } } });
  await venuePrisma.provider.deleteMany({ where: { id: { in: providerIds } } });
}

async function seed() {
  await clean();
  await venuePrisma.provider.createMany({
    data: providerIds.map((providerId, i) => ({ id: providerId, userId: randomUUID(), orgName: `CV bench ${i}`, status: 'approved' })),
  });
  await venuePrisma.venue.createMany({
    data: venueIds.map((venueId, i) => ({ id: venueId, providerId: providerIds[i]!, name: `CV bench venue ${i}`, lat: 10, lng: 106, address: 'Benchmark' })),
  });
  await venuePrisma.court.createMany({
    data: courtIds.map((courtId, i) => ({
      id: courtId,
      venueId: i < VENUES * COURTS_PER_VENUE ? venueIds[Math.floor(i / COURTS_PER_VENUE)]! : venueIds[VENUES]!,
      name: `CV bench court ${i}`,
      active: true,
    })),
  });

  let bookingIndex = 0;
  const busyBookings = [];
  for (let venueIndex = 0; venueIndex < VENUES; venueIndex += 1) {
    for (let courtIndex = 0; courtIndex < COURTS_PER_VENUE - 1; courtIndex += 1) {
      busyBookings.push({
        id: availabilityBookingIds[bookingIndex++]!,
        courtId: courtIds[venueIndex * COURTS_PER_VENUE + courtIndex]!,
        startAt,
        endAt,
        source: 'internal' as const,
        status: 'confirmed' as const,
        priceSnapshot: 100000n,
        guestName: 'CV benchmark',
        guestContact: 'benchmark',
      });
    }
  }
  await venuePrisma.booking.createMany({ data: busyBookings });
  await venuePrisma.booking.createMany({
    data: contextBookingIds.map((bookingId, i) => ({
      id: bookingId,
      courtId: courtIds[VENUES * COURTS_PER_VENUE + i]!,
      userId: randomUUID(),
      startAt: new Date('2026-09-02T12:00:00.000Z'),
      endAt: new Date('2026-09-02T14:00:00.000Z'),
      source: 'marketplace' as const,
      status: 'confirmed' as const,
      priceSnapshot: 120000n,
    })),
  });
  await matchmakingPrisma.match.createMany({
    data: matchIds.map((matchId, i) => ({
      id: matchId,
      organizerUserId: randomUUID(),
      bookingId: contextBookingIds[i]!,
      capacity: 4,
      feePerSlot: 0n,
      status: 'open' as const,
      cutoffAt: new Date('2026-09-02T11:00:00.000Z'),
    })),
  });
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    avgMs: +(samples.reduce((sum, sample) => sum + sample, 0) / samples.length).toFixed(1),
    p50Ms: +sorted[Math.floor(sorted.length * 0.5)]!.toFixed(1),
    p95Ms: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!.toFixed(1),
  };
}

async function measureAvailability() {
  const base: VenueSearchResult[] = venueIds.slice(0, VENUES).map((venueId, i) => ({
    venueId,
    name: `CV bench venue ${i}`,
    lat: 10,
    lng: 106,
    address: 'Benchmark',
    amenities: null,
    images: null,
    distanceKm: i,
    lowestPrice: 100000n,
  }));

  let dbCalls = 0;
  const courtFindMany = venuePrisma.court.findMany.bind(venuePrisma.court);
  const bookingFindFirst = venuePrisma.booking.findFirst.bind(venuePrisma.booking);
  const holdFindFirst = venuePrisma.hold.findFirst.bind(venuePrisma.hold);
  venuePrisma.court.findMany = ((...args: Parameters<typeof courtFindMany>) => { dbCalls += 1; return courtFindMany(...args); }) as typeof venuePrisma.court.findMany;
  venuePrisma.booking.findFirst = ((...args: Parameters<typeof bookingFindFirst>) => { dbCalls += 1; return bookingFindFirst(...args); }) as typeof venuePrisma.booking.findFirst;
  venuePrisma.hold.findFirst = ((...args: Parameters<typeof holdFindFirst>) => { dbCalls += 1; return holdFindFirst(...args); }) as typeof venuePrisma.hold.findFirst;

  const run = () => filterAndSortVenues(base, { availability: { date: startAt, startMinute: 19 * 60, endMinute: 21 * 60 } });
  await run();
  dbCalls = 0;
  const samples = [];
  for (let i = 0; i < RUNS; i += 1) {
    const before = performance.now();
    const result = await run();
    samples.push(performance.now() - before);
    if (result.length !== VENUES) throw new Error(`availability returned ${result.length}/${VENUES}`);
  }

  venuePrisma.court.findMany = courtFindMany as typeof venuePrisma.court.findMany;
  venuePrisma.booking.findFirst = bookingFindFirst as typeof venuePrisma.booking.findFirst;
  venuePrisma.hold.findFirst = holdFindFirst as typeof venuePrisma.hold.findFirst;
  return { venues: VENUES, courtsPerVenue: COURTS_PER_VENUE, runs: RUNS, dbCallsPerRun: dbCalls / RUNS, ...summarize(samples) };
}

async function measureMatchHydration() {
  const originalFetch = globalThis.fetch;
  let httpCalls = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes('/match-context')) httpCalls += 1;
    return originalFetch(input, init);
  }) as typeof fetch;
  const client = new HttpVenueBookingClient('http://localhost:3002');
  const run = () => findPublicMatches(client, { minOpenSlots: 1 }, new Date('2026-08-20T00:00:00.000Z'));
  const warmResult = await run();
  const expectedResultCount = warmResult.length;
  httpCalls = 0;
  const samples = [];
  for (let i = 0; i < RUNS; i += 1) {
    const before = performance.now();
    const result = await run();
    samples.push(performance.now() - before);
    if (result.length !== expectedResultCount) throw new Error(`matches changed from ${expectedResultCount} to ${result.length}`);
  }
  globalThis.fetch = originalFetch;
  return { benchmarkMatches: MATCHES, hydratedMatches: expectedResultCount, runs: RUNS, internalHttpCallsPerRun: httpCalls / RUNS, ...summarize(samples) };
}

async function main() {
  const action = process.argv[2] ?? 'measure';
  try {
    if (action === 'cleanup') {
      await clean();
      console.log(JSON.stringify({ cleaned: true }));
    } else {
      await seed();
      console.log(JSON.stringify({ availability: await measureAvailability(), matchHydration: await measureMatchHydration() }, null, 2));
    }
  } finally {
    await Promise.all([venuePrisma.$disconnect(), matchmakingPrisma.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
