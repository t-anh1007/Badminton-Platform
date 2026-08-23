# Booking Find Opponent Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player create and fund a singles match directly from the booking summary, then land on the public match list with the funded match highlighted.

**Architecture:** `BookingPage` creates one hold and one `awaiting_deposit` match, then delegates balance/SePay collection and status polling to a focused `MatchDepositCheckout` component. `MatchListPage` reads `created=<matchId>`, reloads public matches and highlights or links to the created match. Existing matchmaking and finance endpoints remain authoritative.

**Tech Stack:** React 18, React Router, TypeScript, Vite, Vitest, Testing Library, existing REST APIs.

**Spec:** `docs/superpowers/specs/2026-08-23-booking-find-opponent-checkout-design.md`

## Global Constraints

- Singles only: `capacity: 2`, `feeMode: 'split'`.
- Organizer deposit is the existing organizer contribution, exactly 50% of the court price.
- Support both `Số dư` and `SePay`.
- Redirect only after `getMatchDetail(matchId).status !== 'awaiting_deposit'`.
- A retry during one checkout must reuse the same match ID.
- Do not change normal booking confirmation/payment behavior.
- Do not add a new backend payment, refund, ledger, or match state.

---

### Task 1: Match deposit checkout component

**Files:**
- Create: `apps/web/src/components/MatchDepositCheckout.tsx`
- Create: `apps/web/src/components/MatchDepositCheckout.test.tsx`
- Modify: `apps/web/src/lib/matchApi.ts`

**Interfaces:**
- Consumes: `getMatchDetail(matchId)`, `payMatchOrganizerContributionBalance(matchId)`, `createMatchOrganizerContributionSepayIntent(matchId)`.
- Produces: `MatchDepositCheckout({ matchId, fullPrice, holdExpiresAt, onPaid, onExpired })` where `onPaid(matchId: string): void` runs only after the match leaves `awaiting_deposit`.

- [ ] **Step 1: Write failing checkout tests**

```tsx
it('shows the exact 50 percent deposit and waits for the match to open', async () => {
  vi.mocked(payMatchOrganizerContributionBalance).mockResolvedValue({} as never)
  vi.mocked(getMatchDetail)
    .mockResolvedValueOnce(awaitingDepositDetail)
    .mockResolvedValueOnce({ ...awaitingDepositDetail, status: 'open' })
  render(<MatchDepositCheckout matchId="m1" fullPrice="120000" holdExpiresAt={future} onPaid={onPaid} onExpired={onExpired} />)
  expect(screen.getByText('Cọc tạo kèo (50%)')).toBeInTheDocument()
  expect(screen.getByText('60.000đ')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Thanh toán số dư' }))
  await waitFor(() => expect(onPaid).toHaveBeenCalledWith('m1'))
})

it('renders SePay and does not finish while payment is pending', async () => {
  vi.mocked(createMatchOrganizerContributionSepayIntent).mockResolvedValue(sepayIntent as never)
  vi.mocked(getMatchDetail).mockResolvedValue(awaitingDepositDetail as never)
  render(<MatchDepositCheckout matchId="m1" fullPrice="120000" holdExpiresAt={future} onPaid={onPaid} onExpired={onExpired} />)
  fireEvent.change(screen.getByLabelText('Phương thức thanh toán cọc'), { target: { value: 'sepay' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tạo mã SePay' }))
  expect(await screen.findByText(sepayIntent.matchCode)).toBeInTheDocument()
  expect(onPaid).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd apps/web; npx vitest run src/components/MatchDepositCheckout.test.tsx`

Expected: FAIL because `MatchDepositCheckout` does not exist.

- [ ] **Step 3: Add a reusable match-open waiter**

In `matchApi.ts`, add:

```ts
export async function waitForMatchOpen(id: string, options: { attempts?: number; intervalMs?: number } = {}) {
  const attempts = options.attempts ?? 20
  const intervalMs = options.intervalMs ?? 1_000
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const detail = await getMatchDetail(id)
    if (detail.status !== 'awaiting_deposit') return detail
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error('Khoản cọc đang được xác nhận. Vui lòng chờ thêm hoặc thử kiểm tra lại.')
}
```

- [ ] **Step 4: Implement the focused checkout component**

Use local `method`, `phase`, `error`, and `sepay` state. Compute:

```ts
const deposit = (BigInt(fullPrice) / 2n).toString()
```

Render the approved explanation, exact full price/deposit, countdown, payment method select, and existing `SepayPaymentDetails`. Balance and SePay both call `waitForMatchOpen(matchId)` after initiating payment. Call `onExpired()` when the countdown reaches zero. Disable payment buttons during payment/status confirmation.

- [ ] **Step 5: Run checkout tests and verify GREEN**

Run: `cd apps/web; npx vitest run src/components/MatchDepositCheckout.test.tsx`

Expected: PASS.

---

### Task 2: Booking page find-opponent flow

**Files:**
- Modify: `apps/web/src/pages/BookingPage.tsx`
- Modify: `apps/web/src/pages/BookingPage.selection.test.tsx`

**Interfaces:**
- Consumes: `createHold`, `createMatch`, `MatchDepositCheckout`.
- Produces: booking-page flow state `{ hold, matchId }` and successful navigation to `/matches?created=<id>`.

- [ ] **Step 1: Add failing booking-page tests**

Extend API mocks with `createMatch`. Add assertions:

```tsx
expect(screen.getByRole('button', { name: 'XÁC NHẬN' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'TÌM ĐỐI THỦ' })).toBeInTheDocument()
fireEvent.click(screen.getByRole('button', { name: 'TÌM ĐỐI THỦ' }))
await waitFor(() => expect(createHold).toHaveBeenCalledWith({
  courtId: 'c1', startAt: expectedStart, endAt: expectedEnd,
}))
expect(createMatch).toHaveBeenCalledWith({ holdId: 'hold-internal', capacity: 2, feeMode: 'split' })
expect(await screen.findByText('Cọc tạo kèo (50%)')).toBeInTheDocument()
```

Also assert a second click/retry does not issue a second `createMatch` call.

- [ ] **Step 2: Run the focused page test and verify RED**

Run: `cd apps/web; npx vitest run src/pages/BookingPage.selection.test.tsx`

Expected: FAIL because the new action and checkout state do not exist.

- [ ] **Step 3: Add isolated match-checkout state to BookingPage**

Add:

```ts
const [matchCheckout, setMatchCheckout] = useState<{ matchId: string; holdExpiresAt: string } | null>(null)
```

Implement one guarded function:

```ts
const findOpponent = () => run(async () => {
  if (!selection || matchCheckout) return
  const nextHold = await createHold({ courtId: selection.courtId, startAt: selection.startAt, endAt: selection.endAt })
  const match = await createMatch({ holdId: nextHold.id, capacity: 2, feeMode: 'split' })
  setHold(nextHold)
  setMatchCheckout({ matchId: match.id, holdExpiresAt: nextHold.expiresAt })
})
```

Do not call `createBooking`; matchmaking already promotes the hold into its held booking.

- [ ] **Step 4: Render the second action and checkout**

When selection exists and neither booking nor match checkout exists, render `XÁC NHẬN` followed by a secondary full-width `TÌM ĐỐI THỦ` button. When match checkout exists, render `MatchDepositCheckout` with:

```tsx
onPaid={(matchId) => navigate(`/matches?created=${encodeURIComponent(matchId)}`, { replace: true })}
onExpired={expireHold}
```

Keep slot/date/court controls locked while either booking payment or match deposit checkout is active.

- [ ] **Step 5: Run booking-page tests and verify GREEN**

Run: `cd apps/web; npx vitest run src/pages/BookingPage.selection.test.tsx src/components/MatchDepositCheckout.test.tsx`

Expected: PASS.

---

### Task 3: Created-match feedback on match list

**Files:**
- Modify: `apps/web/src/pages/MatchListPage.tsx`
- Create: `apps/web/src/pages/MatchListPage.created.test.tsx`

**Interfaces:**
- Consumes: `created` query parameter and the existing `listMatches()` result.
- Produces: success notice, card anchor `data-match-id`, scroll/focus and temporary highlight; detail fallback if filtered out.

- [ ] **Step 1: Write failing match-list tests**

```tsx
it('announces and highlights the newly funded match', async () => {
  vi.mocked(listMatches).mockResolvedValue({ matches: [publicMatch] })
  render(<MemoryRouter initialEntries={['/matches?created=m1']}><MatchListPage /></MemoryRouter>)
  expect(await screen.findByText('Kèo đã được tạo và đang tìm đối thủ.')).toBeInTheDocument()
  expect(screen.getByTestId('match-card-m1')).toHaveClass('ring-2')
})

it('links to a created match hidden by current filters', async () => {
  vi.mocked(listMatches).mockResolvedValue({ matches: [] })
  render(<MemoryRouter initialEntries={['/matches?created=m1']}><MatchListPage /></MemoryRouter>)
  expect(await screen.findByRole('link', { name: 'Xem kèo vừa tạo' })).toHaveAttribute('href', '/matches/m1')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd apps/web; npx vitest run src/pages/MatchListPage.created.test.tsx`

Expected: FAIL because created-match feedback is absent.

- [ ] **Step 3: Implement created-match feedback**

Read `created` with `useSearchParams()`. After loading, locate the card ref and call:

```ts
cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
cardRef.current?.focus({ preventScroll: true })
```

Render the success notice whenever `created` exists. Add `data-testid={`match-card-${match.id}`}` and the ring classes only when `match.id === createdMatchId`. When no loaded card matches, render `<Link to={`/matches/${createdMatchId}`}>Xem kèo vừa tạo</Link>`.

- [ ] **Step 4: Run match-list tests and verify GREEN**

Run: `cd apps/web; npx vitest run src/pages/MatchListPage.created.test.tsx src/pages/MatchListPage.sources.test.tsx`

Expected: PASS.

---

### Task 4: Focused integration and browser proof

**Files:**
- Modify only if a focused regression is discovered in files from Tasks 1-3.

**Interfaces:**
- Consumes: completed booking checkout and match-list behavior.
- Produces: executable evidence for the user-visible flow.

- [ ] **Step 1: Run all affected frontend tests**

Run:

```powershell
cd apps/web
npx vitest run src/booking/selection.test.ts src/components/BookingSummary.test.tsx src/components/MatchDepositCheckout.test.tsx src/pages/BookingPage.selection.test.tsx src/pages/MatchListPage.created.test.tsx src/pages/MatchListPage.sources.test.tsx src/pages/matchCommunitySupportSurfaces.test.tsx
```

Expected: all selected test files pass.

- [ ] **Step 2: Perform a read-only impact scan**

Run:

```powershell
rg -n "MatchDepositCheckout|waitForMatchOpen|createdMatchId|TÌM ĐỐI THỦ" apps/web/src
git diff -- apps/web/src docs/superpowers/specs/2026-08-23-booking-find-opponent-checkout-design.md docs/superpowers/plans/2026-08-23-booking-find-opponent-checkout.md
```

Expected: only the planned UI/API/test surfaces and the approved docs are involved.

- [ ] **Step 3: Browser-check the balance path**

Select a slot at least 24 hours ahead, click `TÌM ĐỐI THỦ`, verify exact full price and 50% deposit, pay by balance, and verify redirect to `/matches?created=<id>`, success notice, and highlighted public card.

- [ ] **Step 4: Browser-check the SePay pending path**

Start a fresh eligible slot, select SePay, generate the QR, verify the match does not appear publicly and the page does not redirect before payment completion. Cancel the test draft through the existing match cancellation flow so the slot is released.

- [ ] **Step 5: Report validation boundary**

Report focused tests and browser observations. Do not run repository-wide typecheck/build until the user explicitly approves that additional validation.

