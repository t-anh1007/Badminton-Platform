# Execution Plan: Live UI freshness

Date: 2026-09-13

## Status

Active

## Outcome

An authenticated user sees the authoritative data for an action without manually
refreshing the browser. The same client updates immediately after its successful
mutation; recipients refresh when the existing notification SSE delivers the
result.

## Context

`apps/web` currently holds page data in local React state. Account notification
SSE and provider-finance SSE already exist; `docs/architecture/system-architecture.md`
limits Socket.IO to matchmaking, so this work extends the existing SSE-based
freshness path rather than adding a new WebSocket topology.

## Scope

In scope:

- A browser-side invalidation bus emitted after successful API mutations and
  notification SSE signals.
- Debounced, authoritative refetch on the affected mounted pages.
- Preserve finance's dedicated owner-scoped SSE and authoritative refetch rule.
- Release the change if the required production checks pass.

Out of scope:

- Client-side money delta calculation.
- Realtime support chat or a new cross-service event contract for domain actions
  that do not notify an affected user.

## Approach

1. Add a typed invalidation bus and use it in the existing API clients.
2. Keep the notification SSE connected while its page is visible and forward its
   signals to that bus.
3. Register data-bearing pages to debounce and refetch their authoritative API
   snapshot without remounting the route or discarding an active form.
4. Run narrow client proof and the release-required build before deployment.

## Risks And Recovery

- A broad route remount could erase a draft; avoid it and let pages opt into a
  refetch callback.
- Notification delivery is asynchronous through the existing outbox/RabbitMQ;
  reconnect and visibility refresh remain the recovery path.
- Roll back the frontend and account-service release commits if the new signal
  causes an unexpected refresh loop.

## Progress

- [x] Audited current notification and finance realtime paths.
- [x] Add client invalidation transport and source signals.
- [x] Register data pages for authoritative refetch.
- [x] Add QR-modal status polling for an Admin's external-bank handoff.
- [ ] Validate and release.

## Decisions

- 2026-09-13: Use SSE plus refetch, not browser-side state deltas or a global
  route reload, to preserve financial correctness and active form input.
- 2026-09-13: Poll only while the Admin withdrawal QR modal is open because the
  SePay webhook settles server-side without an Admin-targeted SSE event.

## Validation

- Focused proof: unit coverage for the invalidation transport and one consumer.
- Integration or end-to-end proof: authenticated browser freshness where local
  credentials are available.
- Repository-required checks: root build and affected workspace tests before
  production release.

## Result

Complete after implementation and production verification.
