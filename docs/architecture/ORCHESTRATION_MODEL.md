# Claude Code + Codex Orchestration Model

## Overview

This project uses a **role-based orchestration** system:

- **Claude Code** acts as the **Orchestrator** — makes decisions, defines tasks, reviews results
- **Codex** acts as the **Worker** — executes tasks, generates code, writes docs

This separation ensures:
- ✅ Clear responsibilities
- ✅ Minimal scope creep
- ✅ Predictable, surgical changes
- ✅ Goal-driven execution

## The Four Phases

### Phase 1: Discovery (Claude)
**Goal:** Understand the problem deeply

1. Read all business requirements
2. State assumptions explicitly
3. Identify unknowns and risks
4. Define clear scope
5. Create: Discovery summary with validated scope

### Phase 2: Planning (Claude)
**Goal:** Design the solution architecture

1. Brainstorm solutions
2. Design system architecture
3. Define data models
4. Create user stories & acceptance criteria
5. Decompose into atomic tasks
6. Create: Architecture docs + task list

### Phase 3: Implementation (Codex)
**Goal:** Execute against specification

1. Receive task from Claude (with criteria)
2. Generate minimal, focused code
3. Test against acceptance criteria
4. Report: what was done, what changed
5. Await Claude review

### Phase 4: Verification (Claude)
**Goal:** Quality gate

1. Review output against criteria
2. Check for scope creep or over-engineering
3. Verify surgical changes
4. Accept or provide feedback
5. Loop to Phase 3 or mark complete

## Task Format: Claude → Codex

```json
{
  "task_id": "task-001",
  "title": "User login endpoint",
  "description": "Implement POST /auth/login",
  
  "scope": "Accept email + password, return JWT",
  "constraints": [
    "Use JWT tokens",
    "No 2FA in this task",
    "Rate limit to 10 attempts/hour"
  ],
  
  "acceptance_criteria": [
    "Valid credentials return valid JWT",
    "Invalid credentials return 401",
    "Exceeding rate limit returns 429"
  ],
  
  "success_tests": [
    "test_valid_login_returns_jwt",
    "test_invalid_login_returns_401",
    "test_rate_limiting_works"
  ],
  
  "out_of_scope": [
    "Password reset flow",
    "OAuth/social login",
    "Biometric auth",
    "2FA"
  ]
}
```

## Output Format: Codex → Claude

```json
{
  "task_id": "task-001",
  "status": "completed",
  
  "what_was_done": [
    "Created auth/login.ts endpoint",
    "Added JWT token generation",
    "Implemented rate limiting middleware"
  ],
  
  "changes": {
    "created": ["src/routes/auth/login.ts"],
    "modified": ["src/middleware/rateLimit.ts"],
    "unchanged": ["all other files"]
  },
  
  "tests_passed": 3,
  "criteria_met": ["✓", "✓", "✓"],
  "issues": []
}
```

## Core Principles Applied

### 1. Think Before Coding ✓
- Claude states assumptions explicitly
- Codex doesn't guess — executes exactly as specified
- Unknowns are surfaced, not hidden

### 2. Simplicity First 🎯
- Claude: "Only ask for what's needed"
- Codex: "Only implement what's asked, no extras"
- No speculative features or premature abstraction

### 3. Surgical Changes 🔧
- Claude: Reviews every change for necessity
- Codex: Minimal diff, preserves code style
- Easy to review, easy to revert if needed

### 4. Goal-Driven Execution 🚀
- Claude: Defines verifiable success criteria (not "improve")
- Codex: Implements until all criteria pass
- Clear done/not-done, no ambiguity

## Decision Tree: Claude vs Codex

```
Is it a decision?
├─ YES → Claude makes it
└─ NO → Is it creative thinking?
    ├─ YES → Claude does it (brainstorm, design)
    └─ NO → Is it code/test execution?
        ├─ YES → Codex does it (generate, review, test, docs)
        └─ NO → Depends on phase
```

## Quality Checkpoints

### When Claude reviews Codex output:

1. **Does it meet criteria?**
   ```
   ✓ All acceptance criteria passed?
   ✓ All tests passing?
   ✓ Scope respected (nothing extra)?
   ```

2. **Is it surgical?**
   ```
   ✓ Minimal changes?
   ✓ Unnecessary edits avoided?
   ✓ Code style preserved?
   ```

3. **Is it simple?**
   ```
   ✓ Minimal code for the job?
   ✓ No over-engineering?
   ✓ Clear and maintainable?
   ```

4. **Is it testable?**
   ```
   ✓ Acceptance criteria testable?
   ✓ Test cases clear?
   ✓ Edge cases covered?
   ```

## Workflow Example

### Task: User Sign-Up

**Claude Orchestrator:**
```
1. Discovery: "Sign-up with email/password, no email verification yet"
2. Planning: "Store user, validate email format, return user ID"
3. Task: Define exact API spec, acceptance criteria
4. Verification: Review code against criteria
```

**Codex Worker:**
```
1. Read task (email/password validation, store user)
2. Implement: signup.ts, add to routes
3. Test: Valid email passes, invalid fails, user stored
4. Report: "Created signup.ts, 2 tests pass, criteria met"
```

**Claude Review:**
```
1. Check: Does it meet criteria? ✓
2. Check: Surgical changes? ✓ (only new file)
3. Check: Simple? ✓ (minimal implementation)
4. Accept → Move to next task
```

## Anti-Patterns to Avoid

### ❌ Claude Anti-Patterns
- Assuming instead of asking
- Vague specifications ("make it better")
- Changing scope mid-implementation
- Accepting scope creep
- Not defining success criteria clearly

### ❌ Codex Anti-Patterns
- Expanding scope beyond task
- Over-engineering solutions
- Not following project conventions
- Incomplete testing
- Not reporting what changed

## Progress Tracking

Current progress lives in `src/integration/progress.json`:
- Current phase
- Task completion metrics
- Phase completion percentage
- Last update timestamp

Update this file after each phase completes.

---

**Key Takeaway:** This model ensures decisions happen at the right level (Claude), execution is focused (Codex), and quality is maintained through clear criteria and verification.
