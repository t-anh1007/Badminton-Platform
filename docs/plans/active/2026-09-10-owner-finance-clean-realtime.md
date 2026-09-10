# Owner Finance Clean Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay trang tài chính chủ sân bằng Clean V2 và tự đồng bộ số dư, doanh thu, ledger, withdrawal trong 1–3 giây sau khi dữ liệu tài chính commit.

**Architecture:** Finance mutations write a user-scoped `FinanceUiInvalidated` outbox event in the same database transaction. Every finance-service replica consumes that topic through its own ephemeral RabbitMQ queue and broadcasts only invalidation scopes over an authenticated SSE stream; the React client debounces signals and refetches authoritative REST snapshots instead of applying money deltas.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, Express 4, Prisma/PostgreSQL, RabbitMQ topic exchange, Vitest, Testing Library, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-10-owner-finance-clean-ui-design.md`

## Execution progress — 2026-09-10

- Implemented the transactional owner invalidation, authenticated SSE fanout, resilient browser stream client, and Clean V2 finance surface in the shared working tree.
- Focused evidence passed: finance-service typecheck, web TypeScript check, one realtime hub contract test, and the owner finance flow test.
- A live authenticated SSE request returned the `ready` event with `200 text/event-stream`; it did not create or mutate financial data.
- The running browser is unauthenticated and therefore redirects to `/auth`; owner-session visual QA and a real post-commit refresh remain pending. This plan stays active until that evidence is available.
- The initial finance slice was committed as `f66eef8`; unrelated in-progress changes remain outside that commit and must still be staged selectively.
- Follow-up after owner visual QA: activity now combines ledger rows with non-ledger withdrawal states, so an admin rejection visibly confirms its `reserved → available` return without inventing a ledger entry. The client paginates the combined feed at six items per page; focused web typecheck and UI test passed.
- Follow-up after admin visual QA: each withdrawal opens its own reason field only after its action is selected. The confirmation retains that exact row's reason, while reconciliation continues to use its separate reason field; focused admin UI tests and web typecheck passed.

## Global Constraints

- Preserve all current finance policy: 10% commission, 24-hour revenue hold, append-only ledger, one active withdrawal and the current `MIN_WITHDRAWAL = 10000n`.
- REST/database snapshots remain authoritative; never calculate the wallet balance by applying SSE deltas.
- Realtime messages contain no balances, amounts, bank details or another owner's data.
- Authenticate SSE with the existing Bearer JWT header; never put access tokens in a URL.
- Target visible update latency is 1–3 seconds under normal network conditions.
- Preserve unrelated dispute work already present in the dirty worktree. Before editing an overlapping file, inspect its current diff and integrate without reverting it.
- Do not run Prisma migrations or mutate local financial data for implementation tests.
- Temporary diagnostics belong only in `ai-notes/`.

## File Map

- Create `services/finance-service/src/realtime/financeInvalidation.ts`: event types and transactional outbox writer.
- Create `services/finance-service/src/realtime/financeRealtimeHub.ts`: local user-scoped SSE connection registry and serialization.
- Create `services/finance-service/src/realtime/financeRealtimeConsumer.ts`: per-replica RabbitMQ subscription and hub broadcast.
- Create `services/finance-service/src/routes/financeRealtime.ts`: authenticated SSE endpoint, heartbeat and disconnect cleanup.
- Modify finance domain mutation files only where owner-visible state changes: call the transactional invalidation helper after successful mutations.
- Modify `services/finance-service/src/app.ts` and `src/index.ts`: inject/mount the realtime hub and start/stop its RabbitMQ consumer with existing idle lifecycle.
- Verify `services/api-gateway/src/index.ts`: the existing proxy forwards streaming chunks without buffering; modify it only if the integration test proves otherwise.
- Create `services/finance-service/test/financeRealtime.test.ts`: contract, authorization, commit/rollback and fanout tests.
- Modify `apps/web/src/lib/financeApi.ts`: typed authenticated streaming client. This file currently contains unrelated dispute edits; preserve them.
- Create `apps/web/src/pages/manage/useFinanceRealtime.ts`: connection state, reconnection, dedupe, debounce and visibility sync.
- Create `apps/web/src/pages/manage/FinanceOverview.tsx`: Clean V2 hero summary.
- Create `apps/web/src/pages/manage/FinanceActivityList.tsx`: normalized recent activity and filters.
- Create `apps/web/src/pages/manage/WithdrawalModal.tsx`: intent-driven withdrawal form/current-request state using the existing accessible `Modal` primitive.
- Modify `apps/web/src/pages/manage/ManageFinancePage.tsx`: snapshot orchestration and clean composition.
- Create `apps/web/src/pages/manage/useFinanceRealtime.test.tsx` and modify `manageOperations.test.tsx`: realtime and user-flow coverage.

---

### Task 1: Define transactional finance invalidation

**Files:**
- Create: `services/finance-service/src/realtime/financeInvalidation.ts`
- Test: `services/finance-service/test/financeRealtime.test.ts`
- Modify: `services/finance-service/src/domain/wallet.ts`
- Modify: `services/finance-service/src/domain/revenueRelease.ts`
- Modify: `services/finance-service/src/domain/withdrawal.ts`
- Modify: `services/finance-service/src/domain/dispute.ts`

**Interfaces:**
- Produces: `type FinanceUiScope = 'wallet' | 'revenue' | 'ledger' | 'withdrawals'`
- Produces: `interface FinanceUiInvalidatedPayload { sellerUserId: string; scopes: FinanceUiScope[] }`
- Produces: `writeFinanceUiInvalidation(tx, sellerUserId, scopes, aggregateId): Promise<void>`
- Consumes: existing `writeOutbox(tx, params)` and Prisma transaction clients.

- [ ] **Step 1: Write failing transaction tests**

Add tests that open a Prisma transaction, call the helper, and assert one outbox row with `eventType: 'FinanceUiInvalidated'`, the exact owner ID and unique scopes. Add a forced rollback test and assert no row survives.

```ts
await prisma.$transaction(async (tx) => {
  await writeFinanceUiInvalidation(tx, ownerId, ['wallet', 'ledger', 'wallet'], walletId);
});
expect(await prisma.outbox.findFirst({ where: { eventType: 'FinanceUiInvalidated' } }))
  .toMatchObject({ payload: { sellerUserId: ownerId, scopes: ['wallet', 'ledger'] } });
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `npm test --workspace @khoaluantn/finance-service -- financeRealtime.test.ts`

Expected: FAIL because `financeInvalidation.ts` does not exist.

- [ ] **Step 3: Implement the event contract and writer**

Validate non-empty `sellerUserId`, deduplicate scopes in stable order, and write through existing outbox in the caller's transaction.

```ts
export async function writeFinanceUiInvalidation(
  tx: Prisma.TransactionClient,
  sellerUserId: string,
  scopes: readonly FinanceUiScope[],
  aggregateId: string,
): Promise<void> {
  const uniqueScopes = [...new Set(scopes)];
  if (!sellerUserId || uniqueScopes.length === 0) return;
  await writeOutbox(tx, {
    aggregateType: 'FinanceUi', aggregateId, eventType: 'FinanceUiInvalidated',
    payload: { sellerUserId, scopes: uniqueScopes },
  });
}
```

- [ ] **Step 4: Wire every owner-visible committed mutation**

In `postLedgerEntry`, emit `wallet` and `ledger` only for a business wallet with a non-null `userId`. In `recordBookingRevenue` add `revenue`; in `releaseBookingRevenue` emit `wallet` and `revenue`; in withdrawal create/cancel/reject/settle emit `wallet` and `withdrawals`. When a dispute opens or resolves, emit `revenue` for the affected `businessUserId` because the owner-visible blocked/net state changed. Keep calls inside the same Prisma transaction and do not emit on idempotent no-op paths.

- [ ] **Step 5: Extend tests for mutation coverage and rollback**

Assert booking revenue creation, maturity release, dispute opening/resolution, withdrawal create, cancel and payout each persist a signal for the correct owner. Assert a rejected/rolled-back mutation does not persist one. Check payload JSON has none of `amount`, `available`, `reserved`, `bankAccountNumber`.

- [ ] **Step 6: Run focused finance tests**

Run: `npm test --workspace @khoaluantn/finance-service -- financeRealtime.test.ts g6Withdrawal.test.ts g6Revenue.test.ts`

Expected: all selected tests PASS and existing balance/ledger assertions remain unchanged.

- [ ] **Step 7: Commit the transactional signal slice**

```powershell
git add -- services/finance-service/src/realtime/financeInvalidation.ts services/finance-service/src/domain/wallet.ts services/finance-service/src/domain/revenue.ts services/finance-service/src/domain/revenueRelease.ts services/finance-service/src/domain/withdrawal.ts services/finance-service/src/domain/dispute.ts services/finance-service/test/financeRealtime.test.ts
git commit -m "feat(finance): emit owner snapshot invalidations"
```

### Task 2: Deliver authenticated SSE across finance replicas

**Files:**
- Create: `services/finance-service/src/realtime/financeRealtimeHub.ts`
- Create: `services/finance-service/src/realtime/financeRealtimeConsumer.ts`
- Create: `services/finance-service/src/routes/financeRealtime.ts`
- Modify: `services/finance-service/src/app.ts`
- Modify: `services/finance-service/src/index.ts`
- Test: `services/finance-service/test/financeRealtime.test.ts`

**Interfaces:**
- Consumes: `FinanceUiInvalidatedPayload` from Task 1 and existing `connectRabbitMQ()`.
- Produces: `FinanceRealtimeHub.subscribe(userId, listener): () => void` and `.publish(eventId, payload, occurredAt): void`.
- Produces: `createFinanceRealtimeRouter(hub): Router` at `GET /providers/me/finance-stream`.
- Produces: `bootstrapFinanceRealtimeConsumer(hub, options?): Promise<() => Promise<void>>`.

- [ ] **Step 1: Write failing hub and HTTP contract tests**

Cover two simultaneous owners, duplicate event IDs, unauthenticated `401`, player-only `403`, provider `200`, SSE headers, owner isolation, heartbeat and listener cleanup when the request closes.

```ts
expect(response.headers['content-type']).toContain('text/event-stream');
expect(response.headers['cache-control']).toBe('no-cache, no-transform');
hub.publish('evt-1', { sellerUserId: ownerA, scopes: ['wallet'] }, now);
expect(ownerAChunks.join('')).toContain('event: finance-invalidated');
expect(ownerBChunks.join('')).not.toContain('evt-1');
```

- [ ] **Step 2: Run focused tests and confirm missing implementations**

Run: `npm test --workspace @khoaluantn/finance-service -- financeRealtime.test.ts`

Expected: FAIL on missing hub/router exports.

- [ ] **Step 3: Implement the local hub**

Use `Map<string, Set<FinanceRealtimeListener>>`; deduplicate a bounded recent set of event IDs; serialize only `id`, `event`, and JSON `{ scopes, occurredAt }`. Return an idempotent unsubscribe function.

- [ ] **Step 4: Implement the authenticated SSE route**

Compose `requireAuth` and `requireRole('provider')`. Derive owner ID only from `AuthenticatedRequest.user.id`, call `res.flushHeaders()`, send an initial `ready` event, start a 15-second comment heartbeat, and clear both timer and hub listener on `req.close`.

```ts
router.get('/providers/me/finance-stream', requireAuth, requireRole('provider'), (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
  res.flushHeaders();
  const unsubscribe = hub.subscribe(userId, (chunk) => res.write(chunk));
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});
```

- [ ] **Step 5: Implement one ephemeral queue per replica**

Create a server-generated queue with `exclusive: true`, `autoDelete: true`, bind it to exchange `domain-events` and routing key `FinanceUiInvalidated`, validate the envelope, then call `hub.publish(messageId, payload, occurredAt)`. Ack valid messages; use existing `shouldRequeue` policy for transient failures. This queue must not compete with other replicas because every connected replica needs the signal.

- [ ] **Step 6: Mount and lifecycle-manage realtime infrastructure**

Inject one hub into `createApp({ ..., financeRealtimeHub })`; mount the router. In `index.ts`, start the realtime consumer in `startWithIdleRelease.start()` and return its stop callback with the scheduler and existing consumers. Call `markActivity()` on each SSE heartbeat so a live stream keeps its RabbitMQ consumer active; after the final stream disconnects, the existing idle timer may release resources normally. Test both behaviors.

- [ ] **Step 7: Run HTTP and consumer tests**

Run: `npm test --workspace @khoaluantn/finance-service -- financeRealtime.test.ts g7Http.test.ts`

Expected: PASS; existing dispute HTTP behavior remains green despite overlapping `app.ts` work.

- [ ] **Step 8: Verify streaming through the API gateway**

Start finance-service and api-gateway on test ports, open `/api/finance/providers/me/finance-stream` with a provider Bearer token, publish one hub event and assert the client receives a chunk before the response closes. Keep `services/api-gateway/src/index.ts` unchanged when its existing proxy streams correctly; if the test demonstrates buffering, extract its app factory and add only the required proxy streaming configuration plus a focused gateway test.

- [ ] **Step 9: Commit the SSE delivery slice**

```powershell
git add -- services/finance-service/src/realtime/financeRealtimeHub.ts services/finance-service/src/realtime/financeRealtimeConsumer.ts services/finance-service/src/routes/financeRealtime.ts services/finance-service/src/app.ts services/finance-service/src/index.ts services/finance-service/test/financeRealtime.test.ts
git commit -m "feat(finance): stream owner snapshot invalidations"
```

### Task 3: Build the resilient browser stream client

**Files:**
- Modify: `apps/web/src/lib/financeApi.ts`
- Create: `apps/web/src/pages/manage/useFinanceRealtime.ts`
- Create: `apps/web/src/pages/manage/useFinanceRealtime.test.tsx`

**Interfaces:**
- Produces: `streamMyFinance(signal, onEvent, onReady): Promise<void>` using authenticated `fetch`.
- Produces: `useFinanceRealtime({ onInvalidate, safetyRefreshMs? }): { status: 'connecting' | 'live' | 'offline'; lastUpdatedAt: Date | null; refreshNow(): void }`.
- Consumes: `onInvalidate(scopes: ReadonlySet<FinanceUiScope>): Promise<void> | void` supplied by `ManageFinancePage`.

- [ ] **Step 1: Write failing stream parser and hook tests**

Mock a `ReadableStream` containing split SSE chunks. Test Bearer header, parsing across chunk boundaries, dedupe by `id`, 150ms burst debounce, reconnect backoff with jitter stubbed, refetch on `visibilitychange`, 60-second safety refresh, abort on unmount and transitions among connecting/live/offline.

```ts
controller.enqueue(encoder.encode('id: evt-1\nevent: finance-in'));
controller.enqueue(encoder.encode('validated\ndata: {"scopes":["wallet"]}\n\n'));
await vi.advanceTimersByTimeAsync(150);
expect(onInvalidate).toHaveBeenCalledWith(new Set(['wallet']));
```

- [ ] **Step 2: Run the hook test and confirm missing exports**

Run: `npm test --workspace @khoaluantn/web -- useFinanceRealtime.test.tsx`

Expected: FAIL because stream client/hook do not exist.

- [ ] **Step 3: Implement authenticated SSE parsing**

Use the existing finance base URL and access token helper. Call `fetch` with `Accept: text/event-stream`, `Authorization: Bearer ...`, and the hook's `AbortSignal`. Parse complete SSE frames separated by a blank line; ignore heartbeat comments and unknown event types; throw on non-OK responses or an unexpectedly ended stream.

- [ ] **Step 4: Implement lifecycle, debounce and recovery**

Merge scopes received during the 150ms window. Reconnect delays: 1s, 2s, 4s, 8s, capped at 15s with jitter; reset after `ready`. Trigger immediate full invalidation on reconnect and when `document.visibilityState` becomes `visible`. Run safety refresh every 60 seconds only while visible. Abort timers and stream on unmount.

- [ ] **Step 5: Run hook tests and frontend typecheck**

Run: `npm test --workspace @khoaluantn/web -- useFinanceRealtime.test.tsx`

Run: `npm run typecheck --workspace @khoaluantn/web`

Expected: both commands PASS.

- [ ] **Step 6: Commit the frontend realtime client**

```powershell
git add -- apps/web/src/lib/financeApi.ts apps/web/src/pages/manage/useFinanceRealtime.ts apps/web/src/pages/manage/useFinanceRealtime.test.tsx
git commit -m "feat(web): sync owner finance snapshots live"
```

### Task 4: Implement the Clean V2 finance interface

**Files:**
- Create: `apps/web/src/pages/manage/FinanceOverview.tsx`
- Create: `apps/web/src/pages/manage/FinanceActivityList.tsx`
- Create: `apps/web/src/pages/manage/WithdrawalModal.tsx`
- Modify: `apps/web/src/pages/manage/ManageFinancePage.tsx`
- Modify: `apps/web/src/pages/manage/manageOperations.test.tsx`

**Interfaces:**
- Consumes: hook and API types from Task 3, existing `Modal`, `Button`, `Badge`, `TextInput`, `SelectInput`, formatters and `getMyManagedVenues()`.
- Produces: one page snapshot loader capable of scoped reloads: `reload(scopes?: ReadonlySet<FinanceUiScope>): Promise<void>`.
- Produces: presentational overview/activity/modal components with no direct API calls.

- [ ] **Step 1: Replace old layout expectations with failing Clean V2 tests**

Test one visible primary `Rút tiền` CTA, hero values, current-day `+07:00` query, recent activity with venue names instead of IDs, hidden advanced filters until requested, withdrawal modal, `Rút toàn bộ`, active-request state, live/reconnecting copy and no old revenue/ledger tabs.

```ts
expect(await screen.findByText('Số dư có thể rút')).toBeVisible();
expect(screen.getAllByRole('button', { name: 'Rút tiền' })).toHaveLength(1);
expect(getMyRevenue).toHaveBeenCalledWith(expect.objectContaining({
  from: expect.stringContaining('T00:00:00.000+07:00'),
  to: expect.stringContaining('T23:59:59.999+07:00'),
}));
expect(screen.queryByText('Doanh thu theo booking')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the page tests and confirm old UI failures**

Run: `npm test --workspace @khoaluantn/web -- manageOperations.test.tsx`

Expected: FAIL because the current page still renders three metrics, inline withdrawal form and tabs.

- [ ] **Step 3: Build `FinanceOverview`**

Render a single navy surface: available balance as the visual anchor, the sole `Rút tiền` CTA, today's net/count, pending balance and active-withdrawal status. Add the compact realtime status with text plus icon; respect `motion-reduce:transition-none`.

- [ ] **Step 4: Build normalized activity and progressive filters**

Convert ledger entries into rows with semantic sign/status and venue-aware `referenceSummary`; show the newest compact set. Add local quick filters `all | revenue | withdrawal`, an expandable advanced filter containing venue/date controls and an in-place “Xem tất cả”. Do not expose raw booking/venue/user UUIDs.

- [ ] **Step 5: Move withdrawal flow into the existing accessible modal**

Open the modal only from the primary CTA. If an active request exists, show its amount/status/cancel action instead of the form. Otherwise render amount, “Rút toàn bộ”, bank fields and confirmation summary. Keep current validation and call `reload(new Set(['wallet','withdrawals','ledger']))` immediately after create/cancel.

- [ ] **Step 6: Compose scoped snapshot loading in `ManageFinancePage`**

Initial load fetches wallet, venues, today's revenue, withdrawals and ledger. Realtime invalidations selectively refetch affected resources, but commit the new UI state only after all requests in that refresh settle successfully. Preserve the last good snapshot on errors and expose a retry action.

- [ ] **Step 7: Run focused UI tests and accessibility assertions**

Run: `npm test --workspace @khoaluantn/web -- manageOperations.test.tsx useFinanceRealtime.test.tsx`

Expected: PASS with no duplicate primary CTA, modal has dialog semantics, status text is available to assistive technology and mobile content does not require horizontal scrolling in component fixtures.

- [ ] **Step 8: Commit the Clean V2 UI slice**

```powershell
git add -- apps/web/src/pages/manage/FinanceOverview.tsx apps/web/src/pages/manage/FinanceActivityList.tsx apps/web/src/pages/manage/WithdrawalModal.tsx apps/web/src/pages/manage/ManageFinancePage.tsx apps/web/src/pages/manage/manageOperations.test.tsx
git commit -m "feat(web): simplify owner finance dashboard"
```

### Task 5: Prove end-to-end freshness and finish the plan

**Files:**
- Modify: `docs/plans/active/2026-09-10-owner-finance-clean-realtime.md`
- Move after all gates pass: `docs/plans/completed/2026-09-10-owner-finance-clean-realtime.md`
- Test only: existing finance/web test files and browser route `/manage/finance`.

**Interfaces:**
- Consumes: complete backend and frontend behavior from Tasks 1–4.
- Produces: recorded executable evidence and an honest residual-risk statement.

- [ ] **Step 1: Inspect the final diff for accidental overlap**

Run: `git status --short`

Run: `git diff --check`

Run: `git diff --name-only HEAD~4..HEAD`

Expected: only planned finance realtime/Clean V2 files plus separately identified pre-existing dispute work; no secret or generated screenshot is staged.

- [ ] **Step 2: Run focused automated proof**

Run: `npm test --workspace @khoaluantn/finance-service -- financeRealtime.test.ts g6Withdrawal.test.ts g6Revenue.test.ts g7Http.test.ts`

Run: `npm test --workspace @khoaluantn/web -- manageOperations.test.tsx useFinanceRealtime.test.tsx`

Expected: all focused tests PASS.

- [ ] **Step 3: Request the user's validation choice before broad checks**

Report the read-only impact scan and ask whether to run focused build/typecheck, focused tests, both or neither, following the repository's COURTIN validation-consent convention. Do not describe unrun checks as verified.

- [ ] **Step 4: Run approved build/typecheck scope**

If approved, run: `npm run typecheck --workspace @khoaluantn/finance-service`

If approved, run: `npm run typecheck --workspace @khoaluantn/web`

If approved, run: `npm run build --workspace @khoaluantn/finance-service`

If approved, run: `npm run build --workspace @khoaluantn/web`

Expected: every approved command exits 0.

- [ ] **Step 5: Perform controlled browser QA**

Start the existing local stack without migrations. Sign in as a provider, open `/manage/finance` at desktop and mobile widths, and verify the approved Clean V2 hierarchy. In a test-safe fixture transaction, create one owner-visible financial change and record timestamps for database commit, SSE invalidation receipt and visible snapshot update. Expected UI update: 1–3 seconds under normal local conditions. Also stop/restart the stream connection and verify “Đang kết nối lại” then a full refetch after reconnection.

- [ ] **Step 6: Record evidence and remaining limitations**

Update this plan with exact test counts, command exits, measured latency, browser surfaces covered and any unverified mutation. Distinguish route/render proof from actual payout or production behavior.

- [ ] **Step 7: Move the validated plan and commit documentation**

Only after every required gate passes:

```powershell
Move-Item -LiteralPath 'docs/plans/active/2026-09-10-owner-finance-clean-realtime.md' -Destination 'docs/plans/completed/2026-09-10-owner-finance-clean-realtime.md'
git add -- docs/plans/active/2026-09-10-owner-finance-clean-realtime.md docs/plans/completed/2026-09-10-owner-finance-clean-realtime.md
git commit -m "docs(web): record owner finance realtime proof"
```
