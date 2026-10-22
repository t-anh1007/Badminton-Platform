import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetCircuitBreaker } from '@khoaluantn/ai';
import { prisma } from '../src/lib/prisma.js';
import { readUploads } from '../src/domain/resultOcr.js';
import { confirmV2, submitClaimV2 } from '../src/domain/resultClaimsV2.js';
import { openEvidenceWindow } from '../src/domain/resultDisputeV2.js';
import { resultCaseViewV2 } from '../src/domain/resultCaseViewV2.js';
import { listAdminQueueV2 } from '../src/domain/resultAdminViewV2.js';
import { HOUR, MIN, MemoryStorage, accountClient, cleanupV2, fakeAi, photo, reading, v2Fixture, venueBookingClient } from './resultV2TestUtils.js';

// Bổ sung test cho các AC còn "một phần" trong phase-3-progress.md (AC-RA-05, 07, 10).

afterAll(cleanupV2);
beforeEach(() => resetCircuitBreaker());

const storage = new MemoryStorage();
const vn = (local: string) => new Date(`${local}+07:00`);
const END = vn('2026-10-21T09:00:00');
const T0 = vn('2026-10-21T10:00:00');
const A_WIN = [{ teamA: 21, teamB: 18 }, { teamA: 21, teamB: 15 }];
const deps = (now: Date) => ({ accountClient, now, openDispute: openEvidenceWindow });
const version = async (matchId: string) => (await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId } })).version;

async function draft(matchId: string, userId: string, count: number, capturedAt = new Date(END.getTime() + MIN), sets: Array<[number, number]> = [[21, 18], [21, 15]]) {
  const items = await Promise.all(Array.from({ length: count }, async () => storage.put(userId, await photo(800, capturedAt))));
  return readUploads({ matchId, userId, items }, { storage, ai: fakeAi({ ocr: reading(sets) }).ai, accountClient });
}

describe('AC-RA-05: roster sees the AI reading next to an edited cell', () => {
  it('returns each photo aiReading and the edited cells in the case DTO', async () => {
    const { match, organizer, b1 } = await v2Fixture({ endAt: END });
    const { draftId } = await draft(match.id, organizer, 1, undefined, [[21, 18], [21, 15]]);
    await submitClaimV2({
      matchId: match.id, userId: organizer, draftId, columnMapping: null,
      sets: [{ teamA: 21, teamB: 18 }, { teamA: 21, teamB: 16 }], editedCells: [{ set: 1, side: 'B' }],
    }, deps(T0));
    const row = await prisma.match.findUniqueOrThrow({ where: { id: match.id }, include: { resultCase: true } });
    const view = await resultCaseViewV2(row.resultCase!, row, b1, T0);
    const [claim] = view.claims;
    expect(claim!.level).toBe('yellow');
    expect(claim!.reasons).toContain('EDITED_CELL');
    expect(claim!.editedCells).toEqual([{ set: 1, side: 'B' }]);
    expect(claim!.sets[1]).toEqual({ teamA: 21, teamB: 16 });
    expect(claim!.images[0]!.aiReading).toMatchObject({ sets: [{ left: 21, right: 18 }, { left: 21, right: 15 }] });
  });
});

describe('AC-RA-07: photo limits', () => {
  it('rejects a draft of 6 photos with RESULT_EVIDENCE_COUNT', async () => {
    const { match, organizer } = await v2Fixture({ endAt: END });
    await expect(draft(match.id, organizer, 6)).rejects.toMatchObject({ code: 'RESULT_EVIDENCE_COUNT' });
  });

  it('rejects the 8th photo of the same person in a case with RESULT_EVIDENCE_LIMIT', async () => {
    const { match, organizer } = await v2Fixture({ endAt: END });
    const first = await draft(match.id, organizer, 5);
    await submitClaimV2({ matchId: match.id, userId: organizer, draftId: first.draftId, columnMapping: null, sets: A_WIN, editedCells: [] }, deps(T0));
    // Thay bản khai: ảnh của bản cũ vẫn tính vào giới hạn (BR-RA-05) → 5 + 2 = 7 được, ảnh thứ 8 bị từ chối.
    const second = await draft(match.id, organizer, 2);
    await submitClaimV2({ matchId: match.id, userId: organizer, draftId: second.draftId, columnMapping: null, sets: A_WIN, editedCells: [] }, deps(new Date(T0.getTime() + MIN)));
    expect(await prisma.resultEvidence.count({ where: { ownerUserId: organizer } })).toBe(7);
    const third = await draft(match.id, organizer, 1);
    await expect(submitClaimV2({ matchId: match.id, userId: organizer, draftId: third.draftId, columnMapping: null, sets: A_WIN, editedCells: [] }, deps(new Date(T0.getTime() + 2 * MIN))))
      .rejects.toMatchObject({ code: 'RESULT_EVIDENCE_LIMIT' });
    expect(await prisma.resultEvidence.count({ where: { ownerUserId: organizer } })).toBe(7);
  });
});

describe('AC-RA-10: the Admin SLA is never moved past the night', () => {
  it('starts the 48-hour SLA at the exact night time and flags overdue exactly 48 hours later', async () => {
    const night = vn('2026-10-21T23:30:00');
    const { match, organizer, b1, startAt } = await v2Fixture({ endAt: vn('2026-10-21T22:00:00') });
    const { draftId } = await draft(match.id, organizer, 1, new Date(startAt.getTime() - 2 * HOUR));
    await submitClaimV2({ matchId: match.id, userId: organizer, draftId, columnMapping: null, sets: A_WIN, editedCells: [] }, deps(vn('2026-10-21T23:00:00')));
    await confirmV2({ matchId: match.id, userId: b1, claimVersion: await version(match.id) }, night);
    const resultCase = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } });
    expect(resultCase.status).toBe('admin_review');
    expect(resultCase.adminReviewStartedAt!.toISOString()).toBe(night.toISOString());
    expect(resultCase.adminNextReminderAt!.toISOString()).toBe(new Date(night.getTime() + 24 * HOUR).toISOString());
    const overdue = async (now: Date) => (await listAdminQueueV2(venueBookingClient, { pageSize: 100 }, now)).items.find((item) => item.caseId === resultCase.id)!.adminOverdue;
    expect(await overdue(new Date(night.getTime() + 48 * HOUR - MIN))).toBe(false);
    expect(await overdue(new Date(night.getTime() + 48 * HOUR))).toBe(true);
  });
});
