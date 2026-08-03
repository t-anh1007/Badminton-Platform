---
paths:
  - ".agents/agents/**"
---

# Agent Conventions

> Patterns cho review agents trong vault. Mọi agent ở `.agents/agents/<name>.md` tuân rules này.

## Agent file structure

```yaml
---
name: senior-ba
description: 1-line summary of agent's expertise và when to use
expertise: [completeness, edge-cases, requirement-clarity]
review_targets: [srs, urd, brd, prd, srs-flows, srs-screen, brainstorm, user-story, use-case]
output_format: structured-findings-v1
---

# {Persona name}

> {Persona definition: 1 paragraph establishing voice, experience, perspective.}

## Review approach

{Bullet list HOW agent reviews — scan first, mid, last.}

## Severity rubric

{Definitions BLOCKING / WARNING / SUGGESTION specific to this agent's domain.}

## Common findings

{Typical issues agent flags — checklist style.}

## What NOT to flag

{Out-of-scope domains; explicit để prevent overlap với other agents.}

## Output format

Follow [review-format.md](./review-format.md) v1 strictly.

## Reference materials

When reviewing, agent reads:
- Target doc (provided by orchestrator)
- @.agents/rules/{relevant-rule}.md
- @docs/{feature}/... (runtime resolved by /review skill — placeholder `{feature}` thay bằng target's frontmatter feature value)
```

## Roles + review_targets

| Role | `name` | Phase | Domain |
|------|--------|-------|--------|
| Senior BA | `senior-ba` | 4 | Completeness, edge cases, requirement clarity |
| Product Owner | `po-reviewer` | 4 | Business value, scope creep, prioritization |
| Product Manager | `pm-reviewer` | 4 | Cross-feature consistency, dependencies, timeline |
| UI/UX | `uxui-reviewer` | 4 | Screen flows, states (loading/empty/error), consistency |
| QA | `qa-reviewer` | 4 | AC testability, missing test cases, coverage |
| Tech | `tech-reviewer` | 4 | Feasibility, performance, security implications |
| Change Tracker | `change-tracker` | 6 | Impact analysis cho /cr |
| Gap Analyst | `gap-analyst` | 6 | Traceability, orphaned reqs, stale chain |

## Path conventions (placeholder resolution)

Agent reference materials dùng path placeholder `{feature}` — resolved bởi `/review` skill khi spawn agent:

- `@docs/{feature}/{feature}-urd.md` → resolves to target doc's `feature` frontmatter value.
- `@docs/_shared/...` → no resolution, project-level shared.

Agent KHÔNG được hardcode feature slug (vd `@docs/payment/payment-urd.md`) — luôn dùng placeholder.

Nếu target không có `feature:` frontmatter, `/review` skip reference đó hoặc prompt user pick feature context.

## Guidelines

- **One agent = one persona.** Đừng merge senior-ba + qa — different thinking.
- **Agents critique, không write content.** Không propose new sections; chỉ propose edits to specific lines.
- **Stay in-scope.** Senior BA không flag tech feasibility — đó là tech-reviewer's job.
- **No double-counting.** Nếu BLOCKING tồn tại, không repeat WARNING. Pick severity cao nhất.
- **Findings atomic.** Mỗi finding 1 thing, 1 suggested fix. Compound findings split.
- **Agent KHÔNG dùng directly Edit tool.** `/review` orchestrator áp dụng fixes user accept.
- **Stale chain awareness** (Phase 6+): agents nên check `status: stale` của target và `docs/_shared/staleness.log` để flag cascade.
