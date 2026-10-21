import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetCircuitBreaker } from '@khoaluantn/ai';
import { prisma } from '../src/lib/prisma.js';
import { runPendingRulings } from '../src/domain/disputeRulingJob.js';
import { upsertChunks } from '../src/domain/knowledge.js';
import { MIN, cleanupV2, fakeAi, v2Fixture } from './resultV2TestUtils.js';

const chunkId = `BR-RA-34#ruling-test-${randomUUID().slice(0, 8)}`;
beforeAll(async () => {
  await upsertChunks([{ id: chunkId, kind: 'rule', ref: 'BR-RA-34', text: 'Tranh chấp tỉ số: bằng chứng hai bên mâu thuẫn, kể cả Xanh ngược Vàng, chuyển tầng 2.' }],
    { ai: { ocr: [], ruling: [], embedding: null, embeddingDims: 4 } });
});
afterAll(async () => {
  await prisma.knowledgeChunk.deleteMany({ where: { id: chunkId } });
  await cleanupV2();
});
beforeEach(() => resetCircuitBreaker());

const NOW = new Date('2026-10-21T03:00:00.000Z'); // 10:00 giờ VN

/** Hồ sơ đang chờ tầng 2 với bằng chứng Xanh (A thắng) ngược Vàng (B thắng). */
async function pendingCase(retryUntil = new Date(NOW.getTime() + 30 * MIN)) {
  const fixture = await v2Fixture({
    endAt: new Date(NOW.getTime() - 3 * 3_600_000), status: 'ai_ruling',
    caseData: { pendingRuling: true, rulingRetryUntil: retryUntil, outcome: 'TEAM_A_WIN' },
  });
  const add = async (userId: string, outcome: 'TEAM_A_WIN' | 'TEAM_B_WIN', level: 'green' | 'yellow', sets: Array<[number, number]>) => {
    const claim = await prisma.resultClaim.create({
      data: {
        caseId: fixture.resultCase.id, claimantUserId: userId, outcome, setWinsA: 0, setWinsB: 0, level,
        sets: { create: sets.map(([teamA, teamB], position) => ({ position, teamA, teamB })) },
      },
    });
    await prisma.resultEvidence.create({
      data: {
        caseId: fixture.resultCase.id, claimId: claim.id, objectKey: `match/results/${userId}/${randomUUID()}.jpg`, mimeType: 'image/jpeg',
        size: 1, checksumSha256: randomUUID(), ownerUserId: userId, position: 0, level, supports: outcome,
        capturedAt: level === 'green' ? NOW : null,
      },
    });
  };
  await add(fixture.organizer, 'TEAM_A_WIN', 'green', [[21, 18], [21, 15]]);
  await add(fixture.b1, 'TEAM_B_WIN', 'yellow', [[18, 21], [15, 21]]);
  return fixture;
}

/** AI giả trích dẫn đoạn đầu tiên được truy hồi. */
function rulingAi(confidence: number) {
  return fakeAi({
    ruling: (body) => {
      const payload = JSON.parse(String(body.messages[1]!.content)) as { rules: Array<{ id: string }> };
      return {
        outcome: 'TEAM_A_WIN', confidence,
        reasons: [{ text: 'Ảnh của đội A có giờ chụp hợp lệ.', citations: [payload.rules[0]!.id] }],
        adminNotes: 'GHI-CHU-ADMIN: ảnh B không có giờ chụp.',
      };
    },
  });
}

const caseOf = (matchId: string) => prisma.matchResultCase.findUniqueOrThrow({ where: { matchId } });

describe('tier-2 provisional ruling job', () => {
  it('confidence 0.9 publishes the ruling and opens a 6-hour appeal window without admin notes for the roster', async () => {
    const { match, resultCase } = await pendingCase();
    const { ai, bodies } = rulingAi(0.9);
    expect(await runPendingRulings(NOW, { ai }, [match.id])).toBe(1);
    expect(await caseOf(match.id)).toMatchObject({ status: 'appeal_window', outcome: 'TEAM_A_WIN', pendingRuling: false });
    const ruling = await prisma.aiRuling.findFirstOrThrow({ where: { caseId: resultCase.id } });
    expect(ruling).toMatchObject({ tier: 2, outcome: 'TEAM_A_WIN', confidence: 0.9 });
    expect(ruling.publishedAt).not.toBeNull();
    const notices = await prisma.outbox.findMany({ where: { aggregateId: { startsWith: `match.result.ai_ruling_published:${resultCase.id}` } } });
    expect(notices.length).toBeGreaterThan(0);
    expect(JSON.stringify(notices.map((notice) => notice.payload))).not.toContain('GHI-CHU-ADMIN');
    expect(bodies.join('')).not.toContain('data:image');
    // Không có uy tín của người chơi nào trong đầu vào (đoạn luật truy hồi có thể nhắc khái niệm uy tín).
    const payload = JSON.parse(JSON.parse(bodies[0]!).messages[1].content) as { evidence: unknown[] };
    expect(JSON.stringify(payload.evidence).toLowerCase()).not.toMatch(/reputation|uy tín|violation/);
    expect(Object.keys(payload)).toEqual(['caseRef', 'format', 'evidence', 'rules']);
  });

  it('confidence 0.6 goes straight to Admin', async () => {
    const { match } = await pendingCase();
    await runPendingRulings(NOW, { ai: rulingAi(0.6).ai }, [match.id]);
    expect(await caseOf(match.id)).toMatchObject({ status: 'admin_review', pendingRuling: false });
  });

  it('keeps waiting while every link fails within 30 minutes, then moves to Admin', async () => {
    const { match } = await pendingCase();
    const { ai } = fakeAi({ ruling: 'fail' });
    await runPendingRulings(NOW, { ai }, [match.id]);
    await runPendingRulings(new Date(NOW.getTime() + 10 * MIN), { ai }, [match.id]);
    expect(await caseOf(match.id)).toMatchObject({ status: 'ai_ruling', pendingRuling: true });
    await runPendingRulings(new Date(NOW.getTime() + 31 * MIN), { ai }, [match.id]);
    expect((await caseOf(match.id)).status).toBe('admin_review');
  });

  it('two concurrent runs create only one ruling', async () => {
    const { match, resultCase } = await pendingCase();
    const { ai } = rulingAi(0.95);
    await Promise.all([runPendingRulings(NOW, { ai }, [match.id]), runPendingRulings(NOW, { ai }, [match.id])]);
    expect(await prisma.aiRuling.count({ where: { caseId: resultCase.id } })).toBe(1);
  });
});
