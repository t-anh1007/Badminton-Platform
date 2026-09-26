# Competitive Matches V2 Implementation Plan

> **Execution:** Claude Code executes Tasks 1-25 directly, task by task (`superpowers:executing-plans`), without dispatching subagents. Task 26 belongs to an independent reviewer (Codex). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver competitive singles/doubles matches funded at 5:5, 6:4, or 7:3; evidence-backed result handling; provider recommendation plus final Admin decision; withdrawable result refunds; separate singles/doubles Glicko-2; seasonal leaderboards, badges, and Admin-funded rewards.

**Architecture:** Keep the existing services. `matchmaking-service` remains the authority for match configuration, roster, result cases, rating, seasons, leaderboards, badges, and reward-program definitions. `venue-booking-service` remains the authority for bookings and venue/provider snapshots; `finance-service` remains the only writer for money, ledger, result reserve, and manual reward-payout records; `account-service` projects in-app notifications and sends required email; `community-service` remains the support-ticket authority.

**Tech Stack:** TypeScript, Node.js 20+, Express, Zod, Prisma/PostgreSQL, RabbitMQ outbox/consumer pattern, React 19/Vite, Vitest/Supertest, Playwright, S3-compatible private object storage.

**Spec:** `docs/product/specs/competitive-matches.md`

**Business authority:** `docs/product/specs/competitive-matches.md` together with D56-D57 in `docs/product/decision-log.md`.

**Visual/UI authority:** `docs/matchmaking-passport/mockups/desktop-preview.html`. It governs approved presentation, copy, layout, and visible states only; it cannot add or override business, money, rating, API, or service rules.

## Status

Active — specification approved; implementation has not started.

## Global Constraints

- Do not create a new microservice, wallet, direct user-to-user transfer, Court Credit, XP, or level system.
- Store all money as integer VND/`BigInt`; preserve every đồng through append-only ledger entries and idempotent events.
- For an already-paid booking, reuse its existing payment, `BookingRevenue`, and commission. Match cutoff must never create booking settlement, provider revenue, or commission a second time.
- Read ratios as loser:winner. Use `resultReserve = floor(P × (loserPart - winnerPart) / 10)`, `totalContribution = P + resultReserve`, `feePerSlot = floor(totalContribution / capacity)`, and `organizerContribution = totalContribution - feePerSlot × (capacity - 1)`. The organizer absorbs all integer remainder.
- A paid-booking organizer contributes through the existing booking payment. At a valid cutoff, refund `P - organizerContribution` to their personal `available + withdrawable`; keep exactly `resultReserve` locked.
- Provider recommendation is non-binding. Provider timeout and Admin timeout never finalize, release money, or update rating.
- Backend timestamps and schedulers are authoritative. Client countdowns only render server deadlines.
- Evidence is private, immutable after commit, JPG/PNG/WebP, 1–3 images per submission, 5 MB per image, maximum five images per user per case, and binary-retained until 90 days after case closure.
- Public APIs may expose sports result, score, discipline, and rating delta; they must not expose contributions, refund amounts, bank data, or evidence.
- User-facing UI uses Vietnamese business language. Never expose technical terms such as `cutoff`, `reserve`, `contribution`, `settlement`, ledger/event names, or raw statuses; use “hạn chốt kèo”, “tiền đang giữ chờ kết quả”, “phần tiền kèo”, “ghi nhận tiền sân”, and explicit business-state labels instead.
- Match UI must render venue name, full address, court, date, and playing slot from the authoritative booking snapshot. Participant display name and avatar come from the authoritative account profile; use initials only when that account has no avatar.
- Admin UI must reuse the current COURTIN Admin shell, including its existing left vertical navigation; do not replace it with a new top-navigation-only pattern.
- User-facing COURTIN copy uses the single hyphen-minus `-` as the official separator; do not use en dash `–` or double hyphens. Keep compact period names such as `Tháng 9-10/2026` on one line.
- Desktop Admin tables must fit at browser zoom 100% without horizontal overlap, clipped labels, or displaced actions. Give action columns a stable width, keep each row aligned, and allow descriptive text to wrap without moving the action button outside its row/card.
- Use the current 34 province-level units from Resolution 202/2025/QH15. Store stable application slugs from `VIETNAM_PROVINCES`; do not derive regions from free-text addresses.
- The 14 companion mockups have PO approval. Do not implement product UI until Task 1 has also synchronized and verified the durable repository preview used by executors.
- Never run production migrations, deploy, push, or change production infrastructure/configuration (including applying R2 CORS or bucket settings) unless the PO explicitly authorizes that specific command.
- Validation authority (PO, 2026-09-25, whole implementation session): Claude may run Prisma migrations against the local/dev database, focused tests, Prisma validate/generate, and typecheck of the affected workspaces whenever a task needs them. Full build, full service suites, and E2E belong to Task 26 unless a specific task genuinely requires that proof.
- Plan and spec contracts are binding on observable behavior and business invariants. Only minimal implementation details may be adjusted when existing code requires it; every deviation must preserve behavior and be recorded under Decisions. A deviation that changes an API contract or business rule stops execution for a PO decision.
- Pre-existing red Web tests are recorded as a baseline with exact output before the first Web task. A pre-existing failure does not block a task when evidence shows it predates the change; any new regression must be fixed.

## Execution Roles And Review Gates

- Claude Opus 5.5 implements Tasks 1-25 and stops at each gate below. Task 26 is reserved for an independent reviewer (Codex); Claude does not self-accept, close, or move this plan to `docs/plans/completed/`.
- At a gate Claude stops, reports the edited scope (files/workspaces touched and commands run with results), and gives the PO a ready-to-paste Codex review prompt. Claude does not prescribe what Codex should look for.
- After Codex review passes and any findings are fixed, Claude creates one local checkpoint commit on `TuanAnh` (never pushed). No checkpoint commit is created before its gate passes. Task 26 reviews the diff between these checkpoints.

| Gate | Tasks | Scope |
|---|---|---|
| G1 | T1-5 | Durable mockup, shared contracts, private storage/checksum, booking source, match creation |
| G2 | T6-9 | Finance funding schema, contribution collection, cutoff settlement/rebalance, cancellation and late receipt |
| G3 | T10-14 | Result cases, evidence, claims, schedulers, provider/Admin dispute, result-reserve release |
| G4 | T15-21 | Dual Passport, rating-correction ticket, seasons, rated results/leaderboards, badges, reward programs, reward payouts |
| G5 | T22-25 | Notification persistence/email delivery and all player/provider/Admin UI |

## Locked File And Module Ownership

| Concern | Owner | Reuse instead of redesign |
|---|---|---|
| Match creation, roster, result case, rating, seasons, leaderboard, program definition | `matchmaking-service` | Existing `Match`, `Join`, `Passport`, outbox, cutoff scheduler, Glicko-2 implementation |
| Booking source, venue province, provider identity, booking state | `venue-booking-service` | Existing match-context internal API, booking source list, provider ownership checks |
| Contributions, booking settlement, result reserve, refunds, payout audit | `finance-service` | Existing `MatchFunding`, `MatchContribution`, `postLedgerEntry`, personal `withdrawable`, withdrawal/payout patterns |
| Evidence binary | Existing `@khoaluantn/object-storage` package | Existing presigned upload, ownership assertion, private signed reads, delete operation |
| Tier-correction request | `community-service` | Existing support tickets, messages, Admin queue, outbox |
| In-app and email notifications | `account-service` | Existing `UserNotificationRequested`, notification projection, `emailSender` |
| Player/provider/Admin UI | `apps/web` | Existing pages, API clients, role guards, tables, drawers, modal/two-step confirmation components |

## Review Focus

1. Paid-booking replay or concurrent cutoff must leave exactly one existing booking revenue/commission and one owner rebalance.
2. Odd VND prices in doubles must conserve total value; only the organizer receives/pays the deterministic remainder.
3. Concurrent claims, objections, scheduler ticks, and Admin actions must produce one terminal result and one financial/rating effect.
4. Evidence with the wrong owner, namespace, checksum, MIME type, size, role, or retention state must never become readable or attached.
5. Same-opponent rolling-seven-day checks, week-boundary RD aging, season boundaries, and crossing rating 1600 must remain deterministic under replay.

## Dependency Graph

```text
T1 durable approved-mockup baseline
  -> T2 shared contracts/storage/provinces
     -> T3 venue booking source + province/provider snapshot
     -> T4 match configuration schema
        -> T5 create/join/team flow
     -> T6 finance funding schema
        -> T7 contribution collection
           -> T8 cutoff settlement/rebalance
              -> T9 cancellation + late receipt
     -> T10 result/evidence schema
        -> T11 score claim
           -> T12 response/incident schedulers
              -> T13 provider/Admin dispute
                 -> T14 financial result release
     -> T15 dual passport
        -> T16 rating-correction ticket
        -> T17 season/region foundation
           -> T18 rated-result pipeline + leaderboard
              -> T19 badges
              -> T20 reward programs/finalization
                 -> T21 reward payout records
  -> T22 required email delivery
  -> T23 player match UI
  -> T24 result/passport/leaderboard UI
     -> T25 provider/Admin/reward UI
  -> T26 cross-service and runtime verification
```

## Exact Per-Task Verification Commands

Validation for these commands is pre-approved for the implementation session (see Global Constraints). A task is complete only when its listed verification succeeds and the task-specific expected result below is true.

**Local migration step.** Tests run against the local/dev database from the root `.env`. Every task that changes a Prisma schema (T3, T4, T6, T10, T15, T16, T17, T18, T19, T20, T21, T22) first applies its new migration locally, then regenerates the client, before its focused tests:

```powershell
npm run prisma:migrate:deploy --workspace @khoaluantn/<service>
npm run prisma:generate --workspace @khoaluantn/<service>
```

Never point these commands at a production database.

```powershell
# T1: manual 14-screen review plus stale-copy scan; any match fails the task
$staleCopy = rg -n "Credit|24 giờ khiếu nại|365 ngày" docs/matchmaking-passport/mockups/desktop-preview.html
if ($LASTEXITCODE -eq 0) { $staleCopy; throw 'Stale competitive-match copy remains.' }

# T2
npm test --workspace @khoaluantn/object-storage -- objectStorage.test.ts
npm run typecheck --workspace @khoaluantn/shared
npm run typecheck --workspace @khoaluantn/object-storage

# T3
npm test --workspace @khoaluantn/venue-booking-service -- matchContext.test.ts venue.test.ts
npm run prisma:validate --workspace @khoaluantn/venue-booking-service
npm run typecheck --workspace @khoaluantn/venue-booking-service

# T4
npm test --workspace @khoaluantn/matchmaking-service -- g0Database.test.ts
npm run prisma:validate --workspace @khoaluantn/matchmaking-service

# T5
npm test --workspace @khoaluantn/matchmaking-service -- matchRules.test.ts matches.test.ts matchPayments.test.ts
npm run typecheck --workspace @khoaluantn/matchmaking-service

# T6
npm test --workspace @khoaluantn/finance-service -- matchFee.test.ts
npm run prisma:validate --workspace @khoaluantn/finance-service

# T7
npm test --workspace @khoaluantn/finance-service -- matchFee.test.ts matchFee.e2e.test.ts

# T8
npm test --workspace @khoaluantn/matchmaking-service -- matchPayments.test.ts matchServiceChain.e2e.test.ts
npm test --workspace @khoaluantn/venue-booking-service -- matchContext.test.ts
npm test --workspace @khoaluantn/finance-service -- matchFee.test.ts

# T9
npm test --workspace @khoaluantn/matchmaking-service -- matchPayments.test.ts
npm test --workspace @khoaluantn/finance-service -- matchFee.test.ts refund.test.ts

# T10
npm test --workspace @khoaluantn/matchmaking-service -- resultEvidence.test.ts
npm run prisma:validate --workspace @khoaluantn/matchmaking-service

# T11
npm test --workspace @khoaluantn/matchmaking-service -- matchResults.test.ts

# T12
npm test --workspace @khoaluantn/matchmaking-service -- resultLifecycle.test.ts

# T13
npm test --workspace @khoaluantn/matchmaking-service -- resultDisputes.test.ts

# T14
npm test --workspace @khoaluantn/finance-service -- matchResult.test.ts matchFee.e2e.test.ts

# T15
npm test --workspace @khoaluantn/matchmaking-service -- passport.test.ts ratingRabbit.e2e.test.ts
npm run prisma:validate --workspace @khoaluantn/matchmaking-service

# T16: community runner intentionally executes its isolated full suite
npm test --workspace @khoaluantn/community-service
npm test --workspace @khoaluantn/matchmaking-service -- passport.test.ts
npm run prisma:validate --workspace @khoaluantn/community-service

# T17
npm test --workspace @khoaluantn/matchmaking-service -- seasons.test.ts
npm run prisma:validate --workspace @khoaluantn/matchmaking-service

# T18
npm test --workspace @khoaluantn/matchmaking-service -- ratedResults.test.ts leaderboards.test.ts rating.test.ts
npm run prisma:validate --workspace @khoaluantn/matchmaking-service

# T19
npm test --workspace @khoaluantn/matchmaking-service -- badges.test.ts
npm run prisma:validate --workspace @khoaluantn/matchmaking-service

# T20
npm test --workspace @khoaluantn/matchmaking-service -- rewards.test.ts
npm run prisma:validate --workspace @khoaluantn/matchmaking-service

# T21
npm test --workspace @khoaluantn/finance-service -- rewardPayout.test.ts
npm run prisma:validate --workspace @khoaluantn/finance-service

# T22
npm test --workspace @khoaluantn/account-service -- notificationProjection.test.ts email.test.ts
npm test --workspace @khoaluantn/web -- dataInvalidation.test.tsx
npm run prisma:validate --workspace @khoaluantn/account-service

# T23
npm test --workspace @khoaluantn/web -- MatchListPage.created.test.tsx MatchListPage.sources.test.tsx MatchDetailPage.competitive.test.tsx MatchDepositCheckout.test.tsx matchCommunitySupportSurfaces.test.tsx ManageVenueDetailPage.shutdownStatus.test.tsx

# T24
npm test --workspace @khoaluantn/web -- ImageUploadPicker.test.tsx MatchResultFlow.test.tsx PassportPage.test.tsx LeaderboardPage.test.tsx RewardProgramsPage.test.tsx RewardProgramDetailPage.test.tsx RewardPayoutsPage.test.tsx

# T25
npm test --workspace @khoaluantn/web -- ManageMatchResultsPage.test.tsx AdminMatchResultsPage.test.tsx AdminSeasonsPage.test.tsx AdminRewardProgramsPage.test.tsx AdminRewardPayoutsPage.test.tsx
```

Task 26 is reserved for the independent reviewer (Codex). After gate G5 passes, the reviewer runs the repository-wide and runtime commands listed in Task 26; Claude must not mark the plan complete or move it to `docs/plans/completed/`.

Before Task 16 or Task 26, use the repository's existing isolated Community test database. `COMMUNITY_TEST_DATABASE_URL` must target PostgreSQL schema `community_test`; do not point the test runner at development or production data.

---

### Task 1: Persist The Approved Desktop Mockup Baseline

**Goal:** Replace the stale Credit-based repository preview with the 14 already-approved real-money screens so executors have one durable visual source before product UI code.

**Rules/AC:** BR-CM-01..42, BR-CM-51, BR-CM-55..70; mockup gate in spec §14.

**Files:**

- Read: `docs/design/design-system.md`
- Read: `docs/design/pages/08-match.md`
- Read: `docs/design/pages/09-passport.md`
- Read: `.superpowers/brainstorm/1471-1790321736/content/01-create-from-paid-booking-v3-approved.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/02-match-waiting-for-lock-v3-approved.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/03-submit-score-evidence.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/04-confirm-or-object.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/05-report-incident.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/06-player-passport.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/07-leaderboard.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/08-public-reward-detail.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/09-provider-review.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/10-admin-final-decision.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/11-admin-season-management.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/12-admin-reward-program.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/13-winner-bank-information.html`
- Read: `.superpowers/brainstorm/1471-1790321736/content/14-admin-payout-proof.html`
- Modify: `docs/matchmaking-passport/mockups/desktop-preview.html`
- Create: `ai-notes/competitive-matches-desktop-preview-s01.png` … `-s14.png` (one full-page capture per screen)

**Reuse:** Keep the existing one-file desktop preview shell and screen switcher, but replace every stale screen body with the approved companion HTML. Preserve the approved COURTIN tokens, current Admin vertical navigation, business-language labels, single-hyphen copy, and 100% zoom fit notes. Do not introduce a frontend framework or design dependency. The companion directory is an input only; `docs/matchmaking-passport/mockups/desktop-preview.html` becomes the durable visual/UI authority. Business authority remains `competitive-matches.md` plus D56-D57.

**Required screens:**

```text
01 Create from held slot / paid booking
02 Match detail, teams, ratio and contribution status
03 Submit score + 1–3 evidence images
04 Confirm or object within 12 hours
05 Incident/no-show/no-declaration flow
06 Singles/doubles Passport
07 Global/province leaderboard
08 Public reward-program detail
09 Provider recommendation queue and case detail
10 Admin decision preview + second confirmation
11 Admin season management
12 Admin reward-program setup
13 Winner bank-information deadline
14 Admin payout proof and transaction reference
```

**Approved screen-to-task map:**

| Screens | Product implementation owner |
|---|---|
| 01-02 | Task 23 |
| 03-05 | Task 24 result flow |
| 06 | Task 24 Passport and paginated match history |
| 07-08 | Task 24 leaderboard and public reward detail |
| 09 | Task 25 provider review |
| 10 | Task 25 Admin final decision |
| 11-12 | Task 25 season and reward-program Admin pages |
| 13 | Task 24 winner payout information |
| 14 | Task 25 Admin payout proof |

- [x] Copy the approved 14 screen bodies into the durable preview in the exact order above. Preserve their labels, amounts, states, and layout, then apply only the already-approved follow-up corrections: current role shell/navigation, Vietnamese business language, single-hyphen separators, authoritative booking/profile data notes, and 100% zoom fit.

- [x] Remove every Court Credit, Credit Pool, 24-hour objection, 72-hour program-close, and 365-day evidence-retention reference.
- [x] Screen 01 approved by the PO on 2026-09-25 after replacing technical terms such as `cutoff` with Vietnamese business wording; apply the same copy rule to every later screen.
- [x] Screen 02 approved by the PO on 2026-09-25 with venue/address/slot sourced from the booking and participant name/avatar sourced from account profiles.
- [x] Screen 03 approved by the PO on 2026-09-25. Production evidence images must use persistent object storage and remain available across application restart/redeploy; do not store image bytes on ephemeral application disks.
- [x] Screen 04 approved by the PO on 2026-09-25 with a single simple choice between confirming the submitted result and opening an evidence-backed objection.
- [x] Screen 05 approved by the PO on 2026-09-25 with incident selection, mandatory evidence, and clear non-binding provider recommendation before the final Admin decision.
- [x] Screen 06 approved by the PO on 2026-09-25 with independent singles/doubles views; ranking position and paginated match history are separate inner tabs.
- [x] Screen 07 approved by the PO on 2026-09-25 with discipline, platform/province, and rating-band filters plus the user's pinned position.
- [x] Screen 08 approved by the PO on 2026-09-25 with public countdown, scope, configurable prize tiers, provisional user position, tie handling, and separate reward funding disclosure.
- [x] Screen 09 approved by the PO on 2026-09-25 with provider queue, private evidence review, three recommendation outcomes, and explicit non-binding language.
- [x] Screen 10 approved by the PO on 2026-09-25 with final Admin outcome selection, money/rating/booking impact preview, required reason, and second confirmation.
- [x] Screen 11 approved by the PO on 2026-09-25 with the current COURTIN Admin vertical navigation, non-overlapping season dates, single-hyphen copy, and a 100% zoom fit requirement for table actions.
- [x] Screen 12 approved by the PO on 2026-09-25 with one system criterion per program, season-bounded dates, discipline/rating-band/scope selection, configurable prize tiers, and publication lock disclosure.
- [x] Screen 13 approved by the PO on 2026-09-25 with the seven-day winner deadline, only the approved contact/address/bank fields, forfeiture disclosure, and no deep identity or age verification.
- [x] Screen 14 approved by the PO on 2026-09-25 with required transaction reference, persistent payout-proof image, receiver/amount confirmation, and automatic in-app plus email notification.
- [x] Show 5:5, 6:4, and 7:3 as loser:winner; include a paid-booking example that explicitly says the booking is not charged again.
- [x] Show provider recommendation as “Đề xuất - chưa có hiệu lực” and Admin overdue as locked, not auto-settled.
- [x] Capture the complete durable preview at desktop width as the Task 1 verification artifact. Do not open a new visual-approval cycle unless it differs from the approved companion screens beyond the listed follow-up corrections.
- [x] All 14 desktop screens explicitly approved by the PO on 2026-09-25; the visual approval gate is satisfied, but this approval does not itself authorize product implementation.

**Verification:** Open `desktop-preview.html`, switch through all 14 screens at browser zoom 100%, and search the file for `Credit|24 giờ khiếu nại|365 ngày`. Expected: all screens render without displaced actions or horizontal overflow and the search returns no stale product wording. This persistence step does not require another PO visual approval unless the durable preview differs beyond the already-approved follow-up corrections.

**Depends on:** none. **Blocks:** Tasks 2–26.

---

### Task 2: Add Shared Competitive Contracts, Province Catalog, And Evidence Metadata

**Goal:** Give every service one exact vocabulary for competitive events, province codes, and verifiable private uploads.

**Rules/AC:** BR-CM-03..05, BR-CM-23..27, BR-CM-38..42, AC-CM-32..35.

**Files:**

- Read: `packages/shared/src/index.ts`
- Read: `packages/object-storage/src/index.ts`
- Create: `packages/shared/src/competitiveMatches.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/object-storage/src/index.ts`
- Modify: `packages/object-storage/r2-cors.json` (or add a private-bucket CORS file beside it)
- Modify: `.env.example` if present (private bucket variable name only, no secret values)
- Test: `packages/object-storage/test/objectStorage.test.ts`

**Interfaces produced:**

```ts
export type MatchSourceType = 'hold' | 'paid_booking';
export type MatchMode = 'friendly' | 'ranked';
export type MatchDiscipline = 'singles' | 'doubles';
export type MatchRatio = '5:5' | '6:4' | '7:3';
export type MatchFormat = 'bo3' | 'bo5';
export type TeamSide = 'A' | 'B';
export type MatchOutcome = 'TEAM_A_WIN' | 'TEAM_B_WIN' | 'NO_RESULT';

export const VIETNAM_PROVINCES: readonly { code: string; name: string }[];
export const vietnamProvinceCodeSchema: z.ZodEnum<[string, ...string[]]>;

export interface MatchResultFinalizedPayload {
  matchId: string;
  decisionId: string;
  outcome: MatchOutcome;
  finalizedAt: string;
}

export interface RewardAwardsFinalizedPayload {
  programId: string;
  awards: Array<{ awardId: string; userId: string; amount: string; claimDeadlineAt: string }>;
}
```

`VIETNAM_PROVINCES` must contain exactly these 34 display names with stable lowercase ASCII slugs: Hà Nội, Hải Phòng, Huế, Đà Nẵng, Cần Thơ, Thành phố Hồ Chí Minh, Lai Châu, Điện Biên, Sơn La, Lạng Sơn, Cao Bằng, Tuyên Quang, Lào Cai, Thái Nguyên, Phú Thọ, Bắc Ninh, Hưng Yên, Ninh Bình, Quảng Ninh, Thanh Hóa, Nghệ An, Hà Tĩnh, Quảng Trị, Quảng Ngãi, Gia Lai, Khánh Hòa, Lâm Đồng, Đắk Lắk, Đồng Nai, Tây Ninh, Vĩnh Long, Đồng Tháp, Cà Mau, An Giang.

Catalog source: [Chính phủ — chi tiết 34 đơn vị hành chính cấp tỉnh theo Nghị quyết 202/2025/QH15](https://xaydungchinhsach.chinhphu.vn/chi-tiet-34-don-vi-hanh-chinh-cap-tinh-tu-12-6-2025-119250612141845533.htm).

Extend `ObjectNamespace` with `match/results` and `finance/rewards`. Add checksum-aware authorization and inspection without replacing existing methods:

```ts
authorizeUpload(input: AuthorizeUploadInput & { checksumSha256?: string }): Promise<AuthorizedUpload>;
inspectOwnedObject(input: AssertOwnedObjectInput): Promise<{
  size: number;
  checksumSha256: string | null;
}>;
```

**Private storage (PO 2026-09-25):** evidence (`match/results`) and payout proof (`finance/rewards`) must be private and readable only through authorized signed URLs; an unguessable key on the public bucket is not acceptable. Reuse the existing package with a separate private bucket: add `OBJECT_STORAGE_PRIVATE_BUCKET` and a private client (for example `createPrivateObjectStorageClientFromEnv`) that never uses `OBJECT_STORAGE_PUBLIC_BASE_URL` and always returns signed reads. The new namespaces are accepted only by the private client. Minimal infrastructure change: one R2 bucket with no public access/custom domain, CORS allowing `PUT`/`GET` with `content-type` and the checksum/metadata header, and the private bucket variable on Matchmaking and Finance. Claude prepares the repo-side config (`r2-cors.json` or a private-bucket variant, `.env.example`) only; creating the bucket, applying CORS, and setting Railway variables require explicit PO authorization per command.

**Checksum spike before locking the implementation:** against the real R2 endpoint, upload one test object through a presigned PUT signed with `ChecksumSHA256` and read it back with `HeadObjectCommand({ ChecksumMode: 'ENABLED' })`. If R2 returns `ChecksumSHA256`, use it. If it does not, sign the SHA-256 into user metadata (`x-amz-meta-sha256`) on the presigned PUT and read that metadata through HEAD. Either way the checksum is bound to the upload signature and verified again when evidence/proof is committed; the checksum requirement is never dropped. Record the observed result under Decisions.

**Shared notification contract (moved here from Task 22):** extend `UserNotificationRequested` in `packages/shared` with `emailPolicy: 'required' | 'none'` and the six action kinds listed in Task 22, so Tasks 8-21 emit against a stable contract. Persistence, email delivery, and Web deep links stay in Task 22.

- [x] Run the R2 checksum spike and record the chosen verification path.
- [x] Write Object Storage tests for new namespaces, private-client signed reads (never public URLs), checksum header signing, wrong namespace, wrong owner, 5 MB boundary, and checksum mismatch. Test the exact 34-entry province catalog through Venue's `venue.test.ts` in Task 3; `packages/shared` has no test runner.
- [x] Run the focused tests and confirm they fail because the exports/methods do not exist.
- [x] Add `competitiveMatches.ts`, re-export it, and extend object storage using the existing S3 client and `HeadObjectCommand`.
- [x] Keep `assertOwnedObject` backward compatible by delegating to `inspectOwnedObject` and discarding the returned metadata.
- [x] Run focused package tests and typechecks. Expected: all old upload callers still compile; new tests pass.

**Depends on:** Task 1. **Blocks:** Tasks 3, 5, 7, 10, 13, 17, 21, 22.

---

### Task 3: Expose Paid Booking, Venue Province, And Provider Snapshot

**Goal:** Let an owner select either an active hold or an already-paid booking while giving Matchmaking authoritative province/provider data.

**Rules/AC:** BR-CM-01..02, BR-CM-17..18, AC-CM-01, AC-CM-07.

**Files:**

- Read: `services/venue-booking-service/src/domain/booking.ts`
- Read: `services/venue-booking-service/src/domain/venue.ts`
- Read: `services/venue-booking-service/src/routes/venues.ts`
- Modify: `services/venue-booking-service/prisma/schema.prisma`
- Create: `services/venue-booking-service/prisma/migrations/20260925100000_venue_province/migration.sql`
- Modify: `services/venue-booking-service/src/domain/booking.ts`
- Modify: `services/venue-booking-service/src/domain/venue.ts`
- Modify: `services/venue-booking-service/src/routes/venues.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `services/venue-booking-service/test/matchContext.test.ts`
- Test: `services/venue-booking-service/test/venue.test.ts`

**Data/API contract:**

```prisma
model Venue {
  provinceCode String?
}
```

```ts
venueMatchContextSchema.extend({
  providerUserId: z.string().uuid(),
  provinceCode: vietnamProvinceCodeSchema.nullable(),
});
```

`GET /players/me/match-sources` returns active holds plus owned marketplace bookings with status `held` or `confirmed`; it must not return completed/cancelled/guest/internal bookings. `POST/PATCH /venues` accepts `provinceCode`; new venue creation requires it, while legacy rows remain nullable until edited.

The source response is a discriminated union and already contains every screen-01 booking field; Web must not make a second venue lookup:

```ts
type MatchSourceView = {
  sourceType: 'hold' | 'paid_booking';
  holdId?: string;
  bookingId?: string;
  bookingStatus: 'held' | 'confirmed';
  price: string;
  startAt: string;
  endAt: string;
  venue: { id: string; name: string; address: string; provinceCode: string | null };
  court: { id: string; name: string };
};
```

- [x] Add failing tests for owned confirmed bookings, foreign bookings, completed bookings, provider identity, and province snapshots.
- [x] Add the nullable column migration and validate province input with the shared schema.
- [x] Include provider user ID and province in single/batch match context queries; keep internal-service authentication unchanged.
- [x] Extend match-source listing with confirmed paid bookings without changing booking status or emitting events.
- [x] Run focused venue tests. Expected: only valid owned sources appear; no booking or revenue mutation occurs.

**Depends on:** Task 2. **Blocks:** Tasks 5, 8, 17, 23.

---

### Task 4: Persist Match Configuration And Team Slots

**Goal:** Extend the existing Match/Join aggregate for source, mode, discipline, ratio, format, snapshots, and team assignment without adding another aggregate service.

**Rules/AC:** BR-CM-03..09, AC-CM-02..05.

**Files:**

- Read: `services/matchmaking-service/prisma/schema.prisma`
- Modify: `services/matchmaking-service/prisma/schema.prisma`
- Create: `services/matchmaking-service/prisma/migrations/20260925101000_competitive_match_config/migration.sql`
- Test: `services/matchmaking-service/test/g0Database.test.ts`

**Schema shape:**

```prisma
enum MatchSourceType { hold paid_booking }
enum MatchMode { friendly ranked }
enum MatchDiscipline { singles doubles }
enum MatchRatio { five_five six_four seven_three }
enum MatchFormat { bo3 bo5 }
enum TeamSide { A B }

model Match {
  sourceType       MatchSourceType @default(hold)
  mode             MatchMode @default(friendly)
  discipline       MatchDiscipline @default(singles)
  ratio            MatchRatio @default(five_five)
  format           MatchFormat @default(bo3)
  bookingPrice     BigInt?
  startAt          DateTime? @db.Timestamptz(3)
  endAt            DateTime? @db.Timestamptz(3)
  venueId          String?
  provinceCode     String?
  providerUserId   String?
}

model Join {
  teamSide TeamSide?
}
```

Legacy columns stay nullable where a cross-service backfill is impossible. New-domain writes must always populate them. Add indexes for `[mode, discipline, status, startAt]`, `[provinceCode, mode, discipline]`, and `[matchId, teamSide, status]`.

- [x] Add migration tests for enum defaults and nullable legacy snapshots.
- [x] Write the SQL migration and Prisma schema exactly as above.
- [x] Generate the Prisma client and run schema validation.
- [x] Run `g0Database.test.ts`. Expected: existing records remain readable; new records persist all configuration fields.

**Depends on:** Task 2. **Blocks:** Tasks 5, 10, 15, 17.

---

### Task 5: Implement Match Creation, Contribution Math, And Team Join Rules

**Goal:** Create locked competitive configuration from either source and derive every amount/capacity server-side.

**Rules/AC:** BR-CM-01..15, AC-CM-01..06.

**Files:**

- Read: `services/matchmaking-service/src/domain/matches.ts`
- Read: `services/matchmaking-service/src/domain/joins.ts`
- Read: `services/matchmaking-service/src/routes/matches.ts`
- Read: `services/matchmaking-service/src/clients/venueBooking.ts`
- Create: `services/matchmaking-service/src/domain/matchRules.ts`
- Modify: `services/matchmaking-service/src/domain/matches.ts`
- Modify: `services/matchmaking-service/src/domain/joins.ts`
- Modify: `services/matchmaking-service/src/routes/matches.ts`
- Modify: `services/matchmaking-service/src/clients/venueBooking.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `services/matchmaking-service/test/matchRules.test.ts`
- Test: `services/matchmaking-service/test/matches.test.ts`
- Test: `services/matchmaking-service/test/matchPayments.test.ts`

**Locked functions and request bodies:**

```ts
export function calculateMatchFunding(
  price: bigint,
  ratio: MatchRatio,
  capacity: 2 | 4,
): {
  resultReserve: bigint;
  totalContribution: bigint;
  feePerSlot: bigint;
  organizerContribution: bigint;
};

POST /matches {
  bookingId?: string;
  holdId?: string;
  mode: 'friendly' | 'ranked';
  discipline: 'singles' | 'doubles';
  ratio: '5:5' | '6:4' | '7:3';
  format: 'bo3' | 'bo5';
  skillMin?: SkillTier;
  skillMax?: SkillTier;
}

POST /matches/:matchId/joins { teamSide: 'A' | 'B' }
```

Create/detail responses expose one server-authored financial and action view used by approved screens 01-02:

```ts
interface MatchFundingView {
  bookingPrice: string;
  totalContribution: string;
  resultHeldAmount: string;
  regularSlotAmount: string;
  organizerContribution: string;
  viewerAdditionalAmountDue: string;
  organizerRefundAtLock: string;
  organizerRefundWithdrawable: boolean;
}

interface MatchActionView {
  canJoinTeamA: boolean;
  canJoinTeamB: boolean;
  canPay: boolean;
  canWithdrawBeforeLock: boolean;
  canReportIncident: boolean;
}
```

The detail DTO also returns `sourceType`, mode, discipline, ratio, format, existing `cutoffAt`, authoritative venue/court/start/end snapshot, team slots, and participant `{ userId, displayName, avatarUrl, paymentState }`. API responses may keep internal enum values; Web maps them once to approved business labels.

Reuse the existing `awaiting_deposit` flow, `deadlineAt`, and lead-time `computeMatchDeadline` for hold sources where they do not conflict with the spec; this is a reuse of current code, not a new business rule. A paid-booking source skips the organizer deposit step because its booking payment already funds the organizer contribution.

Derive capacity as 2/4. Organizer occupies Team A. Singles joins can only choose B. Doubles permit one remaining A slot and two B slots. `<=90` minutes accepts only BO3; `>90` accepts BO3 or BO5. Creation from confirmed booking sets source `paid_booking`, marks the organizer contribution logically satisfied, and opens the match without changing the booking.

- [x] Add pure failing tests for every ratio at even and odd prices, exact total conservation, singles/doubles capacity, and organizer remainder.
- [x] Add HTTP failing tests for hold, paid booking, owner mismatch, lead under 24 hours, province missing for ranked, invalid format by duration, and duplicate booking.
- [x] Implement `calculateMatchFunding` with integer arithmetic only.
- [x] Replace client-supplied `capacity`/`feeMode` with the locked request contract; reject unknown fields through `.strict()`.
- [x] Populate snapshots and emit an expanded `MatchCreated` containing source, mode, discipline, ratio, team size, price, reserve, participant amount, and organizer amount.
- [x] Add transactional team-capacity checks to join request/approval; retain the existing 10-minute approved-slot payment hold.
- [x] Run focused Matchmaking tests. Expected: amounts conserve exactly and concurrent final-slot attempts leave only valid team capacity.

**Depends on:** Tasks 2, 3, 4. **Blocks:** Tasks 7, 8, 10, 23.

---

### Task 6: Persist Result Reserve And Funding Source In Finance

**Goal:** Extend existing FIN-05 tables to represent booking settlement separately from locked result reserve.

**Rules/AC:** BR-CM-10..22, AC-CM-04..10.

**Files:**

- Read: `services/finance-service/prisma/schema.prisma`
- Modify: `services/finance-service/prisma/schema.prisma`
- Create: `services/finance-service/prisma/migrations/20260925102000_match_result_reserve/migration.sql`
- Test: `services/finance-service/test/matchFee.test.ts`

**Schema shape:**

```prisma
enum MatchFundingSource { hold paid_booking }
enum ResultReserveStatus { none locked released refunded }
enum MatchContributionSource { cash booking_payment }

model MatchFunding {
  sourceType             MatchFundingSource @default(hold)
  discipline             String
  ratio                  String
  totalContribution      BigInt
  resultReserve          BigInt @default(0)
  resultReserveStatus    ResultReserveStatus @default(none)
  organizerRebalance     BigInt @default(0)
  resultFinalizedAt      DateTime?
}

model MatchContribution {
  teamSide      String
  source        MatchContributionSource @default(cash)
}
```

Backfill legacy funding with `sourceType=hold`, `totalContribution=bookingPrice`, `resultReserve=0`, and `resultReserveStatus=none`.

- [x] Add a migration-level test for legacy and new rows.
- [x] Apply schema and migration; do not rename existing tables or enums unrelated to match funding.
- [x] Generate Finance Prisma client and validate schema.
- [x] Run focused schema/funding tests. Expected: legacy FIN-05 fixtures still load.

**Depends on:** Task 2. **Blocks:** Tasks 7–9, 14.

---

### Task 7: Collect Contributions For Hold And Paid-Booking Sources

**Goal:** Reuse existing payment intents/reserve ledger while treating the paid booking as the organizer's funding source.

**Rules/AC:** BR-CM-10..16, AC-CM-04..08.

**Files:**

- Read: `services/finance-service/src/domain/matchFee.ts`
- Read: `services/finance-service/src/domain/sepayWebhook.ts`
- Read: `services/finance-service/src/routes/payments.ts`
- Modify: `services/finance-service/src/domain/matchFee.ts`
- Modify: `services/finance-service/src/domain/sepayWebhook.ts`
- Modify: `services/finance-service/src/lib/eventConsumer.ts`
- Test: `services/finance-service/test/matchFee.test.ts`
- Test: `services/finance-service/test/matchFee.e2e.test.ts`

**Consumes:** Expanded `MatchCreated` and `JoinApproved` from Task 5.

**Behavior:**

```text
hold source:
  organizer contribution = pending cash contribution
  every other player = pending cash contribution

paid_booking source:
  organizer contribution = paid + source booking_payment (no ledger reserve entry)
  every other player = pending cash contribution
```

- [x] Add failing tests for both sources, singles/doubles, replay, overpayment, expired slot payment, and wrong team snapshot.
- [x] Replace the old `sum == P` assertion with `sum == totalContribution == P + resultReserve`.
- [x] Create the organizer's virtual paid contribution only for `paid_booking`; never create a payment intent for it.
- [x] Store team side on every contribution and retain existing balance/SePay collection for cash contributions.
- [x] Make all late/extra match receipts credit personal `available` with equal `withdrawableDelta`; never re-fund a terminal match.
- [x] Run focused Finance tests. Expected: platform `reserved` equals actual cash received, and paid-booking organizer creates no reserve ledger entry.

**Depends on:** Tasks 5, 6. **Blocks:** Tasks 8, 9, 14.

---

### Task 8: Finalize Cutoff Without Double-Settling Paid Bookings

**Goal:** At cutoff, settle a held booking once or rebalance an already-paid booking without recreating revenue/commission.

**Rules/AC:** BR-CM-12..18, AC-CM-06..09, especially AC-CM-06 double-settlement/double-commission protection.

**Files:**

- Read: `services/matchmaking-service/src/domain/matchSettlement.ts`
- Read: `services/matchmaking-service/src/lib/matchLifecycleEventConsumer.ts`
- Read: `services/venue-booking-service/src/domain/booking.ts`
- Read: `services/finance-service/src/domain/revenue.ts`
- Modify: `services/matchmaking-service/src/domain/matchSettlement.ts`
- Modify: `services/matchmaking-service/src/lib/matchLifecycleEventConsumer.ts`
- Modify: `services/finance-service/src/domain/matchFee.ts`
- Modify: `services/finance-service/src/lib/eventConsumer.ts`
- Test: `services/matchmaking-service/test/matchPayments.test.ts`
- Test: `services/venue-booking-service/test/matchContext.test.ts`
- Test: `services/finance-service/test/matchFee.test.ts`
- Test: `services/matchmaking-service/test/matchServiceChain.e2e.test.ts`

**Locked branch logic:**

```ts
if (funding.sourceType === 'hold') {
  // Reuse current D39 fenced Venue settle command.
  // Debit exactly P from platform.reserved after Venue confirms.
} else {
  // Do not call Venue settle and do not emit BookingConfirmed.
  // Require the existing BookingRevenue(gross=P).
  // Debit organizerRebalance from platform.reserved and credit organizer
  // personal available + withdrawable.
}
// Both branches leave exactly resultReserve in platform.reserved for this match.
```

Emit one idempotent `MatchFundingCompleted` event for both branches; Matchmaking uses it to move `filled -> confirmed`. Do not overload `BookingConfirmed` for paid-booking reuse.

- [x] Add tests that record counts and sums of `BookingRevenue`, commission ledger entries, booking settlement ledger entries, owner rebalance entries, and platform reserved before/after replay.
- [x] Update Matchmaking cutoff payload with source and reserve snapshots.
- [x] Keep the current D39 venue fence unchanged for hold sources.
- [x] Add the paid-booking branch in Finance under the existing advisory lock and `ProcessedEvent` guard.
- [x] Credit owner rebalance with `withdrawableDelta` and a unique reference `matchOwnerRebalance:<matchId>`.
- [x] Consume `MatchFundingCompleted` idempotently in Matchmaking.
- [x] Run focused and chain tests. Expected: paid-booking case has zero new booking settlement/revenue/commission rows and one rebalance; hold case still confirms the booking once.

**Depends on:** Tasks 3, 5, 7. **Blocks:** Tasks 9, 11, 14, 26.

---

### Task 9: Implement Underfilled, Cancellation, And Late-Receipt Money Rules

**Goal:** Preserve the booking for underfilled paid sources, release held sources, and allocate pre-result booking cancellation at 50:50.

**Rules/AC:** BR-CM-16..22, AC-CM-07..10, AC-CM-21.

**Files:**

- Read: `services/matchmaking-service/src/domain/matchLifecycle.ts`
- Read: `services/finance-service/src/domain/refund.ts`
- Modify: `services/matchmaking-service/src/domain/matchLifecycle.ts`
- Modify: `services/matchmaking-service/src/routes/matches.ts`
- Modify: `services/finance-service/src/domain/matchFee.ts`
- Modify: `services/finance-service/src/domain/refund.ts`
- Modify: `services/venue-booking-service/src/domain/booking.ts`
- Test: `services/matchmaking-service/test/matchPayments.test.ts`
- Test: `services/finance-service/test/matchFee.test.ts`
- Test: `services/finance-service/test/refund.test.ts`

**Allocation rule:** For a booking cancelled before final result, calculate each team's refund as `(resultReserve + bookingRefundGross) / 2`, split across team members, then put every integer remainder on the organizer entry. This returns the entire reserve and applies booking policy to `P` only.

- [x] Add failing tests for underfilled hold, underfilled paid booking, organizer cancellation before/after cutoff, 0/50/100% booking refund, odd VND, and replay.
- [x] Branch cutoff cancellation: hold cancels/releases booking; paid booking cancels only the match layer and refunds cash participants.
- [x] Allow organizer cancel only before cutoff. After cutoff return a business error directing users to incident declaration.
- [x] Replace the old ratio-based confirmed cancellation allocation with the exact 50:50 team rule above.
- [x] Verify result dispute does not modify `BookingRevenue`, business pending revenue, or commission.
- [x] Run focused tests. Expected: every ledger sum balances and paid booking remains confirmed when only the match layer closes.

**Depends on:** Task 8. **Blocks:** Task 14 and final finance verification.

---

### Task 10: Persist Result Cases, Claims, Responses, Decisions, And Evidence

**Goal:** Add one auditable result case per match with append-only evidence and versioned decisions.

**Rules/AC:** BR-CM-23..42, AC-CM-11..20, AC-CM-32..35.

**Files:**

- Modify: `services/matchmaking-service/package.json`
- Modify: `services/matchmaking-service/prisma/schema.prisma`
- Create: `services/matchmaking-service/prisma/migrations/20260925103000_match_result_cases/migration.sql`
- Create: `services/matchmaking-service/src/domain/resultEvidence.ts`
- Modify: `services/matchmaking-service/src/app.ts`
- Modify: `services/matchmaking-service/src/index.ts`
- Test: `services/matchmaking-service/test/resultEvidence.test.ts`

**Reuse:** Add the existing workspace dependency `@khoaluantn/object-storage`; use its client directly. Do not create a storage service or save files to local disk.

**Required models:** `MatchResultCase` (unique `matchId`, status, outcome, deadlines, version, closedAt), `ResultClaim`, `ResultSet`, `ResultResponse`, `ResultEvidence`, `ProviderRecommendation`, and `AdminResultDecision`. Claims/responses/decisions are never updated or deleted; case status/version may advance.

**Evidence fields:** `objectKey`, `mimeType`, `size`, `checksumSha256`, `ownerUserId`, `claimId?`, `responseId?`, `position`, `createdAt`, `deletedAt?`. Unique `[caseId, objectKey]` and index `[caseId, ownerUserId]`.

- [x] Add the dependency and failing tests for wrong namespace/owner, 5 MB + 1 byte, checksum mismatch, sixth image, immutable evidence, and unauthorized private read.
- [x] Add schema/migration with result status values `declaration_open`, `provisional`, `incident_window`, `provider_review`, `admin_review`, `final`.
- [x] Implement evidence authorization under `match/results`, commit through `inspectOwnedObject`, and private signed reads only after role/roster authorization.
- [x] Add a retention sweep that deletes binary only when `closedAt <= now - 90 days`, then sets `deletedAt` while retaining metadata/checksum.
- [x] Register the storage client and retention scheduler through existing app/index dependency patterns.
- [x] Run focused tests and Prisma validation. Expected: evidence remains after restart/deploy because only object keys live in PostgreSQL and bytes live in object storage.

**Depends on:** Tasks 2, 4, 5. **Blocks:** Tasks 11–13, 24.

---

### Task 11: Validate Scores And Accept Result Claims

**Goal:** Open declaration at booking end and store valid score claims without immediately declaring a winner final.

**Rules/AC:** BR-CM-23..30, AC-CM-11..14.

**Files:**

- Read: `services/matchmaking-service/src/lib/matchLifecycleEventConsumer.ts`
- Create: `services/matchmaking-service/src/domain/matchResults.ts`
- Create: `services/matchmaking-service/src/routes/matchResults.ts`
- Modify: `services/matchmaking-service/src/app.ts`
- Modify: `services/matchmaking-service/src/lib/matchLifecycleEventConsumer.ts`
- Test: `services/matchmaking-service/test/matchResults.test.ts`

**Interfaces produced:**

```ts
export function inferMatchOutcome(input: {
  format: 'bo3' | 'bo5';
  sets: Array<{ teamA: number; teamB: number }>;
}): { outcome: 'TEAM_A_WIN' | 'TEAM_B_WIN' | 'NO_RESULT'; setWinsA: number; setWinsB: number };

POST /matches/:matchId/result-evidence/uploads { mimeType, size, checksumSha256 }
POST /matches/:matchId/result-claims {
  sets: Array<{ teamA: number; teamB: number }>;
  evidence: Array<{ objectKey: string; mimeType: ImageMimeType }>;
}
GET /matches/:matchId/result-case
GET /matches/:matchId/result-evidence/:evidenceId/read
```

`GET /matches/:matchId/result-case` is the only player result-flow read model. Return server-authored actions and deadlines so React never infers permissions or state transitions:

```ts
interface PlayerResultCaseView {
  matchId: string;
  serverNow: string;
  status: 'declaration_open' | 'provisional' | 'incident_window' | 'provider_review' | 'admin_review' | 'final';
  declarationDeadlineAt: string | null;
  objectionDeadlineAt: string | null;
  teamGraceDeadlineAt: string | null;
  match: {
    discipline: MatchDiscipline;
    mode: MatchMode;
    format: MatchFormat;
    ratio: MatchRatio;
    startAt: string;
    endAt: string;
    venue: { name: string; address: string };
    court: { name: string };
    teams: Array<{ side: TeamSide; players: Array<{ userId: string; displayName: string; avatarUrl: string | null }> }>;
  };
  provisional: null | {
    claimant: { userId: string; displayName: string; avatarUrl: string | null };
    sets: Array<{ teamA: number; teamB: number }>;
    outcome: MatchOutcome;
    evidence: Array<{ id: string; mimeType: ImageMimeType }>;
  };
  viewerActions: { canClaim: boolean; canConfirm: boolean; canObject: boolean; canReportIncident: boolean };
  viewerMoney: null | { heldForResult: string; projectedReceivable: string; projectedFinalCost: string; withdrawableIfFinal: boolean };
}
```

`viewerMoney` is roster-only and is never returned by public match, Passport, leaderboard, or reward APIs. Evidence reads first authorize roster/provider/Admin access, then return a short-lived signed URL; object keys and storage URLs are not returned in list payloads.

Accept completed sets only at 21+ with two-point lead or exactly 30; allow at most one unfinished final set. If neither side has the required set wins at `endAt`, use set leader, then unfinished-set point leader; tie/no unfinished deciding set yields `NO_RESULT`, which the score-claim endpoint rejects and directs to incident flow.

- [x] Add pure tests for 21–19, 22–20, 30–29, invalid 31, BO3/BO5, incomplete timed match, tied incomplete set, and extra sets after victory.
- [x] Add HTTP tests for roster-only access, 12-hour deadline, 1–3 committed evidence items, and concurrent first claims.
- [x] Add read-model tests for authoritative booking address/court/slot, account display name/avatar, server deadlines/actions, roster-only money, and authorized evidence reads.
- [x] Reuse the participant-profile enrichment already used by the Task 5 match detail; at most four roster profiles are read through the existing Account client. Do not persist a second profile snapshot or create a new profile service.
- [x] On `BookingCompleted`, upsert one `declaration_open` case with deadline `match.endAt + 12h`; use match snapshot, not event arrival time.
- [x] First valid claim sets `provisional`, stores inferred outcome, and sets `objectionDeadlineAt = claim.createdAt + 12h`.
- [x] A later same-winner claim stays provisional and auditable; an opposite-winner claim moves to dispute processing.
- [x] Run focused tests. Expected: no claim path changes money/rating and first claim never becomes final synchronously.

**Depends on:** Tasks 8, 10. **Blocks:** Tasks 12–14.

---

### Task 12: Implement Confirmation, Objection, Incident, And Deadline Schedulers

**Goal:** Resolve undisputed results automatically while routing every disagreement/incident away from automatic settlement.

**Rules/AC:** BR-CM-28..36, AC-CM-13..17.

**Files:**

- Modify: `services/matchmaking-service/src/domain/matchResults.ts`
- Create: `services/matchmaking-service/src/domain/resultLifecycle.ts`
- Modify: `services/matchmaking-service/src/routes/matchResults.ts`
- Modify: `services/matchmaking-service/src/index.ts`
- Test: `services/matchmaking-service/test/resultLifecycle.test.ts`

**APIs:**

```text
POST /matches/:matchId/result-responses/confirm
POST /matches/:matchId/result-responses/object { reason, evidence[1..3] }
POST /matches/:matchId/incidents { type, description, evidence[1..3] }
POST /matches/:matchId/result-evidence (supplement only while open)
```

No-show is accepted only at/after `startAt + 15m`. Incident types are `no_show`, `not_played`, `interrupted`, and `other`; an incident always opens dispute review and never self-declares a winner.

- [x] Add failing tests for singles early confirmation, doubles first losing-player confirmation, full 60-minute grace beyond the original objection deadline, second confirmation, objection, no-show at +14:59/+15:00, no declaration, and scheduler replay.
- [x] Implement one transaction-locked `finalizeUndisputedResult(caseId, now)` used only by confirmation/deadline paths.
- [x] For doubles, first losing-team confirmation sets `teamGraceDeadlineAt = now + 1h`; both confirmations finalize immediately, otherwise finalize only after the grace expires without objection.
- [x] At declaration deadline with no claim, move to `incident_window` until `deadline + 12h`; silence then finalizes `NO_RESULT`.
- [x] At objection deadline with no objection, finalize the provisional result exactly once.
- [x] Emit `MatchResultFinalized` only from the shared finalizer; disputed/provider/Admin states are excluded by a hard status guard.
- [x] Run focused tests. Expected: concurrency/replay yields one terminal case and one outbox final event.

**Depends on:** Task 11. **Blocks:** Tasks 13, 14, 18.

---

### Task 13: Implement Provider Recommendation And Final Admin Decision

**Goal:** Give providers a non-binding recommendation step and Admins the only disputed-result finalization path.

**Rules/AC:** BR-CM-37..42, AC-CM-18..21.

**Files:**

- Modify: `services/matchmaking-service/src/domain/resultLifecycle.ts`
- Modify: `services/matchmaking-service/src/routes/matchResults.ts`
- Modify: `services/matchmaking-service/src/app.ts`
- Modify: `services/matchmaking-service/src/index.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `services/matchmaking-service/test/resultDisputes.test.ts`

**APIs:**

```text
GET  /matches/provider/result-cases?status=provider_review
GET  /matches/provider/result-cases/:caseId
POST /matches/:matchId/provider-recommendation { outcome, reason }
GET  /matches/admin/result-cases?status=admin_review
GET  /matches/admin/result-cases/:caseId
POST /matches/:matchId/admin-decision/preview { outcome, reason }
POST /matches/:matchId/admin-decision { outcome, reason, caseVersion, confirm: true }
```

Both queue endpoints accept `page` and `pageSize` and return `{ items, total, page, pageSize }`. Detail endpoints return the authoritative booking snapshot, participant account snapshot, claims/responses, evidence IDs readable through the signed-read endpoint, deadlines, current provider recommendation, and current case version. The provider detail never includes an effective/final result action. The Admin detail includes the provider recommendation labelled non-binding plus the preview endpoint below.

Preview is read-only and calculated locally from the locked Match snapshot: outcome, winning team, `resultReserve`, roster, and per-player split. It returns `caseVersion`. Confirm must match the same outcome/reason/version; a changed case returns 409 and requires a new preview. Finance independently recalculates the allocation from its stored funding when it consumes the final event; Matchmaking never sends authoritative allocation amounts.

```ts
interface AdminDecisionPreview {
  caseVersion: number;
  outcome: MatchOutcome;
  reason: string;
  rows: Array<{ userId: string; displayName: string; amount: string; withdrawable: true }>;
  ratingEffect: 'apply_ranked_result' | 'no_change';
  bookingRevenueEffect: 'no_change';
}
```

- [x] Add failing tests for provider ownership, provider-in-roster conflict, paginated provider/Admin queues, authorized detail/evidence reads, 24-hour escalation, Admin 24/48-hour reminders, repeated overdue reminders, version conflict, and two-step confirmation.
- [x] Snapshot provider identity from the Match; if that user is in the roster, skip provider and enter `admin_review` immediately.
- [x] Persist recommendation append-only. It may only advance `provider_review -> admin_review`; it must not call the result finalizer or emit `MatchResultFinalized`.
- [x] Start Admin SLA at entry to `admin_review`; after 48 hours only set overdue metadata and emit reminders every 24 hours.
- [x] On confirmed Admin decision, persist `AdminResultDecision`, advance case to final, and emit the same `MatchResultFinalized` contract as undisputed finalization.
- [x] Run focused tests. Expected: deleting/pausing all Admin workers leaves funds/rating locked indefinitely; provider recommendation never becomes effective.

**Depends on:** Tasks 2 and 12. **Blocks:** Tasks 14, 18, 24, 25.

---

### Task 14: Release Result Reserve From Final Results

**Goal:** Execute winner/no-result allocations exactly once, crediting withdrawable personal balances.

**Rules/AC:** BR-CM-10..22, BR-CM-38..42, AC-CM-04..10, AC-CM-18..21.

**Files:**

- Create: `services/finance-service/src/domain/matchResult.ts`
- Modify: `services/finance-service/src/lib/eventConsumer.ts`
- Test: `services/finance-service/test/matchResult.test.ts`
- Test: `services/finance-service/test/matchFee.e2e.test.ts`

**Consumer contract:**

```text
Consumer: MatchResultFinalizedPayload
```

For a winner, allocate the entire result reserve to the winning team. For `NO_RESULT`, allocate `floor(resultReserve / 2)` to Team A and the remainder to Team B. Inside each receiving team, give each non-remainder recipient `floor(teamAmount / teamSize)`; give the remainder to the organizer when the organizer belongs to that team. If the receiving team does not contain the organizer, give the remainder to the member who joined that team earliest by the existing JOIN order; do not add a separate remainder mechanism. Finance recomputes from stored funding/contributions and never trusts client-supplied amounts.

- [x] Add failing tests for 5:5 zero reserve, 6:4, 7:3, singles, doubles, odd VND, organizer-present remainder, earliest-JOIN remainder when the receiving team has no organizer, winner/no-result, wrong match state, event replay, and concurrent consumers.
- [x] Implement a pure `calculateResultAllocations(funding, outcome)` used only by the event consumer and domain tests; do not add an internal HTTP endpoint.
- [x] Under the match advisory lock, debit platform `reserved` by each allocation total and credit personal `available` with equal `withdrawableDelta` using unique references `matchResult:<decisionId>:<userId>`.
- [x] Mark `resultReserveStatus=released` and `resultFinalizedAt`; zero reserve still records processed/finalized state without fake ledger entries.
- [x] Do not touch `BookingRevenue`, commission entries, or business wallets.
- [x] Run focused and Finance E2E tests. Expected: sum of credits equals reserve, every retry is a no-op, and winner credit is withdrawable.

**Depends on:** Tasks 6–9 and 13. **Blocks:** final finance verification.

---

### Task 15: Split Passport Into Singles And Doubles

**Goal:** Preserve existing rating as singles and add an independent doubles declaration/rating state.

**Rules/AC:** BR-CM-44, BR-CM-49..54, AC-CM-23, AC-CM-25..26.

**Files:**

- Modify: `services/matchmaking-service/prisma/schema.prisma`
- Create: `services/matchmaking-service/prisma/migrations/20260925104000_dual_passports/migration.sql`
- Modify: `services/matchmaking-service/src/domain/passport.ts`
- Modify: `services/matchmaking-service/src/routes/passports.ts`
- Modify: `services/matchmaking-service/src/lib/ratingEventConsumer.ts`
- Test: `services/matchmaking-service/test/passport.test.ts`
- Test: `services/matchmaking-service/test/ratingRabbit.e2e.test.ts`

**Schema/API:**

```prisma
model Passport {
  userId      String
  discipline MatchDiscipline
  // existing rating fields
  @@id([userId, discipline])
}
```

Migrate every existing Passport to `singles`. `PUT /passports/me/declaration` requires `{ discipline, tier }`; a second self-declaration for that discipline always returns 409. `GET /passports/me` returns `{ singles, doubles }`; the public route returns both discipline summaries but hides numeric rating/RD until the public policy permits them through leaderboard/result views.

The own-Passport response exposes business-ready stability fields for screen 06 without exposing raw formulas: each discipline returns `rating`, `matchesPlayed`, `ratingStability: 'high_uncertainty' | 'established'`, and `leaderboardVisible`. React maps these values to approved Vietnamese labels and never displays the raw `sigma` value. Paginated match history is added by Task 18 after rated results exist; do not keep embedding an unbounded `recentMatches` array in `GET /passports/me`.

- [x] Replace old cooldown/re-declaration tests with first-declaration-only tests per discipline and concurrent duplicate declaration.
- [x] Write migration SQL that preserves every existing rating/RD/sigma/matchesPlayed value as singles.
- [x] Change all Prisma lookups to composite IDs and extend `RatingPeriodReady` with discipline.
- [x] Keep `rating.ts` Glicko-2 math and D26 constants unchanged.
- [x] Run Passport/rating tests. Expected: declaring doubles never changes singles and legacy rating is preserved.

**Depends on:** Task 4. **Blocks:** Tasks 16–20, 24.

---

### Task 16: Route Tier Corrections Through Existing Support Tickets

**Goal:** Remove self-redeclaration and let an Admin-approved support ticket produce one audited bounded correction.

**Rules/AC:** BR-CM-52..54, AC-CM-26.

**Files:**

- Read: `services/community-service/src/domain/community.ts`
- Read: `services/community-service/src/routes/community.ts`
- Modify: `services/community-service/prisma/schema.prisma`
- Create: `services/community-service/prisma/migrations/20260925105000_rating_correction_tickets/migration.sql`
- Modify: `services/community-service/src/domain/community.ts`
- Modify: `services/community-service/src/routes/community.ts`
- Modify: `services/matchmaking-service/src/lib/ratingEventConsumer.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `services/community-service/test/community.e2e.test.ts`
- Test: `services/matchmaking-service/test/passport.test.ts`

**Contract:** Add ticket type `general | rating_correction` and JSON metadata validated as `{ discipline, requestedTier }`. Admin endpoint:

```text
POST /tickets/:ticketId/rating-correction-decision
{ decision: approve | reject, approvedTier?, reason }
```

Approval emits `RatingCorrectionApproved { ticketId, userId, discipline, approvedTier, adminUserId }`. Matchmaking consumes idempotently: zero matches resets to the tier center; any played matches uses existing `redeclarationRating` and preserves RD/sigma, capped at ±50.

- [x] Add failing tests for requester ownership, wrong ticket type/status, required reason, duplicate decision, zero-match reset, played bounded shift, and event replay.
- [x] Add only the structured fields needed to the existing Ticket; do not build a second ticket system.
- [x] Emit the event in the same transaction that resolves the ticket.
- [x] Consume through the existing Matchmaking event infrastructure and store ticket/admin IDs in an audit row.
- [x] Run focused Community and Passport tests. Expected: no API lets the player directly alter an existing declared discipline.

**Depends on:** Tasks 2, 15. **Blocks:** final Passport UI.

---

### Task 17: Add Global Seasons And Locked Primary Province

**Goal:** Provide one non-overlapping global season calendar and lock each player's province for that season.

**Rules/AC:** BR-CM-55..60, AC-CM-27..28.

**Files:**

- Modify: `services/matchmaking-service/prisma/schema.prisma`
- Create: `services/matchmaking-service/prisma/migrations/20260925106000_seasons/migration.sql`
- Create: `services/matchmaking-service/src/domain/seasons.ts`
- Create: `services/matchmaking-service/src/routes/competition.ts`
- Modify: `services/matchmaking-service/src/app.ts`
- Test: `services/matchmaking-service/test/seasons.test.ts`

**Models/API:** `Season`, `PlayerSeasonProfile`, and `SeasonStat`. Season statuses: `scheduled`, `active`, `closing`, `closed`. Use an advisory lock when creating/updating dates and reject any overlap.

```text
GET  /competition/seasons/current
PUT  /competition/seasons/current/me/region { provinceCode }
GET  /competition/admin/seasons?page=&pageSize=
POST /competition/admin/seasons { name, startAt, endAt }
PATCH /competition/admin/seasons/:id { name, startAt, endAt }
POST /competition/admin/seasons/:id/close
```

The Admin list returns `{ items, total, page, pageSize }`; each item contains `id`, `name`, `startAt`, `endAt`, business status, and eligible-player count. Keep the compact display name on one line in Web; dates remain separate fields.

Region may be set exactly once per season and is required before creating/joining a ranked match. Friendly matches do not require it.

- [x] Add failing tests for overlap, exact boundary adjacency, one active season, paginated Admin list fields/counts, first region selection, second selection rejection, and invalid province.
- [x] Add schema/migration and transactional season functions.
- [x] Add player/Admin routes with current role middleware.
- [x] Add ranked create/join guard to Task 5 flow; do not block friendly play.
- [x] Run focused tests. Expected: season rollover preserves Passport but starts empty season stats/eligibility.

**Depends on:** Tasks 2, 5, 15. **Blocks:** Tasks 18–20, 24–25.

---

### Task 18: Produce Rated Results, Anti-Farming, RD Aging, And Leaderboards

**Goal:** Turn final ranked results into deterministic singles/doubles rating changes and eligible global/province rankings.

**Rules/AC:** BR-CM-43..61, AC-CM-22..29, AC-CM-35.

**Files:**

- Modify: `services/matchmaking-service/prisma/schema.prisma`
- Create: `services/matchmaking-service/prisma/migrations/20260925107000_rating_results_leaderboards/migration.sql`
- Modify: `services/matchmaking-service/src/domain/rating.ts`
- Modify: `services/matchmaking-service/src/domain/resultLifecycle.ts`
- Modify: `services/matchmaking-service/src/lib/ratingEventConsumer.ts`
- Create: `services/matchmaking-service/src/domain/leaderboards.ts`
- Modify: `services/matchmaking-service/src/routes/competition.ts`
- Modify: `services/matchmaking-service/src/clients/account.ts`
- Modify: `services/matchmaking-service/src/index.ts`
- Test: `services/matchmaking-service/test/ratedResults.test.ts`
- Test: `services/matchmaking-service/test/leaderboards.test.ts`
- Test: `services/matchmaking-service/test/rating.test.ts`

**Models:** `MatchRatingChange` (unique match/user/discipline), `RatedEncounter`, and season stat counters. `opponentKey` is opponent user ID for singles and the sorted two-user opponent pair joined with `:` for doubles; own teammate is excluded. `RatedEncounter` stores `finalizedAt` and whether that final result reserved the rating slot.

**Processing:** For a ranked winner outcome, the existing result-finalization transaction acquires affected player rating locks in sorted user-ID order, writes `finalizedAt`, and reserves rolling-seven-day eligibility in `RatedEncounter` before emitting `RatingPeriodReady`. For the same `opponentKey`, the first officially finalized result reserves the slot; a later `finalizedAt` less than seven days away is stored as non-rated. Exactly seven days remains eligible. The consumer applies only the stored eligibility decision idempotently, so RabbitMQ arrival order never chooses the winner and no rating rollback/recompute path is introduced.

```text
GET /competition/leaderboards?seasonId=&discipline=&scope=global|province&provinceCode=&band=under_1600|from_1600
GET /passports/me/matches?discipline=&page=&pageSize=
```

Leaderboard query also accepts `page` and `pageSize` and returns:

```ts
interface LeaderboardResponse {
  items: Array<{
    rank: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    provinceCode: string | null;
    rating: number;
    matchesPlayed: number;
    wins: number;
  }>;
  viewer: null | {
    rank: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    provinceCode: string | null;
    rating: number;
    matchesPlayed: number;
    wins: number;
  };
  total: number;
  page: number;
  pageSize: number;
  serverNow: string;
}

interface PassportMatchHistoryResponse {
  items: Array<{
    matchId: string;
    businessCode: string | null;
    endedAt: string;
    discipline: MatchDiscipline;
    outcome: 'win' | 'loss';
    scoreLabel: string;
    opponents: Array<{ userId: string; displayName: string; avatarUrl: string | null }>;
    ratingDelta: number | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
}
```

Do not add historical-rank snapshots for the decorative seven-day movement shown in the mockup. Screen 07 pins the current viewer row and current rank only; a movement badge renders only if a future authoritative contract supplies it.

- [x] Add tests for friendly/no-result exclusion, singles/doubles independence, doubles aggregate opponent rating/RD, replay, own-teammate changes, same opposing pair with `finalizedAt` inside/exactly at seven days, RabbitMQ delivery order differing from `finalizedAt`, and an older match by `endAt` finalized after a newer match.
- [x] Add tests for five-result eligibility, RD 199.999/200, province match count, crossing 1600 immediately, public-field allowlist, and ties.
- [x] Add API tests for leaderboard pagination, pinned viewer data, and independent paginated singles/doubles match history with nullable non-rated `ratingDelta`.
- [x] Extend the existing Matchmaking Account client with the existing Account endpoint `POST /internal/players/public-display-names`; enrich one leaderboard page plus the viewer row in the route response. Do not copy account profile data into rating/season tables.
- [x] Reuse `updateRating`; for doubles pass one result whose opponent rating/RD are arithmetic means of the two opponent states.
- [x] Update Passport, `MatchRatingChange`, `RatedEncounter`, and `SeasonStat` in one user-scoped transaction under advisory lock.
- [x] Start a weekly UTC scheduler that calls `updateRating(state, [])` once per missed whole seven-day period and caps RD at 350; persist `lastAgedAt` so replay is a no-op.
- [x] Query leaderboards from persisted season stats/passports; do not maintain a cache or new search index.
- [x] Run focused tests. Expected: one result changes each user once, extra encounters remain visible but do not affect rating/BXH/streak/badge.

**Depends on:** Tasks 12–15 and 17. **Blocks:** Tasks 19–20, 24–25.

---

### Task 19: Award Permanent Badges

**Goal:** Persist discipline/scope/season badges without affecting money or rating.

**Rules/AC:** Badge section; BR-CM-48, BR-CM-56, AC-CM-24, AC-CM-31.

**Files:**

- Modify: `services/matchmaking-service/prisma/schema.prisma`
- Create: `services/matchmaking-service/prisma/migrations/20260925108000_player_badges/migration.sql`
- Create: `services/matchmaking-service/src/domain/badges.ts`
- Modify: `services/matchmaking-service/src/lib/ratingEventConsumer.ts`
- Modify: `services/matchmaking-service/src/routes/passports.ts`
- Test: `services/matchmaking-service/test/badges.test.ts`

**Badge keys:** `WIN_STREAK_5`, `WIN_STREAK_10`, `WIN_STREAK_15`, continuing for every multiple of five; `TOP_10`; `KING_OF_COURT`. Unique key is `[userId, discipline, seasonId, badgeType, scope, provinceCode]`.

- [x] Add tests for each streak threshold, loss reset, friendly/no-result/anti-farm exclusion, season close Top 10, rank 1, tie ranks, and replay.
- [x] Award streak badges inside the successful rated-result transaction.
- [x] Award Top 10/King only when season close locks final eligible rankings.
- [x] Return badges from own/public Passport using business labels, not raw enum values.
- [x] Run focused tests. Expected: badges persist across later seasons and never write finance/rating fields.

**Depends on:** Task 18. **Blocks:** Task 24.

---

### Task 20: Create And Finalize Admin Reward Programs

**Goal:** Let Admin publish immutable, time-bounded programs and let the system calculate tied winners from season data.

**Rules/AC:** BR-CM-62..70, AC-CM-29..31.

**Files:**

- Modify: `services/matchmaking-service/prisma/schema.prisma`
- Create: `services/matchmaking-service/prisma/migrations/20260925109000_reward_programs/migration.sql`
- Create: `services/matchmaking-service/src/domain/rewards.ts`
- Create: `services/matchmaking-service/src/routes/rewards.ts`
- Modify: `services/matchmaking-service/src/app.ts`
- Modify: `services/matchmaking-service/src/index.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `services/matchmaking-service/test/rewards.test.ts`

**Models:** `RewardProgram`, `RewardTier`, `RewardAward`. Criteria enum: `ending_rating`, `most_wins`, `largest_rating_gain`, `longest_streak`. Program statuses: `draft`, `scheduled`, `active`, `reconciling`, `awaiting_admin_approval`, `final`, `cancelled`.

**APIs:**

```text
GET  /rewards/programs
GET  /rewards/programs/:id
GET  /rewards/admin/programs?page=&pageSize=&status=
POST /rewards/admin/programs
POST /rewards/admin/programs/:id/publish
POST /rewards/admin/programs/:id/cancel { reason }
POST /rewards/admin/programs/:id/approve-final { confirm: true }
```

`POST /rewards/admin/programs` accepts exactly `{ name, seasonId, criterion, discipline, band, scope, provinceCode?, startAt, endAt, fundingSource, tiers: Array<{ rank: number; amount: string }> }`. `fundingSource` is display/audit metadata with values `admin | marketing | sponsor`; it never selects a match-fund or wallet path. Public list/detail responses include countdown inputs (`serverNow`, `startAt`, `endAt`), business status, criterion label data, scope, tiers, provisional viewer rank/score when eligible, and `reconciling` state. Admin list response is paginated and exposes draft/published locks; it never permits manual winner/rank edits.

Published fields `criterion`, scope, discipline, band, province, start/end, and tiers are immutable. Before start, cancellation is direct; while active it requires reason and notifies all participants. At end, wait until every match with `endAt` inside the program has a final result; status is `reconciling` meanwhile. Tie ranks consume consecutive prize positions, sum those amounts, and divide equally with deterministic last-user remainder by ascending user ID.

All four criteria use only rated results whose Match `endAt` is inside the inclusive interval `[program.startAt, program.endAt]`. `ending_rating` is the user's last persisted `ratingAfter` at or before `program.endAt`; the program band check uses that same ending rating, so a player who crosses 1600 during the program competes in the upper band at finalization.

- [x] Add failing tests for the exact create payload, funding-source metadata, paginated Admin list, public detail/countdown/viewer projection, invalid date/season range, no tiers, mutation after publish, permitted cancellation, all four criteria, crossing 1600, pending result wait, multi-position tie split, and Admin final approval.
- [x] Add schema and domain using SeasonStat/MatchRatingChange only; do not add a generic rules engine.
- [x] Add public/Admin routes and a scheduler for scheduled->active->reconciling transitions.
- [x] On final approval emit one `RewardAwardsFinalized` event with seven-day claim deadlines.
- [x] Run focused tests. Expected: Admin cannot manually alter calculated scores/ranks/winners.

**Depends on:** Tasks 17–18. **Blocks:** Tasks 21, 25.

---

### Task 21: Record Winner Information And Manual Reward Payouts In Finance

**Goal:** Keep bank/payout data in Finance, cancel unclaimed awards after seven days, and store transaction proof for manual transfer.

**Rules/AC:** BR-CM-68..70, AC-CM-30, notification section.

**Files:**

- Modify: `services/finance-service/prisma/schema.prisma`
- Create: `services/finance-service/prisma/migrations/20260925110000_reward_payouts/migration.sql`
- Create: `services/finance-service/src/domain/rewardPayout.ts`
- Create: `services/finance-service/src/routes/rewardPayouts.ts`
- Modify: `services/finance-service/src/app.ts`
- Modify: `services/finance-service/src/index.ts`
- Modify: `services/finance-service/src/lib/eventConsumer.ts`
- Test: `services/finance-service/test/rewardPayout.test.ts`

**Model/API:** `RewardPayout` stores award/program/user/amount, claim deadline, recipient name/email/phone/address, bank code/account/name, payout deadline, status `awaiting_information|ready_to_pay|paid|cancelled`, transaction reference, proof object metadata, and audit timestamps.

```text
GET  /rewards/players/me/payouts
GET  /rewards/players/me/payouts/:id
PUT  /rewards/players/me/payouts/:id/information
POST /rewards/admin/uploads { mimeType, size, checksumSha256 }
GET  /rewards/admin/payouts
GET  /rewards/admin/payouts/:id
POST /rewards/admin/payouts/:id/mark-paid { transactionReference, proofObjectKey, confirm: true }
```

Player information input is exactly `{ recipientName, email, phone, address, bankCode, bankAccountNumber, bankAccountName }`; do not add birth date, identity document, or age fields. Player list/detail returns `serverNow`, claim deadline, program/achievement/amount labels, completeness flags, and status. Admin list accepts `page`, `pageSize`, `status`, and `programId`; Admin detail returns receiver data, payout deadline, amount, current audit state, and proof metadata. Signed proof reads remain role/owner authorized. Never return bank fields from matchmaking reward-program APIs.

No wallet or ledger entry is created because Admin pays from separate marketing/sponsor funds.

- [x] Add tests for event replay, paginated Admin list/detail, owner-only player detail/submission, the exact information fields, all required fields, exact seven-day boundary, no reallocation after cancellation, seven-day payout deadline, proof ownership/checksum, duplicate transaction reference, and paid immutability.
- [x] Consume `RewardAwardsFinalized` idempotently and create payout rows.
- [x] Use `finance/rewards` private storage namespace for proof; only Admin and the winning owner may read the resulting record, and bank fields never enter public APIs.
- [x] Add a scheduler that cancels `awaiting_information` only after claim deadline; `ready_to_pay` remains due/overdue and is never auto-cancelled.
- [x] Mark paid only after a second-confirmation request containing transaction reference and committed proof.
- [x] Run focused Finance tests. Expected: expired claim is cancelled permanently; successful payout has reference/proof and no match-fund mutation.

**Depends on:** Tasks 2 and 20. **Blocks:** Task 25 and final E2E.

---

### Task 22: Deliver Required In-App And Email Notifications

**Goal:** Reuse one event to project an inbox row and send transactional email for required competitive events.

**Rules/AC:** Spec §11; BR-CM-40, BR-CM-64, BR-CM-68..69.

**Files:**

- Read: `services/account-service/src/domain/notifications.ts`
- Read: `services/account-service/src/lib/email.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `services/account-service/prisma/schema.prisma`
- Create: `services/account-service/prisma/migrations/20260925111000_notification_email_delivery/migration.sql`
- Modify: `services/account-service/src/domain/notifications.ts`
- Modify: `services/account-service/src/lib/eventConsumer.ts`
- Modify: `apps/web/src/notifications/notificationRoutes.ts`
- Modify: `apps/web/src/notifications/notificationPresentation.tsx`
- Test: `services/account-service/test/notificationProjection.test.ts`
- Test: `services/account-service/test/email.test.ts`
- Test: `apps/web/src/realtime/dataInvalidation.test.tsx`

**Required action kinds:** `match.result.view`, `provider.match-result.review`, `admin.match-result.review`, `leaderboard.view`, `reward.view`, and `admin.reward-payout.review`.

**Exact Web deep links:**

```text
match.result.view               -> /matches/:matchId
provider.match-result.review    -> /manage/match-results?caseId=:caseId
admin.match-result.review       -> /admin/match-results?caseId=:caseId
leaderboard.view                -> /leaderboard
reward.view                     -> /rewards/:programId
admin.reward-payout.review      -> /admin/reward-payouts/:payoutId
```

Bank-information deadline notices use `reward.view` only for public program updates; winner-specific actions deep-link to `/rewards/payouts/:payoutId`. Paid notices deep-link to the same player payout detail. Do not add SMS routes.

- [x] Add failing tests for each action route, opted-out user with required delivery, email recipient lookup, role recipients, event replay, and email failure after durable inbox projection.
- [x] Keep `UserNotificationRequested` and the `emailPolicy` field already added in Task 2; do not add a second event type.
- [x] Add nullable `emailSentAt` and `emailLastAttemptAt` to `Notification`. Project the inbox row first; skip email when `emailSentAt` is set; otherwise set `emailLastAttemptAt`, send with existing `emailSender`, then persist `emailSentAt`. A provider failure keeps `emailSentAt=null` for retry and never duplicates the inbox row.
- [x] Emit required notifications from the owning tasks for cutoff, declaration, objection, incident, provider/Admin SLA, final result, rating, season/program, bank deadline, and paid reward.
- [x] Run focused Account/Web tests. Expected: required notices ignore disabled preferences and no SMS path exists.

**Depends on:** Task 2; event producers from Tasks 8–21. **Blocks:** final E2E.

---

### Task 23: Implement Player Creation, Team, And Funding UI

**Goal:** Implement the PO-approved creator/detail/payment screens using current components and APIs.

**Rules/AC:** BR-CM-01..22, AC-CM-01..10.

**Files:**

- Read: approved screens 01-02 in `docs/matchmaking-passport/mockups/desktop-preview.html`
- Read: `apps/web/src/pages/MatchListPage.tsx`
- Read: `apps/web/src/pages/MatchDetailPage.tsx`
- Read: `apps/web/src/components/MatchDepositCheckout.tsx`
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Modify: `apps/web/src/lib/matchApi.ts`
- Modify: `apps/web/src/pages/MatchListPage.tsx`
- Modify: `apps/web/src/pages/MatchDetailPage.tsx`
- Modify: `apps/web/src/components/MatchDepositCheckout.tsx`
- Modify: `apps/web/src/pages/manage/ManageVenueDetailPage.tsx`
- Modify: `apps/web/src/pages/manage/ManageVenuesPage.tsx` (required province on venue creation)
- Modify: `apps/web/src/pages/BookingPage.tsx` and `apps/web/src/pages/BookingPage.selection.test.tsx` (booking-flow match creation uses the Task 5 body)
- Test: `apps/web/src/pages/MatchListPage.created.test.tsx`
- Test: `apps/web/src/pages/MatchListPage.sources.test.tsx`
- Test: `apps/web/src/pages/MatchDetailPage.competitive.test.tsx`
- Test: `apps/web/src/components/MatchDepositCheckout.test.tsx`
- Test: `apps/web/src/pages/matchCommunitySupportSurfaces.test.tsx`
- Test: `apps/web/src/pages/manage/ManageVenueDetailPage.shutdownStatus.test.tsx`

- [x] Add failing API-client and UI tests for source tabs, ratio preview, paid-booking “không thanh toán lần hai” copy, BO3/BO5 duration guard, team slot selection, organizer remainder, the “hạn chốt kèo” state, and required province selection using the exact shared catalog.
- [x] Update `MatchBookingSource`, `MatchHoldSource`, `MatchRow`, and `MatchDetail` to carry the authoritative booking snapshot (`venue.name`, full `venue.address`, `court.name`, `startAt`, `endAt`), `sourceType`, mode, discipline, ratio, format, team slots, per-player profiles, server-authored financial preview, and allowed actions. Account profile `displayName`/`avatarUrl` is rendered as returned; initials are only the fallback for a null avatar.
- [x] Update `createMatch` to the exact strict Task 5 body and remove client `capacity` and `feeMode`. Add `teamSide` to join requests. Do not add parallel DTOs in page files.
- [x] Implement screen 01 in the existing `MatchListPage` creation surface: source selection first, then friendly/ranked, singles/doubles, ratio, skill range, and BO3/BO5. For paid booking, render `bookingPrice`, amount already paid, owner rebalance, result-held amount, and zero additional owner charge from the API response.
- [x] Implement screen 02 in the existing `MatchDetailPage`: business-state progress, locked configuration, authoritative venue/address/slot, exact participant names/avatars, team slots, each payment state, amount currently held, projected refund, and withdrawability label. Never render `cutoff`, `reserve`, `contribution`, raw enums, or ledger IDs.
- [x] Reuse current cards, warnings, `MatchDepositCheckout`, schedule-conflict confirmation, and polling. The paid-booking organizer never enters checkout; cash participants continue through the existing checkout component.
- [x] Render every financial value returned by the backend; do not recompute authoritative amounts in React. Client-only formatting may convert integer strings to Vietnamese VND display.
- [x] Match approved screens 01-02, maintain keyboard labels/focus/error summaries, keep compact period labels on one line, and verify no control overflows at browser zoom 100%.
- [x] Run focused Web tests. Expected: player can create from either source, choose a valid team, and see exact locked money terms.

**Depends on:** Tasks 1, 3, 5, 8–9. **Blocks:** Task 26.

---

### Task 24: Implement Result, Passport, Leaderboard, Badge, And Player Reward UI

**Goal:** Implement approved screens 03-08 and 13 so players can handle results, view dual rating/history, inspect rankings/programs, and maintain winning payout information without exposing private money, bank data, or evidence to unauthorized/public surfaces.

**Rules/AC:** BR-CM-23..61, AC-CM-11..29, AC-CM-31..35.

**Files:**

- Read: approved screens 03-08 and 13 in `docs/matchmaking-passport/mockups/desktop-preview.html`
- Read: `apps/web/src/components/CommunityComposer.tsx` for `ImageUploadPicker`
- Modify: `apps/web/src/components/CommunityComposer.tsx`
- Create: `apps/web/src/components/MatchResultFlow.tsx`
- Modify: `apps/web/src/lib/matchApi.ts`
- Modify: `apps/web/src/lib/passportApi.ts`
- Modify: `apps/web/src/pages/MatchDetailPage.tsx`
- Modify: `apps/web/src/pages/PassportPage.tsx`
- Create: `apps/web/src/lib/competitionApi.ts`
- Create: `apps/web/src/lib/rewardApi.ts`
- Create: `apps/web/src/pages/LeaderboardPage.tsx`
- Create: `apps/web/src/pages/RewardProgramsPage.tsx`
- Create: `apps/web/src/pages/RewardProgramDetailPage.tsx`
- Create: `apps/web/src/pages/RewardPayoutsPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/pages/MatchResultFlow.test.tsx`
- Test: `apps/web/src/components/ImageUploadPicker.test.tsx`
- Test: `apps/web/src/pages/PassportPage.test.tsx`
- Test: `apps/web/src/pages/LeaderboardPage.test.tsx`
- Test: `apps/web/src/pages/RewardProgramsPage.test.tsx`
- Test: `apps/web/src/pages/RewardProgramDetailPage.test.tsx`
- Test: `apps/web/src/pages/RewardPayoutsPage.test.tsx`

- [x] Add failing tests for: score rows and inferred winner; mandatory 1-3 evidence images at 5 MB each; checksum authorization; declaration and objection countdowns from `serverNow`; confirm/object branches; incident types and no-show availability; private evidence read; singles/doubles Passport tabs; separate paginated history; leaderboard filters/pagination/pinned viewer; 1600 band switch; region lock; badges; public reward detail; winner information completeness and seven-day deadline.
- [x] Extend `ImageUploadPicker` in place with `maxBytes?: number` and `authorize: (mimeType, metadata?: { size: number; checksumSha256: string }) => Promise<UploadAuthorization>`. Compute SHA-256 with `crypto.subtle.digest` before authorization and call `authorize(mimeType, { size, checksumSha256 })`; existing community/venue/support callers may ignore the optional second argument and must keep compiling. Result/objection/incident evidence passes `maxFiles={3}` and `maxBytes={5 * 1024 * 1024}`. Add one focused picker test for 5 MB + 1 byte rejection and checksum forwarding; do not create a second upload component.
- [x] Add typed `matchApi.ts` functions matching Tasks 11-13 exactly: result-case read, evidence authorization/upload/read, result claim, confirm, object, incident, and supplement. Centralize raw-status-to-business-label mapping in `MatchResultFlow`; pages do not duplicate it.
- [x] Implement approved screens 03-05 in `MatchResultFlow` mounted by `MatchDetailPage`: authoritative booking/account data, score validation, evidence thumbnails, first-claim 12-hour response state, confirm/object choice, and incident form. Selecting objection reveals reason plus 1-3 images; selecting incident never asks the player to choose a winner.
- [x] Render countdowns from `serverNow` plus the returned deadline and refetch on expiry; never finalize locally when a timer reaches zero. After refetch, only backend `viewerActions` controls enabled buttons.
- [x] Update `passportApi.ts` to the Task 15 and Task 18 contracts. In `PassportPage`, keep outer singles/doubles tabs, add inner `Vị trí xếp hạng`/`Lịch sử đấu` tabs, and fetch match history per discipline/page. Raw RD/sigma is not shown; use the backend stability/visibility fields. Do not display a seven-day rank-movement badge because no authoritative rank-history contract exists.
- [x] Implement `competitionApi.ts` with current season, region selection, paginated leaderboard filters, and viewer row. Implement screen 07 at `/leaderboard`; keep the current viewer pinned without duplicating them in the table page and use exact profile names/avatars from the response.
- [x] Implement `rewardApi.ts` public program list/detail and Finance player payout list/detail/information calls. Implement screens 08 and 13 at `/rewards/:programId`, `/rewards/payouts`, and `/rewards/payouts/:payoutId`. The form contains only recipient name, email, phone, address, bank, account number, and account name.
- [x] Add only these player routes in `App.tsx`: `/leaderboard`, `/rewards`, `/rewards/:programId`, `/rewards/payouts`, and `/rewards/payouts/:payoutId`. Keep all result actions inside `/matches/:id` and both rating/history views inside existing `/passport` routes.
- [x] Show approved Vietnamese business labels, use single `-`, keep compact labels on one line, and hide raw enum/event/ledger/object keys. Public page DTOs must not contain participant money, bank fields, or evidence.
- [x] Run focused Web tests. Expected: public responses contain no money/evidence/bank fields and all player result states are actionable.

**Depends on:** Tasks 10–22. **Blocks:** Task 26.

---

### Task 25: Implement Provider And Admin Competition/Reward UI

**Goal:** Implement approved screens 09-12 and 14 for provider recommendation, Admin final decision, season/program management, and payout proof inside the existing role shells.

**Rules/AC:** BR-CM-37..42, BR-CM-55..70, AC-CM-18..21, AC-CM-27..30.

**Files:**

- Read: approved screens 09-12 and 14 in `docs/matchmaking-passport/mockups/desktop-preview.html`
- Read: `apps/web/src/pages/manage/ManageIncidentsPage.tsx`
- Read: `apps/web/src/pages/admin/AdminDisputesPage.tsx`
- Read: `apps/web/src/pages/admin/AdminEvaluationsPage.tsx`
- Read: `apps/web/src/components/DisputeAdminPanel.tsx`
- Modify: `apps/web/src/manage/ManageLayout.tsx`
- Modify: `apps/web/src/admin/AdminLayout.tsx`
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/pages/manage/ManageMatchResultsPage.tsx`
- Create: `apps/web/src/pages/admin/AdminMatchResultsPage.tsx`
- Create: `apps/web/src/pages/admin/AdminSeasonsPage.tsx`
- Create: `apps/web/src/pages/admin/AdminRewardProgramsPage.tsx`
- Create: `apps/web/src/pages/admin/AdminRewardPayoutsPage.tsx`
- Modify: `apps/web/src/lib/matchApi.ts`
- Modify: `apps/web/src/lib/competitionApi.ts`
- Modify: `apps/web/src/lib/rewardApi.ts`
- Test: `apps/web/src/pages/manage/ManageMatchResultsPage.test.tsx`
- Test: `apps/web/src/pages/admin/AdminMatchResultsPage.test.tsx`
- Test: `apps/web/src/pages/admin/AdminSeasonsPage.test.tsx`
- Test: `apps/web/src/pages/admin/AdminRewardProgramsPage.test.tsx`
- Test: `apps/web/src/pages/admin/AdminRewardPayoutsPage.test.tsx`

- [x] Add failing tests for provider queue pagination/detail, private evidence read, non-binding copy, provider conflict bypass, Admin overdue state, preview-before-confirm/version conflict, season list/create overlap errors, immutable published program fields, running cancellation reason, configurable prize tiers, tie awards, bank deadline, 5 MB payout proof, and mark-paid second confirmation.
- [x] Reuse `ManageLayout` and `AdminLayout` exactly. Add one provider navigation link for `/manage/match-results`; add Admin links for `/admin/match-results`, `/admin/seasons`, and `/admin/reward-programs`. Keep the existing 220 px Admin vertical navigation and responsive horizontal fallback; do not replace it or create another shell.
- [x] Add routes in `App.tsx`: `/manage/match-results`, `/admin/match-results`, `/admin/seasons`, `/admin/reward-programs`, `/admin/reward-payouts`, and `/admin/reward-payouts/:payoutId`. Keep existing role guards unchanged.
- [x] Implement screen 09 in `ManageMatchResultsPage`: paginated queue, selected case detail, authoritative venue/slot/player data, signed evidence reads, one of `TEAM_A_WIN | TEAM_B_WIN | NO_RESULT`, required reason, and submit. After submission show “Chờ Admin quyết định”; never render provider output as final or release money/rating locally.
- [x] Implement screen 10 in `AdminMatchResultsPage`: queue/detail, provider proposal labelled `Đề xuất - chưa có hiệu lực`, three outcomes, required reason, preview impact rows, stale-version handling, explicit checkbox, then confirm. Disable final submission until a preview for the unchanged outcome/reason/version is loaded.
- [x] Implement screen 11 in `AdminSeasonsPage` with the Task 17 paginated list and native date inputs. Keep period names such as `Tháng 9-10/2026` on one line. At browser zoom 100%, the action column has fixed width, descriptions may wrap within their own cell, and every `Xem` button stays inside its row/card.
- [x] Implement screen 12 in `AdminRewardProgramsPage`: one criterion radio group, discipline/band/scope, province when required, native program dates, funding-source metadata, mutable list of rank/amount tiers, computed display-only total, publish lock explanation, and existing-program list/status actions. A finalized program exposes `Danh sách nhận giải`, linking to `/admin/reward-payouts?programId=:programId`; do not add a second payout navigation item or a generic rules-builder component.
- [x] Implement screen 14 in `AdminRewardPayoutsPage`: paginated status list and selected detail, receiver/bank data only inside authorized detail, payout deadline, transaction reference, checksum-aware proof upload through the same extended `ImageUploadPicker` with `maxFiles={1}` and `maxBytes={5 * 1024 * 1024}`, explicit receiver/amount confirmation, then mark paid. The UI does not create wallet or ledger operations.
- [x] Keep match result-review calls in existing `matchApi.ts`, season calls in `competitionApi.ts`, and reward-program plus Finance payout calls in `rewardApi.ts`. Never merge data by guessing IDs in React: wait for API response IDs and show independent loading/error states.
- [x] Use approved business labels and single `-`; hide raw statuses, object keys, event IDs, and ledger IDs. Admin/provider tables and buttons must fit at browser zoom 100% without horizontal overlap.
- [x] Run focused Web tests. Expected: no provider action can render a result as final and Admin cannot bypass two-step confirmation.

**Depends on:** Tasks 13 and 17–24. **Blocks:** Task 26.

---

### Task 26: Cross-Service Verification, Runtime QA, And Plan Closure

**Goal:** Prove the complete flow, record evidence, and move this plan to completed only after all required checks pass.

**Owner:** Independent reviewer (Codex) only. Claude stops after gate G5 and does not run Task 26 unless the PO reassigns it.

**Rules/AC:** AC-CM-01..35; repository completion standard.

**Files:**

- Create or modify: `e2e/competitive-matches.spec.ts`
- Modify during execution: `docs/plans/active/2026-09-25-competitive-matches.md`
- Move after success: `docs/plans/completed/2026-09-25-competitive-matches.md`
- Update only after executable proof: `docs/product/phase-2-progress.md`

**Required E2E scenarios:**

```text
1. Hold -> singles 7:3 -> both pay -> cutoff -> score -> no objection -> winner withdrawable credit.
2. Paid booking -> doubles 6:4 -> three participants pay -> cutoff -> one owner rebalance,
   zero new BookingRevenue/commission -> disputed result -> provider recommendation -> Admin final.
3. Underfilled paid booking -> match layer closes -> participants refunded -> booking remains confirmed.
4. No declaration -> 12h incident window -> silence -> NO_RESULT -> 50:50 net allocation -> no rating.
5. Ranked result -> singles/doubles independent rating -> anti-repeat exclusion -> leaderboard eligibility/band.
6. Reward program -> tie split -> seven-day bank deadline -> Admin proof/transaction -> paid notification.
```

**Root verification commands (run in order after validation approval):**

```powershell
git diff --check
npm run prisma:validate --workspace @khoaluantn/venue-booking-service
npm run prisma:validate --workspace @khoaluantn/matchmaking-service
npm run prisma:validate --workspace @khoaluantn/finance-service
npm run prisma:validate --workspace @khoaluantn/account-service
npm run prisma:validate --workspace @khoaluantn/community-service
npm run prisma:generate --workspace @khoaluantn/venue-booking-service
npm run prisma:generate --workspace @khoaluantn/matchmaking-service
npm run prisma:generate --workspace @khoaluantn/finance-service
npm run prisma:generate --workspace @khoaluantn/account-service
npm run prisma:generate --workspace @khoaluantn/community-service
npm run typecheck
npm run build
npm test --workspace @khoaluantn/account-service
npm test --workspace @khoaluantn/venue-booking-service
npm test --workspace @khoaluantn/finance-service
npm test --workspace @khoaluantn/matchmaking-service
npm test --workspace @khoaluantn/community-service
npm run e2e -- e2e/competitive-matches.spec.ts
```

For runtime QA, launch backend with `npm run dev` and Web with `npm run dev --workspace @khoaluantn/web` in separate retained terminals. Require HTTP 200 from `http://localhost:3000/health` through `http://localhost:3005/health` and load `http://localhost:5173` before Playwright/manual review. Do not inspect or restart Docker when the PO says infrastructure is already running.

- [ ] Run `git diff --check` and inspect every changed file for unrelated edits.
- [ ] Run the five explicit `prisma:validate` and five explicit `prisma:generate` commands above. Expected: all schemas validate and clients generate.
- [ ] Run focused tests named in Tasks 2–25. Expected: all pass.
- [ ] Run `npm run typecheck`, then `npm run build`. Expected: all workspaces pass.
- [ ] Run these sequentially: `npm test --workspace @khoaluantn/account-service`, `npm test --workspace @khoaluantn/venue-booking-service`, `npm test --workspace @khoaluantn/finance-service`, `npm test --workspace @khoaluantn/matchmaking-service`, and `npm test --workspace @khoaluantn/community-service`. Expected: all pass or every unrelated pre-existing failure is captured with exact evidence and no weakened guard.
- [ ] Start the existing local stack only after PO validation approval; probe gateway/services/web health.
- [ ] Run `npm run e2e -- e2e/competitive-matches.spec.ts` plus manual desktop review of all approved mockup states.
- [ ] Query Finance test data to prove paid booking has one `BookingRevenue`, one commission, no second booking settlement, one owner rebalance, and one result-release set.
- [ ] Verify private object bytes survive service restart and unauthorized signed-read requests fail.
- [ ] Record commands/results in this plan's Progress/Validation sections and move it to completed only when no required work remains.

**Depends on:** Tasks 2–25. **Blocks:** completion.

## Risks And Recovery

- **Financial migration/race:** Deploy additive columns/models first; keep old consumers compatible until producers and consumers are deployed together. Recovery is application rollback plus leaving additive data untouched; never reverse ledger entries by editing balances.
- **Paid-booking double settlement:** Guard by source type, existing `BookingRevenue`, processed-event ID, match advisory lock, and unique ledger references. Any mismatch fails closed for Admin investigation.
- **Result scheduler race:** All transitions lock `matchId`, compare case status/version, and write event/outcome in one transaction.
- **Evidence cleanup:** Retention marks `deletedAt` only after object delete succeeds. A failed delete remains retryable and never erases metadata first.
- **Rating replay/out-of-order result:** Unique match/user result rows remain mandatory. Rolling-window eligibility is reserved by `finalizedAt` inside the result-finalization transaction and never by match `endAt` or raw consumer arrival order.
- **Rollback:** Revert application code only. Additive schemas stay. Disable new routes/schedulers if needed; never delete result, evidence metadata, funding, ledger, award, or audit rows.

## Progress

- [x] Product specification approved and approval markers updated on 2026-09-25.
- [x] Current code mapped to existing service boundaries.
- [x] All 14 companion desktop mockups approved by the PO on 2026-09-25.
- [x] Task 1 durable `desktop-preview.html` synchronized from those approved companions and checked at browser zoom 100%.
- [ ] Tasks 2–25 implemented and focused-verified.
- [ ] Task 26 repository/runtime verification complete.

## Decisions

- 2026-09-25: No new service. Extend current owners and existing outbox/ledger/storage/ticket patterns.
- 2026-09-25: Paid-booking cutoff reuses prior booking payment/revenue/commission and only performs owner rebalance plus reserve lock.
- 2026-09-25: Province is a shared 34-value catalog; ranked venues require a structured province code.
- 2026-09-25: Finance recomputes result allocations from stored contributions and never trusts allocation amounts from Matchmaking/client.
- 2026-09-25: Provider recommendation cannot call the finalizer; only undisputed scheduler paths or confirmed Admin decisions can emit `MatchResultFinalized`.
- 2026-09-25: Existing support tickets carry rating-correction requests; no second support workflow is created.
- 2026-09-25: Post-mockup reconciliation changes only the durable visual baseline, API read/upload contracts, and Tasks 23-25 Web execution steps; existing money, result, rating, badge, and reward domain rules remain unchanged.
- 2026-09-25: Screen 07 shows current rank and a pinned viewer row; the decorative seven-day rank movement is omitted because no approved rank-history rule or authoritative API exists.
- 2026-09-25 (PO): Claude executes Tasks 1-25 directly; Task 26 belongs to an independent Codex reviewer. Five review gates G1-G5; a local checkpoint commit follows each passed gate; no push.
- 2026-09-25 (PO): Evidence and payout proof use a separate private bucket with authorized signed reads only; key obscurity on the public bucket is rejected.
- 2026-09-25 (PO): Checksum stays mandatory. Use R2 `ChecksumSHA256` if HEAD returns it, otherwise signed `x-amz-meta-sha256` metadata read back through HEAD; decided by a real-endpoint spike in Task 2.
- 2026-09-25: Task 1 embeds each approved companion unchanged through `iframe srcdoc` so companion CSS cannot collide; brainstorm review chrome is hidden, en dash is replaced by `-`, and screen 10 adds only the "ĐỀ XUẤT - CHƯA CÓ HIỆU LỰC" label plus the Admin-overdue lock sentence. Headless Chromium at 1680 px: 14/14 screens load, no horizontal overflow, stale-copy scan returns 0.
- 2026-09-25 (PO): The shared `emailPolicy` notification contract moves to Task 2; persistence and email delivery stay in Task 22.
- 2026-09-25: D57 gives a receiving team without the organizer its odd-VND remainder through existing earliest-JOIN order, and gives rolling-seven-day rating precedence to the first official `finalizedAt`.
- 2026-09-25: Task 2 R2 spike (real R2 endpoint and local MinIO, test objects under spike/ deleted): presigned PUT with signed `x-amz-checksum-sha256` rejects a different body (R2 `BadDigest`, MinIO `XAmzContentChecksumMismatch`) and `HeadObject(ChecksumMode=ENABLED)` returns the same `ChecksumSHA256`. Native checksum is used; the metadata fallback is not needed.
- 2026-09-25: `inspectOwnedObject` lives on a new `PrivateObjectStorageClient` interface so existing `ObjectStorageClient` test fakes stay valid; it accepts optional `expectedChecksumSha256`. Private client (`createPrivateObjectStorageClientFromEnv`, `OBJECT_STORAGE_PRIVATE_BUCKET`) accepts only `match/results`/`finance/rewards`, requires a checksum, and cannot carry a public base URL; the public client rejects those namespaces. Local MinIO gets bucket `khoaluantn-private`; `packages/object-storage/r2-private-cors.json` is prepared but not applied to R2.
- 2026-09-25: Added notification action kind `reward.payout.view` (seventh kind) because winner payout notices deep-link to `/rewards/payouts/:payoutId`, which none of the six listed kinds routes to.
- 2026-09-25: Task 3 enforces the required province only at HTTP `POST /venues` (domain `createVenue` accepts null so legacy fixtures stay valid). `GET /players/me/match-sources` adds `sources: MatchSourceView[]` beside the legacy `holds`/`bookings` fields, which Task 23 removes after Web switches. Paid-booking sources are owned marketplace `confirmed` bookings with `startAt > now`, excluding bookings created by a match (`holdPurposeSnapshot = match`); hold sources price through `calculateBookingPrice`. Web venue creation (`ManageVenuesPage`) must send `provinceCode` in Task 23.
- 2026-09-25: `npm run prisma:generate --workspace @khoaluantn/venue-booking-service` fails from the service directory (`Could not resolve @prisma/client`); generate from the repo root with `npx dotenv -e .env -- prisma generate --schema services/<service>/prisma/schema.prisma` (same form Matchmaking/Community scripts use).
- 2026-09-25: Task 4 schema tests live in a non-gated describe inside `g0Database.test.ts` that creates and deletes only its own rows; the existing `P2_G0_DATABASE_GATE` describe wipes whole tables and stays skipped on the shared local/dev database. `prisma migrate diff` against the local DB reports no drift.
- 2026-09-25: Task 5 `MatchFundingView` returns `organizerContribution`, `organizerRefundAtLock` and `organizerRefundWithdrawable` only to the organizer (null for others) because BR-CM-61 keeps personal contributions/refunds private; everyone sees the regular slot amount and their own amount due. Legacy matches without `bookingPrice` return `funding: null`. Skill range is locked at creation (`skillConfiguredAt = now`); the legacy `PATCH /skill-range` stays for old matches. Quick Match accept and legacy organizer approval, which carry no team choice, place the player on the side with room, B first. Legacy joins without `teamSide` count as team B. `MatchCreated`/`JoinApproved` gained optional v2 fields so old events still parse.
- 2026-09-25: Callers still on the old create body are updated by their owning tasks: `finance-service/test/matchFee.e2e.test.ts` (Task 7), `matchmaking-service/test/matchServiceChain.e2e.test.ts` (Task 8), and Web `MatchListPage`/`BookingPage` plus their tests (Task 23).
- 2026-09-25: G1 review fixes. (1) `actions.canPay` requires `cutoffAt > now` and an open match for a participant JOIN, or `awaiting_deposit` for the organizer; a JOIN still inside its 10-minute hold after cutoff can no longer pay. (2) `updateVenue` rejects `MISSING_PROVINCE` when a legacy venue without a province is edited without one; venues that already have a province keep partial PATCH. (3) Screen 07 in the durable preview drops the seven-day movement badge and the Thay đổi column, keeping only the current rank.
- 2026-09-25: Task 7 guards `refundPaidContribution` so a `booking_payment` organizer contribution is never refunded as cash (it never entered `platform.reserved`); cancelling a paid-booking match layer refunds only cash participants. All late or extra match-fee receipts now go through `creditLateMatchFee`/`creditAdditionalMatchFeeReceipt` with `withdrawableDelta` (BR-CM-16).
- 2026-09-25: Baseline red: `finance-service/test/matchFee.e2e.test.ts` (gated by `RUN_P2_FIN_E2E=1`) fails 11/11 with `expected 400 to be 201` on match creation. It already failed before G1 (the pre-v2 `createMatch` required `holdId` and returned 422 for its `bookingId` body) and it still models D44 organizer approval and organizer-pays-last. Task 7 proof is `matchFee.test.ts` 12/12; the e2e suite is rewritten to the v2 model in Task 14, which also lists it.
- 2026-09-25: Task 8 paid-booking cutoff: Finance `handleMatchConfirmed` settles locally (no `MatchSettlementRequested`, no Venue call) only when an uncancelled `BookingRevenue` with `gross = P` exists, otherwise it throws so the event is retried/quarantined for Admin. The owner rebalance is two ledger entries with `refType = matchOwnerRebalance`, `refId = matchId` (platform reserved debit, personal credit with `withdrawableDelta`); idempotency comes from the processed-event guard plus the `settled` status. Both branches set `resultReserveStatus = locked` (or `none` for 5:5) and emit `MatchFundingCompleted`; Matchmaking moves `filled` to `confirmed` on it, and the hold branch still also reacts to `BookingConfirmed`.
- 2026-09-25: `matchServiceChain.e2e.test.ts` (gated by `RUN_P2_SERVICE_E2E=1`) was stale before v2 (capacity 4 singles-only, unauthenticated read of an awaiting-deposit match, UTC pricing that produced price 0 near midnight Vietnam time). It now uses the Task 5 body, reads as the organizer, and pins the slot to 10:00 Vietnam time; it passes 1/1 with the gate on.
- 2026-09-25: Task 9 paid-booking matches close only the match layer locally (organizer cancel before cutoff, underfilled cutoff) and never call Venue; paid-booking participant withdrawal before cutoff is local with a full refund request and is rejected after cutoff (`JOIN_LOCKED_AT_CUTOFF`). Hold-source withdrawal keeps the existing D39 Venue path. Organizer cancellation after cutoff returns `MATCH_LOCKED_USE_INCIDENT` for both sources (the legacy D33 crash-recovery intent still completes first). Booking cancellation of a settled match uses `allocateMatchCancellationRefund`: (booking refund per policy + locked reserve) split 50:50 by team, floor per member, all remainders to the organizer; the reserve leaves `platform.reserved` as `refType = matchResultReserve` and `resultReserveStatus` becomes `refunded`. The old D37/D33 tests were rewritten to the D56 rule.
- 2026-09-25: The Task 9 step "result dispute does not modify BookingRevenue" has no code to exercise until disputes exist; it is verified in Tasks 13-14.
- 2026-09-25: G2 review fixes. (1) `refundCancelledBooking` skips a `cancelled` funding only for the hold source; a closed paid-booking match layer falls through to the ordinary owner refund. (2) Paid-booking settlement and booking cancellation share one lock order (`matchId` then `hashtext(bookingId)`); the settlement re-reads `BookingRevenue` after both locks, so exactly one of rebalance or ordinary owner refund happens. (3) A new withdrawal after cutoff is rejected for both sources (`JOIN_LOCKED_AT_CUTOFF`); only a D39 withdraw command persisted before cutoff may still resolve. (4) `BookingConfirmed` confirms only hold-source matches; paid-booking matches wait for `MatchFundingCompleted`. The old D32 after-cutoff withdrawal test was rewritten to BR-CM-07.
- T10: Append-only audit is enforced by DB BEFORE UPDATE triggers on result_claims/result_sets/result_responses/provider_recommendations/admin_result_decisions; result_evidence may only transition deletedAt null->timestamp with every other column unchanged. DELETE is not DB-blocked (test cleanup) and no code path deletes these rows.
- T10: Commit re-reads storage via inspectOwnedObject and requires a storage-verified SHA-256 (upload URL signs x-amz-checksum-sha256); evidence items may optionally echo checksumSha256, which must then match. Roster = organizer + confirmed JOINs; provider may read evidence only while the case is provider_review; Admin = JWT role admin.
- T10: MatchResultCase carries the deadline columns Tasks 11-13 need (objection, team grace, incident, provider, admin SLA/reminder) to avoid extra migrations. Private storage wiring in app.ts moves to Task 11 where the first result route exists; index.ts reuses startMatchCutoffScheduler hourly for retention with a lazily created private client (missing config only logs).
- T11: A player may file one claim per case (RESULT_CLAIM_EXISTS); claims are accepted only while status is declaration_open/provisional and before declarationDeadlineAt. An opposite-winner claim clears the provisional outcome and routes to provider_review (providerDeadlineAt=+24h) or straight to admin_review when the provider is null or in the roster; Task 13 builds on openResultDispute.
- T11: The result case opens from BookingCompleted and also when MatchFundingCompleted/BookingConfirmed moves an already-completed match to completed. GET result-case returns { resultCase: PlayerResultCaseView }. viewerMoney: heldForResult = match resultReserve; projectedReceivable = viewer allocation from allocateResultReserve (same split as Finance Task 14) under the provisional outcome, or NO_RESULT when none; projectedFinalCost = viewer contribution - projectedReceivable. publicIdentity/participantIdentity were extracted from the match detail for reuse.
- T12: Only losing-team roster members may confirm; any roster member may object while provisional and before max(objectionDeadlineAt, teamGraceDeadlineAt). A pending team grace replaces the objection deadline as the undisputed finalization trigger. Undisputed finalization uses the case id as decisionId; writeResultFinal is shared with the Task 13 Admin path. Incidents are accepted in declaration_open, provisional (response window) and incident_window, and create the case early (declaration deadline endAt+12h) for confirmed/completed matches so pre/during-match incidents work. Match detail canReportIncident = locked roster member of a confirmed/completed v2 match; the server enforces the case window. Deadline sweep reuses startMatchCutoffScheduler every 60s.
- T13: No packages/shared change was needed (result action kinds and emailPolicy landed in Task 2). Result notifications use UserNotificationRequested with emailPolicy=required: provider/Admin review kinds (match.result.provider_review, admin_review, admin_reminder, admin_overdue) target provider user or role admin; match.result.final goes to the roster from the shared writeResultFinal. Overdue is derived (adminReviewStartedAt + 48h), no extra column; adminNextReminderAt advances by 24h under the match lock so replay does not duplicate reminders. Provider queue/detail only covers cases that entered provider review (providerDeadlineAt set), which excludes roster-conflict cases. Admin confirm requires confirm:true and the previewed caseVersion; outcome/reason are taken from the confirm request. Review sweep runs every 5 minutes.
- T14: allocateResultReserve moved to packages/shared (competitiveMatches.ts) so the Matchmaking viewerMoney/Admin preview and Finance calculateResultAllocations share one rule. Finance orders team members by contribution createdAt (organizer first), its stored proxy for JOIN order; legacy null teamSide = organizer A / participant B. Ledger: platform reserved debit and personal available credit with withdrawableDelta, type release, refType matchResult, refId <decisionId>:<userId>; idempotency comes from ProcessedEvent plus resultFinalizedAt (the ledger has no unique ref constraint). A final event before funding settles throws for retry; cancelled/refunded funding is a no-op; zero reserve records resultFinalizedAt with status none.
- T14: finance matchFee.e2e.test.ts (RUN_P2_FIN_E2E) was rewritten to the v2 model: 3 scenarios (hold 6:4 doubles undisputed release with BookingRevenue unchanged; singles 7:3 objection -> provider recommendation -> Admin decision release; pre-cutoff withdrawal refund plus underfilled cutoff cancellation with value conservation). Removed v1-only scenarios: feeMode free match, organizer-pays-last SePay intent rule, post-cutoff withdrawal refund, and the D39 held-settlement races (settlement now runs at cutoff; those guards stay covered by matchPayments/matchFee unit suites). Result: 3/3 green; former 11/11 red baseline retired.
- 2026-09-26 (PO): Append-only audit now also blocks DELETE (migration 20260925103500_result_audit_no_delete); only a transaction with SET LOCAL app.result_audit_purge='on' may delete, used solely by test cleanup (test/resultTestUtils.ts purgeResultCases). Supersedes the T10 note that DELETE was not DB-blocked.
- 2026-09-26 (PO): Approved one claim per player per case (RESULT_CLAIM_EXISTS); a wrong claim is corrected through objection/incident. viewerMoney.heldForResult is the viewer's own share of the result reserve = floor(viewer contribution * resultReserve / totalContribution), replacing the whole-match reserve from the T11 note.
- 2026-09-26: Finance v2 e2e adds the D39 race: a withdrawal persisted before cutoff and the cutoff settlement both reach Venue at revision 0; the withdrawal wins, the participant is refunded, the stale settlement is held_revoked, funding returns to collecting and the next cutoff sweep cancels the underfilled match with full refunds and no BookingRevenue/settlement ledger. RUN_P2_FIN_E2E=1 matchFee.e2e 4/4.
- 2026-09-26 G3 Codex review fixes: (1) Admin preview returns previewToken = HMAC(JWT_SECRET, admin, case, version, outcome, reason); POST admin-decision additionally requires previewToken and rejects any other outcome/reason/admin with RESULT_PREVIEW_MISMATCH (PO chose option a; preview stays read-only). (2) Evidence upload is allowed before a result case exists for the locked roster of a confirmed/completed match, so pre/during-match incidents can attach evidence. (3) result_evidence.objectKey is globally unique (migration 20260926101000_result_evidence_object_unique); one object belongs to one case, so retention can never delete another case's binary. (4) JoinApprovedPayload.joinedAt (optional) carries the authoritative JOIN time; Finance stores MatchContribution.joinedAt (migration 20260926100000_contribution_joined_at) and orders remainders by it, falling back to createdAt for legacy rows. (5) objectionOpenUntil = teamGraceDeadlineAt ?? objectionDeadlineAt and is the single deadline used by the API, DTO and finalizer. (6) Player result-case view adds finalOutcome (case outcome when final) independent of claims. (7) Retention/deadline/review sweeps accept optional matchIds so tests stay inside their fixtures.
- T15: Passport PK is (userId, discipline); migration 20260925104000_dual_passports backfills every row as singles (default then dropped). A second self-declaration per discipline returns 409 LEVEL_ALREADY_DECLARED (cooldown removed; redeclarationRating stays in rating.ts for Task 16 corrections). RatingPeriodReady.discipline defaults to singles for events already queued. GET /passports/me returns { singles, doubles, canDeclare, evaluation fields, recentMatches } where each discipline view exposes declaredTier, tier, rounded rating, matchesPlayed, ratingStability (RD >= 200 = high_uncertainty) and leaderboardVisible (RD < 200; season eligibility arrives in Task 19); sigma/RD are not returned. recentMatches (already capped at 20) stays until Task 18 replaces it with paginated history, because the evaluation UI depends on it. Public Passport returns per-discipline { tier, matchesPlayed } only. Match detail, pending JOIN compatibility and AI suggestions read the Passport of the match discipline; AI only suggests disciplines the player has declared. Stale tests fixed on the way: aiMatchmaker.e2e join now sends teamSide and seeds MatchCreated (red since the G1 join contract, not previously run).
- T16: Ticket gains type (general|rating_correction), metadata {discipline, requestedTier} (required exactly for rating_correction) and a one-time correctionDecision JSON {decision, approvedTier, reason, adminUserId, decidedAt}; the decision also resolves the ticket, posts the reason as an admin message and notifies the requester. approvedTier defaults to requestedTier and is rejected on reject. community-service now depends on @khoaluantn/shared for the payload type. The community migration excludes a pre-existing, unrelated account_locks default drift that prisma migrate diff reports. Matchmaking consumes RatingCorrectionApproved on the existing rating queue; idempotency is the unique PassportCorrection.ticketId audit row (ticket, admin, tier, previous/new rating, matchesPlayed). If the player has no Passport for that discipline the approval creates it at the approved tier center (same as the zero-match reset).
- T17: Season status is derived (scheduled/active/closing from startAt/endAt, closed from closedAt) instead of a stored enum; POST close is allowed only after endAt. Overlap is rejected under a global advisory lock with half-open intervals (exact adjacency allowed); a started season cannot move startAt. SeasonStat holds per-season counters (matchesPlayed, wins, provinceMatches, current/longest win streak, ratingGain) for Tasks 18-20. Admin list eligiblePlayerCount = distinct users with >= 5 season results and RD < 200 in some discipline. The ranked region guard (SEASON_REGION_REQUIRED) runs at ranked create (before the hold is converted) and ranked join, but only while a season is active; with no active season ranked play is not blocked because no region can be chosen. /competition is served under the existing /api/matchmaking gateway prefix.
- T18: reserveRatedResults runs inside the shared writeResultFinal transaction (match lock held), takes user advisory locks in sorted userId order, writes RatedEncounter (rated=false when an earlier rated encounter with the same opponentKey has finalizedAt within the last 7 days, exact 7 days allowed, or when a player lacks the discipline Passport) and emits RatingPeriodReady only for rated players with the opponent snapshot (doubles: arithmetic mean rating/RD). The consumer applies Passport + MatchRatingChange + SeasonStat in one user-locked transaction, skips non-rated encounters, and is idempotent by the unique MatchRatingChange as well as ProcessedEvent. Season stats go to the season whose [startAt, endAt) contains the match endAt; provinceMatches counts matches whose venue province equals the locked season province. Leaderboard ranks use RANK() over rounded rating (ties share a rank), eligibility = >= 5 season results and RD < 200 (+5 province matches for province scope), band from the current rating. Passport.lastAgedAt drives RD aging (null -> set without backfill; each rated result resets it); the aging sweep runs hourly and applies whole missed 7-day periods. AccountClient gains getPublicDisplayNames (existing internal endpoint); hidden identities show 'Người chơi'. GET /passports/me/matches covers final winner outcomes only (win/loss); scoreLabel is from the viewer side and empty when the result came from an Admin decision without a claim; recentMatches stays on /passports/me until the web switches (Task 23).
- T19: PlayerBadge stores badgeType as the plan key string (WIN_STREAK_n, TOP_10, KING_OF_COURT), scope global|province and provinceCode '' for global so the unique key never contains NULL. Streak badges come from the season win streak inside the rated-result transaction (non-rated results never reach it, so friendly/NO_RESULT/over-limit are excluded). closeSeason awards TOP_10 (RANK() <= 10, ties included) and KING_OF_COURT (rank 1, ties included) for every discipline x band x (global + each chosen province) using the shared rankedBoardSql CTE, idempotent via skipDuplicates and the early return for closed seasons. Passport APIs return { label, disciplineLabel, seasonName, provinceName, awardedAt } without raw enum values.
- T20: Program status is stored and advanced by a 60s sweep (scheduled->active at startAt, active->reconciling after endAt, reconciling->awaiting_admin_approval once no ranked match of that discipline with endAt inside the window lacks a final result, computing RewardAward rows at that moment). Publish requires a future startAt; there is no update endpoint, so published fields are immutable. Cancel: draft/scheduled directly; running requires a reason and notifies every player with a rated result in the window (emailPolicy required). Participants = players with >= 1 rated result whose Match.endAt is in [startAt, endAt]; band and province scope use the ending rating / locked season province; most_wins, largest_rating_gain and longest_streak require a positive score, ending_rating does not. MatchRatingChange gains won (set by the rating consumer) for win/streak criteria. RewardAwardsFinalizedPayload gains programName and per-award rank so Finance can label payouts; the claim deadline is approval time + 7 days. Public list excludes drafts; public detail returns countdown inputs, criterionLabel and the viewer's provisional rank/score while active or later.
- T21: RewardPayout (unique awardId and transactionReference) is created from RewardAwardsFinalized with the program name and rank label; no wallet or ledger row is ever written. Information is accepted while now < claimDeadlineAt (at the deadline the claim is lost) and may be corrected while ready_to_pay; the first submission sets payoutDeadlineAt = +7 days. A 60s scheduler cancels only awaiting_information rows at/after the claim deadline with a notification; ready_to_pay rows are never auto-cancelled and the Admin view flags them overdue. Proof uploads use the private finance/rewards namespace with a signed checksum (<= 5 MB, owner = uploading Admin); mark-paid requires confirm:true, a transaction reference and a committed proof whose storage checksum exists, and paid rows reject any further mark-paid. Only the winning owner (player detail) and Admins receive a signed proof URL; bank fields exist only in Finance.
- 2026-09-26 G4 Codex review fixes: (1+3) countPendingRatedWork = ranked matches in the window without a final result plus rated encounters without a MatchRatingChange; reward programs stay reconciling and closeSeason returns 409 SEASON_RESULTS_PENDING while it is non-zero. (2) ending_rating takes the most recently written ratingAfter (MatchRatingChange.createdAt) among in-window results; streaks keep match endAt order. (4) closeSeason snapshots finalRating/finalRd onto SeasonStat before awarding badges; leaderboards use COALESCE(snapshot, live Passport), so closed seasons never move (migration 20260926102000_g4_review_fixes). (5) RatedEncounter stores the reserved result (opponent rating/RD snapshot, score); a RatingPeriodReady event only triggers draining every unapplied rated encounter of that user/discipline in finalizedAt order, so rating chains and streak badges no longer depend on RabbitMQ delivery order. (6) GET /rewards/admin/programs/:id returns the stored awards (user, display name, rank, score, amount, total) before approve-final. (7) allocatePrizes drops zero-amount shares (the pool is still fully allocated), so Finance never receives a 0 award. (8) leaderboardVisible = RD < 200 and >= 5 results in the active season.
- Web red baseline before the first G5 web change (2026-09-26, apps/web vitest): 2 failed / 155 passed - adminOperations.test.tsx 'submits a validated partial-refund dispute decision' and managePages.test.tsx 'keeps the edit form read-only until editing...'. Tracked, not introduced by this plan.
- T22: emailPolicy=required also bypasses a disabled category preference (spec: required notices ignore preferences). Account projects the inbox row first, then per row sets emailLastAttemptAt, sends via the existing emailSender (subject = title, body + short app hint) and sets emailSentAt; a provider failure rethrows so the event is redelivered and only the email is retried. Web routes cover the six plan action kinds plus reward.payout.view (/rewards/payouts/:payoutId); leaderboard.view needs no entity id. Producers added in this task: result declaration opened and dispute opened (roster), rating changed (player, leaderboard.view), reward payout ready (all admins). Already emitted earlier: provider/Admin review and SLA reminders, final result, reward program cancellation, reward won / claim expired / paid. Cutoff notices remain the existing match.confirmed / match.cancelled notifications; no separate bank-deadline reminder is sent before expiry (the win notice states the 7-day window). The account migration excludes pre-existing index drift on notifications.
- T23: Screen 01 lives in MatchListPage behind ?create=1 (deep-linkable, no new route) via components/MatchCreatePanel; money is read from a new read-only GET /matches/funding-preview (backend calculateMatchFunding + allocateResultReserve on the Venue-supplied source price) so React never computes amounts. Screen 02 is rendered by components/MatchCompetitiveSections inside MatchDetailPage for v2 matches (funding present); legacy matches keep the old layout. The progress steps are a display mapping of backend status/participants/openSlots. MatchDepositCheckout now shows funding.organizerContribution from the match detail instead of fullPrice/2. Web depends on @khoaluantn/shared for VIETNAM_PROVINCES; ManageVenuesPage requires a province and ManageVenueDetailPage can set it on edit. Fixed a pre-existing bug found in browser verification: getPublicMatchDetail returned 404 when the organizer had no public profile (demo account); it now shows the neutral D31 identity. Verified with agent-browser against the full local stack (6 services + Docker infra, seeded hold + paid booking): desktop 1440 create (hold and paid booking) and detail screens, no horizontal overflow.
- T24: Own Passport (GET /passports/me) gained a per-discipline `season` block {matchesPlayed, wins, currentWinStreak} for the active season so screen 06 can show season stats without a new endpoint. The screen 06 "+N trận gần nhất" chip is not rendered (rating deltas are visible per match in Lịch sử đấu). Screens 06-08 and 13 use existing primitives (SegmentedControl, Tabs, Pagination); `Tabs`, `SegmentedControl` and `MatchCreatePanel.ChoiceGroup` type `onChange` with `NoInfer<T>`, which also fixed type errors in MatchCreatePanel that the earlier T23 typecheck missed (it ran against the empty root apps/web tsconfig; correct check is `tsc -p apps/web/tsconfig.app.json`). Leaderboard opens the viewer's own board (season region, band from current rating) and keeps the viewer's card beside the table; no movement column. `useServerCountdown` shows days when >= 24h and is shared by result and reward screens. `ImageUploadPicker` always forwards size + SHA-256 to `authorize`; other callers ignore the second argument (their tests now expect it). Payout form prefills name/email/phone from the account profile; the backend player view does not return submitted receiver data, so a ready_to_pay resubmission starts from the profile prefill. Nav: player top bar gained `Bảng xếp hạng`; user menu gained `Giải thưởng của tôi`. Verified with agent-browser on the full local stack (seeded season/leaderboard/program/payout and an ended ranked match): screens 03, 06, 07, 08, 13 at 1440 px, no horizontal overflow; payout information submitted through Finance and moved to Chờ chuyển thưởng. Screens 04/05 are covered by component tests only: exercising them live needs evidence uploads, which would write to the real R2 bucket.
- T25: Screens 09/10 share components/ResultCaseReview (summary, statements with signed evidence reads via the existing player read route, three-outcome radio group). Outcome labels always carry the team (`... thắng (Đội A)`) because anonymous players all display as `Người chơi` and two identical options were observed in browser verification. Admin decision: the confirm button is enabled only while the loaded preview matches the current outcome, trimmed reason and case version and the review checkbox is ticked; any change clears the preview, and a failed confirm (for example RESULT_CASE_VERSION_CONFLICT) reloads the case and forces a new preview. The Admin queue sits above the detail below 2xl so the detail keeps two columns at 1440 px inside the 220 px Admin navigation. Seasons and reward programs take native dates as Vietnam calendar days: start = 00:00 +07:00, end = 00:00 +07:00 of the day after the chosen last day. Season activity treats endAt as exclusive (startAt <= now < endAt). Reward programs count a match when startAt <= Match.endAt <= program.endAt, so a 23:00-24:00 slot on the chosen last day (ending exactly at the next 00:00) is included, while the earliest next-day match ends at 01:00 and is excluded; Codex G5 finding 9 was reviewed and needs no code change. Program creation creates then publishes behind one confirmation dialog; cancelling a running program (active, or scheduled with a start in the past) requires a reason, matching the backend rule. Approve-final opens the stored award list (ties shown as separate rows with the same rank) before the approve call. Payout proof uses the extended ImageUploadPicker (1 file, 5 MB, checksum) and mark-paid needs the reconciliation checkbox plus a second confirmation dialog showing receiver and amount. The payout list shows no receiver/bank fields; they appear only in the detail view. PO-approved contract change (2026-09-26, option a): GET /rewards/admin/payouts now returns `adminPayoutListItem` (player view fields + overdue) without receiver, proof, paidByUserId or userId; GET /rewards/admin/payouts/:id and mark-paid keep the full admin view. Provider navigation gained `Hồ sơ kèo`; Admin navigation gained `Tranh chấp kèo`, `Kỳ xếp hạng`, `Chương trình thưởng`. Removed the legacy `holds`/`bookings` fields of GET /players/me/match-sources (web now reads only `sources`; the held-booking-only legacy test was deleted). Browser verification (agent-browser, full local stack, desktop 1440 px, local dev staff user with admin+provider roles and a Redis-backed session created directly in the local DB): screens 09, 10 (preview loaded, confirm enabled only after the check), 11 (backend SEASON_OVERLAP message shown), 12 and 14, no horizontal overflow. The final Admin confirm and mark-paid were not executed live because they emit notifications with required email; both are covered by component tests.
- G5 Codex review fixes (PO chose option a, 2026-09-26): (1) MatchDetailPage passes the chosen team explicitly through the schedule-conflict check and its continue path (the old code read a stale `joinSide` state and could send B for A). (2) account-service keeps one fast RabbitMQ redelivery and adds `retryPendingRequiredEmails`, run every 5 minutes: rows that were attempted (emailLastAttemptAt) but not sent are retried after >= 5 minutes, for at most 7 days. (3) Spec §11 producers added: first claim (`match.result.provisional`, roster), partial doubles confirm (`match.result.confirmed_partial`), declaration expiry into the incident window (`match.result.incident_window`), and one-time reminders 2 hours before the declaration deadline (roster) and the response deadline (losing side) via `sweepResultReminders`, deduplicated by new MatchResultCase columns declarationReminderAt/responseReminderAt (migration 20260926140000_result_deadline_reminders). (4) MatchResultFlow refetches on realtime notifications (useLiveDataRefresh) and, once a deadline has passed, keeps refetching every 30 seconds until the server returns a new deadline/status. (5) Provider/Admin review pages keep the selected case in `?caseId=`, so notification links open that case even outside the current queue page. (6) Players can add supplementary evidence (POST /matches/:matchId/result-evidence) while the case is provisional, in the incident window or under provider/Admin review. (7) Claim, objection, incident and supplement submits stay disabled while any chosen image is still uploading or failed. (8) Own Passport returns `leaderboardBand` computed from the unrounded rating like the leaderboard query; web no longer derives the band from the rounded display rating. (9) See the program boundary note above; no code change. (10) Match history returns `mode`; unrated ranked matches show `Kèo xếp hạng - không tính điểm`.
- Local email safety (2026-09-26): the seeded overdue Admin case triggered `match.result.admin_overdue` to every local admin (about 100 leftover test admins with example.com addresses) through the real email provider configured in `.env`. Seeded cases were muted, and `.claude/launch.json` gained `backend-no-email`, which blanks Gmail/SMTP variables for the dev process (dotenv does not override existing variables) so emails go to the console stub during local UI verification. `.env` was not changed.

## Validation

- Focused proof: Per-task Vitest/Supertest tests listed above.
- Integration proof: Existing Matchmaking/Finance/Venue chain tests plus `e2e/competitive-matches.spec.ts`.
- Runtime proof: health probes, desktop Playwright flow, finance ledger/revenue queries, object-storage restart/read authorization.
- Repository checks: Prisma validate/generate, workspace typecheck, build, full service tests, `git diff --check`.

## Result

Pending implementation and verification.
