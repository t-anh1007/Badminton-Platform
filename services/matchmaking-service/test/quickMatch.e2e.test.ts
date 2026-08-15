import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { attachQuickMatchGateway } from '../src/lib/quickMatchGateway.js';
import { prisma } from '../src/lib/prisma.js';
import type { VenueBookingClient, VenueMatchContext } from '../src/clients/venueBooking.js';
import type { MatchBookingResolutionPayload } from '@khoaluantn/shared';

class FakeVenueBookingClient implements VenueBookingClient {
  readonly contexts = new Map<string, VenueMatchContext>();

  async getMatchContext(bookingId: string): Promise<VenueMatchContext | null> {
    return this.contexts.get(bookingId) ?? null;
  }

  async createBookingFromHold(): Promise<string> {
    throw new Error('not configured for quick-match tests');
  }

  async cancelConfirmedBooking(): Promise<{ refundPercent: number }> {
    return { refundPercent: 50 };
  }

  async resolveMatchBooking(): Promise<MatchBookingResolutionPayload> {
    throw new Error('not configured for quick-match tests');
  }
}

const venueBookingClient = new FakeVenueBookingClient();
const createdMatchIds: string[] = [];
const createdJoinIds: string[] = [];
let httpServer: HttpServer | undefined;
let closeGateway: (() => Promise<void>) | undefined;
const clients: Socket[] = [];

function playerToken(userId: string): string {
  return jwt.sign(
    { sub: userId, roles: ['player'], type: 'access' },
    process.env.JWT_SECRET ?? 'change-me-in-real-env',
    { expiresIn: 300 },
  );
}

async function startGateway(): Promise<string> {
  httpServer = createServer(createApp({ venueBookingClient }));
  closeGateway = attachQuickMatchGateway(httpServer, venueBookingClient);
  await new Promise<void>((resolve) => httpServer!.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return `http://127.0.0.1:${address.port}`;
}

function connect(url: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    clients.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

async function createOneSlotMatch() {
  const bookingId = randomUUID();
  venueBookingClient.contexts.set(bookingId, {
    bookingId,
    ownerUserId: randomUUID(),
    status: 'held',
    priceSnapshot: '200000',
    startAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    endAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
    holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    court: { id: randomUUID(), name: 'Sân 1' },
    venue: { id: randomUUID(), name: 'Sân cầu lông', address: 'Quận 1', lat: 10.77, lng: 106.7 },
  });
  const match = await prisma.match.create({
    data: {
      organizerUserId: venueBookingClient.contexts.get(bookingId)!.ownerUserId,
      bookingId,
      capacity: 2,
      feePerSlot: 100000n,
      cutoffAt: new Date(Date.now() + 2 * 60 * 60_000),
      status: 'open',
    },
  });
  createdMatchIds.push(match.id);
  return match;
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await closeGateway?.();
  closeGateway = undefined;
  await new Promise<void>((resolve) => httpServer?.close(() => resolve()) ?? resolve());
  httpServer = undefined;
  if (createdMatchIds.length > 0) {
    const ids = createdMatchIds.splice(0);
    await prisma.outbox.deleteMany({ where: { aggregateId: { in: [...ids, ...createdJoinIds.splice(0)] } } });
    await prisma.matchResolution.deleteMany({ where: { matchId: { in: ids } } });
    await prisma.join.deleteMany({ where: { matchId: { in: ids } } });
    await prisma.match.deleteMany({ where: { id: { in: ids } } });
  }
  venueBookingClient.contexts.clear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('F-03 — live quick match', () => {
  it('AC-F03-1: a player receives a real-time proposal for an open match with one slot', async () => {
    const match = await createOneSlotMatch();
    const url = await startGateway();
    const socket = await connect(url, playerToken(randomUUID()));

    const requestId = randomUUID();
    const progress = once<{ requestId: string; phase: string; scannedCount: number }>(socket, 'quick_match:progress');
    const proposal = once<{ requestId: string; matchId: string; openSlots: number }>(socket, 'quick_match:proposal');
    socket.emit('quick_match:find', { requestId });

    await expect(progress).resolves.toMatchObject({ requestId, phase: 'starting', scannedCount: 0 });
    await expect(proposal).resolves.toMatchObject({ requestId, matchId: match.id, openSlots: 1 });
  });

  it('AC-F03-2: accepting a proposal creates the ordinary pending JOIN and payment-approval flow', async () => {
    const match = await createOneSlotMatch();
    const participantUserId = randomUUID();
    const url = await startGateway();
    const socket = await connect(url, playerToken(participantUserId));

    const requestId = randomUUID();
    const proposal = once<{ matchId: string }>(socket, 'quick_match:proposal');
    socket.emit('quick_match:find', { requestId });
    await proposal;
    const joined = once<{ requestId: string; id: string; matchId: string; participantUserId: string; status: string }>(socket, 'quick_match:joined');
    socket.emit('quick_match:accept', { requestId, matchId: match.id });
    socket.emit('quick_match:accept', { requestId, matchId: match.id });

    const join = await joined;
    createdJoinIds.push(join.id);
    expect(join).toMatchObject({ requestId, matchId: match.id, participantUserId, status: 'pending' });

    const pendingResponse = await fetch(`${url}/matches/${match.id}/joins/pending`, {
      headers: { authorization: `Bearer ${playerToken(match.organizerUserId)}` },
    });
    expect(pendingResponse.status).toBe(200);
    await expect(pendingResponse.json()).resolves.toMatchObject({
      joins: [expect.objectContaining({ id: join.id, participantUserId, status: 'pending' })],
    });

    const approvalResponse = await fetch(`${url}/matches/${match.id}/joins/${join.id}/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${playerToken(match.organizerUserId)}` },
    });
    expect(approvalResponse.status).toBe(200);
    const approvedJoin = await approvalResponse.json() as { id: string; status: string; approvedAt: string };
    expect(approvedJoin).toMatchObject({ id: join.id, status: 'approved' });
    const approvalEvent = await prisma.outbox.findFirstOrThrow({
      where: { aggregateId: join.id, eventType: 'JoinApproved' },
    });
    expect((approvalEvent.payload as { expiresAt: string }).expiresAt)
      .toBe(new Date(new Date(approvedJoin.approvedAt).getTime() + 10 * 60_000).toISOString());
  });

  it('AC-F03-3: two WS candidates for the final slot leave only one 10-minute payment hold', async () => {
    const match = await createOneSlotMatch();
    const url = await startGateway();
    const participants = [randomUUID(), randomUUID()];
    const sockets = await Promise.all(participants.map((userId) => connect(url, playerToken(userId))));

    const joins = await Promise.all(sockets.map(async (socket) => {
      const requestId = randomUUID();
      const proposal = once<{ matchId: string }>(socket, 'quick_match:proposal');
      socket.emit('quick_match:find', { requestId });
      await proposal;
      const joined = once<{ id: string; participantUserId: string; status: string }>(socket, 'quick_match:joined');
      socket.emit('quick_match:accept', { requestId, matchId: match.id });
      return joined;
    }));
    createdJoinIds.push(...joins.map((join) => join.id));
    expect(joins.map((join) => join.status)).toEqual(['pending', 'pending']);

    const approvalResponses = await Promise.all(joins.map(async (join) => {
      const response = await fetch(`${url}/matches/${match.id}/joins/${join.id}/approve`, {
        method: 'POST',
        headers: { authorization: `Bearer ${playerToken(match.organizerUserId)}` },
      });
      return { status: response.status, body: await response.json() };
    }));

    expect(approvalResponses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(approvalResponses.find((response) => response.status === 200)!.body).toMatchObject({ status: 'approved' });
    expect(approvalResponses.find((response) => response.status === 409)!.body.error.code).toBe('MATCH_FULL');
  });

  it('stops a request and never accepts its stale proposal', async () => {
    const match = await createOneSlotMatch();
    const participantUserId = randomUUID();
    const url = await startGateway();
    const socket = await connect(url, playerToken(participantUserId));
    const requestId = randomUUID();
    const proposal = once<{ matchId: string }>(socket, 'quick_match:proposal');
    socket.emit('quick_match:find', { requestId });
    await expect(proposal).resolves.toMatchObject({ matchId: match.id });
    const stopped = once<{ requestId: string }>(socket, 'quick_match:stopped');
    socket.emit('quick_match:stop', { requestId });
    await expect(stopped).resolves.toEqual({ requestId });
    const error = once<{ requestId: string; code: string }>(socket, 'quick_match:error');
    socket.emit('quick_match:accept', { requestId, matchId: match.id });
    await expect(error).resolves.toMatchObject({ requestId, code: 'QUICK_MATCH_PROPOSAL_EXPIRED' });
    expect(await prisma.join.count({ where: { matchId: match.id, participantUserId } })).toBe(0);
  });

  it('AC-F03-4: disconnecting after a proposal leaves no ghost place or unpaid hold', async () => {
    const match = await createOneSlotMatch();
    const url = await startGateway();
    const disconnectedPlayer = await connect(url, playerToken(randomUUID()));

    const disconnectedRequestId = randomUUID();
    const proposal = once<{ matchId: string }>(disconnectedPlayer, 'quick_match:proposal');
    disconnectedPlayer.emit('quick_match:find', { requestId: disconnectedRequestId });
    await expect(proposal).resolves.toMatchObject({ matchId: match.id });
    const disconnected = once<void>(disconnectedPlayer, 'disconnect');
    disconnectedPlayer.disconnect();
    await disconnected;

    const nextPlayerId = randomUUID();
    const nextPlayer = await connect(url, playerToken(nextPlayerId));
    const nextRequestId = randomUUID();
    const nextProposal = once<{ matchId: string }>(nextPlayer, 'quick_match:proposal');
    nextPlayer.emit('quick_match:find', { requestId: nextRequestId });
    await nextProposal;
    const joined = once<{ id: string; participantUserId: string; status: string }>(nextPlayer, 'quick_match:joined');
    nextPlayer.emit('quick_match:accept', { requestId: nextRequestId, matchId: match.id });

    const join = await joined;
    createdJoinIds.push(join.id);
    expect(join).toMatchObject({ participantUserId: nextPlayerId, status: 'pending' });
    const pendingResponse = await fetch(`${url}/matches/${match.id}/joins/pending`, {
      headers: { authorization: `Bearer ${playerToken(match.organizerUserId)}` },
    });
    await expect(pendingResponse.json()).resolves.toMatchObject({
      joins: [expect.objectContaining({ id: join.id, participantUserId: nextPlayerId })],
    });
  });
});
