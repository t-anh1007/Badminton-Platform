import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { S3Client } from '@aws-sdk/client-s3';
import { S3ObjectStorageClient } from '@khoaluantn/object-storage';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { adminPayoutView, cancelExpiredClaims, handleRewardAwardsFinalized, submitPayoutInformation } from '../src/domain/rewardPayout.js';

const CHECKSUM = Buffer.alloc(32, 4).toString('base64');
const s3 = new S3Client({ endpoint: 'http://127.0.0.1:9', region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: 't', secretAccessKey: 't' } });
const send = vi.spyOn(s3, 'send');
const privateStorage = new S3ObjectStorageClient({ bucket: 'private-test', s3, privateBucket: true });
const app = createApp({ privateStorage });
const programIds: string[] = [];
const eventIds: string[] = [];
const auth = (userId: string, role: string) => `Bearer ${jwt.sign({ sub: userId, roles: [role], type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env')}`;
const adminId = randomUUID();
const admin = auth(adminId, 'admin');
const information = {
  recipientName: 'Nguyễn Văn A', email: 'a@example.com', phone: '0912345678', address: '1 Lê Lợi, Quận 1',
  bankCode: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'NGUYEN VAN A',
};

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ ContentType: 'image/png', ContentLength: 3_000, ChecksumSHA256: CHECKSUM } as never);
});

afterAll(async () => {
  const payouts = await prisma.rewardPayout.findMany({ where: { programId: { in: programIds } }, select: { id: true } });
  await prisma.outbox.deleteMany({ where: { OR: payouts.map((payout) => ({ aggregateId: { contains: payout.id } })) } });
  await prisma.rewardPayout.deleteMany({ where: { programId: { in: programIds } } });
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.$disconnect();
});

async function finalized(winners: string[], claimDeadlineAt = new Date(Date.now() + 7 * 24 * 60 * 60_000)) {
  const programId = randomUUID();
  programIds.push(programId);
  const eventId = `RewardAwardsFinalized:${randomUUID()}`;
  eventIds.push(eventId);
  const payload = {
    programId, programName: 'Vua đơn tháng 3',
    awards: winners.map((userId, index) => ({ awardId: randomUUID(), userId, rank: index + 1, amount: String(100_000 - index * 10_000), claimDeadlineAt: claimDeadlineAt.toISOString() })),
  };
  await handleRewardAwardsFinalized(eventId, payload);
  return { programId, eventId, payload };
}

const payoutOf = (userId: string, programId: string) => prisma.rewardPayout.findFirstOrThrow({ where: { userId, programId } });

describe('Task 21 reward payouts', () => {
  it('creates one payout per award idempotently and never touches wallets or ledger', async () => {
    const winner = randomUUID();
    const { programId, eventId, payload } = await finalized([winner]);
    await handleRewardAwardsFinalized(eventId, payload);
    const replayId = `RewardAwardsFinalized:${randomUUID()}`;
    eventIds.push(replayId);
    await handleRewardAwardsFinalized(replayId, payload);
    expect(await prisma.rewardPayout.count({ where: { programId } })).toBe(1);
    expect(await payoutOf(winner, programId)).toMatchObject({ status: 'awaiting_information', amount: 100_000n, rank: 1 });
    expect(await prisma.wallet.count({ where: { userId: winner } })).toBe(0);
  });

  it('lets only the owner read and submit exactly the seven information fields', async () => {
    const [winner, other] = [randomUUID(), randomUUID()];
    const { programId } = await finalized([winner]);
    const payout = await payoutOf(winner, programId);
    const list = await request(app).get('/rewards/players/me/payouts').set('Authorization', auth(winner, 'player')).expect(200);
    expect(list.body.items[0]).toMatchObject({
      id: payout.id, programName: 'Vua đơn tháng 3', achievementLabel: 'Hạng 1', amount: '100000', status: 'awaiting_information', informationComplete: false,
    });
    expect(list.body.items[0]).toHaveProperty('serverNow');
    await request(app).get(`/rewards/players/me/payouts/${payout.id}`).set('Authorization', auth(other, 'player')).expect(404);
    const put = (body: Record<string, unknown>, who = winner) => request(app).put(`/rewards/players/me/payouts/${payout.id}/information`)
      .set('Authorization', auth(who, 'player')).send(body);
    await put({ ...information, birthDate: '2000-01-01' }).expect(400);
    await put({ ...information, bankAccountName: undefined }).expect(400);
    await put(information, other).expect(404);
    const submitted = await put(information).expect(200);
    expect(submitted.body.payout).toMatchObject({ status: 'ready_to_pay', informationComplete: true });
    expect(new Date(submitted.body.payout.payoutDeadlineAt).getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60_000);
    await request(app).get('/rewards/admin/payouts').set('Authorization', auth(winner, 'player')).expect(403);
    // Danh sách Admin không trả người nhận/ngân hàng/chứng từ; chỉ trang chi tiết mới có.
    const adminList = await request(app).get(`/rewards/admin/payouts?programId=${programId}`).set('Authorization', admin).expect(200);
    const row = adminList.body.items.find((item: { id: string }) => item.id === payout.id);
    expect(row).toMatchObject({ id: payout.id, status: 'ready_to_pay', informationComplete: true, overdue: false });
    for (const key of ['receiver', 'proof', 'paidByUserId', 'userId']) expect(row).not.toHaveProperty(key);
    expect(JSON.stringify(adminList.body)).not.toContain(information.bankAccountNumber);
    const adminDetail = await request(app).get(`/rewards/admin/payouts/${payout.id}`).set('Authorization', admin).expect(200);
    expect(adminDetail.body.payout.receiver).toMatchObject({ bankAccountNumber: information.bankAccountNumber });
  });

  it('accepts information until one millisecond before the deadline and cancels only unclaimed awards at the deadline', async () => {
    const deadline = new Date('2031-01-08T00:00:00.000Z');
    const [late, onTime, ready] = [randomUUID(), randomUUID(), randomUUID()];
    const { programId } = await finalized([late, onTime, ready], deadline);
    await submitPayoutInformation(onTime, (await payoutOf(onTime, programId)).id, information, new Date(deadline.getTime() - 1));
    await expect(submitPayoutInformation(late, (await payoutOf(late, programId)).id, information, deadline))
      .rejects.toMatchObject({ code: 'REWARD_CLAIM_EXPIRED' });
    await submitPayoutInformation(ready, (await payoutOf(ready, programId)).id, information, new Date('2031-01-01T00:00:00.000Z'));
    const ids = (await prisma.rewardPayout.findMany({ where: { programId }, select: { id: true } })).map((row) => row.id);
    await cancelExpiredClaims(new Date(deadline.getTime() - 1), ids);
    expect((await payoutOf(late, programId)).status).toBe('awaiting_information');
    // Payout deadline của khoản ready_to_pay đã qua nhưng không bao giờ tự hủy; không chuyển giải xuống hạng sau.
    await cancelExpiredClaims(new Date('2031-02-01T00:00:00.000Z'), ids);
    expect((await prisma.rewardPayout.findMany({ where: { programId }, orderBy: { rank: 'asc' } })).map((row) => row.status))
      .toEqual(['cancelled', 'ready_to_pay', 'ready_to_pay']);
    expect(await prisma.rewardPayout.count({ where: { programId } })).toBe(3);
    const detail = await request(app).get(`/rewards/admin/payouts/${(await payoutOf(ready, programId)).id}`).set('Authorization', admin).expect(200);
    expect(detail.body.payout).toMatchObject({ receiver: information });
    expect(adminPayoutView(await payoutOf(ready, programId), new Date('2031-02-01T00:00:00.000Z')).overdue).toBe(true);
  });

  it('marks paid only with a committed checksum proof and a unique transaction reference, then stays immutable', async () => {
    const [first, second] = [randomUUID(), randomUUID()];
    const { programId } = await finalized([first, second]);
    for (const userId of [first, second]) await submitPayoutInformation(userId, (await payoutOf(userId, programId)).id, information);
    const upload = await request(app).post('/rewards/admin/uploads').set('Authorization', admin)
      .send({ mimeType: 'image/png', size: 3_000, checksumSha256: CHECKSUM }).expect(201);
    expect(upload.body.upload.objectKey.startsWith(`finance/rewards/${adminId}/`)).toBe(true);
    await request(app).post('/rewards/admin/uploads').set('Authorization', admin)
      .send({ mimeType: 'image/png', size: 5 * 1024 * 1024 + 1, checksumSha256: CHECKSUM }).expect(400);

    const firstId = (await payoutOf(first, programId)).id;
    const markPaid = (id: string, body: Record<string, unknown>) => request(app).post(`/rewards/admin/payouts/${id}/mark-paid`).set('Authorization', admin).send(body);
    const reference = `FT${Date.now()}`;
    await markPaid(firstId, { transactionReference: reference, proofObjectKey: upload.body.upload.objectKey }).expect(400);
    expect((await markPaid(firstId, { transactionReference: reference, proofObjectKey: `finance/rewards/${randomUUID()}/x.png`, confirm: true })).body.error.code)
      .toBe('OBJECT_NOT_OWNED');
    send.mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 3_000 } as never);
    expect((await markPaid(firstId, { transactionReference: reference, proofObjectKey: upload.body.upload.objectKey, confirm: true })).body.error.code)
      .toBe('OBJECT_CHECKSUM_REQUIRED');
    const paid = await markPaid(firstId, { transactionReference: reference, proofObjectKey: upload.body.upload.objectKey, confirm: true }).expect(200);
    expect(paid.body.payout).toMatchObject({ status: 'paid', transactionReference: reference, proof: { checksumSha256: CHECKSUM, size: 3_000 } });
    expect((await markPaid(firstId, { transactionReference: `${reference}-2`, proofObjectKey: upload.body.upload.objectKey, confirm: true })).body.error.code)
      .toBe('REWARD_PAYOUT_NOT_PAYABLE');
    expect((await markPaid((await payoutOf(second, programId)).id, { transactionReference: reference, proofObjectKey: upload.body.upload.objectKey, confirm: true })).body.error.code)
      .toBe('REWARD_TRANSACTION_REFERENCE_USED');

    const own = await request(app).get(`/rewards/players/me/payouts/${firstId}`).set('Authorization', auth(first, 'player')).expect(200);
    expect(own.body.payout.proofUrl).toContain('X-Amz-Signature=');
    const list = await request(app).get(`/rewards/admin/payouts?programId=${programId}&status=paid&page=1&pageSize=5`).set('Authorization', admin).expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 5 });
    expect(await prisma.ledgerEntry.count({ where: { refId: firstId } })).toBe(0);
  });
});
