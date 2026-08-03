---
paths:
  - "docs/**/*.md"
  - ".agents/scripts/**"
---

# Status Lifecycle

## Doc statuses

```
draft → in-review → revisions → approved → shipped
                       ↑           ↓
                       └───────────┘
```

| Status | Meaning |
|--------|---------|
| `draft` | Initial creation, work in progress, not yet shared |
| `in-review` | Sent for review (stakeholders or `@reviewer-agents`) |
| `revisions` | Reviewer flagged issues, doc needs rework |
| `approved` | Reviewer accepted, frozen for development |
| `shipped` | Feature delivered to production |

Loops:
- `in-review → revisions → in-review` is a normal review cycle
- After enough cycles, `revisions → approved`

## Transitions trigger automation

| Transition | Action |
|------------|--------|
| `* → in-review` | (future) Notify reviewer agent specified in frontmatter `reviewers:` |
| `* → approved` | Regenerate `docs/feature-list.md` bằng workflow dashboard tương ứng nếu project có cài |
| `* → shipped` | (future) Trigger `@gap-analyst` for cross-doc consistency check |

## Other doc types

### Meeting
```
captured → processed
```
- `captured` = raw notes
- `processed` = decisions/blockers/action items structured into tables within the meeting note itself (no separate files — see `feedback_meet_consolidated`)

## Frontmatter format

```yaml
---
status: draft               # required
status_reason: "Awaiting input from client on payment provider"   # optional, free text
status_changed: 2026-05-09  # optional, set by skill on transition
---
```
