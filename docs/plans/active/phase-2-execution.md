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
- [ ] P2-M2 through P2-M9 — sequential dependency gates.
- [ ] P2-Mfe and P2-final — real-API UI, E2E, 100 percent AC audit.

## Decisions

- 2026-08-08: PO chose `packages/ai` over a separate AI service, preserving ADR 0002.

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
