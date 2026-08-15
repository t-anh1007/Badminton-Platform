---
title: Backend-to-UI capability matrix
status: active
updated: 2026-08-14
---

# Backend-to-UI capability matrix

The machine-readable source is `scripts/backend-ui-capabilities.json`. Each HTTP
route discovered under `services/*/src/routes/` requires a `surfaceId` and an
`evidenceId`; the coverage command rejects an omitted or stale source row.

| Access | Surface owner | Planned evidence |
|---|---|---|
| Public/player | Player shell and player pages | Tasks 3–18 focused web tests and browser Steps 2, 5 |
| Provider | `/manage/*` | Tasks 7–9 focused tests and browser Step 3 |
| Admin | `/admin/*` | Tasks 10–11 focused tests and browser Step 4 |
| Ops/internal/webhook | Owning aggregate observable state | Tasks 5–18 focused tests and browser acceptance |

`planned` is permitted only with the explicit `--allow-planned` command-line
flag while this active implementation plan remains incomplete.
