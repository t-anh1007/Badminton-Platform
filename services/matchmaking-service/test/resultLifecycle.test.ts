import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { S3ObjectStorageClient } from '@khoaluantn/object-storage';
import { prisma } from '../src/lib/prisma.js';
import { purgeResultCases } from './resultTestUtils.js';
import {
  confirmResult,
  finalizeUndisputedResult,
  objectResult,
  reportIncident,
  sweepResultDeadlines,
} from '../src/domain/resultLifecycle.js';

const CHECKSUM = Buffer.alloc(32, 9).toString('base64');
const s3 = new S3Client({
  endpoint: 'http://127.0.0.1:9', region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});
const storage = new S3ObjectStorageClient({ bucket: 'private-test', s3, privateBucket: true });
const send = vi.spyOn(s3, 'send');
const matchIds: string[] = [];
const MIN = 60_000;
const HOUR = 60 * MIN;

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ ContentType: 'image/png', ContentLength: 2_000, ChecksumSHA256: CHECKSUM } as never);
});

afterAll(async () => {
  const caseIds = await purgeResultCases(matchIds);
  await prisma.outbox.deleteMany({ where: { OR: [{ aggregateId: { in: matchIds } }, ...caseIds.map((id) => ({ aggregateId: { contains: id } }))] } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.$disconnect();
});

const evidence = (userId: string) => [{ objectKey: `match/results/${userId}/${randomUUID()}.png`, mimeType: 'image/png' }];
const finalEvents = (matchId: string) => prisma.outbox.findMany({ where: { aggregateId: matchId, eventType: 'MatchResultFinalized' } });

/** Kèo đã khóa, hồ sơ provisional TEAM_A_WIN với hạn phản đối cho trước. */
async function fixture(options: {
  doubles?: boolean;
  status?: 'declaration_open' | 'provisional';
  objectionDeadlineAt?: Date;
  declarationDeadlineAt?: Date;
  startAt?: Date;
  providerUserId?: string | null;
} = {}) {
  const organizer = randomUUID();
  const partner = randomUUID();
  const b1 = randomUUID();
  const b2 = randomUUID();
  const startAt = options.startAt ?? new Date(Date.now() - 2 * HOUR);
  const joins = options.doubles
    ? [{ participantUserId: partner, teamSide: 'A' as const }, { participantUserId: b1, teamSide: 'B' as const }, { participantUserId: b2, teamSide: 'B' as const }]
    : [{ participantUserId: b1, teamSide: 'B' as const }];
  const match = await prisma.match.create({
    data: {
      bookingId: randomUUID(), organizerUserId: organizer, capacity: options.doubles ? 4 : 2,
      discipline: options.doubles ? 'doubles' : 'singles', feePerSlot: 100_000n, status: 'completed',
      cutoffAt: new Date(startAt.getTime() - HOUR), startAt, endAt: new Date(startAt.getTime() + HOUR), bookingPrice: 200_000n,
      providerUserId: options.providerUserId === undefined ? randomUUID() : options.providerUserId,
      joins: { create: joins.map((join) => ({ ...join, status: 'confirmed' as const })) },
    },
  });
  matchIds.push(match.id);
  const status = options.status ?? 'provisional';
  const resultCase = await prisma.matchResultCase.create({
    data: {
      matchId: match.id, status, outcome: status === 'provisional' ? 'TEAM_A_WIN' : null,
      declarationDeadlineAt: options.declarationDeadlineAt ?? new Date(Date.now() + 10 * HOUR),
      objectionDeadlineAt: status === 'provisional' ? options.objectionDeadlineAt ?? new Date(Date.now() + 10 * HOUR) : null,
    },
  });
  return { match, resultCase, organizer, partner, b1, b2 };
}

const caseOf = (matchId: string) => prisma.matchResultCase.findUniqueOrThrow({ where: { matchId } });

describe('Task 12 confirmation and deadlines', () => {
  it('finalizes singles early when the opponent confirms and emits one final event', async () => {
    const { match, resultCase, organizer, b1 } = await fixture();
    await expect(confirmResult(match.id, organizer)).rejects.toMatchObject({ code: 'RESULT_CONFIRM_LOSER_ONLY' });
    await expect(confirmResult(match.id, b1)).resolves.toEqual({ status: 'final' });
    expect(await caseOf(match.id)).toMatchObject({ status: 'final', outcome: 'TEAM_A_WIN' });
    const events = await finalEvents(match.id);
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ matchId: match.id, decisionId: resultCase.id, outcome: 'TEAM_A_WIN' });
    await expect(confirmResult(match.id, b1)).rejects.toMatchObject({ code: 'RESULT_RESPONSE_CLOSED' });
  });

  it('doubles: first losing confirmation opens a full 60-minute grace beyond the objection deadline', async () => {
    const now = new Date();
    const { match, resultCase, b1 } = await fixture({ doubles: true, objectionDeadlineAt: new Date(now.getTime() + 10 * MIN) });
    await expect(confirmResult(match.id, b1, now)).resolves.toEqual({ status: 'provisional' });
    const graced = await caseOf(match.id);
    expect(graced.teamGraceDeadlineAt!.getTime()).toBe(now.getTime() + HOUR);

    expect(await finalizeUndisputedResult(resultCase.id, new Date(now.getTime() + 30 * MIN))).toBe(false);
    expect(await finalizeUndisputedResult(resultCase.id, new Date(now.getTime() + HOUR))).toBe(true);
    expect(await caseOf(match.id)).toMatchObject({ status: 'final', outcome: 'TEAM_A_WIN' });
    expect(await finalEvents(match.id)).toHaveLength(1);
  });

  it('doubles: the second losing confirmation finalizes immediately', async () => {
    const { match, b1, b2 } = await fixture({ doubles: true });
    await confirmResult(match.id, b1);
    await expect(confirmResult(match.id, b2)).resolves.toEqual({ status: 'final' });
    expect(await finalEvents(match.id)).toHaveLength(1);
  });

  it('doubles: the other loser may still object inside the grace after the original deadline', async () => {
    const now = new Date();
    const { match, resultCase, b1, b2 } = await fixture({ doubles: true, objectionDeadlineAt: new Date(now.getTime() + 10 * MIN) });
    await confirmResult(match.id, b1, now);
    await objectResult(storage, { matchId: match.id, userId: b2, reason: 'Sai tỷ số', evidence: evidence(b2) }, new Date(now.getTime() + 40 * MIN));
    expect(await caseOf(match.id)).toMatchObject({ status: 'provider_review', outcome: null });
    expect(await finalizeUndisputedResult(resultCase.id, new Date(now.getTime() + 2 * HOUR))).toBe(false);
    expect(await finalEvents(match.id)).toHaveLength(0);
  });

  it('doubles: a grace ending before the 12-hour deadline closes objections and finalization at the same moment', async () => {
    const now = new Date();
    const { match, resultCase, b1, b2 } = await fixture({ doubles: true, objectionDeadlineAt: new Date(now.getTime() + 10 * HOUR) });
    await confirmResult(match.id, b1, now);
    const afterGrace = new Date(now.getTime() + HOUR);
    await expect(objectResult(storage, { matchId: match.id, userId: b2, reason: 'Muộn', evidence: evidence(b2) }, afterGrace))
      .rejects.toMatchObject({ code: 'RESULT_RESPONSE_CLOSED' });
    expect(await finalizeUndisputedResult(resultCase.id, afterGrace)).toBe(true);
    expect(await finalEvents(match.id)).toHaveLength(1);
  });

  it('an objection routes to review and deadline sweeps never settle it', async () => {
    const { match, resultCase, b1 } = await fixture();
    await objectResult(storage, { matchId: match.id, userId: b1, reason: 'Không đúng', evidence: evidence(b1) });
    const disputed = await caseOf(match.id);
    expect(disputed.status).toBe('provider_review');
    expect(await prisma.resultEvidence.count({ where: { caseId: resultCase.id, responseId: { not: null } } })).toBe(1);
    expect(await finalizeUndisputedResult(resultCase.id, new Date(Date.now() + 48 * HOUR))).toBe(false);
    await expect(confirmResult(match.id, b1)).rejects.toMatchObject({ code: 'RESULT_RESPONSE_CLOSED' });
  });

  it('finalizes a provisional result once when the objection deadline passes, under replay and concurrency', async () => {
    const { match, resultCase } = await fixture({ objectionDeadlineAt: new Date(Date.now() - 1_000) });
    await Promise.all([finalizeUndisputedResult(resultCase.id), finalizeUndisputedResult(resultCase.id), sweepResultDeadlines(new Date(), matchIds)]);
    await sweepResultDeadlines(new Date(), matchIds);
    expect(await caseOf(match.id)).toMatchObject({ status: 'final', outcome: 'TEAM_A_WIN' });
    expect(await finalEvents(match.id)).toHaveLength(1);
  });

  it('no declaration: opens a 12-hour incident window then finalizes NO_RESULT', async () => {
    const deadline = new Date(Date.now() - 1_000);
    const { match, resultCase } = await fixture({ status: 'declaration_open', declarationDeadlineAt: deadline });
    await sweepResultDeadlines(new Date(), matchIds);
    const window = await caseOf(match.id);
    expect(window).toMatchObject({ status: 'incident_window', outcome: 'NO_RESULT' });
    expect(window.incidentDeadlineAt!.getTime()).toBe(deadline.getTime() + 12 * HOUR);
    expect(await finalizeUndisputedResult(resultCase.id, new Date(deadline.getTime() + 11 * HOUR))).toBe(false);
    expect(await finalizeUndisputedResult(resultCase.id, new Date(deadline.getTime() + 12 * HOUR))).toBe(true);
    expect(await caseOf(match.id)).toMatchObject({ status: 'final', outcome: 'NO_RESULT' });
    expect((await finalEvents(match.id))[0]!.payload).toMatchObject({ outcome: 'NO_RESULT' });
  });
});

describe('Task 12 incidents', () => {
  it('accepts no-show only from startAt + 15 minutes and always opens a dispute', async () => {
    const startAt = new Date(Date.now() - 30 * MIN);
    const { match, b1 } = await fixture({ status: 'declaration_open', startAt, providerUserId: null });
    await prisma.matchResultCase.delete({ where: { matchId: match.id } });
    await prisma.match.update({ where: { id: match.id }, data: { status: 'confirmed' } });
    const report = (at: number) => reportIncident(storage, {
      matchId: match.id, userId: b1, type: 'no_show', description: 'Đối thủ không đến', evidence: evidence(b1),
    }, new Date(startAt.getTime() + at));

    await expect(report(15 * MIN - 1_000)).rejects.toMatchObject({ code: 'RESULT_NO_SHOW_TOO_EARLY' });
    await report(15 * MIN);
    const resultCase = await caseOf(match.id);
    expect(resultCase).toMatchObject({ status: 'admin_review', outcome: null });
    expect(resultCase.declarationDeadlineAt.getTime()).toBe(match.endAt!.getTime() + 12 * HOUR);
    const stranger = randomUUID();
    await expect(reportIncident(storage, {
      matchId: match.id, userId: stranger, type: 'other', description: 'x', evidence: evidence(stranger),
    })).rejects.toMatchObject({ code: 'RESULT_ROSTER_ONLY' });
    expect(await finalEvents(match.id)).toHaveLength(0);
  });
});
