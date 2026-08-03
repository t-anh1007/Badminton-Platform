# Khoaluantn — Badminton Platform

**Project Goal:** Build a marketplace connecting court owners, players, and badminton communities

## 🎯 Quick Start

1. **Read the orchestration model:** `.claude/CLAUDE.md`
2. **Check current progress:** `src/integration/progress.json`
3. **Review project scope:** `DISCOVERY_PROMPT.md` & `REPORT_SPEC.md`

## 🏗️ Architecture: Claude + Codex

```
Claude Code (Orchestrator)
    ↓ defines tasks with clear criteria
Codex (Worker)
    ↓ executes, returns results
Claude Code (Verify & loop)
```

## 📁 Key Directories

| Directory | Purpose | Owner |
|-----------|---------|-------|
| `.claude/` | Orchestration rules | Claude Code |
| `src/` | Shared code & orchestration logic | Claude Code |
| `skills/` | Discovery, design, planning skills | Claude Code |
| `workers/` | Code generation, review, docs, tests | Codex |
| `docs/` | Architecture & guides | Claude Code |
| `outputs/` | Generated code & reports | Codex |

## 🚀 Current Phase

**Phase 1: Discovery** — Understanding requirements, scope, unknowns

- [ ] Validate business requirements
- [ ] Identify domain models
- [ ] Define scope for Phase 1, 2, 3
- [ ] Identify risks & assumptions

## 📋 Key Documents

| Document | Purpose |
|----------|---------|
| `DISCOVERY_PROMPT.md` | Discovery methodology & goals |
| `REPORT_SPEC.md` | Report specification for deliverables |
| `Bao_cao_khao_sat_Pengo.docx` | Market research: Pengo app |
| `Bao_cao_khao_sat_GiaoLuuCauLong_so_sanh_Pengo.docx` | Market research: Competitors |
| `.claude/CLAUDE.md` | Orchestration rules & workflows |

## 🤖 Working with Claude Code + Codex

### When Claude acts as Orchestrator:
- Define clear requirements
- Decompose into atomic tasks
- Set success criteria
- Review Codex output
- Make technical decisions

### When Codex acts as Worker:
- Execute tasks exactly as specified
- Write minimal, focused code
- Follow acceptance criteria
- Report what was done
- Await Claude review

## ⚡ Core Principles (Andrej Karpathy)

1. **Think Before Coding** — State assumptions, surface unknowns
2. **Simplicity First** — Minimal code, solve only what's asked
3. **Surgical Changes** — Edit only necessary, preserve style
4. **Goal-Driven** — Define success criteria, loop until met

## 📞 Commands

```bash
# View orchestration rules
cat .claude/CLAUDE.md

# Check progress
cat src/integration/progress.json

# View current tasks
cat src/orchestrator/tasks.json

# Review discoveries & reports
cat DISCOVERY_PROMPT.md
cat REPORT_SPEC.md
```

## 📊 Project Status

**Current Phase:** 🟡 Discovery  
**Last Updated:** 2026-08-03  
**Orchestrator:** Claude Code  
**Workers:** code-generator, code-reviewer, documentation-writer, test-engineer

---

**Next Steps:** Review `.claude/CLAUDE.md` to understand the orchestration model, then start Phase 1 discovery work.
