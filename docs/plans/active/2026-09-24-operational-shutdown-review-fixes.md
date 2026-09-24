# Operational Shutdown Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not delegate or spawn subagents unless the user explicitly changes that instruction.

**Goal:** Close every issue found in the 2026-09-24 review so operational shutdown is race-safe, financially accurate, available to authorized Admins, correct for match/internal bookings, and verified through the real browser and broker paths.

**Architecture:** Keep Venue as the atomic authority for physical booking state, Finance as the only authority for paid/refunded amounts, Matchmaking as the authority for match/JOIN state, and Account as the notification projection. Fix concurrency under the existing scope/court/booking advisory locks, carry late-payment completion back to the shutdown item, and query Finance through an authenticated internal API for preview-only monetary totals. Keep the existing shutdown domain module; extract only the shared cancellation payload builder needed to keep retries consistent.

**Tech Stack:** TypeScript, Node.js/Express, Prisma/PostgreSQL, RabbitMQ/outbox, React/Vite, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-operational-shutdown-design.md`

## Status

Active

## Executor Brief

Implement in the existing `codex/operational-shutdown` worktree. Read, in order:

1. `AGENTS.md`
2. `docs/WORKFLOW.md`
3. `docs/superpowers/specs/2026-09-21-operational-shutdown-design.md`
4. `docs/product/decision-log.md` entry D55
5. `docs/product/specs/court-booking.md` BOK-10
6. `docs/product/specs/finance-disputes.md` FIN-08 and BR-FIN-14
7. This plan

Do not commit, push, deploy, merge, modify production data, restart Docker, or rewrite the user's standard-ID work unless the user explicitly authorizes that operation. After code changes, perform the read-only impact scan first, report the intended test commands, and obtain approval before running tests, typechecks, builds, migrations, Playwright, or broker-based E2E.

## Global Constraints

- Preserve append-only Finance ledger behavior. Never update or delete historical ledger entries.
- Never refund a confirmed match booking to only the organizer; preserve contribution allocation.
- UUID remains the route, authorization, idempotency, and cross-service identity. `Booking.businessCode` is display/reference only.
- Client copy must use business language. Never expose raw enums, event names, retry counts, service names, `pending`, `ledger`, `outbox`, or internal error codes.
- Emergency is terminal until an explicit reactivation. Cancelled bookings, matches, JOINs, notifications, and ledger entries are never restored.
- Required shutdown/refund notifications bypass category preferences only for the approved whitelist.
- Do not alter `services/venue-booking-service/prisma/migrations/20260922100000_business_codes/` as part of these fixes. Treat it as the user's standard-ID dependency and resolve ownership separately during integration.
- Add an additive Venue migration only for the refund-completion timestamp. Do not add a global unique index for booking obligations: venue and court confirmations already serialize on shared court-schedule locks.
- Tests must use isolated test databases. Do not apply migrations to the existing local development database with migration-history drift.
- Keep fixes local to the affected business paths. Do not split modules or add abstractions unless needed to close a listed issue.

## Review Focus

1. A scheduler tick that began before a mode transition must not overwrite the newer mode or deactivate a future scheduled closure early; owned by Task 1.
2. Venue-level and court-level shutdown confirmations racing over the same booking must produce one cancellation/refund obligation; owned by Task 2.
3. A payment arriving after shutdown cancellation must credit the player, emit one completion notification, and change the player-facing status from “Chưa phát sinh thanh toán” to “Đã hoàn tiền”; owned by Task 3.
4. A locked provider must not block an Admin from taking over shutdown handling, while a non-owner/non-Admin remains forbidden; owned by Task 4.
5. Pending JOINs must be withdrawn with the cancelled match but must not receive an approved/confirmed participant notification; owned by Task 5.

## Consolidated Issue Register

| ID | Severity | Problem | User/business impact | Fix task |
|---|---|---|---|---|
| OS-01 | P1 | Scheduler calculates from a shutdown row loaded before a mode change | A court can be marked inactive too early or a newer mode can be overwritten | Task 1 |
| OS-02 | P1 | A late payment is credited by Finance but the shutdown item remains `cancelled_unpaid` | The player receives money but sees the wrong refund status and no completion notice | Task 3 |
| OS-03 | P1 | Shutdown authorization accepts only the provider owner | Admin cannot take over when the provider account is unavailable or locked | Task 4 |
| OS-04 | P2 | Venue-level and court-level shutdowns can both claim the same booking | Duplicate cancellation/refund work and false manual-attention states are possible | Task 2 |
| OS-05 | P2 | Match shutdown notification includes a pending JOIN | A person who was never approved can receive a cancellation message as if they were a participant | Task 5 |
| OS-06 | P2 | Shutdown-cancelled internal bookings lack the required provider follow-up label | The provider may not know they must contact the offline customer | Task 5 |
| OS-07 | P2 | Refund preview omits money already paid into a held match/checkout | The confirmation screen understates the provider's refund exposure | Task 6 |
| OS-08 | Maintainability | `operationalShutdown.ts` mixes authorization, preview, execution, projection, and event construction | Future edits require more care, but this does not itself change runtime behavior | Deferred by user direction; do not split modules |
| OS-09 | Maintainability | Initial and retry paths construct `BookingCancelled` separately | Retry payload can drift, including omission of the cancellation note | Task 7 |
| OS-10 | Verification | Existing evidence used a mocked/no-API frontend and lacks real browser, broker, and rollback proof | The end-to-end business result is not yet demonstrated | Task 8 |

Execute Tasks 1–6 in numeric order, Task 7 only after their behavioral tests are green, and Task 8 last. Stop and report instead of weakening an assertion if Finance allocation, migration history, or product authority differs from this plan.

---

## File Responsibility Map

| Responsibility | File |
|---|---|
| Shutdown command orchestration and transitions | `services/venue-booking-service/src/domain/operationalShutdown.ts` |
| Shared cancellation/refund event builders | `services/venue-booking-service/src/domain/operationalShutdownEvents.ts` |
| Venue-to-Finance preview client | `services/venue-booking-service/src/clients/finance.ts` |
| Finance preview endpoint/domain query | `services/finance-service/src/routes/internalShutdown.ts`, `services/finance-service/src/domain/shutdownPreview.ts` |
| Match cancellation recipients/state | `services/matchmaking-service/src/lib/matchLifecycleEventConsumer.ts` |
| Provider/Admin/player UI | existing Web pages/components listed in Tasks 4–6 |

## Task 1: Make Scheduler Refresh Linearizable With Mode Changes

**Findings closed:** P1 stale scheduler snapshot; premature `inactive` state.

**Files:**

- Modify: `services/venue-booking-service/src/domain/operationalShutdown.ts`
- Test: `services/venue-booking-service/test/operationalShutdown.test.ts`

**Interfaces:**

- Produces: `refreshOperationalShutdownStatus(shutdownId: string, now?: Date): Promise<void>`
- Preserves: `refreshOperationalShutdownStatuses(now?: Date): Promise<void>` as the scheduler entry point.

- [ ] **Step 1: Add the failing transition-refresh test**

Add a test that creates `winding_down`, transitions the same aggregate to a future `scheduled_close`, invokes the single-shutdown refresh function, and proves the newer state is preserved:

```ts
it('does not let a stale refresh deactivate a newer future scheduled close', async () => {
  const fixture = await createBookingFixture(
    new Date(Date.now() + 48 * 60 * 60_000),
    new Date(Date.now() + 49 * 60 * 60_000),
  );
  const winding = { mode: 'winding_down' as const };
  const first = await previewOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, winding);
  const created = await confirmOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, winding, first.previewToken);

  const closeDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const scheduled = { mode: 'scheduled_close' as const, closeDate };
  const second = await previewOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, scheduled);
  await confirmOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, scheduled, second.previewToken);

  await refreshOperationalShutdownStatus(created.shutdown.id, new Date());

  expect(await prisma.operationalShutdown.findUniqueOrThrow({ where: { id: created.shutdown.id } }))
    .toMatchObject({ mode: 'scheduled_close', operationalStatus: 'scheduled_close' });
  expect((await prisma.court.findUniqueOrThrow({ where: { id: fixture.court.id } })).active).toBe(true);
});
```

Use the final `ShutdownActor` type from Task 4 when implementing; until Task 4 lands, keep the current `userId` call shape and update this test in Task 4.

- [ ] **Step 2: Implement refresh under the same lock order as confirmation**

Change the bulk function to list only IDs. For each ID, open a transaction, load the current row, acquire the immutable scope lock, reload the row, acquire sorted court locks, then calculate status from the reloaded row:

```ts
export async function refreshOperationalShutdownStatus(shutdownId: string, now = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const initial = await tx.operationalShutdown.findUnique({ where: { id: shutdownId } });
    if (!initial || initial.endedAt) return;
    await lockShutdownScope(tx, { type: initial.scopeType, id: initial.scopeId });
    const current = await tx.operationalShutdown.findUnique({ where: { id: shutdownId } });
    if (!current || current.endedAt) return;
    const courtIds = await courtIdsForScope(tx, { type: current.scopeType, id: current.scopeId });
    for (const courtId of courtIds.sort()) await lockCourtSchedule(tx, courtId);
    const itemStatuses = await tx.operationalShutdownItem.findMany({
      where: { shutdownId: current.id },
      select: { status: true },
    });
    const resolutionStatus = resolutionStatusFor(itemStatuses);
    const operationalStatus = await operationalStatusFor(tx, current, courtIds, now);
    if (operationalStatus === 'inactive' && current.operationalStatus !== 'inactive') {
      await tx.court.updateMany({ where: { id: { in: courtIds } }, data: { active: false } });
    }
    await tx.operationalShutdown.updateMany({
      where: {
        id: current.id,
        endedAt: null,
        mode: current.mode,
        modeStartedAt: current.modeStartedAt,
      },
      data: { resolutionStatus, operationalStatus },
    });
  });
}

export async function refreshOperationalShutdownStatuses(now = new Date()): Promise<void> {
  const ids = await prisma.operationalShutdown.findMany({
    where: { endedAt: null },
    select: { id: true },
  });
  for (const { id } of ids) await refreshOperationalShutdownStatus(id, now);
}
```

Do not update a row by ID alone after computing state. Include `endedAt: null`, `mode`, and `modeStartedAt` in the update predicate or rely on the held scope/court locks plus the reloaded row.

- [ ] **Step 3: Perform the task gate**

After approval to test:

```powershell
npm test --workspace @khoaluantn/venue-booking-service -- operationalShutdown.test.ts
```

Expected: the new test and all existing operational-shutdown tests pass; a future scheduled close keeps `court.active=true` until its cutoff.

## Task 2: Deduplicate Overlapping Venue/Court Shutdown Obligations

**Findings closed:** P2 duplicate items and false `needs_attention` for overlapping scopes.

**Files:**

- Modify: `services/venue-booking-service/src/domain/operationalShutdown.ts`
- Test: `services/venue-booking-service/test/operationalShutdown.test.ts`

**Interfaces:**

- Command invariant: at most one `OperationalShutdownItem` exists per `bookingId` because overlapping venue/court confirmations share court-schedule locks.
- Preview invariant: `newlyAffectedCount` counts only bookings without any shutdown item.

- [ ] **Step 1: Add the failing overlapping-scope test**

```ts
it('creates one obligation when venue and child-court shutdowns race', async () => {
  const fixture = await createBookingFixture(
    new Date(Date.now() + 2 * 60 * 60_000),
    new Date(Date.now() + 3 * 60 * 60_000),
  );
  const input = { mode: 'emergency' as const, reason: 'Sự cố vận hành' };
  const [venuePreview, courtPreview] = await Promise.all([
    previewOperationalShutdown(fixture.actor, { type: 'venue', id: fixture.venue.id }, input),
    previewOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, input),
  ]);

  await Promise.allSettled([
    confirmOperationalShutdown(fixture.actor, { type: 'venue', id: fixture.venue.id }, input, venuePreview.previewToken),
    confirmOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, input, courtPreview.previewToken),
  ]);
  await processOperationalShutdownItems(50);

  expect(await prisma.operationalShutdownItem.count({ where: { bookingId: fixture.booking.id } })).toBe(1);
  expect(await prisma.outbox.count({
    where: { aggregateId: fixture.booking.id, eventType: 'BookingCancelled' },
  })).toBe(1);
  expect(await prisma.operationalShutdownItem.count({
    where: { bookingId: fixture.booking.id, status: 'needs_attention' },
  })).toBe(0);
});
```

- [ ] **Step 2: Exclude every booking that already has a shutdown item**

Change the snapshot selection/filter from “item belonging to the current shutdown” to “any item for this booking”:

```ts
const bookings = await tx.booking.findMany({
  where: { courtId: { in: courtIds }, status: { in: ['held', 'confirmed'] }, endAt: { gt: now } },
  select: {
    id: true,
    courtId: true,
    source: true,
    status: true,
    endAt: true,
    holdPurposeSnapshot: true,
    priceSnapshot: true,
    holdId: true,
    holdExpiresAt: true,
    matchCommands: { select: { matchId: true }, take: 1 },
    shutdownItems: { select: { id: true }, take: 1 },
  },
  orderBy: { id: 'asc' },
});
const affected = effectiveAt
  ? bookings.filter((booking) => booking.endAt > effectiveAt && booking.shutdownItems.length === 0)
  : [];
```

Both confirmation paths hold the shared court-schedule locks before taking the snapshot, so an overlapping venue/court confirmation sees the first item's row and cannot enqueue it again. Keep `createMany({ skipDuplicates: true })` for same-shutdown idempotency. Do not add a schema migration for this fix.

- [ ] **Step 3: Perform the task gate**

After approval to test:

```powershell
npm test --workspace @khoaluantn/venue-booking-service -- operationalShutdown.test.ts
```

Expected: one item, one cancellation event, no false `needs_attention`.

## Task 3: Reconcile Late Payment With Shutdown Refund Completion

**Findings closed:** P1 stale `not_paid` UI, missing completion notification, completion-before-cancellation race.

**Files:**

- Modify: `services/venue-booking-service/prisma/schema.prisma`
- Create: `services/venue-booking-service/prisma/migrations/20260924121000_shutdown_refund_completion_marker/migration.sql`
- Modify: `services/venue-booking-service/src/domain/operationalShutdown.ts`
- Modify: `services/venue-booking-service/src/lib/eventConsumer.ts`
- Modify: `services/finance-service/src/domain/latePayment.ts`
- Modify: `services/finance-service/test/refund.test.ts`
- Modify: `services/venue-booking-service/test/operationalShutdown.test.ts`
- Test: `services/matchmaking-service/test/operationalShutdownLifecycle.test.ts`

**Interfaces:**

```ts
interface PaymentTooLatePayload {
  bookingId: string;
  userId: string | null;
  amount: string;
  shutdownId?: string;
  bookingBusinessCode?: string;
}
```

Database addition:

```prisma
refundCompletedAt DateTime? @db.Timestamptz(3)
```

- [ ] **Step 1: Add failing Venue tests for both event orders**

Cover these orders explicitly:

```ts
it.each(['completion-before-cancellation', 'completion-after-cancellation'] as const)(
  'projects late payment correctly for %s',
  async (order) => {
    const fixture = await createHeldCheckoutShutdownFixture();
    if (order === 'completion-before-cancellation') {
      await recordShutdownRefundCompleted(fakeUserId(), {
        bookingId: fixture.booking.id,
        shutdownId: fixture.shutdown.id,
      });
      await processOperationalShutdownItems(25, fixture.shutdown.id);
    } else {
      await processOperationalShutdownItems(25, fixture.shutdown.id);
      await recordShutdownRefundCompleted(fakeUserId(), {
        bookingId: fixture.booking.id,
        shutdownId: fixture.shutdown.id,
      });
    }
    expect(await prisma.operationalShutdownItem.findFirstOrThrow({
      where: { bookingId: fixture.booking.id },
    })).toMatchObject({ status: 'refunded' });
  },
);
```

The completion-before-cancellation branch must not prevent the booking itself from being cancelled.

- [ ] **Step 2: Persist completion independently from cancellation state**

`recordShutdownRefundCompleted` must always record `refundCompletedAt` for the matching item, but only change the status immediately when cancellation has already reached `cancelled_refund_processing`, `cancelled_unpaid`, or `needs_attention`:

```ts
await tx.operationalShutdownItem.updateMany({
  where: { shutdownId: payload.shutdownId, bookingId: payload.bookingId },
  data: { refundCompletedAt: new Date() },
});
await tx.operationalShutdownItem.updateMany({
  where: {
    shutdownId: payload.shutdownId,
    bookingId: payload.bookingId,
    status: { in: ['cancelled_refund_processing', 'cancelled_unpaid', 'needs_attention'] },
  },
  data: { status: 'refunded' },
});
```

When the processor finishes cancellation, choose `refunded` if `refundCompletedAt` is already set; otherwise retain the existing refund path status.

- [ ] **Step 3: Enrich `PaymentTooLate` and emit completion after Finance commits**

Venue must include the latest shutdown item identity and business code when present:

```ts
payload: {
  bookingId: booking.id,
  userId: booking.userId,
  amount: booking.priceSnapshot.toString(),
  ...(shutdownItem ? {
    shutdownId: shutdownItem.shutdownId,
    bookingBusinessCode: booking.businessCode,
  } : {}),
}
```

Finance keeps the existing late-payment ledger path, then writes these outbox rows in the same transaction when `shutdownId` is present:

```ts
await writeOutbox(tx, {
  aggregateType: 'Booking',
  aggregateId: payload.bookingId,
  eventType: 'BookingRefundCompleted',
  payload: { bookingId: payload.bookingId, shutdownId: payload.shutdownId },
});
await writeOutbox(tx, {
  aggregateType: 'Notification',
  aggregateId: `shutdown.late-payment-return:${payload.bookingId}:${payload.userId}`,
  eventType: 'UserNotificationRequested',
  payload: {
    recipient: { type: 'user', userId: payload.userId, targetRole: 'player' },
    category: 'finance',
    kind: 'finance.shutdown_refund_completed',
    deliveryPolicy: 'required',
    bookingBusinessCode: payload.bookingBusinessCode,
    title: 'Bạn đã nhận được tiền hoàn',
    body: `${formatMoneyForNotification(payload.amount)} đã được chuyển vào Số dư COURTIN cho lịch đặt ${payload.bookingBusinessCode}.`,
    priority: 'update',
    entityType: 'booking',
    entityId: payload.bookingId,
    actionKind: 'booking.view',
    actionExpiresAt: null,
  },
});
```

Reuse one existing VND formatter or add a small Finance-local formatter; do not show raw `200000đ` without grouping.

- [ ] **Step 4: Perform the task gate**

After approval to test:

```powershell
npm test --workspace @khoaluantn/finance-service -- refund.test.ts
npm test --workspace @khoaluantn/venue-booking-service -- operationalShutdown.test.ts
npm test --workspace @khoaluantn/matchmaking-service -- operationalShutdownLifecycle.test.ts
```

Expected: both event orders end at `refunded`; one wallet credit, one completion event, and one required completion notification exist.

## Task 4: Authorize and Expose Admin Shutdown Takeover

**Findings closed:** P1 Admin rejected as non-owner; no practical takeover surface.

**Files:**

- Modify: `services/venue-booking-service/src/domain/operationalShutdown.ts`
- Modify: `services/venue-booking-service/src/routes/operationalShutdown.ts`
- Modify: `services/venue-booking-service/src/domain/booking.ts`
- Modify: `services/venue-booking-service/src/routes/bookings.ts`
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Modify: `apps/web/src/pages/admin/AdminBookingsPage.tsx`
- Test: `services/venue-booking-service/test/operationalShutdown.test.ts`
- Test: `services/venue-booking-service/test/bookingHttp.test.ts`
- Test: `apps/web/src/pages/admin/adminCore.test.tsx`

**Interfaces:**

```ts
export type ShutdownActor = {
  userId: string;
  roles: readonly string[];
};
```

Every preview, confirm, get-status, and reactivate function consumes `ShutdownActor`, not a bare user ID.

- [ ] **Step 1: Add failing authorization tests**

```ts
it('allows Admin takeover but rejects an unrelated player', async () => {
  const fixture = await createBookingFixture(
    new Date(Date.now() + 2 * 60 * 60_000),
    new Date(Date.now() + 3 * 60 * 60_000),
  );
  const admin = { userId: fakeUserId(), roles: ['player', 'admin'] };
  const outsider = { userId: fakeUserId(), roles: ['player'] };
  const input = { mode: 'emergency' as const, reason: 'Cơ sở không thể tiếp tục phục vụ' };

  await expect(previewOperationalShutdown(outsider, { type: 'court', id: fixture.court.id }, input))
    .rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  await expect(previewOperationalShutdown(admin, { type: 'court', id: fixture.court.id }, input))
    .resolves.toMatchObject({ affectedMarketplace: 1 });
});
```

Add HTTP coverage showing an Admin JWT succeeds and a player JWT receives 403.

- [ ] **Step 2: Implement actor-aware authorization and audit**

```ts
async function authorizedCourtIds(tx: Tx, actor: ShutdownActor, scope: ShutdownScope) {
  const isAdmin = actor.roles.includes('admin');
  if (scope.type === 'court') {
    const court = await tx.court.findUnique({
      where: { id: scope.id },
      include: { venue: { include: { provider: true } } },
    });
    if (!court) throw new AppError('COURT_NOT_FOUND', 'Không tìm thấy sân.', 404);
    if (!isAdmin && court.venue.provider.userId !== actor.userId) {
      throw new AppError('FORBIDDEN_NOT_OWNER', 'Bạn không có quyền quản lý sân này.', 403);
    }
    return [court.id];
  }
  const venue = await tx.venue.findUnique({
    where: { id: scope.id },
    include: { provider: true, courts: { select: { id: true } } },
  });
  if (!venue) throw new AppError('VENUE_NOT_FOUND', 'Không tìm thấy cơ sở.', 404);
  if (!isAdmin && venue.provider.userId !== actor.userId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Bạn không có quyền quản lý cơ sở này.', 403);
  }
  return venue.courts.map((court) => court.id).sort();
}
```

Routes pass the complete authenticated principal:

```ts
const principal = (req as AuthenticatedRequest).user!;
const actor = { userId: principal.id, roles: principal.roles };
```

Keep `createdByUserId`, transition `actorUserId`, and `endedByUserId` equal to the real Admin user ID when Admin acts.

- [ ] **Step 3: Add an Admin entry point using the approved dialog**

Extend `AdminBookingRow` with court/venue IDs and business code:

```ts
interface AdminBookingRow {
  id: string;
  businessCode: string;
  status: string;
  startAt: string;
  endAt: string;
  priceSnapshot: string;
  holdExpiresAt: string | null;
  matchDepositPaid: boolean;
  player: { label: string };
  court: { id: string; name: string; venue: { id: string; name: string; address: string } };
}
```

In the Admin booking detail modal, add two business-language buttons:

```tsx
<Button onClick={() => setShutdownTarget({ scope: 'court', id: detail.court.id, label: detail.court.name })}>
  Ngừng hoạt động sân
</Button>
<Button onClick={() => setShutdownTarget({ scope: 'venue', id: detail.court.venue.id, label: detail.court.venue.name })}>
  Ngừng hoạt động cơ sở
</Button>
```

Reuse `OperationalShutdownDialog`. Do not expose an Admin-only raw endpoint form or technical statuses.

- [ ] **Step 4: Perform the task gate**

After approval to test:

```powershell
npm test --workspace @khoaluantn/venue-booking-service -- operationalShutdown.test.ts bookingHttp.test.ts
npm test --workspace @khoaluantn/web -- adminCore.test.tsx OperationalShutdownDialog.test.tsx
```

Expected: owner and Admin succeed, unrelated player fails, and the Admin UI opens the same three-step flow for the exact court or venue.

## Task 5: Correct Match Notification Audience and Internal-Booking Follow-up

**Findings closed:** P2 notification sent to pending JOIN; missing “Bạn cần tự thông báo cho khách”.

**Files:**

- Modify: `services/matchmaking-service/src/lib/matchLifecycleEventConsumer.ts`
- Test: `services/matchmaking-service/test/matches.test.ts`
- Modify: `services/venue-booking-service/src/domain/providerBooking.ts`
- Test: `services/venue-booking-service/test/providerBookings.test.ts`
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Modify: `apps/web/src/pages/manage/ProviderBookingDetailDrawer.tsx`
- Modify: `apps/web/src/pages/manage/ProviderBookingTable.tsx`
- Test: `apps/web/src/pages/manage/ManageBookingsPage.test.tsx`

**Interfaces:**

```ts
type ProviderBookingRow = {
  id: string;
  businessCode: string;
  source: 'marketplace' | 'internal';
  status: ProviderBookingStatus;
  startAt: string;
  endAt: string;
  priceSnapshot: string;
  holdExpiresAt: string | null;
  cancellationReason: 'self' | 'provider_fault' | 'platform_admin' | null;
  matchDepositPaid: boolean;
  customer: { label: string; guestContact?: string };
  court: { id: string; name: string; venue: { id: string; name: string; address: string } };
  manualCustomerNotificationRequired: boolean;
};
```

- [ ] **Step 1: Add the failing Matchmaking audience test**

Create one `pending`, one `approved`, and one `confirmed` JOIN. After shutdown cancellation assert:

```ts
expect(await prisma.join.count({
  where: { matchId, status: 'withdrawn' },
})).toBe(3);
expect(notificationRecipients).toEqual(new Set([
  organizerUserId,
  approvedUserId,
  confirmedUserId,
]));
expect(notificationRecipients.has(pendingUserId)).toBe(false);
```

- [ ] **Step 2: Separate state mutation, financial recipients, and notification recipients**

```ts
const joins = await tx.join.findMany({
  where: { matchId: match.id, status: { in: ['pending', 'approved', 'confirmed'] } },
  select: { id: true, participantUserId: true, status: true, feePaidAt: true },
});
const notificationUserIds = joins
  .filter((join) => join.status === 'approved' || join.status === 'confirmed')
  .map((join) => join.participantUserId);
const paidJoinIds = joins.filter((join) => join.feePaidAt).map((join) => join.id);
```

Withdraw all non-terminal JOINs, notify only organizer plus approved/confirmed users, and refund every paid contribution regardless of notification eligibility.

- [ ] **Step 3: Project internal shutdown follow-up to the provider UI**

Include one latest shutdown item in `bookingInclude` and project a business boolean:

```ts
const bookingInclude = {
  court: { include: { venue: true } },
  shutdownItems: { select: { id: true }, take: 1 },
} satisfies Prisma.BookingInclude;

manualCustomerNotificationRequired:
  booking.source === 'internal'
  && booking.status === 'cancelled'
  && booking.shutdownItems.length > 0,
```

Show this copy in the provider table and drawer:

```tsx
{booking.manualCustomerNotificationRequired && (
  <p className="mt-2 rounded-xl bg-brand-yellow/20 p-3 text-sm font-semibold">
    Bạn cần tự thông báo cho khách
  </p>
)}
```

Do not show the label for marketplace bookings or ordinary internal cancellations.

- [ ] **Step 4: Perform the task gate**

After approval to test:

```powershell
npm test --workspace @khoaluantn/matchmaking-service -- matches.test.ts
npm test --workspace @khoaluantn/venue-booking-service -- providerBookings.test.ts
npm test --workspace @khoaluantn/web -- ManageBookingsPage.test.tsx
```

Expected: pending JOIN withdrawn without notification; provider sees the manual-contact label only for shutdown-cancelled internal bookings.

## Task 6: Make Refund Preview Financially Complete

**Findings closed:** P2 held-match contributions omitted from “Dự kiến hoàn cho khách”; incomplete confirmation summary.

**Files:**

- Create: `services/finance-service/src/domain/shutdownPreview.ts`
- Create: `services/finance-service/src/routes/internalShutdown.ts`
- Modify: `services/finance-service/src/app.ts`
- Test: `services/finance-service/test/shutdownPreview.test.ts`
- Create: `services/venue-booking-service/src/clients/finance.ts`
- Modify: `services/venue-booking-service/src/domain/operationalShutdown.ts`
- Modify: `services/venue-booking-service/src/routes/operationalShutdown.ts`
- Test: `services/venue-booking-service/test/operationalShutdown.test.ts`
- Modify: `apps/web/src/pages/manage/OperationalShutdownDialog.tsx`
- Test: `apps/web/src/pages/manage/OperationalShutdownDialog.test.tsx`

**Interfaces:**

```ts
export interface ShutdownRefundPreviewClient {
  getPaidAmounts(bookingIds: string[]): Promise<Record<string, string>>;
}

// POST /internal/shutdown-refund-preview
type Request = { bookingIds: string[] };
type Response = { amountByBookingId: Record<string, string> };
```

- [ ] **Step 1: Add failing Finance tests for held checkout and held match amounts**

```ts
it('returns only money actually paid for held shutdown bookings', async () => {
  const result = await getShutdownRefundPreview([checkoutBookingId, matchBookingId, unpaidBookingId]);
  expect(result).toEqual({
    [checkoutBookingId]: '200000',
    [matchBookingId]: '100000',
    [unpaidBookingId]: '0',
  });
});
```

For a held checkout, use a completed `PaymentIntent`. For a held match, sum contributions currently paid/settled and not already refunded. Do not count pending/unpaid contributions.

- [ ] **Step 2: Implement the authenticated Finance boundary**

Protect the route with the existing internal-service-token pattern. Validate at most 500 UUIDs per request:

```ts
const requestSchema = z.object({
  bookingIds: z.array(z.string().uuid()).max(500),
}).strict();
```

The Venue client must send `x-internal-service-token` and parse every amount using `/^\d+$/`. Use `FINANCE_URL ?? FINANCE_SERVICE_URL ?? 'http://localhost:3003'` for the base URL.

- [ ] **Step 3: Enrich the Venue preview without an external call inside a DB transaction**

Return local affected booking metadata from the read transaction, close the transaction, then call Finance only for affected held marketplace booking IDs. Calculate:

```ts
const confirmedGross = affected
  .filter((booking) => booking.status === 'confirmed' && booking.source === 'marketplace')
  .reduce((sum, booking) => sum + booking.priceSnapshot, 0n);
const heldPaidGross = Object.values(amountByBookingId)
  .reduce((sum, amount) => sum + BigInt(amount), 0n);
const estimatedRefund = confirmedGross + heldPaidGross;
```

If Finance is unavailable or returns an invalid response, fail preview with the client message:

```text
Chưa thể tính tổng tiền hoàn. Vui lòng thử lại.
```

Do not permit confirmation from an incomplete preview. Remove the UI note that says the total excludes unsettled matches after the exact paid amount is supplied.

- [ ] **Step 4: Display every required confirmation metric**

Add explicit fields to `OperationalShutdownPreview`:

```ts
continuingBookings: number;
closeAt: string | null;
estimatedRefund: string;
```

Display “Lịch tiếp tục phục vụ” separately from “Lịch bị hủy”, and display “Bắt đầu đóng cửa” for scheduled mode rather than relying on the generic “Thời điểm phục vụ cuối” label.

- [ ] **Step 5: Perform the task gate**

After approval to test:

```powershell
npm test --workspace @khoaluantn/finance-service -- shutdownPreview.test.ts
npm test --workspace @khoaluantn/venue-booking-service -- operationalShutdown.test.ts
npm test --workspace @khoaluantn/web -- OperationalShutdownDialog.test.tsx
```

Expected: the displayed total equals confirmed gross plus money actually paid into held checkout/match funding; preview fails closed when Finance is unavailable.

## Task 7: Eliminate Event-Builder Drift Without Restructuring the Domain

**Findings closed:** duplicated `BookingCancelled` payload with retry drift.

**Deferred by the user's no-overengineering direction:** splitting the 467-line domain module into five modules. That structural cleanup does not close a behavior defect and would enlarge the change surface. Keep the existing public module and extract only the shared event builder needed by initial cancellation and retry.

**Files:**

- Create: `services/venue-booking-service/src/domain/operationalShutdownEvents.ts`
- Modify: `services/venue-booking-service/src/domain/operationalShutdown.ts`
- Test: all Venue shutdown/cancellation tests

**Interfaces:**

```ts
export function bookingCancelledPayload(input: {
  booking: ShutdownBookingRecord;
  shutdownId: string;
  mode: 'scheduled_close' | 'emergency';
}): BookingCancelledPayload;

export function shutdownCancellationNotification(input: {
  booking: ShutdownBookingRecord;
  shutdownId: string;
  mode: 'scheduled_close' | 'emergency';
  effectiveAt: Date;
}): UserNotificationRequestedPayload;
```

- [ ] **Step 1: Add the retry payload-equivalence test**

```ts
it('retries with the same BookingCancelled business payload', async () => {
  const first = bookingCancelledPayload(fixture);
  const retry = bookingCancelledPayload(fixture);
  expect(retry).toEqual(first);
  expect(first).toMatchObject({
    reason: 'provider_fault',
    refundPercent: 100,
    cancellationNote: expect.any(String),
    shutdownId: fixture.shutdownId,
    bookingBusinessCode: fixture.booking.businessCode,
  });
});
```

- [ ] **Step 2: Reuse the event builder from initial cancellation and retry**

Keep `operationalShutdown.ts` and all public entry points in place. Initial cancellation and retry must call the same builder; no second inline `BookingCancelled` payload is allowed. Do not move unrelated booking, hold, cancellation, or Finance code.

- [ ] **Step 3: Perform the task gate**

After approval to test:

```powershell
npm test --workspace @khoaluantn/venue-booking-service -- operationalShutdown.test.ts operationalShutdownPolicy.test.ts cancellation.test.ts
npm run typecheck --workspace @khoaluantn/venue-booking-service
```

Expected: no observable behavior changes from the extraction; initial and retry events are identical.

## Task 8: Real Browser, Broker, Migration, and Completion Evidence

**Findings closed:** completed plan lacked Playwright/browser and live-broker proof; no migration recovery rehearsal.

**Files:**

- Create: `e2e/operational-shutdown.spec.ts`
- Modify: `docs/plans/completed/2026-09-23-operational-shutdown.md` only to correct its historical result/limitations after evidence exists
- Modify: this plan's Progress, Validation, and Result sections
- Move: this file to `docs/plans/completed/2026-09-24-operational-shutdown-review-fixes.md` only after all gates pass

**Interfaces:** Uses the existing `playwright.config.ts`, `scripts/e2e-services.ts`, isolated schemas, real HTTP services, and RabbitMQ outbox/consumer path.

- [ ] **Step 1: Add the Playwright owner/player flow**

The test must seed one provider, one player, one venue/court, one confirmed paid booking, and one internal booking. It must then:

```ts
test('provider scheduled close cancels and player sees the matching refunded booking', async ({ page }) => {
  await setSession(page, providerSession);
  await page.goto(`/manage/venues/${venue.id}`);
  await page.getByRole('button', { name: 'Ngừng hoạt động cơ sở' }).click();
  await page.getByRole('radio', { name: /Đóng cửa từ ngày đã chọn/ }).click();
  await page.getByLabel('Ngày bắt đầu đóng cửa').fill(closeDate);
  await page.getByRole('button', { name: 'Xem ảnh hưởng' }).click();
  await expect(page.getByText('Lịch bị hủy')).toBeVisible();
  await expect(page.getByText('Lịch tiếp tục phục vụ')).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Xác nhận ngừng hoạt động' }).click();

  await expect.poll(() => readShutdownItemStatus(booking.id)).toBe('refunded');
  await setSession(page, playerSession);
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Xem chi tiết booking' }).click();
  await expect(page.getByText(booking.businessCode)).toBeVisible();
  await expect(page.getByText(venue.address)).toBeVisible();
  await expect(page.getByText('Tiền hoàn đã vào Số dư COURTIN')).toBeVisible();
});
```

Also assert the provider sees “Bạn cần tự thông báo cho khách” for the internal booking.

- [ ] **Step 2: Add the Playwright Admin emergency flow**

Seed an active booking where `startAt < now < endAt`; enter through `/admin/bookings`, choose the court, complete emergency shutdown with a reason, and assert the booking is cancelled/refunded without exposing a technical error.

- [ ] **Step 3: Prove live-broker idempotency**

Let the real outbox relay publish cancellation and refund-completion messages. Redeliver the same broker message ID once and assert:

```ts
expect(await financePrisma.ledgerEntry.count({
  where: { refType: 'booking', refId: booking.id, type: 'refund' },
})).toBe(3); // personal credit + business reversal + platform reversal
expect(await accountPrisma.notification.count({
  where: { bookingBusinessCode: booking.businessCode, kind: 'finance.shutdown_refund_completed' },
})).toBe(1);
```

For a match booking, assert one refund per funded contribution and no organizer-only duplicate.

- [ ] **Step 4: Rehearse additive migration and application rollback on isolated databases**

Using only disposable test database names, prove:

1. All Venue migrations deploy from empty schema.
2. The schema before the two new review-fix migrations upgrades successfully.
3. The prior application revision can start against the additive upgraded schema without destructive rollback.
4. Rolling the application back does not drop shutdown tables, business codes, items, or ledger data.

Record exact database names, commands, exit codes, and cleanup results in this plan. Do not run against the existing local development database.

- [ ] **Step 5: Run validation only after the user approves the command list**

Proposed focused commands:

```powershell
npm test --workspace @khoaluantn/venue-booking-service -- operationalShutdown.test.ts operationalShutdownPolicy.test.ts providerBookings.test.ts cancellation.test.ts bookingHttp.test.ts booking.test.ts
npm test --workspace @khoaluantn/finance-service -- refund.test.ts matchFee.test.ts shutdownPreview.test.ts
npm test --workspace @khoaluantn/matchmaking-service -- matches.test.ts operationalShutdownLifecycle.test.ts
npm test --workspace @khoaluantn/account-service -- notificationProjection.test.ts
npm test --workspace @khoaluantn/web -- BookingCard.test.tsx OperationalShutdownDialog.test.tsx ManageBookingsPage.test.tsx adminCore.test.tsx
npm run typecheck --workspace @khoaluantn/venue-booking-service
npm run typecheck --workspace @khoaluantn/finance-service
npm run typecheck --workspace @khoaluantn/matchmaking-service
npm run typecheck --workspace @khoaluantn/account-service
npm run build --workspace @khoaluantn/web
npm run e2e -- operational-shutdown.spec.ts
git diff --check
```

Expected: all commands exit 0; no duplicate ledger entries, notifications, shutdown items, or premature court deactivation.

## Risks And Recovery

- **Financial completion before cancellation:** `refundCompletedAt` decouples event order from booking mutation. Never mark an `identified` item terminal until the booking is actually cancelled.
- **Cross-service preview availability:** confirmation is disabled when Finance cannot supply an authoritative paid amount. Do not silently fall back to zero or the incomplete old estimate.
- **Parent/child scope overlap:** shared court-schedule locks serialize booking-item creation, and the cross-scope lookup excludes bookings already claimed by any shutdown item. A future path that bypasses those locks must add its own guard.
- **Admin misuse:** role authorization permits Admin but still records the exact actor and requires emergency reason/confirmation.
- **Migration ownership:** do not edit the user's business-code migration. New shutdown fields/indexes use separate additive migrations.
- **Rollback:** roll back application code first; retain additive schema, business codes, shutdown audit rows, notifications, and all ledger entries. Never restore cancelled bookings automatically.

## Progress

- [x] Review findings collected and mapped to owners.
- [x] Product authority confirmed in D55 and the approved shutdown design.
- [x] Tasks 1–7 implementation and focused regression coverage written; execution remains behind the approved validation gate.
- [x] Task 8 Playwright owner/player, Admin, held-match, and broker-redelivery scenarios run; 3/3 passed on the disposable environment.
- [x] Task 8 isolated migration upgrade/rollback rehearsal recorded.
- [x] All focused tests, typechecks, and Playwright/broker E2E executed and passing on the approved disposable environment.
- [ ] Final cleanup remains incomplete: a temporary baseline worktree directory remains, and misconfigured earlier test attempts may have left fixtures in the default `khoaluantn` DB. No cleanup was attempted there.

## Decisions

- 2026-09-24 Ruling: use existing shared court-schedule locks plus a global shutdown-item lookup instead of a new unique-index migration; current venue and court commands both acquire those locks, while a new unique index could reject existing duplicate audit rows. Cost if wrong: any future item-creation path that bypasses the court lock would need its own guard.
- 2026-09-24 Ruling: defer splitting the operational-shutdown module; extract only the shared retry event builder. This closes the observable payload drift with a smaller diff. Cost if wrong: maintainability pressure in the existing module remains.
- 2026-09-24: Corrected stale plan test paths to the repository's existing `bookingHttp.test.ts` and `providerBookings.test.ts`; Finance late-payment assertions belong in `refund.test.ts`.
- 2026-09-24: Preserve late-payment ledger semantics while projecting the business outcome as a completed return to COURTIN Balance.
- 2026-09-24: Finance supplies paid held amounts through an authenticated internal read API; Venue never reads Finance tables.
- 2026-09-24: Admin uses the same business-language three-step dialog as providers, with actor identity retained in audit.
- 2026-09-24: The user's standard-ID migration is a dependency, not a cleanup target for this plan.

## Validation

- Focused tests passed with all service/test database URLs overridden to the approved disposable DB; see the exact counts in the Task 8 run record below.
- Cross-service consumer coverage passed, and live RabbitMQ redelivery assertions passed in Playwright; Finance logged/quarantined additional cancellation messages from accumulated test outbox data, which were not independently traced.
- Browser proof: all three owner/player, Admin emergency, and held-match scenarios passed.
- Migration/rollback proof: fresh and upgrade deployments passed on the disposable DB; previous-application compatibility and preservation of shutdown/refund data were verified.
- Repository checks: four service typechecks, Web build, and `git diff --check` passed; the Web build retains its existing large-chunk warning.
- Environment incident and cleanup limitations are recorded in the Task 8 run record below; no migration ran on the default local DB and no data was deleted from it.

## Task 8 Run Record (2026-09-24)

- Focused tests with all service/test database URLs explicitly overridden to `courtin_shutdown_review_20260924`: Venue 66/66, Finance 24/24, Matchmaking 33/33, Account 1/1, Web 18/18; all commands exited 0.
- Typechecks passed for Venue, Finance, Matchmaking and Account; Web production build passed (exit 0, with the existing large-chunk warning). `git diff --check` exited 0 with LF/CRLF working-copy warnings only.
- `npm run e2e -- operational-shutdown.spec.ts` passed 3/3 against isolated ports, the disposable PostgreSQL database and its dedicated RabbitMQ vhost. Finance also logged/quarantined cancellation messages whose wallet did not match the source transaction while draining accumulated test outbox data; the three scenario assertions passed, but those messages were not independently traced.
- Fresh isolated migration deploys succeeded: Venue 13, Finance 13, Matchmaking 10, Account 6, Community 6 migrations. Upgrade rehearsal on `courtin_shutdown_review_20260924` started from baseline commit `b379769`: 11 pre-shutdown Venue migrations, `businessCode` present, and shutdown tables absent; deploying `20260923110000_operational_shutdown` and `20260924121000_shutdown_refund_completion_marker` succeeded and brought the Venue count to 13.
- Previous application revision `b379769` started against the upgraded schema (`/health` returned `ok`; `GET /venues/<fixture-id>` returned the venue and its court). Read-only counts before/after remained 3 venues, 4 business-coded bookings, 3 shutdowns, 4 shutdown items and 10 refund ledger entries.
- Cleanup: the exact disposable DB and RabbitMQ vhost were deleted and verified absent. `git worktree remove --force` for `ai-notes/operational-shutdown-baseline` failed with exit 255 because a directory remained; worktree registration was removed, but leftover files/junction cleanup is unresolved.
- Environment incident: earlier test attempts inherited `.env` and targeted `khoaluantn`, failing on missing `holdPurposeSnapshot`/`createdAt` columns. Test helpers create fixtures before those failures, so rows may remain. A later Matchmaking attempt also kept its Venue URL on the default DB. No migrations were run there and no rows were deleted; exact cleanup requires user direction because those rows cannot be safely distinguished from concurrent local data.

## Result

Implementation and Task 8 validation gates are complete on the approved disposable environment. The plan remains active because cleanup is not fully resolved: a temporary baseline directory remains after Git cleanup failed, and fixture rows may have been written to the default local database by two misconfigured test attempts. No migrations were applied to the default local DB, production was not touched, and no changes were committed or pushed.
