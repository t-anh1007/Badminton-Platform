# Post-payment Match Skill Setup Implementation Plan

> **For Codex:** Execute this plan directly and keep validation focused on the changed flow.

**Goal:** Require the organizer to choose a match skill range after paying the deposit, before the match is discoverable.

**Architecture:** Matchmaking owns a nullable configuration timestamp, authorization, idempotent setup, and discovery filtering. The web app owns the mandatory setup modal and post-payment URL/recovery behavior.

**Tech Stack:** Prisma/PostgreSQL, Fastify, React/Vite, Vitest.

---

### Task 1: Persist and enforce the setup gate

- Add `skillConfiguredAt` and a backfill migration.
- Exclude unconfigured matches from public/AI discovery and direct joins.
- Add organizer-only, paid/open, idempotent `PATCH /matches/:matchId/skill-range`.
- Add focused service tests for visibility, authorization, ordering, and retries.

### Task 2: Add the mandatory setup interaction

- Redirect successful deposits to `/matches?created=<id>&setup=1`.
- Add the API client method and mandatory tier-range modal on `MatchListPage`.
- Recover configured setup URLs, preserve form state on errors, refresh/highlight on success.
- Add focused component/page tests.

### Task 3: Focused verification

- Generate the matchmaking Prisma client and apply the local migration if required by tests.
- Run only the targeted matchmaking and web tests once.
- Perform a read-only impact/status scan; do not run broad build/typecheck unless separately approved.
