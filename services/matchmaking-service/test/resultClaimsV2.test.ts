import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { resetCircuitBreaker } from '@khoaluantn/ai';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { readUploads } from '../src/domain/resultOcr.js';
import { submitClaimV2, type SubmissionInput } from '../src/domain/resultClaimsV2.js';
import { openEvidenceWindow } from '../src/domain/resultDisputeV2.js';
import {
  HOUR, MIN, MemoryStorage, accountClient, cleanupV2, fakeAi, photo, reading, token, v2Fixture, venueBookingClient,
} from './resultV2TestUtils.js';

afterAll(cleanupV2);
beforeEach(() => resetCircuitBreaker());

const storage = new MemoryStorage();
/** Giờ Việt Nam → Date. */
const vn = (local: string) => new Date(`${local}+07:00`);
const A_WIN = [{ teamA: 21, teamB: 18 }, { teamA: 21, teamB: 15 }];
const sheet = reading([[21, 18], [21, 15]]);

async function draft(matchId: string, userId: string, capturedAt: Date | undefined, read = sheet, width = 800) {
  const { ai } = fakeAi({ ocr: read });
  return readUploads({ matchId, userId, items: [storage.put(userId, await photo(width, capturedAt))] }, { storage, ai, accountClient });
}

function claim(matchId: string, userId: string, draftId: string, now: Date, extra: Partial<SubmissionInput> = {}) {
  return submitClaimV2(
    { matchId, userId, draftId, sets: A_WIN, columnMapping: null, editedCells: [], ...extra },
    { accountClient, now, openDispute: openEvidenceWindow },
  );
}

describe('submit photo-based claims (ra_v1)', () => {
  it.each([
    ['green', 'exif', 2],
    ['yellow', 'none', 6],
    ['red', 'before', 12],
  ] as const)('a %s claim opens a %sh response window', async (level, capture, hours) => {
    const endAt = vn('2026-10-21T09:00:00');
    const { match, organizer, startAt } = await v2Fixture({ endAt });
    const capturedAt = capture === 'exif' ? new Date(endAt.getTime() + 5 * MIN) : capture === 'before' ? new Date(startAt.getTime() - HOUR) : undefined;
    const { draftId } = await draft(match.id, organizer, capturedAt);
    const now = vn('2026-10-21T10:00:00');
    const result = await claim(match.id, organizer, draftId, now);
    expect(result).toMatchObject({ level, caseStatus: 'proposed', outcome: 'TEAM_A_WIN' });
    expect(result.responseDeadlineAt).toBe(new Date(now.getTime() + hours * HOUR).toISOString());
  });

  it('a green claim at 22:30 VN is due at 08:00 the next morning', async () => {
    const endAt = vn('2026-10-21T21:30:00');
    const { match, organizer } = await v2Fixture({ endAt });
    const { draftId } = await draft(match.id, organizer, new Date(endAt.getTime() + 5 * MIN));
    const result = await claim(match.id, organizer, draftId, vn('2026-10-21T22:30:00'));
    expect(result.level).toBe('green');
    expect(result.responseDeadlineAt).toBe(vn('2026-10-22T08:00:00').toISOString());
    const stored = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } });
    expect(stored.responseDeadlineBaseAt?.toISOString()).toBe(vn('2026-10-22T00:30:00').toISOString());
  });

  it('ignores a level forged by the client and recomputes it on the server', async () => {
    const { match, organizer } = await v2Fixture();
    const { draftId } = await draft(match.id, organizer, undefined);
    const app = createApp({ venueBookingClient, accountClient, resultStorage: storage, aiChains: fakeAi().ai });
    const response = await request(app).post(`/matches/${match.id}/result-claims`).set('Authorization', `Bearer ${token(organizer)}`)
      .send({ draftId, sets: A_WIN, columnMapping: null, editedCells: [], level: 'green' });
    expect(response.status).toBe(201);
    expect(response.body.claim.level).toBe('yellow');
    expect(response.body.claim.reasons).toContain('NO_CAPTURE_TIME');
  });

  it('accepts a lawful tied time-out NO_RESULT claim', async () => {
    const { match, organizer, endAt } = await v2Fixture();
    const tied = reading([[21, 18], [18, 21], [15, 15]]);
    const { draftId } = await draft(match.id, organizer, endAt, tied);
    const sets = [{ teamA: 21, teamB: 18 }, { teamA: 18, teamB: 21 }, { teamA: 15, teamB: 15 }];
    const result = await claim(match.id, organizer, draftId, new Date(), { sets, outcome: 'NO_RESULT' });
    expect(result).toMatchObject({ outcome: 'NO_RESULT', caseStatus: 'proposed' });
  });

  it('an edited cell is yellow with EDITED_CELL, and low reputation never leaks', async () => {
    const { match, resultCase, organizer, endAt } = await v2Fixture();
    for (const caseId of ['x1', 'x2']) await prisma.playerViolation.create({ data: { userId: organizer, caseId: `${resultCase.id}-${caseId}`, kind: 'test', source: 'admin' } });
    const { draftId } = await draft(match.id, organizer, new Date(endAt.getTime() + MIN));
    const result = await claim(match.id, organizer, draftId, new Date(), {
      sets: [{ teamA: 21, teamB: 19 }, { teamA: 21, teamB: 15 }], editedCells: [{ set: 0, side: 'B' }],
    });
    expect(result.level).toBe('yellow');
    expect(result.reasons).toContain('EDITED_CELL');
    expect(result.reasons).not.toContain('REPORTER_LOW_REPUTATION');
    const stored = await prisma.resultClaim.findUniqueOrThrow({ where: { id: result.claimId } });
    expect(stored.levelReasons).toContain('REPORTER_LOW_REPUTATION');
    await prisma.playerViolation.deleteMany({ where: { userId: organizer } });
  });

  it('replaces an own claim only before the other team responds', async () => {
    const { match, resultCase, organizer, b1, endAt } = await v2Fixture({ endAt: vn('2026-10-21T09:00:00') });
    const first = await draft(match.id, organizer, undefined);
    const now = vn('2026-10-21T10:00:00');
    const original = await claim(match.id, organizer, first.draftId, now);
    const second = await draft(match.id, organizer, new Date(endAt.getTime() + MIN), sheet, 801);
    const later = new Date(now.getTime() + 10 * MIN);
    const replaced = await claim(match.id, organizer, second.draftId, later);
    expect(replaced).toMatchObject({ level: 'green', caseStatus: 'proposed' });
    expect(replaced.responseDeadlineAt).toBe(new Date(later.getTime() + 2 * HOUR).toISOString());
    expect((await prisma.resultClaim.findUniqueOrThrow({ where: { id: replaced.claimId } })).supersedesClaimId).toBe(original.claimId);

    await prisma.resultResponse.create({ data: { caseId: resultCase.id, userId: b1, kind: 'confirm' } });
    const third = await draft(match.id, organizer, undefined, sheet, 802);
    await expect(claim(match.id, organizer, third.draftId, new Date(later.getTime() + MIN)))
      .rejects.toMatchObject({ code: 'RESULT_REPLACE_CLOSED' });
  });

  it('a self-declared loss in singles is final at once', async () => {
    const { match, organizer, endAt } = await v2Fixture();
    const loss = reading([[18, 21], [15, 21]]);
    const { draftId } = await draft(match.id, organizer, new Date(endAt.getTime() + MIN), loss);
    const result = await claim(match.id, organizer, draftId, new Date(), { sets: [{ teamA: 18, teamB: 21 }, { teamA: 15, teamB: 21 }] });
    expect(result).toMatchObject({ outcome: 'TEAM_B_WIN', caseStatus: 'final' });
    expect(await prisma.outbox.count({ where: { aggregateId: match.id, eventType: 'MatchResultFinalized' } })).toBe(1);
  });

  it('rejects a draft that belongs to someone else', async () => {
    const { match, organizer, b1 } = await v2Fixture();
    const { draftId } = await draft(match.id, organizer, undefined);
    await expect(claim(match.id, b1, draftId, new Date())).rejects.toMatchObject({ code: 'RESULT_DRAFT_NOT_FOUND' });
  });
});
