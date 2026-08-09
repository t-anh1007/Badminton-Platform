# Execution Plan: Phase 2

Date: 2026-08-08

## Status

Active

## Outcome

Build and verify every Phase 2 acceptance criterion, with an evidence row for each AC and the final E2E and financial-conservation gates.

## Context

- `docs/product/phase-2-goal.md`
- The four Phase 2 functional specifications and `docs/architecture/data-model-phase-2.md`
- `docs/SCOPE_BASELINE.md` section 4 and ADRs 0002–0004
- PO decision, 2026-08-08: AI remains the shared `packages/ai` library under ADR 0002; no `ai-service` or `ai` schema.

## Scope

In scope:

- P2-G0 through P2-final in the required order.
- One committed, reviewed, verified milestone at a time.
- Complete `docs/product/phase-2-progress.md` with executable evidence.

Out of scope:

- Any policy or architecture decision reserved for PO review.

## Approach

1. Complete P2-G0 with isolated schemas, Outbox/ProcessedEvent support and negative isolation proof.
2. Follow the dependency order in the Phase 2 goal. Stop at the exact AC or PO decision that blocks a milestone.
3. At each milestone run focused AC tests, typecheck, build, a Codex review, and commit only the milestone changes.
4. Run Harness status/doctor and use isolated schemas for integration gates.

## Risks And Recovery

- Cross-schema access: enforce separate roles and test denied access before accepting migrations.
- Financial mismatch: stop at the failing FIN AC; never compensate by changing ledger rules.
- Gemini credentials or quota: use an injectable fallback in tests; stop before any credential/quota expansion.
- Recovery: the P2-G0 gate restores pre-existing database URL environment variables and removes only
  its validated `p2_g0_<guid>` database in `finally`. After an interrupted migration, inspect
  `_prisma_migrations` in that isolated database, remove only that validated temporary database,
  then rerun the committed `prisma migrate deploy`; never reset shared GĐ1 schemas.
- Rollback: revert only the dedicated milestone commit. Preserve pre-existing workspace diffs and
  do not roll back an applied shared-schema migration; use a forward corrective migration instead.

## Progress

- [x] P2-G0 — schema, skeleton, Outbox/ProcessedEvent and isolation proof.
- [x] P2-Gd — four Phase 2 page shells added to the existing design baseline.
- [x] P2-M1 — Glicko-2 rating, standardized declarations and private/public Passport views.
- [x] P2-M2 — non-financial match lifecycle, D31 identity privacy and same-hold/capacity race guards.
- [x] P2-M3 — FIN-05 integrated match-fee lifecycle, D38 receipt recovery, D39 fenced booking resolution and D40 service authentication.
- [ ] P2-M4 through P2-M9 — remaining dependency gates.
- [ ] P2-Mfe and P2-final — real-API UI, E2E, 100 percent AC audit.

## Decisions

- 2026-08-08: PO chose `packages/ai` over a separate AI service, preserving ADR 0002.
- 2026-08-08: PO fixed match `cutoffAt` at 60 minutes before slot start (D28).
- 2026-08-08: PO required equal match-fee splitting with organizer absorbing the exact remainder (D29).
- 2026-08-08: PO reassigned nine money-integrated MMP-06/07/08 ACs from M2 to M3 to remove the lifecycle/ledger dependency cycle without waiving any AC (D30).
- 2026-08-08: PO required private organizer profiles to expose only the fixed label “Người tổ chức”; public profiles keep their display name (D31).
- 2026-08-08: PO chose binary JOIN-fee refunds: 100 percent before cutoff and zero from cutoff onward (D32).
- 2026-08-08: PO chose the GĐ1 booking cancellation ladder for confirmed-match cancellation, refunding each contributor by the same policy percentage on their own contribution (D33).
- 2026-08-08: PO declined any additional no-show/late-withdrawal penalty; D32 non-refund is the sole monetary consequence (D34).
- 2026-08-08: PO decided whole-match cancellation overrides a late-withdrawal non-refund and refunds every contribution when the held booking is released (D35).
- 2026-08-08: PO limited individual pre-cutoff refunds to held bookings; after court confirmation, withdrawal alone does not refund and only whole-match cancellation can apply D33 (D36).
- 2026-08-08: PO assigned confirmed-cancellation rounding dust to the organizer after flooring each participant refund, preserving the exact booking refund total (D37).
- 2026-08-09: PO required a received but no-longer-payable match-fee SePay receipt to credit the payer's personal wallet exactly once, never match funding; organizer intents open only after the match is funding-eligible (D38).
- 2026-08-09: PO made venue-booking-service the atomic authority for pending settlement versus withdrawal/cancellation. A held-booking revoke wins with refund/open (or release for full cancellation); a confirmed booking wins with D36 no individual refund. Stale settlement must be suppressed or ledger-reversed by attempt ID (D39).
- 2026-08-09: PO required the D39 mutating Venue command to use a shared service secret; Finance/Matchmaking send `x-internal-service-token` and Venue fails closed when it is missing or invalid (D40).

## Validation

- Focused proof: AC tests recorded in the ledger.
- Integration/E2E proof: isolated-schema tests and Playwright journeys.
- Repository-required checks: Harness status/doctor, workspace typecheck and build.

## Result

P2-G0 completed 2026-08-08: clean isolated migrations for `matchmaking` and `community`, negative
cross-schema access, zero cross-schema FK, atomic Outbox leases, DB capacity/self-rating guards,
workspace typecheck/build, and two-axis Codex review with no remaining findings. Phase result remains
open until P2-final.

P2-Gd completed 2026-08-08: `docs/DESIGN.md` now defines Kèo, Player Passport, Cộng đồng & hỗ trợ
cá nhân, and Trợ lý AI shells on the existing ACTL-like/no-3D baseline; workspace typecheck/build
passed and Codex review findings were resolved.

P2-M1 completed 2026-08-08: D26 rating/declaration parameters and D27 runtime policy are recorded;
Glicko-2 matches the canonical worked example, Passport APIs enforce private/public views, and
`RatingPeriodReady` updates rating idempotently through real RabbitMQ. Focused tests, clean isolated
migrations/DB guards, workspace typecheck/build, Harness status/doctor, and both Codex review axes pass.

P2-M2 completed 2026-08-08: MMP-01..05 and AC-MMP-06-3 pass with real account/venue HTTP contracts,
D31 private organizer identity protection, idempotent same-hold conversion, organizer review APIs,
and locked free-slot capacity enforcement. Account 38, matchmaking 36, venue isolated 107 and real
service-chain 1 tests pass; clean migrations/isolation, workspace typecheck/build, Harness and both
Codex review axes pass with no remaining code findings.

P2-M3 completed 2026-08-09: FIN-05 and its integrated match lifecycle ACs pass. D38 credits every
received but no-longer-payable SePay receipt exactly once; D39 makes Venue the fenced atomic booking
authority for settlement versus withdrawal/cancellation; D40 protects that mutating command with a
fail-closed service secret. Fresh isolated migrations, focused venue 4/4, matchmaking 33/33 and
finance 6/6 suites, plus real HTTP/RabbitMQ/outbox E2E 11/11 passed; workspace typecheck/build,
Harness status/doctor and the final incremental Codex review all passed without remaining findings.
