# Role-Aware Notification Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a realtime in-app notification center for player, provider, and admin roles with an action-first bell popover, read state, safe navigation, preferences, and paginated history.

**Architecture:** Keep notification persistence and authenticated delivery inside `account-service`; do not add a sixth domain service. Business services publish a small shared `UserNotificationRequested` contract through their existing transactional outboxes, account-service projects it idempotently, and SSE only tells the browser to refetch the canonical REST read model.

**Tech Stack:** React 19, React Router, TypeScript, Express, Prisma/PostgreSQL, RabbitMQ/outbox, SSE, Vitest, Testing Library, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-10-role-aware-notification-center-design.md`

## Global Constraints

- Build only in-app notifications; no email, SMS, web push, mobile push, digest, deletion, export, or separate notification service.
- The popover combines all owned roles; `/notifications` filters by owned role and unread state.
- Opening the popover does not mark anything read. Opening an item or using `Đã đọc tất cả` does.
- Badge is the account-wide unread total: hidden at `0`, numeric through `99`, then `99+`.
- Default page size is `20`; maximum is `50`; ordering is `createdAt DESC, id DESC`.
- Store structured `actionKind` plus `entityId`, never an arbitrary URL. The destination API remains the authorization boundary.
- SSE payloads contain identifiers only. REST data is canonical; the client refetches after signals and reconnects.
- Default-on important groups: booking, finance, match, dispute, support/moderation, account/security. Community is default-off. Account/security cannot be disabled.
- Do not run the root Prisma migration command. Create and validate the focused account migration; apply it to the user's local database only after explicit approval.
- Keep tests focused: domain/API authorization and idempotency, main bell/read/navigation behavior, and one real event-to-SSE integration path.

---

## File Map

### Shared contract

- Modify `packages/shared/src/index.ts` — add the validated notification request event contract used by producers and account-service.
- Test `services/account-service/test/notificationContract.test.ts` — contract acceptance/rejection using the existing Vitest setup.

### Account service

- Modify `services/account-service/prisma/schema.prisma` — notification and preference read models.
- Create `services/account-service/prisma/migrations/20260910110000_notification_center/migration.sql` — focused schema migration.
- Create `services/account-service/src/domain/notifications.ts` — list/recent/read/read-all/preferences/projector operations.
- Create `services/account-service/src/routes/notifications.ts` — authenticated REST and SSE endpoints.
- Create `services/account-service/src/lib/notificationRealtime.ts` — local per-user SSE registry and invalidation broadcast.
- Modify `services/account-service/src/lib/eventConsumer.ts` — consume `UserNotificationRequested` and project it.
- Modify `services/account-service/src/app.ts` — mount the notification router through dependency injection.
- Test `services/account-service/test/notifications.test.ts` — focused domain and HTTP behavior.
- Test `services/account-service/test/notificationConsumer.test.ts` — idempotent event projection.

### Business event producers

- Modify `services/venue-booking-service/src/domain/booking.ts` — booking confirmation notifications.
- Modify `services/venue-booking-service/src/domain/cancellation.ts` — cancellation and court-change notifications.
- Modify `services/finance-service/src/domain/dispute.ts` — dispute opened/resolved notifications.
- Modify `services/matchmaking-service/src/domain/joins.ts` — join/deposit action notifications.
- Modify `services/matchmaking-service/src/domain/matchLifecycle.ts` — confirmed/cancelled match updates.
- Modify `services/community-service/src/domain/community.ts` — new ticket/reply notifications.
- Extend the nearest existing focused test beside each modified producer; do not add a browser test per event type.

### Web

- Create `apps/web/src/lib/notificationApi.ts` — REST DTOs, mutations, preferences, and authenticated SSE client.
- Create `apps/web/src/notifications/notificationRoutes.ts` — allowlisted action-to-route mapping.
- Create `apps/web/src/notifications/NotificationProvider.tsx` — recent list, unread count, refetch/debounce/reconnect state.
- Create `apps/web/src/components/NotificationBell.tsx` — standard bell, badge, popover/sheet trigger.
- Create `apps/web/src/components/NotificationPopover.tsx` — action-first recent list.
- Create `apps/web/src/components/NotificationItem.tsx` — common row and safe action behavior.
- Create `apps/web/src/pages/NotificationsPage.tsx` — filters, date groups, pagination, preferences.
- Modify `apps/web/src/components/Navbar.tsx` — place bell before avatar and coordinate open menus.
- Modify `apps/web/src/components/UserMenu.tsx` — controlled open state so bell/avatar menus exclude one another.
- Modify `apps/web/src/App.tsx` — authenticated route and provider placement inside the existing router.
- Modify `apps/web/src/pages/ProfilePage.tsx`, `apps/web/src/pages/manage/ManageCalendarPage.tsx`, and `apps/web/src/pages/admin/AdminBookingsPage.tsx` — consume a validated `booking` query and focus the referenced booking.
- Test `apps/web/src/components/NotificationBell.test.tsx` — badge, popover, read behavior, keyboard basics.
- Test `apps/web/src/pages/NotificationsPage.test.tsx` — filters, pagination, safe navigation, preferences.

---

### Task 1: Shared Event Contract and Account Notification Read Model

**Files:**
- Modify: `packages/shared/src/index.ts`
- Create: `services/account-service/test/notificationContract.test.ts`
- Modify: `services/account-service/prisma/schema.prisma`
- Create: `services/account-service/prisma/migrations/20260910110000_notification_center/migration.sql`
- Create: `services/account-service/src/domain/notifications.ts`
- Test: `services/account-service/test/notifications.test.ts`

**Interfaces:**
- Produces: `userNotificationRequestedSchema`, `UserNotificationRequestedPayload`.
- Produces: `listNotifications`, `listRecentNotifications`, `markNotificationRead`, `markAllNotificationsRead`, `getNotificationPreferences`, `saveNotificationPreferences`, `projectNotification`.
- Consumes: existing Prisma client and authenticated user id/roles.

- [ ] **Step 1: Add a failing shared-contract test**

```ts
import { describe, expect, it } from 'vitest';
import { userNotificationRequestedSchema } from '@khoaluantn/shared';

describe('UserNotificationRequested contract', () => {
  it('accepts a structured internal action and rejects arbitrary URLs', () => {
    const valid = userNotificationRequestedSchema.parse({
      recipient: { type: 'user', userId: '11111111-1111-4111-8111-111111111111', targetRole: 'provider' },
      category: 'booking', kind: 'booking.confirmed',
      title: 'Bạn vừa nhận một lịch đặt sân', body: 'Sân 2 · 19:00–20:00',
      priority: 'update', entityType: 'booking',
      entityId: '22222222-2222-4222-8222-222222222222', actionKind: 'booking.view',
    });
    expect(valid.actionKind).toBe('booking.view');
    expect(() => userNotificationRequestedSchema.parse({ ...valid, url: 'https://example.com' })).toThrow();
  });
});
```

- [ ] **Step 2: Run the contract test and confirm it fails because the schema is absent**

Run: `npm test --workspace @khoaluantn/account-service -- notificationContract.test.ts`

Expected: FAIL on the missing export.

- [ ] **Step 3: Add the minimal strict contract**

```ts
export const notificationCategories = ['booking', 'finance', 'match', 'dispute', 'support', 'security', 'community'] as const;
export const notificationActionKinds = ['booking.view', 'booking.pay', 'match.view', 'dispute.view', 'support.view', 'admin.dispute.review'] as const;
export const userNotificationRequestedSchema = z.object({
  recipient: z.discriminatedUnion('type', [
    z.object({ type: z.literal('user'), userId: z.string().uuid(), targetRole: z.enum(['player', 'provider', 'admin']) }).strict(),
    z.object({ type: z.literal('role'), targetRole: z.literal('admin') }).strict(),
  ]),
  category: z.enum(notificationCategories),
  kind: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(240),
  priority: z.enum(['action_required', 'update']),
  entityType: z.string().min(1).max(40).nullable().default(null),
  entityId: z.string().uuid().nullable().default(null),
  actionKind: z.enum(notificationActionKinds).nullable().default(null),
  actionExpiresAt: z.string().datetime().nullable().default(null),
}).strict();
export type UserNotificationRequestedPayload = z.infer<typeof userNotificationRequestedSchema>;
```

- [ ] **Step 4: Add Prisma models and the focused SQL migration**

Add `notifications Notification[]` and `notificationPreferences NotificationPreference[]` to `User`. Add enums for category/priority and models matching the spec. Use:

```prisma
model Notification {
  id              String               @id @default(uuid())
  userId          String
  user            User                 @relation(fields: [userId], references: [id])
  targetRole      UserRole
  category        NotificationCategory
  kind            String
  title           String
  body            String
  priority        NotificationPriority
  entityType      String?
  entityId        String?
  actionKind      String?
  actionExpiresAt DateTime?
  sourceEventId   String
  readAt          DateTime?
  createdAt       DateTime             @default(now())

  @@unique([sourceEventId, userId, targetRole])
  @@index([userId, createdAt, id])
  @@index([userId, readAt, createdAt])
  @@map("notifications")
}

model NotificationPreference {
  userId     String
  user       User                 @relation(fields: [userId], references: [id])
  targetRole UserRole
  category   NotificationCategory
  enabled    Boolean
  updatedAt  DateTime             @updatedAt

  @@id([userId, targetRole, category])
  @@map("notification_preferences")
}
```

The SQL migration must create only these enums, tables, foreign keys, indexes, and unique key in schema `account`; it must not edit existing rows.

- [ ] **Step 5: Add failing account-domain tests for the core rules**

Cover only these high-value cases in `notifications.test.ts`:

```ts
it('projects one notification for a replayed source event', async () => {
  await projectNotification('BookingConfirmed:event-1', payload);
  await projectNotification('BookingConfirmed:event-1', payload);
  expect(await prisma.notification.count()).toBe(1);
});

it('does not create a disabled optional category but always creates security', async () => { /* preference + two payloads */ });
it('lists only the authenticated user and marks read idempotently', async () => { /* two users */ });
it('returns 20 rows with stable newest-first pagination and account-wide unreadCount', async () => { /* 21 rows */ });
```

- [ ] **Step 6: Implement the minimal domain functions**

Use a single transaction for `projectNotification`. For `recipient.type === 'user'`, confirm that user owns `targetRole`; for the explicit `{ type: 'role', targetRole: 'admin' }` audience, query account users whose roles contain `admin` and fan out one row per admin. For every recipient, read the matching preference, skip disabled optional categories, then `upsert` on `(sourceEventId, userId, targetRole)`. `security` ignores a stored disabled value. `markNotificationRead` must update with `where: { id, userId }`; return `NOTIFICATION_NOT_FOUND` when zero rows change.

For recent ordering, fetch up to five active `action_required` rows first, then fill remaining slots with newest updates while excluding already selected ids. Do not add a ranking engine.

- [ ] **Step 7: Generate/validate and run the focused tests**

Run:

```powershell
npm run prisma:generate --workspace @khoaluantn/account-service
npm run prisma:validate --workspace @khoaluantn/account-service
npm test --workspace @khoaluantn/account-service -- notifications.test.ts
npm test --workspace @khoaluantn/account-service -- notificationContract.test.ts
```

Expected: all focused tests PASS. Do not apply the migration to the user's local database in this step.

- [ ] **Step 8: Commit the read model**

```powershell
git add packages/shared/src/index.ts services/account-service/test/notificationContract.test.ts services/account-service/prisma/schema.prisma services/account-service/prisma/migrations/20260910110000_notification_center services/account-service/src/domain/notifications.ts services/account-service/test/notifications.test.ts
git commit -m "feat(account): add notification read model"
```

---

### Task 2: Authenticated REST API and Idempotent Event Projection

**Files:**
- Create: `services/account-service/src/routes/notifications.ts`
- Modify: `services/account-service/src/app.ts`
- Modify: `services/account-service/src/lib/eventConsumer.ts`
- Create: `services/account-service/test/notificationConsumer.test.ts`
- Modify: `services/account-service/test/notifications.test.ts`

**Interfaces:**
- Consumes: Task 1 domain functions and `userNotificationRequestedSchema`.
- Produces: `/notifications`, `/notifications/recent`, `/:id/read`, `/read-all`, `/preferences` account-service endpoints.
- Produces: `handleNotificationRequested(eventId, payload)` for a testable RabbitMQ consumer boundary.

- [ ] **Step 1: Add failing HTTP tests**

Using the existing account-service token helper, assert:

```ts
await request(app).get('/notifications?page=1&pageSize=20')
  .set('Authorization', `Bearer ${token}`).expect(200);
await request(app).post(`/notifications/${otherUsersId}/read`)
  .set('Authorization', `Bearer ${token}`).expect(404);
await request(app).put('/notifications/preferences')
  .set('Authorization', `Bearer ${token}`)
  .send({ targetRole: 'player', category: 'community', enabled: true }).expect(200);
```

Also assert `401` without a token, `400` for `pageSize=51`, and `403` when filtering a role the token does not own.

- [ ] **Step 2: Implement one router with strict Zod validation**

Mount it in `createApp()` as `app.use('/notifications', notificationsRouter)`. Keep response shapes explicit:

```ts
type NotificationPage = {
  items: NotificationDto[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  unreadCount: number;
};
```

`POST /read-all` operates account-wide. Preferences accept one `{ targetRole, category, enabled }` change per request; this is sufficient for toggle UI and avoids bulk-update semantics.

- [ ] **Step 3: Extract a directly testable consumer handler**

```ts
export async function handleNotificationRequested(eventId: string, raw: unknown) {
  const payload = userNotificationRequestedSchema.parse(raw);
  return projectNotification(eventId, payload);
}
```

Bind the existing durable account queue to `UserNotificationRequested`. Keep the existing `ProviderApproved` handler unchanged. Use the message id/routing key helper already present as `sourceEventId`; acknowledge successful skips and successful creates alike.

- [ ] **Step 4: Add and run the focused consumer test**

Test valid delivery, duplicate delivery, disabled preference, and malformed payload rejection at the handler boundary. Do not boot a real broker here.

Run:

```powershell
npm test --workspace @khoaluantn/account-service -- notifications.test.ts notificationConsumer.test.ts
npm run typecheck --workspace @khoaluantn/account-service
```

Expected: PASS.

- [ ] **Step 5: Commit REST and projection**

```powershell
git add services/account-service/src/routes/notifications.ts services/account-service/src/app.ts services/account-service/src/lib/eventConsumer.ts services/account-service/test/notifications.test.ts services/account-service/test/notificationConsumer.test.ts
git commit -m "feat(account): expose notification inbox API"
```

---

### Task 3: Lightweight SSE Invalidation

**Files:**
- Create: `services/account-service/src/lib/notificationRealtime.ts`
- Modify: `services/account-service/src/routes/notifications.ts`
- Modify: `services/account-service/src/lib/eventConsumer.ts`
- Modify: `services/account-service/src/index.ts`
- Test: `services/account-service/test/notifications.test.ts`

**Interfaces:**
- Produces: `subscribeNotificationSignals(userId, response)`, `publishNotificationSignal(signal)`.
- Produces: `GET /notifications/stream` authenticated `text/event-stream`.
- Consumes: successful notification projection/read/read-all operations.

- [ ] **Step 1: Add a failing stream isolation test**

Create two authenticated stream subscribers in a small unit-testable registry, publish one signal for user A, and assert user B receives nothing. Also assert unsubscribe removes the response writer.

- [ ] **Step 2: Implement the local registry without a new dependency**

```ts
type NotificationSignal = { eventId: string; notificationId: string | null; occurredAt: string };
const clients = new Map<string, Set<Pick<Response, 'write'>>>();

export function publishNotificationSignal(userId: string, signal: NotificationSignal) {
  const frame = `id: ${signal.eventId}\nevent: notification-changed\ndata: ${JSON.stringify(signal)}\n\n`;
  for (const client of clients.get(userId) ?? []) client.write(frame);
}
```

Add heartbeat cleanup using one shared timer, not one timer per connection. The route sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `X-Accel-Buffering: no`; it removes the subscriber on request close.

- [ ] **Step 3: Reuse RabbitMQ for multi-replica fan-out**

After projection or read-state mutation, publish a small `NotificationChanged` event. Each account-service instance binds an exclusive auto-delete queue to that routing key and calls `publishNotificationSignal` locally for the matching `userId`. Keep the durable business request as `UserNotificationRequested`; the fan-out signal itself may be transient because reconnect always refetches REST.

- [ ] **Step 4: Run focused SSE/API checks**

Run:

```powershell
npm test --workspace @khoaluantn/account-service -- notifications.test.ts notificationConsumer.test.ts
npm run typecheck --workspace @khoaluantn/account-service
```

Expected: authenticated user isolation, cleanup, read/read-all signals, and typecheck PASS.

- [ ] **Step 5: Commit realtime delivery**

```powershell
git add services/account-service/src/lib/notificationRealtime.ts services/account-service/src/routes/notifications.ts services/account-service/src/lib/eventConsumer.ts services/account-service/src/index.ts services/account-service/test/notifications.test.ts
git commit -m "feat(account): stream notification invalidations"
```

---

### Task 4: Bell, Action-First Popover, History, and Preferences UI

**Files:**
- Create: `apps/web/src/lib/notificationApi.ts`
- Create: `apps/web/src/notifications/notificationRoutes.ts`
- Create: `apps/web/src/notifications/NotificationProvider.tsx`
- Create: `apps/web/src/components/NotificationBell.tsx`
- Create: `apps/web/src/components/NotificationPopover.tsx`
- Create: `apps/web/src/components/NotificationItem.tsx`
- Create: `apps/web/src/pages/NotificationsPage.tsx`
- Modify: `apps/web/src/components/Navbar.tsx`
- Modify: `apps/web/src/components/UserMenu.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/ProfilePage.tsx`
- Modify: `apps/web/src/pages/manage/ManageCalendarPage.tsx`
- Modify: `apps/web/src/pages/admin/AdminBookingsPage.tsx`
- Create: `apps/web/src/components/NotificationBell.test.tsx`
- Create: `apps/web/src/pages/NotificationsPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 REST endpoints and Task 3 SSE endpoint.
- Produces: `useNotifications()`, `resolveNotificationRoute(notification, activeRole)`, `/notifications` UI.

- [ ] **Step 1: Add failing route-mapping and bell tests**

Use representative DTOs and assert:

```ts
expect(resolveNotificationRoute({ actionKind: 'match.view', entityId: matchId }, 'player'))
  .toBe(`/matches/${matchId}`);
expect(resolveNotificationRoute({ actionKind: 'admin.dispute.review', entityId: disputeId }, 'admin'))
  .toBe(`/admin/disputes?dispute=${disputeId}`);
expect(resolveNotificationRoute({ actionKind: 'unknown', entityId: matchId }, 'player')).toBeNull();
```

Render the bell with unread counts `0`, `4`, and `120`; assert hidden, `4`, and `99+`. Assert opening the popover does not call `markRead`, clicking an item does, and `Đã đọc tất cả` calls `markAllRead`.

- [ ] **Step 2: Implement API DTOs and the safe route allowlist**

Keep all HTTP calls in `notificationApi.ts`. The route mapper uses an exhaustive switch and returns `null` by default; it never consumes a URL from the backend. Use existing routes where available:

```ts
case 'match.view': return `/matches/${entityId}`;
case 'support.view': return `/support?ticket=${entityId}`;
case 'dispute.view': return `/profile?tab=disputes&dispute=${entityId}`;
case 'admin.dispute.review': return `/admin/disputes?dispute=${entityId}`;
```

Map `booking.view` by target role: player to `/profile?tab=bookings&booking=<id>`, provider to `/manage/calendar?booking=<id>`, and admin to `/admin/bookings?booking=<id>`. Update those three existing pages to validate the UUID query value, load the booking through their current API, and open or highlight the existing booking detail UI. Do not create a new booking-detail route.

- [ ] **Step 3: Implement `NotificationProvider` with simple refetch semantics**

Expose `{ recent, unreadCount, loading, refresh, markRead, markAllRead }`. Fetch on authenticated session establishment, visibility return, and SSE `notification-changed`. Debounce bursts at 250 ms. Reconnect with delays capped at 30 seconds and refetch immediately after connection restores. Clear all notification state on logout.

Do not add Redux, React Query, a service worker, or a generic event framework.

- [ ] **Step 4: Build the approved action-first UI**

Use the standard outline bell SVG from the approved mockup. Put it before `UserMenu`. Change `UserMenu` to accept controlled props:

```ts
type UserMenuProps = { open: boolean; onOpenChange: (open: boolean) => void };
```

Navbar owns which menu is open so opening the bell closes the avatar menu and vice versa. Desktop popover is 360–400 px and shows at most five rows. Mobile uses a full-width fixed sheet. Keep the approved sections `Cần bạn xử lý` and `Mới cập nhật`.

On item click: optimistically remove its unread contribution, start `markRead`, then navigate immediately. If marking fails, `refresh()` restores server truth without blocking navigation. When no safe destination exists, mark read and keep the user in place.

- [ ] **Step 5: Add history-page tests, then implement the page**

Test only:

- role filters are limited to `session.roles`;
- unread and role filters persist in URL while pages change;
- empty/error states remain understandable;
- a preference toggle saves one category and `security` is disabled/read-only;
- pagination renders the current page and previous/next controls.

Group rendered rows by calendar day in Vietnamese without changing API ordering. Reuse existing `Button`, `SurfaceCard`, and typography tokens; no new component library or icon package.

- [ ] **Step 6: Wire route and provider**

Place `NotificationProvider` inside the existing `BrowserRouter` in `App.tsx`; `SessionProvider` already wraps `App` in `main.tsx`. Add `/notifications` under `AppLayout`; unauthenticated visits redirect to `/auth` using the existing role/auth guard pattern.

- [ ] **Step 7: Run focused frontend proof and build**

Run:

```powershell
npm test --workspace @khoaluantn/web -- NotificationBell.test.tsx NotificationsPage.test.tsx Navbar.test.tsx
npm run build --workspace @khoaluantn/web
```

Expected: focused tests and production build PASS. A bundle-size warning alone is non-blocking.

- [ ] **Step 8: Commit the notification UI**

```powershell
git add apps/web/src/lib/notificationApi.ts apps/web/src/notifications apps/web/src/components/NotificationBell.tsx apps/web/src/components/NotificationPopover.tsx apps/web/src/components/NotificationItem.tsx apps/web/src/components/Navbar.tsx apps/web/src/components/UserMenu.tsx apps/web/src/pages/NotificationsPage.tsx apps/web/src/components/NotificationBell.test.tsx apps/web/src/pages/NotificationsPage.test.tsx apps/web/src/pages/ProfilePage.tsx apps/web/src/pages/manage/ManageCalendarPage.tsx apps/web/src/pages/admin/AdminBookingsPage.tsx apps/web/src/App.tsx
git commit -m "feat(web): add role-aware notification center"
```

---

### Task 5: Connect High-Value Events for Every Role

**Files:**
- Modify the producer files listed in the File Map and their nearest focused tests.

**Interfaces:**
- Consumes: `UserNotificationRequestedPayload` from Task 1.
- Produces: durable `UserNotificationRequested` outbox events for player, provider, and admin.

- [ ] **Step 1: Add one small producer helper per service**

Each helper writes the standard event through that service's existing `writeOutbox(tx, ...)`:

```ts
await writeOutbox(tx, {
  aggregateType: 'Notification',
  aggregateId: `${payload.kind}:${payload.entityId ?? (payload.recipient.type === 'user' ? payload.recipient.userId : payload.recipient.targetRole)}`,
  eventType: 'UserNotificationRequested',
  payload,
});
```

Keep the helper local to the service; do not introduce a shared business-logic package.

- [ ] **Step 2: Cover the minimum useful event matrix**

Add notifications in the same transaction as the domain change:

| Role | Trigger | `kind` | Action |
|---|---|---|---|
| player | booking confirmed | `booking.confirmed` | `booking.view` |
| provider | new booking confirmed | `booking.received` | `booking.view` |
| player + provider | booking cancelled | `booking.cancelled` | `booking.view` |
| player | court changed | `booking.court_changed` | `booking.view` |
| player | join approved / payment required | `match.payment_required` | `match.view` with expiry |
| player | match confirmed/cancelled | `match.confirmed` / `match.cancelled` | `match.view` |
| player + provider | dispute resolved | `dispute.resolved` | `dispute.view` |
| admin | dispute opened | `dispute.opened` | `admin.dispute.review` |
| requester/admin | ticket reply or new ticket requiring action | `support.replied` / `support.opened` | `support.view` |

For user-targeted events, read a missing recipient or useful display snapshot from the entity already loaded inside the same transaction. Admin work-queue events use the explicit `{ type: 'role', targetRole: 'admin' }` audience so account-service can fan out to current admins without a synchronous cross-service lookup. Do not make synchronous cross-service calls solely to compose notification text.

- [ ] **Step 3: Add parameterized outbox assertions to existing focused tests**

For each service, extend one existing test file to assert the standard event's recipient, role, kind, action, and entity id. Do not duplicate full domain lifecycle tests.

Example:

```ts
const notice = await prisma.outbox.findFirstOrThrow({
  where: { aggregateId: `booking.received:${booking.id}:provider`, eventType: 'UserNotificationRequested' },
});
expect(notice.payload).toMatchObject({ recipient: { type: 'user', userId: providerUserId, targetRole: 'provider' }, actionKind: 'booking.view' });
```

- [ ] **Step 4: Run only the touched service tests and typechecks**

Run the exact existing test files modified in this task, then:

```powershell
npm run typecheck --workspace @khoaluantn/venue-booking-service
npm run typecheck --workspace @khoaluantn/finance-service
npm run typecheck --workspace @khoaluantn/matchmaking-service
npm run typecheck --workspace @khoaluantn/community-service
```

Expected: touched tests and typechecks PASS.

- [ ] **Step 5: Commit the event wiring**

Stage only the files changed by this task and commit:

```powershell
git commit -m "feat: publish high-value user notifications"
```

---

### Task 6: One End-to-End Realtime Proof and Documentation Closeout

**Files:**
- Create: `services/account-service/test/notificationRealtime.e2e.test.ts`
- Modify: `docs/superpowers/specs/2026-09-10-role-aware-notification-center-design.md` only if implementation reality required an approved clarification.
- Modify: this plan's progress checkboxes while executing.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: one executable proof that a real booking event reaches the correct inbox and realtime subscriber.

- [ ] **Step 1: Add one real infrastructure integration test**

Use the existing test RabbitMQ/PostgreSQL helpers to:

1. create a player, provider, venue, and booking fixture;
2. trigger the real booking-confirmed transaction;
3. wait for account-service to project `booking.received` for the provider;
4. assert a provider SSE subscriber receives `notification-changed`;
5. fetch `/notifications/recent` and assert the booking action;
6. mark it read and assert `unreadCount` becomes zero.

This is the only new real-broker notification test. Player/admin separation stays covered by fast projector/API tests.

- [ ] **Step 2: Run proportionate final proof**

After explicit approval to apply the focused account migration to the local test/development database, run:

```powershell
npm test --workspace @khoaluantn/account-service -- notificationRealtime.e2e.test.ts
npm test --workspace @khoaluantn/web -- NotificationBell.test.tsx NotificationsPage.test.tsx Navbar.test.tsx
npm run typecheck --workspace @khoaluantn/account-service
npm run build --workspace @khoaluantn/web
git diff --check
```

Expected: all commands PASS; the Vite chunk-size warning is allowed.

- [ ] **Step 3: Perform one manual browser smoke check**

Check only the approved story:

- login as a multi-role user;
- receive a new booking notification without reload;
- see the standard bell badge increment;
- open the action-first popover without clearing unread state;
- click the booking notice, confirm navigation, and confirm badge decrement;
- open `/notifications`, filter by role/unread, change page, and toggle one optional group.

Do not expand this into full regression testing of booking, finance, matchmaking, or support.

- [ ] **Step 4: Record actual validation and commit the closeout**

Update this plan with the commands actually run and any limitation. Stage only notification-related files, then commit:

```powershell
git commit -m "test: verify notification realtime flow"
```

---

## Deliberate Simplicity Choices

- One notification module inside account-service, not a new service.
- One strict shared event contract, not adapters for every historical event shape.
- REST remains canonical; SSE sends invalidation only.
- One local SSE registry and RabbitMQ fan-out, not Redis pub/sub plus Socket.IO.
- No generic workflow engine, ranking algorithm, notification templates UI, or arbitrary deep links.
- Five recent items, 20 history items per page, one-at-a-time preference updates.
- Fast focused tests per boundary plus one real-broker integration test and one short browser smoke story.
