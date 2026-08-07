import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient as AccountPrismaClient, UserRole } from '../services/account-service/node_modules/@prisma/client/index.js';
import { PrismaClient as VenuePrismaClient } from '../services/venue-booking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as FinancePrismaClient } from '../services/finance-service/node_modules/@prisma/client/index.js';
import { recordBookingRevenue } from '../services/finance-service/src/domain/revenue.js';
import { releaseBookingRevenue } from '../services/finance-service/src/domain/revenueRelease.js';
import { refundCancelledBooking } from '../services/finance-service/src/domain/refund.js';
import { handlePaymentCompleted } from '../services/venue-booking-service/src/lib/eventConsumer.js';

const accountDb = new AccountPrismaClient();
const venueDb = new VenuePrismaClient();
const financeDb = new FinancePrismaClient();
const VENUE = 'http://127.0.0.1:3002';
const FINANCE = 'http://127.0.0.1:3003';
const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-real-env';
const POLICY = { tiers: [
  { minHoursBeforeStart: 24, refundPercent: 100 },
  { minHoursBeforeStart: 6, refundPercent: 50 },
  { minHoursBeforeStart: 0, refundPercent: 0 },
] };

const token = (userId: string, roles: string[] = ['player']) => jwt.sign({ sub: userId, roles, type: 'access' }, JWT_SECRET);
const auth = (value: string) => ({ Authorization: `Bearer ${value}`, 'Content-Type': 'application/json' });

async function setSession(page: Page, accessToken: string) {
  await page.addInitScript((value) => window.localStorage.setItem('accessToken', value), accessToken);
}

async function poll<T>(read: () => Promise<T | null>, timeoutMs = 12_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('E2E poll timed out');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function seedAccountIdentity(userId: string, roles: UserRole[] = [UserRole.player]) {
  await accountDb.user.create({
    data: {
      id: userId,
      email: `e2e-${userId}@example.test`,
      passwordHash: 'e2e-session-only',
      roles,
      verified: true,
      playerProfile: { create: { displayName: `E2E ${userId.slice(0, 8)}` } },
    },
  });
}

async function seedCourt(providerUserId: string, startAt: Date) {
  const provider = await venueDb.provider.create({ data: { userId: providerUserId, orgName: `E2E Provider ${randomUUID()}`, status: 'approved' } });
  const venue = await venueDb.venue.create({ data: { providerId: provider.id, name: `E2E Venue ${randomUUID()}`, lat: 10.7769, lng: 106.7009, address: 'TP.HCM' } });
  const court = await venueDb.court.create({ data: { venueId: venue.id, name: 'Sân E2E' } });
  const weekday = startAt.getDay();
  await venueDb.operatingHour.create({ data: { courtId: court.id, weekday, openMinute: 0, closeMinute: 1439 } });
  await venueDb.bookingRule.create({ data: { courtId: court.id, stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 120 } });
  await venueDb.pricingRule.create({ data: { courtId: court.id, weekday, startMinute: 0, endMinute: 1439, price: 200000n, effectiveFrom: new Date(Date.now() - 86_400_000) } });
  return { provider, venue, court };
}

async function seedConfirmedBooking(options: { startAt: Date; endAt: Date; playerId?: string; providerId?: string }) {
  const playerId = options.playerId ?? randomUUID();
  const providerId = options.providerId ?? randomUUID();
  await Promise.all([
    seedAccountIdentity(playerId),
    seedAccountIdentity(providerId, [UserRole.player, UserRole.provider]),
  ]);
  const { venue, court } = await seedCourt(providerId, options.startAt);
  const booking = await venueDb.booking.create({ data: {
    courtId: court.id, startAt: options.startAt, endAt: options.endAt, userId: playerId,
    source: 'marketplace', status: 'confirmed', priceSnapshot: 200000n, policySnapshot: POLICY,
  } });
  await financeDb.wallet.create({ data: { userId: playerId, walletType: 'personal', available: 0n } });
  await financeDb.paymentIntent.create({ data: { userId: playerId, amount: 200000n, method: 'sepay', refType: 'booking', refId: booking.id, status: 'completed' } });
  await recordBookingRevenue(randomUUID(), {
    bookingId: booking.id, businessUserId: providerId, venueId: venue.id, gross: '200000',
    endAt: options.endAt.toISOString(), source: 'marketplace',
  });
  return { booking, playerId, providerId, venue, court };
}

test.afterAll(async () => {
  await Promise.all([accountDb.$disconnect(), venueDb.$disconnect(), financeDb.$disconnect()]);
});

test('HT1 đăng ký → xác minh → đăng nhập → cập nhật hồ sơ', async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.test`;
  const password = 'Password123';
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).first().click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByLabel('Tên hiển thị').fill('Người chơi E2E');
  await page.locator('form').getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('status')).toContainText('Đã gửi mã xác minh');
  const user = await poll(() => accountDb.user.findUnique({ where: { email }, include: { verifications: true } }));
  await page.getByLabel('Mã xác minh').fill(user.verifications.at(-1)!.code);
  await page.locator('form').getByRole('button', { name: 'Xác minh email' }).click();
  await expect(page.getByRole('status')).toContainText('Xác minh thành công');
  await page.locator('form').getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('status')).toContainText('Đăng nhập thành công');
  await page.goto('/profile');
  await page.getByLabel('Tên hiển thị hồ sơ').fill('Hồ sơ đã cập nhật');
  await page.getByLabel('Số điện thoại hồ sơ').fill('0909000000');
  await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
  await expect(page.getByRole('status').first()).toContainText('Đã cập nhật hồ sơ');
});

test('HT2 đăng ký NCC → Admin duyệt → cấu hình sân/lịch/giá', async ({ page, request }) => {
  const userId = randomUUID();
  await seedAccountIdentity(userId);
  const registered = await request.post(`${VENUE}/providers`, { headers: auth(token(userId)), data: { orgName: 'NCC E2E' } });
  expect(registered.ok()).toBeTruthy();
  const provider = await registered.json();
  const adminId = randomUUID();
  await seedAccountIdentity(adminId, [UserRole.player, UserRole.admin]);
  const adminToken = token(adminId, ['player', 'admin']);
  expect((await request.post(`${VENUE}/providers/${provider.id}/approve`, { headers: auth(adminToken), data: {} })).ok()).toBeTruthy();
  const providerToken = token(userId, ['player', 'provider']);
  const venueResponse = await request.post(`${VENUE}/venues`, { headers: auth(providerToken), data: { name: 'Sân E2E API', lat: 10.77, lng: 106.7, address: 'TP.HCM' } });
  const venue = await venueResponse.json();
  const courtResponse = await request.post(`${VENUE}/venues/${venue.id}/courts`, { headers: auth(providerToken), data: { name: 'Sân 1' } });
  const court = await courtResponse.json();
  expect((await request.post(`${VENUE}/courts/${court.id}/operating-hours`, { headers: auth(providerToken), data: { weekday: 1, openMinute: 360, closeMinute: 1320 } })).ok()).toBeTruthy();
  expect((await request.post(`${VENUE}/courts/${court.id}/pricing`, { headers: auth(providerToken), data: { rules: [{ weekday: 1, startMinute: 360, endMinute: 1320, price: 200000 }], effectiveFrom: new Date().toISOString() } })).ok()).toBeTruthy();
  await setSession(page, adminToken);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Quản trị' })).toBeVisible();
  expect((await venueDb.provider.findUniqueOrThrow({ where: { id: provider.id } })).status).toBe('approved');
});

test('HT3 tìm sân → giữ slot → thanh toán → confirmed', async ({ page }) => {
  const playerId = randomUUID();
  await seedAccountIdentity(playerId);
  const accessToken = token(playerId);
  const startAt = new Date(Date.now() + 48 * 3_600_000);
  startAt.setMinutes(0, 0, 0);
  const { venue, court } = await seedCourt(randomUUID(), startAt);
  const wallet = await financeDb.wallet.create({ data: { userId: playerId, walletType: 'personal', available: 300000n } });
  await financeDb.ledgerEntry.create({ data: { walletId: wallet.id, amount: 300000n, type: 'topup', refType: 'topup', refId: randomUUID(), before: 0n, after: 300000n } });
  await setSession(page, accessToken);
  await page.goto('/booking');
  await page.getByLabel('Vĩ độ tìm sân').fill('10.7769');
  await page.getByLabel('Kinh độ tìm sân').fill('106.7009');
  await page.getByRole('button', { name: 'Tìm sân', exact: true }).click();
  await expect(page.getByText(venue.name)).toBeVisible();
  await page.getByRole('article').filter({ hasText: venue.name }).getByRole('button', { name: 'Xem lịch sân' }).click();
  await page.getByRole('button', { name: /^Chọn / }).first().click();
  await page.getByRole('button', { name: 'Giữ chỗ' }).click();
  await page.getByRole('button', { name: 'Tạo booking' }).click();
  await page.getByRole('button', { name: 'Thanh toán số dư' }).click();
  const booking = await poll(async () => {
    const found = await venueDb.booking.findFirst({ where: { userId: playerId, courtId: court.id } });
    return found?.status === 'confirmed' ? found : null;
  });
  expect(booking.status).toBe('confirmed');
});

test('HT4 người chơi tự hủy và nhận hoàn theo bậc', async ({ page }) => {
  const startAt = new Date(Date.now() + 30 * 3_600_000);
  const seeded = await seedConfirmedBooking({ startAt, endAt: new Date(startAt.getTime() + 3_600_000) });
  await setSession(page, token(seeded.playerId));
  await page.goto('/booking');
  await page.getByRole('button', { name: 'Xem mức hoàn' }).click();
  await expect(page.getByText(/Bạn sẽ được hoàn 100%/)).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận hủy' }).click();
  await expect(page.getByRole('status')).toContainText('hoàn 100%');
  const cancellation = await poll(() => venueDb.outbox.findFirst({ where: { aggregateId: seeded.booking.id, eventType: 'BookingCancelled' } }));
  await refundCancelledBooking(randomUUID(), cancellation.payload);
  await poll(() => financeDb.ledgerEntry.findFirst({ where: { refType: 'booking', refId: seeded.booking.id, type: 'refund', amount: 200000n } }));
});

test('HT5 phía sân hủy và hoàn 100%', async ({ page }) => {
  const startAt = new Date(Date.now() + 2 * 3_600_000);
  const seeded = await seedConfirmedBooking({ startAt, endAt: new Date(startAt.getTime() + 3_600_000) });
  await setSession(page, token(seeded.providerId, ['player', 'provider']));
  await page.goto('/booking');
  const incident = page.getByRole('heading', { name: 'Quản lý sự cố phía sân' }).locator('..');
  await incident.getByPlaceholder('Mã booking').fill(seeded.booking.id);
  await incident.getByPlaceholder('Lý do hủy bắt buộc').fill('Sân mất điện');
  await incident.getByRole('button', { name: 'Hủy và hoàn 100%' }).click();
  await expect(page.getByRole('status')).toContainText('hoàn 100%');
  const cancellation = await poll(() => venueDb.outbox.findFirst({ where: { aggregateId: seeded.booking.id, eventType: 'BookingCancelled' } }));
  await refundCancelledBooking(randomUUID(), cancellation.payload);
  await poll(() => financeDb.ledgerEntry.findFirst({ where: { refType: 'booking', refId: seeded.booking.id, type: 'refund', amount: 200000n } }));
});

test('HT6 doanh thu pending → available → tạo yêu cầu rút', async ({ page }) => {
  const endAt = new Date(Date.now() - 25 * 3_600_000);
  const seeded = await seedConfirmedBooking({ startAt: new Date(endAt.getTime() - 3_600_000), endAt });
  await setSession(page, token(seeded.providerId, ['player', 'provider']));
  await page.goto('/profile');
  const finance = page.getByRole('heading', { name: 'Doanh thu và rút tiền' }).locator('..');
  await expect(finance.getByText('180.000đ').first()).toBeVisible();
  await releaseBookingRevenue(seeded.booking.id, new Date());
  await page.reload();
  await expect(finance.getByText('180.000đ').first()).toBeVisible();
  await page.getByLabel('Số tiền rút').fill('100000');
  await page.getByLabel('Ngân hàng').fill('VCB');
  await page.getByLabel('Số tài khoản').fill('0123456789');
  await page.getByLabel('Tên tài khoản').fill('E2E PROVIDER');
  await page.getByRole('button', { name: 'Tạo yêu cầu rút' }).click();
  await expect(page.getByRole('status').last()).toContainText('Đã tạo yêu cầu');
});

test('HT7 tranh chấp trong 24 giờ → Admin hoàn một phần', async ({ browser }) => {
  const endAt = new Date(Date.now() - 5 * 3_600_000);
  const seeded = await seedConfirmedBooking({ startAt: new Date(endAt.getTime() - 3_600_000), endAt });
  const playerContext = await browser.newContext();
  await playerContext.addInitScript((value) => window.localStorage.setItem('accessToken', value), token(seeded.playerId));
  const player = await playerContext.newPage();
  await player.goto('http://127.0.0.1:5173/profile');
  await player.getByLabel('Lý do tranh chấp').fill('Dịch vụ không đúng cam kết');
  await player.getByLabel('Bằng chứng').fill('https://example.test/proof.jpg');
  await player.getByRole('button', { name: 'Gửi tranh chấp' }).click();
  await expect(player.getByRole('status').last()).toContainText('Đã gửi tranh chấp');
  const dispute = await poll(() => financeDb.dispute.findUnique({ where: { bookingId: seeded.booking.id } }));

  const adminContext = await browser.newContext();
  const adminId = randomUUID();
  await seedAccountIdentity(adminId, [UserRole.player, UserRole.admin]);
  await adminContext.addInitScript((value) => window.localStorage.setItem('accessToken', value), token(adminId, ['player', 'admin']));
  const admin = await adminContext.newPage();
  await admin.goto('http://127.0.0.1:5173/admin');
  await admin.getByRole('button', { name: 'Tranh chấp' }).click();
  await admin.getByLabel(`Số tiền hoàn một phần ${seeded.booking.id}`).fill('80000');
  await admin.getByLabel(`Lý do quyết định ${seeded.booking.id}`).fill('Hoàn theo bằng chứng');
  const card = admin.getByText(seeded.booking.id).locator('..');
  await card.getByRole('button', { name: 'Hoàn một phần' }).click();
  await expect(admin.getByRole('status')).toContainText('Đã giải quyết');
  expect((await financeDb.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).resolutionAmount).toBe(80000n);
  await Promise.all([playerContext.close(), adminContext.close()]);
});

test('HT8 Admin đối soát giao dịch tiền vào chưa khớp', async ({ page, request }) => {
  const externalRef = randomUUID();
  const rawRef = `E2E-UNMATCHED-${randomUUID()}`;
  expect((await request.post(`${FINANCE}/webhooks/sepay`, {
    headers: { 'x-sepay-signature': process.env.SEPAY_WEBHOOK_SECRET ?? 'dev-sepay-secret-change-me' },
    data: { externalRef, amount: '200000', rawRef, direction: 'in' },
  })).ok()).toBeTruthy();
  const userId = randomUUID();
  await financeDb.wallet.create({ data: { userId, walletType: 'personal', available: 0n } });
  const adminId = randomUUID();
  await seedAccountIdentity(adminId, [UserRole.player, UserRole.admin]);
  await setSession(page, token(adminId, ['player', 'admin']));
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Đối soát' }).click();
  await page.getByLabel('Đối tượng gán').fill(userId);
  await page.getByLabel('Lý do đối soát').fill('Đã xác minh chủ khoản tiền');
  const eventCard = page.getByText(new RegExp(rawRef)).locator('..');
  await eventCard.getByRole('button', { name: 'Gán ví cá nhân' }).click();
  await expect(page.getByRole('status')).toContainText('Đã xử lý');
  expect((await financeDb.sepayEvent.findUniqueOrThrow({ where: { externalRef } })).status).toBe('matched_manual');
});
