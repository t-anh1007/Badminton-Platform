# Financial Transparency Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give providers and administrators business-readable, end-to-end visibility from real payment movement through internal allocation, release, withdrawal, and reconciliation without exposing unnecessary PII or internal architecture.

**Architecture:** Add read-only finance projection functions over existing append-only finance records; do not change ledger, settlement, refund, withdrawal, or reconciliation mutations. Expose provider-scoped revenue traces and an admin-wide overview, then render distinct provider/admin interfaces using current COURTIN tokens and components.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, React/Vite, Tailwind CSS, Vitest/Testing Library.

**Spec:** This plan implements the PO-approved `ai-notes/.superpowers/brainstorm/682-1789804180/content/financial-explorer-v2.html` direction and the constraints recorded below.

## Global Constraints

- Provider pages use business language only and never expose wallet IDs, ledger IDs, raw database identifiers, or technical trace panels.
- Admin pages also default to business language; technical identifiers, when useful, stay behind a collapsed optional section.
- Every transaction list uses server-side pagination with COURTIN's existing `items / total / page / pageSize` response shape and shared `Pagination` component; filters remain active when changing pages.
- Money amount, source, destination, lifecycle status, and reconciliation outcome remain visible; bank-account numbers are masked by default.
- Only display sender-bank/account fields that the payment provider actually supplied; never infer missing data.
- Existing append-only ledger and all finance mutation behavior remain unchanged.
- No cross-schema foreign keys or direct cross-service database queries.

## Status

Completed

## Scope

In scope:

- Provider revenue buckets and per-booking breakdown.
- Business-readable payment-to-payout timeline using existing PaymentIntent, SePayEvent, BookingRevenue, WithdrawalRequest, allocation, and ledger evidence.
- Admin platform overview, bank-versus-allocation reconciliation, and highlighted exception states.
- Focused backend/UI regression tests and impact review of existing finance flows.

Out of scope:

- New payment providers, chargeback processing, accounting exports, or changes to money movement.
- Persisting sender account details that SePay does not currently provide to the domain model.
- Revealing unmasked bank-account numbers in this delivery.

## File Structure

- Create `services/finance-service/src/domain/financialTransparency.ts`: read-only projections and masking helpers.
- Modify `services/finance-service/src/routes/financeOperations.ts`: provider/admin read endpoints.
- Modify `services/finance-service/test/g6Http.test.ts`: authorization and response-contract coverage.
- Modify `apps/web/src/lib/financeApi.ts`: projection types and API functions.
- Create `apps/web/src/pages/manage/FinanceRevenueExplorer.tsx`: provider bucket/table/detail UI.
- Modify `apps/web/src/pages/manage/ManageFinancePage.tsx`: load and compose provider explorer.
- Create `apps/web/src/components/FinanceTraceDrawer.tsx`: shared business-readable trace; optional admin-only details.
- Create `apps/web/src/components/FinancePlatformOverview.tsx`: admin system-wide overview and reconciliation display.
- Modify `apps/web/src/pages/admin/AdminFinancePage.tsx`: distinct admin overview plus existing operational queues.
- Create `apps/web/src/pages/financeTransparency.test.tsx`: role language, privacy, colors, drill-down, and admin overview coverage.

## Tasks

### Task 1: Read-only finance projections

**Interfaces:**

- Produces `listProviderFinancialTransparency(userId, filters)` and `getAdminFinancialTransparency(filters)` with `page` and `pageSize` inputs.
- Produces serialized money strings, masked bank accounts, human-readable statuses, and optional provider-supplied transaction references.

- [x] Add domain/HTTP tests proving provider scope isolation, admin aggregation, masked bank data, booking breakdown, reconciliation difference, and server-side pagination metadata.
- [x] Implement projections only from existing finance tables; return `null`/business fallback when sender-bank data is unavailable.
- [x] Add `GET /providers/me/financial-transparency` and `GET /admin/financial-transparency` with existing role guards.
- [x] Run finance focused tests and confirm all existing mutation suites remain unchanged.

### Task 2: Provider Financial Explorer

**Interfaces:**

- Consumes `getMyFinancialTransparency(filters)`.
- Produces bucket cards, per-booking rows, and `FinanceTraceDrawer` in provider mode.

- [x] Add UI tests that provider copy contains no technical terms/IDs and bank accounts are masked.
- [x] Implement bucket cards and booking breakdown using current COURTIN navy/yellow/surface tokens.
- [x] Render the shared COURTIN `Pagination` component and preserve venue/date/status filters while changing page.
- [x] Add restrained semantic text colors for incoming money, pending/review states, outgoing money, and exceptions.
- [x] Implement the business timeline from payment through availability, plus a separate truthful withdrawal-to-bank history.
- [x] Run focused web tests.

### Task 3: Admin Platform Financial Overview

**Interfaces:**

- Consumes `getAdminFinancialTransparency()`.
- Reuses `FinanceTraceDrawer` in admin mode while keeping optional details collapsed.

- [x] Add UI tests for expected/actual/difference, platform buckets, unmatched transactions, and role-specific language.
- [x] Implement a genuinely distinct admin overview above the existing withdrawal/reconciliation queues.
- [x] Paginate the admin transaction view on the server and render the shared COURTIN `Pagination` component without changing the existing operational queue pagination.
- [x] Preserve all current operational actions and filtering in `FinanceAdminPanel`.
- [x] Run focused web tests.

### Task 4: Impact and regression review

- [x] Run finance-service tests covering revenue, withdrawal, reconciliation, refunds, disputes, webhook ingestion, and match funding; the broad run passed 91 tests before `g4Saga` hit the running backend on port 3002, then `g4Saga` passed 16/16 on isolated test ports 3102/3103.
- [x] Run web finance tests, workspace typecheck, and production build.
- [x] Review the diff for changes to authorization, mutation paths, amount arithmetic, wallet balances, payout lifecycle, and realtime refresh.
- [x] Record passed evidence and limitations in this plan.

## Risks And Recovery

- Existing records may not contain sender-bank metadata. Render “Ngân hàng không cung cấp” instead of inventing it.
- Aggregation queries may become expensive. Keep the first delivery bounded to existing filtered datasets and review query shapes before widening.
- UI regressions could hide existing withdrawal/reconciliation actions. Keep those components intact and add the overview above them.
- Recovery: revert only the new read endpoints/projection components; no schema migration or financial mutation rollback is required.

## Decisions

- 2026-09-19: PO approved distinct provider/admin views and business-only language.
- 2026-09-19: Full money transparency does not mean exposing PII or internal architecture.
- 2026-09-19: Use only provider-supplied bank facts; masked display is the default.

## Validation

- Focused proof: finance HTTP/domain tests and finance UI Testing Library tests.
- Integration proof: existing webhook, revenue, withdrawal, reconciliation, refund, dispute, and match-fee suites.
- Repository-required checks: workspace typecheck and build.

## Result

Implemented read-only provider/admin finance projections and distinct COURTIN interfaces. Provider booking, provider withdrawal, and admin bank-event lists use server pagination and the shared `Pagination` control. No schema or financial mutation path changed.

Validation: finance focused 13/13 passed; finance broad passed 91 tests before the environment-only port conflict, and the previously blocked saga passed 16/16 on isolated ports; web focused 18/18 and full web 139/139 passed; monorepo typecheck and production build passed. Vite retained its pre-existing large-chunk warning.
