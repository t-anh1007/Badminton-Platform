import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetCircuitBreaker, type OcrReading } from '@khoaluantn/ai';
import { prisma } from '../src/lib/prisma.js';
import { readUploads } from '../src/domain/resultOcr.js';
import { confirmV2, objectV2, reportIncidentV2, submitClaimV2 } from '../src/domain/resultClaimsV2.js';
import { openEvidenceWindow } from '../src/domain/resultDisputeV2.js';
import { HOUR, MIN, MemoryStorage, accountClient, cleanupV2, fakeAi, photo, reading, v2Fixture } from './resultV2TestUtils.js';

afterAll(cleanupV2);
beforeEach(() => resetCircuitBreaker());

const storage = new MemoryStorage();
const vn = (local: string) => new Date(`${local}+07:00`);
const END = vn('2026-10-21T09:00:00');
const T0 = vn('2026-10-21T10:00:00');
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);
const A_WIN = [{ teamA: 21, teamB: 18 }, { teamA: 21, teamB: 15 }];
const B_WIN = [{ teamA: 18, teamB: 21 }, { teamA: 15, teamB: 21 }];
const deps = (now: Date) => ({ accountClient, now, openDispute: openEvidenceWindow });

async function claim(matchId: string, userId: string, sets = A_WIN, now = T0, capturedAt: Date | undefined = new Date(END.getTime() + MIN)) {
  const read: OcrReading = reading(sets.map((set) => [set.teamA, set.teamB] as [number, number]));
  const { draftId } = await readUploads(
    { matchId, userId, items: [storage.put(userId, await photo(800, capturedAt))] }, { storage, ai: fakeAi({ ocr: read }).ai, accountClient },
  );
  return submitClaimV2({ matchId, userId, draftId, sets, columnMapping: null, editedCells: [] }, deps(now));
}

const version = async (matchId: string) => (await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId } })).version;
const status = async (matchId: string) => (await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId } })).status;
const finalEvents = (matchId: string) => prisma.outbox.count({ where: { aggregateId: matchId, eventType: 'MatchResultFinalized' } });

describe('acceptance, grace and objections (ra_v1)', () => {
  it('singles: the loser agrees -> final with one result event', async () => {
    const { match, organizer, b1 } = await v2Fixture({ endAt: END });
    await claim(match.id, organizer);
    expect(await confirmV2({ matchId: match.id, userId: b1, claimVersion: await version(match.id) }, at(5))).toEqual({ status: 'final' });
    expect(await finalEvents(match.id)).toBe(1);
  });

  it('doubles: one loser agreeing settles at once, no grace (D63)', async () => {
    const { match, organizer, b1 } = await v2Fixture({ doubles: true, endAt: END });
    await claim(match.id, organizer);
    expect((await confirmV2({ matchId: match.id, userId: b1, claimVersion: await version(match.id) }, at(5))).status).toBe('final');
    expect((await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } })).graceDeadlineAt).toBeNull();
    expect(await finalEvents(match.id)).toBe(1);
  });

  it('a case already in grace before D63: the other loser can still object -> evidence window', async () => {
    const { match, organizer, b2 } = await v2Fixture({ doubles: true, endAt: END });
    await claim(match.id, organizer);
    await prisma.matchResultCase.update({
      where: { matchId: match.id }, data: { status: 'acceptance_grace', graceDeadlineAt: at(65), version: { increment: 1 } },
    });
    const result = await objectV2({ matchId: match.id, userId: b2, reason: 'score_wrong', claimVersion: await version(match.id) }, deps(at(20)));
    expect(result.status).toBe('evidence_window');
    const disputed = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } });
    expect(disputed.evidenceDeadlineAt?.toISOString()).toBe(new Date(at(20).getTime() + 2 * HOUR).toISOString());
  });

  it('a matching claim from the losing team settles doubles at once (D63)', async () => {
    const { match, organizer, b1 } = await v2Fixture({ doubles: true, endAt: END });
    await claim(match.id, organizer);
    expect((await claim(match.id, b1, A_WIN, at(5))).caseStatus).toBe('final');
  });

  it('same winner with different set scores still settles; the proposal keeps its scores (BR-RA-25)', async () => {
    const { match, organizer, b1 } = await v2Fixture({ doubles: true, endAt: END });
    await claim(match.id, organizer);
    expect((await claim(match.id, b1, [{ teamA: 21, teamB: 19 }, { teamA: 23, teamB: 21 }], at(5))).caseStatus).toBe('final');
    const resultCase = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } });
    expect(resultCase.outcome).toBe('TEAM_A_WIN');
    expect(await finalEvents(match.id)).toBe(1);
  });

  it('a paid-for partner agreeing does not settle early; the payer agreeing does', async () => {
    const { match, partner, organizer, b1 } = await v2Fixture({ doubles: true, payerForPartner: true, endAt: END });
    await claim(match.id, b1, B_WIN);
    expect((await confirmV2({ matchId: match.id, userId: partner, claimVersion: await version(match.id) }, at(5))).status).toBe('proposed');
    expect(await status(match.id)).toBe('proposed');
    expect((await confirmV2({ matchId: match.id, userId: organizer, claimVersion: await version(match.id) }, at(6))).status).toBe('final');
  });

  it('a red proposal goes to Admin even when the loser agrees', async () => {
    const { match, organizer, b1, startAt } = await v2Fixture({ endAt: END });
    const result = await claim(match.id, organizer, A_WIN, T0, new Date(startAt.getTime() - 2 * HOUR));
    expect(result.level).toBe('red');
    expect((await confirmV2({ matchId: match.id, userId: b1, claimVersion: await version(match.id) }, at(5))).status).toBe('admin_review');
    expect(await finalEvents(match.id)).toBe(0);
  });

  it('agreeing with a stale version after the claim was replaced is rejected', async () => {
    const { match, organizer, b1 } = await v2Fixture({ endAt: END });
    await claim(match.id, organizer);
    const seen = await version(match.id);
    await claim(match.id, organizer, A_WIN, at(2));
    await expect(confirmV2({ matchId: match.id, userId: b1, claimVersion: seen }, at(3))).rejects.toMatchObject({ code: 'RESULT_VERSION_STALE' });
  });

  it('agree and object at the same moment: exactly one wins, no 500', async () => {
    const { match, organizer, b1, b2 } = await v2Fixture({ doubles: true, endAt: END });
    await claim(match.id, organizer);
    const seen = await version(match.id);
    const results = await Promise.allSettled([
      confirmV2({ matchId: match.id, userId: b1, claimVersion: seen }, at(5)),
      objectV2({ matchId: match.id, userId: b2, reason: 'score_wrong', claimVersion: seen }, deps(at(5))),
    ]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((item) => item.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('RESULT_VERSION_STALE');
  });

  it('"no match" objection goes to Admin, once per person', async () => {
    const { match, organizer, b1 } = await v2Fixture({ endAt: END });
    await claim(match.id, organizer);
    const first = await objectV2({ matchId: match.id, userId: b1, reason: 'no_match', claimVersion: await version(match.id) }, deps(at(5)));
    expect(first.status).toBe('admin_review');
    await expect(objectV2({ matchId: match.id, userId: b1, reason: 'no_match', claimVersion: await version(match.id) }, deps(at(6))))
      .rejects.toMatchObject({ code: 'RESULT_INCIDENT_LIMIT' });
  });

  it('low-reputation players must attach photos to object', async () => {
    const { match, resultCase, organizer, b1 } = await v2Fixture({ endAt: END });
    for (const suffix of ['v1', 'v2']) await prisma.playerViolation.create({ data: { userId: b1, caseId: `${resultCase.id}-${suffix}`, kind: 'test', source: 'admin' } });
    await claim(match.id, organizer);
    await expect(objectV2({ matchId: match.id, userId: b1, reason: 'score_wrong', claimVersion: await version(match.id) }, deps(at(5))))
      .rejects.toMatchObject({ code: 'RESULT_OBJECTION_EVIDENCE_REQUIRED' });
    await prisma.playerViolation.deleteMany({ where: { userId: b1 } });
  });

  it('a teammate claiming the other winner opens a dispute', async () => {
    const { match, organizer, partner } = await v2Fixture({ doubles: true, endAt: END });
    await claim(match.id, organizer);
    expect((await claim(match.id, partner, B_WIN, at(5))).caseStatus).toBe('evidence_window');
  });

  // Review 22/10: người đội thắng gửi bản cùng bên thắng không được tính là "đội thua chấp nhận" (lách BR-RA-23).
  it('a winner-side matching claim after a paid partner self-declared loss does not open grace', async () => {
    const { match, partner, b1 } = await v2Fixture({ doubles: true, payerForPartner: true, endAt: END });
    expect((await claim(match.id, partner, B_WIN)).caseStatus).toBe('proposed');
    expect((await claim(match.id, b1, B_WIN, at(5))).caseStatus).toBe('proposed');
    expect(await status(match.id)).toBe('proposed');
  });

  it('a teammate of the claimant cannot press Object; they must file their own claim', async () => {
    const { match, organizer, partner } = await v2Fixture({ doubles: true, endAt: END });
    await claim(match.id, organizer);
    await expect(objectV2({ matchId: match.id, userId: partner, reason: 'score_wrong', claimVersion: await version(match.id) }, deps(at(5))))
      .rejects.toMatchObject({ code: 'RESULT_OBJECT_LOSER_ONLY' });
  });

  it('an incident whose photos exceed the cap is rejected whole, not half-recorded', async () => {
    const { match, resultCase, b1 } = await v2Fixture({ endAt: END });
    await prisma.resultEvidence.createMany({
      data: Array.from({ length: 7 }, (_, position) => ({
        caseId: resultCase.id, objectKey: `match/results/${b1}/${position}-${resultCase.id}.jpg`, mimeType: 'image/jpeg', size: 1,
        checksumSha256: `c${position}`, ownerUserId: b1, position,
      })),
    });
    const photo1 = { objectKey: `match/results/${b1}/extra-${resultCase.id}.jpg`, mimeType: 'image/jpeg', size: 1, checksumSha256: 'x' };
    await expect(reportIncidentV2({ matchId: match.id, userId: b1, type: 'other', description: 'Bỏ dở', evidence: [photo1] }, at(5)))
      .rejects.toMatchObject({ code: 'RESULT_EVIDENCE_LIMIT' });
    expect(await prisma.resultResponse.count({ where: { caseId: resultCase.id, kind: 'incident' } })).toBe(0);
    expect(await status(match.id)).toBe('declaration_open');
  });
});
