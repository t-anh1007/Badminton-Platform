import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { resetCircuitBreaker } from '@khoaluantn/ai';
import { prisma } from '../src/lib/prisma.js';
import { readUploads } from '../src/domain/resultOcr.js';
import { confirmV2, submitClaimV2 } from '../src/domain/resultClaimsV2.js';
import { acceptRuling, openEvidenceWindow } from '../src/domain/resultDisputeV2.js';
import { sweepResultDeadlinesV2 } from '../src/domain/resultSweepV2.js';
import { runPendingRulings } from '../src/domain/disputeRulingJob.js';
import { upsertChunks } from '../src/domain/knowledge.js';
import { decideAdminResult, previewAdminDecision } from '../src/domain/resultLifecycle.js';
import { HOUR, MIN, MemoryStorage, accountClient, cleanupV2, fakeAi, photo, reading, v2Fixture } from './resultV2TestUtils.js';

// AC-RA-23 (AI không có đường ghi tiền) và AC-RA-24 (mọi đường chốt: chạy song song / quét lặp chỉ một sự kiện final).

const chunkId = `BR-RA-34#finality-${randomUUID().slice(0, 8)}`;
afterAll(async () => {
  await prisma.knowledgeChunk.deleteMany({ where: { id: chunkId } });
  await cleanupV2();
});
beforeEach(() => resetCircuitBreaker());

const storage = new MemoryStorage();
const vn = (local: string) => new Date(`${local}+07:00`);
const END = vn('2026-10-21T09:00:00');
const T0 = vn('2026-10-21T10:00:00');
const A_WIN = [{ teamA: 21, teamB: 18 }, { teamA: 21, teamB: 15 }];
const deps = (now: Date) => ({ accountClient, now, openDispute: openEvidenceWindow });
const version = async (matchId: string) => (await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId } })).version;
const finalEvents = (matchId: string) => prisma.outbox.findMany({ where: { aggregateId: matchId, eventType: 'MatchResultFinalized' } });
const settle = <T>(work: Array<Promise<T>>) => Promise.allSettled(work);

async function claim(matchId: string, userId: string, now = T0) {
  const { draftId } = await readUploads(
    { matchId, userId, items: [storage.put(userId, await photo(800, new Date(END.getTime() + MIN)))] },
    { storage, ai: fakeAi({ ocr: reading([[21, 18], [21, 15]]) }).ai, accountClient },
  );
  return submitClaimV2({ matchId, userId, draftId, sets: A_WIN, columnMapping: null, editedCells: [] }, deps(now));
}

/** Hồ sơ đang 6 giờ kháng nghị với phán quyết tạm của AI (đội A thắng). */
async function appealCase(deadline: Date) {
  const fixture = await v2Fixture({ endAt: END, status: 'appeal_window', caseData: { outcome: 'TEAM_A_WIN', appealDeadlineAt: deadline } });
  const ruling = await prisma.aiRuling.create({
    data: { caseId: fixture.resultCase.id, tier: 2, outcome: 'TEAM_A_WIN', confidence: 0.9, citations: [], reasons: [{ text: 'x', citations: [] }], publishedAt: T0 },
  });
  return { ...fixture, ruling };
}

describe('AC-RA-24: every settling path produces exactly one final event', () => {
  it('two losers agreeing at the same time in doubles settle once', async () => {
    const { match, organizer, b1, b2 } = await v2Fixture({ doubles: true, endAt: END });
    await claim(match.id, organizer);
    const v = await version(match.id);
    await settle([confirmV2({ matchId: match.id, userId: b1, claimVersion: v }, T0), confirmV2({ matchId: match.id, userId: b2, claimVersion: v }, T0)]);
    // Ai đến sau có thể nhận RESULT_VERSION_STALE; người đó Đồng ý lại thì hồ sơ chốt, vẫn đúng một sự kiện.
    if ((await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } })).status !== 'final') {
      const left = (await prisma.resultResponse.findMany({ where: { kind: 'confirm', case: { matchId: match.id } } })).map((row) => row.userId);
      const other = left.includes(b1) ? b2 : b1;
      await confirmV2({ matchId: match.id, userId: other, claimVersion: await version(match.id) }, new Date(T0.getTime() + MIN));
    }
    expect(await finalEvents(match.id)).toHaveLength(1);
  });

  it('grace (case opened before D63) swept twice while the other loser agrees settles once', async () => {
    const { match, organizer, b2 } = await v2Fixture({ doubles: true, endAt: END });
    await claim(match.id, organizer);
    await prisma.matchResultCase.update({
      where: { matchId: match.id }, data: { status: 'acceptance_grace', graceDeadlineAt: new Date(T0.getTime() + HOUR), version: { increment: 1 } },
    });
    const after = new Date(T0.getTime() + 2 * HOUR);
    await settle([
      sweepResultDeadlinesV2(after, [match.id]), sweepResultDeadlinesV2(after, [match.id]),
      version(match.id).then((v) => confirmV2({ matchId: match.id, userId: b2, claimVersion: v }, after)),
    ]);
    await sweepResultDeadlinesV2(after, [match.id]);
    expect((await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } })).status).toBe('final');
    expect(await finalEvents(match.id)).toHaveLength(1);
  });

  it('appeal-window expiry swept twice while the loser accepts settles once', async () => {
    const deadline = new Date(T0.getTime() + 6 * HOUR);
    const { match, b1, ruling } = await appealCase(deadline);
    const after = new Date(deadline.getTime() + MIN);
    await settle([sweepResultDeadlinesV2(after, [match.id]), sweepResultDeadlinesV2(after, [match.id]), acceptRuling({ matchId: match.id, userId: b1, rulingId: ruling.id }, new Date(deadline.getTime() - MIN))]);
    await sweepResultDeadlinesV2(after, [match.id]);
    expect((await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } })).status).toBe('final');
    expect(await finalEvents(match.id)).toHaveLength(1);
  });

  it('the same Admin decision submitted twice at once settles once', async () => {
    const admin = randomUUID();
    const { match } = await v2Fixture({ endAt: END, status: 'admin_review', caseData: { adminReviewStartedAt: T0 } });
    const preview = await previewAdminDecision(accountClient, admin, match.id, { outcome: 'TEAM_A_WIN', reason: 'Bằng chứng A' });
    const decide = () => decideAdminResult(admin, match.id, { outcome: 'TEAM_A_WIN', reason: 'Bằng chứng A', caseVersion: preview.caseVersion, previewToken: preview.previewToken });
    const results = await settle([decide(), decide()]);
    expect(results.filter((result) => result.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    expect(await finalEvents(match.id)).toHaveLength(1);
  });
});

describe('AC-RA-23: AI has no path that writes money', () => {
  it('a tier-2 reply carrying an amount is rejected and never settles the case', async () => {
    await upsertChunks([{ id: chunkId, kind: 'rule', ref: 'BR-RA-34', text: 'Tranh chấp hai bên có bằng chứng, chuyển tầng 2.' }], { ai: { ocr: [], ruling: [], embedding: null, embeddingDims: 4 } });
    const fixture = await v2Fixture({
      endAt: END, status: 'ai_ruling', caseData: { pendingRuling: true, rulingRetryUntil: new Date(T0.getTime() - MIN), outcome: 'TEAM_A_WIN' },
    });
    const evidence = await prisma.resultClaim.create({
      data: { caseId: fixture.resultCase.id, claimantUserId: fixture.organizer, outcome: 'TEAM_A_WIN', setWinsA: 2, setWinsB: 0, level: 'green',
        sets: { create: A_WIN.map((set, position) => ({ position, ...set })) } },
    });
    await prisma.resultEvidence.create({
      data: { caseId: fixture.resultCase.id, claimId: evidence.id, objectKey: `match/results/${fixture.organizer}/${randomUUID()}.jpg`, mimeType: 'image/jpeg',
        size: 1, checksumSha256: randomUUID(), ownerUserId: fixture.organizer, position: 0, level: 'green', supports: 'TEAM_A_WIN', capturedAt: T0 },
    });
    const { ai } = fakeAi({
      ruling: (body) => {
        const payload = JSON.parse(String(body.messages[1]!.content)) as { rules: Array<{ id: string }> };
        return { outcome: 'TEAM_A_WIN', confidence: 0.99, amount: 500_000, reasons: [{ text: 'A thắng', citations: [payload.rules[0]!.id] }], adminNotes: '' };
      },
    });
    await runPendingRulings(T0, { ai }, [fixture.match.id]);
    const after = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: fixture.match.id } });
    expect(after.status).toBe('admin_review');
    expect(await prisma.aiRuling.count({ where: { caseId: fixture.resultCase.id } })).toBe(0);
    expect(await finalEvents(fixture.match.id)).toHaveLength(0);
  });

  it('a ruling that takes effect settles through writeResultFinal with only matchId, decisionId, outcome and time', async () => {
    const deadline = new Date(T0.getTime() + 6 * HOUR);
    const { match } = await appealCase(deadline);
    await sweepResultDeadlinesV2(new Date(deadline.getTime() + MIN), [match.id]);
    const [event] = await finalEvents(match.id);
    expect(Object.keys(event!.payload as object).sort()).toEqual(['decisionId', 'finalizedAt', 'matchId', 'outcome']);
    // Bảng phán quyết AI không có cột tiền nào để AI ghi vào.
    expect(Object.keys(Prisma.AiRulingScalarFieldEnum).filter((field) => /amount|money|fee|vnd|price/i.test(field))).toEqual([]);
  });
});
