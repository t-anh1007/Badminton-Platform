import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resetCircuitBreaker } from '@khoaluantn/ai';
import { prisma } from '../src/lib/prisma.js';
import { aiChainsFromEnv } from '../src/lib/aiClients.js';
import { readUploads } from '../src/domain/resultOcr.js';
import { submitClaimV2 } from '../src/domain/resultClaimsV2.js';
import { closeEvidenceWindow, openEvidenceWindow, recordPrecedent } from '../src/domain/resultDisputeV2.js';
import { searchKnowledge, upsertChunks } from '../src/domain/knowledge.js';
import { sampleChunk } from '../../../scripts/knowledge/ingest.js';
import { MIN, MemoryStorage, accountClient, cleanupV2, photo, v2Fixture } from './resultV2TestUtils.js';

// AC-RA-27 (RESULT_AI_ENABLED=false) và AC-RA-28 (kho truy hồi chỉ có án lệ đã qua Admin và ca mẫu).

const chunkIds: string[] = [];
afterAll(async () => {
  await prisma.knowledgeChunk.deleteMany({ where: { id: { in: chunkIds } } });
  await cleanupV2();
});
beforeEach(() => resetCircuitBreaker());

const storage = new MemoryStorage();
const vn = (local: string) => new Date(`${local}+07:00`);
const END = vn('2026-10-21T09:00:00');
const T0 = vn('2026-10-21T10:00:00');
/** Key giả cho mọi nhà cung cấp: nếu cờ không tắt được thì chuỗi sẽ có mắt xích. */
const AI_OFF = aiChainsFromEnv({
  RESULT_AI_ENABLED: 'false', GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k', OPENROUTER_API_KEY: 'k',
  AI_OCR_CHAIN: 'gemini:x,groq:y', AI_RULING_CHAIN: 'groq:z', AI_EMBEDDING: 'gemini:e:768',
});

/** Hồ sơ đã đóng nộp bằng chứng, có bằng chứng hợp lệ cho các bên cho trước. */
async function closedEvidenceCase(sides: Array<'TEAM_A_WIN' | 'TEAM_B_WIN'>) {
  const fixture = await v2Fixture({ endAt: END, status: 'evidence_window', caseData: { outcome: 'TEAM_A_WIN', evidenceDeadlineAt: T0 } });
  for (const [index, supports] of sides.entries()) {
    const owner = supports === 'TEAM_A_WIN' ? fixture.organizer : fixture.b1;
    const sets = supports === 'TEAM_A_WIN' ? [{ teamA: 21, teamB: 18 }, { teamA: 21, teamB: 15 }] : [{ teamA: 18, teamB: 21 }, { teamA: 15, teamB: 21 }];
    const claim = await prisma.resultClaim.create({
      data: { caseId: fixture.resultCase.id, claimantUserId: owner, outcome: supports, setWinsA: 0, setWinsB: 0, level: 'yellow', manualEntry: true,
        sets: { create: sets.map((set, position) => ({ position, ...set })) } },
    });
    await prisma.resultEvidence.create({
      data: { caseId: fixture.resultCase.id, claimId: claim.id, objectKey: `match/results/${owner}/${randomUUID()}.jpg`, mimeType: 'image/jpeg', size: 1,
        checksumSha256: randomUUID(), ownerUserId: owner, position: index, level: 'yellow', supports, capturedAt: T0 },
    });
  }
  return fixture;
}

describe('AC-RA-27: with RESULT_AI_ENABLED=false the flow still settles', () => {
  it('turns every chain off, even when keys are present', () => {
    expect(AI_OFF).toMatchObject({ ocr: [], ruling: [], embedding: null });
  });

  it('photos go to manual entry and the typed claim is at most yellow', async () => {
    const { match, organizer } = await v2Fixture({ endAt: END });
    const draft = await readUploads(
      { matchId: match.id, userId: organizer, items: [storage.put(organizer, await photo(800, new Date(END.getTime() + MIN)))] },
      { storage, ai: AI_OFF, accountClient },
    );
    expect(draft.draft).toMatchObject({ manualEntry: true, sets: [], level: 'yellow' });
    const claim = await submitClaimV2({
      matchId: match.id, userId: organizer, draftId: draft.draftId, columnMapping: null, editedCells: [],
      sets: [{ teamA: 21, teamB: 18 }, { teamA: 21, teamB: 15 }],
    }, { accountClient, now: T0, openDispute: openEvidenceWindow });
    expect(claim).toMatchObject({ level: 'yellow' });
  });

  it('tier 1 still rules on one-sided evidence', async () => {
    const fixture = await closedEvidenceCase(['TEAM_A_WIN']);
    expect(await closeEvidenceWindow(fixture.resultCase.id, { ai: AI_OFF, now: () => new Date(T0.getTime() + MIN) })).toBe('rule_ruling');
  });

  it('a two-sided dispute goes to Admin instead of tier 2', async () => {
    const fixture = await closedEvidenceCase(['TEAM_A_WIN', 'TEAM_B_WIN']);
    expect(await closeEvidenceWindow(fixture.resultCase.id, { ai: AI_OFF, now: () => new Date(T0.getTime() + MIN) })).toBe('admin_review');
    expect((await prisma.matchResultCase.findUniqueOrThrow({ where: { id: fixture.resultCase.id } })).status).toBe('admin_review');
  });
});

describe('AC-RA-28: retrieval only holds Admin-decided precedents and samples', () => {
  it('ingests samples.json as labelled samples, records a precedent only after an Admin decision, and retrieves only those kinds', async () => {
    const token = `kiemthu${randomUUID().slice(0, 8)}`;
    const samples = JSON.parse(readFileSync(new URL('../../../scripts/knowledge/samples.json', import.meta.url), 'utf8')) as Array<Parameters<typeof sampleChunk>[0]>;
    expect(samples.length).toBeGreaterThan(0);
    const sample = sampleChunk({ ...samples[0]!, id: `${token}-mau`, summary: `${samples[0]!.summary} ${token}` });
    expect(sample).toMatchObject({ id: `sample:${token}-mau`, kind: 'sample', metadata: { label: 'mẫu' } });
    chunkIds.push(sample.id);
    await upsertChunks([sample, { id: `${token}-rule`, kind: 'rule', ref: 'BR-RA-00', text: `Luật thử ${token}` }], { ai: AI_OFF });
    chunkIds.push(`${token}-rule`);

    // Hồ sơ AI tự chốt (không có quyết định Admin): không thành án lệ.
    const aiOnly = await v2Fixture({ endAt: END, status: 'final', caseData: { outcome: 'TEAM_A_WIN' } });
    expect(await recordPrecedent(aiOnly.resultCase.id, { ai: AI_OFF })).toBeNull();
    // Hồ sơ có quyết định Admin: thành án lệ ẩn danh (không id người, không id hồ sơ trong nội dung).
    const decided = await v2Fixture({ endAt: END, status: 'final', caseData: { outcome: 'TEAM_B_WIN', adminReviewStartedAt: T0 } });
    await prisma.adminResultDecision.create({
      data: { caseId: decided.resultCase.id, adminUserId: randomUUID(), outcome: 'TEAM_B_WIN', reason: `Ảnh đội B rõ ${token}`, caseVersion: 1 },
    });
    const text = await recordPrecedent(decided.resultCase.id, { ai: AI_OFF });
    chunkIds.push(`precedent:${decided.resultCase.id}`);
    expect(text).toContain('TEAM_B_WIN');
    for (const id of [decided.organizer, decided.b1, decided.match.id]) expect(text).not.toContain(id);

    const hits = await searchKnowledge(token, { kinds: ['precedent', 'sample'], limit: 10 }, { ai: AI_OFF });
    const ids = hits.map((hit) => hit.id);
    expect(ids).toEqual(expect.arrayContaining([`sample:${token}-mau`, `precedent:${decided.resultCase.id}`]));
    expect(ids).not.toContain(`${token}-rule`);
    expect(ids).not.toContain(`precedent:${aiOnly.resultCase.id}`);
  });
});
