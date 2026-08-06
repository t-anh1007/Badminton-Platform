# Execution Plan: Complete Phase 1 From G5 Through G7

Date: 2026-08-06

## Status

Completed

## Outcome

Complete the remaining Phase 1 milestones G5, G6, and G7 on branch `TuanAnh`,
with all remaining acceptance criteria backed by executable evidence, the eight
phase-level Playwright journeys passing, and the system-level finance
conservation check passing. Commit each milestone separately; do not merge to
`main`.

## Context

- `docs/WORKFLOW.md`
- `docs/product/phase-1-goal.md`
- `docs/product/phase-1-handoff.md`
- `docs/product/phase-1-progress.md`
- `docs/product/decision-log.md`
- `docs/product/specs/court-booking.md`
- `docs/product/specs/finance-disputes.md`
- `docs/architecture/flows.md`
- `docs/architecture/data-model.md`
- `docs/decisions/0002-tech-stack-microservices.md`
- `docs/decisions/0003-multi-role-dual-wallet.md`
- `docs/decisions/0004-db-strategy-and-repo-boundary.md`

The starting point is commit `a94701d` (`feat(g4)`), with G4 verified and
committed. The user explicitly authorizes Codex to replace the executor named
in D21 for the remaining Phase 1 work. D22 remains active: an independent Codex
subagent reviews each milestone diff before its commit.

## Scope

In scope:

- G5: BOK-09, BOK-10, FIN-07, and FIN-08, including UI and 24 AC.
- G6: FIN-09 release/display, FIN-10, FIN-11, and FIN-14, including UI and 26 AC.
- G7: FIN-12 and FIN-13, including UI, 14 AC, the full finance scenario, and
  the final Phase 1 gate.
- Close previously stale progress entries where current Git and executable
  evidence prove completion.
- Add and run all eight required Playwright phase-level journeys.

Out of scope:

- Anything assigned to Phase 2 or later.
- Changes to the fixed commission rate `r=10%`.
- Bank payout automation, partial-duration cancellation, booking time changes,
  dispute appeals, provider-initiated disputes, or cross-schema queries/FKs.
- Merge to `main` or production deployment.

## Approach

1. Reconcile current schemas, event contracts, domain services, HTTP surfaces,
   tests, and frontend baseline against the approved G5-G7 specifications.
2. Implement G5 as the smallest vertical slice, test each cancellation/refund
   path against `LEDGER_ENTRY`, run the full milestone gate, obtain independent
   D22 review, fix findings, and commit G5.
3. Implement G6 with booking-scoped revenue release, atomic withdrawal
   reservation, append-only payout handling, and reconciliation. Run
   conservation checks after every money path, obtain D22 review, and commit G6.
4. Implement G7 with booking-scoped dispute holds and an atomic 24-hour race.
   Run the boundary race repeatedly plus the full multi-booking finance
   scenario, obtain D22 review, and commit G7.
5. Complete all eight Playwright journeys, run repository-wide verification,
   update the 198-row ledger and milestone evidence, perform the final scope and
   diff audit, then move this plan to `docs/plans/completed/` in the final G7
   commit (or a separate final gate commit if G7 is already committed).

## Risks And Recovery

- Money imbalance: stop immediately, preserve append-only entries, and repair
  only through new reversal entries. Verify directly from `LEDGER_ENTRY`, not
  projected balances.
- Boundary races: rely on database transactions/constraints and repeat the
  concurrency tests; do not substitute application-only prechecks.
- Event replay: every consumer is idempotent and emits outbox records in the
  same transaction as state changes.
- Cross-service data need: use an approved API/event contract. Stop rather than
  query another service schema.
- Test database contamination: use existing test reset helpers and inspect the
  exact configured database before any reset. Never reset production data.
- Recovery: each G is a separate commit. If a later G fails, resume from the
  last verified milestone without rewriting earlier ledger history.

## Progress

- [x] Confirm clean `TuanAnh` checkout at committed G4 baseline.
- [x] Read workflow, goal, handoff, decisions, current progress, and G5-G7 spec authority.
- [x] Reconcile current code/schema/tests/frontend with G5 requirements.
- [x] Implement and verify G5; independent D22 review found no remaining P0/P1/P2.
- [x] Commit G5 on `TuanAnh` at `854b67a`.
- [x] Reconcile and implement G6; verify, independently review, and commit G6.
- [x] Reconcile and implement G7; verify, independently review, and commit G7.
- [x] Implement and pass all eight phase-level Playwright journeys.
- [x] Run final repository-wide and finance-conservation gates.
- [x] Record final result and move this plan to `docs/plans/completed/`.

## Decisions

- 2026-08-06: Work directly in the existing clean `TuanAnh` checkout; no extra
  worktree because commits must land directly on this branch.
- 2026-08-06: The user selected a separate Codex subagent for each D22 review.
- 2026-08-06: Execute G5 then G6 sequentially despite their parallel dependency
  frontier, avoiding concurrent edits to shared finance surfaces.
- 2026-08-06: PO approved the smallest G5 schema correction for BOK-10-6:
  add nullable `Booking.courtChangedAt`; booking detail derives a court-change
  note from this marker. Do not add previous-court history beyond the approved AC.
- 2026-08-06: G6 migrations target a clean Phase 1 pre-production schema, matching
  the Gboot empty-database migration gate. They intentionally do not backfill
  disposable local G4 fixtures. Before applying G6 to any retained-data
  environment, create and validate a separate rehydration/backfill for booking
  revenue metadata and legacy SePay allocation counterparts.
- 2026-08-06: The same clean/pre-production precondition applies to G7's
  `BookingRevenue.cancelledAt` marker. It protects every cancellation processed
  after G7; a retained-data deployment must first backfill earlier G5 refunds
  (including 0% cancellations, which cannot be inferred from refund ledger rows
  alone) from the venue-booking event history.

## Validation

- Focused proof: per-function unit/integration tests mapped to every remaining
  AC, including direct `LEDGER_ENTRY` assertions and repeated race tests.
- Integration or end-to-end proof: RabbitMQ/DB service-boundary tests, the full
  multi-booking finance scenario, and eight Playwright journeys.
- Repository-required checks: affected workspace tests and builds after each
  function; full `npm run typecheck`, `npm run build`, full workspace tests, and
  clean Git diff/status before final completion.

## Result

Completed on branch `TuanAnh`. G5, G6, and G7 were committed independently;
the final gate adds real account UI integration plus eight Playwright journeys.
The authoritative ledger records 198/198 AC passing. Fresh verification passed:
account 35 tests (2 skipped), finance 79, venue 104 on an isolated clean schema,
web 5, Playwright 8/8, root typecheck/build, Prisma validation/deploy, and the
finance conservation scenario. The retained-data migration caveats above remain
deployment preconditions; PO acceptance and merge to `main` remain with the user.
