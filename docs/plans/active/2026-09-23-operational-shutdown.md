# Execution Plan: Operational Shutdown

Date: 2026-09-23

## Status

Active

## Outcome

Chủ sân có thể ngừng một sân hoặc toàn bộ cơ sở theo ba chế độ đã duyệt,
chuyển chế độ an toàn, và kích hoạt lại bằng thao tác riêng. Booking bị ảnh
hưởng được hủy idempotent, hoàn 100% qua ledger append-only, đồng bộ kèo/JOIN,
gửi thông báo bắt buộc, và hiển thị thẻ booking đã hủy theo mockup đã duyệt.

## Context

- Product design: `docs/superpowers/specs/2026-09-21-operational-shutdown-design.md`
- Authority to update before runtime code: `docs/product/decision-log.md`,
  `docs/product/specs/venue-scheduling.md`, `court-booking.md`,
  `finance-disputes.md`, `matchmaking-passport.md`
- Existing cancellation: `services/venue-booking-service/src/domain/cancellation.ts`
- Existing finance reversal: `services/finance-service/src/domain/refund.ts`
- Existing match projection: `services/matchmaking-service/src/lib/matchLifecycleEventConsumer.ts`
- Existing notifications: `packages/shared/src/index.ts` and
  `services/account-service/src/domain/notifications.ts`
- Existing provider surface: `apps/web/src/pages/manage/ManageVenueDetailPage.tsx`
- Existing player card: `apps/web/src/components/BookingCard.tsx`
- Dependency already approved in the user's working tree: persistent
  `Booking.businessCode` (`BK-` plus eight digits). UUID remains the only route,
  authorization and cross-service identity.

## Scope

In scope:

- Court and venue shutdown preview, confirmation, transition and reactivation.
- `winding_down`, `scheduled_close` and `emergency` rules, including the active
  booking exception for emergency.
- Command-boundary guards for checkout, internal booking and match settlement.
- Durable per-booking work items, retries and operational/refund status.
- Marketplace, match and internal booking outcomes.
- Required cancellation/refund notifications and player/provider interfaces.
- Booking business code, address, play time and creation time in the approved
  collapsed disclosure.

Out of scope:

- Replacement courts, player acceptance windows or sharing phone numbers.
- Restoring cancelled bookings when a shutdown changes.
- Hard deletion, partial shutdown refunds or wallet freezing.
- Production deployment, push or mutation of the user's dirty checkout.

## Approach

Implement inline in the isolated `codex/operational-shutdown` worktree. Every
runtime task follows RED -> GREEN -> REFACTOR: add one focused failing behavior
test, run it and record the expected failure, add the smallest production
change, then rerun the focused test. Commit each coherent service boundary.

### Task 1: Promote the approved policy into repository authority

**Files:**

- Modify `docs/product/decision-log.md`
- Modify `docs/product/specs/venue-scheduling.md`
- Modify `docs/product/specs/court-booking.md`
- Modify `docs/product/specs/finance-disputes.md`
- Modify `docs/product/specs/matchmaking-passport.md`

**Deliverable:** D55 supersedes D5 only for operational shutdown, defines the
three modes, required notifications, BOK-10 emergency exception and match
cancellation/refund synchronization. Ordinary schedule edits and ordinary
BOK-10 cancellation keep their existing rules.

### Task 2: Required notification contract

**Files:**

- Modify `packages/shared/src/index.ts`
- Modify `services/account-service/src/domain/notifications.ts`
- Modify `services/account-service/prisma/schema.prisma`
- Create `services/account-service/prisma/migrations/20260923100000_shutdown_notification_contract/migration.sql`
- Test `services/account-service/test/notificationRealtime.test.ts`

**Interfaces:**

```ts
type DeliveryPolicy = 'preference_based' | 'required';
type ShutdownNotificationKind =
  | 'booking.shutdown_scheduled'
  | 'booking.shutdown_emergency'
  | 'match.shutdown_scheduled'
  | 'match.shutdown_emergency'
  | 'finance.shutdown_refund_completed'
  | 'finance.shutdown_refund_needs_attention';
```

Only the whitelist above may use `required`. Required notifications bypass a
disabled category preference; all other kinds preserve current preference
behavior. Persist and return `bookingBusinessCode` when supplied.

**Focused proof:**

```powershell
npm test --workspace @khoaluantn/account-service -- notificationRealtime.test.ts
```

### Task 3: Shutdown persistence, preview and command guards

**Files:**

- Modify `services/venue-booking-service/prisma/schema.prisma`
- Create `services/venue-booking-service/prisma/migrations/20260923110000_operational_shutdown/migration.sql`
- Create `services/venue-booking-service/src/domain/operationalShutdown.ts`
- Create `services/venue-booking-service/src/routes/operationalShutdown.ts`
- Modify `services/venue-booking-service/src/app.ts`
- Modify `services/venue-booking-service/src/domain/hold.ts`
- Modify `services/venue-booking-service/src/domain/booking.ts`
- Modify `services/venue-booking-service/src/domain/internalBooking.ts`
- Test `services/venue-booking-service/test/operationalShutdown.test.ts`

**Interfaces:**

```ts
type ShutdownScope = { type: 'venue'; venueId: string } | { type: 'court'; courtId: string };
type ShutdownMode = 'winding_down' | 'scheduled_close' | 'emergency';
type ShutdownPreview = {
  affectedMarketplace: number;
  affectedMatch: number;
  affectedInternal: number;
  activeCheckoutHolds: number;
  activeMatchHolds: number;
  estimatedRefund: string;
  expectedInactiveAt: string | null;
};
```

The database stores one effective shutdown per scope, immutable audit
transitions and one idempotent item per affected booking. Guards execute under
the existing court/booking advisory locks. A commitment may proceed only when
it predates a matching `winding_down` snapshot and does not extend past its
captured deadline, or ends no later than a scheduled cutoff.

**Focused proof:**

```powershell
npm test --workspace @khoaluantn/venue-booking-service -- operationalShutdown.test.ts
```

### Task 4: Idempotent cancellation processor and status projection

**Files:**

- Modify `services/venue-booking-service/src/domain/operationalShutdown.ts`
- Modify `services/venue-booking-service/src/domain/cancellation.ts`
- Modify `services/venue-booking-service/src/lib/scheduler.ts`
- Modify `services/venue-booking-service/src/lib/eventConsumer.ts`
- Test `services/venue-booking-service/test/operationalShutdown.test.ts`
- Test `services/venue-booking-service/test/cancellation.test.ts`

**Behavior:** each item obtains the booking lock, rechecks scope/cutoff, cancels
only `held|confirmed`, removes physical holds, emits exactly one enriched
`BookingCancelled`, emits the required player cancellation notification for a
marketplace booking, and marks internal bookings
`cancelled_no_platform_refund`. Emergency may cancel a confirmed booking after
`startAt` only when backed by its shutdown item. Retry increments attempts;
terminal failures become `needs_attention`. `BookingRefundCompleted` moves an
item from refund processing to `refunded`.

### Task 5: Finance and matchmaking consumers

**Files:**

- Modify `services/finance-service/src/domain/refund.ts`
- Modify `services/finance-service/test/refund.test.ts`
- Modify `services/matchmaking-service/src/lib/matchLifecycleEventConsumer.ts`
- Modify `services/matchmaking-service/src/lib/notificationOutbox.ts`
- Modify `services/matchmaking-service/test/matches.test.ts`

**Behavior:** finance preserves current append-only reversals, then emits one
`BookingRefundCompleted` and required refund notification per credited user.
Matchmaking consumes shutdown cancellation for any non-terminal match linked by
`bookingId`, cancels the match, withdraws `approved|confirmed` JOINs and emits
required notifications to organizer and affected players. Redelivery produces
no duplicate state, ledger entry or notification.

**Focused proof:**

```powershell
npm test --workspace @khoaluantn/finance-service -- refund.test.ts
npm test --workspace @khoaluantn/matchmaking-service -- matches.test.ts
```

### Task 6: Provider three-step shutdown interface

**Files:**

- Create `apps/web/src/pages/manage/OperationalShutdownDialog.tsx`
- Create `apps/web/src/pages/manage/OperationalShutdownDialog.test.tsx`
- Modify `apps/web/src/pages/manage/ManageVenueDetailPage.tsx`
- Modify `apps/web/src/lib/venueBookingApi.ts`

**Behavior:** use the exact approved business copy and existing COURTIN tokens.
The dialog selects a mode, fetches the impact preview, confirms irreversible
effects, then shows a status banner and **Thay đổi cách ngừng hoạt động** where
allowed. Emergency requires a reason. Reactivation is a separate confirmation.

### Task 7: Player cancelled-booking disclosure

**Files:**

- Modify `services/venue-booking-service/src/domain/booking.ts`
- Modify `services/venue-booking-service/src/routes/bookings.ts`
- Modify `apps/web/src/lib/venueBookingApi.ts`
- Modify `apps/web/src/components/BookingCard.tsx`
- Modify `apps/web/src/components/BookingCard.test.tsx`

**Behavior:** cancelled bookings remain available in player history. The card
is compact by default; **Xem chi tiết booking** reveals address, play range,
`createdAt` under **Ngày đặt**, the exact `Booking.businessCode`, refund amount
and cancellation reason/status. The toggle exposes `aria-expanded` and can hide
the section again. No UUID is rendered.

**Focused proof:**

```powershell
npm test --workspace @khoaluantn/web -- BookingCard.test.tsx OperationalShutdownDialog.test.tsx
```

### Task 8: Cross-service proof and recovery record

**Files:**

- Add or extend a focused RabbitMQ integration test under the owning service
- Update this plan's Progress, Validation and Result sections
- Move this file to `docs/plans/completed/` only after proof passes

**Proof:** scheduled and emergency cancellation, active booking exception,
internal booking no-refund, marketplace ledger conservation, match contributor
refund, disabled-preference delivery, business-code consistency, mode changes,
direct API guards and retry idempotency.

## Risks And Recovery

- **Business-code dependency:** the user's standard-ID work is currently
  uncommitted in another checkout. Copy only the already-approved booking-code
  contract needed by this branch and never invent a UUID-derived code. During
  final integration, prefer the user's authoritative migration/DTO implementation.
- **Financial double refund:** serialize by booking ID and retain current ledger
  uniqueness/idempotency checks; never update historical ledger rows.
- **Payment/settlement race:** guards and shutdown cancellation share booking or
  court advisory locks. A late payment cannot restore a cancelled booking.
- **Bulk failure:** shutdown request and items commit first; the scheduler resumes
  non-terminal items after a process restart.
- **Rollback:** deploy application rollback before schema rollback. Keep additive
  shutdown/audit tables and issued business codes; reactivation changes only
  future availability and never restores cancelled records.

## Progress

- [x] Business design and high-fidelity mockups approved.
- [x] Isolated worktree and branch verified.
- [x] Task 1 — authoritative product documents.
- [x] Task 2 — required notifications (contract, whitelist and preference gate;
  database integration proof remains pending because local PostgreSQL is down).
- [ ] Task 3 — persistence, preview and guards.
- [ ] Task 4 — cancellation processor and projection.
- [ ] Task 5 — finance and matchmaking consumers.
- [ ] Task 6 — provider interface.
- [ ] Task 7 — player disclosure.
- [ ] Task 8 — cross-service proof and completion record.

## Decisions

- 2026-09-23: Implement inline because the user requested continuation in this
  task and did not request sub-agent delegation.
- 2026-09-23: Preserve UUIDs as technical identities; display only persisted
  `Booking.businessCode` from the approved standard-ID work.
- 2026-09-23: Treat **Ngày đặt** as `Booking.createdAt`, not the play date.

## Validation

- Focused proof: account `notificationPolicy.test.ts` red on missing fields and
  delivery gate, then 3/3 green; account typecheck passed.
- Integration or end-to-end proof: pending cross-service shutdown scenario.
- Repository-required checks: `git diff --check`; account typecheck passed.

## Result

Pending implementation and executable proof.
