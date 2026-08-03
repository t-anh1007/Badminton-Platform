---
paths:
  - ".agents/agents/**"
  - ".agents/skills/review/**"
---

# Review Finding Format

> Structure cho tất cả agent review outputs. `/review` skill parse format này để aggregate findings across agents.

## Severity levels

| Severity | Meaning | Effect on doc status |
|----------|---------|----------------------|
| `BLOCKING` | Must fix trước approve. Doc không proceed được. | Status → `revisions` |
| `WARNING` | Should fix. Approval khả thi với explicit ack. | Status stays `in-review`, ack note |
| `SUGGESTION` | Nice-to-have. Approval not blocked. | Status unchanged |

## Verdict semantics

| Verdict | When |
|---------|------|
| `approve` | Zero BLOCKING + zero WARNING (hoặc tất cả WARNING explicitly acknowledged) |
| `revise` | ≥1 WARNING, no BLOCKING |
| `block` | ≥1 BLOCKING |

## Finding anatomy

Mỗi finding có:

- **Title** — 5-10 word descriptor
- **Description** — what's wrong, why matters (1-3 sentences)
- **Location** — section reference nếu specific (`Mục 4 Pre-conditions`, `screens/login.md Mục 2.3`)
- **Suggested fix** — concrete next action (1-2 sentences)

## Aggregation rules (used by /review skill)

Khi multiple agents review cùng 1 doc:

1. **Deduplicate** — same finding từ different agents counts once. Keep most detailed version.
2. **Severity escalation** — 2+ agents flag same issue at WARNING → promote BLOCKING (consensus signals real problem).
3. **Severity ceiling** — final verdict = highest severity from any agent.
4. **Conflict** — Agent A approve, Agent B block → surface as conflict, user decides; không auto-resolve.

## Example output (1 agent)

```markdown
## Review by senior-ba

**Verdict:** revise

**Summary:** Spec solid overall nhưng thiếu rate-limiting consideration và 1 ambiguous actor responsibility.

### [BLOCKING]
- **Missing actor: rate limiter**: Mục 2 lists User, Backend, DB nhưng FR-payment-001 says "limit 10 attempts/hour" — ai enforce? Suggested fix: Thêm Rate Limiter là system actor trong Mục 2 hoặc clarify Mục 6 rằng Backend handles.

### [WARNING]
- **Ambiguous error E-payment-002**: Description nói "user gets error" nhưng không specify screen nào show. Suggested fix: Link error tới specific screen state trong Mục 5 Error Matrix.

### [SUGGESTION]
- **Open question stale**: OQ-2 added 2 tuần trước, chưa update. Suggested fix: ping owner hoặc escalate.
```

## Output location

`/review` skill aggregate findings, present user, apply accepted fixes. Sự kiện review ghi vào `docs/_shared/activity.log` bằng `activity-log.mjs`:

```
2026-05-12 | /review | @hoangpm | docs/payment/srs/payment-spec.md | reviewed by @senior-ba, @qa-reviewer: 1 blocking applied, 2 warnings ack
```

## Tools agent CAN'T use directly

Agents read target doc + reference rules/templates. Agents KHÔNG:

- Edit files (orchestrator `/review` skill làm, sau khi user accept findings).
- Spawn other agents (tránh recursive loops).
- Run bash commands cho system state (rely on context).

Giữ agents fast + deterministic.

## Extensions (Phase 6 agents)

`@change-tracker` thêm 2 sections optional:

```markdown
### Impacted artifacts
| Path | Impact type | Severity | Recommended action |

### Non-impacted artifacts (extension)
- {path}: {why not impacted}

### Apply order (extension)
1. {first doc/action}
2. {second doc/action}
```

`/cr` analyze phase parses cả 3 sections (severity findings + impacted artifacts + apply order) để build impact report.
