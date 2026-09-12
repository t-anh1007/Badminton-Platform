---
type: design-spec
status: approved
approved: 2026-09-12
---

# Footer information pages

## Goal

Turn the five COURTIN footer labels into public, readable information pages.

## Scope

- Routes: `/about`, `/contact`, `/terms`, `/cancellation-policy`, and `/privacy`.
- One reusable page component renders each route from a typed content map.
- Each page has a clear title, short lead, sectioned Vietnamese copy, and a CTA back to court discovery.
- Footer links use those exact routes. Pages remain public and use `AppLayout`.

## Constraints

- Reuse existing COURTIN layout, `PageHeader`, `SurfaceCard`, `Button`, and Tailwind tokens.
- No network/API/data persistence changes.
- No legal claim beyond product behaviour already documented: cancellation copy states the 24-hour / 6-hour refund tiers and tells users the booking snapshot is authoritative.
- Do not run tests or build for this requested fast UI delivery.
