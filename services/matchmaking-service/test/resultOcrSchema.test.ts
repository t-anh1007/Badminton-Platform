import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { purgeResultCases } from './resultTestUtils.js';

const matchIds: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  await purgeResultCases(matchIds);
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.$disconnect();
});

async function resultCase() {
  const endAt = new Date();
  const match = await prisma.match.create({
    data: {
      bookingId: randomUUID(), organizerUserId: randomUUID(), capacity: 2, discipline: 'singles', feePerSlot: 1n,
      status: 'completed', cutoffAt: endAt, startAt: endAt, endAt,
    },
  });
  matchIds.push(match.id);
  return prisma.matchResultCase.create({ data: { matchId: match.id, declarationDeadlineAt: endAt } });
}

describe('result OCR schema', () => {
  it('new cases default to the ra_v1 rules', async () => {
    expect((await resultCase()).rulesVersion).toBe('ra_v1');
  });

  it('result_uploads is append-only', async () => {
    const created = await resultCase();
    const upload = await prisma.resultUpload.create({
      data: {
        caseId: created.id, userId: randomUUID(), draftId: 'd', objectKey: `match/results/x/${randomUUID()}.png`,
        checksumSha256: 'c', mimeType: 'image/png', size: 1, capturedAtSource: 'none', dhash: '0000000000000000',
      },
    });
    await expect(prisma.resultUpload.update({ where: { id: upload.id }, data: { isScreenshot: true } })).rejects.toThrow(/RESULT_AUDIT_IMMUTABLE/);
  });

  it('keeps the old append-only trigger on result_claims', async () => {
    const created = await resultCase();
    const claim = await prisma.resultClaim.create({
      data: { caseId: created.id, claimantUserId: randomUUID(), outcome: 'TEAM_A_WIN', setWinsA: 2, setWinsB: 0 },
    });
    await expect(prisma.resultClaim.update({ where: { id: claim.id }, data: { level: 'green' } })).rejects.toThrow(/RESULT_AUDIT_IMMUTABLE/);
  });

  it('full-text search over knowledge_chunks works', async () => {
    const rows = await prisma.$queryRaw<unknown[]>`SELECT ts_rank(tsv, plainto_tsquery('simple', 'ảnh trùng')) FROM knowledge_chunks LIMIT 1`;
    expect(Array.isArray(rows)).toBe(true);
  });

  it('allows one violation per user per case', async () => {
    const created = await resultCase();
    const userId = randomUUID();
    userIds.push(userId);
    await prisma.playerViolation.create({ data: { userId, caseId: created.id, kind: 'exact_duplicate', source: 'auto' } });
    await expect(prisma.playerViolation.create({ data: { userId, caseId: created.id, kind: 'false_claim', source: 'admin' } }))
      .rejects.toMatchObject({ code: 'P2002' });
  });
});
