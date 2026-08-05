# Khoaluantn: Claude Code + Codex Orchestration

## 🎯 Project Vision

**Nền tảng cầu lông** — Kết nối ba nhóm nhu cầu:
- 🏢 Doanh nghiệp/chủ sân: Quản lý sân, lịch trống, booking
- 👥 Người chơi: Tìm sân, đặt sân, quản lý lịch
- 🤝 Cộng đồng: Giao lưu, tìm kèo, lập nhóm, thảo luận

**Architecture**: Claude Code (Orchestrator) + Codex (Worker)

---

## 📋 Core Principles (Andrej Karpathy + Orchestration)

### 1. Think Before Coding ✓
**Claude's responsibility:**
- [ ] State assumptions explicitly before routing tasks
- [ ] Surface confusion and unknowns clearly
- [ ] Define success criteria before assigning to Codex
- [ ] Ask for clarification, don't guess

**Example:**
```
WRONG: "Build the booking system"
RIGHT: "Booking system: User flow is [A→B→C], 
        Success = [1,2,3], Assumptions: [X,Y], 
        Unknowns: [Q1,Q2]"
```

### 2. Simplicity First 🎯
**Apply to all generated code:**
- [ ] Solve ONLY what's asked, no speculative features
- [ ] Minimal code, maximum clarity
- [ ] No over-engineering, no premature abstraction
- [ ] Three similar lines > premature generic solution

**Codex gets explicit constraints:**
```json
{
  "scope": "User login only, not password reset",
  "out_of_scope": ["2FA", "OAuth", "social login"],
  "no_premature_optimization": true
}
```

### 3. Surgical Changes 🔧
**When modifying code:**
- [ ] Edit only necessary parts
- [ ] Preserve existing code style
- [ ] No formatting cleanup in unrelated sections
- [ ] Intentional & reversible

**Claude verifies:**
- What was changed?
- Why was it changed?
- What stayed the same?

### 4. Goal-Driven Execution 🚀
**Define before executing:**
- [ ] Verifiable success criteria (not "improve code quality")
- [ ] Clear pass/fail conditions
- [ ] Loop until criteria met
- [ ] Explicit when done

**Example:**
```
WRONG: "Improve the user service"
RIGHT: "User service: 
  - Criteria: [C1, C2, C3]
  - Test: [T1, T2, T3]
  - Pass when: All tests pass
  - Done: ✓ All criteria met"
```

---

## 🤖 Claude Code: Orchestrator Role

### Responsibilities
1. **Discovery & Analysis** → `skills/discovery/`
   - Understand business requirements
   - Identify risks & unknowns
   - Define scope clearly

2. **Task Decomposition** → `src/orchestrator/`
   - Break work into atomic tasks
   - Define clear success criteria
   - Assign to right Codex worker

3. **Quality Gate** → Review Codex output
   - Does it meet criteria?
   - Is it surgical (minimal change)?
   - Is it simple and focused?
   - Is it testable?

4. **Iteration Control**
   - Accept or reject Codex output
   - Provide feedback loop
   - Stop when criteria met

### Claude Skills
- `skills/discovery/` — Product discovery, requirement analysis
- `skills/brainstorm/` — Ideation, design thinking
- `skills/diagram/` — Architecture, flowcharts, visual design
- `skills/user-story/` — User story & acceptance criteria writing

---

## ⚙️ Codex: Worker Role

### Responsibilities
1. **Execute Tasks** from Claude
   - Follow constraints exactly
   - No scope expansion
   - Report what was done

2. **Write Code**
   - `workers/code-generator/` — Generate code per spec
   - Minimal, focused, testable
   - Follow project style

3. **Review & Quality**
   - `workers/code-reviewer/` — Review generated code
   - Check against criteria
   - Surface issues

4. **Documentation & Tests**
   - `workers/documentation-writer/` — Write docs, comments
   - `workers/test-engineer/` — Write & run tests

### Task Input Format (Claude → Codex)
```json
{
  "task_id": "task-001",
  "title": "User login flow",
  "description": "Implement user login API endpoint",
  "scope": "POST /auth/login with email + password",
  "constraints": [
    "No 2FA in this task",
    "Use JWT tokens",
    "Test with MockDB"
  ],
  "acceptance_criteria": [
    "Valid credentials return JWT",
    "Invalid credentials return 401",
    "Rate limiting prevents brute force"
  ],
  "success_test": ["test_valid_login", "test_invalid_login", "test_rate_limit"],
  "out_of_scope": ["password reset", "OAuth", "biometric"]
}
```

### Output Format (Codex → Claude)
```json
{
  "task_id": "task-001",
  "status": "completed",
  "what_was_done": [
    "Created auth/login.ts endpoint",
    "Added JWT token generation",
    "Added rate limiting"
  ],
  "changes": {
    "created": ["src/routes/auth/login.ts"],
    "modified": ["src/config/auth.config.ts"],
    "unchanged": ["all other files"]
  },
  "tests_passed": 3,
  "criteria_met": ["✓", "✓", "✓"],
  "issues": []
}
```

---

## 📁 Project Structure

```
Khoaluantn/
├── .claude/
│   └── CLAUDE.md (this file — orchestration logic)
│
├── src/
│   ├── orchestrator/     (Claude decision logic)
│   ├── shared/           (Types, utils, config)
│   └── integration/       (Claude ↔ Codex communication)
│
├── skills/
│   ├── discovery/        (Product discovery)
│   ├── brainstorm/       (Brainstorming & ideation)
│   ├── diagram/          (Architecture & diagrams)
│   └── user-story/       (User stories & AC)
│
├── workers/
│   ├── code-generator/   (Code generation)
│   ├── code-reviewer/    (Code review)
│   ├── documentation-writer/
│   └── test-engineer/    (Testing)
│
├── templates/
│   ├── task-templates/   (Task definition templates)
│   └── output-templates/ (Output structure templates)
│
├── docs/
│   ├── architecture/     (System design docs)
│   └── guides/           (How-to guides)
│
├── outputs/
│   ├── generated-code/   (Codex output: code)
│   └── reports/          (Codex output: reports & docs)
│
└── legacy/               (Old structure, if needed)
```

---

## 🔄 Workflow: Claude + Codex

### Phase 1: Discovery (Claude)
```
1. Analyze business requirement
2. State assumptions & unknowns explicitly
3. Define scope & out-of-scope
4. Identify risks & constraints
→ Output: Discovery document with clear scope
```

### Phase 2: Planning (Claude)
```
1. Brainstorm solutions
2. Design architecture/flows
3. Decompose into atomic tasks
4. Define success criteria for each task
→ Output: Task list with clear criteria
```

### Phase 3: Execution (Codex)
```
For each task from Claude:
1. Read task definition carefully
2. Implement minimal solution (no more)
3. Verify success criteria locally
4. Report: what was done, what's changed
→ Output: Code + test results
```

### Phase 4: Verification (Claude)
```
1. Review Codex output against criteria
2. Check for scope creep or over-engineering
3. Verify surgical changes (minimal diff)
4. Accept or provide feedback
→ Loop to Phase 3 or move to next task
```

---

## ⚡ Quick Reference: When to use Claude vs Codex

| Task | Claude | Codex |
|------|--------|-------|
| Understand requirements | ✓ | |
| Design architecture | ✓ | |
| Write user stories | ✓ | |
| Brainstorm solutions | ✓ | |
| Write code | | ✓ |
| Generate documentation | | ✓ |
| Run tests | | ✓ |
| Review code quality | ✓ | |
| Make technical decisions | ✓ | |
| Execute against spec | | ✓ |

---

## 🚫 Anti-Patterns to Avoid

### Claude Anti-Patterns ❌
- [ ] Assuming instead of asking
- [ ] Vague task descriptions ("make it better")
- [ ] Changing scope mid-way
- [ ] Accepting scope creep from Codex
- [ ] Not defining success criteria

### Codex Anti-Patterns ❌
- [ ] Expanding scope beyond task
- [ ] Over-engineering solutions
- [ ] Not following style/conventions
- [ ] Incomplete test coverage
- [ ] Not reporting what changed

---

## 📊 Progress Tracking

Track in `src/integration/progress.json`:
```json
{
  "current_phase": "planning",
  "tasks_total": 0,
  "tasks_completed": 0,
  "tasks_in_progress": 0,
  "completion_percentage": 0,
  "last_updated": "2024-01-01T00:00:00Z"
}
```

---

## 🎓 Reference Documents

**Andrej Karpathy Principles:** Think → Simplicity → Surgical → Goal-Driven  
**Project Requirements:** See `DISCOVERY_PROMPT.md` & `REPORT_SPEC.md`  
**Domain Knowledge:** See `docs/` folder  
**Orchestration Manual:** See `docs/CODEX_ORCHESTRATION.md` — vai trò, cách giao task, ba cổng review, khi nào escalate lên PO  
**Skill & Plugin Catalog:** See `docs/CLAUDE_CODEX_CAPABILITIES.md` before routing a task to Codex  
**Machine Tech Reference:** See `docs/MACHINE_TECH_STACK_ARCHITECTURE_INVENTORY.md` before proposing an implementation stack or architecture  

---

## 🔧 Getting Started

1. **Read this file** → Understand orchestration model
2. **Check current task** → Look at `src/integration/progress.json`
3. **For Claude:** Run discovery skill or plan next phase
4. **For Codex:** Pick task from `src/orchestrator/tasks.json`, execute, report back

---

**Version:** 1.0  
**Last Updated:** 2026-08-03  
**Owner:** Claude Code (Orchestrator)
