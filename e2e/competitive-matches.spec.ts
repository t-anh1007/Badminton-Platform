/**
 * Task 26 — kèo cạnh tranh v2 trên stack local thật (gateway, 5 service, RabbitMQ, MinIO).
 *
 * Quy ước chạy (plan 2026-09-25, Task 26):
 * - Backend chạy cấu hình `backend-no-email` (email bắt buộc chỉ in ra log) và kho ảnh trỏ MinIO local.
 * - Thao tác của người dùng đi qua giao diện; tiền, sổ cái và trạng thái kiểm bằng truy vấn DB chỉ đọc.
 * - Thời gian: dời mốc hạn/cutoff của đúng hồ sơ đang test rồi gọi hàm sweep với `now` tường minh.
 * - Thanh toán: số dư ví được seed rồi trả bằng luồng "Số dư"; tiền chuyển khoản gọi thẳng hàm nhận tiền của
 *   Finance (không ký webhook bằng secret thật).
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma as accountDb } from '../services/account-service/src/lib/prisma.js';
import { prisma as venueDb } from '../services/venue-booking-service/src/lib/prisma.js';
import { prisma as financeDb } from '../services/finance-service/src/lib/prisma.js';
import { prisma as matchDb } from '../services/matchmaking-service/src/lib/prisma.js';
import { seedPersonalBalance } from '../services/finance-service/test/helpers.js';
import { cancelMatchesAtCutoff } from '../services/matchmaking-service/src/domain/matchLifecycle.js';
import { completeEndedBookings } from '../services/venue-booking-service/src/domain/booking.js';
import { sweepResultDeadlines, sweepResultReviews } from '../services/matchmaking-service/src/domain/resultLifecycle.js';
import { sweepRewardPrograms } from '../services/matchmaking-service/src/domain/rewards.js';
import { getOwnPassport } from '../services/matchmaking-service/src/domain/passport.js';
import { cancelExpiredClaims } from '../services/finance-service/src/domain/rewardPayout.js';
import { handleIncomingTransfer } from '../services/finance-service/src/domain/sepayWebhook.js';
import { handleMatchResultFinalized } from '../services/finance-service/src/domain/matchResult.js';
import { purgeResultCases } from '../services/matchmaking-service/test/resultTestUtils.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-real-env';
const API = 'http://localhost:3000/api';
const HOUR = 60 * 60_000;
// PNG 1x1 hợp lệ để tải lên MinIO như ảnh bảng điểm thật.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

type Role = 'player' | 'provider' | 'admin';
const created = { users: [] as string[], matches: [] as string[], bookings: [] as string[], venues: [] as string[], providers: [] as string[], programs: [] as string[] };
let platformBefore: { id: string; available: bigint; pending: bigint; reserved: bigint } | null = null;

const token = (userId: string, roles: Role[]) => jwt.sign({ sub: userId, roles, type: 'access' }, JWT_SECRET);

async function api<T>(method: 'GET' | 'POST' | 'PUT', path: string, userId: string, roles: Role[], body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token(userId, roles)}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as T };
}

async function poll<T>(read: () => Promise<T>, done: (value: T) => boolean, label: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`Hết thời gian chờ: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Người dùng thật trong Account để thông báo được chiếu vào hộp thư và tên hiển thị đúng. */
async function seedUser(displayName: string, roles: Role[] = ['player']) {
  const id = randomUUID();
  created.users.push(id);
  await accountDb.user.create({
    data: {
      id, email: `cm-e2e-${id}@example.test`, passwordHash: 'e2e-session-only', roles, verified: true,
      playerProfile: { create: { displayName } },
    },
  });
  // DB local có thể đang có kỳ xếp hạng (như production): người chơi chọn khu vực trước khi chơi kèo xếp hạng.
  const season = await matchDb.season.findFirst({ where: { closedAt: null, startAt: { lte: new Date() }, endAt: { gt: new Date() } } });
  if (season) await matchDb.playerSeasonProfile.create({ data: { seasonId: season.id, userId: id, provinceCode: 'ho-chi-minh', lockedAt: new Date() } });
  return { id, displayName, roles };
}
type User = Awaited<ReturnType<typeof seedUser>>;

/** Phiên theo vai cho Web: giả lập /auth/refresh để SessionProvider giữ đúng người dùng. */
async function openAs(browser: Browser, user: User, role: Role = user.roles[0]!): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const accessToken = token(user.id, user.roles);
  await page.route('**/auth/refresh', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ accessToken, refreshToken: 'e2e-refresh-token', roles: user.roles }),
  }));
  await page.addInitScript(({ value, roles, active }) => {
    localStorage.removeItem('courtin.session');
    localStorage.setItem('accessToken', value);
    localStorage.setItem('refreshToken', 'e2e-refresh-token');
    localStorage.setItem('roles', JSON.stringify(roles));
    localStorage.setItem('courtin.activeRole', active);
  }, { value: accessToken, roles: user.roles, active: role });
  return page;
}

/** Sân có tỉnh, giá theo giờ và một slot đang giữ còn >= 48 giờ cho chủ kèo. */
async function seedVenueWithHold(organizerId: string, price: bigint, durationMinutes = 60) {
  const providerUser = await seedUser(`Chủ sân ${randomUUID().slice(0, 4)}`, ['provider']);
  const provider = await venueDb.provider.create({ data: { userId: providerUser.id, orgName: `CM E2E ${randomUUID().slice(0, 6)}`, status: 'approved' } });
  created.providers.push(provider.id);
  const venue = await venueDb.venue.create({
    data: { providerId: provider.id, name: `Sân E2E ${randomUUID().slice(0, 6)}`, address: '12 Lê Lợi, Quận 1', lat: 10.77, lng: 106.7, provinceCode: 'ho-chi-minh' },
  });
  created.venues.push(venue.id);
  const court = await venueDb.court.create({ data: { venueId: venue.id, name: 'Sân 1' } });
  await venueDb.pricingRule.createMany({
    data: Array.from({ length: 7 }, (_, weekday) => ({ courtId: court.id, weekday, startMinute: 0, endMinute: 1440, price, effectiveFrom: new Date(Date.now() - 86_400_000) })),
  });
  const startAt = new Date(Date.now() + 48 * HOUR);
  startAt.setUTCHours(3, 0, 0, 0); // 10:00 giờ Việt Nam
  const hold = await venueDb.hold.create({
    data: { courtId: court.id, userId: organizerId, startAt, endAt: new Date(startAt.getTime() + durationMinutes * 60_000), expiresAt: new Date(Date.now() + 30 * 60_000) },
  });
  return { providerUser, provider, venue, court, hold };
}

/** Chụp màn khi bật E2E_SHOTS (thư mục đích) để rà bố cục với mockup; không ảnh hưởng kết quả test. */
async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SHOTS;
  if (!dir) return;
  // Chờ màn chào lúc tải trang biến mất để ảnh là nội dung thật.
  await page.getByText('Đang chuẩn bị sân cho bạn').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

const withdrawable = async (userId: string) => (await financeDb.wallet.findFirst({ where: { userId, walletType: 'personal' } }))?.withdrawable ?? 0n;
const notificationsOf = (userId: string, kind: string) => accountDb.notification.findMany({ where: { userId, kind } });

/** Chủ kèo tạo kèo trên màn 01 rồi đóng phần góp bằng số dư trên màn 02. */
async function createMatchViaUi(page: Page, organizer: User, options: { ratio: '5 : 5' | '6 : 4' | '7 : 3'; doubles?: boolean; ranked?: boolean; paidBooking?: boolean }) {
  // Nạp trước: rời/tải lại trang khi đang chờ cọc sẽ tự hủy kèo (useCheckoutAbandonment).
  if (!options.paidBooking) await seedPersonalBalance(organizer.id, 1_000_000n);
  await page.goto('/matches?create=1');
  if (options.paidBooking) await page.getByText('Booking đã thanh toán', { exact: true }).click();
  await expect(page.getByLabel('Nguồn tạo kèo')).toBeVisible();
  if (options.ranked) await page.getByText('Xếp hạng', { exact: true }).click();
  if (options.doubles) await page.getByText('Đánh đôi', { exact: true }).click();
  await page.getByText(options.ratio, { exact: true }).click();
  await expect(page.getByText('Giữ chờ kết quả')).toBeVisible();
  await shot(page, `s01-create-${options.paidBooking ? 'paid' : 'hold'}`);
  await page.getByRole('button', { name: 'Công bố kèo' }).click();
  await page.waitForURL(/\/matches\/[0-9a-f-]{36}$/);
  const matchId = page.url().split('/').pop()!;
  created.matches.push(matchId);
  const match = await matchDb.match.findUniqueOrThrow({ where: { id: matchId } });
  created.bookings.push(match.bookingId);
  if (!options.paidBooking) {
    // Finance tạo phần góp khi nhận MatchCreated qua queue; chỉ bấm trả khi phần góp đã có.
    await poll(() => financeDb.matchContribution.findUnique({ where: { contributionKey: `organizer:${matchId}` } }), (row) => row !== null, 'phần góp chủ kèo');
    await page.getByRole('button', { name: 'Đóng phần góp' }).click();
  }
  await poll(() => matchDb.match.findUniqueOrThrow({ where: { id: matchId } }), (row) => row.status === 'open', 'kèo mở');
  return matchId;
}

/** Người chơi chọn đội trên màn 02 và thanh toán phần của mình bằng số dư. */
async function joinViaUi(page: Page, player: User, matchId: string, side: 'A' | 'B') {
  await seedPersonalBalance(player.id, 1_000_000n);
  await page.goto(`/matches/${matchId}`);
  await page.getByRole('button', { name: `Vào đội ${side}` }).first().click();
  const join = await poll(
    () => matchDb.join.findFirst({ where: { matchId, participantUserId: player.id, status: { in: ['approved', 'pending'] } } }),
    (row) => row !== null, 'giữ chỗ',
  );
  expect(join!.teamSide).toBe(side);
  await poll(() => financeDb.matchContribution.findUnique({ where: { joinId: join!.id } }), (row) => row !== null, 'phần góp người chơi');
  await page.getByRole('button', { name: 'Thanh toán phần còn lại' }).click();
  await page.getByRole('button', { name: 'Thanh toán số dư' }).click();
  await poll(() => matchDb.join.findUniqueOrThrow({ where: { id: join!.id } }), (row) => row.status === 'confirmed', 'JOIN xác nhận');
  return join!;
}

/** Tới hạn chốt kèo rồi cho booking kết thúc để mở hồ sơ kết quả (thay cho chờ giờ thật). */
async function lockAndFinish(matchId: string) {
  await matchDb.match.update({ where: { id: matchId }, data: { cutoffAt: new Date(Date.now() - 1_000) } });
  await cancelMatchesAtCutoff();
  await poll(() => matchDb.match.findUniqueOrThrow({ where: { id: matchId } }), (row) => row.status === 'confirmed', 'kèo chốt');
  const match = await matchDb.match.findUniqueOrThrow({ where: { id: matchId } });
  const endAt = new Date(Date.now() - 1_000);
  await venueDb.booking.update({ where: { id: match.bookingId }, data: { startAt: new Date(endAt.getTime() - HOUR), endAt } });
  await matchDb.match.update({ where: { id: matchId }, data: { startAt: new Date(endAt.getTime() - HOUR), endAt } });
  await completeEndedBookings();
  return poll(() => matchDb.matchResultCase.findUnique({ where: { matchId } }), (row) => row?.status === 'declaration_open', 'mở khai kết quả');
}

/** Màn 03: nhập tỷ số và tải ảnh bảng điểm thật lên MinIO qua giao diện. */
async function declareViaUi(page: Page, matchId: string, sets: Array<[number, number]>) {
  await page.goto(`/matches/${matchId}`);
  const inputs = page.locator('input[aria-label^="Set "]');
  await expect(inputs.first()).toBeVisible();
  for (const [index, [a, b]] of sets.entries()) {
    await inputs.nth(index * 2).fill(String(a));
    await inputs.nth(index * 2 + 1).fill(String(b));
  }
  await page.getByLabel('Thêm ảnh bảng điểm hoặc ảnh tại sân').setInputFiles({ name: 'bang-diem.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Đã tải')).toBeVisible();
  await shot(page, 's03-declare');
  await page.getByRole('button', { name: 'Gửi kết quả' }).click();
  await expect(page.getByText(/Đã gửi kết quả/)).toBeVisible();
}

/**
 * Dọn toàn bộ dữ liệu do spec tạo trên DB local dùng chung. Mỗi bước độc lập để một bước lỗi không chặn
 * các bước sau; lỗi được in ra để thấy dữ liệu nào còn sót. Ví nền tảng được trả về số dư trước khi chạy.
 */
async function cleanupCreatedData() {
  const failures: string[] = [];
  const step = async (label: string, run: () => Promise<unknown>) => {
    try { await run(); } catch (error) { failures.push(`${label}: ${error instanceof Error ? error.message.split('\n').pop() : String(error)}`); }
  };
  const users = created.users;
  const matches = created.matches;
  const bookings = created.bookings;
  const programs = created.programs;
  const contributions = (await financeDb.matchContribution.findMany({ where: { matchId: { in: matches } }, select: { id: true } })).map((row) => row.id);
  const payouts = (await financeDb.rewardPayout.findMany({ where: { programId: { in: programs } }, select: { id: true } })).map((row) => row.id);
  const wallets = (await financeDb.wallet.findMany({ where: { userId: { in: users } }, select: { id: true } })).map((row) => row.id);

  await step('finance ledger', () => financeDb.ledgerEntry.deleteMany({
    where: { OR: [{ walletId: { in: wallets } }, { refId: { in: [...bookings, ...matches, ...contributions, ...payouts] } }] },
  }));
  await step('finance intents', () => financeDb.paymentIntent.deleteMany({ where: { OR: [{ userId: { in: users } }, { refId: { in: [...bookings, ...contributions] } }] } }));
  await step('finance revenue', () => financeDb.bookingRevenue.deleteMany({ where: { bookingId: { in: bookings } } }));
  await step('finance contributions', () => financeDb.matchContribution.deleteMany({ where: { matchId: { in: matches } } }));
  await step('finance funding', () => financeDb.matchFunding.deleteMany({ where: { matchId: { in: matches } } }));
  await step('finance payouts', () => financeDb.rewardPayout.deleteMany({ where: { programId: { in: programs } } }));
  await step('finance outbox', () => financeDb.outbox.deleteMany({ where: { aggregateId: { in: [...bookings, ...matches, ...contributions, ...payouts] } } }));
  await step('finance wallets', () => financeDb.wallet.deleteMany({ where: { id: { in: wallets } } }));
  if (platformBefore) {
    await step('finance platform', () => financeDb.wallet.update({
      where: { id: platformBefore!.id }, data: { available: platformBefore!.available, pending: platformBefore!.pending, reserved: platformBefore!.reserved },
    }));
  }

  await step('match results', () => purgeResultCases(matches, matchDb));
  await step('match ratings', () => matchDb.matchRatingChange.deleteMany({ where: { OR: [{ matchId: { in: matches } }, { userId: { in: users } }] } }));
  await step('match encounters', () => matchDb.ratedEncounter.deleteMany({ where: { OR: [{ matchId: { in: matches } }, { userId: { in: users } }] } }));
  await step('match badges', () => matchDb.playerBadge.deleteMany({ where: { userId: { in: users } } }));
  await step('match rewards', async () => {
    await matchDb.rewardAward.deleteMany({ where: { programId: { in: programs } } });
    await matchDb.rewardTier.deleteMany({ where: { programId: { in: programs } } });
    await matchDb.rewardProgram.deleteMany({ where: { id: { in: programs } } });
  });
  await step('match outbox', () => matchDb.outbox.deleteMany({ where: { OR: [{ aggregateId: { in: [...matches, ...programs] } }, ...users.map((id) => ({ aggregateId: { contains: id } }))] } }));
  await step('match resolution', () => matchDb.matchResolution.deleteMany({ where: { matchId: { in: matches } } }));
  await step('match joins', () => matchDb.join.deleteMany({ where: { matchId: { in: matches } } }));
  await step('match matches', () => matchDb.match.deleteMany({ where: { id: { in: matches } } }));
  await step('match season', async () => {
    await matchDb.seasonStat.deleteMany({ where: { userId: { in: users } } });
    await matchDb.playerSeasonProfile.deleteMany({ where: { userId: { in: users } } });
  });
  await step('match passports', () => matchDb.passport.deleteMany({ where: { userId: { in: users } } }));

  await step('venue outbox', () => venueDb.outbox.deleteMany({ where: { aggregateId: { in: bookings } } }));
  await step('venue commands', () => venueDb.matchBookingCommand.deleteMany({ where: { bookingId: { in: bookings } } }));
  await step('venue bookings', () => venueDb.booking.deleteMany({ where: { OR: [{ id: { in: bookings } }, { court: { venueId: { in: created.venues } } }] } }));
  await step('venue holds', () => venueDb.hold.deleteMany({ where: { court: { venueId: { in: created.venues } } } }));
  await step('venue pricing', () => venueDb.pricingRule.deleteMany({ where: { court: { venueId: { in: created.venues } } } }));
  await step('venue courts', () => venueDb.court.deleteMany({ where: { venueId: { in: created.venues } } }));
  await step('venue venues', () => venueDb.venue.deleteMany({ where: { id: { in: created.venues } } }));
  await step('venue providers', () => venueDb.provider.deleteMany({ where: { id: { in: created.providers } } }));

  await step('account notifications', () => accountDb.notification.deleteMany({ where: { userId: { in: users } } }));
  await step('account preferences', () => accountDb.notificationPreference.deleteMany({ where: { userId: { in: users } } }));
  await step('account profiles', () => accountDb.playerProfile.deleteMany({ where: { userId: { in: users } } }));
  await step('account users', () => accountDb.user.deleteMany({ where: { id: { in: users } } }));
  if (failures.length) console.warn(`[competitive-matches e2e] dọn dữ liệu còn sót:\n${failures.join('\n')}`);
}

test.beforeAll(async () => {
  platformBefore = await financeDb.wallet.findFirst({ where: { userId: null, walletType: 'platform' }, select: { id: true, available: true, pending: true, reserved: true } });
});

test.afterAll(async () => {
  // Chờ các event cuối (thông báo, hoàn tiền) được xử lý rồi mới dọn.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  await cleanupCreatedData();
  await Promise.all([accountDb.$disconnect(), venueDb.$disconnect(), financeDb.$disconnect(), matchDb.$disconnect()]);
});

test('1. Hold -> đơn 7:3 -> hai bên trả -> chốt kèo -> khai tỷ số -> không phản đối -> người thắng nhận tiền rút được', async ({ browser }) => {
  const organizer = await seedUser('Minh Anh E2E');
  const opponent = await seedUser('Phúc Nguyễn E2E');
  await seedVenueWithHold(organizer.id, 200_000n);

  const organizerPage = await openAs(browser, organizer);
  const matchId = await createMatchViaUi(organizerPage, organizer, { ratio: '7 : 3' });
  const opponentPage = await openAs(browser, opponent);
  await joinViaUi(opponentPage, opponent, matchId, 'B');
  await opponentPage.reload();
  await shot(opponentPage, 's02-detail');

  const funding = await financeDb.matchFunding.findUniqueOrThrow({ where: { matchId } });
  expect(funding).toMatchObject({ resultReserve: 80_000n, totalContribution: 280_000n });

  await lockAndFinish(matchId);
  await declareViaUi(organizerPage, matchId, [[21, 15], [21, 18]]);

  // Spec §11: đối thủ nhận thông báo có bản khai đầu, bấm thông báo mở đúng màn kết quả.
  await poll(() => notificationsOf(opponent.id, 'match.result.provisional'), (rows) => rows.length === 1, 'thông báo bản khai đầu');
  await opponentPage.goto('/notifications');
  await opponentPage.getByText('Đã có kết quả tạm của trận').first().click();
  await opponentPage.waitForURL(new RegExp(`/matches/${matchId}`));

  const before = await withdrawable(organizer.id);
  await opponentPage.getByRole('button', { name: 'Gửi phản hồi' }).click();
  await expect(opponentPage.getByText('Kết quả đã chốt')).toBeVisible();
  await poll(() => financeDb.matchFunding.findUniqueOrThrow({ where: { matchId } }), (row) => row.resultFinalizedAt !== null, 'nhả tiền giữ');
  expect((await withdrawable(organizer.id)) - before).toBe(80_000n);
  expect(await withdrawable(opponent.id)).toBe(0n);
});

/** Booking thường đã thanh toán thật: hold -> booking -> trả bằng số dư -> Venue xác nhận -> Finance ghi doanh thu. */
async function seedPaidBooking(owner: User, price: bigint) {
  const seeded = await seedVenueWithHold(owner.id, price);
  const booking = await api<{ id: string }>('POST', '/venue/bookings', owner.id, ['player'], { holdId: seeded.hold.id });
  expect(booking.status, JSON.stringify(booking.body)).toBe(201);
  created.bookings.push(booking.body.id);
  await seedPersonalBalance(owner.id, price);
  const paid = await api('POST', `/finance/bookings/${booking.body.id}/pay/balance`, owner.id, ['player']);
  expect(paid.status, JSON.stringify(paid.body)).toBe(200);
  await poll(() => financeDb.bookingRevenue.findUnique({ where: { bookingId: booking.body.id } }), (row) => row !== null, 'doanh thu booking');
  return { ...seeded, bookingId: booking.body.id };
}

/** Người chơi vào đội và trả phần góp qua API (cùng endpoint giao diện gọi). */
async function joinViaApi(player: User, matchId: string, side: 'A' | 'B') {
  const join = await api<{ id: string }>('POST', `/matchmaking/matches/${matchId}/joins`, player.id, ['player'], { teamSide: side });
  expect(join.status, JSON.stringify(join.body)).toBe(201);
  const contribution = await poll(() => financeDb.matchContribution.findUnique({ where: { joinId: join.body.id } }), (row) => row !== null, 'phần góp');
  await seedPersonalBalance(player.id, contribution!.amount);
  const paid = await api('POST', `/finance/matches/${matchId}/joins/${join.body.id}/pay/balance`, player.id, ['player']);
  expect(paid.status, JSON.stringify(paid.body)).toBe(200);
  await poll(() => matchDb.join.findUniqueOrThrow({ where: { id: join.body.id } }), (row) => row.status === 'confirmed', 'JOIN xác nhận');
  return { joinId: join.body.id, contributionId: contribution!.id, amount: contribution!.amount };
}

/** Ảnh bằng chứng thật trên MinIO: xin chữ ký tải lên như giao diện rồi PUT đúng header. */
async function uploadEvidence(user: User, matchId: string) {
  const checksumSha256 = createHash('sha256').update(PNG).digest('base64');
  const authorized = await api<{ upload: { objectKey: string; uploadUrl: string; headers: Record<string, string> } }>(
    'POST', `/matchmaking/matches/${matchId}/result-evidence/uploads`, user.id, ['player'], { mimeType: 'image/png', size: PNG.length, checksumSha256 },
  );
  expect(authorized.status, JSON.stringify(authorized.body)).toBe(201);
  const put = await fetch(authorized.body.upload.uploadUrl, { method: 'PUT', headers: authorized.body.upload.headers, body: PNG });
  expect(put.status).toBe(200);
  return [{ objectKey: authorized.body.upload.objectKey, mimeType: 'image/png', checksumSha256 }];
}

async function claimViaApi(user: User, matchId: string, sets: Array<{ teamA: number; teamB: number }>) {
  const response = await api('POST', `/matchmaking/matches/${matchId}/result-claims`, user.id, ['player'], { sets, evidence: await uploadEvidence(user, matchId) });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
}

test('2. Booking đã trả -> đôi 6:4 -> ba người trả -> chốt kèo không ghi doanh thu lần hai -> tranh chấp -> chủ sân đề xuất -> Admin chốt', async ({ browser }) => {
  const owner = await seedUser('Chủ kèo Đôi E2E');
  const partner = await seedUser('Đồng đội E2E');
  const b1 = await seedUser('Đội B một E2E');
  const b2 = await seedUser('Đội B hai E2E');
  const admin = await seedUser('Admin E2E', ['admin']);
  const paid = await seedPaidBooking(owner, 200_000n);
  const revenueBefore = await financeDb.bookingRevenue.findUniqueOrThrow({ where: { bookingId: paid.bookingId } });
  const bookingLedger = () => financeDb.ledgerEntry.findMany({ where: { refId: paid.bookingId }, orderBy: { id: 'asc' } });
  const bookingLedgerBefore = await bookingLedger();

  const ownerPage = await openAs(browser, owner);
  const matchId = await createMatchViaUi(ownerPage, owner, { ratio: '6 : 4', doubles: true, paidBooking: true });
  await joinViaUi(await openAs(browser, partner), partner, matchId, 'A');
  await joinViaApi(b1, matchId, 'B');
  await joinViaApi(b2, matchId, 'B');
  await lockAndFinish(matchId);

  // AC-CM-06: không thêm doanh thu/hoa hồng cho booking, đúng một lần hoàn dư cho chủ kèo.
  expect(await financeDb.bookingRevenue.count({ where: { bookingId: paid.bookingId } })).toBe(1);
  expect(await financeDb.bookingRevenue.findUniqueOrThrow({ where: { bookingId: paid.bookingId } })).toEqual(revenueBefore);
  expect(await financeDb.ledgerEntry.count({ where: { refId: paid.bookingId, type: 'commission' } })).toBe(1);
  const rebalances = await financeDb.ledgerEntry.findMany({ where: { refType: 'matchOwnerRebalance', refId: matchId, amount: { gt: 0n } } });
  expect(rebalances).toHaveLength(1);
  expect(rebalances[0]!.amount).toBe((await financeDb.matchFunding.findUniqueOrThrow({ where: { matchId } })).organizerRebalance);

  await claimViaApi(owner, matchId, [{ teamA: 21, teamB: 15 }, { teamA: 21, teamB: 18 }]);
  // Màn 04: bên thua khiếu nại kèm ảnh qua giao diện.
  const b1Page = await openAs(browser, b1);
  await b1Page.goto(`/matches/${matchId}`);
  await b1Page.getByText('Tôi muốn khiếu nại').click();
  await b1Page.getByLabel('Lý do khiếu nại').fill('Set 2 là 19-21, đội B thắng.');
  await b1Page.getByLabel('Thêm ảnh minh chứng').first().setInputFiles({ name: 'khieu-nai.png', mimeType: 'image/png', buffer: PNG });
  await expect(b1Page.getByText('Đã tải').first()).toBeVisible();
  await shot(b1Page, 's04-respond');
  await b1Page.getByRole('button', { name: 'Báo sự cố trận đấu' }).click();
  await shot(b1Page, 's05-incident');
  await b1Page.getByRole('button', { name: 'Gửi phản hồi' }).click();
  const resultCase = await poll(() => matchDb.matchResultCase.findUniqueOrThrow({ where: { matchId } }), (row) => row.status === 'provider_review', 'chờ chủ sân');

  // Màn 09: chủ sân nhận thông báo, mở hồ sơ và đề xuất không ràng buộc.
  await poll(() => notificationsOf(paid.providerUser.id, 'match.result.provider_review'), (rows) => rows.length === 1, 'thông báo chủ sân');
  const providerPage = await openAs(browser, paid.providerUser, 'provider');
  await providerPage.goto(`/manage/match-results?caseId=${resultCase.id}`);
  await providerPage.getByText('thắng (Đội B)').first().click();
  await providerPage.getByLabel('Lý do đề xuất').fill('Camera sân cho thấy đội B thắng set 2.');
  await shot(providerPage, 's09-provider');
  await providerPage.getByRole('button', { name: 'Gửi đề xuất cho Admin' }).click();
  await expect(providerPage.getByText('Chờ Admin quyết định', { exact: true })).toBeVisible();
  expect(await financeDb.matchFunding.findUniqueOrThrow({ where: { matchId } })).toMatchObject({ resultReserveStatus: 'locked', resultFinalizedAt: null });

  // Màn 10: Admin xem trước rồi xác nhận quyết định cuối.
  const adminPage = await openAs(browser, admin, 'admin');
  await adminPage.goto(`/admin/match-results?caseId=${resultCase.id}`);
  await adminPage.locator('input[name="admin-outcome"]').first().check();
  await adminPage.getByLabel('Lý do quyết định cuối').fill('Ảnh bảng điểm của chủ kèo rõ ràng hơn.');
  await adminPage.getByRole('button', { name: 'Xem trước tác động' }).click();
  await adminPage.getByRole('checkbox').check();
  await shot(adminPage, 's10-admin-decision');
  const before = await Promise.all([owner, partner, b1, b2].map((user) => withdrawable(user.id)));
  await adminPage.getByRole('button', { name: 'Xác nhận quyết định cuối' }).click();
  await poll(() => financeDb.matchFunding.findUniqueOrThrow({ where: { matchId } }), (row) => row.resultFinalizedAt !== null, 'nhả tiền giữ');
  const after = await Promise.all([owner, partner, b1, b2].map((user) => withdrawable(user.id)));
  expect(after.map((value, index) => value - before[index]!)).toEqual([20_000n, 20_000n, 0n, 0n]);
  expect(await financeDb.bookingRevenue.findUniqueOrThrow({ where: { bookingId: paid.bookingId } })).toEqual(revenueBefore);

  // Task 26 đối soát Finance: booking không có bút toán mới (không quyết toán/hoa hồng lần hai), kèo không có
  // quyết toán booking, đúng một lần hoàn dư và đúng một bộ nhả tiền giữ; phát lại kết quả không nhả thêm.
  expect(await bookingLedger()).toEqual(bookingLedgerBefore);
  expect(await financeDb.outbox.count({ where: { aggregateId: matchId, eventType: 'PaymentCompleted' } })).toBe(0);
  expect(await financeDb.ledgerEntry.count({ where: { refType: 'matchSettlement', refId: matchId } })).toBe(0);
  expect(await financeDb.ledgerEntry.count({ where: { refType: 'matchOwnerRebalance', refId: matchId } })).toBe(2);
  const finalized = await matchDb.outbox.findFirstOrThrow({ where: { aggregateId: matchId, eventType: 'MatchResultFinalized' } });
  const payload = finalized.payload as { decisionId: string; matchId: string; outcome: 'TEAM_A_WIN'; finalizedAt: string };
  const releaseSet = () => financeDb.ledgerEntry.findMany({ where: { refType: 'matchResult', refId: { startsWith: payload.decisionId } } });
  const released = await releaseSet();
  expect(released).toHaveLength(4);
  expect(released.filter((row) => row.amount > 0n).reduce((sum, row) => sum + row.amount, 0n)).toBe(40_000n);
  const replayEventId = `e2e-replay:${randomUUID()}`;
  await handleMatchResultFinalized(replayEventId, payload);
  await financeDb.processedEvent.delete({ where: { eventId: replayEventId } });
  expect(await releaseSet()).toHaveLength(4);
  expect(await Promise.all([owner, partner, b1, b2].map((user) => withdrawable(user.id)))).toEqual(after);
});

test('3. Booking đã trả nhưng thiếu người -> tầng kèo đóng -> hoàn tiền người tham gia -> booking vẫn giữ', async ({ browser }) => {
  const owner = await seedUser('Chủ kèo thiếu người E2E');
  const player = await seedUser('Người vào kèo E2E');
  const paid = await seedPaidBooking(owner, 200_000n);
  const ownerPage = await openAs(browser, owner);
  const matchId = await createMatchViaUi(ownerPage, owner, { ratio: '5 : 5', doubles: true, paidBooking: true });
  const join = await joinViaApi(player, matchId, 'B');
  const before = await withdrawable(player.id);

  await matchDb.match.update({ where: { id: matchId }, data: { cutoffAt: new Date(Date.now() - 1_000) } });
  await cancelMatchesAtCutoff();
  await poll(() => matchDb.match.findUniqueOrThrow({ where: { id: matchId } }), (row) => row.status === 'cancelled', 'kèo đóng');
  await poll(() => financeDb.matchContribution.findUniqueOrThrow({ where: { id: join.contributionId } }), (row) => row.status === 'refunded', 'hoàn người tham gia');
  expect((await withdrawable(player.id)) - before).toBe(join.amount);
  expect(await venueDb.booking.findUniqueOrThrow({ where: { id: paid.bookingId } })).toMatchObject({ status: 'confirmed' });
  expect(await financeDb.bookingRevenue.count({ where: { bookingId: paid.bookingId } })).toBe(1);
});

/** Tạo kèo từ slot đang giữ qua API (cùng endpoint màn 01) rồi chủ kèo trả phần góp bằng số dư. */
async function createMatchViaApi(owner: User, options: { discipline?: 'singles' | 'doubles'; ratio?: '5:5' | '6:4' | '7:3'; mode?: 'friendly' | 'ranked'; startInHours?: number }) {
  const seeded = await seedVenueWithHold(owner.id, 200_000n);
  if (options.startInHours !== undefined) {
    const startAt = new Date(Date.now() + options.startInHours * HOUR);
    startAt.setUTCMinutes(0, 0, 0);
    await venueDb.hold.update({ where: { id: seeded.hold.id }, data: { startAt, endAt: new Date(startAt.getTime() + HOUR) } });
  }
  const response = await api<{ id: string; bookingId: string }>('POST', '/matchmaking/matches', owner.id, ['player'], {
    holdId: seeded.hold.id, mode: options.mode ?? 'friendly', discipline: options.discipline ?? 'singles', ratio: options.ratio ?? '5:5', format: 'bo3',
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  created.matches.push(response.body.id);
  created.bookings.push(response.body.bookingId);
  const contribution = await poll(() => financeDb.matchContribution.findUnique({ where: { contributionKey: `organizer:${response.body.id}` } }), (row) => row !== null, 'phần góp chủ kèo');
  await seedPersonalBalance(owner.id, contribution!.amount);
  const paid = await api('POST', `/finance/matches/${response.body.id}/organizer-contribution/pay/balance`, owner.id, ['player']);
  expect(paid.status, JSON.stringify(paid.body)).toBe(200);
  await poll(() => matchDb.match.findUniqueOrThrow({ where: { id: response.body.id } }), (row) => row.status === 'open', 'kèo mở');
  return { matchId: response.body.id, bookingId: response.body.bookingId, providerUser: seeded.providerUser };
}

const caseOf = (matchId: string) => matchDb.matchResultCase.findUniqueOrThrow({ where: { matchId } });
const released = (matchId: string) => poll(() => financeDb.matchFunding.findUniqueOrThrow({ where: { matchId } }), (row) => row.resultFinalizedAt !== null, 'nhả tiền giữ');

/** Chốt kết quả không tranh chấp: chủ kèo khai đội A thắng, bên thua xác nhận. */
async function finalizeUndisputed(owner: User, losers: User[], matchId: string) {
  await claimViaApi(owner, matchId, [{ teamA: 21, teamB: 15 }, { teamA: 21, teamB: 18 }]);
  for (const loser of losers) {
    const confirmed = await api('POST', `/matchmaking/matches/${matchId}/result-responses/confirm`, loser.id, ['player']);
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  }
  await released(matchId);
}

test('4. Không ai khai -> 12 giờ báo sự cố -> im lặng -> không có kết quả -> chia 50:50 -> không tính điểm', async ({ browser }) => {
  const owner = await seedUser('Chủ kèo im lặng E2E');
  const opponent = await seedUser('Đối thủ im lặng E2E');
  // Kèo xếp hạng bị chặn khi chưa khai trình độ nội dung đó; khai xong mới tạo/tham gia được.
  const unready = await seedVenueWithHold(owner.id, 200_000n);
  const refused = await api<{ error: { code: string } }>('POST', '/matchmaking/matches', owner.id, ['player'], {
    holdId: unready.hold.id, mode: 'ranked', discipline: 'singles', ratio: '6:4', format: 'bo3',
  });
  expect(refused.status).toBe(409);
  expect(refused.body.error.code).toBe('PASSPORT_REQUIRED');
  for (const user of [owner, opponent]) {
    expect((await api('PUT', '/matchmaking/passports/me/declaration', user.id, ['player'], { discipline: 'singles', tier: 'intermediate' })).status).toBe(200);
  }
  const { matchId } = await createMatchViaApi(owner, { ratio: '6:4', mode: 'ranked' });
  await joinViaApi(opponent, matchId, 'B');
  const opened = await lockAndFinish(matchId);

  await sweepResultDeadlines(new Date(opened!.declarationDeadlineAt.getTime() + 1_000), [matchId]);
  const incident = await caseOf(matchId);
  expect(incident).toMatchObject({ status: 'incident_window', outcome: 'NO_RESULT' });
  await poll(() => notificationsOf(owner.id, 'match.result.incident_window'), (rows) => rows.length === 1, 'thông báo hết hạn khai');

  const before = await Promise.all([owner, opponent].map((user) => withdrawable(user.id)));
  await sweepResultDeadlines(new Date(incident.incidentDeadlineAt!.getTime() + 1_000), [matchId]);
  expect(await caseOf(matchId)).toMatchObject({ status: 'final', outcome: 'NO_RESULT' });
  await released(matchId);
  const after = await Promise.all([owner, opponent].map((user) => withdrawable(user.id)));
  expect(after.map((value, index) => value - before[index]!)).toEqual([20_000n, 20_000n]);
  expect(await matchDb.matchRatingChange.count({ where: { matchId } })).toBe(0);

  const page = await openAs(browser, owner);
  await page.goto(`/matches/${matchId}`);
  await expect(page.getByText('Kết quả đã chốt')).toBeVisible();
  await expect(page.getByText('Không có kết quả').first()).toBeVisible();
});

test('5. Kèo xếp hạng -> điểm đơn/đôi độc lập -> chặn lặp đối thủ trong 7 ngày -> đủ điều kiện và nhóm bảng', async ({ browser }) => {
  const x = await seedUser('Tay vợt X E2E');
  const y = await seedUser('Tay vợt Y E2E');
  // Chỉ người đã khai trình độ của nội dung đó mới được tính điểm: X khai qua màn 06, Y qua API.
  const xPage = await openAs(browser, x);
  await xPage.goto('/passport');
  await xPage.getByLabel('Bậc hiện tại của bạn').selectOption('intermediate');
  await xPage.getByRole('button', { name: 'Lưu khai báo' }).click();
  await expect(xPage.getByText('Điểm đánh đơn')).toBeVisible();
  expect((await api('PUT', '/matchmaking/passports/me/declaration', y.id, ['player'], { discipline: 'singles', tier: 'intermediate' })).status).toBe(200);
  const first = await createMatchViaApi(x, { mode: 'ranked' });
  await joinViaApi(y, first.matchId, 'B');
  await lockAndFinish(first.matchId);
  await finalizeUndisputed(x, [y], first.matchId);
  const changes = await poll(() => matchDb.matchRatingChange.findMany({ where: { matchId: first.matchId } }), (rows) => rows.length === 2, 'cập nhật điểm');
  expect(changes.every((row) => row.discipline === 'singles')).toBe(true);
  expect(changes.find((row) => row.userId === x.id)!.delta).toBeGreaterThan(0);
  expect(await matchDb.passport.findUnique({ where: { userId_discipline: { userId: x.id, discipline: 'doubles' } } })).toBeNull();

  // AC-CM-24: cùng đối thủ trong 7 ngày -> vẫn chia tiền nhưng không tính điểm.
  const second = await createMatchViaApi(x, { mode: 'ranked' });
  await joinViaApi(y, second.matchId, 'B');
  await lockAndFinish(second.matchId);
  await finalizeUndisputed(x, [y], second.matchId);
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  expect(await matchDb.matchRatingChange.count({ where: { matchId: second.matchId } })).toBe(0);

  // AC-CM-28: điểm >= 1600 và đủ 5 trận hợp lệ, độ bất định thấp -> lên bảng "Từ 1.600".
  const season = await matchDb.season.findFirst({ where: { closedAt: null, startAt: { lte: new Date() }, endAt: { gt: new Date() } } });
  test.skip(!season, 'DB local chưa có kỳ xếp hạng đang chạy');
  await matchDb.passport.update({ where: { userId_discipline: { userId: x.id, discipline: 'singles' } }, data: { ratingMu: 1650, ratingRd: 80 } });
  await matchDb.seasonStat.upsert({
    where: { seasonId_userId_discipline: { seasonId: season!.id, userId: x.id, discipline: 'singles' } },
    update: { matchesPlayed: 5, provinceMatches: 5 },
    create: { seasonId: season!.id, userId: x.id, discipline: 'singles', matchesPlayed: 5, provinceMatches: 5, wins: 5 },
  });
  const page = xPage;
  await page.goto('/leaderboard');
  await expect(page.locator('tr[aria-current="true"]')).toContainText('Tay vợt X E2E');
  await shot(page, 's07-leaderboard');
  await expect(page.getByRole('button', { name: 'Từ 1.600' })).toHaveClass(/bg-brand-navy/);
  await page.goto('/passport');
  await expect(page.getByText('Đủ điều kiện lên bảng')).toBeVisible();
  await shot(page, 's06-passport');
});

test('7. Ảnh bằng chứng qua giao diện -> người ngoài không đọc được -> API công khai không lộ tiền, ngân hàng hay bằng chứng', async ({ browser }) => {
  const owner = await seedUser('Chủ kèo bằng chứng E2E');
  const opponent = await seedUser('Đối thủ bằng chứng E2E');
  const outsider = await seedUser('Người ngoài E2E');
  const { matchId } = await createMatchViaApi(owner, { ratio: '7:3' });
  await joinViaApi(opponent, matchId, 'B');
  await lockAndFinish(matchId);
  await declareViaUi(await openAs(browser, owner), matchId, [[21, 15], [21, 18]]);

  const evidence = await matchDb.resultEvidence.findFirstOrThrow({ where: { case: { matchId } } });
  const read = (user: User) => api<{ url: string }>('GET', `/matchmaking/matches/${matchId}/result-evidence/${evidence.id}/read`, user.id, ['player']);
  expect((await read(outsider)).status).toBe(403);
  const own = await read(opponent);
  expect(own.status).toBe(200);
  expect((await fetch(own.body.url)).status).toBe(200);

  // AC-CM-32: mỗi lần gửi 1-3 ảnh, mỗi người tối đa 5 ảnh trên một hồ sơ.
  const four = [...await uploadEvidence(opponent, matchId), ...await uploadEvidence(opponent, matchId), ...await uploadEvidence(opponent, matchId), ...await uploadEvidence(opponent, matchId)];
  expect((await api('POST', `/matchmaking/matches/${matchId}/result-evidence`, opponent.id, ['player'], { evidence: four })).status).toBe(400);
  expect((await api('POST', `/matchmaking/matches/${matchId}/result-evidence`, opponent.id, ['player'], { evidence: four.slice(0, 3) })).status).toBe(204);
  expect((await api('POST', `/matchmaking/matches/${matchId}/result-evidence`, opponent.id, ['player'], { evidence: four.slice(3) })).status).toBe(204);
  expect((await api('POST', `/matchmaking/matches/${matchId}/result-evidence`, opponent.id, ['player'], { evidence: await uploadEvidence(opponent, matchId) })).status).toBe(204);
  // Ảnh thứ 6 bị chặn ngay từ bước xin quyền tải lên.
  const overflow = await api<{ error: { code: string } }>('POST', `/matchmaking/matches/${matchId}/result-evidence/uploads`, opponent.id, ['player'], {
    mimeType: 'image/png', size: PNG.length, checksumSha256: createHash('sha256').update(PNG).digest('base64'),
  });
  expect(overflow.status).toBe(409);
  expect(overflow.body.error.code).toBe('RESULT_EVIDENCE_LIMIT');

  // AC-CM-35: dữ liệu công khai không chứa tiền góp, tiền hoàn, ngân hàng hay bằng chứng.
  const publicDetail = await (await fetch(`${API}/matchmaking/matches/${matchId}`)).text();
  const board = await (await fetch(`${API}/matchmaking/competition/leaderboards?discipline=singles&band=under_1600`)).text();
  const programs = await (await fetch(`${API}/matchmaking/rewards/programs`)).text();
  for (const body of [publicDetail, board, programs]) {
    expect(body).not.toMatch(/contribution|refund|bankAccount|evidence|objectKey|ratingRd/i);
  }
});

/** Chốt kèo (qua cutoff) mà chưa cho trận kết thúc. */
async function lockOnly(matchId: string) {
  await matchDb.match.update({ where: { id: matchId }, data: { cutoffAt: new Date(Date.now() - 1_000) } });
  await cancelMatchesAtCutoff();
  await poll(() => matchDb.match.findUniqueOrThrow({ where: { id: matchId } }), (row) => row.status === 'confirmed', 'kèo chốt');
  await poll(() => financeDb.matchFunding.findUniqueOrThrow({ where: { matchId } }), (row) => row.status === 'settled', 'quyết toán kèo');
}

async function adminDecide(admin: User, matchId: string, outcome: 'TEAM_A_WIN' | 'TEAM_B_WIN' | 'NO_RESULT', reason: string) {
  const preview = await api<{ preview: { caseVersion: number; previewToken: string } }>('POST', `/matchmaking/matches/${matchId}/admin-decision/preview`, admin.id, ['admin'], { outcome, reason });
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  const decided = await api('POST', `/matchmaking/matches/${matchId}/admin-decision`, admin.id, ['admin'], {
    outcome, reason, caseVersion: preview.body.preview.caseVersion, previewToken: preview.body.preview.previewToken, confirm: true,
  });
  expect(decided.status, JSON.stringify(decided.body)).toBe(201);
}

/**
 * Chương trình thưởng "nhiều trận thắng nhất" đã tới bước chờ Admin duyệt: Admin tạo + công bố qua API, rồi
 * dời khung thời gian về quá khứ và seed kết quả có điểm (trận giao lưu để không bị coi là kết quả treo).
 */
async function seedProgramAwaitingApproval(admin: User, wins: Array<[User, number]>, hoursAgo: number) {
  const season = await matchDb.season.findFirst({ where: { closedAt: null, startAt: { lte: new Date() }, endAt: { gt: new Date() } } });
  if (!season) return null;
  const startAt = new Date(Date.now() + 10 * 60_000);
  const createdProgram = await api<{ program: { id: string } }>('POST', '/matchmaking/rewards/admin/programs', admin.id, ['admin'], {
    name: `Top đánh đôi E2E ${randomUUID().slice(0, 4)}`, seasonId: season.id, criterion: 'most_wins', discipline: 'doubles', band: 'under_1600',
    scope: 'global', startAt: startAt.toISOString(), endAt: new Date(startAt.getTime() + HOUR).toISOString(),
    tiers: [{ rank: 1, amount: '300000' }, { rank: 2, amount: '100000' }, { rank: 3, amount: '50000' }],
  });
  expect(createdProgram.status, JSON.stringify(createdProgram.body)).toBe(201);
  const programId = createdProgram.body.program.id;
  created.programs.push(programId);
  expect((await api('POST', `/matchmaking/rewards/admin/programs/${programId}/publish`, admin.id, ['admin'])).status).toBe(200);
  // Khung hẹp, riêng cho từng chương trình để không lẫn kết quả seed của kịch bản/lần chạy khác.
  const windowStart = new Date(Date.now() - hoursAgo * HOUR);
  const windowEnd = new Date(windowStart.getTime() + 2 * 60_000);
  await matchDb.rewardProgram.update({ where: { id: programId }, data: { startAt: windowStart, endAt: windowEnd } });
  for (const [user, count] of wins) {
    for (let index = 0; index < count; index += 1) {
      const endAt = new Date(windowStart.getTime() + (index + 1) * 10_000);
      const match = await matchDb.match.create({
        data: {
          bookingId: randomUUID(), organizerUserId: user.id, capacity: 4, feePerSlot: 60_000n, status: 'completed', mode: 'friendly', discipline: 'doubles',
          format: 'bo3', ratio: 'five_five', cutoffAt: new Date(endAt.getTime() - 2 * HOUR), bookingPrice: 200_000n, startAt: new Date(endAt.getTime() - HOUR), endAt,
        },
      });
      created.matches.push(match.id);
      await matchDb.matchRatingChange.create({ data: { matchId: match.id, userId: user.id, discipline: 'doubles', ratingBefore: 1500, ratingAfter: 1510, delta: 10, won: true } });
    }
  }
  await sweepRewardPrograms(new Date(), [programId]);
  await poll(() => matchDb.rewardProgram.findUniqueOrThrow({ where: { id: programId } }), (row) => row.status === 'awaiting_admin_approval', 'chờ Admin duyệt');
  return programId;
}

const payoutOf = (userId: string, programId: string) => poll(
  () => financeDb.rewardPayout.findFirst({ where: { userId, programId } }), (row) => row !== null, 'khoản thưởng',
);

test('6. Chương trình thưởng -> đồng hạng chia đều -> điền thông tin trong 7 ngày -> Admin nhập mã giao dịch và chứng từ -> báo đã trả', async ({ browser }) => {
  const admin = await seedUser('Admin thưởng E2E', ['admin']);
  const [w1, w2, w3] = [await seedUser('Đồng hạng một E2E'), await seedUser('Đồng hạng hai E2E'), await seedUser('Hạng ba E2E')];
  const programId = await seedProgramAwaitingApproval(admin, [[w1, 2], [w2, 2], [w3, 1]], 3);
  test.skip(!programId, 'DB local chưa có kỳ xếp hạng đang chạy');

  // Màn 12: Admin xem danh sách do hệ thống tính (đồng hạng) rồi duyệt.
  const adminPage = await openAs(browser, admin, 'admin');
  await adminPage.goto('/admin/reward-programs');
  const program = await matchDb.rewardProgram.findUniqueOrThrow({ where: { id: programId! } });
  await adminPage.getByRole('listitem').filter({ hasText: program.name }).getByRole('button', { name: 'Duyệt kết quả' }).click();
  await shot(adminPage, 's12-programs');
  const review = adminPage.getByRole('dialog', { name: 'Duyệt danh sách nhận giải' });
  await expect(review.getByRole('row').filter({ hasText: '200.000' })).toHaveCount(2);
  await review.getByRole('button', { name: 'Duyệt và thông báo người nhận' }).click();
  await poll(() => matchDb.rewardProgram.findUniqueOrThrow({ where: { id: programId! } }), (row) => row.status === 'final', 'chương trình chốt');

  const [p1, p2, p3] = [await payoutOf(w1.id, programId!), await payoutOf(w2.id, programId!), await payoutOf(w3.id, programId!)];
  expect([p1!.amount, p2!.amount, p3!.amount]).toEqual([200_000n, 200_000n, 50_000n]);
  expect(p1!.claimDeadlineAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * HOUR);
  await poll(() => notificationsOf(w1.id, 'reward.won'), (rows) => rows.length === 1, 'thông báo trúng giải');

  // Màn 13: người nhận điền đúng bảy trường.
  const winnerPage = await openAs(browser, w1);
  await winnerPage.goto(`/rewards/${programId}`);
  await shot(winnerPage, 's08-program');
  await winnerPage.goto(`/rewards/payouts/${p1!.id}`);
  await winnerPage.getByLabel('Họ và tên').fill('Nguyen Minh Anh');
  await winnerPage.getByLabel('Email').fill('minhanh@example.test');
  await winnerPage.getByLabel('Số điện thoại').fill('0901234567');
  await winnerPage.getByLabel('Địa chỉ liên hệ').fill('12 Lê Lợi, Quận 1, TP. Hồ Chí Minh');
  await winnerPage.getByLabel('Ngân hàng').selectOption('VCB');
  await winnerPage.getByLabel('Số tài khoản').fill('0123456789');
  await winnerPage.getByLabel('Tên chủ tài khoản').fill('NGUYEN MINH ANH');
  await shot(winnerPage, 's13-payout-form');
  await winnerPage.getByRole('button', { name: 'Lưu thông tin nhận thưởng' }).click();
  await expect(winnerPage.getByText('Chờ chuyển thưởng').first()).toBeVisible();

  // Màn 14: Admin nhập mã giao dịch, tải chứng từ lên MinIO, xác nhận hai bước.
  await adminPage.goto(`/admin/reward-payouts/${p1!.id}`);
  await adminPage.getByLabel('Mã giao dịch ngân hàng').fill(`VCB${Date.now()}`);
  await adminPage.getByLabel('Tải ảnh chứng từ').setInputFiles({ name: 'chung-tu.png', mimeType: 'image/png', buffer: PNG });
  await expect(adminPage.getByText('Đã tải')).toBeVisible();
  await adminPage.getByRole('checkbox').check();
  await shot(adminPage, 's14-admin-payout');
  await adminPage.getByRole('button', { name: 'Đánh dấu đã trả thưởng' }).click();
  await adminPage.getByRole('dialog', { name: 'Xác nhận đã trả thưởng' }).getByRole('button', { name: 'Xác nhận đã trả' }).click();
  await poll(() => financeDb.rewardPayout.findUniqueOrThrow({ where: { id: p1!.id } }), (row) => row.status === 'paid', 'đã trả thưởng');
  await poll(() => notificationsOf(w1.id, 'reward.paid'), (rows) => rows.length === 1, 'thông báo đã trả');
  // UI không tạo giao dịch ví/sổ cái cho khoản thưởng trả thủ công.
  expect(await financeDb.ledgerEntry.count({ where: { refId: p1!.id } })).toBe(0);
});

test('8. Đôi: một người thua xác nhận -> đồng đội có 60 phút; báo vắng mặt trước 15 phút bị chặn, cả đội vắng thì cả đội thua', async () => {
  const [owner, partner, b1, b2] = [await seedUser('Chủ kèo đôi 8 E2E'), await seedUser('Đồng đội 8 E2E'), await seedUser('B một 8 E2E'), await seedUser('B hai 8 E2E')];
  const admin = await seedUser('Admin 8 E2E', ['admin']);
  const { matchId } = await createMatchViaApi(owner, { discipline: 'doubles', ratio: '6:4' });
  await joinViaApi(partner, matchId, 'A');
  await joinViaApi(b1, matchId, 'B');
  await joinViaApi(b2, matchId, 'B');
  await lockAndFinish(matchId);
  await claimViaApi(owner, matchId, [{ teamA: 21, teamB: 15 }, { teamA: 21, teamB: 18 }]);
  expect((await api('POST', `/matchmaking/matches/${matchId}/result-responses/confirm`, b1.id, ['player'])).status).toBe(200);
  const grace = await caseOf(matchId);
  expect(grace.status).toBe('provisional');
  expect(Math.round((grace.teamGraceDeadlineAt!.getTime() - Date.now()) / 60_000)).toBe(60);
  await poll(() => notificationsOf(b2.id, 'match.result.confirmed_partial'), (rows) => rows.length === 1, 'thông báo đồng đội');
  await sweepResultDeadlines(new Date(grace.teamGraceDeadlineAt!.getTime() + 1_000), [matchId]);
  expect(await caseOf(matchId)).toMatchObject({ status: 'final', outcome: 'TEAM_A_WIN' });

  const noShow = await createMatchViaApi(owner, { discipline: 'doubles', ratio: '6:4', startInHours: 30 });
  await joinViaApi(partner, noShow.matchId, 'A');
  await joinViaApi(b1, noShow.matchId, 'B');
  await joinViaApi(b2, noShow.matchId, 'B');
  await lockOnly(noShow.matchId);
  // Kèo đã chốt nhưng chưa tới giờ: báo vắng mặt bị chặn.
  const report = async () => api<{ error?: { code: string } }>('POST', `/matchmaking/matches/${noShow.matchId}/incidents`, owner.id, ['player'], {
    type: 'no_show', description: 'Đội B không đến sân.', evidence: await uploadEvidence(owner, noShow.matchId),
  });
  const early = await report();
  expect(early.status).toBe(409);
  expect(early.body.error!.code).toBe('RESULT_NO_SHOW_TOO_EARLY');
  const startAt = new Date(Date.now() - 20 * 60_000);
  await matchDb.match.update({ where: { id: noShow.matchId }, data: { startAt, endAt: new Date(startAt.getTime() + HOUR) } });
  expect((await report()).status).toBe(201);
  // Có chủ sân: hồ sơ qua bước chủ sân trước; hết 24 giờ không đề xuất thì chuyển Admin.
  const noShowCase = await caseOf(noShow.matchId);
  expect(noShowCase.status).toBe('provider_review');
  await sweepResultReviews(new Date(noShowCase.providerDeadlineAt!.getTime() + 1_000), [noShow.matchId]);
  const before = await Promise.all([owner, partner, b1, b2].map((user) => withdrawable(user.id)));
  await adminDecide(admin, noShow.matchId, 'TEAM_A_WIN', 'Đội B vắng mặt cả hai người.');
  await released(noShow.matchId);
  const after = await Promise.all([owner, partner, b1, b2].map((user) => withdrawable(user.id)));
  expect(after.map((value, index) => value - before[index]!)).toEqual([20_000n, 20_000n, 0n, 0n]);
});

test('9. Chỉ chủ kèo được nhập kết quả; đối thủ bị từ chối khai tỷ số', async () => {
  const owner = await seedUser('Chủ kèo 9 E2E');
  const opponent = await seedUser('Đối thủ 9 E2E');
  const { matchId } = await createMatchViaApi(owner, {});
  await joinViaApi(opponent, matchId, 'B');
  await lockAndFinish(matchId);
  const rejected = await api<{ error: { code: string } }>('POST', `/matchmaking/matches/${matchId}/result-claims`, opponent.id, ['player'], {
    sets: [{ teamA: 15, teamB: 21 }, { teamA: 18, teamB: 21 }], evidence: await uploadEvidence(opponent, matchId),
  });
  expect(rejected.status).toBe(403);
  expect(rejected.body.error.code).toBe('RESULT_ORGANIZER_ONLY');
  await claimViaApi(owner, matchId, [{ teamA: 21, teamB: 15 }, { teamA: 21, teamB: 18 }]);
  expect(await caseOf(matchId)).toMatchObject({ status: 'provisional', outcome: 'TEAM_A_WIN' });
});

test('10. Booking của kèo bị hủy trước khi có kết quả -> hoàn đủ tiền giữ, phần booking hoàn theo chính sách, chia 50:50', async () => {
  const owner = await seedUser('Chủ kèo 10 E2E');
  const opponent = await seedUser('Đối thủ 10 E2E');
  const { matchId, bookingId, providerUser } = await createMatchViaApi(owner, { ratio: '7:3' });
  await joinViaApi(opponent, matchId, 'B');
  await lockOnly(matchId);
  const funding = await financeDb.matchFunding.findUniqueOrThrow({ where: { matchId } });
  expect(funding.resultReserve).toBe(80_000n);
  const before = await Promise.all([owner, opponent].map((user) => withdrawable(user.id)));

  const cancelled = await api<{ refundPercent: number }>('POST', `/venue/providers/bookings/${bookingId}/cancel`, providerUser.id, ['provider'], { reason: 'Sân hỏng đèn, phải đóng cửa.' });
  expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
  const refundGross = 200_000n * BigInt(cancelled.body.refundPercent) / 100n;
  await poll(() => financeDb.matchContribution.findMany({ where: { matchId } }), (rows) => rows.every((row) => row.status === 'refunded'), 'hoàn tiền kèo');
  const after = await Promise.all([owner, opponent].map((user) => withdrawable(user.id)));
  const deltas = after.map((value, index) => value - before[index]!);
  expect(deltas[0]! + deltas[1]!).toBe(refundGross + 80_000n);
  expect(deltas[0]).toBe(deltas[1]);
  expect(await financeDb.ledgerEntry.count({ where: { refType: 'matchResultReserve', refId: matchId, type: 'refund' } })).toBe(1);
});

test('11. Tiền chuyển khoản tới sau khi tầng kèo đã đóng -> không cấp cho kèo, cộng vào số dư người trả đúng một lần', async () => {
  const owner = await seedUser('Chủ kèo 11 E2E');
  const payer = await seedUser('Người trả muộn E2E');
  const { matchId } = await createMatchViaApi(owner, { ratio: '5:5' });
  const join = await api<{ id: string }>('POST', `/matchmaking/matches/${matchId}/joins`, payer.id, ['player'], { teamSide: 'B' });
  expect(join.status).toBe(201);
  await poll(() => financeDb.matchContribution.findUnique({ where: { joinId: join.body.id } }), (row) => row !== null, 'phần góp');
  const intent = await api<{ matchCode: string; amount: string }>('POST', `/finance/matches/${matchId}/joins/${join.body.id}/pay/sepay`, payer.id, ['player']);
  expect(intent.status, JSON.stringify(intent.body)).toBe(201);

  await matchDb.match.update({ where: { id: matchId }, data: { cutoffAt: new Date(Date.now() - 1_000) } });
  await cancelMatchesAtCutoff();
  await poll(() => financeDb.matchFunding.findUniqueOrThrow({ where: { matchId } }), (row) => row.status === 'cancelled', 'tầng kèo đóng');

  const wallet = () => financeDb.wallet.findFirst({ where: { userId: payer.id, walletType: 'personal' } });
  const before = (await wallet()) ?? { available: 0n, withdrawable: 0n };
  const transfer = { externalRef: `e2e-${randomUUID()}`, amount: BigInt(intent.body.amount), rawRef: intent.body.matchCode };
  await handleIncomingTransfer(transfer);
  await handleIncomingTransfer(transfer);
  const after = await wallet();
  expect(after!.available - before.available).toBe(BigInt(intent.body.amount));
  expect(after!.withdrawable - before.withdrawable).toBe(BigInt(intent.body.amount));
  const contribution = await financeDb.matchContribution.findUniqueOrThrow({ where: { joinId: join.body.id } });
  expect(['paid', 'settled']).not.toContain(contribution.status);
});

test('12. Người thắng quá hạn 7 ngày bổ sung thông tin -> giải bị hủy, không chuyển cho hạng sau', async () => {
  const admin = await seedUser('Admin 12 E2E', ['admin']);
  const [w1, w2] = [await seedUser('Hạng nhất 12 E2E'), await seedUser('Hạng nhì 12 E2E')];
  const programId = await seedProgramAwaitingApproval(admin, [[w1, 2], [w2, 1]], 6);
  test.skip(!programId, 'DB local chưa có kỳ xếp hạng đang chạy');
  expect((await api('POST', `/matchmaking/rewards/admin/programs/${programId}/approve-final`, admin.id, ['admin'], { confirm: true })).status).toBe(200);
  const [first, second] = [await payoutOf(w1.id, programId!), await payoutOf(w2.id, programId!)];
  await cancelExpiredClaims(new Date(first!.claimDeadlineAt.getTime() + 1_000), [first!.id, second!.id]);
  expect(await financeDb.rewardPayout.findUniqueOrThrow({ where: { id: first!.id } })).toMatchObject({ status: 'cancelled' });
  expect(await financeDb.rewardPayout.findUniqueOrThrow({ where: { id: second!.id } })).toMatchObject({ amount: 100_000n });
  expect(await financeDb.rewardPayout.count({ where: { programId: programId! } })).toBe(2);
  await poll(() => notificationsOf(w1.id, 'reward.claim_expired'), (rows) => rows.length === 1, 'thông báo hết hạn nhận giải');
});

test('13. Admin quá hạn 48 giờ -> chỉ nhắc và gắn cờ quá hạn, không tự chốt kết quả', async ({ browser }) => {
  const owner = await seedUser('Chủ kèo 13 E2E');
  const opponent = await seedUser('Đối thủ 13 E2E');
  const admin = await seedUser('Admin 13 E2E', ['admin']);
  const { matchId } = await createMatchViaApi(owner, { ratio: '7:3' });
  await joinViaApi(opponent, matchId, 'B');
  await lockAndFinish(matchId);
  await claimViaApi(owner, matchId, [{ teamA: 21, teamB: 15 }, { teamA: 21, teamB: 18 }]);
  expect((await api('POST', `/matchmaking/matches/${matchId}/result-responses/object`, opponent.id, ['player'], {
    reason: 'Tỷ số sai.', evidence: await uploadEvidence(opponent, matchId),
  })).status).toBe(201);
  const disputed = await caseOf(matchId);
  // Chủ sân quá 24 giờ -> chuyển Admin; Admin để quá 48 giờ.
  await sweepResultReviews(new Date(disputed.providerDeadlineAt!.getTime() + 1_000), [matchId]);
  await matchDb.matchResultCase.update({ where: { id: disputed.id }, data: { adminReviewStartedAt: new Date(Date.now() - 49 * HOUR), adminNextReminderAt: new Date(Date.now() - 60_000) } });
  await sweepResultReviews(new Date(), [matchId]);
  await poll(() => notificationsOf(admin.id, 'match.result.admin_overdue'), (rows) => rows.length >= 1, 'nhắc quá hạn');
  expect((await caseOf(matchId)).status).toBe('admin_review');
  expect(await financeDb.matchFunding.findUniqueOrThrow({ where: { matchId } })).toMatchObject({ resultReserveStatus: 'locked', resultFinalizedAt: null });
  const page = await openAs(browser, admin, 'admin');
  await page.goto(`/admin/match-results?caseId=${disputed.id}`);
  await expect(page.getByText('Quá hạn 48 giờ').first()).toBeVisible();
});

test('14. Mỗi nội dung chỉ tự khai trình độ một lần; kỳ mới giữ điểm nhưng đặt lại thống kê kỳ và điều kiện lên bảng', async ({ browser }) => {
  const player = await seedUser('Người khai trình độ E2E');
  const admin = await seedUser('Admin kỳ E2E', ['admin']);
  const page = await openAs(browser, player);
  await page.goto('/passport');
  await page.getByLabel('Bậc hiện tại của bạn').selectOption('intermediate_plus');
  await page.getByRole('button', { name: 'Lưu khai báo' }).click();
  await expect(page.getByText('Điểm đánh đơn')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu khai báo' })).toHaveCount(0);
  const again = await api<{ error: { code: string } }>('PUT', '/matchmaking/passports/me/declaration', player.id, ['player'], { discipline: 'singles', tier: 'advanced' });
  expect(again.status).toBe(409);
  // Nội dung đôi vẫn được khai riêng.
  expect((await api('PUT', '/matchmaking/passports/me/declaration', player.id, ['player'], { discipline: 'doubles', tier: 'intermediate' })).status).toBe(200);

  const current = await matchDb.season.findFirst({ where: { closedAt: null, startAt: { lte: new Date() }, endAt: { gt: new Date() } } });
  test.skip(!current, 'DB local chưa có kỳ xếp hạng đang chạy');
  await matchDb.passport.update({ where: { userId_discipline: { userId: player.id, discipline: 'singles' } }, data: { ratingMu: 1580, ratingRd: 90 } });
  await matchDb.seasonStat.create({ data: { seasonId: current!.id, userId: player.id, discipline: 'singles', matchesPlayed: 6, wins: 4, provinceMatches: 6 } });
  const nextStart = current!.endAt;
  const nextSeason = await api<{ season: { id: string } }>('POST', '/matchmaking/competition/admin/seasons', admin.id, ['admin'], {
    name: `Kỳ E2E ${randomUUID().slice(0, 4)}`, startAt: nextStart.toISOString(), endAt: new Date(nextStart.getTime() + 30 * 24 * HOUR).toISOString(),
  });
  // Nếu DB local đã có kỳ kế tiếp thì dùng kỳ đó.
  const upcoming = nextSeason.status === 201
    ? nextSeason.body.season.id
    : (await matchDb.season.findFirstOrThrow({ where: { startAt: { gte: nextStart } }, orderBy: { startAt: 'asc' } })).id;
  const upcomingSeason = await matchDb.season.findUniqueOrThrow({ where: { id: upcoming } });
  const inCurrent = await getOwnPassport(player.id, new Date());
  const inNext = await getOwnPassport(player.id, new Date(upcomingSeason.startAt.getTime() + HOUR));
  expect(inCurrent.singles).toMatchObject({ rating: 1580, leaderboardVisible: true, season: { matchesPlayed: 6 } });
  expect(inNext.singles).toMatchObject({ rating: 1580, leaderboardVisible: false, season: { matchesPlayed: 0, wins: 0, currentWinStreak: 0 } });
  const seasonsPage = await openAs(browser, admin, 'admin');
  await seasonsPage.goto('/admin/seasons');
  await expect(seasonsPage.getByText('Danh sách kỳ xếp hạng')).toBeVisible();
  await shot(seasonsPage, 's11-seasons');
  if (nextSeason.status === 201) await matchDb.season.delete({ where: { id: upcoming } });
});
