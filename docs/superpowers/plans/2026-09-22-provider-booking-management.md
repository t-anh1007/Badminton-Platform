# Provider Booking Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-owned booking workspace that lists meaningful past, current, and future bookings and opens ownership-safe booking details in a right-side drawer.

**Architecture:** Add a focused provider-booking domain module and router beside the existing player/admin booking code, keeping ownership and visibility rules server-side. The React page treats the URL query string as filter and drawer state, uses small focused list/filter/drawer components, and refreshes through the existing data-invalidation channel without duplicating finance logic.

**Tech Stack:** Node.js 20+, TypeScript, Express, Zod, Prisma/PostgreSQL, React 19, React Router 7, Tailwind CSS v4, Vitest, Testing Library, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-22-provider-booking-management-design.md`

## Global Constraints

- Only a provider whose `userId` owns `court.venue.provider` may list or read a booking.
- Include meaningful marketplace/internal bookings; exclude unpaid, auto-expired technical holds with no cancellation reason.
- Use `Asia/Ho_Chi_Minh` date boundaries through the existing `vietnamTime` helpers.
- Do not change booking lifecycle, cancellation/refund policy, finance ledger, or payout behavior.
- Do not calculate provider revenue from `priceSnapshot`; `/manage/finance` remains the financial source of truth.
- Marketplace bookings expose only public display names; email and phone remain hidden. `guestContact` is returned only for internal bookings.
- Do not implement the mockup's illustrative export action.
- Preserve every pre-existing uncommitted file. Stage only the exact paths named by each task.
- Use the existing COURTIN tokens/components; add no dependency or visual token.

## File Structure

- Create `services/venue-booking-service/src/domain/providerBooking.ts`: provider-scoped visibility, filtering, summary, enrichment, and detail projection.
- Create `services/venue-booking-service/src/routes/providerBookings.ts`: Zod query/param validation and provider-only HTTP endpoints.
- Modify `services/venue-booking-service/src/app.ts`: mount the provider-booking router.
- Create `services/venue-booking-service/test/providerBookings.test.ts`: focused ownership, visibility, time-scope, pagination, serialization, and fallback proof.
- Modify `apps/web/src/lib/venueBookingApi.ts`: provider booking DTOs and list/detail functions.
- Create `apps/web/src/pages/manage/providerBookingView.ts`: pure query parsing, labels, badge tone, and time classification helpers.
- Create `apps/web/src/pages/manage/ProviderBookingFilters.tsx`: controlled filters and time-scope chips.
- Create `apps/web/src/pages/manage/ProviderBookingTable.tsx`: desktop table and mobile cards.
- Create `apps/web/src/pages/manage/ProviderBookingDetailDrawer.tsx`: accessible side drawer with detail/retry states.
- Create `apps/web/src/pages/manage/ManageBookingsPage.tsx`: URL state, data loading, pagination, drawer selection, and realtime refresh.
- Create `apps/web/src/pages/manage/ManageBookingsPage.test.tsx`: page, filters, pagination, drawer, privacy, recovery, and invalidation tests.
- Modify `apps/web/src/manage/ManageLayout.tsx`: sidebar item.
- Modify `apps/web/src/pages/manage/ManageOverviewPage.tsx`: dashboard shortcut.
- Modify `apps/web/src/App.tsx`: `/manage/bookings` route.
- Modify `apps/web/src/notifications/notificationRoutes.ts`: provider booking notifications target the new management page.
- Create `apps/web/src/pages/manage/ManageBookingsNavigation.test.tsx`: route-link and notification mapping proof.

---

### Task 1: Build the provider-owned booking query and HTTP contract

**Files:**
- Create: `services/venue-booking-service/test/providerBookings.test.ts`
- Create: `services/venue-booking-service/src/domain/providerBooking.ts`
- Create: `services/venue-booking-service/src/routes/providerBookings.ts`
- Modify: `services/venue-booking-service/src/app.ts`

**Interfaces:**
- Consumes: `prisma`, `AppError`, `vietnamDateStartInstant`, `vietnamDateEndExclusiveInstant`, `AccountDisplayNameClient`, `HttpAccountDisplayNameClient`, `requireAuth`, `requireRole('provider')`, and `AuthenticatedRequest`.
- Produces: `ProviderBookingFilters`, `ProviderBookingRow`, `ProviderBookingDetail`, `listProviderBookings(userId, input, accountClient?)`, `getProviderBookingDetail(userId, bookingId, accountClient?)`, `GET /providers/me/bookings`, and `GET /providers/me/bookings/:id`.

- [ ] **Step 1: Write ownership and visibility failures first**

Create `test/providerBookings.test.ts` with focused fixtures and the first two HTTP tests:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createApprovedProvider, createVenueWithCourt, fakeUserId, signTestAccessToken } from './helpers.js';

const app = createApp();
afterAll(async () => prisma.$disconnect());

async function booking(courtId: string, patch: Partial<{
  userId: string | null; guestName: string | null; guestContact: string | null;
  source: 'marketplace' | 'internal'; status: 'held' | 'confirmed' | 'completed' | 'cancelled';
  startAt: Date; endAt: Date; cancellationReason: 'self' | 'provider_fault' | 'platform_admin' | null;
}> = {}) {
  const startAt = patch.startAt ?? new Date(Date.now() + 3_600_000);
  return prisma.booking.create({ data: {
    courtId,
    userId: patch.userId === undefined ? fakeUserId() : patch.userId,
    guestName: patch.guestName,
    guestContact: patch.guestContact,
    source: patch.source ?? 'marketplace',
    status: patch.status ?? 'confirmed',
    startAt,
    endAt: patch.endAt ?? new Date(startAt.getTime() + 3_600_000),
    cancellationReason: patch.cancellationReason,
    priceSnapshot: 240000n,
  } });
}

describe('provider booking management', () => {
  it('lists meaningful marketplace and internal bookings owned by the provider only', async () => {
    const owner = await createApprovedProvider();
    const other = await createApprovedProvider();
    const own = await createVenueWithCourt(owner.id);
    const foreign = await createVenueWithCourt(other.id);
    const online = await booking(own.court.id);
    const walkIn = await booking(own.court.id, { userId: null, source: 'internal', guestName: 'Khách tại quầy', guestContact: '0900000000' });
    await booking(foreign.court.id);
    await booking(own.court.id, { status: 'cancelled', cancellationReason: null });

    const response = await request(app)
      .get('/providers/me/bookings')
      .set('Authorization', `Bearer ${signTestAccessToken(owner.userId, ['player', 'provider'])}`);

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => item.id).sort()).toEqual([online.id, walkIn.id].sort());
    expect(response.body.items.find((item: { id: string }) => item.id === walkIn.id).customer)
      .toEqual({ label: 'Khách tại quầy', guestContact: '0900000000' });
  });

  it('does not reveal another provider booking through the detail endpoint', async () => {
    const owner = await createApprovedProvider();
    const other = await createApprovedProvider();
    const foreign = await createVenueWithCourt(other.id);
    const target = await booking(foreign.court.id);

    const response = await request(app)
      .get(`/providers/me/bookings/${target.id}`)
      .set('Authorization', `Bearer ${signTestAccessToken(owner.userId, ['player', 'provider'])}`);

    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain(target.id);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-route failure**

Run:

```powershell
npm run test --workspace @khoaluantn/venue-booking-service -- test/providerBookings.test.ts
```

Expected: FAIL with `404` for `/providers/me/bookings` because the router does not exist.

- [ ] **Step 3: Define exact provider booking DTOs and reusable filters**

Create `src/domain/providerBooking.ts` with these public contracts and helpers:

```ts
import type { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { vietnamDateEndExclusiveInstant, vietnamDateStartInstant } from '../lib/vietnamTime.js';
import { HttpAccountDisplayNameClient, type AccountDisplayNameClient } from '../clients/account.js';

export type ProviderBookingTimeScope = 'all' | 'past' | 'current' | 'future';
export interface ProviderBookingFilters {
  query?: string; venueId?: string; courtId?: string; status?: BookingStatus;
  timeScope: ProviderBookingTimeScope; from?: Date; to?: Date; page: number; pageSize: number;
}
export interface ProviderBookingRow {
  id: string; source: 'marketplace' | 'internal'; status: BookingStatus;
  startAt: Date; endAt: Date; priceSnapshot: string; holdExpiresAt: Date | null;
  cancellationReason: 'self' | 'provider_fault' | 'platform_admin' | null;
  matchDepositPaid: boolean;
  customer: { label: string; guestContact?: string };
  court: { id: string; name: string; venue: { id: string; name: string; address: string } };
}
export interface ProviderBookingDetail extends ProviderBookingRow {
  cancellationRefundPercent: number | null;
  courtChangedAt: Date | null;
}

const visibleBookingWhere = (paidMatchHoldIds: string[]): Prisma.BookingWhereInput => ({
  OR: [
    { status: { in: ['confirmed', 'completed'] } },
    { status: 'cancelled', cancellationReason: { not: null } },
    ...(paidMatchHoldIds.length ? [{ status: 'held' as const, holdId: { in: paidMatchHoldIds } }] : []),
  ],
});

const timeWhere = (scope: ProviderBookingTimeScope, now: Date): Prisma.BookingWhereInput => {
  if (scope === 'past') return { endAt: { lte: now } };
  if (scope === 'current') return { startAt: { lte: now }, endAt: { gt: now }, status: { not: 'cancelled' } };
  if (scope === 'future') return { startAt: { gt: now }, status: { not: 'cancelled' } };
  return {};
};
```

Add a private `baseWhere(userId, input, paidMatchHoldIds)` that always starts with:

```ts
const clauses: Prisma.BookingWhereInput[] = [
  { court: { venue: { provider: { userId } } } },
  visibleBookingWhere(paidMatchHoldIds),
];
```

Use this complete filter builder. Keep `timeScope` separate so summary counts use all other filters without narrowing to one chip:

```ts
function baseWhere(userId: string, input: ProviderBookingFilters, paidMatchHoldIds: string[]): Prisma.BookingWhereInput {
  const clauses: Prisma.BookingWhereInput[] = [
    { court: { venue: { provider: { userId } } } },
    visibleBookingWhere(paidMatchHoldIds),
  ];
  if (input.venueId) clauses.push({ court: { venueId: input.venueId } });
  if (input.courtId) clauses.push({ courtId: input.courtId });
  if (input.status) clauses.push({ status: input.status });
  const query = input.query?.trim();
  if (query) clauses.push({ OR: [
    { id: { contains: query, mode: 'insensitive' } },
    { guestName: { contains: query, mode: 'insensitive' } },
    { court: { name: { contains: query, mode: 'insensitive' } } },
    { court: { venue: { name: { contains: query, mode: 'insensitive' } } } },
  ] });
  if (input.from || input.to) clauses.push({ startAt: {
    ...(input.from ? { gte: vietnamDateStartInstant(input.from) } : {}),
    ...(input.to ? { lt: vietnamDateEndExclusiveInstant(input.to) } : {}),
  } });
  return { AND: clauses };
}
```

- [ ] **Step 4: Implement list projection, summary, and graceful display-name enrichment**

Implement the exported list function using a single `now` snapshot, `orderBy: [{ startAt: 'desc' }, { id: 'desc' }]`, and this projection rule:

```ts
const bookingInclude = { court: { include: { venue: true } } } satisfies Prisma.BookingInclude;
type LoadedProviderBooking = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

function projectBooking(
  booking: LoadedProviderBooking,
  names: Map<string, string>,
  paidMatchHoldIds: Set<string>,
): ProviderBookingRow {
  const internal = booking.source === 'internal';
  return {
    id: booking.id,
    source: booking.source,
    status: booking.status,
    startAt: booking.startAt,
    endAt: booking.endAt,
    priceSnapshot: booking.priceSnapshot.toString(),
    holdExpiresAt: booking.holdExpiresAt,
    cancellationReason: booking.cancellationReason,
    matchDepositPaid: booking.status === 'held' && !!booking.holdId && paidMatchHoldIds.has(booking.holdId),
    customer: {
      label: internal ? (booking.guestName ?? 'Khách vãng lai') : (booking.userId ? names.get(booking.userId) ?? 'Người chơi' : 'Người chơi'),
      ...(internal && booking.guestContact ? { guestContact: booking.guestContact } : {}),
    },
    court: { id: booking.court.id, name: booking.court.name, venue: {
      id: booking.court.venue.id, name: booking.court.venue.name, address: booking.court.venue.address,
    } },
  };
}
```

Use `Promise.allSettled` or `try/catch` around `accountClient.getPublicDisplayNames`; on failure use an empty name map. Return:

```ts
return { items, total, page: input.page, pageSize: input.pageSize, summary: { all, completed, current, future } };
```

Counts use the same ownership/visibility/filter base. `current` and `future` exclude cancelled bookings exactly as specified.

- [ ] **Step 5: Implement ownership-safe detail projection**

Add:

```ts
export async function getProviderBookingDetail(
  userId: string,
  bookingId: string,
  accountClient: AccountDisplayNameClient = new HttpAccountDisplayNameClient(),
): Promise<ProviderBookingDetail> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, court: { venue: { provider: { userId } } } },
    include: { court: { include: { venue: true } } },
  });
  if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);
  const paidMatchHoldIds = new Set(booking.holdId ? (await prisma.hold.findMany({
    where: { id: booking.holdId, purpose: 'match' }, select: { id: true },
  })).map((hold) => hold.id) : []);
  const meaningful = booking.status === 'confirmed'
    || booking.status === 'completed'
    || (booking.status === 'cancelled' && booking.cancellationReason !== null)
    || (booking.status === 'held' && !!booking.holdId && paidMatchHoldIds.has(booking.holdId));
  if (!meaningful) throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);
  let names = new Map<string, string>();
  if (booking.userId) {
    try {
      const profiles = await accountClient.getPublicDisplayNames([booking.userId]);
      names = new Map(profiles.flatMap((profile) => profile.displayName ? [[profile.userId, profile.displayName]] : []));
    } catch { /* enrichment is optional */ }
  }
  return { ...projectBooking(booking, names, paidMatchHoldIds),
    cancellationRefundPercent: booking.cancellationRefundPercent,
    courtChangedAt: booking.courtChangedAt,
  };
}
```

- [ ] **Step 6: Expose validated provider-only routes**

Create `src/routes/providerBookings.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { getProviderBookingDetail, listProviderBookings } from '../domain/providerBooking.js';

export const providerBookingRouter = Router();
const querySchema = z.object({
  query: z.string().trim().max(120).optional(),
  venueId: z.string().uuid().optional(), courtId: z.string().uuid().optional(),
  status: z.enum(['held', 'confirmed', 'completed', 'cancelled']).optional(),
  timeScope: z.enum(['all', 'past', 'current', 'future']).default('all'),
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

providerBookingRouter.get('/providers/me/bookings', requireAuth, requireRole('provider'), h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  res.json(await listProviderBookings(userId, querySchema.parse(req.query)));
}));

providerBookingRouter.get('/providers/me/bookings/:id', requireAuth, requireRole('provider'), h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const userId = (req as AuthenticatedRequest).user!.id;
  res.json(await getProviderBookingDetail(userId, id));
}));
```

Mount it in `src/app.ts` beside the existing booking/calendar routers:

```ts
import { providerBookingRouter } from './routes/providerBookings.js';
app.use('/', providerBookingRouter);
```

- [ ] **Step 7: Extend the focused test across time, summary, pagination, fallback, and serialization**

Add tests with fixed relative timestamps that assert:

```ts
expect(past.body.items.every((row: { endAt: string }) => new Date(row.endAt) <= now)).toBe(true);
expect(current.body.items.map((row: { id: string }) => row.id).sort()).toEqual([active.id].sort());
expect(future.body.items.map((row: { id: string }) => row.id).sort()).toEqual([upcoming.id].sort());
expect(all.body.summary).toMatchObject({ current: 1, future: 1 });
expect(all.body.pageSize).toBe(2);
expect(typeof all.body.items[0].priceSnapshot).toBe('string');
```

Call `listProviderBookings` directly with an `AccountDisplayNameClient` that throws and assert the marketplace label is `Người chơi`. Call it with a successful stub and assert the public display name is used while `guestContact` is absent for marketplace rows.

- [ ] **Step 8: Run focused backend proof**

Run:

```powershell
npm run test --workspace @khoaluantn/venue-booking-service -- test/providerBookings.test.ts
npm run typecheck --workspace @khoaluantn/venue-booking-service
```

Expected: both commands exit 0.

- [ ] **Step 9: Commit only Task 1 files**

```powershell
git add -- services/venue-booking-service/src/domain/providerBooking.ts services/venue-booking-service/src/routes/providerBookings.ts services/venue-booking-service/src/app.ts services/venue-booking-service/test/providerBookings.test.ts
git diff --cached --check
git commit -m "feat(venue): add provider booking management API"
```

---

### Task 2: Add the frontend API contract and pure view helpers

**Files:**
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Create: `apps/web/src/pages/manage/providerBookingView.ts`
- Create: `apps/web/src/pages/manage/providerBookingView.test.ts`

**Interfaces:**
- Consumes: the Task 1 HTTP response and existing `api<T>()` helper.
- Produces: `ProviderBookingFilters`, `ProviderBookingRow`, `ProviderBookingDetail`, `ProviderBookingsResult`, `getProviderBookings`, `getProviderBookingDetail`, `readProviderBookingFilters`, `writeProviderBookingFilters`, `providerBookingStatusLabel`, and `providerBookingBadgeTone`.

- [ ] **Step 1: Write failing pure-helper tests**

Create `providerBookingView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { providerBookingBadgeTone, providerBookingStatusLabel, readProviderBookingFilters, writeProviderBookingFilters } from './providerBookingView.js';

describe('provider booking view state', () => {
  it('parses safe URL defaults and keeps supported filters', () => {
    const parsed = readProviderBookingFilters(new URLSearchParams('timeScope=future&page=3&status=confirmed&venueId=v1&junk=x'));
    expect(parsed).toEqual({ query: '', venueId: 'v1', courtId: '', status: 'confirmed', timeScope: 'future', from: '', to: '', page: 3, pageSize: 20 });
  });

  it('drops empty/default values when serializing filters', () => {
    const query = writeProviderBookingFilters({ query: '', venueId: '', courtId: '', status: '', timeScope: 'all', from: '', to: '', page: 1, pageSize: 20 });
    expect(query.toString()).toBe('');
  });

  it('maps every status to visible copy and a non-color-only badge tone', () => {
    expect(providerBookingStatusLabel('held', true)).toBe('Đã đặt cọc');
    expect(providerBookingStatusLabel('confirmed', false)).toBe('Đã xác nhận');
    expect(providerBookingBadgeTone('cancelled')).toBe('danger');
  });
});
```

- [ ] **Step 2: Run the helper test and verify the missing-module failure**

```powershell
npm run test --workspace @khoaluantn/web -- src/pages/manage/providerBookingView.test.ts
```

Expected: FAIL because `providerBookingView.ts` does not exist.

- [ ] **Step 3: Add exact API DTOs and calls**

Append to `venueBookingApi.ts`:

```ts
export type ProviderBookingTimeScope = 'all' | 'past' | 'current' | 'future';
export type ProviderBookingStatus = 'held' | 'confirmed' | 'completed' | 'cancelled';
export interface ProviderBookingFilters {
  query?: string; venueId?: string; courtId?: string; status?: ProviderBookingStatus;
  timeScope?: ProviderBookingTimeScope; from?: string; to?: string; page?: number; pageSize?: number;
}
export interface ProviderBookingRow {
  id: string; source: 'marketplace' | 'internal'; status: ProviderBookingStatus;
  startAt: string; endAt: string; priceSnapshot: string; holdExpiresAt: string | null;
  cancellationReason: 'self' | 'provider_fault' | 'platform_admin' | null;
  matchDepositPaid: boolean; customer: { label: string; guestContact?: string };
  court: { id: string; name: string; venue: { id: string; name: string; address: string } };
}
export interface ProviderBookingDetail extends ProviderBookingRow {
  cancellationRefundPercent: number | null; courtChangedAt: string | null;
}
export interface ProviderBookingsResult {
  items: ProviderBookingRow[]; total: number; page: number; pageSize: number;
  summary: { all: number; completed: number; current: number; future: number };
}

export function getProviderBookings(filters: ProviderBookingFilters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== 'all') query.set(key, String(value));
  });
  return api<ProviderBookingsResult>(`/providers/me/bookings${query.size ? `?${query}` : ''}`);
}
export const getProviderBookingDetail = (id: string) =>
  api<ProviderBookingDetail>(`/providers/me/bookings/${encodeURIComponent(id)}`);
```

- [ ] **Step 4: Implement the pure URL and label helpers**

Create `providerBookingView.ts` with a concrete page-state type and allowlists:

```ts
import type { ProviderBookingStatus, ProviderBookingTimeScope } from '../../lib/venueBookingApi.js';

export interface ProviderBookingPageFilters {
  query: string; venueId: string; courtId: string; status: '' | ProviderBookingStatus;
  timeScope: ProviderBookingTimeScope; from: string; to: string; page: number; pageSize: number;
}
const statuses = new Set(['held', 'confirmed', 'completed', 'cancelled']);
const scopes = new Set(['all', 'past', 'current', 'future']);
const positiveInt = (value: string | null, fallback: number) => {
  const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function readProviderBookingFilters(params: URLSearchParams): ProviderBookingPageFilters {
  const status = params.get('status') ?? '';
  const timeScope = params.get('timeScope') ?? 'all';
  return {
    query: params.get('query') ?? '', venueId: params.get('venueId') ?? '', courtId: params.get('courtId') ?? '',
    status: statuses.has(status) ? status as ProviderBookingStatus : '',
    timeScope: scopes.has(timeScope) ? timeScope as ProviderBookingTimeScope : 'all',
    from: params.get('from') ?? '', to: params.get('to') ?? '',
    page: positiveInt(params.get('page'), 1), pageSize: positiveInt(params.get('pageSize'), 20),
  };
}

export function writeProviderBookingFilters(filters: ProviderBookingPageFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === '' || value === 'all' || value === 1 || (key === 'pageSize' && value === 20)) continue;
    params.set(key, String(value));
  }
  return params;
}

export const providerBookingStatusLabel = (status: ProviderBookingStatus, matchDepositPaid: boolean) =>
  status === 'held' ? (matchDepositPaid ? 'Đã đặt cọc' : 'Chờ thanh toán')
    : status === 'confirmed' ? 'Đã xác nhận' : status === 'completed' ? 'Đã hoàn thành' : 'Đã hủy';
export const providerBookingBadgeTone = (status: ProviderBookingStatus): 'success' | 'warning' | 'danger' | 'neutral' =>
  status === 'completed' ? 'success' : status === 'held' ? 'warning' : status === 'cancelled' ? 'danger' : 'neutral';
```

- [ ] **Step 5: Run focused proof and commit**

```powershell
npm run test --workspace @khoaluantn/web -- src/pages/manage/providerBookingView.test.ts
npm run build --workspace @khoaluantn/web
git add -- apps/web/src/lib/venueBookingApi.ts apps/web/src/pages/manage/providerBookingView.ts apps/web/src/pages/manage/providerBookingView.test.ts
git diff --cached --check
git commit -m "feat(web): add provider booking view contract"
```

Expected: helper tests and web build exit 0.

---

### Task 3: Render the filtered booking list and responsive result views

**Files:**
- Create: `apps/web/src/pages/manage/ProviderBookingFilters.tsx`
- Create: `apps/web/src/pages/manage/ProviderBookingTable.tsx`
- Create: `apps/web/src/pages/manage/ManageBookingsPage.tsx`
- Create: `apps/web/src/pages/manage/ManageBookingsPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 DTO/API/helpers, `getMyManagedVenues`, `useSearchParams`, `useLiveDataRefresh`, `SurfaceCard`, `Badge`, `Button`, `Pagination`, `Skeleton`, and `EmptyState`.
- Produces: `ManageBookingsPage`, filter form behavior, summary cards, desktop table, mobile cards, pagination, list retry, and `onSelect(bookingId)` callback for Task 4.

- [ ] **Step 1: Write the failing page/list/filter test**

Create `ManageBookingsPage.test.tsx` with hoisted API mocks:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ManageBookingsPage } from './ManageBookingsPage.js';
import { getProviderBookings } from '../../lib/venueBookingApi.js';

vi.mock('../../lib/venueBookingApi.js', () => ({
  getMyManagedVenues: vi.fn().mockResolvedValue([{ id: 'v1', name: 'CLB Linh Xuân', courts: [{ id: 'c1', name: 'Sân 02' }] }]),
  getProviderBookings: vi.fn().mockResolvedValue({
    items: [{ id: '11111111-1111-4111-8111-111111111111', source: 'marketplace', status: 'confirmed', startAt: '2026-09-22T11:00:00.000Z', endAt: '2026-09-22T13:00:00.000Z', priceSnapshot: '240000', holdExpiresAt: null, cancellationReason: null, matchDepositPaid: false, customer: { label: 'Nguyễn Minh Anh' }, court: { id: 'c1', name: 'Sân 02', venue: { id: 'v1', name: 'CLB Linh Xuân', address: 'Thủ Đức' } } }],
    total: 1, page: 1, pageSize: 20, summary: { all: 128, completed: 96, current: 3, future: 29 },
  }),
  getProviderBookingDetail: vi.fn(),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ManageBookingsPage', () => {
  it('renders summary, provider-owned rows, and writes filters to the request', async () => {
    render(<MemoryRouter initialEntries={['/manage/bookings']}><ManageBookingsPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Quản lý booking' })).toBeVisible();
    expect(screen.getByText('128')).toBeVisible();
    expect(screen.getByText('Nguyễn Minh Anh')).toBeVisible();
    expect(screen.getByText('240.000 ₫')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Cơ sở'), { target: { value: 'v1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sắp tới' }));
    await waitFor(() => expect(getProviderBookings).toHaveBeenLastCalledWith(expect.objectContaining({ venueId: 'v1', timeScope: 'future', page: 1 })));
  });

  it('shows recoverable empty and list-error states', async () => {
    vi.mocked(getProviderBookings).mockRejectedValueOnce(new Error('Không thể tải booking.'));
    render(<MemoryRouter><ManageBookingsPage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải booking.');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the focused test and verify missing component failure**

```powershell
npm run test --workspace @khoaluantn/web -- src/pages/manage/ManageBookingsPage.test.tsx
```

Expected: FAIL because `ManageBookingsPage` does not exist.

- [ ] **Step 3: Build the controlled filters component**

Create `ProviderBookingFilters.tsx` with props:

```tsx
type Props = {
  value: ProviderBookingPageFilters;
  venues: ManagedVenue[];
  onChange: (next: ProviderBookingPageFilters) => void;
  onClear: () => void;
};
```

Use labeled `TextInput`/`SelectInput`, filter courts from the selected venue, and render these scope buttons:

```tsx
const scopes = [
  ['all', 'Tất cả'], ['past', 'Đã qua'], ['current', 'Đang diễn ra'], ['future', 'Sắp tới'],
] as const;
```

Wire controls with these exact updates, always resetting `page`:

```tsx
<TextInput aria-label="Tìm booking" value={value.query} onChange={(event) => onChange({ ...value, query: event.target.value, page: 1 })} />
<SelectInput aria-label="Cơ sở" value={value.venueId} onChange={(event) => onChange({ ...value, venueId: event.target.value, courtId: '', page: 1 })} />
<SelectInput aria-label="Sân con" value={value.courtId} onChange={(event) => onChange({ ...value, courtId: event.target.value, page: 1 })} />
<SelectInput aria-label="Trạng thái" value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as ProviderBookingPageFilters['status'], page: 1 })} />
<TextInput aria-label="Từ ngày" type="date" value={value.from} onChange={(event) => onChange({ ...value, from: event.target.value, page: 1 })} />
<TextInput aria-label="Đến ngày" type="date" value={value.to} onChange={(event) => onChange({ ...value, to: event.target.value, page: 1 })} />
{scopes.map(([timeScope, label]) => <button key={timeScope} type="button" aria-pressed={value.timeScope === timeScope} onClick={() => onChange({ ...value, timeScope, page: 1 })}>{label}</button>)}
<Button tone="secondary" onClick={onClear}>Xóa bộ lọc</Button>
```

Populate options from `venues`; the court list is `venues.find((venue) => venue.id === value.venueId)?.courts ?? []`. Do not render export.

- [ ] **Step 4: Build desktop table and mobile cards from one row contract**

Create `ProviderBookingTable.tsx`:

```tsx
type Props = { rows: ProviderBookingRow[]; onSelect: (id: string) => void };
```

Use `formatDateTimeVi`, `formatMoneyVnd`, `Badge`, and the Task 2 status helpers. Desktop renders a semantic table hidden below `md`; mobile renders cards hidden at `md` and above. Both include a real button named `Xem chi tiết booking <short-id>` so behavior does not depend on row click or color.

- [ ] **Step 5: Implement page URL state, loading, summary, and pagination**

Create `ManageBookingsPage.tsx` with these state boundaries:

```tsx
const [params, setParams] = useSearchParams();
const filters = useMemo(() => readProviderBookingFilters(params), [params]);
const [result, setResult] = useState<ProviderBookingsResult | null>(null);
const [venues, setVenues] = useState<ManagedVenue[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');

const updateFilters = (next: ProviderBookingPageFilters) => setParams(writeProviderBookingFilters(next), { replace: true });
const load = useCallback(async () => {
  setLoading(true); setError('');
  try { setResult(await getProviderBookings(filters)); }
  catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải booking.'); }
  finally { setLoading(false); }
}, [filters]);
```

Load managed venues once, load result whenever serialized filter values change, and call `useLiveDataRefresh(load)`. Render four summary cards, filter component, skeleton while initial loading, retry alert, empty state with clear-filter action, table/cards, and `Pagination` with `Math.max(1, Math.ceil(total / pageSize))`.

If a response page exceeds the last valid page, replace the URL with the last page and let the normal effect reload; never render a phantom empty page.

- [ ] **Step 6: Run page tests and commit Task 3**

```powershell
npm run test --workspace @khoaluantn/web -- src/pages/manage/ManageBookingsPage.test.tsx src/pages/manage/providerBookingView.test.ts
npm run build --workspace @khoaluantn/web
git add -- apps/web/src/pages/manage/ProviderBookingFilters.tsx apps/web/src/pages/manage/ProviderBookingTable.tsx apps/web/src/pages/manage/ManageBookingsPage.tsx apps/web/src/pages/manage/ManageBookingsPage.test.tsx
git diff --cached --check
git commit -m "feat(web): add provider booking list"
```

Expected: focused tests and build exit 0.

---

### Task 4: Add the accessible detail drawer and deep-link state

**Files:**
- Create: `apps/web/src/pages/manage/ProviderBookingDetailDrawer.tsx`
- Modify: `apps/web/src/pages/manage/ManageBookingsPage.tsx`
- Modify: `apps/web/src/pages/manage/ManageBookingsPage.test.tsx`

**Interfaces:**
- Consumes: `getProviderBookingDetail(id)`, `ProviderBookingDetail`, status helpers, formatters, and the page's `booking` query parameter.
- Produces: focus-trapped `ProviderBookingDetailDrawer`, retryable detail loading, query-addressable selected booking, privacy-safe contact display, and return-focus behavior.

- [ ] **Step 1: Add failing drawer, privacy, and recovery tests**

Extend `ManageBookingsPage.test.tsx`:

```tsx
it('opens a query-addressable drawer and hides marketplace contact data', async () => {
  const api = await import('../../lib/venueBookingApi.js');
  vi.mocked(api.getProviderBookingDetail).mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111', source: 'marketplace', status: 'confirmed',
    startAt: '2026-09-22T11:00:00.000Z', endAt: '2026-09-22T13:00:00.000Z',
    priceSnapshot: '240000', holdExpiresAt: null, cancellationReason: null,
    matchDepositPaid: false, customer: { label: 'Nguyễn Minh Anh' },
    court: { id: 'c1', name: 'Sân 02', venue: { id: 'v1', name: 'CLB Linh Xuân', address: 'Thủ Đức' } },
    cancellationRefundPercent: null, courtChangedAt: null,
  });
  render(<MemoryRouter initialEntries={['/manage/bookings']}><ManageBookingsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Xem chi tiết booking/i }));
  expect(await screen.findByRole('dialog', { name: 'Chi tiết booking' })).toBeVisible();
  expect(screen.getAllByText('CLB Linh Xuân · Sân 02').length).toBeGreaterThan(0);
  expect(screen.queryByText(/090/)).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('shows guest contact only for internal booking and retries detail errors', async () => {
  const api = await import('../../lib/venueBookingApi.js');
  vi.mocked(api.getProviderBookingDetail)
    .mockRejectedValueOnce(new Error('Không thể tải chi tiết.'))
    .mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111', source: 'internal', status: 'confirmed',
      startAt: '2026-09-22T11:00:00.000Z', endAt: '2026-09-22T13:00:00.000Z',
      priceSnapshot: '240000', holdExpiresAt: null, cancellationReason: null,
      matchDepositPaid: false, customer: { label: 'Khách tại quầy', guestContact: '0900000000' },
      court: { id: 'c1', name: 'Sân 02', venue: { id: 'v1', name: 'CLB Linh Xuân', address: 'Thủ Đức' } },
      cancellationRefundPercent: null, courtChangedAt: null,
    });
  render(<MemoryRouter initialEntries={['/manage/bookings?booking=11111111-1111-4111-8111-111111111111']}><ManageBookingsPage /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải chi tiết.');
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại chi tiết' }));
  expect(await screen.findByText('0900000000')).toBeVisible();
});
```

Replace the inline comment fixture with the full `ProviderBookingDetail` object already declared in the test file; do not use a partial object at runtime.

- [ ] **Step 2: Run tests and confirm missing drawer behavior**

```powershell
npm run test --workspace @khoaluantn/web -- src/pages/manage/ManageBookingsPage.test.tsx
```

Expected: FAIL because no detail API call or dialog exists.

- [ ] **Step 3: Create the right-side drawer with focus lifecycle**

Create `ProviderBookingDetailDrawer.tsx` with props:

```tsx
type Props = {
  bookingId: string | null;
  detail: ProviderBookingDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
};
```

Implement the same keyboard contract as `Modal`: capture the previously focused element, move focus to the close button, trap `Tab`, close on `Escape`, restore focus, and lock `document.body.style.overflow` while open. Render:

```tsx
<div className="fixed inset-0 z-[1000]" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
  <div className="absolute inset-0 bg-brand-navy/50" />
  <aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
    className="absolute inset-y-0 right-0 w-[min(100%,30rem)] overflow-y-auto border-l border-line bg-surface p-5 shadow-[var(--shadow-raised)]">
    <button ref={closeRef} type="button" aria-label="Đóng chi tiết booking" onClick={onClose}>×</button>
    <h2 id={titleId} className="text-h2">Chi tiết booking</h2>
    {loading ? <Skeleton className="mt-5 h-72" /> : error ? (
      <div className="mt-5" role="alert"><p>{error}</p><Button className="mt-3" tone="secondary" onClick={onRetry}>Thử lại chi tiết</Button></div>
    ) : detail ? <div className="mt-5 space-y-5">
      <section><p className="text-caption">Mã booking</p><p className="mt-1 break-all font-mono text-sm">{detail.id}</p><Badge className="mt-2" tone={providerBookingBadgeTone(detail.status)}>{providerBookingStatusLabel(detail.status, detail.matchDepositPaid)}</Badge></section>
      <section className="border-t border-line pt-4"><h3 className="text-h3">Thông tin ca đặt</h3><p className="mt-2 font-semibold">{detail.court.venue.name} · {detail.court.name}</p><p className="text-sm text-ink-500">{detail.court.venue.address}</p><p className="mt-2 text-sm">{formatDateTimeVi(detail.startAt)} – {formatDateTimeVi(detail.endAt)}</p><p className="mt-1 text-sm text-ink-500">{detail.source === 'internal' ? 'Booking nội bộ' : 'Đặt qua COURTIN'}</p></section>
      <section className="border-t border-line pt-4"><h3 className="text-h3">Khách hàng</h3><p className="mt-2 font-semibold">{detail.customer.label}</p>{detail.source === 'internal' && detail.customer.guestContact ? <a className="mt-2 inline-block text-sm font-semibold text-brand-navy" href={`tel:${detail.customer.guestContact}`}>{detail.customer.guestContact}</a> : null}</section>
      <section className="border-t border-line pt-4"><h3 className="text-h3">Thanh toán</h3><p className="mt-2 text-figures font-bold">{formatMoneyVnd(detail.priceSnapshot)}</p><Link className="mt-3 inline-block text-sm font-semibold text-brand-navy" to="/manage/finance">Xem đối soát tài chính →</Link></section>
    </div> : null}
  </aside>
</div>
```

For marketplace rows, never render `guestContact`. For internal rows, render it only when present. Render a `Link` to `/manage/finance` with copy **Xem đối soát tài chính**; do not derive revenue.

- [ ] **Step 4: Connect drawer selection to the `booking` query parameter**

In `ManageBookingsPage`:

```tsx
const selectedId = params.get('booking');
const selectBooking = (id: string) => {
  const next = new URLSearchParams(params); next.set('booking', id); setParams(next, { replace: true });
};
const closeBooking = () => {
  const next = new URLSearchParams(params); next.delete('booking'); setParams(next, { replace: true });
};
```

Fetch detail whenever `selectedId` changes. Validate it with a UUID regex before calling the API; invalid IDs are removed from the query. On realtime invalidation, reload list and the open detail. If detail returns not found after refresh, close the drawer and show a page-level recovery notice.

- [ ] **Step 5: Run focused drawer proof and commit**

```powershell
npm run test --workspace @khoaluantn/web -- src/pages/manage/ManageBookingsPage.test.tsx
npm run build --workspace @khoaluantn/web
git add -- apps/web/src/pages/manage/ProviderBookingDetailDrawer.tsx apps/web/src/pages/manage/ManageBookingsPage.tsx apps/web/src/pages/manage/ManageBookingsPage.test.tsx
git diff --cached --check
git commit -m "feat(web): add provider booking detail drawer"
```

Expected: tests and build exit 0.

---

### Task 5: Integrate navigation, notification deep links, and full verification

**Files:**
- Modify: `apps/web/src/manage/ManageLayout.tsx`
- Modify: `apps/web/src/pages/manage/ManageOverviewPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/notifications/notificationRoutes.ts`
- Create: `apps/web/src/pages/manage/ManageBookingsNavigation.test.tsx`

**Interfaces:**
- Consumes: `ManageBookingsPage` from Tasks 3–4 and the existing provider RoleGuard/layout.
- Produces: sidebar and dashboard access, protected `/manage/bookings` route, and provider notification deep links that open the new drawer.

- [ ] **Step 1: Write failing navigation and notification tests**

Create `ManageBookingsNavigation.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ManageLayout } from '../../manage/ManageLayout.js';
import { ManageOverviewPage } from './ManageOverviewPage.js';
import { resolveNotificationRoute } from '../../notifications/notificationRoutes.js';

describe('provider booking navigation', () => {
  it('places Quản lý booking after Lịch in the provider sidebar', () => {
    render(<MemoryRouter initialEntries={['/manage']}><Routes><Route path="/manage" element={<ManageLayout />}><Route index element={<p>Trang con</p>} /></Route></Routes></MemoryRouter>);
    const links = screen.getByRole('navigation', { name: 'Điều hướng quản trị' }).querySelectorAll('a');
    expect(Array.from(links).map((link) => link.textContent)).toEqual(['📊Tổng quan', '🏸Sân', '📅Lịch', '📋Quản lý booking', '⚠️Sự cố', '💰Tài chính']);
    expect(screen.getByRole('link', { name: /Quản lý booking/ })).toHaveAttribute('href', '/manage/bookings');
  });

  it('shows the dashboard shortcut and maps provider booking notifications to the drawer', () => {
    render(<MemoryRouter><ManageOverviewPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Quản lý booking/ })).toHaveAttribute('href', '/manage/bookings');
    expect(resolveNotificationRoute({ actionKind: 'booking.view', entityId: '11111111-1111-4111-8111-111111111111', targetRole: 'provider' }, 'provider'))
      .toBe('/manage/bookings?booking=11111111-1111-4111-8111-111111111111');
  });
});
```

- [ ] **Step 2: Run navigation tests and confirm missing links**

```powershell
npm run test --workspace @khoaluantn/web -- src/pages/manage/ManageBookingsNavigation.test.tsx
```

Expected: FAIL because the new link, shortcut, route mapping, and route do not exist.

- [ ] **Step 3: Add sidebar, overview shortcut, protected route, and notification mapping**

Apply these exact integrations:

```tsx
// ManageLayout.tsx, immediately after Lịch
{ to: '/manage/bookings', label: 'Quản lý booking', icon: '📋', end: false },
```

```tsx
// ManageOverviewPage.tsx, shortcut list
{
  to: '/manage/bookings', icon: '📋', title: 'Quản lý booking',
  description: 'Tra cứu booking đã qua, đang diễn ra và sắp tới của các cơ sở.',
  cta: 'Mở danh sách booking',
},
```

```tsx
// App.tsx
import { ManageBookingsPage } from './pages/manage/ManageBookingsPage';
// inside /manage children, after calendar
<Route path="bookings" element={<ManageBookingsPage />} />
```

```ts
// notificationRoutes.ts
case 'booking.view': return activeRole === 'provider'
  ? `/manage/bookings?booking=${item.entityId}`
  : activeRole === 'admin'
    ? `/admin/bookings?booking=${item.entityId}`
    : `/profile?tab=bookings&booking=${item.entityId}`;
```

- [ ] **Step 4: Run all focused tests**

```powershell
npm run test --workspace @khoaluantn/venue-booking-service -- test/providerBookings.test.ts
npm run test --workspace @khoaluantn/web -- src/pages/manage/providerBookingView.test.ts src/pages/manage/ManageBookingsPage.test.tsx src/pages/manage/ManageBookingsNavigation.test.tsx
```

Expected: all focused suites pass.

- [ ] **Step 5: Run proportional repository checks**

Because this task changes both service and browser contracts, run:

```powershell
npm run typecheck --workspace @khoaluantn/venue-booking-service
npm run build --workspace @khoaluantn/web
```

Expected: both commands exit 0. Do not run migrations; the design adds no schema change.

- [ ] **Step 6: Perform browser QA with provider fixtures**

Start only the already-documented local application commands after obtaining the repository-required validation consent. Verify `/manage/bookings` at desktop and mobile widths with a provider that owns marketplace/internal bookings in past/current/future states:

1. sidebar order and dashboard shortcut;
2. summary/filter/pagination URL persistence;
3. detail drawer open/close/focus return;
4. marketplace contact privacy and internal `guestContact` visibility;
5. notification deep link opens the matching drawer;
6. a mutation invalidation refreshes the list without manual reload.

Capture browser evidence under `ai-notes/` only. If executable browser QA is not authorized, report it as unattempted; do not relabel static tests as end-to-end proof.

- [ ] **Step 7: Commit only Task 5 integration files**

```powershell
git add -- apps/web/src/manage/ManageLayout.tsx apps/web/src/pages/manage/ManageOverviewPage.tsx apps/web/src/App.tsx apps/web/src/notifications/notificationRoutes.ts apps/web/src/pages/manage/ManageBookingsNavigation.test.tsx
git diff --cached --check
git commit -m "feat(web): integrate provider booking management"
```

- [ ] **Step 8: Final scope audit**

Run:

```powershell
git status --short
git log -5 --oneline
```

Confirm the implementation commits contain only the files named by this plan, all pre-existing dirty files remain preserved, no export feature exists, no marketplace phone/email is exposed, and no finance or booking-state mutation was introduced.
