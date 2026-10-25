import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { resetCircuitBreaker } from '@khoaluantn/ai';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { readUploads } from '../src/domain/resultOcr.js';
import { submitClaimV2 } from '../src/domain/resultClaimsV2.js';
import { openEvidenceWindow } from '../src/domain/resultDisputeV2.js';
import { sweepAllResultDeadlines } from '../src/domain/resultSweepV2.js';
import {
  HOUR, MIN, MemoryStorage, accountClient, cleanupV2, fakeAi, photo, reading, token, v2Fixture, venueBookingClient,
} from './resultV2TestUtils.js';

afterAll(cleanupV2);
beforeEach(() => resetCircuitBreaker());

const storage = new MemoryStorage();
const vn = (local: string) => new Date(`${local}+07:00`);
const A_WIN = [{ teamA: 21, teamB: 18 }, { teamA: 21, teamB: 15 }];

async function propose(matchId: string, userId: string, capturedAt: Date, now: Date) {
  const { draftId } = await readUploads(
    { matchId, userId, items: [storage.put(userId, await photo(800, capturedAt))] },
    { storage, ai: fakeAi({ ocr: reading([[21, 18], [21, 15]]) }).ai, accountClient },
  );
  return submitClaimV2({ matchId, userId, draftId, sets: A_WIN, columnMapping: null, editedCells: [] }, { accountClient, now, openDispute: openEvidenceWindow });
}

const finalEvents = (matchId: string) => prisma.outbox.count({ where: { aggregateId: matchId, eventType: 'MatchResultFinalized' } });

describe('sweeping photo-result deadlines', () => {
  it('a green window that expired is final exactly once, even when swept twice', async () => {
    const endAt = vn('2026-10-21T09:00:00');
    const { match, organizer } = await v2Fixture({ endAt });
    const result = await propose(match.id, organizer, new Date(endAt.getTime() + MIN), vn('2026-10-21T10:00:00'));
    expect(result.level).toBe('green');
    const after = vn('2026-10-21T12:00:01');
    await sweepAllResultDeadlines(vn('2026-10-21T11:59:00'), [match.id]);
    expect((await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } })).status).toBe('proposed');
    await sweepAllResultDeadlines(after, [match.id]);
    await sweepAllResultDeadlines(after, [match.id]);
    expect(await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } })).toMatchObject({ status: 'final', outcome: 'TEAM_A_WIN' });
    expect(await finalEvents(match.id)).toBe(1);
  });

  it('a red claim goes to Admin after 12 hours and never settles money', async () => {
    const endAt = vn('2026-10-21T09:00:00');
    const { match, organizer, startAt } = await v2Fixture({ endAt });
    expect((await propose(match.id, organizer, new Date(startAt.getTime() - 2 * HOUR), vn('2026-10-21T10:00:00'))).level).toBe('red');
    await sweepAllResultDeadlines(vn('2026-10-21T22:00:01'), [match.id]);
    expect((await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } })).status).toBe('admin_review');
    expect(await finalEvents(match.id)).toBe(0);
  });

  it('reading the case after the deadline settles it lazily (no periodic sweeper)', async () => {
    const endAt = new Date(Date.now() - 30 * HOUR);
    const { match, resultCase, organizer } = await v2Fixture({ endAt });
    const claimedAt = new Date(endAt.getTime() + HOUR);
    await prisma.matchResultCase.update({ where: { id: resultCase.id }, data: { declarationDeadlineAt: new Date(Date.now() + HOUR) } });
    await propose(match.id, organizer, new Date(endAt.getTime() + MIN), claimedAt);
    await prisma.matchResultCase.update({ where: { id: resultCase.id }, data: { responseDeadlineAt: new Date(Date.now() - MIN) } });
    const app = createApp({ venueBookingClient, accountClient, resultStorage: storage, aiChains: fakeAi().ai });
    const response = await request(app).get(`/matches/${match.id}/result-case`).set('Authorization', `Bearer ${token(organizer)}`);
    expect(response.status).toBe(200);
    expect(response.body.resultCase).toMatchObject({ status: 'final', rulesVersion: 'ra_v1' });
  });

  it('a legacy provisional case still settles on its old 12-hour deadline', async () => {
    const { match } = await v2Fixture({
      rulesVersion: 'legacy', status: 'provisional',
      caseData: { outcome: 'TEAM_A_WIN', objectionDeadlineAt: vn('2026-10-21T21:00:00') },
    });
    await sweepAllResultDeadlines(vn('2026-10-21T20:59:00'), [match.id]);
    expect((await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } })).status).toBe('provisional');
    await sweepAllResultDeadlines(vn('2026-10-21T21:00:00'), [match.id]);
    expect((await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } })).status).toBe('final');
  });

  it('a 12-hour declaration window ending at 02:00 waits until 08:00 before the incident window', async () => {
    const endAt = vn('2026-10-21T14:00:00');
    const { match, resultCase } = await v2Fixture({ endAt });
    // Hạn khai do openResultCase lưu đã giãn: 02:00 → 08:00.
    await prisma.matchResultCase.update({ where: { id: resultCase.id }, data: { declarationDeadlineAt: vn('2026-10-22T08:00:00') } });
    await sweepAllResultDeadlines(vn('2026-10-22T02:00:01'), [match.id]);
    expect((await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } })).status).toBe('declaration_open');
    await sweepAllResultDeadlines(vn('2026-10-22T08:00:00'), [match.id]);
    const moved = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } });
    expect(moved.status).toBe('incident_window');
    expect(moved.incidentDeadlineAt?.toISOString()).toBe(vn('2026-10-22T20:00:00').toISOString());
  });
});
