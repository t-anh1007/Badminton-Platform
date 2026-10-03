import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { MatchFeePaymentCompletedPayload } from '@khoaluantn/shared';
import type { VenueBookingClient, VenueMatchContext } from '../src/clients/venueBooking.js';
import { handleMatchFeePaymentCompleted } from '../src/lib/matchLifecycleEventConsumer.js';
import { prisma } from '../src/lib/prisma.js';
import { requestJoin } from '../src/domain/matches.js';
import { withdrawJoin } from '../src/domain/matchLifecycle.js';
import { acceptPartnerInvite, cancelPartnerInvite, declinePartnerInvite, invitePartner } from '../src/domain/partnerInvites.js';

// BR-CM-71..78 / AC-CM-36..40 (D58): mời partner vào Team A kèo đôi.

class FakeVenueClient implements VenueBookingClient {
  readonly contexts = new Map<string, VenueMatchContext>();
  getMatchContext(bookingId: string) { return Promise.resolve(this.contexts.get(bookingId) ?? null); }
  createBookingFromHold(): Promise<string> { throw new Error('not used'); }
  cancelConfirmedBooking(): Promise<{ refundPercent: number }> { throw new Error('not used'); }
  resolveMatchBooking(): never { throw new Error('not used'); }
}

const venueClient = new FakeVenueClient();
const matchIds: string[] = [];
const eventIds: string[] = [];

async function fixture(input: { discipline?: 'singles' | 'doubles'; feePerSlot?: bigint } = {}) {
  const bookingId = randomUUID();
  const organizerUserId = randomUUID();
  const discipline = input.discipline ?? 'doubles';
  const match = await prisma.match.create({
    data: {
      bookingId, organizerUserId, discipline, capacity: discipline === 'doubles' ? 4 : 2,
      feePerSlot: input.feePerSlot ?? 50000n, sourceType: 'paid_booking',
      skillConfiguredAt: new Date(), cutoffAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  matchIds.push(match.id);
  await prisma.outbox.create({ data: { aggregateType: 'Match', aggregateId: match.id, eventType: 'MatchCreated', payload: {} } });
  venueClient.contexts.set(bookingId, {
    bookingId, ownerUserId: organizerUserId, status: 'confirmed', priceSnapshot: '200000',
    startAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
    endAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    holdExpiresAt: null,
    court: { id: randomUUID(), name: 'Sân 1' },
    venue: { id: randomUUID(), name: 'Venue', address: 'Q1', lat: 10, lng: 106 },
  } as VenueMatchContext);
  return match;
}

async function pay(match: { id: string; bookingId: string }, joinId: string, userId: string) {
  const eventId = randomUUID();
  eventIds.push(eventId);
  const payload: MatchFeePaymentCompletedPayload = {
    refType: 'matchFee', matchId: match.id, bookingId: match.bookingId, contributionId: randomUUID(),
    joinId, userId, role: 'participant', amount: '50000', paidAt: new Date().toISOString(),
  };
  await handleMatchFeePaymentCompleted(eventId, payload, venueClient);
}

const outboxOf = (aggregateId: string, eventType: string) =>
  prisma.outbox.findMany({ where: { aggregateId, eventType }, orderBy: { createdAt: 'asc' } });

afterAll(async () => {
  const joins = await prisma.join.findMany({ where: { matchId: { in: matchIds } }, select: { id: true } });
  await prisma.outbox.deleteMany({ where: { aggregateId: { in: [...matchIds, ...joins.map((join) => join.id)] } } });
  for (const matchId of matchIds) await prisma.outbox.deleteMany({ where: { aggregateId: { contains: matchId } } });
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.matchResolution.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.partnerInvite.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.$disconnect();
});

describe('partner tự trả', () => {
  it('AC-CM-36: giữ Team A cho partner; partner nhận lời, trả phí và vào Team A', async () => {
    const match = await fixture();
    const partner = randomUUID();
    await invitePartner(match.id, match.organizerUserId, { inviteeUserId: partner, payMode: 'self' });

    await expect(requestJoin(match.id, randomUUID(), 'A')).rejects.toMatchObject({ code: 'MATCH_TEAM_FULL' });
    const stranger = await requestJoin(match.id, randomUUID());
    expect(stranger.teamSide).toBe('B');

    const join = await acceptPartnerInvite(match.id, partner);
    expect(join).toMatchObject({ teamSide: 'A', status: 'approved', participantUserId: partner, payerUserId: null });
    // Đang giữ slot 10 phút: không hủy/đổi/từ chối được (BR-CM-75).
    await expect(cancelPartnerInvite(match.id, match.organizerUserId)).rejects.toMatchObject({ code: 'PARTNER_INVITE_LOCKED' });
    await expect(declinePartnerInvite(match.id, partner)).rejects.toMatchObject({ code: 'PARTNER_INVITE_LOCKED' });

    await pay(match, join.id, partner);
    expect(await prisma.join.findUniqueOrThrow({ where: { id: join.id } })).toMatchObject({ status: 'confirmed' });
    expect(await prisma.partnerInvite.findFirstOrThrow({ where: { matchId: match.id } })).toMatchObject({ status: 'accepted' });
  });

  it('từ chối thì Team A mở lại cho mọi người', async () => {
    const match = await fixture();
    const partner = randomUUID();
    await invitePartner(match.id, match.organizerUserId, { inviteeUserId: partner, payMode: 'self' });
    await declinePartnerInvite(match.id, partner);
    const join = await requestJoin(match.id, randomUUID(), 'A');
    expect(join.teamSide).toBe('A');
  });
});

describe('chủ kèo trả thay', () => {
  it('AC-CM-37: lời mời chỉ gửi sau khi trả; đổi partner không thu thêm; partner nhận lời vào Team A', async () => {
    const match = await fixture();
    const first = randomUUID();
    const second = randomUUID();
    const { invite, prepaidJoinId } = await invitePartner(match.id, match.organizerUserId, { inviteeUserId: first, payMode: 'organizer' });
    expect(invite.sentAt).toBeNull();
    const [approved] = await outboxOf(prepaidJoinId!, 'JoinApproved');
    expect(approved!.payload).toMatchObject({ participantUserId: match.organizerUserId, teamSide: 'A' });
    // Người được mời chưa nhận được gì nên chưa nhận lời được.
    await expect(acceptPartnerInvite(match.id, first)).rejects.toMatchObject({ code: 'PARTNER_INVITE_NOT_FOUND' });

    await pay(match, prepaidJoinId!, match.organizerUserId);
    expect(await prisma.join.findUniqueOrThrow({ where: { id: prepaidJoinId! } })).toMatchObject({ status: 'reserved' });
    expect((await prisma.partnerInvite.findUniqueOrThrow({ where: { id: invite.id } })).sentAt).not.toBeNull();

    const changed = await invitePartner(match.id, match.organizerUserId, { inviteeUserId: second, payMode: 'organizer' });
    expect(changed.prepaidJoinId).toBe(prepaidJoinId);
    expect(await outboxOf(prepaidJoinId!, 'JoinApproved')).toHaveLength(1);
    expect(await prisma.partnerInvite.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ status: 'cancelled' });

    await acceptPartnerInvite(match.id, second);
    expect(await prisma.join.findUniqueOrThrow({ where: { id: prepaidJoinId! } }))
      .toMatchObject({ status: 'confirmed', participantUserId: second, payerUserId: match.organizerUserId });
    const [beneficiary] = await outboxOf(prepaidJoinId!, 'MatchSlotBeneficiaryChanged');
    expect(beneficiary!.payload).toMatchObject({ beneficiaryUserId: second });
  });

  it('AC-CM-37: hủy lời mời hoàn đúng một lần về chủ kèo và mở Team A', async () => {
    const match = await fixture();
    const { prepaidJoinId } = await invitePartner(match.id, match.organizerUserId, { inviteeUserId: randomUUID(), payMode: 'organizer' });
    await pay(match, prepaidJoinId!, match.organizerUserId);
    expect(await cancelPartnerInvite(match.id, match.organizerUserId)).toEqual({ cancelled: true, refunded: true });
    const refunds = await outboxOf(prepaidJoinId!, 'MatchFeeRefundRequested');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.payload).toMatchObject({ participantUserId: match.organizerUserId });
    await expect(cancelPartnerInvite(match.id, match.organizerUserId)).rejects.toMatchObject({ code: 'PARTNER_INVITE_NOT_FOUND' });
    expect((await requestJoin(match.id, randomUUID(), 'A')).teamSide).toBe('A');
  });

  it('AC-CM-39: partner rút trước cutoff thì slot quay về chủ kèo, không hoàn tiền', async () => {
    const match = await fixture();
    const partner = randomUUID();
    const { prepaidJoinId } = await invitePartner(match.id, match.organizerUserId, { inviteeUserId: partner, payMode: 'organizer' });
    await pay(match, prepaidJoinId!, match.organizerUserId);
    await acceptPartnerInvite(match.id, partner);

    const result = await withdrawJoin(venueClient, match.id, prepaidJoinId!, partner);
    expect(result).toMatchObject({ status: 'reserved', refunded: false });
    expect(await outboxOf(prepaidJoinId!, 'MatchFeeRefundRequested')).toHaveLength(0);
    const changes = await outboxOf(prepaidJoinId!, 'MatchSlotBeneficiaryChanged');
    expect(changes.at(-1)!.payload).toMatchObject({ beneficiaryUserId: null });
    // Slot vẫn giữ cho chủ kèo: người lạ không vào Team A.
    await expect(requestJoin(match.id, randomUUID(), 'A')).rejects.toMatchObject({ code: 'MATCH_TEAM_FULL' });
  });
});

describe('AC-CM-38: từ chối lời mời không hợp lệ', () => {
  it('kèo đơn, tự mời chính mình, trả thay kèo miễn phí', async () => {
    const singles = await fixture({ discipline: 'singles' });
    await expect(invitePartner(singles.id, singles.organizerUserId, { inviteeUserId: randomUUID(), payMode: 'self' }))
      .rejects.toMatchObject({ code: 'PARTNER_DOUBLES_ONLY' });
    const doubles = await fixture();
    await expect(invitePartner(doubles.id, doubles.organizerUserId, { inviteeUserId: doubles.organizerUserId, payMode: 'self' }))
      .rejects.toMatchObject({ code: 'PARTNER_IS_ORGANIZER' });
    const free = await fixture({ feePerSlot: 0n });
    await expect(invitePartner(free.id, free.organizerUserId, { inviteeUserId: randomUUID(), payMode: 'organizer' }))
      .rejects.toMatchObject({ code: 'PARTNER_PREPAY_FREE_MATCH' });
  });
});
