# Business codes implementation plan

Date: 2026-09-22
Status: Completed — implementation and local executable validation finished.

## Outcome and authority

The user approved adding separate business codes wherever people need to identify
records in the UI, including Admin bank reconciliation. The existing UUIDs,
authorization, payment matching codes, bank references, OTPs and tokens stay intact.
Execute in this task without sub-agents (explicit user instruction).

## Design

Persist `businessCode` separately from UUID. PostgreSQL allocates one sequence per
entity, with a unique, non-null code: prefix + hyphen + eight digits. No date,
status, role or mutable name is encoded. Sequences are concurrency safe and can
have gaps; they are never reset during normal operation. Codes are not secrets
and never grant access. Existing UUID routes and ownership checks remain in use.

| Service | Entity | Prefix |
| --- | --- | --- |
| account | User | ND |
| venue-booking | Provider / Venue / Court / Booking | NCC / CS / SAN / BK |
| matchmaking | Match | KEO |
| community | Post / Comment / Report / Ticket | BV / BL / BC / HT |
| finance | SepayEvent / Dispute | GD / KN |

Existing payment `matchCode`, withdrawal `transferCode`, external bank references,
ledger entries, wallet IDs and security tokens do not change. A bank event gets
an additional GD display reference; its SePay reference remains separately labelled.
Codes are returned by owning services. Finance resolves booking display codes
through a bounded internal Venue API, not cross-schema database queries.

## Tasks

- [x] Add five additive Prisma migrations and model fields. Backfill old records
  in the migration using the same sequence as future inserts; preserve every ID.
- [x] Propagate codes through explicit DTOs and extend existing booking/account
  search predicates. Preserve public-profile privacy and API authorization.
- [x] Replace UUID display and UUID slicing; show codes on relevant list/detail
  screens (account/provider/venue/court/booking/match/support/moderation/dispute/bank).
- [x] Add focused API/UI assertions for generated formats, booking-code search,
  the protected cross-service reference lookup and display behavior. Migration
  deployment and broader affected suites were exercised against the local database.
- [x] Perform read-only impact review and whitespace check. Ask before executable
  build/typecheck/tests per the user's persistent validation preference.

## Validation and rollout

All five additive migrations were deployed to the local PostgreSQL schemas and
`prisma migrate status` reports every schema up to date. Community also applied its
previously pending `20260912173000_ticket_evidence_images` migration. Prisma clients
were generated into `ai-notes` and synchronized without replacing the Windows engine
DLL held by running development processes.

Validation passed on 2026-09-22:

- Service typecheck: account, venue-booking, matchmaking, community and finance.
- Production build: web and all five affected services.
- Tests: Account 4, Venue 19, Matchmaking 41, Community 25 (1 skipped), Finance 14,
  and Web 151 — 254 passed in total.
- `git diff --check` passed with line-ending warnings only.

Production still requires running the five migrations before deploying application
code that selects `businessCode`. Do not reset any sequence.

## Risks and recovery

ADD COLUMN with a sequence default backfills and locks each affected table; schedule
production migrations with that in mind. Eight digits allow 99,999,999 records per
type; explicit sequence bounds stop allocation rather than truncate/reuse a code.
Legacy frontend payloads may omit codes during rollout: display an unavailable
label, never invent a code from UUID. If Venue cannot resolve a code, finance reads
remain available with a labelled missing reference; financial amounts are unaffected.
Rollback application code before considering schema rollback; keeping added columns
is safe and preserves already-issued codes. Never drop/recreate sequences to roll back.

## Result

Implementation and local validation are complete. The first parallel Account test run
hit its existing five-second bcrypt timeout; rerunning that file alone with a 15-second
timeout passed all four tests. No financial matching or security identifier changed.
Preserve unrelated working-tree edits.
