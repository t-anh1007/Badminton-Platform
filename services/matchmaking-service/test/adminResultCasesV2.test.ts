import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { resetCircuitBreaker } from '@khoaluantn/ai';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { readUploads } from '../src/domain/resultOcr.js';
import { confirmV2, reportIncidentV2, submitClaimV2 } from '../src/domain/resultClaimsV2.js';
import { openEvidenceWindow } from '../src/domain/resultDisputeV2.js';
import { HOUR, MIN, MemoryStorage, accountClient, cleanupV2, fakeAi, photo, reading, token, v2Fixture, venueBookingClient } from './resultV2TestUtils.js';

// Plan web A5 (B5, B6, B7): hàng chờ Admin có lý do + lọc, chi tiết hồ sơ ra_v1, loại vi phạm cố định.

afterAll(cleanupV2);
beforeEach(() => resetCircuitBreaker());

const storage = new MemoryStorage();
const admin = randomUUID();
const app = createApp({ venueBookingClient, accountClient, aiChains: fakeAi().ai });
const A_WIN = [{ teamA: 21, teamB: 18 }, { teamA: 21, teamB: 15 }];
const get = (path: string) => request(app).get(path).set('Authorization', `Bearer ${token(admin, ['admin'])}`);

async function claimWith(matchId: string, userId: string, bytes: Buffer, checksum?: string) {
  const { draftId } = await readUploads(
    { matchId, userId, items: [storage.put(userId, bytes, checksum)] },
    { storage, ai: fakeAi({ ocr: reading([[21, 18], [21, 15]]) }).ai, accountClient },
  );
  return submitClaimV2({ matchId, userId, draftId, sets: A_WIN, columnMapping: null, editedCells: [] }, { accountClient, openDispute: openEvidenceWindow });
}

/** Bản khai Đỏ (chụp trước giờ đánh) + đội thua Đồng ý → Admin. */
async function redCase(bytes?: Buffer, checksum?: string) {
  const fixture = await v2Fixture();
  await claimWith(fixture.match.id, fixture.organizer, bytes ?? await photo(800, new Date(fixture.startAt.getTime() - 2 * HOUR)), checksum);
  const { version } = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: fixture.match.id } });
  await confirmV2({ matchId: fixture.match.id, userId: fixture.b1, claimVersion: version });
  return fixture;
}

describe('admin queue and case view for photo results', () => {
  it('labels each queued case with why it is there and filters by reason and level (B5)', async () => {
    const red = await redCase();
    const incident = await v2Fixture();
    await reportIncidentV2({ matchId: incident.match.id, userId: incident.b1, type: 'interrupted', description: 'Bỏ dở' });
    const legacy = await v2Fixture({ rulesVersion: 'legacy', status: 'admin_review', caseData: { adminReviewStartedAt: new Date() } });

    const all = await get('/matches/admin/result-cases?pageSize=100');
    expect(all.status).toBe(200);
    const byCase = new Map(all.body.items.map((item: { caseId: string }) => [item.caseId, item]));
    expect(byCase.get(red.resultCase.id)).toMatchObject({ adminReason: 'unknown_photo', level: 'red' });
    expect(byCase.get(incident.resultCase.id)).toMatchObject({ adminReason: 'incident', level: null });
    expect(byCase.get(legacy.resultCase.id)).toMatchObject({ adminReason: 'legacy', level: null });

    const incidents = await get('/matches/admin/result-cases?reason=incident&pageSize=100');
    expect(incidents.body.items.every((item: { adminReason: string }) => item.adminReason === 'incident')).toBe(true);
    expect(incidents.body.items.map((item: { caseId: string }) => item.caseId)).toContain(incident.resultCase.id);
    expect(incidents.body.total).toBe(incidents.body.items.length);

    const reds = await get('/matches/admin/result-cases?level=red&pageSize=100');
    expect(reds.body.items.map((item: { caseId: string }) => item.caseId)).toContain(red.resultCase.id);
    expect(reds.body.items.map((item: { caseId: string }) => item.caseId)).not.toContain(incident.resultCase.id);

    expect((await get('/matches/admin/result-cases?reason=nope')).status).toBe(400);
  });

  it('shows full claims with photo signals and AI details, including duplicates of other cases (B6, Q9)', async () => {
    const bytes = await photo(800, new Date(Date.now() - 3 * HOUR - 20 * MIN));
    const checksum = Buffer.from(randomUUID().replace(/-/g, '').padEnd(64, '0'), 'hex').toString('base64');
    const first = await redCase(bytes, checksum);
    const second = await redCase(bytes, checksum);
    const detail = await get(`/matches/admin/result-cases/${second.resultCase.id}`);
    expect(detail.status).toBe(200);
    const view = detail.body.resultCase;
    expect(view.adminReason).toBe('unknown_photo');
    expect(view.claims).toHaveLength(1);
    const [claim] = view.claimViews;
    expect(claim).toMatchObject({ claimantUserId: second.organizer, side: 'A', outcome: 'TEAM_A_WIN', level: 'red', manualEntry: false });
    expect(claim.reasons).toContain('EXACT_DUPLICATE');
    const [image] = claim.images;
    expect(image).toMatchObject({
      exactDuplicateOf: { matchCode: first.match.businessCode }, nearDuplicateOf: null, isScreenshot: false,
      ai: { provider: 'gemini', confidence: 0.97 },
    });
    expect(image.capturedAt).not.toBeNull();
    expect(image.ai.reading.sets).toHaveLength(2);
  });

  it('only accepts the fixed admin violation kinds (B7)', async () => {
    const red = await redCase();
    const response = await request(app).post(`/matches/${red.match.id}/admin-decision`).set('Authorization', `Bearer ${token(admin, ['admin'])}`)
      .send({
        outcome: 'TEAM_A_WIN', reason: 'x', caseVersion: 1, previewToken: 'p', confirm: true,
        violations: [{ userId: red.organizer, kind: 'something_else' }],
      });
    expect([response.status, response.body.error?.code]).toEqual([400, 'RESULT_VIOLATION_KIND_INVALID']);
  });
});
