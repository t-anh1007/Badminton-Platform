---
title: Figma full-screen coverage
status: active
owner: Codex
target_file: FHuhhmlhPSl8gOUuUx7az2
---

# Figma full-screen coverage

## Authority and boundary

- Functional scope: current product specifications under `docs/product/specs/` and `docs/product/phasing.md`.
- Visual authority: the existing Figma file only. Do not apply the repository's historical design-system tokens, layout, or theme.
- Authority record: [`docs/design/courtin-figma-authority.md`](../../design/courtin-figma-authority.md) records the direct Figma extraction used by this plan.
- Preserve existing Figma content. New frames are additive and must use the visual language established by the current screens.
- PO approval (2026-08-13): while Figma AI credits are unavailable, create frames through the Figma Plugin API by adapting existing Figma frames. Reuse their visual treatment, but vary information architecture by task so screens do not become repetitive.
- PO update (2026-08-13): current mockups are not complete enough to begin code integration. Full route/role/workflow coverage below is a hard gate for `figma-to-code-implementation.md`.

## Delivery sequence

1. Audit route, role, conditional rendering and workflow states from `apps/web`, then inspect the actual Figma file for components, variables, styles, typography and existing screen coverage.
2. Complete Code Connect → existing-screen instances → linked-library discovery before canvas mutation. If the file has no published components/variables, record that result and adapt the local COURTIN frames; do not import an unrelated community design system.
3. Build the missing F1–F5 batches below. Create the wrapper first and assemble each major section directly inside it; componentize repeated structures and return node IDs from every mutation.
4. After each frame, inspect metadata and screenshots for both the full frame and important sections; correct clipping, overlap, placeholder text, wrong font, blank image and layout sizing before proceeding.
5. Record name, node ID, desktop/mobile/state coverage and visual-review status. Leave this plan active until every required row is covered or has an explicit PO-approved exemption.

## Required generation batches

### F1 — Global, account and public discovery

- [x] Homepage — Mobile: `102:2`.
- [x] Login — Desktop `100:2` and Mobile `100:23`.
- [x] Register — Desktop `100:41` and Mobile `100:64`.
- [x] Verify Email — Desktop `100:84` and Mobile `100:103`.
- [x] Reset Password — Desktop `100:119` and Mobile `100:138`.
- [x] Venue Explorer List & Map — Desktop `102:22` and Mobile `102:59`; existing desktop `89:2` remains the source pattern.
- [x] Venue Detail — Desktop `102:86` and Mobile `102:104`.

### F2 — Player booking, profile and finance

- [x] Booking History — Mobile `105:2`; desktop `92:319` rechecked.
- [x] Booking Cancellation & Refund Detail — Desktop `105:25` and Mobile `105:41`.
- [x] Wallet & Transaction History — Mobile `105:56`; desktop `89:494` rechecked.
- [x] Booking Payment Confirmation — Mobile `105:76`; desktop `96:210` rechecked.
- [x] Player Dispute — Desktop `105:89` and Mobile `105:107`.
- [x] Profile Account Settings — Desktop `105:124` and Mobile `105:143`.

### F3 — Match, community, support and AI

- [x] Create Match — Mobile `107:2`; desktop source `92:2` retained.
- [x] Host Participant Approval (MMP-05/F-02) — Desktop `113:2` and Mobile `113:19`.
- [x] Post-match Fair Review (MMP-10/F-07) — Desktop `113:37` and Mobile `113:55`.
- [x] Player Passport Owner — Mobile `107:18`; desktop source `90:2` retained.
- [x] Player Passport Public — Mobile `107:34`; desktop source `90:184` retained.
- [x] Player Passport Cold Start — Mobile `107:50`; desktop source `90:267` retained.
- [x] Community Post Detail & Comments — Desktop `107:66` and Mobile `107:81`.
- [x] Support Center & Ticket Detail — Player `107:97`/`107:112`, Admin `107:128`/`107:143` (desktop/mobile).
- [x] AI Match Assistant — Mobile `107:159`; desktop source `92:109` retained.
- [x] Shared state board `107:175` covering loading, empty, error and auth-required.

Existing match list/detail mobile frames and the Passport owner/public/cold-start frames must be rechecked but not duplicated.

### F4 — Provider operations

- [x] Provider Application & Approval Status: `108:2`/`108:19`.
- [x] Provider Dashboard & Venue List: `108:37`/`108:54`.
- [x] Venue Profile Editor: `108:72`/`108:89`.
- [x] Court Management: `108:107`/`108:124`.
- [x] Operating Hours & Closed Dates: `108:142`/`108:159`.
- [x] Scheduled Pricing: `108:177`/`108:194`.
- [x] Booking Rules: `108:212`/`108:229`.
- [x] Provider Live Schedule — Mobile `108:352`; desktop authority `89:250` retained.
- [x] Unified Calendar & Walk-in Booking: `108:247`/`108:264`.
- [x] Provider Booking Incident & Change Court: `108:282`/`108:299`.
- [x] Provider Revenue & Payouts — Mobile `108:370`; desktop authority `96:2` retained.
- [x] Provider Withdrawal Request & Detail: `108:317`/`108:334`.

### F5 — Admin operations

- [x] Account Access Lock & Restore: `108:388`/`108:405`.
- [x] Provider Approval: `108:423`/`108:440`.
- [x] Admin Booking Cancellation: `108:458`/`108:475`.
- [x] Withdrawal Operations: `108:493`/`108:510`.
- [x] Dispute Resolution: `108:528`/`108:545`.
- [x] Finance Reconciliation — Mobile `108:563`; desktop authority `96:106` retained.

Admin moderation desktop `6:282` and mobile `6:471` already exist and must be rechecked, not duplicated.

### F6 — Conditional Phase 3

- [ ] Demand Heatmap — Desktop and Mobile only if the PO activates conditional `F-05` after seed readiness is confirmed.

F6 does not block F1–F5 while `F-05` remains postponed. If activated, F6 becomes a gate before implementing the heatmap code.

## Coverage rules

- A route can reuse a responsive pattern only when its information hierarchy, role and primary action are the same. Shared colors or card style alone do not count as coverage.
- Modal, tab and workflow-state frames do not require new application routes, but still require a mockup when they materially change content hierarchy or primary action.
- State combinations with the same layout may share a state board. Role/state changes that expose different data or actions require their own frame/variant.
- Approved product functions remain in coverage even when the current frontend has no route/component. Record them as missing code surfaces rather than silently classifying them backend-only.
- Every completed row records the final node ID next to the checkbox and adds screenshot evidence to Progress evidence.
- Code integration cannot begin until every checkbox is complete or its exemption is explicitly approved by the PO.

## Progress evidence

- 2026-08-14, match-lifecycle gap batch complete and screenshot-checked: Host Participant Approval `113:2`/`113:19` and Post-match Fair Review `113:37`/`113:55`. The frames were cloned from existing COURTIN approval/form patterns and adapted to MMP-05/F-02 and MMP-10/F-07; Archivo/Inter font-family validation passed and no text node exceeded its frame bounds.
- 2026-08-13, F1 complete and direct-checked: Homepage Mobile `102:2`; Login `100:2`/`100:23`; Register `100:41`/`100:64`; Verify Email `100:84`/`100:103`; Reset Password `100:119`/`100:138`; Venue Explorer `102:22`/`102:59`; Venue Detail `102:86`/`102:104`. Metadata and screenshots were retrieved for every frame. The Login Mobile screenshot exposed title/description overlap; it was corrected in-place and re-screenshoted (`100:23`) before recording coverage.
- 2026-08-13, F2 complete and direct-checked: Booking History Mobile `105:2`; cancellation/refund `105:25`/`105:41`; Wallet Mobile `105:56`; Payment Confirmation Mobile `105:76`; Player Dispute `105:89`/`105:107`; Account Settings `105:124`/`105:143`. Metadata and screenshots were retrieved for all nine new frames; existing desktop sources `92:319`, `89:494`, `96:210` were rechecked by metadata and screenshot.
- 2026-08-13, F3 complete: new node IDs are recorded on every F3 row. Metadata and screenshot requests succeeded for all 12 generated frames; the existing desktop sources remain the corresponding COURTIN authority patterns.
- 2026-08-13, F4/F5 complete: metadata and screenshot requests succeeded for all 33 generated provider/admin frames; node IDs are recorded on their coverage rows. Existing desktop COURTIN authority frames remain retained where indicated.
- 2026-08-13, coverage scope expanded by PO: existing frames are not considered complete project coverage. F1–F5 above are now required before code integration; all newly added rows are pending generation/review.
- 2026-08-13, batch 1 complete and visually checked: `Venue Explorer — Desktop` (`89:2`), `Provider Operations — Live Schedule` (`89:250`), and `Wallet & Transaction History — Desktop` (`89:494`).
- The frames are adapted from existing Figma templates rather than repository styles: search/list, schedule-grid, and operations-table patterns respectively.
- 2026-08-13, confirmed user-created Passport coverage: owner (`90:2`), public (`90:184`), and cold-start (`90:267`). No duplicate Passport frame was created.
- 2026-08-13, batch 2 complete: `Create Match — Fee Split` (`92:2`), `AI Match Assistant — Desktop` (`92:109`), and `My Bookings & Cancellations — Desktop` (`92:319`). The inherited moderation footer in the booking-history clone was removed after visual review.
- 2026-08-13, batch 3 complete and screenshot-checked: `Provider Revenue & Payouts — Desktop` (`96:2`), `Admin Finance Reconciliation — Desktop` (`96:106`), and `Booking Payment Confirmation — Desktop` (`96:210`).

## Acceptance evidence

- Each new screen is a named top-level frame in the Figma file, positioned clear of existing screens.
- Screens use the typography, colors, card treatment, controls, and responsive conventions discovered from the existing Figma file.
- No new functional scope, user roles, or policy is introduced beyond the approved specs.
- Each batch has metadata plus visual screenshot evidence.
- F1–F5 cover every current application route plus role/workflow surfaces with distinct information hierarchy.
- `figma-to-code-implementation.md` remains blocked at its Figma coverage gate until this plan is complete or the PO explicitly waives named rows.
