import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { connectRabbitMQ } from '@khoaluantn/eventbus';
import { PrismaClient as AccountPrismaClient, UserRole } from '../services/account-service/node_modules/@prisma/client/index.js';
import { PrismaClient as VenuePrismaClient } from '../services/venue-booking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as FinancePrismaClient } from '../services/finance-service/node_modules/@prisma/client/index.js';
import { PrismaClient as MatchmakingPrismaClient } from '../services/matchmaking-service/node_modules/@prisma/client/index.js';
import { recordBookingRevenue } from '../services/finance-service/src/domain/revenue.js';
import { ensurePlatformWallet, postLedgerEntry } from '../services/finance-service/src/domain/wallet.js';

const accountDb = new AccountPrismaClient();
const venueDb = new VenuePrismaClient();
const financeDb = new FinancePrismaClient();
const matchmakingDb = new MatchmakingPrismaClient();
const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-real-env';
const token = (userId: string, roles: string[]) => jwt.sign({ sub: userId, roles, type: 'access' }, JWT_SECRET);
const auth = (value: string) => ({ Authorization: `Bearer ${value}`, 'Content-Type': 'application/json' });

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

async function poll<T>(read: () => Promise<T | null>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('Operational shutdown E2E timed out');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function seedIdentity(userId: string, roles: UserRole[]) {
  await accountDb.user.create({
    data: {
      id: userId, email: `shutdown-${userId}@example.test`, passwordHash: 'e2e-session-only',
      roles, verified: true,
      playerProfile: { create: { displayName: `Shutdown E2E ${userId.slice(0, 8)}` } },
    },
  });
}

async function seedFacility(providerUserId: string, label: string) {
  const provider = await venueDb.provider.create({ data: { userId: providerUserId, orgName: label, status: 'approved' } });
  const venue = await venueDb.venue.create({ data: { providerId: provider.id, name: label, lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' } });
  const court = await venueDb.court.create({ data: { venueId: venue.id, name: 'Sân kiểm thử' } });
  await venueDb.operatingHour.createMany({ data: Array.from({ length: 7 }, (_, weekday) => ({ courtId: court.id, weekday, openMinute: 0, closeMinute: 1439 })) });
  await venueDb.bookingRule.create({ data: { courtId: court.id, stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 120 } });
  await venueDb.pricingRule.create({ data: { courtId: court.id, weekday: 0, startMinute: 0, endMinute: 1439, price: 200000n, effectiveFrom: new Date(Date.now() - 86_400_000) } });
  return { provider, venue, court };
}

async function seedConfirmedBooking(input: {
  courtId: string; venueId: string; providerUserId: string; playerId: string; startAt: Date; endAt: Date;
}) {
  const booking = await venueDb.booking.create({
    data: {
      courtId: input.courtId, startAt: input.startAt, endAt: input.endAt, userId: input.playerId,
      source: 'marketplace', status: 'confirmed', priceSnapshot: 200000n,
      policySnapshot: { tiers: [{ minHoursBeforeStart: 24, refundPercent: 100 }] },
    },
  });
  await financeDb.paymentIntent.create({ data: {
    userId: input.playerId, amount: 200000n, method: 'sepay', refType: 'booking', refId: booking.id, status: 'completed',
  } });
  await recordBookingRevenue(randomUUID(), {
    bookingId: booking.id, businessUserId: input.providerUserId, venueId: input.venueId,
    gross: '200000', endAt: input.endAt.toISOString(), source: 'marketplace',
  });
  return booking;
}

test.afterAll(async () => {
  await Promise.all([accountDb.$disconnect(), venueDb.$disconnect(), financeDb.$disconnect(), matchmakingDb.$disconnect()]);
});

test('provider scheduled close returns a paid booking, notifies the player, and redelivery stays idempotent', async ({ page }) => {
  const providerId = randomUUID();
  const playerId = randomUUID();
  await Promise.all([
    seedIdentity(providerId, [UserRole.player, UserRole.provider]),
    seedIdentity(playerId, [UserRole.player]),
  ]);
  const { venue, court } = await seedFacility(providerId, `Shutdown E2E ${randomUUID().slice(0, 8)}`);
  const startAt = new Date(Date.now() + 3 * 86_400_000);
  const booking = await seedConfirmedBooking({
    courtId: court.id, venueId: venue.id, providerUserId: providerId, playerId,
    startAt, endAt: new Date(startAt.getTime() + 60 * 60_000),
  });
  const internalStart = new Date(startAt.getTime() + 2 * 60 * 60_000);
  const internal = await venueDb.booking.create({
    data: {
      courtId: court.id, startAt: internalStart, endAt: new Date(internalStart.getTime() + 60 * 60_000),
      source: 'internal', status: 'confirmed', guestName: 'Khách đặt tại quầy', guestContact: '0909000000',
      priceSnapshot: 180000n, policySnapshot: { tiers: [] },
    },
  });
  const closeDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + 2 * 86_400_000));

  await setSession(page, token(providerId, ['player', 'provider']));
  await page.goto(`/manage/venues/${venue.id}`);
  await page.getByRole('button', { name: 'Ngừng hoạt động cơ sở' }).click();
  await page.getByRole('radio', { name: /Đóng cửa từ ngày đã chọn/ }).click();
  await page.getByLabel('Ngày bắt đầu đóng cửa').fill(closeDate);
  await page.getByRole('button', { name: 'Xem ảnh hưởng' }).click();
  await expect(page.getByText('Lịch bị hủy')).toBeVisible();
  await expect(page.getByText('Lịch tiếp tục phục vụ')).toBeVisible();
  await expect(page.getByText('Bắt đầu đóng cửa')).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Xác nhận ngừng hoạt động' }).click();

  await poll(async () => {
    const item = await venueDb.operationalShutdownItem.findFirst({ where: { bookingId: booking.id } });
    return item?.status === 'refunded' ? item : null;
  });
  const cancellation = await poll(() => venueDb.outbox.findFirst({ where: { aggregateId: booking.id, eventType: 'BookingCancelled' } }));
  await poll(() => accountDb.notification.findFirst({
    where: { userId: playerId, bookingBusinessCode: booking.businessCode, kind: 'finance.shutdown_refund_completed' },
  }));

  const { connection, channel } = await connectRabbitMQ(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672');
  try {
    channel.publish('domain-events', 'BookingCancelled', Buffer.from(JSON.stringify({
      type: 'BookingCancelled', occurredAt: new Date().toISOString(), payload: cancellation.payload,
    })), { persistent: true, contentType: 'application/json', messageId: cancellation.id });
    await new Promise((resolve) => setTimeout(resolve, 750));
  } finally {
    await channel.close();
    await connection.close();
  }
  expect(await financeDb.ledgerEntry.count({ where: { refType: 'booking', refId: booking.id, type: 'refund' } })).toBe(3);
  expect(await financeDb.outbox.count({ where: { aggregateId: booking.id, eventType: 'BookingRefundCompleted' } })).toBe(1);
  expect(await accountDb.notification.count({ where: { userId: playerId, bookingBusinessCode: booking.businessCode, kind: 'finance.shutdown_refund_completed' } })).toBe(1);

  await setSession(page, token(playerId, ['player']));
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Đã hủy' }).click();
  const bookingCard = page.getByLabel('Danh sách booking').filter({ hasText: venue.name });
  await bookingCard.getByRole('button', { name: /^Xem chi tiết lượt đặt sân/ }).click();
  await expect(bookingCard.getByText(booking.businessCode)).toBeVisible();
  await expect(bookingCard.getByText('Quận 1, TP.HCM')).toBeVisible();
  await expect(bookingCard.getByText('Tiền hoàn đã vào Số dư COURTIN')).toBeVisible();

  await setSession(page, token(providerId, ['player', 'provider']));
  await page.goto('/manage/bookings');
  await expect(page.getByText('Bạn cần tự thông báo cho khách').first()).toBeVisible();
  expect(await venueDb.booking.findUniqueOrThrow({ where: { id: internal.id } })).toMatchObject({ status: 'cancelled' });
});

test('Admin can stop a court immediately while a booking is in progress', async ({ page }) => {
  const adminId = randomUUID();
  const providerId = randomUUID();
  const playerId = randomUUID();
  await Promise.all([
    seedIdentity(adminId, [UserRole.player, UserRole.admin]),
    seedIdentity(providerId, [UserRole.player, UserRole.provider]),
    seedIdentity(playerId, [UserRole.player]),
  ]);
  const { venue, court } = await seedFacility(providerId, `Admin shutdown E2E ${randomUUID().slice(0, 8)}`);
  const startAt = new Date(Date.now() - 30 * 60_000);
  const booking = await seedConfirmedBooking({
    courtId: court.id, venueId: venue.id, providerUserId: providerId, playerId,
    startAt, endAt: new Date(Date.now() + 30 * 60_000),
  });

  await setSession(page, token(adminId, ['player', 'admin']));
  await page.goto('/admin/bookings');
  await page.getByLabel('Tìm booking').fill(venue.name);
  await page.getByRole('button', { name: 'Lọc' }).click();
  await page.getByRole('article').filter({ hasText: venue.name })
    .getByRole('button', { name: 'Xem chi tiết' }).click();
  await page.getByRole('button', { name: 'Ngừng hoạt động sân' }).click();
  await page.getByRole('radio', { name: /Ngừng hoạt động ngay do sự cố/ }).click();
  await page.getByLabel('Lý do sự cố').fill('Cơ sở không thể tiếp tục phục vụ');
  await page.getByRole('button', { name: 'Xem ảnh hưởng' }).click();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Xác nhận ngừng hoạt động' }).click();

  await poll(async () => {
    const item = await venueDb.operationalShutdownItem.findFirst({ where: { bookingId: booking.id } });
    return item?.status === 'refunded' ? item : null;
  });
  expect(await venueDb.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: 'cancelled' });
  expect(await financeDb.ledgerEntry.count({ where: { refType: 'booking', refId: booking.id, type: 'refund' } })).toBe(3);
  await expect(page.getByText('Lỗi hệ thống.')).toHaveCount(0);
});

test('shutdown of a held match returns each paid contribution and skips pending join notifications', async ({ page }) => {
  const providerId = randomUUID();
  const organizerId = randomUUID();
  const approvedPlayerId = randomUUID();
  const pendingPlayerId = randomUUID();
  await Promise.all([
    seedIdentity(providerId, [UserRole.player, UserRole.provider]),
    seedIdentity(organizerId, [UserRole.player]),
    seedIdentity(approvedPlayerId, [UserRole.player]),
    seedIdentity(pendingPlayerId, [UserRole.player]),
  ]);
  const { venue, court } = await seedFacility(providerId, `Match shutdown E2E ${randomUUID().slice(0, 8)}`);
  const bookingId = randomUUID();
  const startAt = new Date(Date.now() + 3 * 86_400_000);
  const booking = await venueDb.booking.create({
    data: {
      id: bookingId, courtId: court.id, startAt, endAt: new Date(startAt.getTime() + 60 * 60_000),
      userId: organizerId, source: 'marketplace', status: 'held', holdPurposeSnapshot: 'match',
      holdExpiresAt: new Date(Date.now() + 10 * 60_000), priceSnapshot: 150000n,
      policySnapshot: { tiers: [] },
    },
  });
  const match = await matchmakingDb.match.create({ data: {
    organizerUserId: organizerId, bookingId: booking.id, capacity: 3, feePerSlot: 50000n,
    status: 'open', cutoffAt: new Date(startAt.getTime() - 60 * 60_000),
    organizerContributionPaidAt: new Date(),
  } });
  const approvedJoin = await matchmakingDb.join.create({ data: {
    matchId: match.id, participantUserId: approvedPlayerId, status: 'confirmed', feePaidAt: new Date(),
  } });
  const pendingJoin = await matchmakingDb.join.create({ data: {
    matchId: match.id, participantUserId: pendingPlayerId, status: 'pending',
  } });
  const funding = await financeDb.matchFunding.create({
    data: {
      matchId: match.id, bookingId: booking.id, organizerUserId: organizerId, capacity: 3,
      feePerSlot: 50000n, bookingPrice: 150000n, organizerContribution: 50000n,
      cutoffAt: match.cutoffAt,
      contributions: { create: [
        { contributionKey: `organizer:${match.id}`, userId: organizerId, role: 'organizer', amount: 50000n, status: 'paid', paidAt: new Date() },
        { contributionKey: approvedJoin.id, joinId: approvedJoin.id, userId: approvedPlayerId, role: 'participant', amount: 50000n, status: 'paid', paidAt: new Date() },
        { contributionKey: pendingJoin.id, joinId: pendingJoin.id, userId: pendingPlayerId, role: 'participant', amount: 50000n, status: 'pending' },
      ] },
    }, include: { contributions: true },
  });
  const platformWallet = await ensurePlatformWallet();
  await financeDb.$transaction(async (tx) => {
    for (const contribution of funding.contributions.filter((item) => item.status === 'paid')) {
      const personal = await tx.wallet.create({ data: { userId: contribution.userId, walletType: 'personal', available: contribution.amount } });
      await tx.ledgerEntry.create({
        data: { walletId: personal.id, amount: contribution.amount, type: 'topup', refType: 'topup', refId: randomUUID(), before: 0n, after: contribution.amount },
      });
      await postLedgerEntry(tx, {
        walletId: personal.id, amount: -contribution.amount, type: 'payment', refType: 'matchFee', refId: contribution.id,
      });
      await postLedgerEntry(tx, {
        walletId: platformWallet.id, amount: contribution.amount, type: 'reserve', refType: 'matchFee', refId: contribution.id, field: 'reserved',
      });
    }
  });
  const organizerContribution = funding.contributions.find((item) => item.role === 'organizer')!;
  await matchmakingDb.match.update({ where: { id: match.id }, data: { organizerContributionId: organizerContribution.id } });

  await setSession(page, token(providerId, ['player', 'provider']));
  await page.goto(`/manage/venues/${venue.id}`);
  await page.getByRole('button', { name: 'Ngừng hoạt động cơ sở' }).click();
  await page.getByRole('radio', { name: /Ngừng hoạt động ngay do sự cố/ }).click();
  await page.getByLabel('Lý do sự cố').fill('Không thể tiếp tục phục vụ');
  await page.getByRole('button', { name: 'Xem ảnh hưởng' }).click();
  await expect(page.getByText('Dự kiến hoàn cho khách')).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Xác nhận ngừng hoạt động' }).click();

  await poll(async () => {
    const item = await venueDb.operationalShutdownItem.findFirst({ where: { bookingId: booking.id } });
    return item?.status === 'refunded' ? item : null;
  });
  await poll(async () => (await matchmakingDb.match.findUnique({ where: { id: match.id } }))?.status === 'cancelled' ? match : null);
  expect((await matchmakingDb.join.findMany({ where: { matchId: match.id }, select: { status: true } }))
    .map((item) => item.status).sort()).toEqual(['withdrawn', 'withdrawn']);
  expect((await financeDb.matchContribution.findMany({ where: { matchId: match.id }, select: { status: true } }))
    .map((item) => item.status).sort()).toEqual(['pending', 'refunded', 'refunded']);
  for (const contribution of funding.contributions.filter((item) => item.status === 'paid')) {
    expect(await financeDb.ledgerEntry.count({ where: { type: 'refund', refType: 'matchFee', refId: contribution.id } })).toBe(2);
  }
  expect(await financeDb.ledgerEntry.count({ where: { type: 'refund', refType: 'matchFee', refId: funding.contributions.find((item) => item.status === 'pending')!.id } })).toBe(0);
  expect(await accountDb.notification.count({ where: { userId: pendingPlayerId, bookingBusinessCode: booking.businessCode, kind: 'match.shutdown_emergency' } })).toBe(0);
  expect(await accountDb.notification.count({ where: { userId: organizerId, bookingBusinessCode: booking.businessCode, kind: 'finance.shutdown_refund_completed' } })).toBe(1);
  expect(await accountDb.notification.count({ where: { userId: approvedPlayerId, bookingBusinessCode: booking.businessCode, kind: 'finance.shutdown_refund_completed' } })).toBe(1);
});
