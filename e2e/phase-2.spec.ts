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

async function setSession(page: Page, accessToken: string) {
  await page.addInitScript((value) => window.localStorage.setItem('accessToken', value), accessToken);
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
      feePerSlot: 100000n,
      skillMin: 'intermediate',
      skillMax: 'intermediate_plus',
      cutoffAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  });
  await matchmakingDb.passport.create({
    data: {
      userId: playerUserId,
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
  await page.locator(`a[href="/matches/${match.id}"]`).click();
  await expect(page.getByRole('heading', { name: new RegExp(venue.name) })).toBeVisible();
  await page.getByRole('button', { name: 'Gửi yêu cầu tham gia' }).click();
  await expect(page.getByText(/Đã gửi yêu cầu/)).toBeVisible();
  await expect.poll(async () => matchmakingDb.join.count({ where: { matchId: match.id, participantUserId: playerUserId, status: 'pending' } }))
    .toBe(1);

  await page.goto('/assistant');
  await expect(page.getByText(venue.name)).toBeVisible();
  await expect(page.getByText('Giải thích rút gọn', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Chat hỗ trợ' }).click();
  await page.getByPlaceholder(/Hỏi về chính sách hoặc booking/).fill('Hủy booking giúp tôi');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  await expect(page.getByText(/không thể tự hủy booking/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mở booking của tôi' })).toBeVisible();
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
