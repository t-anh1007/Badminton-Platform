import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { createApp } from '../src/app.js';
import { registerProvider, approveProvider, rejectProvider } from '../src/domain/provider.js';
import { fakeUserId, signTestAccessToken } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

const app = createApp();

describe('VEN-01 — Đăng ký nhà cung cấp sân', () => {
  it('AC-VEN-01-1: người chơi đã xác minh, chưa có hồ sơ -> tạo PROVIDER pending', async () => {
    const userId = fakeUserId();
    const provider = await registerProvider(userId, { orgName: 'San cau long ABC' });
    expect(provider.status).toBe('pending');
    expect(provider.userId).toBe(userId);
  });

  it('AC-VEN-01-2: đã có hồ sơ pending -> từ chối, không tạo bản ghi thứ hai', async () => {
    const userId = fakeUserId();
    await registerProvider(userId, { orgName: 'A' });
    await expect(registerProvider(userId, { orgName: 'B' })).rejects.toMatchObject({
      code: 'PROVIDER_PROFILE_EXISTS',
    });
    const count = await prisma.provider.count({ where: { userId } });
    expect(count).toBe(1);
  });

  it('AC-VEN-01-3: hồ sơ rejected -> nộp lại, CHÍNH hồ sơ đó quay về pending, không tạo bản ghi mới', async () => {
    const userId = fakeUserId();
    const first = await registerProvider(userId, { orgName: 'Ten cu' });
    await rejectProvider(first.id, 'Thieu thong tin');

    const resubmitted = await registerProvider(userId, { orgName: 'Ten da sua' });
    expect(resubmitted.id).toBe(first.id);
    expect(resubmitted.status).toBe('pending');
    expect(resubmitted.orgName).toBe('Ten da sua');

    const count = await prisma.provider.count({ where: { userId } });
    expect(count).toBe(1);
  });

  it('AC-VEN-01-4: chưa xác minh email -> từ chối (bảo đảm cấu trúc qua requireAuth, xem account-service AC-ACC-03-2)', async () => {
    // venue-booking-service không tự kiểm tra được User.verified (cấm truy vấn
    // chéo schema — D17). Request KHÔNG có access token hợp lệ (như trường hợp
    // một tài khoản chưa xác minh, vốn không thể đăng nhập để lấy token —
    // account-service/test/session.test.ts AC-ACC-03-2 đã chứng minh) bị chặn
    // ở middleware, không tới được domain logic.
    const res = await request(app).post('/providers').send({ orgName: 'X' });
    expect(res.status).toBe(401);
  });
});

describe('VEN-02 — Xét duyệt nhà cung cấp sân (phần venue-booking-service)', () => {
  it('Admin xem được danh sách NCC pending, player bị từ chối', async () => {
    const provider = await registerProvider(fakeUserId(), { orgName: 'Chờ duyệt' });
    const admin = signTestAccessToken(fakeUserId(), ['admin']);
    const list = await request(app).get('/providers?status=pending').set('Authorization', `Bearer ${admin}`).expect(200);
    expect(list.body.some((row: { id: string }) => row.id === provider.id)).toBe(true);
    await request(app).get('/providers').set('Authorization', `Bearer ${signTestAccessToken(fakeUserId(), ['player'])}`).expect(403);
  });

  it('AC-VEN-02-2: Admin từ chối kèm lý do -> rejected, lý do hiển thị cho người nộp', async () => {
    const userId = fakeUserId();
    const provider = await registerProvider(userId, { orgName: 'A' });
    await rejectProvider(provider.id, 'Thong tin khong day du');
    const updated = await prisma.provider.findUniqueOrThrow({ where: { id: provider.id } });
    expect(updated.status).toBe('rejected');
    expect(updated.decisionReason).toBe('Thong tin khong day du');
  });

  it('AC-VEN-02-3: Admin từ chối mà bỏ trống lý do -> từ chối thao tác, trạng thái không đổi', async () => {
    const userId = fakeUserId();
    const provider = await registerProvider(userId, { orgName: 'A' });
    await expect(rejectProvider(provider.id, '')).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    const unchanged = await prisma.provider.findUniqueOrThrow({ where: { id: provider.id } });
    expect(unchanged.status).toBe('pending');
  });

  it('AC-VEN-02-5: user không có vai admin gọi API duyệt hồ sơ -> từ chối', async () => {
    const userId = fakeUserId();
    const provider = await registerProvider(userId, { orgName: 'A' });
    const nonAdminToken = signTestAccessToken(fakeUserId(), ['player']);

    const res = await request(app)
      .post(`/providers/${provider.id}/approve`)
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .send({});

    expect(res.status).toBe(403);
    const unchanged = await prisma.provider.findUniqueOrThrow({ where: { id: provider.id } });
    expect(unchanged.status).toBe('pending');
  });

  it('AC-VEN-02-1 (D25, G4-fix): duyệt hồ sơ -> phát ProviderApproved qua Outbox trong cùng transaction', async () => {
    // Đã gỡ block (PO chốt D25). Phần venue-booking-service: chuyển status +
    // ghi Outbox ProviderApproved. Phần cộng vai `provider` (account-service)
    // kiểm ở account-service/test/providerRole.test.ts; phần tạo ví business
    // (finance-service) kiểm end-to-end qua queue thật ở
    // finance-service/test/g4Saga.test.ts ("AC-VEN-02-1 (D25)...").
    const userId = fakeUserId();
    const provider = await registerProvider(userId, { orgName: 'Org 02-1' });

    await approveProvider(provider.id);

    const updated = await prisma.provider.findUniqueOrThrow({ where: { id: provider.id } });
    expect(updated.status).toBe('approved');
    const outbox = await prisma.outbox.findMany({ where: { aggregateId: provider.id, eventType: 'ProviderApproved' } });
    expect(outbox).toHaveLength(1);
    expect((outbox[0]!.payload as { userId: string }).userId).toBe(userId);
  });

  it('AC-VEN-02-4 (D25, G4-fix): NCC vừa duyệt, khi ĐẶT SÂN với vai người chơi thì trừ ví CÁ NHÂN, không phải ví kinh doanh', async () => {
    // Đã gỡ block. Bằng chứng thực thi nằm ở finance-service (ranh giới ADR
    // 0003): FIN-03 payBookingWithBalance CHỈ chạm ví `personal`, không có
    // đường đi hợp lệ tới ví `business` cho `payment` — kiểm ở
    // finance-service/test/g4Saga.test.ts "AC-FIN-03-3" (provider có ví
    // business 500k + ví personal 0đ -> trả booking bị từ chối vì ví business
    // không chi được, ví business KHÔNG bị đụng). Ở đây chỉ khẳng định trạng
    // thái NCC được duyệt để chuỗi đó có tiền đề.
    const userId = fakeUserId();
    const provider = await registerProvider(userId, { orgName: 'Org 02-4' });
    await approveProvider(provider.id);
    const updated = await prisma.provider.findUniqueOrThrow({ where: { id: provider.id } });
    expect(updated.status).toBe('approved');
  });

  it('(bổ sung) duyệt hồ sơ pending -> status chuyển approved (phần venue-booking-service tự làm được)', async () => {
    const userId = fakeUserId();
    const provider = await registerProvider(userId, { orgName: 'A' });
    await approveProvider(provider.id);
    const updated = await prisma.provider.findUniqueOrThrow({ where: { id: provider.id } });
    expect(updated.status).toBe('approved');
  });

  it('(bổ sung) duyệt hồ sơ không còn pending -> từ chối, không ghi đè', async () => {
    const userId = fakeUserId();
    const provider = await registerProvider(userId, { orgName: 'A' });
    await approveProvider(provider.id);
    await expect(approveProvider(provider.id)).rejects.toMatchObject({ code: 'NOT_PENDING' });
  });
});
