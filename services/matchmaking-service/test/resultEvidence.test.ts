import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { S3ObjectStorageClient } from '@khoaluantn/object-storage';
import { prisma } from '../src/lib/prisma.js';
import { purgeResultCases } from './resultTestUtils.js';
import {
  RESULT_EVIDENCE_MAX_BYTES,
  authorizeResultEvidenceUpload,
  insertResultEvidence,
  inspectResultEvidence,
  readResultEvidence,
  sweepResultEvidenceRetention,
  type VerifiedResultEvidence,
} from '../src/domain/resultEvidence.js';

const CHECKSUM = Buffer.alloc(32, 1).toString('base64');
const OTHER_CHECKSUM = Buffer.alloc(32, 2).toString('base64');
const s3 = new S3Client({
  endpoint: 'http://127.0.0.1:9', region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});
const storage = new S3ObjectStorageClient({ bucket: 'private-test', s3, privateBucket: true });
const send = vi.spyOn(s3, 'send');
const matchIds: string[] = [];

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ ContentType: 'image/png', ContentLength: 1_000, ChecksumSHA256: CHECKSUM } as never);
});

afterAll(async () => {
  const caseIds = await purgeResultCases(matchIds);
  await prisma.outbox.deleteMany({ where: { OR: [{ aggregateId: { in: matchIds } }, ...caseIds.map((id) => ({ aggregateId: { contains: id } }))] } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.$disconnect();
});

async function fixture(options: { closedAt?: Date; providerUserId?: string; status?: 'provider_review' | 'provisional' } = {}) {
  const organizerUserId = randomUUID();
  const opponentUserId = randomUUID();
  const match = await prisma.match.create({
    data: {
      bookingId: randomUUID(), organizerUserId, capacity: 2, feePerSlot: 50_000n, status: 'completed',
      cutoffAt: new Date(Date.now() - 60 * 60_000), providerUserId: options.providerUserId ?? null,
      joins: { create: { participantUserId: opponentUserId, status: 'confirmed', teamSide: 'B' } },
    },
  });
  matchIds.push(match.id);
  const resultCase = await prisma.matchResultCase.create({
    data: {
      matchId: match.id, status: options.status ?? 'declaration_open',
      declarationDeadlineAt: new Date(Date.now() + 12 * 60 * 60_000), closedAt: options.closedAt ?? null,
    },
  });
  return { match, resultCase, organizerUserId, opponentUserId };
}

const key = (ownerUserId: string, name = randomUUID()) => `match/results/${ownerUserId}/${name}.png`;
const item = (ownerUserId: string) => ({ objectKey: key(ownerUserId), mimeType: 'image/png', checksumSha256: CHECKSUM });
const verified = (ownerUserId: string): VerifiedResultEvidence => ({ ...item(ownerUserId), size: 1_000 });

async function commit(matchId: string, ownerUserId: string, evidence: VerifiedResultEvidence[]) {
  await prisma.$transaction((tx) => insertResultEvidence(tx, { matchId, ownerUserId, evidence }));
}

describe('Task 10 result evidence', () => {
  it('signs a checksum-bound private upload only for roster members and caps size at 5 MB', async () => {
    const { match, organizerUserId } = await fixture();
    const upload = await authorizeResultEvidenceUpload(storage, {
      matchId: match.id, userId: organizerUserId, mimeType: 'image/png', size: RESULT_EVIDENCE_MAX_BYTES, checksumSha256: CHECKSUM,
    });
    expect(upload.objectKey.startsWith(`match/results/${organizerUserId}/`)).toBe(true);
    expect(upload.headers['x-amz-checksum-sha256']).toBe(CHECKSUM);

    await expect(authorizeResultEvidenceUpload(storage, {
      matchId: match.id, userId: organizerUserId, mimeType: 'image/png', size: RESULT_EVIDENCE_MAX_BYTES + 1, checksumSha256: CHECKSUM,
    })).rejects.toMatchObject({ code: 'RESULT_EVIDENCE_TOO_LARGE' });
    await expect(authorizeResultEvidenceUpload(storage, {
      matchId: match.id, userId: randomUUID(), mimeType: 'image/png', size: 1_000, checksumSha256: CHECKSUM,
    })).rejects.toMatchObject({ code: 'RESULT_ROSTER_ONLY' });
  });

  it('rejects wrong namespace, another owner, oversize object and checksum mismatch at commit', async () => {
    const owner = randomUUID();
    await expect(inspectResultEvidence(storage, owner, [{ objectKey: `community/posts/${owner}/a.png`, mimeType: 'image/png' }]))
      .rejects.toMatchObject({ code: 'OBJECT_NOT_OWNED' });
    await expect(inspectResultEvidence(storage, owner, [item(randomUUID())]))
      .rejects.toMatchObject({ code: 'OBJECT_NOT_OWNED' });

    send.mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: RESULT_EVIDENCE_MAX_BYTES + 1, ChecksumSHA256: CHECKSUM } as never);
    await expect(inspectResultEvidence(storage, owner, [item(owner)])).rejects.toMatchObject({ code: 'OBJECT_TOO_LARGE' });

    send.mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 1_000, ChecksumSHA256: OTHER_CHECKSUM } as never);
    await expect(inspectResultEvidence(storage, owner, [item(owner)])).rejects.toMatchObject({ code: 'OBJECT_CHECKSUM_MISMATCH' });

    send.mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 1_000 } as never);
    await expect(inspectResultEvidence(storage, owner, [{ objectKey: key(owner), mimeType: 'image/png' }]))
      .rejects.toMatchObject({ code: 'OBJECT_CHECKSUM_REQUIRED' });

    await expect(inspectResultEvidence(storage, owner, [item(owner), item(owner), item(owner), item(owner)]))
      .rejects.toMatchObject({ code: 'RESULT_EVIDENCE_COUNT' });
    await expect(inspectResultEvidence(storage, owner, [item(owner)])).resolves.toEqual([
      expect.objectContaining({ size: 1_000, checksumSha256: CHECKSUM }),
    ]);
  });

  it('allows at most five images per user per case and keeps committed evidence immutable', async () => {
    const { match, organizerUserId, opponentUserId } = await fixture();
    await commit(match.id, organizerUserId, [verified(organizerUserId), verified(organizerUserId), verified(organizerUserId)]);
    await commit(match.id, organizerUserId, [verified(organizerUserId), verified(organizerUserId)]);
    await expect(commit(match.id, organizerUserId, [verified(organizerUserId)])).rejects.toMatchObject({ code: 'RESULT_EVIDENCE_LIMIT' });
    await expect(authorizeResultEvidenceUpload(storage, {
      matchId: match.id, userId: organizerUserId, mimeType: 'image/png', size: 1_000, checksumSha256: CHECKSUM,
    })).rejects.toMatchObject({ code: 'RESULT_EVIDENCE_LIMIT' });
    await commit(match.id, opponentUserId, [verified(opponentUserId)]);

    const stored = await prisma.resultEvidence.findFirstOrThrow({ where: { ownerUserId: organizerUserId, case: { matchId: match.id } } });
    await expect(prisma.resultEvidence.update({ where: { id: stored.id }, data: { objectKey: key(organizerUserId) } }))
      .rejects.toThrow(/RESULT_EVIDENCE_IMMUTABLE/);
    await expect(prisma.resultEvidence.update({ where: { id: stored.id }, data: { deletedAt: new Date(), size: 1 } }))
      .rejects.toThrow(/RESULT_EVIDENCE_IMMUTABLE/);
    await expect(prisma.resultEvidence.delete({ where: { id: stored.id } })).rejects.toThrow(/RESULT_EVIDENCE_IMMUTABLE/);
    const claim = await prisma.resultClaim.create({
      data: { caseId: stored.caseId, claimantUserId: organizerUserId, outcome: 'TEAM_A_WIN', setWinsA: 2, setWinsB: 0 },
    });
    await expect(prisma.resultClaim.delete({ where: { id: claim.id } })).rejects.toThrow(/RESULT_AUDIT_IMMUTABLE/);
    const positions = await prisma.resultEvidence.findMany({
      where: { ownerUserId: organizerUserId, case: { matchId: match.id } }, orderBy: { position: 'asc' }, select: { position: true },
    });
    expect(positions.map((row) => row.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it('lets the locked roster upload incident evidence before a result case exists', async () => {
    const { match, organizerUserId } = await fixture();
    await prisma.matchResultCase.delete({ where: { matchId: match.id } });
    await prisma.match.update({ where: { id: match.id }, data: { status: 'confirmed', endAt: new Date(Date.now() + 60 * 60_000) } });
    await expect(authorizeResultEvidenceUpload(storage, {
      matchId: match.id, userId: organizerUserId, mimeType: 'image/png', size: 1_000, checksumSha256: CHECKSUM,
    })).resolves.toHaveProperty('objectKey');
    await prisma.match.update({ where: { id: match.id }, data: { status: 'open' } });
    await expect(authorizeResultEvidenceUpload(storage, {
      matchId: match.id, userId: organizerUserId, mimeType: 'image/png', size: 1_000, checksumSha256: CHECKSUM,
    })).rejects.toMatchObject({ code: 'RESULT_CASE_NOT_OPEN' });
  });

  it('never attaches one object to two result cases', async () => {
    const first = await fixture();
    const second = await fixture();
    const owner = first.organizerUserId;
    await prisma.match.update({ where: { id: second.match.id }, data: { organizerUserId: owner } });
    const shared = verified(owner);
    await commit(first.match.id, owner, [shared]);
    await expect(commit(second.match.id, owner, [shared])).rejects.toMatchObject({ code: 'RESULT_EVIDENCE_DUPLICATE' });
  });

  it('rejects supplements once the case is closed', async () => {
    const { match, organizerUserId } = await fixture({ closedAt: new Date() });
    await expect(commit(match.id, organizerUserId, [verified(organizerUserId)])).rejects.toMatchObject({ code: 'RESULT_CASE_NOT_OPEN' });
  });

  it('returns a private signed read only to roster, reviewing provider or Admin', async () => {
    const providerUserId = randomUUID();
    const { match, organizerUserId, opponentUserId, resultCase } = await fixture({ providerUserId, status: 'provider_review' });
    await commit(match.id, organizerUserId, [verified(organizerUserId)]);
    const evidence = await prisma.resultEvidence.findFirstOrThrow({ where: { caseId: resultCase.id } });
    const read = (userId: string, roles = ['player']) => readResultEvidence(storage, {
      matchId: match.id, evidenceId: evidence.id, viewer: { userId, roles },
    });

    for (const viewer of [opponentUserId, providerUserId]) {
      const { url } = await read(viewer);
      expect(url).toContain('X-Amz-Signature=');
      expect(url).toContain(encodeURIComponent(evidence.objectKey).replace(/%2F/g, '/'));
    }
    await expect(read(randomUUID(), ['admin'])).resolves.toHaveProperty('url');
    await expect(read(randomUUID())).rejects.toMatchObject({ code: 'RESULT_EVIDENCE_FORBIDDEN' });
    await expect(readResultEvidence(storage, {
      matchId: randomUUID(), evidenceId: evidence.id, viewer: { userId: organizerUserId, roles: ['player'] },
    })).rejects.toMatchObject({ code: 'RESULT_EVIDENCE_NOT_FOUND' });

    await prisma.matchResultCase.update({ where: { id: resultCase.id }, data: { status: 'admin_review' } });
    await expect(read(providerUserId)).rejects.toMatchObject({ code: 'RESULT_EVIDENCE_FORBIDDEN' });
  });

  it('deletes binaries only 90 days after close and keeps metadata/checksum', async () => {
    const now = new Date();
    const old = await fixture({ closedAt: new Date(now.getTime() - 90 * 24 * 60 * 60_000) });
    const recent = await fixture({ closedAt: new Date(now.getTime() - 89 * 24 * 60 * 60_000) });
    const open = await fixture();
    for (const fx of [old, recent, open]) {
      await prisma.resultEvidence.create({
        data: { ...verified(fx.organizerUserId), caseId: fx.resultCase.id, ownerUserId: fx.organizerUserId, position: 0 },
      });
    }
    send.mockResolvedValue({} as never);

    await sweepResultEvidenceRetention(storage, now, 100, [old.match.id, recent.match.id, open.match.id]);

    const rows = await prisma.resultEvidence.findMany({
      where: { caseId: { in: [old.resultCase.id, recent.resultCase.id, open.resultCase.id] } },
      select: { caseId: true, deletedAt: true, checksumSha256: true, objectKey: true },
    });
    const byCase = new Map(rows.map((row) => [row.caseId, row]));
    expect(byCase.get(old.resultCase.id)).toMatchObject({ deletedAt: now, checksumSha256: CHECKSUM });
    expect(byCase.get(recent.resultCase.id)?.deletedAt).toBeNull();
    expect(byCase.get(open.resultCase.id)?.deletedAt).toBeNull();
    const deletedKeys = send.mock.calls.map(([command]) => (command.input as { Key: string }).Key);
    expect(deletedKeys).toContain(byCase.get(old.resultCase.id)!.objectKey);
    expect(deletedKeys).not.toContain(byCase.get(recent.resultCase.id)!.objectKey);

    const { url } = await readResultEvidence(storage, {
      matchId: open.match.id,
      evidenceId: (await prisma.resultEvidence.findFirstOrThrow({ where: { caseId: open.resultCase.id } })).id,
      viewer: { userId: open.organizerUserId, roles: ['player'] },
    });
    expect(url).toContain('X-Amz-Signature=');
    const expired = await prisma.resultEvidence.findFirstOrThrow({ where: { caseId: old.resultCase.id } });
    await expect(readResultEvidence(storage, {
      matchId: old.match.id, evidenceId: expired.id, viewer: { userId: old.organizerUserId, roles: ['player'] },
    })).rejects.toMatchObject({ code: 'RESULT_EVIDENCE_EXPIRED' });
  });
});
