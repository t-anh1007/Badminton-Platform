import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetCircuitBreaker, type OcrReading } from '@khoaluantn/ai';
import { prisma } from '../src/lib/prisma.js';
import { readUploads } from '../src/domain/resultOcr.js';
import { confirmV2, objectV2, reportIncidentV2, submitClaimV2 } from '../src/domain/resultClaimsV2.js';
import { markEvidenceDone, openEvidenceWindow, submitAppeal } from '../src/domain/resultDisputeV2.js';
import { resultCaseViewV2 } from '../src/domain/resultCaseViewV2.js';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { HOUR, MIN, MemoryStorage, accountClient, cleanupV2, fakeAi, photo, reading, token, v2Fixture, venueBookingClient } from './resultV2TestUtils.js';

// Các trường hồ sơ người chơi mà màn web cần (plan web A1: B1, B2, B3, B13).

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

async function claim(matchId: string, userId: string, sets = A_WIN, now = T0, capturedAt: Date = new Date(END.getTime() + MIN)) {
  const read: OcrReading = reading(sets.map((set) => [set.teamA, set.teamB] as [number, number]));
  const { draftId } = await readUploads(
    { matchId, userId, items: [storage.put(userId, await photo(800, capturedAt))] }, { storage, ai: fakeAi({ ocr: read }).ai, accountClient },
  );
  return submitClaimV2({ matchId, userId, draftId, sets, columnMapping: null, editedCells: [] }, deps(now));
}

const version = async (matchId: string) => (await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId } })).version;
async function view(matchId: string, viewer: string, now: Date) {
  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, include: { resultCase: true } });
  return resultCaseViewV2(match.resultCase!, match, viewer, now, { accountClient });
}

describe('result case view fields for the web (ra_v1)', () => {
  it('lists who agreed or objected, with display names (B1)', async () => {
    const { match, organizer, b1 } = await v2Fixture({ doubles: true, endAt: END });
    await claim(match.id, organizer);
    await confirmV2({ matchId: match.id, userId: b1, claimVersion: await version(match.id) }, at(5));
    const result = await view(match.id, organizer, at(6));
    expect(result.responses).toEqual([{ userId: b1, displayName: 'Lê Lan', kind: 'confirm', createdAt: at(5).toISOString() }]);
  });

  it('keeps waiting for the payer after a paid-for partner agrees (B2)', async () => {
    const { match, partner, organizer, b1 } = await v2Fixture({ doubles: true, payerForPartner: true, endAt: END });
    await claim(match.id, b1, B_WIN);
    expect((await view(match.id, organizer, at(1))).pendingPayerUserId).toBeNull();
    await confirmV2({ matchId: match.id, userId: partner, claimVersion: await version(match.id) }, at(5));
    expect((await view(match.id, organizer, at(6))).pendingPayerUserId).toBe(organizer);
  });

  it('marks which teams said their evidence is complete (B13)', async () => {
    const { match, organizer, b1 } = await v2Fixture({ endAt: END });
    await claim(match.id, organizer);
    await objectV2({ matchId: match.id, userId: b1, reason: 'score_wrong', claimVersion: await version(match.id) }, deps(at(5)));
    expect((await view(match.id, organizer, at(6))).evidenceDoneSides).toEqual([]);
    await markEvidenceDone(match.id, b1, at(10));
    expect((await view(match.id, organizer, at(11))).evidenceDoneSides).toEqual(['B']);
  });

  it('explains why the case is with Admin: odd photo, incident (B3)', async () => {
    const red = await v2Fixture({ endAt: END });
    await claim(red.match.id, red.organizer, A_WIN, T0, new Date(red.startAt.getTime() - 2 * HOUR));
    await confirmV2({ matchId: red.match.id, userId: red.b1, claimVersion: await version(red.match.id) }, at(5));
    const redView = await view(red.match.id, red.b1, at(6));
    expect(redView.adminReason).toBe('unknown_photo');
    expect(redView.adminReviewStartedAt).toBe(at(5).toISOString());

    const incident = await v2Fixture({ endAt: END });
    await reportIncidentV2({ matchId: incident.match.id, userId: incident.b1, type: 'interrupted', description: 'Bỏ dở' }, at(5));
    expect((await view(incident.match.id, incident.organizer, at(6))).adminReason).toBe('incident');
    expect((await view(incident.match.id, incident.organizer, at(6))).viewerAppeal).toBeNull();
  });

  it('shows my appeal: rejected without grounds, then accepted and sent to Admin (B3)', async () => {
    const NOW = new Date('2026-10-21T03:00:00.000Z');
    const fixture = await v2Fixture({
      endAt: new Date(NOW.getTime() - 4 * HOUR), status: 'appeal_window',
      caseData: { outcome: 'TEAM_A_WIN', appealDeadlineAt: new Date(NOW.getTime() + 6 * HOUR) },
    });
    const ruling = await prisma.aiRuling.create({
      data: { caseId: fixture.resultCase.id, tier: 1, outcome: 'TEAM_A_WIN', citations: ['BR-RA-31'], publishedAt: NOW, reasons: [{ text: 'x', citations: ['BR-RA-31'] }] },
    });
    await expect(submitAppeal({ matchId: fixture.match.id, userId: fixture.b1, rulingId: ruling.id, reason: 'Sai' }, { storage, now: NOW }))
      .rejects.toMatchObject({ code: 'RESULT_APPEAL_GROUNDS_REQUIRED' });
    expect((await view(fixture.match.id, fixture.b1, NOW)).viewerAppeal).toEqual({ accepted: false, createdAt: NOW.toISOString() });
    expect((await view(fixture.match.id, fixture.organizer, NOW)).viewerAppeal).toBeNull();

    const later = new Date(NOW.getTime() + MIN);
    await submitAppeal({ matchId: fixture.match.id, userId: fixture.b1, rulingId: ruling.id, reason: 'Sai', pointedReason: randomUUID() }, { storage, now: later });
    const appealed = await view(fixture.match.id, fixture.b1, later);
    expect(appealed.viewerAppeal).toEqual({ accepted: true, createdAt: later.toISOString() });
    expect(appealed.adminReason).toBe('appeal');
  });
});

describe('readable citations for players (A2, B8)', () => {
  it('returns rule and precedent excerpts without other case ids, names or admin notes', async () => {
    const NOW = new Date('2026-10-21T03:00:00.000Z');
    const otherCaseId = randomUUID();
    const ruleId = `BR-RA-T${randomUUID().slice(0, 6)}`;
    await prisma.knowledgeChunk.createMany({
      data: [
        { id: ruleId, kind: 'rule', ref: ruleId, text: `${ruleId}: Một set có nhiều ảnh thì lấy ảnh chụp muộn nhất. ${'x'.repeat(600)}`, embedding: [] },
        { id: `precedent:${otherCaseId}`, kind: 'precedent', ref: otherCaseId, embedding: [],
          text: 'Tranh chấp BO3: bằng chứng bên A ảnh Xanh ủng hộ TEAM_A_WIN; bên B không có ảnh; kết luận TEAM_A_WIN; lý do: Nguyễn Minh khai đúng' },
      ],
    });
    const fixture = await v2Fixture({
      endAt: new Date(NOW.getTime() - 4 * HOUR), status: 'appeal_window',
      caseData: { outcome: 'TEAM_A_WIN', appealDeadlineAt: new Date(NOW.getTime() + 6 * HOUR) },
    });
    await prisma.aiRuling.create({
      data: {
        caseId: fixture.resultCase.id, tier: 2, outcome: 'TEAM_A_WIN', confidence: 0.9, publishedAt: NOW, adminNotes: 'GHI-CHU-RIENG',
        citations: [ruleId, `precedent:${otherCaseId}`, 'BR-RA-99'],
        reasons: [{ text: 'Lấy ảnh chụp muộn nhất.', citations: [ruleId, `precedent:${otherCaseId}`] }, { text: 'Khác.', citations: ['BR-RA-99'] }],
      },
    });
    try {
      const result = await view(fixture.match.id, fixture.b1, NOW);
      const raw = JSON.stringify(result);
      expect(raw).not.toContain(otherCaseId);
      expect(raw).not.toContain('Nguyễn Minh');
      expect(raw).not.toContain('GHI-CHU-RIENG');
      const ruling = result.ruling!;
      expect(ruling.citations).toEqual([
        { id: ruleId, title: `Luật ${ruleId.slice(6)}`, excerpt: expect.stringMatching(/^Một set có nhiều ảnh/) },
        { id: 'precedent-1', title: 'Án lệ đã xử', excerpt: 'Tranh chấp BO3: bằng chứng bên A ảnh Xanh ủng hộ TEAM_A_WIN; bên B không có ảnh; kết luận TEAM_A_WIN' },
        { id: 'BR-RA-99', title: 'Luật 99', excerpt: null },
      ]);
      expect(ruling.citations[0]!.excerpt!.length).toBeLessThanOrEqual(400);
      expect(ruling.reasons).toEqual([
        { text: 'Lấy ảnh chụp muộn nhất.', citations: [ruleId, 'precedent-1'] }, { text: 'Khác.', citations: ['BR-RA-99'] },
      ]);
    } finally {
      await prisma.knowledgeChunk.deleteMany({ where: { id: { in: [ruleId, `precedent:${otherCaseId}`] } } });
    }
  });
});

describe('admin decision reason for players (mục 1)', () => {
  it('returns the reason Admin wrote for the roster, never the AI admin notes or adminUserId', async () => {
    const NOW = new Date('2026-10-21T03:00:00.000Z');
    const fixture = await v2Fixture({ endAt: new Date(NOW.getTime() - 4 * HOUR), status: 'final', caseData: { outcome: 'TEAM_A_WIN', adminReviewStartedAt: NOW } });
    await prisma.aiRuling.create({
      data: { caseId: fixture.resultCase.id, tier: 2, outcome: 'TEAM_A_WIN', confidence: 0.9, publishedAt: NOW, adminNotes: 'GHI-CHU-RIENG-ADMIN', citations: [], reasons: [{ text: 'x', citations: [] }] },
    });
    const adminUserId = randomUUID();
    await prisma.adminResultDecision.create({
      data: { caseId: fixture.resultCase.id, adminUserId, outcome: 'TEAM_A_WIN', reason: 'Giữ nguyên phán quyết tạm.', caseVersion: 1, createdAt: NOW },
    });
    const result = await view(fixture.match.id, fixture.b1, NOW);
    expect(result.adminDecision).toEqual({ outcome: 'TEAM_A_WIN', reason: 'Giữ nguyên phán quyết tạm.', decidedAt: NOW.toISOString() });
    const raw = JSON.stringify(result);
    expect(raw).not.toContain('GHI-CHU-RIENG-ADMIN');
    expect(raw).not.toContain(adminUserId);
    expect(raw.toLowerCase()).not.toMatch(/reputation|violation/);
  });

  it('is null while no Admin decision exists', async () => {
    const fixture = await v2Fixture();
    expect((await view(fixture.match.id, fixture.organizer, new Date())).adminDecision).toBeNull();
  });
});

describe('photo reading switch (mục 2)', () => {
  it('tells the roster whether automatic photo reading is on', async () => {
    const fixture = await v2Fixture();
    const read = async (aiChains: Parameters<typeof createApp>[0]['aiChains']) => (await request(createApp({ venueBookingClient, accountClient, aiChains }))
      .get(`/matches/${fixture.match.id}/result-case`).set('Authorization', `Bearer ${token(fixture.organizer)}`)).body.resultCase;
    expect((await read(fakeAi().ai)).photoReadingEnabled).toBe(true);
    expect((await read({ ocr: [], ruling: [], embedding: null, embeddingDims: 768 })).photoReadingEnabled).toBe(false);
  });
});
