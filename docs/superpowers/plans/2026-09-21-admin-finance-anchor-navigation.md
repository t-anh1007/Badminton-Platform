# Admin Finance Anchor Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky, one-row, COURTIN-styled in-page navigation rail that scrolls admins to the three existing finance workflows.

**Architecture:** Keep this purely within `AdminFinancePage`: a local, typed section list renders accessible fragment links and owns only the active visual state. Existing overview, withdrawal, and reconciliation components remain the source of financial data and operations; each receives a stable section anchor wrapper.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-admin-finance-anchor-navigation-design.md`

## Global Constraints

- Do not modify routes, API calls, data contracts, payment rules, or financial operation behavior.
- Keep all three navigation items in one horizontal row; narrow screens scroll the rail horizontally instead of wrapping labels.
- Keep the navigation rail sticky below the global header, and set every anchor scroll offset high enough that the target heading is not covered by either fixed UI layer.
- Use COURTIN typography: Archivo for headings, Inter for controls, Geist Mono for financial figures and references.
- Use the existing canvas, line, brand-navy, surface, and muted tokens; do not introduce new visual tokens or dependencies.
- Preserve the pre-existing uncommitted finance-transparency work in the target files; stage or commit none of it as part of this task.

---

### Task 1: Specify the anchor-navigation contract in the focused admin test

**Files:**
- Modify: `apps/web/src/pages/admin/adminOperations.test.tsx`

**Interfaces:**
- Consumes: `AdminFinancePage` and Testing Library `screen` / `fireEvent` helpers already used by this file.
- Produces: a regression test for the three fragment-link labels, their target IDs, and active-state transition.

- [ ] **Step 1: Write the failing test**

Add this test after the existing finance-operation tests:

```tsx
it('navigates between the three admin finance sections with in-page links', async () => {
  render(<AdminFinancePage />)

  const bank = await screen.findByRole('link', { name: 'Giao dịch ngân hàng và đối soát' })
  const withdrawals = screen.getByRole('link', { name: 'Yêu cầu rút tiền' })
  const reconciliation = screen.getByRole('link', { name: 'Đối soát' })

  expect(bank).toHaveAttribute('href', '#finance-bank-reconciliation')
  expect(withdrawals).toHaveAttribute('href', '#finance-withdrawals')
  expect(reconciliation).toHaveAttribute('href', '#finance-reconciliation')
  expect(screen.getByRole('navigation', { name: 'Điều hướng tài chính' })).toHaveClass('sticky')
  expect(bank).toHaveAttribute('aria-current', 'page')
  expect(document.getElementById('finance-bank-reconciliation')).toBeInTheDocument()
  expect(document.getElementById('finance-withdrawals')).toBeInTheDocument()
  expect(document.getElementById('finance-reconciliation')).toBeInTheDocument()

  fireEvent.click(withdrawals)
  expect(withdrawals).toHaveAttribute('aria-current', 'page')
  expect(bank).not.toHaveAttribute('aria-current')
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm run test --workspace @khoaluantn/web -- src/pages/admin/adminOperations.test.tsx
```

Expected: the new test fails because the page does not yet render links named `Giao dịch ngân hàng và đối soát`, `Yêu cầu rút tiền`, and `Đối soát`.

- [ ] **Step 3: Keep the test focused**

Do not alter existing tests for payout confirmation, reconciliation, disputes, moderation, evaluations, or tickets. The test uses only the existing mocked finance data, so it makes no network call and changes no financial state.

- [ ] **Step 4: Re-run after implementation**

Run the same focused command after Task 2. Expected: all assertions in this file pass.

- [ ] **Step 5: Preserve existing staged state**

Run:

```powershell
git diff -- apps/web/src/pages/admin/adminOperations.test.tsx
git status --short
```

Do not stage or commit this file: it already contains uncommitted, unrelated financial-transparency changes that belong to the existing working tree.

### Task 2: Render the one-row anchor rail and mark the three target sections

**Files:**
- Modify: `apps/web/src/pages/admin/AdminFinancePage.tsx`

**Interfaces:**
- Consumes: the page's existing `overview`, `error`, `load`, `FinancePlatformOverview`, and `FinanceAdminPanel` behavior.
- Produces: three `<a>` elements addressed by `#finance-bank-reconciliation`, `#finance-withdrawals`, and `#finance-reconciliation`; each section owns the matching `id`.

- [ ] **Step 1: Add typed navigation state and section metadata**

Extend the React import with `useState` only if not already present. Add these page-local declarations above `AdminFinancePage`:

```tsx
const financeSections = [
  { id: 'finance-bank-reconciliation', label: 'Giao dịch ngân hàng và đối soát' },
  { id: 'finance-withdrawals', label: 'Yêu cầu rút tiền' },
  { id: 'finance-reconciliation', label: 'Đối soát' },
] as const

type FinanceSectionId = (typeof financeSections)[number]['id']
```

Inside `AdminFinancePage`, initialize:

```tsx
const [activeSection, setActiveSection] = useState<FinanceSectionId>('finance-bank-reconciliation')
```

- [ ] **Step 2: Render a single-line, semantic navigation rail**

After the introductory paragraph and before the error/overview content, render:

```tsx
<nav className="sticky top-20 z-20 -mx-1 mt-6 overflow-x-auto bg-canvas/95 px-1 pb-1 pt-3 backdrop-blur-sm" aria-label="Điều hướng tài chính">
  <div className="inline-flex min-w-max gap-1 rounded-full border border-line bg-canvas p-1">
    {financeSections.map((section) => {
      const active = activeSection === section.id
      return <a
        key={section.id}
        href={`#${section.id}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => setActiveSection(section.id)}
        className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${active ? 'bg-brand-navy text-surface' : 'text-ink-500 hover:bg-surface hover:text-brand-navy'}`}
      >
        {section.label}
      </a>
    })}
  </div>
</nav>
```

`min-w-max`, `shrink-0`, and `overflow-x-auto` retain one row on small screens. The classes match the repository's existing segmented-control palette and Inter control typography.

- [ ] **Step 3: Mark all target sections without changing their content**

Use the following return-body structure. It preserves the current API call,
error copy, page-change handling, headings, and `FinanceAdminPanel` props:

```tsx
return (
  <>
    <h2 className="text-h1">Đối soát tài chính toàn nền tảng</h2>
    <p className="mt-2 max-w-3xl text-ink-500">Theo dõi tiền khách thanh toán, phần của chủ sân, doanh thu nền tảng, tiền đang chuyển và các khoản chưa có đối ứng.</p>
    <nav className="sticky top-20 z-20 -mx-1 mt-6 overflow-x-auto bg-canvas/95 px-1 pb-1 pt-3 backdrop-blur-sm" aria-label="Điều hướng tài chính">
      <div className="inline-flex min-w-max gap-1 rounded-full border border-line bg-canvas p-1">
        {financeSections.map((section) => {
          const active = activeSection === section.id
          return <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => setActiveSection(section.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${active ? 'bg-brand-navy text-surface' : 'text-ink-500 hover:bg-surface hover:text-brand-navy'}`}
          >
            {section.label}
          </a>
        })}
      </div>
    </nav>
    {error ? <p role="alert" className="mt-4 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
    <section id="finance-bank-reconciliation" className="scroll-mt-36">
      {overview ? <div className="mt-6"><FinancePlatformOverview data={overview} onPageChange={(page) => void load(page)} /></div> : <p className="mt-6 text-sm text-ink-500">Đang tải tổng quan tài chính…</p>}
    </section>
    <section id="finance-withdrawals" className="surface-card mt-6 scroll-mt-36 p-4">
      <h3 className="text-h2">Yêu cầu rút tiền</h3>
      <div className="mt-4"><FinanceAdminPanel mode="withdrawals" /></div>
    </section>
    <section id="finance-reconciliation" className="surface-card mt-6 scroll-mt-36 p-4">
      <h3 className="text-h2">Đối soát</h3>
      <div className="mt-4"><FinanceAdminPanel mode="reconciliation" /></div>
    </section>
  </>
)
```

- [ ] **Step 4: Run the focused proof**

Run:

```powershell
npm run test --workspace @khoaluantn/web -- src/pages/admin/adminOperations.test.tsx
```

Expected: PASS, including the new navigation contract and the established admin financial-operation coverage.

- [ ] **Step 5: Review the final patch without creating a commit**

Run:

```powershell
git diff --check
git diff -- apps/web/src/pages/admin/AdminFinancePage.tsx apps/web/src/pages/admin/adminOperations.test.tsx
git status --short
```

Do not stage or commit the changed files because both already had unrelated uncommitted work before this feature. Report the navigation diff separately from that existing work.

## Self-Review

- **Spec coverage:** Task 2 implements all three exact labels, in-page anchors, one-row mobile overflow, COURTIN tokens, Inter control styling, Archivo heading preservation, and scope boundaries. Task 1 proves the fragment targets and active link state.
- **Placeholder scan:** No unfinished markers, deferred implementation, or unspecified test behavior appears in the plan.
- **Type consistency:** `FinanceSectionId` derives directly from `financeSections`; `activeSection`, link hrefs, IDs, and test expectations use the same three exact strings.

## Execution Handoff

This plan has two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with review between tasks.
2. **Inline Execution** — execute the two tasks in this session using `superpowers:executing-plans`, with a checkpoint before focused testing.
