---
type: acceptance-test-ledger
phase: 2
status: active
updated: 2026-08-08
---

# Phase 2 Acceptance Test Ledger

Each AC must end as `pass` with executable evidence, or `waived` with an explicit PO decision. Until it is evaluated, the result cell is deliberately empty; empty is not completion and blocks its milestone.

## Milestone gates

| Milestone | Result | Evidence |
|---|---|---|
| P2-G0 | pass | `scripts/p2-g0-isolation.ps1` (clean DB migrations, denied cross-schema reads, zero cross-schema FK, DB guards 4/4); unit tests 4/4; workspace typecheck/build; Codex standards/spec re-review: no findings |
| P2-Gd | pass | `docs/DESIGN.md` covers Kèo/Passport/Community/AI shells, responsive and required states; workspace typecheck/build; Codex standards/spec review findings resolved |
| P2-M1 | pass | `matchmaking-service`: default 15/15, RabbitMQ E2E 1/1, isolated DB guards 4/4; workspace typecheck/build; Harness status/doctor; Codex standards/spec re-review: no findings |

| AC | Milestone | Executable evidence | Result |
|---|---|---|---|
| AC-MMP-01-1 | P2-M2 |  |  |
| AC-MMP-01-2 | P2-M2 |  |  |
| AC-MMP-01-3 | P2-M2 |  |  |
| AC-MMP-01-4 | P2-M2 |  |  |
| AC-MMP-02-1 | P2-M2 |  |  |
| AC-MMP-02-2 | P2-M2 |  |  |
| AC-MMP-02-3 | P2-M2 |  |  |
| AC-MMP-02-4 | P2-M2 |  |  |
| AC-MMP-03-1 | P2-M2 |  |  |
| AC-MMP-03-2 | P2-M2 |  |  |
| AC-MMP-04-1 | P2-M2 |  |  |
| AC-MMP-04-2 | P2-M2 |  |  |
| AC-MMP-04-3 | P2-M2 |  |  |
| AC-MMP-05-1 | P2-M2 |  |  |
| AC-MMP-05-2 | P2-M2 |  |  |
| AC-MMP-05-3 | P2-M2 |  |  |
| AC-MMP-06-1 | P2-M2 |  |  |
| AC-MMP-06-2 | P2-M2 |  |  |
| AC-MMP-06-3 | P2-M2 |  |  |
| AC-MMP-06-4 | P2-M2 |  |  |
| AC-MMP-07-1 | P2-M2 |  |  |
| AC-MMP-07-2 | P2-M2 |  |  |
| AC-MMP-07-3 | P2-M2 |  |  |
| AC-MMP-08-1 | P2-M2 |  |  |
| AC-MMP-08-2 | P2-M2 |  |  |
| AC-MMP-08-3 | P2-M2 |  |  |
| AC-MMP-09-1 | P2-M1 | `test/passport.test.ts` — cold-start TB returns rating 1500, RD 350 and high uncertainty over HTTP | pass |
| AC-MMP-09-2 | P2-M1 | `test/passport.test.ts` — bounded re-declaration preserves learned RD/σ; 30-day boundary and concurrent requests serialized | pass |
| AC-MMP-10-1 | P2-M4 |  |  |
| AC-MMP-10-2 | P2-M4 |  |  |
| AC-MMP-10-3 | P2-M4 |  |  |
| AC-MMP-10-4 | P2-M4 |  |  |
| AC-MMP-11-1 | P2-M1 | `test/passport.test.ts` — own HTTP view returns rating/RD, 5-match history and exact filtered evaluation mean | pass |
| AC-MMP-11-2 | P2-M1 | `test/passport.test.ts` — public HTTP view is exactly userId + tier + matchesPlayed | pass |
| AC-F01-1 | P2-M1 | `test/rating.test.ts` — approved TB cold-start center and high-RD state | pass |
| AC-F01-2 | P2-M1 | `test/rating.test.ts` + `test/passport.test.ts` + `test/ratingRabbit.e2e.test.ts` — stronger-opponent wins raise μ/reduce RD; broker event persists once across replay | pass |
| AC-F01-3 | P2-M1 | `test/rating.test.ts` — equal μ with RD 300 vs 80 exposes high vs established confidence | pass |
| AC-F01-4 | P2-M1 | `test/rating.test.ts` — order-independent identical output plus canonical Glicko-2 worked example | pass |
| AC-F02-1 | P2-M6 |  |  |
| AC-F02-2 | P2-M6 |  |  |
| AC-F02-3 | P2-M6 |  |  |
| AC-F03-1 | P2-M5 |  |  |
| AC-F03-2 | P2-M5 |  |  |
| AC-F03-3 | P2-M5 |  |  |
| AC-F03-4 | P2-M5 |  |  |
| AC-F04-1 | P2-M6 |  |  |
| AC-F04-2 | P2-M6 |  |  |
| AC-F04-3 | P2-M6 |  |  |
| AC-F07-1 | P2-M4 |  |  |
| AC-F07-2 | P2-M4 |  |  |
| AC-F07-3 | P2-M4 |  |  |
| AC-F07-4 | P2-M4 |  |  |
| AC-COM-01-1 | P2-M8 |  |  |
| AC-COM-01-2 | P2-M8 |  |  |
| AC-COM-01-3 | P2-M8 |  |  |
| AC-COM-02-1 | P2-M8 |  |  |
| AC-COM-02-2 | P2-M8 |  |  |
| AC-COM-02-3 | P2-M8 |  |  |
| AC-COM-03-1 | P2-M8 |  |  |
| AC-COM-03-2 | P2-M8 |  |  |
| AC-COM-04-1 | P2-M8 |  |  |
| AC-COM-04-2 | P2-M8 |  |  |
| AC-COM-05-1 | P2-M8 |  |  |
| AC-COM-05-2 | P2-M8 |  |  |
| AC-COM-05-3 | P2-M8 |  |  |
| AC-COM-06-1 | P2-M8 |  |  |
| AC-COM-06-2 | P2-M8 |  |  |
| AC-COM-07-1 | P2-M8 |  |  |
| AC-COM-07-2 | P2-M8 |  |  |
| AC-COM-07-3 | P2-M8 |  |  |
| AC-COM-07-4 | P2-M8 |  |  |
| AC-COM-08-1 | P2-M8 |  |  |
| AC-COM-08-2 | P2-M8 |  |  |
| AC-COM-08-3 | P2-M8 |  |  |
| AC-COM-08-4 | P2-M8 |  |  |
| AC-AI-01-1 | P2-M7 |  |  |
| AC-AI-01-2 | P2-M7 |  |  |
| AC-AI-01-3 | P2-M7 |  |  |
| AC-AI-01-4 | P2-M7 |  |  |
| AC-AI-01-5 | P2-M7 |  |  |
| AC-AI-02-1 | P2-M9 |  |  |
| AC-AI-02-2 | P2-M9 |  |  |
| AC-AI-02-3 | P2-M9 |  |  |
| AC-AI-02-4 | P2-M9 |  |  |
| AC-AI-02-5 | P2-M9 |  |  |
| AC-AI-02-6 | P2-M9 |  |  |
| AC-FIN-05-1 | P2-M3 |  |  |
| AC-FIN-05-2 | P2-M3 |  |  |
| AC-FIN-05-3 | P2-M3 |  |  |
| AC-FIN-05-4 | P2-M3 |  |  |
| AC-FIN-05-5 | P2-M3 |  |  |
| AC-FIN-05-6 | P2-M3 |  |  |
| AC-FIN-05-7 | P2-M3 |  |  |
| AC-FIN-05-8 | P2-M3 |  |  |
