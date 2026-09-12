# Personal Wallet Withdrawals Implementation Plan

> **For agentic workers:** Execute each checked task with test-first proof; do not stage or alter unrelated working-tree changes.

**Goal:** Let a player withdraw only post-rollout refunds and excess transfers through the existing Admin payout process.

**Architecture:** Add a withdrawable partition to `Wallet` and attach each withdrawal request to a personal or business wallet type. Personal money movements preserve the eligibility subset, while the existing withdrawal lifecycle and Admin queue serve both wallet types.

**Tech Stack:** Prisma/PostgreSQL, Express, React/Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-personal-wallet-withdrawal-design.md`

## Global Constraints

- Existing personal wallets start with `withdrawable = 0`.
- Only new refunds/excess transfers increase `withdrawable`; topups never do.
- Minimum withdrawal is `10000n`; money and ledger behavior remain append-only.
- Preserve the current uncommitted D51/manual-payout changes.

### Task 1: Persist personal eligibility and request wallet type

**Files:** schema, one additive SQL migration, domain tests.

- [ ] Write a failing domain test asserting an existing personal wallet starts with zero withdrawable balance and a new personal withdrawal request records `walletType: 'personal'`.
- [ ] Run the focused finance test and verify the assertion fails because the field/route behavior does not exist.
- [ ] Add `Wallet.withdrawable BigInt @default(0)` and `WithdrawalRequest.walletType WalletType @default(business)`; create an additive migration with the same defaults.
- [ ] Run the focused test and Prisma generation to verify the schema contract is usable.

### Task 2: Preserve eligibility during wallet money movements

**Files:** `domain/wallet.ts`, payment/refund/excess-transfer call sites, focused domain tests.

- [ ] Write failing tests for: a new refund makes funds withdrawable; a topup does not; paying consumes non-withdrawable funds before withdrawable funds.
- [ ] Run them and verify they fail against the existing single personal balance.
- [ ] Extend the ledger posting helper with an eligibility delta for personal available movements, validate `0 <= withdrawable <= available`, and apply it to new refund/excess-transfer producers and personal payment producers.
- [ ] Re-run the focused tests and confirm the balance/eligibility invariants pass.

### Task 3: Generalize withdrawal lifecycle and player API

**Files:** `domain/withdrawal.ts`, `routes/financeOperations.ts`, client API types, domain/HTTP tests.

- [ ] Write failing tests for player create, cancellation, Admin payout, and rejection of a personal request, including `available`, `withdrawable`, and `reserved` values.
- [ ] Run focused tests and verify they fail because only provider routes/business wallet selection exist.
- [ ] Add personal list/create/cancel endpoints guarded by `player`; parameterize domain withdrawal selection by `personal|business`; use the request wallet type for reverse and payout; keep active requests separate by wallet type.
- [ ] Re-run focused domain and HTTP tests and verify only request owners and Admin can act.

### Task 4: Implement the approved wallet UI

**Files:** `ProfilePage.tsx`, dedicated withdrawal UI component if needed, `financeApi.ts`, component test.

- [ ] Write a failing UI test that finds total and withdrawable amounts, both red warning lines, and action rows whose buttons share a parent flex row.
- [ ] Run the focused component test and verify it fails on the current topup-only wallet page.
- [ ] Add personal withdrawal history/modal states and API refresh; use existing `Button`, `Modal`, `SurfaceCard`, token classes, and desktop flex action row with mobile fallback.
- [ ] Re-run the component test and verify the approved layout and calls pass.

### Task 5: Verify integration boundaries

**Files:** affected tests and product finance spec/decision log.

- [ ] Update authoritative finance rules and acceptance evidence for personal withdrawal policy and migration boundary without overwriting D51 changes.
- [ ] Run focused finance tests, web component test, typecheck for affected workspaces, and `git diff --check`.
- [ ] Report tests run, any unverified browser interaction, and unrelated dirty paths left intact.
