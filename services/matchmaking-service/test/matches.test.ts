import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import type { VenueBookingClient, VenueMatchContext } from '../src/clients/venueBooking.js';
import type { AccountClient } from '../src/clients/account.js';
import { releaseExpiredApprovedJoins, startJoinExpiryScheduler } from '../src/domain/joins.js';

class FakeVenueBookingClient implements VenueBookingClient {
  readonly contexts = new Map<string, VenueMatchContext>();

  async getMatchContext(bookingId: string): Promise<VenueMatchContext | null> {
    return this.contexts.get(bookingId) ?? null;
  }

  async createBookingFromHold(): Promise<string> {
    throw new Error('not configured for this test');
  }

  async cancelConfirmedBooking(): Promise<{ refundPercent: number }> {
    return { refundPercent: 50 };
  }
}

class FakeAccountClient implements AccountClient {
  readonly displayNames = new Map<string, string>();

  async getPublicMatchProfile(userId: string) {
    const displayName = this.displayNames.get(userId);
    return displayName ? { userId, displayName, identityVisibility: 'public' as const } : null;
  }
}

const venueBookingClient = new FakeVenueBookingClient();
const accountClient = new FakeAccountClient();
const app = createApp({ venueBookingClient, accountClient });
const bookingIds: string[] = [];
const createdMatchIds: string[] = [];
const passportUserIds: string[] = [];
const eventAggregateIds: string[] = [];

function playerToken(userId: string): string {
  return jwt.sign(
    { sub: userId, roles: ['player'], type: 'access' },
    process.env.JWT_SECRET ?? 'change-me-in-real-env',
    { expiresIn: 300 },
  );
}

function context(bookingId: string, startAt: Date): VenueMatchContext {
  return {
    bookingId,
    ownerUserId: randomUUID(),
    status: 'held',
    priceSnapshot: '400000',
    startAt: startAt.toISOString(),
    endAt: new Date(startAt.getTime() + 60 * 60_000).toISOString(),
    holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    court: { id: randomUUID(), name: 'Sân 1' },
    venue: {
      id: randomUUID(),
      name: 'Sân Cầu Lông Quận 1',
      address: 'Quận 1',
      lat: 10.77,
      lng: 106.7,
    },
  };
}

async function createMatch(input: {
  capacity?: number;
  status?: 'open' | 'filled';
  cutoffAt?: Date;
  skillMin?: 'newcomer' | 'beginner' | 'intermediate' | 'intermediate_plus' | 'advanced';
  skillMax?: 'newcomer' | 'beginner' | 'intermediate' | 'intermediate_plus' | 'advanced';
}) {
  const bookingId = randomUUID();
  bookingIds.push(bookingId);
  venueBookingClient.contexts.set(bookingId, context(bookingId, new Date(Date.now() + 3 * 60 * 60_000)));
  return prisma.match.create({
    data: {
      organizerUserId: randomUUID(),
      bookingId,
      capacity: input.capacity ?? 4,
      feePerSlot: 100000n,
      cutoffAt: input.cutoffAt ?? new Date(Date.now() + 2 * 60 * 60_000),
      status: input.status ?? 'open',
      skillMin: input.skillMin,
      skillMax: input.skillMax,
    },
  });
}

beforeEach(async () => {
  if (eventAggregateIds.length > 0) {
    await prisma.outbox.deleteMany({
      where: { aggregateId: { in: eventAggregateIds.splice(0) } },
    });
  }
  if (createdMatchIds.length > 0) {
    await prisma.outbox.deleteMany({
      where: { aggregateId: { in: createdMatchIds.splice(0) } },
    });
  }
  if (bookingIds.length > 0) {
    const ids = bookingIds.splice(0);
    const matches = await prisma.match.findMany({
      where: { bookingId: { in: ids } },
      select: { id: true },
    });
    await prisma.join.deleteMany({
      where: { matchId: { in: matches.map((match) => match.id) } },
    });
    await prisma.match.deleteMany({ where: { bookingId: { in: ids } } });
  }
  if (passportUserIds.length > 0) {
    await prisma.passport.deleteMany({
      where: { userId: { in: passportUserIds.splice(0) } },
    });
  }
  venueBookingClient.contexts.clear();
  accountClient.displayNames.clear();
});

afterAll(async () => {
  await prisma.outbox.deleteMany({
    where: { aggregateId: { in: eventAggregateIds } },
  });
  if (createdMatchIds.length > 0) {
    await prisma.outbox.deleteMany({
      where: { aggregateId: { in: createdMatchIds } },
    });
  }
  if (bookingIds.length > 0) {
    const matches = await prisma.match.findMany({
      where: { bookingId: { in: bookingIds } },
      select: { id: true },
    });
    await prisma.join.deleteMany({
      where: { matchId: { in: matches.map((match) => match.id) } },
    });
    await prisma.match.deleteMany({ where: { bookingId: { in: bookingIds } } });
  }
  await prisma.passport.deleteMany({
    where: { userId: { in: passportUserIds } },
  });
  await prisma.$disconnect();
});

describe('MMP-01 — public match search', () => {
  it('AC-MMP-01-1: returns only open matches with available slots', async () => {
    await Promise.all([createMatch({}), createMatch({}), createMatch({}), createMatch({ status: 'filled' })]);

    const response = await request(app).get('/matches').expect(200);

    expect(response.body.matches).toHaveLength(3);
    expect(response.body.matches.every((match: { openSlots: number }) => match.openSlots === 3)).toBe(true);
  });

  it('AC-MMP-01-2: filters by intersecting skill tier', async () => {
    const expected = await createMatch({
      skillMin: 'intermediate',
      skillMax: 'advanced',
    });
    await createMatch({ skillMin: 'newcomer', skillMax: 'beginner' });

    const response = await request(app).get('/matches?skill=intermediate_plus').expect(200);

    expect(response.body.matches.map((match: { id: string }) => match.id)).toEqual([expected.id]);
  });

  it('AC-MMP-01-3: excludes matches at or past cutoffAt', async () => {
    const visible = await createMatch({
      cutoffAt: new Date(Date.now() + 60_000),
    });
    await createMatch({ cutoffAt: new Date(Date.now() - 1) });

    const response = await request(app).get('/matches').expect(200);

    expect(response.body.matches.map((match: { id: string }) => match.id)).toEqual([visible.id]);
  });

  it('AC-MMP-01-4: returns an empty collection when no filter matches', async () => {
    await createMatch({ skillMin: 'newcomer', skillMax: 'beginner' });

    const response = await request(app).get('/matches?skill=advanced&area=Quan%209').expect(200);

    expect(response.body).toEqual({ matches: [] });
  });
});

describe('MMP-02 — create and publish a match', () => {
  it('AC-MMP-02-1: creates a split-fee match from the organizer owned held booking', async () => {
    const organizerUserId = randomUUID();
    const bookingId = randomUUID();
    bookingIds.push(bookingId);
    const slot = context(bookingId, new Date(Date.now() + 3 * 60 * 60_000));
    venueBookingClient.contexts.set(bookingId, {
      ...slot,
      ownerUserId: organizerUserId,
    });

    const response = await request(app)
      .post('/matches')
      .set('Authorization', `Bearer ${playerToken(organizerUserId)}`)
      .send({ bookingId, capacity: 4, feeMode: 'split' })
      .expect(201);
    createdMatchIds.push(response.body.id);

    expect(response.body).toMatchObject({
      organizerUserId,
      bookingId,
      capacity: 4,
      feePerSlot: '100000',
      status: 'open',
    });
    expect(new Date(response.body.cutoffAt).getTime()).toBe(new Date(slot.startAt).getTime() - 60 * 60_000);
    expect(
      await prisma.outbox.count({
        where: { aggregateId: response.body.id, eventType: 'MatchCreated' },
      }),
    ).toBe(1);
  });

  it('AC-MMP-02-2: rejects a booking not held by the organizer', async () => {
    const organizerUserId = randomUUID();
    const bookingId = randomUUID();
    bookingIds.push(bookingId);
    venueBookingClient.contexts.set(bookingId, context(bookingId, new Date(Date.now() + 3 * 60 * 60_000)));

    const response = await request(app)
      .post('/matches')
      .set('Authorization', `Bearer ${playerToken(organizerUserId)}`)
      .send({ bookingId, capacity: 4, feeMode: 'split' })
      .expect(422);

    expect(response.body.error.code).toBe('MATCH_SLOT_NOT_HELD');
  });

  it('AC-MMP-02-3: rejects capacity below two', async () => {
    const organizerUserId = randomUUID();

    const response = await request(app)
      .post('/matches')
      .set('Authorization', `Bearer ${playerToken(organizerUserId)}`)
      .send({ bookingId: randomUUID(), capacity: 1, feeMode: 'split' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('AC-MMP-02-4: creates a free match with no participant fee', async () => {
    const organizerUserId = randomUUID();
    const bookingId = randomUUID();
    bookingIds.push(bookingId);
    const slot = context(bookingId, new Date(Date.now() + 3 * 60 * 60_000));
    venueBookingClient.contexts.set(bookingId, {
      ...slot,
      ownerUserId: organizerUserId,
    });

    const response = await request(app)
      .post('/matches')
      .set('Authorization', `Bearer ${playerToken(organizerUserId)}`)
      .send({ bookingId, capacity: 4, feeMode: 'free' })
      .expect(201);
    createdMatchIds.push(response.body.id);

    expect(response.body.feePerSlot).toBe('0');
  });
});

describe('MMP-03 — public match detail', () => {
  async function detailFixture() {
    const match = await createMatch({
      skillMin: 'intermediate',
      skillMax: 'advanced',
    });
    passportUserIds.push(match.organizerUserId);
    accountClient.displayNames.set(match.organizerUserId, 'Nguyễn Minh');
    await prisma.passport.create({
      data: {
        userId: match.organizerUserId,
        declaredTier: 'intermediate_plus',
        ratingMu: 1700,
        ratingRd: 80,
        ratingSigma: 0.06,
      },
    });
    await prisma.join.createMany({
      data: [
        {
          matchId: match.id,
          participantUserId: randomUUID(),
          status: 'confirmed',
        },
        {
          matchId: match.id,
          participantUserId: randomUUID(),
          status: 'pending',
        },
      ],
    });
    return match;
  }

  it('AC-MMP-03-1: returns venue, time, fee, open slots and organizer tier', async () => {
    const match = await detailFixture();

    const response = await request(app).get(`/matches/${match.id}`).expect(200);

    expect(response.body).toMatchObject({
      id: match.id,
      feePerSlot: '100000',
      openSlots: 2,
      organizer: {
        displayName: 'Nguyễn Minh',
        identityVisibility: 'public',
        tier: 'intermediate_plus',
      },
      court: { name: 'Sân 1' },
      venue: { name: 'Sân Cầu Lông Quận 1', address: 'Quận 1' },
    });
    expect(response.body).not.toHaveProperty('joins');
  });

  it('AC-MMP-03-2: guest can view detail but cannot join', async () => {
    const match = await detailFixture();

    const response = await request(app).get(`/matches/${match.id}`).expect(200);

    expect(response.body.actions).toEqual({
      canJoin: false,
      isOrganizer: false,
      canPayOrganizerContribution: false,
      ownJoin: null,
    });
  });

  it('returns the requester active JOIN so the client can render the durable state machine', async () => {
    const match = await detailFixture();
    const participantUserId = randomUUID();
    const approvedAt = new Date('2026-08-09T10:00:00.000Z');
    const join = await prisma.join.create({
      data: {
        matchId: match.id,
        participantUserId,
        status: 'approved',
        approvedAt,
      },
    });

    const response = await request(app)
      .get(`/matches/${match.id}`)
      .set('Authorization', `Bearer ${playerToken(participantUserId)}`)
      .expect(200);

    expect(response.body.actions).toEqual({
      canJoin: false,
      isOrganizer: false,
      canPayOrganizerContribution: false,
      ownJoin: {
        id: join.id,
        status: 'approved',
        approvedAt: '2026-08-09T10:00:00.000Z',
      },
    });
  });

  it('identifies the organizer without exposing another player JOIN', async () => {
    const match = await detailFixture();

    const response = await request(app)
      .get(`/matches/${match.id}`)
      .set('Authorization', `Bearer ${playerToken(match.organizerUserId)}`)
      .expect(200);

    expect(response.body.actions).toEqual({
      canJoin: false,
      isOrganizer: true,
      canPayOrganizerContribution: false,
      ownJoin: null,
    });
  });

  it('keeps a filled paid match visible to its organizer for the required contribution', async () => {
    const match = await detailFixture();
    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'filled' },
    });

    const response = await request(app)
      .get(`/matches/${match.id}`)
      .set('Authorization', `Bearer ${playerToken(match.organizerUserId)}`)
      .expect(200);

    expect(response.body).toMatchObject({ status: 'filled' });
    expect(response.body.actions).toMatchObject({
      isOrganizer: true,
      canPayOrganizerContribution: true,
    });
    await request(app).get(`/matches/${match.id}`).expect(404);
  });

  it('keeps a confirmed match visible only to its organizer and active participants', async () => {
    const match = await detailFixture();
    const confirmedJoin = await prisma.join.findFirstOrThrow({
      where: { matchId: match.id, status: 'confirmed' },
    });
    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'confirmed' },
    });

    const response = await request(app)
      .get(`/matches/${match.id}`)
      .set('Authorization', `Bearer ${playerToken(confirmedJoin.participantUserId)}`)
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'confirmed',
      actions: {
        canJoin: false,
        isOrganizer: false,
        canPayOrganizerContribution: false,
        ownJoin: { id: confirmedJoin.id, status: 'confirmed' },
      },
    });
    await request(app).get(`/matches/${match.id}`).expect(404);
  });
});

describe('MMP-04 — request to join a match', () => {
  it('AC-MMP-04-1: creates a pending join for an open match', async () => {
    const match = await createMatch({});
    const participantUserId = randomUUID();

    const response = await request(app)
      .post(`/matches/${match.id}/joins`)
      .set('Authorization', `Bearer ${playerToken(participantUserId)}`)
      .expect(201);

    expect(response.body).toMatchObject({
      matchId: match.id,
      participantUserId,
      status: 'pending',
    });
  });

  it('AC-MMP-04-2: rejects a duplicate active join', async () => {
    const match = await createMatch({});
    const participantUserId = randomUUID();
    const token = playerToken(participantUserId);
    await request(app).post(`/matches/${match.id}/joins`).set('Authorization', `Bearer ${token}`).expect(201);

    const response = await request(app)
      .post(`/matches/${match.id}/joins`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(response.body.error.code).toBe('JOIN_ALREADY_ACTIVE');
  });

  it('AC-MMP-04-3: rejects join requests after the match is filled', async () => {
    const match = await createMatch({ status: 'filled' });

    const response = await request(app)
      .post(`/matches/${match.id}/joins`)
      .set('Authorization', `Bearer ${playerToken(randomUUID())}`)
      .expect(409);

    expect(response.body.error.code).toBe('MATCH_NOT_OPEN');
  });
});

describe('MMP-05 — organizer join review', () => {
  async function pendingJoinFixture() {
    const match = await createMatch({});
    const join = await prisma.join.create({
      data: { matchId: match.id, participantUserId: randomUUID() },
    });
    return { match, join };
  }

  it('lists pending requests with participant tier for the organizer', async () => {
    const { match, join } = await pendingJoinFixture();
    passportUserIds.push(join.participantUserId);
    await prisma.passport.create({
      data: {
        userId: join.participantUserId,
        ratingMu: 1500,
        ratingRd: 120,
        ratingSigma: 0.06,
      },
    });

    const response = await request(app)
      .get(`/matches/${match.id}/joins/pending`)
      .set('Authorization', `Bearer ${playerToken(match.organizerUserId)}`)
      .expect(200);

    expect(response.body.joins).toEqual([
      expect.objectContaining({
        id: join.id,
        participantUserId: join.participantUserId,
        status: 'pending',
        participantTier: 'intermediate',
        compatibilityScore: expect.any(Number),
        compatibilityExplanation: expect.any(String),
      }),
    ]);
  });

  it('lets only the organizer reject a pending request', async () => {
    const { match, join } = await pendingJoinFixture();

    await request(app)
      .post(`/matches/${match.id}/joins/${join.id}/reject`)
      .set('Authorization', `Bearer ${playerToken(randomUUID())}`)
      .expect(403);

    const response = await request(app)
      .post(`/matches/${match.id}/joins/${join.id}/reject`)
      .set('Authorization', `Bearer ${playerToken(match.organizerUserId)}`)
      .expect(200);

    expect(response.body).toMatchObject({ id: join.id, status: 'rejected' });
  });

  it('AC-MMP-05-1: organizer approves a pending join and emits JoinApproved', async () => {
    const { match, join } = await pendingJoinFixture();

    const response = await request(app)
      .post(`/matches/${match.id}/joins/${join.id}/approve`)
      .set('Authorization', `Bearer ${playerToken(match.organizerUserId)}`)
      .expect(200);
    eventAggregateIds.push(join.id);

    expect(response.body).toMatchObject({ id: join.id, status: 'approved' });
    expect(response.body.approvedAt).toBeTruthy();
    expect(
      await prisma.outbox.count({
        where: { aggregateId: join.id, eventType: 'JoinApproved' },
      }),
    ).toBe(1);
  });

  it('does not emit JoinApproved for a paid legacy match without MatchCreated', async () => {
    const { match, join } = await pendingJoinFixture();
    await prisma.outbox.deleteMany({
      where: { aggregateId: match.id, eventType: 'MatchCreated' },
    });

    const response = await request(app)
      .post(`/matches/${match.id}/joins/${join.id}/approve`)
      .set('Authorization', `Bearer ${playerToken(match.organizerUserId)}`)
      .expect(409);

    expect(response.body.error.code).toBe('MATCH_FUNDING_NOT_INITIALIZED');
    await expect(prisma.join.findUniqueOrThrow({ where: { id: join.id } })).resolves.toMatchObject({
      status: 'pending', approvedAt: null,
    });
    expect(await prisma.outbox.count({
      where: { aggregateId: join.id, eventType: 'JoinApproved' },
    })).toBe(0);
  });

  it('AC-MMP-05-2: a non-organizer cannot approve', async () => {
    const { match, join } = await pendingJoinFixture();

    const response = await request(app)
      .post(`/matches/${match.id}/joins/${join.id}/approve`)
      .set('Authorization', `Bearer ${playerToken(randomUUID())}`)
      .expect(403);

    expect(response.body.error.code).toBe('MATCH_ORGANIZER_ONLY');
  });

  it('AC-MMP-05-3: an unpaid approval returns to pending after ten minutes', async () => {
    const { join } = await pendingJoinFixture();
    await prisma.join.update({
      where: { id: join.id },
      data: {
        status: 'approved',
        approvedAt: new Date('2026-08-08T00:00:00.000Z'),
      },
    });

    expect(await releaseExpiredApprovedJoins(new Date('2026-08-08T00:10:00.001Z'))).toBe(1);
    await expect(prisma.join.findUniqueOrThrow({ where: { id: join.id } })).resolves.toMatchObject({
      status: 'pending',
      approvedAt: null,
    });
  });
});

describe('MMP-06 — free match confirmation', () => {
  it('AC-MMP-06-3: organizer approval confirms a free join without payment', async () => {
    const match = await createMatch({ capacity: 2 });
    await prisma.match.update({
      where: { id: match.id },
      data: { feePerSlot: 0n },
    });
    const join = await prisma.join.create({
      data: { matchId: match.id, participantUserId: randomUUID() },
    });

    const response = await request(app)
      .post(`/matches/${match.id}/joins/${join.id}/approve`)
      .set('Authorization', `Bearer ${playerToken(match.organizerUserId)}`)
      .expect(200);
    eventAggregateIds.push(join.id);

    expect(response.body).toMatchObject({
      status: 'confirmed',
      feePaidAt: null,
    });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'filled' });
  });

  it('AC-MMP-06-3: concurrent free approvals cannot exceed capacity', async () => {
    const match = await createMatch({});
    await prisma.match.update({
      where: { id: match.id },
      data: { capacity: 2, feePerSlot: 0n },
    });
    const joins = await Promise.all(
      [randomUUID(), randomUUID()].map((participantUserId) =>
        prisma.join.create({ data: { matchId: match.id, participantUserId } }),
      ),
    );
    eventAggregateIds.push(...joins.map((join) => join.id));
    const token = playerToken(match.organizerUserId);

    const responses = await Promise.all(
      joins.map((join) =>
        request(app).post(`/matches/${match.id}/joins/${join.id}/approve`).set('Authorization', `Bearer ${token}`),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)!.body.error.code).toBe('MATCH_FULL');
    expect(
      await prisma.join.count({
        where: { matchId: match.id, status: 'confirmed' },
      }),
    ).toBe(1);
  });
});

describe('join expiry scheduler lifecycle', () => {
  it('waits for an in-flight sweep before shutdown completes', async () => {
    let releaseSweep!: () => void;
    let sweepStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      sweepStarted = resolve;
    });
    const blockedSweep = new Promise<void>((resolve) => {
      releaseSweep = resolve;
    });
    const stop = startJoinExpiryScheduler(1, async () => {
      sweepStarted();
      await blockedSweep;
      return 0;
    });
    await started;

    let stopped = false;
    const stopping = stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    releaseSweep();
    await stopping;
    expect(stopped).toBe(true);
  });
});
