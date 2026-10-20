import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient as AccountPrismaClient, UserRole } from '../services/account-service/node_modules/@prisma/client/index.js';
import { PrismaClient as VenuePrismaClient } from '../services/venue-booking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as MatchmakingPrismaClient } from '../services/matchmaking-service/node_modules/@prisma/client/index.js';
import { PrismaClient as CommunityPrismaClient } from '../services/community-service/node_modules/@prisma/client/index.js';

const accountDb = new AccountPrismaClient();
const venueDb = new VenuePrismaClient();
const matchmakingDb = new MatchmakingPrismaClient();
const communityDb = new CommunityPrismaClient();
const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-real-env';

function token(userId: string, roles: string[] = ['player']) {
  return jwt.sign({ sub: userId, roles, type: 'access' }, JWT_SECRET);
}

// Phiên FE lưu ở 'courtin.session'; loadSession() dựng lại từ accessToken/refreshToken/roles.
async function setSession(page: Page, accessToken: string) {
  const roles = (jwt.decode(accessToken) as { roles?: string[] } | null)?.roles ?? ['player'];
  await page.route('**/auth/refresh', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ accessToken, refreshToken: 'e2e-refresh-token', roles }),
  }));
  await page.addInitScript(({ tokenValue, userRoles }) => {
    localStorage.removeItem('courtin.session');
    localStorage.setItem('accessToken', tokenValue);
    localStorage.setItem('refreshToken', 'e2e-refresh-token');
    localStorage.setItem('roles', JSON.stringify(userRoles));
    localStorage.setItem('courtin.activeRole', 'player');
  }, { tokenValue: accessToken, userRoles: roles });
}

async function seedPlayer(userId: string, displayName: string) {
  await accountDb.user.create({
    data: {
      id: userId,
      email: `phase2-e2e-${userId}@example.test`,
      passwordHash: 'phase-2-e2e-session-only',
      roles: [UserRole.player],
      verified: true,
      playerProfile: { create: { displayName } },
    },
  });
}

async function seedMatchVenue(organizerUserId: string, label: string) {
  const startAt = new Date(Date.now() + 48 * 60 * 60_000);
  startAt.setMinutes(0, 0, 0);
  const endAt = new Date(startAt.getTime() + 60 * 60_000);
  const provider = await venueDb.provider.create({
    data: { userId: randomUUID(), orgName: `P2 E2E provider ${label}`, status: 'approved' },
  });
  const venue = await venueDb.venue.create({
    data: {
      providerId: provider.id,
      name: `P2 E2E Match Venue ${label}`,
      address: 'TP.HCM',
      lat: 10.7769,
      lng: 106.7009,
    },
  });
  const court = await venueDb.court.create({ data: { venueId: venue.id, name: 'Sân E2E P2' } });
  const booking = await venueDb.booking.create({
    data: {
      courtId: court.id,
      userId: organizerUserId,
      startAt,
      endAt,
      source: 'marketplace',
      status: 'held',
      priceSnapshot: 200000n,
      holdExpiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  return { booking, court, venue };
}

test.afterAll(async () => {
  await Promise.all([
    accountDb.$disconnect(),
    venueDb.$disconnect(),
    matchmakingDb.$disconnect(),
    communityDb.$disconnect(),
  ]);
});

test('HT9 P2: player khám phá kèo, gửi JOIN và nhận gợi ý AI chỉ dẫn luồng chuẩn', async ({ page }) => {
  const organizerUserId = randomUUID();
  const playerUserId = randomUUID();
  await Promise.all([
    seedPlayer(organizerUserId, 'Organizer P2 E2E'),
    seedPlayer(playerUserId, 'Player P2 E2E'),
  ]);
  const { booking, venue } = await seedMatchVenue(organizerUserId, playerUserId.slice(0, 8));
  const match = await matchmakingDb.match.create({
    data: {
      organizerUserId,
      bookingId: booking.id,
      capacity: 2,
      // Kèo miễn phí: kèo có phí cần sự kiện MatchCreated của luồng tạo kèo thật để khởi tạo chia phí.
      feePerSlot: 0n,
      skillMin: 'intermediate',
      skillMax: 'intermediate_plus',
      // Danh sách công khai chỉ hiện kèo đã cấu hình trình độ; chủ kèo đã đóng phần góp.
      skillConfiguredAt: new Date(),
      organizerContributionPaidAt: new Date(),
      startAt: booking.startAt,
      endAt: booking.endAt,
      venueId: venue.id,
      cutoffAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  });
  await matchmakingDb.passport.create({
    data: {
      userId: playerUserId,
      discipline: 'singles',
      declaredTier: 'intermediate',
      ratingMu: 1500,
      ratingRd: 350,
      ratingSigma: 0.06,
      declaredAt: new Date(),
    },
  });

  await setSession(page, token(playerUserId));
  await page.goto('/matches');
  await expect(page.getByText(venue.name)).toBeVisible();
  await page.locator(`a[href="/matches/${match.id}"]`).first().click();
  await page.waitForURL(new RegExp(`/matches/${match.id}$`));
  const joinResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/joins$/.test(response.url()));
  await page.getByRole('button', { name: 'Tham gia kèo' }).click();
  const joined = await joinResponse;
  expect(joined.ok(), await joined.text()).toBeTruthy();
  await expect.poll(async () => matchmakingDb.join.count({ where: { matchId: match.id, participantUserId: playerUserId } }))
    .toBe(1);

  // Kèo miễn phí vẫn mở hộp chọn thanh toán sau khi vào kèo; đóng lại trước khi dùng trợ lý.
  const paymentDialog = page.getByRole('dialog', { name: 'Chọn phương thức thanh toán' });
  await expect(paymentDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(paymentDialog).toBeHidden();

  // Trợ lý AI chỉ còn là bong bóng chat CSKH; yêu cầu hành động bị chặn và chỉ dẫn về luồng chuẩn.
  await page.getByRole('button', { name: 'Mở trợ lý AI' }).click();
  const assistant = page.getByRole('dialog', { name: 'Trợ lý CourtIn' });
  await assistant.getByLabel('Nhắn cho trợ lý CourtIn').fill('Hủy booking giúp tôi');
  await assistant.getByRole('button', { name: 'Gửi tin nhắn' }).click();
  await expect(assistant.getByText(/không thể tự hủy lượt đặt sân/i)).toBeVisible();
});

test('HT10 P2: player tạo bài Community rồi bình luận qua API thật', async ({ page }) => {
  const playerUserId = randomUUID();
  const body = `Bài Community P2 E2E ${playerUserId.slice(0, 8)}`;
  const comment = `Bình luận P2 E2E ${playerUserId.slice(0, 8)}`;
  await seedPlayer(playerUserId, 'Community P2 E2E');

  await setSession(page, token(playerUserId));
  await page.goto('/community');
  await page.getByText('Chia sẻ với cộng đồng...').click();
  await page.getByPlaceholder(/Bạn muốn chia sẻ điều gì/).fill(body);
  await page.getByRole('button', { name: 'Đăng bài' }).click();
  await expect(page.getByText('Đã đăng bài công khai.')).toBeVisible();
  const post = await communityDb.post.findFirstOrThrow({ where: { authorUserId: playerUserId, body } });

  await page.goto(`/community/${post!.id}`);
  await expect(page.getByText(body)).toBeVisible();
  await page.getByPlaceholder('Viết bình luận công khai...').fill(comment);
  await page.getByRole('button', { name: 'Bình luận', exact: true }).click();
  await expect(page.getByText(comment)).toBeVisible();
  await expect.poll(async () => communityDb.comment.count({ where: { postId: post!.id, authorUserId: playerUserId, body: comment } }))
    .toBe(1);
});
