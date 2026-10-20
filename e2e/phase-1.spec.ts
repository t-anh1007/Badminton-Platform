import { test, expect, type Page } from '@playwright/test';
import { createHmac, randomUUID } from 'node:crypto';
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

// Phiên FE lưu ở 'courtin.session'; loadSession() dựng lại từ accessToken/refreshToken/roles.
async function setSession(page: Page, accessToken: string) {
  const roles = (jwt.decode(accessToken) as { roles?: string[] } | null)?.roles ?? ['player'];
  const activeRole = roles.includes('provider') ? 'provider' : roles.includes('admin') ? 'admin' : 'player';
  await page.unroute('**/auth/refresh');
  await page.route('**/auth/refresh', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ accessToken, refreshToken: 'e2e-refresh-token', roles }),
  }));
  await page.addInitScript(({ tokenValue, userRoles, role }) => {
    localStorage.removeItem('courtin.session');
    localStorage.setItem('accessToken', tokenValue);
    localStorage.setItem('refreshToken', 'e2e-refresh-token');
    localStorage.setItem('roles', JSON.stringify(userRoles));
    localStorage.setItem('courtin.activeRole', role);
  }, { tokenValue: accessToken, userRoles: roles, role: activeRole });
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
  const venue = await venueDb.venue.create({ data: { providerId: provider.id, name: `E2E Venue ${randomUUID()}`, lat: 10.7769, lng: 106.7009, address: 'TP.HCM', provinceCode: 'ho-chi-minh' } });
  const court = await venueDb.court.create({ data: { venueId: venue.id, name: 'Sân E2E' } });
  // Mở cửa và có giá cả 7 ngày để không phụ thuộc múi giờ của máy chạy.
  const weekdays = Array.from({ length: 7 }, (_, weekday) => weekday);
  await venueDb.operatingHour.createMany({ data: weekdays.map((weekday) => ({ courtId: court.id, weekday, openMinute: 0, closeMinute: 1439 })) });
  await venueDb.bookingRule.create({ data: { courtId: court.id, stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 120 } });
  await venueDb.pricingRule.createMany({ data: weekdays.map((weekday) => ({ courtId: court.id, weekday, startMinute: 0, endMinute: 1439, price: 200000n, effectiveFrom: new Date(Date.now() - 86_400_000) })) });
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
  await page.getByRole('tab', { name: 'Đăng ký', exact: true }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Tên hiển thị').fill('Người chơi E2E');
  await page.locator('form').getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('status')).toContainText('Đã gửi mã xác minh');
  const user = await poll(() => accountDb.user.findUnique({ where: { email }, include: { verifications: true } }));
  await page.getByLabel('Mã xác minh').pressSequentially(user.verifications.at(-1)!.code);
  await page.locator('form').getByRole('button', { name: 'Xác minh email' }).click();
  await expect(page.getByRole('status')).toContainText('Xác minh thành công');
  await page.locator('form').getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL(/\/profile$/);
  await page.getByRole('button', { name: 'Cập nhật thông tin' }).click();
  await page.getByLabel('Tên hiển thị').fill('Hồ sơ đã cập nhật');
  await page.getByLabel('Số điện thoại').fill('0909000000');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByRole('status').first()).toContainText('Đã cập nhật hồ sơ');
});

test('HT2 đăng ký NCC → Admin duyệt → cấu hình sân/lịch/giá', async ({ page, request }) => {
  const userId = randomUUID();
  await seedAccountIdentity(userId);
  const registered = await request.post(`${VENUE}/providers`, {
    headers: auth(token(userId)),
    data: { orgName: `NCC E2E ${randomUUID()}` },
  });
  expect(registered.ok()).toBeTruthy();
  const provider = await registered.json();
  const adminId = randomUUID();
  await seedAccountIdentity(adminId, [UserRole.player, UserRole.admin]);
  const adminToken = token(adminId, ['player', 'admin']);
  await setSession(page, token(userId));
  await page.goto('/admin');
  await expect(page.getByText('Bạn chưa có quyền truy cập')).toBeVisible();
  await setSession(page, adminToken);
  await page.goto('/admin/providers');
  await expect(page.getByRole('heading', { name: 'Duyệt chủ sân' })).toBeVisible();
  await page.getByRole('button', { name: `Xem hồ sơ ${provider.orgName}` }).click();
  await page.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`Đã duyệt ${provider.orgName}`);
  await poll(async () => {
    const current = await venueDb.provider.findUnique({ where: { id: provider.id } });
    return current?.status === 'approved' ? current : null;
  });
  const providerToken = token(userId, ['player', 'provider']);
  const venueResponse = await request.post(`${VENUE}/venues`, { headers: auth(providerToken), data: { name: 'Sân E2E API', lat: 10.77, lng: 106.7, address: 'TP.HCM', provinceCode: 'ho-chi-minh' } });
  const venue = await venueResponse.json();
  expect(venueResponse.ok(), JSON.stringify(venue)).toBeTruthy();
  const courtResponse = await request.post(`${VENUE}/venues/${venue.id}/courts`, { headers: auth(providerToken), data: { name: 'Sân 1', images: [{ objectKey: `e2e/courts/${randomUUID()}.jpg` }] } });
  const court = await courtResponse.json();
  expect(courtResponse.ok(), JSON.stringify(court)).toBeTruthy();
  const hours = await request.post(`${VENUE}/courts/${court.id}/operating-hours`, { headers: auth(providerToken), data: { weekday: 1, openMinute: 360, closeMinute: 1320 } });
  expect(hours.ok(), await hours.text()).toBeTruthy();
  const pricing = await request.post(`${VENUE}/courts/${court.id}/pricing`, { headers: auth(providerToken), data: { rules: [{ weekday: 1, startMinute: 360, endMinute: 1320, price: 200000 }], effectiveFrom: new Date().toISOString() } });
  expect(pricing.ok(), await pricing.text()).toBeTruthy();
  expect((await venueDb.provider.findUniqueOrThrow({ where: { id: provider.id } })).status).toBe('approved');
});

test('HT3 tìm sân → giữ slot → thanh toán → confirmed', async ({ page }) => {
  const playerId = randomUUID();
  await seedAccountIdentity(playerId);
  const accessToken = token(playerId);
  const startAt = new Date(Date.now() + 48 * 3_600_000);
  startAt.setMinutes(0, 0, 0);
  const { venue, court } = await seedCourt(randomUUID(), startAt);
  const wallet = await financeDb.wallet.create({ data: { userId: playerId, walletType: 'personal', available: 1000000n } });
  await financeDb.ledgerEntry.create({ data: { walletId: wallet.id, amount: 1000000n, type: 'topup', refType: 'topup', refId: randomUUID(), before: 0n, after: 1000000n } });
  await setSession(page, accessToken);
  await page.goto(`/booking?venueId=${venue.id}`);
  await expect(page.getByRole('heading', { name: venue.name })).toBeVisible();
  // Ngày theo giờ Việt Nam; tối thiểu 60 phút = 2 khung 30 phút liền nhau.
  await page.getByLabel('Chọn ngày từ lịch').fill(new Date(startAt.getTime() + 7 * 3_600_000).toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Chọn 00:00 - 00:30' }).click();
  await page.getByRole('button', { name: 'Chọn 00:30 - 01:00' }).click();
  await page.getByRole('button', { name: 'XÁC NHẬN' }).click();
  await page.getByRole('button', { name: 'Thanh toán số dư' }).click();
  await page.waitForURL(/\/booking\/confirmation$/);
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
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Xem mức hoàn' }).click();
  await expect(page.getByText(/Bạn sẽ được hoàn 100%/)).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận hủy' }).click();
  await page.getByRole('button', { name: 'Đã hủy' }).click();
  const cancelledCard = page.getByRole('article').filter({ hasText: seeded.venue.name });
  // Danh sách có thể làm mới ngay sau khi hủy (thẻ render lại, đóng chi tiết) nên mở lại tới khi thấy.
  await expect(async () => {
    const toggle = cancelledCard.getByRole('button', { name: /chi tiết lượt đặt sân/ });
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await expect(cancelledCard.getByText('Bạn được hoàn 100% số tiền đã thanh toán')).toBeVisible({ timeout: 2_000 });
  }).toPass();
  const cancellation = await poll(() => venueDb.outbox.findFirst({ where: { aggregateId: seeded.booking.id, eventType: 'BookingCancelled' } }));
  await refundCancelledBooking(randomUUID(), cancellation.payload);
  await poll(() => financeDb.ledgerEntry.findFirst({ where: { refType: 'booking', refId: seeded.booking.id, type: 'refund', amount: 200000n } }));
});

test('HT5 phía sân hủy và hoàn 100%', async ({ page }) => {
  const startAt = new Date(Date.now() + 2 * 3_600_000);
  const seeded = await seedConfirmedBooking({ startAt, endAt: new Date(startAt.getTime() + 3_600_000) });
  await setSession(page, token(seeded.providerId, ['player', 'provider']));
  await page.goto(`/manage/bookings?booking=${seeded.booking.id}`);
  const drawer = page.getByRole('dialog', { name: 'Chi tiết lượt đặt sân' });
  await drawer.getByRole('button', { name: 'Hủy do lỗi sân' }).click();
  await drawer.getByLabel('Lý do lỗi phía sân').fill('Sân mất điện');
  await drawer.getByRole('button', { name: 'Xác nhận hủy lượt đặt sân' }).click();
  const cancellation = await poll(() => venueDb.outbox.findFirst({ where: { aggregateId: seeded.booking.id, eventType: 'BookingCancelled' } }));
  await refundCancelledBooking(randomUUID(), cancellation.payload);
  await poll(() => financeDb.ledgerEntry.findFirst({ where: { refType: 'booking', refId: seeded.booking.id, type: 'refund', amount: 200000n } }));
});

test('HT6 doanh thu pending → available → tạo yêu cầu rút', async ({ page }) => {
  const endAt = new Date(Date.now() - 25 * 3_600_000);
  const seeded = await seedConfirmedBooking({ startAt: new Date(endAt.getTime() - 3_600_000), endAt });
  await setSession(page, token(seeded.providerId, ['player', 'provider']));
  await page.goto('/manage');
  await expect(page.getByText(/^Chờ đủ 24 giờ: /).first()).toContainText(/180[.,]000/);
  await releaseBookingRevenue(seeded.booking.id, new Date());
  await page.reload();
  await expect(page.getByText('Số dư có thể rút').locator('..')).toContainText(/180[.,]000/);
  await page.getByRole('button', { name: 'Tạo yêu cầu rút tiền' }).click();
  await page.getByLabel('Số tiền rút').fill('100000');
  await page.getByLabel('Mã ngân hàng').fill('VCB');
  await page.getByLabel('Số tài khoản nhận').fill('0123456789');
  await page.getByLabel('Tên chủ tài khoản').fill('E2E PROVIDER');
  await page.getByRole('button', { name: 'Xác nhận yêu cầu rút' }).click();
  await expect(page.getByRole('status')).toContainText('Đã tạo yêu cầu rút');
});

test('HT7 tranh chấp trong 24 giờ → Admin hoàn một phần', async ({ browser }) => {
  const endAt = new Date(Date.now() - 5 * 3_600_000);
  const seeded = await seedConfirmedBooking({ startAt: new Date(endAt.getTime() - 3_600_000), endAt });
  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  await setSession(player, token(seeded.playerId));
  await player.goto('/profile?tab=disputes');
  await player.getByRole('article').filter({ hasText: seeded.booking.businessCode })
    .getByRole('button', { name: 'Báo vấn đề' }).click();
  await player.getByRole('radio', { name: 'Dịch vụ không đúng mô tả' }).check();
  await player.getByLabel('Mô tả vấn đề').fill('Dịch vụ không đúng cam kết');
  await player.getByLabel('Số điện thoại liên hệ').fill('0909000000');
  await player.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(player.getByRole('status').last()).toContainText('Đã gửi yêu cầu');
  const dispute = await poll(() => financeDb.dispute.findUnique({ where: { bookingId: seeded.booking.id } }));

  const adminContext = await browser.newContext();
  const adminId = randomUUID();
  await seedAccountIdentity(adminId, [UserRole.player, UserRole.admin]);
  const admin = await adminContext.newPage();
  await setSession(admin, token(adminId, ['player', 'admin']));
  await admin.goto(`/admin/disputes?dispute=${dispute.id}`);
  await admin.getByRole('radio', { name: 'Hoàn một phần' }).click();
  await admin.getByLabel('Số tiền hoàn một phần cho tranh chấp').fill('80000');
  await admin.getByLabel('Lý do quyết định tranh chấp').fill('Hoàn theo bằng chứng');
  await admin.getByRole('button', { name: 'Xem lại & xác nhận' }).click();
  await admin.getByRole('button', { name: 'Xác nhận quyết định' }).click();
  await expect(admin.getByRole('status')).toContainText('Đã giải quyết');
  expect((await financeDb.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).resolutionAmount).toBe(80000n);
  await Promise.all([playerContext.close(), adminContext.close()]);
});

test('HT8 Admin đối soát giao dịch tiền vào chưa khớp', async ({ page, request }) => {
  // Payload SePay thật, ký HMAC-SHA256 trên `{timestamp}.{raw_body}`; nội dung không có
  // mã KLT… nên giao dịch rơi vào hàng chờ đối soát tay.
  const externalRef = randomUUID();
  const body = JSON.stringify({ id: externalRef, transferType: 'in', transferAmount: 200000, content: `E2E UNMATCHED ${externalRef}` });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac('sha256', process.env.SEPAY_WEBHOOK_SECRET ?? 'dev-sepay-secret-change-me').update(`${timestamp}.${body}`).digest('hex')}`;
  expect((await request.post(`${FINANCE}/webhooks/sepay`, {
    headers: { 'Content-Type': 'application/json', 'x-sepay-timestamp': timestamp, 'x-sepay-signature': signature },
    data: body,
  })).ok()).toBeTruthy();
  const event = await poll(() => financeDb.sepayEvent.findUnique({ where: { externalRef } }));
  const userId = randomUUID();
  await seedAccountIdentity(userId);
  await financeDb.wallet.create({ data: { userId, walletType: 'personal', available: 0n } });
  const adminId = randomUUID();
  await seedAccountIdentity(adminId, [UserRole.player, UserRole.admin]);
  await setSession(page, token(adminId, ['player', 'admin']));
  await page.goto('/admin?tab=reconciliation');
  await page.getByLabel('Tìm giao dịch đối soát').fill(event.id);
  await page.getByRole('article').filter({ hasText: event.businessCode })
    .getByRole('button', { name: 'Gán ví cá nhân' }).click();
  // Tìm người nhận theo email (gọi /admin/users?query=, có debounce) rồi chọn trong kết quả.
  await page.getByLabel(`Tìm người nhận ${event.id}`).fill(`e2e-${userId}@example.test`);
  const recipient = page.getByLabel(`Chọn người nhận ${event.id}`);
  await expect(recipient.locator(`option[value="${userId}"]`)).toHaveCount(1);
  await recipient.selectOption(userId);
  await page.getByLabel(`Lý do đối soát ${event.id}`).fill('Đã xác minh chủ khoản tiền');
  await page.getByRole('button', { name: 'Xác nhận gán ví cá nhân' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Xác nhận/ }).click();
  await expect(page.getByRole('status')).toContainText('Đã xử lý');
  expect((await financeDb.sepayEvent.findUniqueOrThrow({ where: { externalRef } })).status).toBe('matched_manual');
});
