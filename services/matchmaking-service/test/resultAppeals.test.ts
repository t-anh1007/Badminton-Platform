import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { acceptRuling, submitAppeal } from '../src/domain/resultDisputeV2.js';
import { decideAdminResult, previewAdminDecision } from '../src/domain/resultLifecycle.js';
import { sweepResultDeadlinesV2 } from '../src/domain/resultSweepV2.js';
import { HOUR, MemoryStorage, accountClient, cleanupV2, fakeAi, matchIds, randomChecksum, token, v2Fixture, venueBookingClient } from './resultV2TestUtils.js';

afterAll(async () => {
  const caseIds = (await prisma.matchResultCase.findMany({ where: { matchId: { in: matchIds } }, select: { id: true } })).map((row) => row.id);
  await prisma.knowledgeChunk.deleteMany({ where: { id: { in: caseIds.map((id) => `precedent:${id}`) } } });
  await cleanupV2();
});

const storage = new MemoryStorage();
const NOW = new Date('2026-10-21T03:00:00.000Z');

/** Hồ sơ đang ở 6 giờ kháng nghị với kết quả tạm tầng 1 (mặc định: đội A thắng). */
async function appealCase(options: { doubles?: boolean; payerForPartner?: boolean; outcome?: 'TEAM_A_WIN' | 'TEAM_B_WIN' | 'NO_RESULT' } = {}) {
  const outcome = options.outcome ?? 'TEAM_A_WIN';
  const fixture = await v2Fixture({
    doubles: options.doubles, payerForPartner: options.payerForPartner, endAt: new Date(NOW.getTime() - 4 * HOUR), status: 'appeal_window',
    caseData: { outcome, appealDeadlineAt: new Date(NOW.getTime() + 6 * HOUR) },
  });
  const ruling = await prisma.aiRuling.create({
    data: {
      caseId: fixture.resultCase.id, tier: 1, outcome, citations: ['BR-RA-31'], publishedAt: NOW,
      reasons: [{ text: 'Chỉ có bằng chứng hợp lệ ủng hộ đội A thắng.', citations: ['BR-RA-31'] }],
    },
  });
  return { ...fixture, ruling };
}

const photoItem = (userId: string) => storage.put(userId, Buffer.from(randomUUID()));
const caseOf = (matchId: string) => prisma.matchResultCase.findUniqueOrThrow({ where: { matchId } });

describe('appeals', () => {
  it('rejects an appeal without new photos or a pointed reason, and records it', async () => {
    const { match, resultCase, b1, ruling } = await appealCase();
    await expect(submitAppeal({ matchId: match.id, userId: b1, rulingId: ruling.id, reason: 'Sai' }, { storage, now: NOW }))
      .rejects.toMatchObject({ code: 'RESULT_APPEAL_GROUNDS_REQUIRED' });
    expect(await prisma.resultAppeal.findMany({ where: { caseId: resultCase.id }, select: { accepted: true } })).toEqual([{ accepted: false }]);
    expect((await caseOf(match.id)).status).toBe('appeal_window');
  });

  it('only the losing side may appeal', async () => {
    const { match, organizer, ruling } = await appealCase();
    await expect(submitAppeal({ matchId: match.id, userId: organizer, rulingId: ruling.id, reason: 'x', pointedReason: 'y' }, { storage, now: NOW }))
      .rejects.toMatchObject({ code: 'RESULT_APPEAL_LOSER_ONLY' });
  });

  it('allows two appeal photos beyond the 7-photo cap and moves the case to Admin', async () => {
    const { match, resultCase, b1, ruling } = await appealCase();
    await prisma.resultEvidence.createMany({
      data: Array.from({ length: 7 }, (_, position) => ({
        caseId: resultCase.id, objectKey: `match/results/${b1}/${randomUUID()}.jpg`, mimeType: 'image/jpeg', size: 1,
        checksumSha256: randomChecksum(), ownerUserId: b1, position, purpose: 'claim',
      })),
    });
    const result = await submitAppeal(
      { matchId: match.id, userId: b1, rulingId: ruling.id, reason: 'Ảnh mới', evidence: [photoItem(b1), photoItem(b1)] }, { storage, now: NOW },
    );
    expect(result.status).toBe('admin_review');
    expect(await prisma.resultEvidence.count({ where: { caseId: resultCase.id, ownerUserId: b1, purpose: 'appeal' } })).toBe(2);
    expect((await prisma.aiRuling.findUniqueOrThrow({ where: { id: ruling.id } })).appealedAt).not.toBeNull();
  });

  it('rejects appeals after the 6-hour window', async () => {
    const { match, b1, ruling } = await appealCase();
    await expect(submitAppeal({ matchId: match.id, userId: b1, rulingId: ruling.id, reason: 'x', pointedReason: 'y' },
      { storage, now: new Date(NOW.getTime() + 6 * HOUR) })).rejects.toMatchObject({ code: 'RESULT_APPEAL_CLOSED' });
  });

  it('accepting the ruling: one loser settles singles and doubles at once (D63)', async () => {
    const single = await appealCase();
    expect(await acceptRuling({ matchId: single.match.id, userId: single.b1, rulingId: single.ruling.id }, NOW)).toEqual({ status: 'final' });
    const doubles = await appealCase({ doubles: true });
    expect((await acceptRuling({ matchId: doubles.match.id, userId: doubles.b1, rulingId: doubles.ruling.id }, NOW)).status).toBe('final');
  });

  it('NO_RESULT ruling needs one acceptance from each team', async () => {
    const { match, organizer, b1, ruling } = await appealCase({ doubles: true, outcome: 'NO_RESULT' });
    expect((await acceptRuling({ matchId: match.id, userId: b1, rulingId: ruling.id }, NOW)).status).toBe('appeal_window');
    expect((await acceptRuling({ matchId: match.id, userId: organizer, rulingId: ruling.id }, NOW)).status).toBe('final');
  });

  it('NO_RESULT: both teams appeal into one case, Admin only once the other team has answered', async () => {
    const { match, resultCase, organizer, b1, ruling } = await appealCase({ outcome: 'NO_RESULT' });
    expect((await submitAppeal({ matchId: match.id, userId: b1, rulingId: ruling.id, reason: 'x', pointedReason: 'y' }, { storage, now: NOW })).status).toBe('appeal_window');
    expect((await caseOf(match.id)).status).toBe('appeal_window');
    await expect(submitAppeal({ matchId: match.id, userId: b1, rulingId: ruling.id, reason: 'x', pointedReason: 'y' }, { storage, now: NOW }))
      .rejects.toMatchObject({ code: 'RESULT_APPEAL_ALREADY_SENT' });
    expect((await submitAppeal({ matchId: match.id, userId: organizer, rulingId: ruling.id, reason: 'x', pointedReason: 'y' }, { storage, now: NOW })).status).toBe('admin_review');
    expect(await prisma.resultAppeal.count({ where: { caseId: resultCase.id, accepted: true } })).toBe(2);
  });

  it('NO_RESULT: one team appeals, the other accepts → Admin; nobody answers → Admin at the deadline', async () => {
    const accepted = await appealCase({ outcome: 'NO_RESULT' });
    await submitAppeal({ matchId: accepted.match.id, userId: accepted.b1, rulingId: accepted.ruling.id, reason: 'x', pointedReason: 'y' }, { storage, now: NOW });
    expect((await acceptRuling({ matchId: accepted.match.id, userId: accepted.organizer, rulingId: accepted.ruling.id }, NOW)).status).toBe('admin_review');
    const silent = await appealCase({ outcome: 'NO_RESULT' });
    await submitAppeal({ matchId: silent.match.id, userId: silent.b1, rulingId: silent.ruling.id, reason: 'x', pointedReason: 'y' }, { storage, now: NOW });
    await sweepResultDeadlinesV2(new Date(NOW.getTime() + 6 * HOUR), [silent.match.id]);
    expect((await caseOf(silent.match.id)).status).toBe('admin_review');
  });

  it('a paid-for partner accepting does not settle; the payer accepting does (BR-RA-23)', async () => {
    const { match, partner, organizer, ruling } = await appealCase({ doubles: true, payerForPartner: true, outcome: 'TEAM_B_WIN' });
    expect((await acceptRuling({ matchId: match.id, userId: partner, rulingId: ruling.id }, NOW)).status).toBe('appeal_window');
    expect((await acceptRuling({ matchId: match.id, userId: organizer, rulingId: ruling.id }, NOW)).status).toBe('final');
  });

  it('Admin upholds a groundless appeal: one violation, ruling kept, one precedent chunk', async () => {
    const { match, resultCase, b1, ruling } = await appealCase();
    await submitAppeal({ matchId: match.id, userId: b1, rulingId: ruling.id, reason: 'Sai', pointedReason: 'Set 2 sai' }, { storage, now: NOW });
    const admin = randomUUID();
    const preview = await previewAdminDecision(accountClient, admin, match.id, { outcome: 'TEAM_A_WIN', reason: 'Bằng chứng A hợp lệ' });
    const app = createApp({ venueBookingClient, accountClient, resultStorage: storage, aiChains: fakeAi().ai });
    const response = await request(app).post(`/matches/${match.id}/admin-decision`).set('Authorization', `Bearer ${token(admin, ['admin'])}`).send({
      outcome: 'TEAM_A_WIN', reason: 'Bằng chứng A hợp lệ', caseVersion: preview.caseVersion, previewToken: preview.previewToken, confirm: true,
      appealGrounded: false,
    });
    expect(response.status).toBe(201);
    expect(await prisma.playerViolation.findMany({ where: { caseId: resultCase.id }, select: { userId: true, source: true } }))
      .toEqual([{ userId: b1, source: 'admin' }]);
    expect(await prisma.aiRuling.findUniqueOrThrow({ where: { id: ruling.id } })).toMatchObject({ finalOutcome: 'TEAM_A_WIN', overturned: false });
    const chunk = await prisma.knowledgeChunk.findUniqueOrThrow({ where: { id: `precedent:${resultCase.id}` } });
    expect(chunk.kind).toBe('precedent');
    expect(chunk.text).not.toContain(b1);
  });

  it('an exact duplicate photo creates one automatic violation at final, never two per case', async () => {
    const { match, resultCase, b1, ruling, organizer } = await appealCase();
    await prisma.resultEvidence.createMany({
      data: [0, 1].map((position) => ({
        caseId: resultCase.id, objectKey: `match/results/${organizer}/${randomUUID()}.jpg`, mimeType: 'image/jpeg', size: 1,
        checksumSha256: randomChecksum(), ownerUserId: organizer, position, exactDuplicateOfId: randomUUID(),
      })),
    });
    await acceptRuling({ matchId: match.id, userId: b1, rulingId: ruling.id }, NOW);
    expect(await prisma.playerViolation.findMany({ where: { caseId: resultCase.id }, select: { userId: true, source: true } }))
      .toEqual([{ userId: organizer, source: 'auto' }]);
    // Admin muốn ghi thêm vi phạm cùng hồ sơ: không được ghi lần hai.
    await prisma.playerViolation.createMany({ data: [{ userId: organizer, caseId: resultCase.id, kind: 'x', source: 'admin' }], skipDuplicates: true });
    expect(await prisma.playerViolation.count({ where: { caseId: resultCase.id, userId: organizer } })).toBe(1);
  });

  it('a decision without prior ruling still finalizes legacy-style for an Admin-routed ra_v1 case', async () => {
    const { match } = await v2Fixture({ status: 'admin_review' });
    const admin = randomUUID();
    const preview = await previewAdminDecision(accountClient, admin, match.id, { outcome: 'NO_RESULT', reason: 'Sự cố' });
    await decideAdminResult(admin, match.id, { outcome: 'NO_RESULT', reason: 'Sự cố', caseVersion: preview.caseVersion, previewToken: preview.previewToken });
    expect((await caseOf(match.id)).status).toBe('final');
  });
});
