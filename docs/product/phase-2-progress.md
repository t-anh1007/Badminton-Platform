---
type: acceptance-test-ledger
phase: 2
status: active
updated: 2026-08-09
---

# Phase 2 Acceptance Test Ledger

Each AC must end as `pass` with executable evidence, or `waived` with an explicit PO decision. Until it is evaluated, the result cell is deliberately empty; empty is not completion and blocks its milestone.

## Milestone gates

| Milestone | Result | Evidence |
|---|---|---|
| P2-G0 | pass | `scripts/p2-g0-isolation.ps1` (clean DB migrations, denied cross-schema reads, zero cross-schema FK, DB guards 4/4); unit tests 4/4; workspace typecheck/build; Codex standards/spec re-review: no findings |
| P2-Gd | pass | `docs/DESIGN.md` covers Kèo/Passport/Community/AI shells, responsive and required states; workspace typecheck/build; Codex standards/spec review findings resolved |
| P2-M1 | pass | `matchmaking-service`: default 15/15, RabbitMQ E2E 1/1, isolated DB guards 4/4; workspace typecheck/build; Harness status/doctor; Codex standards/spec re-review: no findings |
| P2-M2 | pass | `matchmaking-service`: 36 pass + real HTTP chain/race 1/1; `account-service`: 38 pass; `venue-booking-service`: isolated DB migration + 107 pass; schema isolation guards 4/4; workspace typecheck/build; Harness status/doctor; Codex standards/spec re-review: no findings |
| P2-M3 | pass | Fresh isolated migrations for finance/venue/matchmaking; focused AC suites: venue 4/4, matchmaking 33/33, finance 6/6; real HTTP/RabbitMQ/outbox `matchFee.e2e.test.ts` 11/11 including D38 receipt recovery, D39 retry/fencing, D40 authentication and D33 cancellation ordering; workspace typecheck/build; Harness status/doctor; incremental Codex review: no P0-P3 findings |

| AC | Milestone | Executable evidence | Result |
|---|---|---|---|
| AC-MMP-01-1 | P2-M2 | `test/matches.test.ts` — public search excludes filled/zero-slot matches | pass |
| AC-MMP-01-2 | P2-M2 | `test/matches.test.ts` — skill-range intersection filter | pass |
| AC-MMP-01-3 | P2-M2 | `test/matches.test.ts` — `cutoffAt` boundary excluded per D28 | pass |
| AC-MMP-01-4 | P2-M2 | `test/matches.test.ts` — unmatched filters return an empty collection | pass |
| AC-MMP-02-1 | P2-M2 | `test/matches.test.ts` + `test/matchServiceChain.e2e.test.ts` — split fee, MatchCreated and six concurrent real-HTTP hold retries yield one booking/match/outbox | pass |
| AC-MMP-02-2 | P2-M2 | `test/matches.test.ts` — organizer ownership/active-hold check rejects foreign booking | pass |
| AC-MMP-02-3 | P2-M2 | `test/matches.test.ts` — HTTP validation rejects capacity below two | pass |
| AC-MMP-02-4 | P2-M2 | `test/matches.test.ts` — free match persists zero participant fee | pass |
| AC-MMP-03-1 | P2-M2 | `test/matches.test.ts` + account `test/matchProfile.test.ts` — venue/time/fee/slots/tier plus D31 public/private identity contract | pass |
| AC-MMP-03-2 | P2-M2 | `test/matches.test.ts` — unauthenticated detail is visible with `canJoin=false` | pass |
| AC-MMP-04-1 | P2-M2 | `test/matches.test.ts` — open match creates JOIN `pending` | pass |
| AC-MMP-04-2 | P2-M2 | `test/matches.test.ts` + partial unique DB guard — duplicate active JOIN rejected | pass |
| AC-MMP-04-3 | P2-M2 | `test/matches.test.ts` — filled match rejects join | pass |
| AC-MMP-05-1 | P2-M2 | `test/matches.test.ts` — organizer lists pending+tier, approves and emits one JoinApproved; reject path transitions to `rejected` | pass |
| AC-MMP-05-2 | P2-M2 | `test/matches.test.ts` — non-organizer approve/list/reject return 403 | pass |
| AC-MMP-05-3 | P2-M2 | `test/matches.test.ts` — T+10 minute sweep returns unpaid approval to pending and async scheduler drains on shutdown | pass |
| AC-MMP-06-1 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” approved payment confirms JOIN and reserves platform via real HTTP/RabbitMQ/outbox | pass |
| AC-MMP-06-2 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” concurrent last-slot payments yield one confirmed, one rejected/refunded | pass |
| AC-MMP-06-3 | P2-M2 | `test/matches.test.ts` — free approval confirms without payment; concurrent last-slot approvals serialize to one 200/one 409 and never exceed capacity | pass |
| AC-MMP-06-4 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” final paid place emits exact MatchConfirmed settlement and real booking confirmation | pass |
| AC-MMP-07-1 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” pre-cutoff held-booking withdrawal refunds and reopens capacity through RabbitMQ | pass |
| AC-MMP-07-2 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” late withdrawal has no individual refund; whole-match cancellation applies D35 | pass |
| AC-MMP-07-3 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” withdrawal from a filled, unsettled match returns it to open | pass |
| AC-MMP-08-1 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” organizer cancellation refunds paid contributors and releases held booking | pass |
| AC-MMP-08-2 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” cutoff scheduler cancels, refunds and releases actual venue booking | pass |
| AC-MMP-08-3 | P2-M3 | `matchPayments.test.ts` + `matchFee.test.ts` + `matchFee.e2e.test.ts` â€” G1 policy snapshot cancellation and D37 rounding reach real finance ledger | pass |
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
| AC-FIN-05-1 | P2-M3 | `matchFee.test.ts` + `matchFee.e2e.test.ts` â€” personal debit/platform reserve append-only with real service path | pass |
| AC-FIN-05-2 | P2-M3 | `matchFee.test.ts` + `matchFee.e2e.test.ts` â€” exact D29 organizer shortfall settles booking and releases reserved | pass |
| AC-FIN-05-3 | P2-M3 | `matchFee.test.ts` + real HTTP/RabbitMQ `matchFee.e2e.test.ts` â€” redelivery is one reserve; every distinct D38 late/terminal/racing receipt is auto-matched and credited exactly once, never stranded or reserved twice | pass |
| AC-FIN-05-4 | P2-M3 | `matchFee.test.ts` + `matchFee.e2e.test.ts` â€” whole held-match cancellation refunds paid contributions and clears reserved | pass |
| AC-FIN-05-5 | P2-M3 | `matchFee.test.ts` + `matchFee.e2e.test.ts` â€” held pre-cutoff refund, confirmed/late no individual refund, D35 override | pass |
| AC-FIN-05-6 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” no MatchFunding/fee ledger; organizer pays booking through FIN-03 real API | pass |
| AC-FIN-05-7 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” capacity race refunds loser immediately without stranded reserve | pass |
| AC-FIN-05-8 | P2-M3 | `matchFee.e2e.test.ts` â€” completed + cancelled matches, empty RabbitMQ queues, scoped system-value conservation | pass |
