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
| P2-M1 | pass | `matchmaking-service`: default 15/15, RabbitMQ E2E 1/1, isolated DB guards 4/4; workspace typecheck/build; Harness status/doctor; Codex standards/spec re-review: no findings |
| P2-M2 | pass | `matchmaking-service`: 36 pass + real HTTP chain/race 1/1; `account-service`: 38 pass; `venue-booking-service`: isolated DB migration + 107 pass; schema isolation guards 4/4; workspace typecheck/build; Harness status/doctor; Codex standards/spec re-review: no findings |
| P2-M3 | pass | Fresh isolated migrations for finance/venue/matchmaking; focused AC suites: venue 4/4, matchmaking 33/33, finance 6/6; real HTTP/RabbitMQ/outbox `matchFee.e2e.test.ts` 11/11 including D38 receipt recovery, D39 retry/fencing, D40 authentication and D33 cancellation ordering; workspace typecheck/build; Harness status/doctor; incremental Codex review: no P0-P3 findings |
| P2-M4 | pass | Fresh isolated matchmaking migrations; HTTP AC/regression `evaluations.test.ts` 10/10 covers D41 window, D42 median/30-day pair detection and out-of-order BookingCompleted recovery; workspace typecheck/build; one Codex spec+correctness review found and resolved three real defects, with no remaining P0-P3 findings |
| P2-M5 | pass | Fresh isolated matchmaking migrations; real HTTP + Socket.IO `quickMatch.e2e.test.ts` 4/4 covers proposal, ordinary pending JOIN/10-minute JoinApproved hold, final-slot race and disconnect recovery; workspace typecheck/build; Harness status/doctor; one Codex two-axis review resolved the hold-evidence gap with no remaining actionable finding |
| P2-M6 | pass | `packages/ai` deterministic AC unit suite 6/6 plus isolated real HTTP `compatibility.e2e.test.ts` 2/2; F-02 grounds rating in match skill range and declares unavailable time/location inputs; shared-library-only F-04 creates neither match nor payment; workspace typecheck/build; one Codex two-axis review resolved grounded-input defects |
| P2-M7 | pass | Shared LangChain Gemini adapter `test/geminiMatchmaker.test.ts` 3/3 plus isolated real HTTP `test/aiMatchmaker.e2e.test.ts` 2/2; deterministic F-02 ranking, private/public prompt boundary, no-auto-JOIN and failure/timeout fallback; workspace typecheck/build; one Codex two-axis review resolved grounded-output and timeout defects |
| P2-M8 | pass | Fresh isolated Community migrations; real HTTP AC `test/community.e2e.test.ts` 9/9 + AccountLocked consumer 1/1 and Account producer regression 5/5 (2 historical skips); public-only content, verified-player gate, audited moderation/restore, private async tickets and versioned idempotent lock projection; workspace typecheck/build; one Codex two-axis review resolved restore and event-order/retry/shutdown defects |
| P2-M9 | pass | Shared LangChain grounded-answer selection + read-only policy corpus `packages/ai/test/supportAssistant.test.ts` 3/3; authenticated real HTTP `community-service/test/supportAssistant.e2e.test.ts` 6/6 + fail-closed auth 1/1; own-booking API only, cited retrieval, no-action cancellation guidance, privacy and Gemini/venue fallback; workspace typecheck/build; one Codex two-axis review resolved retrieval, intent, JWT and error-boundary defects |
| P2-FE0 | pass | `apps/web/test/playoFoundation.test.tsx` 3/3; Playwright desktop/mobile chrome check with zero console errors; workspace typecheck/build; one Codex review resolved dead future-route links, auth-session refresh, avatar focus and toast timeout |
| P2-FE1 | pass | `apps/web/test/playoFoundation.test.tsx`, `playoPhase1Pages.test.tsx`, `bookingCancellation.test.tsx` 7/7; workspace typecheck and web build; local Playwright desktop/mobile inspection of Home, Auth, Venue error-state and Booking error-state; one Codex diff review resolved auth continuation/reset, hold expiry, provider visibility, admin confirmation, profile-cancelled and real-field rendering defects |

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
| AC-MMP-10-1 | P2-M4 | isolated HTTP `test/evaluations.test.ts` — confirmed same-match player submits within D41 72h; out-of-order `BookingCompleted` is durably reconciled | pass |
| AC-MMP-10-2 | P2-M4 | isolated HTTP `test/evaluations.test.ts` — outside player receives 403 | pass |
| AC-MMP-10-3 | P2-M4 | isolated HTTP `test/evaluations.test.ts` — submission at 72h + 1ms receives `EVALUATION_WINDOW_CLOSED` | pass |
| AC-MMP-10-4 | P2-M4 | isolated HTTP `test/evaluations.test.ts` — self evaluation is rejected | pass |
| AC-MMP-11-1 | P2-M1 | `test/passport.test.ts` — own HTTP view returns rating/RD, 5-match history and exact filtered evaluation mean | pass |
| AC-MMP-11-2 | P2-M1 | `test/passport.test.ts` — public HTTP view is exactly userId + tier + matchesPlayed | pass |
| AC-F01-1 | P2-M1 | `test/rating.test.ts` — approved TB cold-start center and high-RD state | pass |
| AC-F01-2 | P2-M1 | `test/rating.test.ts` + `test/passport.test.ts` + `test/ratingRabbit.e2e.test.ts` — stronger-opponent wins raise μ/reduce RD; broker event persists once across replay | pass |
| AC-F01-3 | P2-M1 | `test/rating.test.ts` — equal μ with RD 300 vs 80 exposes high vs established confidence | pass |
| AC-F01-4 | P2-M1 | `test/rating.test.ts` — order-independent identical output plus canonical Glicko-2 worked example | pass |
| AC-F02-1 | P2-M6 | `packages/ai/test/compatibility.test.ts` — nearby rating/RD with matched facts scores high and names the rating gap; isolated HTTP `test/compatibility.e2e.test.ts` exposes the score to the organizer | pass |
| AC-F02-2 | P2-M6 | `packages/ai/test/compatibility.test.ts` — 800-point newcomer/advanced gap scores low with concrete skill-gap reason; isolated HTTP regression grounds target in advanced match range, not organizer rating | pass |
| AC-F02-3 | P2-M6 | `packages/ai/test/compatibility.test.ts` — every score has a non-empty explanation; HTTP response declares unavailable time/location facts instead of inventing a match | pass |
| AC-F03-1 | P2-M5 | isolated real Socket.IO `test/quickMatch.e2e.test.ts` — authenticated player receives the one-slot open-match proposal over direct matchmaking WS | pass |
| AC-F03-2 | P2-M5 | isolated real HTTP + Socket.IO `test/quickMatch.e2e.test.ts` — WS accept creates ordinary `pending` JOIN; organizer approval emits exact `JoinApproved.expiresAt = approvedAt + 10m` | pass |
| AC-F03-3 | P2-M5 | isolated real HTTP + Socket.IO `test/quickMatch.e2e.test.ts` — concurrent WS candidates remain pending; concurrent organizer approvals serialize to one `approved` hold and one `MATCH_FULL` 409 | pass |
| AC-F03-4 | P2-M5 | isolated real Socket.IO `test/quickMatch.e2e.test.ts` — disconnect before accept writes no JOIN/hold; next player joins and is the only pending request | pass |
| AC-F04-1 | P2-M6 | `packages/ai/test/compatibility.test.ts` — eight ordered candidates partition into two capacity-four low-variance groups with explanations | pass |
| AC-F04-2 | P2-M6 | `packages/ai/test/compatibility.test.ts` — proposal requires confirmation and has no created match or payment action | pass |
| AC-F04-3 | P2-M6 | `packages/ai/test/compatibility.test.ts` — non-divisible candidate count leaves an explicit unmatched remainder, never a forced partial group | pass |
| AC-F07-1 | P2-M4 | isolated HTTP `test/evaluations.test.ts` — median deviation of two tiers after three peer ratings is flagged with explanation and excluded | pass |
| AC-F07-2 | P2-M4 | isolated HTTP `test/evaluations.test.ts` — canonical pair lock flags reciprocal top-tier evidence across three completed matches within 30 days | pass |
| AC-F07-3 | P2-M4 | isolated HTTP `test/evaluations.test.ts` — Admin approves into Passport aggregate or permanently rejects | pass |
| AC-F07-4 | P2-M4 | isolated HTTP `test/evaluations.test.ts` — flag only explains/excludes; it does not alter Glicko rating or punish | pass |
| AC-COM-01-1 | P2-M8 | isolated HTTP `test/community.e2e.test.ts` - feed excludes hidden/removed posts | pass |
| AC-COM-01-2 | P2-M8 | isolated unauthenticated HTTP feed/detail requests succeed | pass |
| AC-COM-01-3 | P2-M8 | isolated HTTP feed returns an empty `posts` array without error | pass |
| AC-COM-02-1 | P2-M8 | isolated HTTP verified-player post is immediately `published` and appears publicly | pass |
| AC-COM-02-2 | P2-M8 | isolated HTTP rejects empty or >5,000-character text-only post payloads | pass |
| AC-COM-02-3 | P2-M8 | versioned `AccountLocked` projection blocks post creation; stale lock cannot overwrite newer unlock | pass |
| AC-COM-03-1 | P2-M8 | isolated HTTP author edit changes body and sets `editedAt` | pass |
| AC-COM-03-2 | P2-M8 | isolated HTTP non-author edit receives 403 | pass |
| AC-COM-04-1 | P2-M8 | isolated HTTP author delete persists `removed` and hides public post | pass |
| AC-COM-04-2 | P2-M8 | isolated HTTP non-author delete receives 403 | pass |
| AC-COM-05-1 | P2-M8 | isolated HTTP comment on published post appears in public detail | pass |
| AC-COM-05-2 | P2-M8 | isolated HTTP comment on removed post receives 409 | pass |
| AC-COM-05-3 | P2-M8 | isolated HTTP own comment soft-removes; another author receives 403 | pass |
| AC-COM-06-1 | P2-M8 | isolated HTTP report writes open Report + atomic `ContentReported` Outbox while post remains published | pass |
| AC-COM-06-2 | P2-M8 | isolated HTTP repeated reporter/target report receives 409 | pass |
| AC-COM-07-1 | P2-M8 | isolated HTTP Admin removal sets target removed/report actioned and appends audit | pass |
| AC-COM-07-2 | P2-M8 | isolated HTTP dismiss leaves published target and marks report dismissed | pass |
| AC-COM-07-3 | P2-M8 | isolated HTTP non-Admin moderation request receives 403 | pass |
| AC-COM-07-4 | P2-M8 | isolated HTTP audit checks retain removed records; hidden content has audited Admin restore only | pass |
| AC-COM-08-1 | P2-M8 | isolated HTTP creates open ticket with player message; requester/Admin-only list/detail access | pass |
| AC-COM-08-2 | P2-M8 | isolated HTTP Admin reply transitions ticket to `in_progress` and is visible to requester | pass |
| AC-COM-08-3 | P2-M8 | isolated HTTP other player ticket detail receives 403 | pass |
| AC-COM-08-4 | P2-M8 | isolated HTTP Admin transition follows `in_progress` -> `resolved` -> `closed` | pass |
| AC-AI-01-1 | P2-M7 | isolated HTTP `test/aiMatchmaker.e2e.test.ts` — three public open matches rank by deterministic F-02 score and each carries an explanation | pass |
| AC-AI-01-2 | P2-M7 | `packages/ai/test/geminiMatchmaker.test.ts` — Gemini may select only verified F-02 reason indexes; local renderer always returns concrete text | pass |
| AC-AI-01-3 | P2-M7 | `packages/ai/test/geminiMatchmaker.test.ts` + isolated HTTP `test/aiMatchmaker.e2e.test.ts` — provider error or 4-second timeout returns short deterministic fallback without failing the request | pass |
| AC-AI-01-4 | P2-M7 | isolated HTTP `test/aiMatchmaker.e2e.test.ts` — suggestions leave zero JOIN rows; only the subsequent explicit MMP-04 POST creates one | pass |
| AC-AI-01-5 | P2-M7 | `packages/ai/test/geminiMatchmaker.test.ts` + isolated HTTP `test/aiMatchmaker.e2e.test.ts` — prompt receives public match snapshot/own deterministic score only and excludes organizer identifier | pass |
| AC-AI-02-1 | P2-M9 | shared read-only BR-BOK-05 corpus retrieval + isolated authenticated HTTP response cite the retrieved policy chunk | pass |
| AC-AI-02-2 | P2-M9 | isolated authenticated HTTP calls only `/players/me/bookings`, selects caller's nearest booking, and cites `own-booking` | pass |
| AC-AI-02-3 | P2-M9 | isolated HTTP question about user B invokes neither booking retrieval nor Gemini and returns privacy guidance | pass |
| AC-AI-02-4 | P2-M9 | isolated HTTP variants of cancellation request return standard `actionPath` without any mutation call | pass |
| AC-AI-02-5 | P2-M9 | isolated HTTP injected Gemini failure returns short busy fallback; Venue retrieval outage is separately guided | pass |
| AC-AI-02-6 | P2-M9 | shared adapter permits only local candidate indexes and isolated HTTP returns BR-BOK-05/own-booking citations | pass |
| AC-FIN-05-1 | P2-M3 | `matchFee.test.ts` + `matchFee.e2e.test.ts` â€” personal debit/platform reserve append-only with real service path | pass |
| AC-FIN-05-2 | P2-M3 | `matchFee.test.ts` + `matchFee.e2e.test.ts` â€” exact D29 organizer shortfall settles booking and releases reserved | pass |
| AC-FIN-05-3 | P2-M3 | `matchFee.test.ts` + real HTTP/RabbitMQ `matchFee.e2e.test.ts` â€” redelivery is one reserve; every distinct D38 late/terminal/racing receipt is auto-matched and credited exactly once, never stranded or reserved twice | pass |
| AC-FIN-05-4 | P2-M3 | `matchFee.test.ts` + `matchFee.e2e.test.ts` â€” whole held-match cancellation refunds paid contributions and clears reserved | pass |
| AC-FIN-05-5 | P2-M3 | `matchFee.test.ts` + `matchFee.e2e.test.ts` â€” held pre-cutoff refund, confirmed/late no individual refund, D35 override | pass |
| AC-FIN-05-6 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” no MatchFunding/fee ledger; organizer pays booking through FIN-03 real API | pass |
| AC-FIN-05-7 | P2-M3 | `matchPayments.test.ts` + `matchFee.e2e.test.ts` â€” capacity race refunds loser immediately without stranded reserve | pass |
| AC-FIN-05-8 | P2-M3 | `matchFee.e2e.test.ts` â€” completed + cancelled matches, empty RabbitMQ queues, scoped system-value conservation | pass |
| AC-UI-01-1 | P2-FE1 | `HomePage` + desktop/mobile Playwright inspection — bright green split Hero stacks at mobile | pass |
| AC-UI-01-2 | P2-FE1 | `playoFoundation.test.tsx` + source scan — no sport grid/store CTA/navy legacy token | pass |
| AC-UI-01-3 | P2-FE1 | `HomePage` explains the intentional hidden carousel until a PO-selected location; CTA opens real `/venues` search | pass |
| AC-UI-01-4 | P2-FE1 | `HomePage` renders four Vietnamese native accordion questions | pass |
| AC-UI-01-5 | P2-FE1 | shared `Footer` inspected in desktop/mobile browser; no store badge | pass |
| AC-UI-01-6 | P2-FE1 | Playwright 390px and 1440px screenshots; light preloader/skeleton state present | pass |
| AC-UI-02-1 | P2-FE1 | `AuthForm` + `Modal` test/browser — two-column desktop, single-column mobile, X/backdrop/Esc/focus trap | pass |
| AC-UI-02-2 | P2-FE1 | `AuthForm` only exposes real email/password register/login APIs; no SMS OTP | pass |
| AC-UI-02-3 | P2-FE1 | `AuthForm` rendered tabs, required fields, inline error/status states | pass |
| AC-UI-02-4 | P2-FE1 | `playoPhase1Pages.test.tsx` verifies email resend UI; real verify/resend/reset APIs and modal-close navigation wired | pass |
| AC-UI-02-5 | P2-FE1 | `accountApi` real login stores access/refresh/roles; AuthPage routes successful login to profile | pass |
| AC-UI-03-1 | P2-FE1 | `VenueListPage` has one badminton list, no sport/coaching/event tabs | pass |
| AC-UI-03-2 | P2-FE1 | `VenueListPage` maps city/location query to lat/lng and calls real `searchVenues` | pass |
| AC-UI-03-3 | P2-FE1 | real VenueCard shows bookable badge/name/address/distance/price; unsupported image/rating fields remain hidden per page API rule | pass |
| AC-UI-03-4 | P2-FE1 | client name filter plus radius and distance/name sort update the real result set | pass |
| AC-UI-03-5 | P2-FE1 | 3/2/1 grid and Vietnamese loading/empty/error states inspected | pass |
| AC-UI-04-1 | P2-FE1 | `VenueDetailPage` has breadcrumb/header/sticky CTA; real image carousel renders only when API supplies images | pass |
| AC-UI-04-2 | P2-FE1 | real detail renders badminton courts only; no multi-sport section or invented values | pass |
| AC-UI-04-3 | P2-FE1 | real amenities and map render when returned; unsupported operating-time field is intentionally omitted | pass |
| AC-UI-04-4 | P2-FE1 | real `venueId` CTA creates `/booking?venueId=` with mobile fixed CTA | pass |
| AC-UI-04-5 | P2-FE1 | 2→1 layout and Vietnamese loading/empty/error/404 branches implemented | pass |
| AC-UI-05-1 | P2-FE1 | `BookingPage` renders bright two-column schedule/summary and three-step indicator | pass |
| AC-UI-05-2 | P2-FE1 | source scan/browser shows no sport selector or karma banner | pass |
| AC-UI-05-3 | P2-FE1 | `SlotGrid` renders available, own real hold, own confirmed booking and API-ambiguous unavailable states without mislabeling holds as bookings | pass |
| AC-UI-05-4 | P2-FE1 | `HoldCountdown` expiry clears hold/selection/booking, reloads real availability and prompts selection again | pass |
| AC-UI-05-5 | P2-FE1 | real hold/create-booking, balance payment and SePay intent/match code clients are wired | pass |
| AC-UI-05-6 | P2-FE1 | 401-sensitive action opens auth modal, retries after real login; Vietnamese loading/empty/error and mobile summary layout present | pass |
| AC-UI-06-1 | P2-FE1 | `ProfilePage` bright two-column sticky user card and tabs | pass |
| AC-UI-06-2 | P2-FE1 | source scan — no Karma/Gift Cards/Playpals and only project data shown | pass |
| AC-UI-06-3 | P2-FE1 | real booking APIs populate Sắp tới/Đã qua/Đã hủy segments | pass |
| AC-UI-06-4 | P2-FE1 | real personal/business balances, wallet-ledger entries and SePay top-up intent | pass |
| AC-UI-06-5 | P2-FE1 | real `DisputePanel` is mounted from profile tab | pass |
| AC-UI-06-6 | P2-FE1 | real profile update/change-password forms, Vietnamese empty/error and responsive grid | pass |
| AC-UI-07-1 | P2-FE1 | bright admin DataTable has green tabs, sticky header and action column | pass |
| AC-UI-07-2 | P2-FE1 | four GĐ1 operation areas; finance/dispute/reject mutations require reason and confirmation modal | pass |
| AC-UI-07-3 | P2-FE1 | real admin providers/finance/dispute clients retained behind existing App role guard | pass |
| AC-UI-07-4 | P2-FE1 | semantic provider badges plus empty/error and horizontally scrollable mobile table | pass |
