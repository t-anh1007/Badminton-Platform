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

  it.skip('AC-VEN-02-1: duyệt hồ sơ -> cộng vai provider (account-service) + tạo ví business (finance-service) [BLOCKED: chờ PO xác nhận phạm vi cross-service — xem docs/product/phase-1-progress.md §3 G2]', () => {
    // Phần venue-only (status pending -> approved) ĐÃ kiểm ở test/eventProducer
    // note dưới. Phần cộng role + tạo ví cần event mới "ProviderApproved"
    // (chưa có trong system-architecture.md §6.3) + sửa account-service ngoài
    // scope boundary G2 đã ghi ở phase-1-handoff.md — đã hỏi Codex, đang chờ
    // PO xác nhận trước khi thêm.
  });

  it.skip('AC-VEN-02-4: NCC vừa duyệt đặt sân người khác -> trừ ví CÁ NHÂN không phải ví kinh doanh [BLOCKED: cần G3 (booking flow) + G4 (finance payment logic)]', () => {});

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
