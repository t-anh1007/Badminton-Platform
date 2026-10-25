import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { resetCircuitBreaker, type OcrReading } from '@khoaluantn/ai';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { readUploads } from '../src/domain/resultOcr.js';
import { objectV2, submitClaimV2 } from '../src/domain/resultClaimsV2.js';
import { openEvidenceWindow, submitDisputeEvidence, tier1Decide } from '../src/domain/resultDisputeV2.js';
import { sweepAllResultDeadlines } from '../src/domain/resultSweepV2.js';
import { evidenceSealed } from '../src/domain/resultCaseViewV2.js';
import type { AiChains } from '../src/lib/aiClients.js';
import {
  HOUR, MIN, MemoryStorage, accountClient, cleanupV2, fakeAi, photo, reading, token, v2Fixture, venueBookingClient,
} from './resultV2TestUtils.js';

afterAll(cleanupV2);
beforeEach(() => resetCircuitBreaker());

const storage = new MemoryStorage();
const vn = (local: string) => new Date(`${local}+07:00`);
const END = vn('2026-10-21T09:00:00');
const T0 = vn('2026-10-21T10:00:00');
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);
const A_WIN = [{ teamA: 21, teamB: 18 }, { teamA: 21, teamB: 15 }];
const B_WIN = [{ teamA: 18, teamB: 21 }, { teamA: 15, teamB: 21 }];
const asReading = (sets: typeof A_WIN): OcrReading => reading(sets.map((set) => [set.teamA, set.teamB] as [number, number]));

async function upload(matchId: string, userId: string, sets: typeof A_WIN, ai: AiChains = fakeAi({ ocr: asReading(sets) }).ai, capturedAt?: Date) {
  return (await readUploads({ matchId, userId, items: [storage.put(userId, await photo(800, capturedAt))] }, { storage, ai, accountClient })).draftId;
}

/** Đề xuất A thắng (Xanh) rồi b1 phản đối "tỉ số sai" → evidence_window. */
async function disputed(t0 = T0) {
  const end = new Date(t0.getTime() - HOUR);
  const fixture = await v2Fixture({ endAt: end });
  const draftId = await upload(fixture.match.id, fixture.organizer, A_WIN, undefined, new Date(end.getTime() + MIN));
  await submitClaimV2({ matchId: fixture.match.id, userId: fixture.organizer, draftId, sets: A_WIN, columnMapping: null, editedCells: [] },
    { accountClient, now: t0, openDispute: openEvidenceWindow });
  const { version } = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: fixture.match.id } });
  await objectV2({ matchId: fixture.match.id, userId: fixture.b1, reason: 'score_wrong', claimVersion: version },
    { accountClient, now: new Date(t0.getTime() + 5 * MIN), openDispute: openEvidenceWindow });
  return fixture;
}

const caseOf = (matchId: string) => prisma.matchResultCase.findUniqueOrThrow({ where: { matchId } });

describe('tier1Decide', () => {
  it('only one side has valid evidence -> that side', () => {
    expect(tier1Decide([{ supports: 'TEAM_A_WIN', level: 'green' }, { supports: 'TEAM_A_WIN', level: 'yellow' }]))
      .toEqual({ kind: 'single', outcome: 'TEAM_A_WIN' });
  });
  it('green against yellow -> conflict (tier 2)', () => {
    expect(tier1Decide([{ supports: 'TEAM_A_WIN', level: 'green' }, { supports: 'TEAM_B_WIN', level: 'yellow' }])).toEqual({ kind: 'conflict' });
  });
  it('only red photos -> no valid evidence', () => {
    expect(tier1Decide([{ supports: 'TEAM_A_WIN', level: 'red' }])).toEqual({ kind: 'none' });
  });
  it('a team whose photos are all exact duplicates is dropped; the other team wins provisionally', () => {
    expect(tier1Decide([
      { supports: 'TEAM_B_WIN', level: 'red' }, { supports: 'TEAM_B_WIN', level: 'red' }, { supports: 'TEAM_A_WIN', level: 'yellow' },
    ])).toEqual({ kind: 'single', outcome: 'TEAM_A_WIN' });
  });
});

describe('sealed evidence window and tier 1', () => {
  it('keeps the other team\'s new photos sealed, and closes early when both teams are done', async () => {
    // HTTP dùng giờ thật (quét lười khi đọc) nên ca này bám theo giờ thật.
    const t0 = new Date(Date.now() - 10 * MIN);
    const { match, organizer, b1 } = await disputed(t0);
    const draftId = await upload(match.id, b1, B_WIN, undefined, new Date(t0.getTime() - HOUR + 2 * MIN));
    await submitDisputeEvidence({ matchId: match.id, userId: b1, draftId, sets: B_WIN, columnMapping: null, editedCells: [] }, { accountClient });
    const image = await prisma.resultEvidence.findFirstOrThrow({ where: { case: { matchId: match.id }, purpose: 'evidence' } });
    const { ai } = fakeAi({ ruling: 'fail' });
    const app = createApp({ venueBookingClient, accountClient, resultStorage: storage, aiChains: ai });
    const sealed = await request(app).get(`/matches/${match.id}/result-evidence/${image.id}/read`).set('Authorization', `Bearer ${token(organizer)}`);
    expect([sealed.status, sealed.body.error.code]).toEqual([404, 'RESULT_EVIDENCE_SEALED']);
    const own = await request(app).get(`/matches/${match.id}/result-evidence/${image.id}/read`).set('Authorization', `Bearer ${token(b1)}`);
    expect(own.status).toBe(200);
    const view = await request(app).get(`/matches/${match.id}/result-case`).set('Authorization', `Bearer ${token(organizer)}`);
    expect(view.body.resultCase.disputeEvidence).toEqual([]);

    const first = await request(app).post(`/matches/${match.id}/result-evidence/done`).set('Authorization', `Bearer ${token(organizer)}`);
    expect(first.body).toEqual({ bothTeamsDone: false, tier1: null });
    const second = await request(app).post(`/matches/${match.id}/result-evidence/done`).set('Authorization', `Bearer ${token(b1)}`);
    expect(second.body).toEqual({ bothTeamsDone: true, tier1: 'ai_ruling_pending' });
    expect(await caseOf(match.id)).toMatchObject({ status: 'ai_ruling', pendingRuling: true });
    const opened = await request(app).get(`/matches/${match.id}/result-evidence/${image.id}/read`).set('Authorization', `Bearer ${token(organizer)}`);
    expect(opened.status).toBe(200);
  });

  it('only the proposer has evidence -> provisional result with a 6-hour appeal window', async () => {
    const { match } = await disputed();
    const { ai } = fakeAi();
    await sweepAllResultDeadlines(at(5 + 120), [match.id], { ai, storage: () => storage });
    const resultCase = await caseOf(match.id);
    expect(resultCase).toMatchObject({ status: 'appeal_window', outcome: 'TEAM_A_WIN' });
    expect(resultCase.appealDeadlineAt?.toISOString()).toBe(new Date(at(125).getTime() + 6 * HOUR).toISOString());
    const ruling = await prisma.aiRuling.findFirstOrThrow({ where: { caseId: resultCase.id } });
    expect(ruling).toMatchObject({ tier: 1, outcome: 'TEAM_A_WIN' });
    expect(ruling.citations).toEqual(['BR-RA-31']);
  });

  it('dispute photos the AI still cannot read 30 minutes after the window go to Admin', async () => {
    const { match, b1 } = await disputed();
    const failing = fakeAi({ ocr: 'fail' }).ai;
    const draftId = await upload(match.id, b1, B_WIN, failing);
    await submitDisputeEvidence({ matchId: match.id, userId: b1, draftId, sets: B_WIN, columnMapping: null, editedCells: [] }, { accountClient, now: at(10) });
    await sweepAllResultDeadlines(at(125), [match.id], { ai: failing, storage: () => storage });
    expect((await caseOf(match.id)).status).toBe('evidence_window');
    await sweepAllResultDeadlines(at(125 + 31), [match.id], { ai: failing, storage: () => storage });
    expect((await caseOf(match.id)).status).toBe('admin_review');
  });

  // Review 22/10: ảnh của bản khai đã bị thay không còn là bằng chứng tranh chấp.
  it('ignores photos of a replaced claim at tier 1', async () => {
    const fixture = await v2Fixture({ endAt: END });
    const { match, organizer, b1 } = fixture;
    const first = await upload(match.id, organizer, A_WIN, undefined, new Date(END.getTime() + MIN));
    await submitClaimV2({ matchId: match.id, userId: organizer, draftId: first, sets: A_WIN, columnMapping: null, editedCells: [] },
      { accountClient, now: T0, openDispute: openEvidenceWindow });
    const tied = [{ teamA: 21, teamB: 18 }, { teamA: 18, teamB: 21 }, { teamA: 15, teamB: 15 }];
    const second = await upload(match.id, organizer, tied, undefined, new Date(END.getTime() + 2 * MIN));
    await submitClaimV2({ matchId: match.id, userId: organizer, draftId: second, sets: tied, columnMapping: null, editedCells: [], outcome: 'NO_RESULT' },
      { accountClient, now: at(1), openDispute: openEvidenceWindow });
    const { version } = await caseOf(match.id);
    await objectV2({ matchId: match.id, userId: b1, reason: 'score_wrong', claimVersion: version }, { accountClient, now: at(5), openDispute: openEvidenceWindow });
    await sweepAllResultDeadlines(at(125), [match.id], { ai: fakeAi().ai, storage: () => storage });
    expect(await caseOf(match.id)).toMatchObject({ status: 'appeal_window', outcome: 'NO_RESULT' });
  });

  it('stops sealing at the evidence deadline even before the window is processed', () => {
    const base = { status: 'evidence_window', evidenceClosedAt: null, evidenceDeadlineAt: at(120) } as never;
    expect(evidenceSealed(base, at(119))).toBe(true);
    expect(evidenceSealed(base, at(120))).toBe(false);
  });
});
