import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import type { VenueBookingClient, VenueMatchContext } from '../src/clients/venueBooking.js';
import type { AccountClient } from '../src/clients/account.js';
import { releaseExpiredApprovedJoins, startJoinExpiryScheduler } from '../src/domain/joins.js';
import { handleShutdownBookingCancellation } from '../src/lib/matchLifecycleEventConsumer.js';

class FakeVenueBookingClient implements VenueBookingClient {
  readonly contexts = new Map<string, VenueMatchContext>();
  readonly bookingConflicts: Array<{
    bookingId: string; startAt: string; endAt: string;
    court: { id: string; name: string }; venue: { id: string; name: string; address: string };
  }> = [];

  async getMatchContext(bookingId: string): Promise<VenueMatchContext | null> {
    return this.contexts.get(bookingId) ?? null;
  }

  async createBookingFromHold(holdId: string): Promise<string> {
    // Test map context dưới cùng id với holdId để mô phỏng booking-từ-hold.
    return holdId;
  }

  async activateMatchHold(): Promise<void> {}

  async cancelConfirmedBooking(): Promise<{ refundPercent: number }> {
    return { refundPercent: 50 };
  }

  async getPlayerScheduleConflicts() {
    return this.bookingConflicts;
  }
}

class FakeAccountClient implements AccountClient {
  readonly displayNames = new Map<string, string>();

  async getPublicMatchProfile(userId: string) {
    const displayName = this.displayNames.get(userId);
    return displayName ? { userId, displayName, avatarUrl: null, identityVisibility: 'public' as const } : null;
  }
}

const venueBookingClient = new FakeVenueBookingClient();
const accountClient = new FakeAccountClient();
const app = createApp({ venueBookingClient, accountClient });
const bookingIds: string[] = [];
const createdMatchIds: string[] = [];
const passportUserIds: string[] = [];
const eventAggregateIds: string[] = [];
const shutdownEventIds: string[] = [];

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
    providerUserId: randomUUID(),
    provinceCode: 'ho-chi-minh',
  };
}

async function createMatch(input: {
  capacity?: number;
  status?: 'awaiting_deposit' | 'open' | 'filled';
  cutoffAt?: Date;
  skillMin?: 'newcomer' | 'beginner' | 'intermediate' | 'intermediate_plus' | 'advanced';
  skillMax?: 'newcomer' | 'beginner' | 'intermediate' | 'intermediate_plus' | 'advanced';
  skillConfiguredAt?: Date | null;
  organizerContributionPaidAt?: Date | null;
}) {
  const bookingId = randomUUID();
  bookingIds.push(bookingId);
  venueBookingClient.contexts.set(bookingId, context(bookingId, new Date(Date.now() + 3 * 60 * 60_000)));
  const match = await prisma.match.create({
    data: {
      organizerUserId: randomUUID(),
      bookingId,
      capacity: input.capacity ?? 4,
      discipline: (input.capacity ?? 4) === 4 ? 'doubles' : 'singles',
      feePerSlot: 100000n,
      cutoffAt: input.cutoffAt ?? new Date(Date.now() + 2 * 60 * 60_000),
      deadlineAt: input.cutoffAt ?? new Date(Date.now() + 2 * 60 * 60_000),
      status: input.status ?? 'open',
      skillMin: input.skillMin,
      skillMax: input.skillMax,
      skillConfiguredAt: input.skillConfiguredAt === undefined ? new Date() : input.skillConfiguredAt,
      organizerContributionPaidAt: input.organizerContributionPaidAt,
    },
  });
  // approveJoin đòi MatchCreated đã ghi outbox cho kèo có phí (dữ liệu funding).
  await prisma.outbox.create({
    data: {
      aggregateType: 'Match', aggregateId: match.id, eventType: 'MatchCreated',
      payload: { matchId: match.id, bookingId, capacity: match.capacity, feePerSlot: '100000' },
    },
  });
  createdMatchIds.push(match.id);
  return match;
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
  venueBookingClient.bookingConflicts.length = 0;
  accountClient.displayNames.clear();
});

afterAll(async () => {
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: shutdownEventIds } } });
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

describe('player schedule conflict warnings', () => {
  it('combines active match participation with owned booking conflicts', async () => {
    const userId = randomUUID();
    const match = await createMatch({ capacity: 2 });
    await prisma.match.update({ where: { id: match.id }, data: { organizerUserId: userId } });
    const matchContext = venueBookingClient.contexts.get(match.bookingId)!;
    venueBookingClient.bookingConflicts.push({
      bookingId: randomUUID(),
      startAt: matchContext.startAt,
      endAt: matchContext.endAt,
      court: { id: randomUUID(), name: 'Sân đặt riêng' },
      venue: { id: randomUUID(), name: 'Cơ sở B', address: 'Quận 3' },
    });

    const response = await request(app)
      .get('/matches/me/schedule-conflicts')
      .query({ startAt: matchContext.startAt, endAt: matchContext.endAt })
      .set('Authorization', `Bearer ${playerToken(userId)}`)
      .expect(200);

    expect(response.body.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'match', role: 'organizer', startAt: matchContext.startAt }),
      expect.objectContaining({ kind: 'booking', role: 'booker', venue: expect.objectContaining({ name: 'Cơ sở B' }) }),
    ]));
  });
});

describe('operational shutdown match cancellation', () => {
  it('withdraws every active join but notifies only the organizer and approved participants', async () => {
    const match = await createMatch({ status: 'filled', organizerContributionPaidAt: new Date() });
    const joinUsers = ['pending', 'approved', 'confirmed', 'rejected'].map(() => randomUUID());
    const statuses = ['pending', 'approved', 'confirmed', 'rejected'] as const;
    const joins = await Promise.all(statuses.map((status, index) => prisma.join.create({
      data: {
        matchId: match.id,
        participantUserId: joinUsers[index]!,
        status,
        ...(status === 'approved' || status === 'confirmed' ? { feePaidAt: new Date() } : {}),
      },
    })));
    const eventId = randomUUID();
    shutdownEventIds.push(eventId);
    const notifiedUsers = [match.organizerUserId, ...joinUsers.slice(1, 3)];
    const notificationIds = notifiedUsers.map((userId) => `match.shutdown_emergency:${match.id}:${userId}`);
    eventAggregateIds.push(...notificationIds);
    const payload = {
      bookingId: match.bookingId,
      shutdownId: randomUUID(),
      mode: 'emergency' as const,
      bookingBusinessCode: 'BK-00004219',
      wasConfirmed: false,
    };

    await handleShutdownBookingCancellation(eventId, payload);
    await handleShutdownBookingCancellation(eventId, payload);

    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'cancelled' });
    const storedJoins = await prisma.join.findMany({ where: { id: { in: joins.map((join) => join.id) } }, orderBy: { id: 'asc' } });
    expect(storedJoins.map((join) => join.status).sort()).toEqual(['rejected', 'withdrawn', 'withdrawn', 'withdrawn'].sort());
    expect(await prisma.outbox.count({ where: { aggregateId: match.id, eventType: 'MatchCancelled' } })).toBe(1);
    const notifications = await prisma.outbox.findMany({ where: { aggregateId: { in: notificationIds }, eventType: 'UserNotificationRequested' } });
    expect(notifications).toHaveLength(3);
    expect(notifications.map((item) => (item.payload as { bookingBusinessCode: string }).bookingBusinessCode))
      .toEqual(Array(3).fill(payload.bookingBusinessCode));
    const cancellation = await prisma.outbox.findFirstOrThrow({ where: { aggregateId: match.id, eventType: 'MatchCancelled' } });
    expect((cancellation.payload as { paidJoinIds: string[] }).paidJoinIds.sort())
      .toEqual([joins[1]!.id, joins[2]!.id].sort());
  });
});

describe('MMP-01 — public match search', () => {
  it('D50: keeps open and filled matches visible in the public list', async () => {
    await Promise.all([createMatch({}), createMatch({}), createMatch({}), createMatch({ status: 'filled' })]);

    const response = await request(app).get('/matches').expect(200);

    expect(response.body.matches).toHaveLength(4);
    expect(response.body.matches.every((match: { businessCode?: string }) => /^KEO-\d{8}$/.test(match.businessCode ?? ''))).toBe(true);
    expect(response.body.matches.filter((match: { status: string }) => match.status === 'filled')).toHaveLength(1);
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
  it('AC-MMP-02-1: kèo đơn cọc — tạo từ hold tạo booking awaiting_deposit, cọc = 1/2', async () => {
    const organizerUserId = randomUUID();
    const holdId = randomUUID(); // fake: createBookingFromHold trả chính holdId làm bookingId
    bookingIds.push(holdId);
    const slot = context(holdId, new Date(Date.now() + 48 * 60 * 60_000)); // >= 24h (DM3)
    venueBookingClient.contexts.set(holdId, { ...slot, ownerUserId: organizerUserId });

    const response = await request(app)
      .post('/matches')
      .set('Authorization', `Bearer ${playerToken(organizerUserId)}`)
      .send({ holdId, mode: 'friendly', discipline: 'singles', ratio: '5:5', format: 'bo3' })
      .expect(201);
    createdMatchIds.push(response.body.id);

    expect(response.body).toMatchObject({
      organizerUserId,
      bookingId: holdId,
      capacity: 2,
      feePerSlot: '200000', // price 400000 / 2 (đối trả 1/2)
      status: 'awaiting_deposit',
    });
    expect(new Date(response.body.cutoffAt).getTime()).toBeGreaterThan(Date.now());
    expect(
      await prisma.outbox.count({
        where: { aggregateId: response.body.id, eventType: 'MatchCreated' },
      }),
    ).toBe(1);
  });

  it('AC-MMP-02-2: rejects a booking not held by the organizer', async () => {
    const organizerUserId = randomUUID();
    const holdId = randomUUID();
    bookingIds.push(holdId);
    venueBookingClient.contexts.set(holdId, context(holdId, new Date(Date.now() + 48 * 60 * 60_000)));

    const response = await request(app)
      .post('/matches')
      .set('Authorization', `Bearer ${playerToken(organizerUserId)}`)
      .send({ holdId, mode: 'friendly', discipline: 'singles', ratio: '5:5', format: 'bo3' })
      .expect(422);

    expect(response.body.error.code).toBe('MATCH_SLOT_NOT_HELD');
  });

  it('DM3: rejects a slot less than 24h away', async () => {
    const organizerUserId = randomUUID();
    const holdId = randomUUID();
    bookingIds.push(holdId);
    const slot = context(holdId, new Date(Date.now() + 3 * 60 * 60_000)); // chỉ 3h
    venueBookingClient.contexts.set(holdId, { ...slot, ownerUserId: organizerUserId });

    const response = await request(app)
      .post('/matches')
      .set('Authorization', `Bearer ${playerToken(organizerUserId)}`)
      .send({ holdId, mode: 'friendly', discipline: 'singles', ratio: '5:5', format: 'bo3' })
      .expect(422);

    expect(response.body.error.code).toBe('MATCH_LEAD_TOO_SHORT');
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

  it('AC-MMP-02-4: client không còn tự đặt capacity/feeMode -> từ chối', async () => {
    const organizerUserId = randomUUID();
    const holdId = randomUUID();
    bookingIds.push(holdId);
    const slot = context(holdId, new Date(Date.now() + 48 * 60 * 60_000));
    venueBookingClient.contexts.set(holdId, { ...slot, ownerUserId: organizerUserId });

    const response = await request(app)
      .post('/matches')
      .set('Authorization', `Bearer ${playerToken(organizerUserId)}`)
      .send({ holdId, capacity: 2, feeMode: 'free' })
      .expect(400);

    // v2: capacity/phí do server suy ra; trường cũ bị từ chối bởi schema strict.
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
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
      data: { discipline: match.discipline,
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
        avatarUrl: null,
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

    expect(response.body.actions).toMatchObject({
      canJoin: false,
      isOrganizer: false,
      canPayOrganizerContribution: false,
      ownJoin: null,
    });
  });

  it('returns the requester active JOIN so the client can render the durable state machine', async () => {
    const match = await detailFixture();
    const participantUserId = randomUUID();
    const approvedAt = new Date();
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

    expect(response.body.actions).toMatchObject({
      canJoin: false,
      isOrganizer: false,
      canPayOrganizerContribution: false,
      ownJoin: {
        id: join.id,
        status: 'approved',
        approvedAt: approvedAt.toISOString(),
      },
    });
  });

  it('identifies the organizer without exposing another player JOIN', async () => {
    const match = await detailFixture();

    const response = await request(app)
      .get(`/matches/${match.id}`)
      .set('Authorization', `Bearer ${playerToken(match.organizerUserId)}`)
      .expect(200);

    expect(response.body.actions).toMatchObject({
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
      canPayOrganizerContribution: false,
    });
    await request(app).get(`/matches/${match.id}`).expect(200);
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
    await request(app).get(`/matches/${match.id}`).expect(200);
  });

  it('D50: exposes a confirmed match in booking history to both members', async () => {
    const match = await createMatch({});
    const participantUserId = randomUUID();
    await prisma.match.update({ where: { id: match.id }, data: { status: 'confirmed' } });
    await prisma.join.create({ data: { matchId: match.id, participantUserId, status: 'confirmed' } });

    for (const userId of [match.organizerUserId, participantUserId]) {
      const response = await request(app)
        .get('/matches/me/history')
        .set('Authorization', `Bearer ${playerToken(userId)}`)
        .expect(200);
      expect(response.body.matches).toContainEqual(expect.objectContaining({
        id: match.id,
        status: 'confirmed',
        participationLabel: 'Kèo đã tham gia',
      }));
    }
  });
});

describe('MMP-04 — reserve a slot and pay', () => {
  it('D50: creates an approved join and opens the 10-minute payment window immediately', async () => {
    const match = await createMatch({});
    const participantUserId = randomUUID();

    const response = await request(app)
      .post(`/matches/${match.id}/joins`)
      .set('Authorization', `Bearer ${playerToken(participantUserId)}`)
      .send({ teamSide: 'B' })
      .expect(201);

    expect(response.body).toMatchObject({
      matchId: match.id,
      participantUserId,
      status: 'approved',
    });
    expect(response.body.approvedAt).toBeTruthy();
    const event = await prisma.outbox.findFirstOrThrow({
      where: { aggregateId: response.body.id, eventType: 'JoinApproved' },
    });
    eventAggregateIds.push(response.body.id);
    expect(new Date((event.payload as { expiresAt: string }).expiresAt).getTime() - new Date(response.body.approvedAt).getTime()).toBe(10 * 60_000);
  });

  it('AC-MMP-04-2: rejects a duplicate active join', async () => {
    const match = await createMatch({});
    const participantUserId = randomUUID();
    const token = playerToken(participantUserId);
    const created = await request(app).post(`/matches/${match.id}/joins`).set('Authorization', `Bearer ${token}`).send({ teamSide: 'B' }).expect(201);
    eventAggregateIds.push(created.body.id);

    const response = await request(app)
      .post(`/matches/${match.id}/joins`)
      .set('Authorization', `Bearer ${token}`)
      .send({ teamSide: 'B' })
      .expect(409);

    expect(response.body.error.code).toBe('JOIN_ALREADY_ACTIVE');
  });

  it('AC-MMP-04-3: rejects join requests after the match is filled', async () => {
    const match = await createMatch({ status: 'filled' });

    const response = await request(app)
      .post(`/matches/${match.id}/joins`)
      .set('Authorization', `Bearer ${playerToken(randomUUID())}`)
      .send({ teamSide: 'B' })
      .expect(409);

    expect(response.body.error.code).toBe('MATCH_NOT_OPEN');
  });

  it('D50: only the first concurrent player reserves the last slot', async () => {
    const match = await createMatch({ capacity: 2 });
    const responses = await Promise.all([randomUUID(), randomUUID()].map((userId) =>
      request(app).post(`/matches/${match.id}/joins`).set('Authorization', `Bearer ${playerToken(userId)}`).send({ teamSide: 'B' }),
    ));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.join.count({ where: { matchId: match.id, status: 'approved' } })).toBe(1);
    eventAggregateIds.push(responses.find((response) => response.status === 201)!.body.id);
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
      data: { discipline: match.discipline,
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

  it('D50: an unpaid slot is rejected and released after the 10-minute payment window', async () => {
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
      status: 'rejected',
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

describe('post-payment skill setup', () => {
  it('hides an unconfigured match, then publishes it after organizer setup', async () => {
    const match = await createMatch({
      capacity: 2,
      status: 'open',
      skillConfiguredAt: null,
      organizerContributionPaidAt: new Date(),
    });
    const token = playerToken(match.organizerUserId);

    const before = await request(app).get('/matches').expect(200);
    expect(before.body.matches).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: match.id })]));

    const configured = await request(app)
      .patch(`/matches/${match.id}/skill-range`)
      .set('Authorization', `Bearer ${token}`)
      .send({ skillMin: 'beginner', skillMax: 'intermediate_plus' })
      .expect(200);
    expect(configured.body).toMatchObject({ id: match.id, skillMin: 'beginner', skillMax: 'intermediate_plus' });

    await request(app)
      .patch(`/matches/${match.id}/skill-range`)
      .set('Authorization', `Bearer ${token}`)
      .send({ skillMin: 'beginner', skillMax: 'intermediate_plus' })
      .expect(200);
    await request(app)
      .patch(`/matches/${match.id}/skill-range`)
      .set('Authorization', `Bearer ${token}`)
      .send({ skillMin: 'newcomer', skillMax: 'advanced' })
      .expect(409);

    const after = await request(app).get('/matches').expect(200);
    expect(after.body.matches).toEqual(expect.arrayContaining([expect.objectContaining({ id: match.id })]));
  });

  it('rejects an invalid range and a non-organizer', async () => {
    const match = await createMatch({ status: 'open', skillConfiguredAt: null, organizerContributionPaidAt: new Date() });
    await request(app)
      .patch(`/matches/${match.id}/skill-range`)
      .set('Authorization', `Bearer ${playerToken(match.organizerUserId)}`)
      .send({ skillMin: 'advanced', skillMax: 'beginner' })
      .expect(422);
    await request(app)
      .patch(`/matches/${match.id}/skill-range`)
      .set('Authorization', `Bearer ${playerToken(randomUUID())}`)
      .send({ skillMin: 'beginner', skillMax: 'advanced' })
      .expect(403);
  });
});

describe('Competitive matches v2 — create from hold or paid booking, choose a team', () => {
  const body = { mode: 'friendly', discipline: 'doubles', ratio: '6:4', format: 'bo3' } as const;
  function paidBooking(organizerUserId: string, overrides: Partial<VenueMatchContext> = {}) {
    const bookingId = randomUUID();
    bookingIds.push(bookingId);
    const slot = context(bookingId, new Date(Date.now() + 72 * 3_600_000));
    venueBookingClient.contexts.set(bookingId, {
      ...slot, ownerUserId: organizerUserId, status: 'confirmed', holdExpiresAt: null, priceSnapshot: '200001', ...overrides,
    });
    return bookingId;
  }

  it('AC-CM-01/06: a paid booking opens immediately without touching the booking and shows the owner rebalance', async () => {
    const organizerUserId = randomUUID();
    accountClient.displayNames.set(organizerUserId, 'Minh Anh');
    const bookingId = paidBooking(organizerUserId);
    let holdConversions = 0;
    const original = venueBookingClient.createBookingFromHold.bind(venueBookingClient);
    venueBookingClient.createBookingFromHold = async (holdId: string) => { holdConversions += 1; return original(holdId); };
    try {
      const response = await request(app).post('/matches').set('Authorization', `Bearer ${playerToken(organizerUserId)}`)
        .send({ bookingId, ...body }).expect(201);
      createdMatchIds.push(response.body.id);
      expect(response.body).toMatchObject({
        status: 'open', sourceType: 'paid_booking', discipline: 'doubles', ratio: '6:4', capacity: 4, feePerSlot: '60000',
        bookingPrice: '200001', provinceCode: 'ho-chi-minh',
        funding: {
          bookingPrice: '200001', totalContribution: '240001', resultHeldAmount: '40000', regularSlotAmount: '60000',
          organizerContribution: '60001', viewerAdditionalAmountDue: '0', organizerRefundAtLock: '140000', organizerRefundWithdrawable: true,
        },
      });
      expect(holdConversions).toBe(0);
      const event = await prisma.outbox.findFirstOrThrow({ where: { aggregateId: response.body.id, eventType: 'MatchCreated' } });
      expect(event.payload).toMatchObject({
        sourceType: 'paid_booking', mode: 'friendly', discipline: 'doubles', ratio: '6:4', teamSize: 2,
        bookingPrice: '200001', resultReserve: '40000', totalContribution: '240001', feePerSlot: '60000', organizerContribution: '60001',
      });
      expect(event.payload).not.toHaveProperty('depositExpiresAt');

      const stranger = await request(app).get(`/matches/${response.body.id}`).set('Authorization', `Bearer ${playerToken(randomUUID())}`).expect(200);
      expect(stranger.body.funding).toMatchObject({ regularSlotAmount: '60000', viewerAdditionalAmountDue: '60000', organizerContribution: null, organizerRefundAtLock: null });
      expect(stranger.body.actions).toMatchObject({ canJoinTeamA: true, canJoinTeamB: true });
      expect(stranger.body.teamSlots).toEqual([{ side: 'A', size: 2, open: 1 }, { side: 'B', size: 2, open: 2 }]);
    } finally {
      venueBookingClient.createBookingFromHold = original;
    }
  });

  it('rejects a paid booking owned by someone else, ranked without province, and BO5 on a 60-minute booking', async () => {
    const organizerUserId = randomUUID();
    const token = `Bearer ${playerToken(organizerUserId)}`;
    const foreign = paidBooking(randomUUID());
    expect((await request(app).post('/matches').set('Authorization', token).send({ bookingId: foreign, ...body }).expect(422)).body.error.code).toBe('MATCH_BOOKING_NOT_OWNED');
    const noProvince = paidBooking(organizerUserId, { provinceCode: null });
    expect((await request(app).post('/matches').set('Authorization', token).send({ bookingId: noProvince, ...body, mode: 'ranked' }).expect(422)).body.error.code).toBe('MATCH_PROVINCE_REQUIRED');
    const short = paidBooking(organizerUserId);
    expect((await request(app).post('/matches').set('Authorization', token).send({ bookingId: short, ...body, format: 'bo5' }).expect(422)).body.error.code).toBe('MATCH_FORMAT_NOT_ALLOWED');
  });

  it('AC-CM-02: a retried create returns the same match and a different config for the same booking is refused', async () => {
    const organizerUserId = randomUUID();
    const token = `Bearer ${playerToken(organizerUserId)}`;
    const bookingId = paidBooking(organizerUserId);
    const first = await request(app).post('/matches').set('Authorization', token).send({ bookingId, ...body }).expect(201);
    createdMatchIds.push(first.body.id);
    const retry = await request(app).post('/matches').set('Authorization', token).send({ bookingId, ...body }).expect(201);
    expect(retry.body.id).toBe(first.body.id);
    await request(app).post('/matches').set('Authorization', token).send({ bookingId, ...body, ratio: '7:3' }).expect(409);
    expect(await prisma.match.count({ where: { bookingId } })).toBe(1);
  });

  it('BR-CM-05: doubles keeps one A slot and two B slots under concurrent joins; singles has no A slot', async () => {
    const doubles = await createMatch({ capacity: 4 });
    const joinAs = (side: 'A' | 'B') => request(app).post(`/matches/${doubles.id}/joins`)
      .set('Authorization', `Bearer ${playerToken(randomUUID())}`).send({ teamSide: side });
    const lastA = await Promise.all([joinAs('A'), joinAs('A')]);
    expect(lastA.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(lastA.find((r) => r.status === 409)!.body.error.code).toBe('MATCH_TEAM_FULL');
    const b = await Promise.all([joinAs('B'), joinAs('B')]);
    expect(b.map((r) => r.status)).toEqual([201, 201]);
    expect(await prisma.join.groupBy({ by: ['teamSide'], where: { matchId: doubles.id, status: 'approved' }, _count: true }))
      .toEqual(expect.arrayContaining([{ teamSide: 'A', _count: 1 }, { teamSide: 'B', _count: 2 }]));
    const event = await prisma.outbox.findFirstOrThrow({ where: { aggregateId: lastA.find((r) => r.status === 201)!.body.id, eventType: 'JoinApproved' } });
    expect(event.payload).toMatchObject({ teamSide: 'A' });
    eventAggregateIds.push(...[...lastA, ...b].filter((r) => r.status === 201).map((r) => r.body.id));

    const singles = await createMatch({ capacity: 2 });
    const refused = await request(app).post(`/matches/${singles.id}/joins`).set('Authorization', `Bearer ${playerToken(randomUUID())}`).send({ teamSide: 'A' }).expect(409);
    expect(refused.body.error.code).toBe('MATCH_TEAM_FULL');
    await request(app).post(`/matches/${singles.id}/joins`).set('Authorization', `Bearer ${playerToken(randomUUID())}`).send({}).expect(400);
  });
});

describe('Competitive matches v2 — payment action closes at the lock deadline', () => {
  it('turns canPay off once cutoffAt has passed even while the 10-minute JOIN hold is still running', async () => {
    const match = await createMatch({ capacity: 2 });
    accountClient.displayNames.set(match.organizerUserId, 'Chủ kèo');
    const participantUserId = randomUUID();
    await prisma.join.create({ data: { matchId: match.id, participantUserId, status: 'approved', approvedAt: new Date(), teamSide: 'B' } });
    const detail = () => request(app).get(`/matches/${match.id}`).set('Authorization', `Bearer ${playerToken(participantUserId)}`).expect(200);

    expect((await detail()).body.actions.canPay).toBe(true);
    await prisma.match.update({ where: { id: match.id }, data: { cutoffAt: new Date(Date.now() - 60_000) } });
    expect((await detail()).body.actions).toMatchObject({ canPay: false, canWithdrawBeforeLock: false });
  });
});

describe('G5 — funding preview for the create screen', () => {
  it('returns the organizer money flow from the backend formula', async () => {
    const response = await request(app).get('/matches/funding-preview?price=200000&ratio=7:3&discipline=singles&sourceType=paid_booking').expect(200);
    expect(response.body.preview).toEqual({
      bookingPrice: '200000', resultHeldAmount: '80000', regularSlotAmount: '140000', organizerContribution: '140000',
      alreadyPaid: '200000', additionalOwnerCharge: '0', organizerRefundAtLock: '60000', netCostIfWin: '60000', netCostIfLose: '140000',
    });
    const hold = await request(app).get('/matches/funding-preview?price=200000&ratio=6:4&discipline=doubles&sourceType=hold').expect(200);
    expect(hold.body.preview).toMatchObject({ additionalOwnerCharge: hold.body.preview.organizerContribution, alreadyPaid: '0', organizerRefundAtLock: '0' });
    await request(app).get('/matches/funding-preview?price=0&ratio=7:3&discipline=singles&sourceType=hold').expect(400);
  });
});
