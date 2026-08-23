# Booking Find Opponent Checkout

## Outcome

Add a `Tìm đối thủ` action below the normal booking confirmation action. It
turns the selected slot into a singles match, collects the organizer's 50%
deposit, and sends the organizer to the match list only after payment succeeds.
The newly created match is visible and highlighted there.

## Authority and invariants

This UI reuses the approved rules in `docs/plans/active/PLAN_MATCH-DEPOSIT.md`:

- singles only, capacity 2;
- organizer deposit is 50% of the court price;
- the opponent pays the remaining 50%;
- match creation requires a slot at least 24 hours in the future;
- unpaid deposit checkout expires after the existing short hold window;
- a paid match without an opponent is cancelled at its deadline and the
  organizer deposit is returned to the wallet.

This change does not introduce a new payment, ledger, refund, or match state.

## Booking page interaction

The booking summary offers two distinct actions:

1. `Xác nhận` keeps the normal court-booking flow unchanged.
2. `Tìm đối thủ` starts the match-deposit flow for the current contiguous
   selection.

On `Tìm đối thủ`, the frontend creates the normal booking hold and then creates
a singles split-fee match from that hold. The resulting match is
`awaiting_deposit`. The same booking summary panel switches to a deposit
checkout instead of navigating to match detail.

The checkout must show:

- venue, court, date and time;
- full court price;
- `Cọc tạo kèo (50%)` and the exact deposit amount;
- the explanation that the deposit holds the court and opens a singles match;
- the opponent pays the other 50%;
- if no opponent is found by the deadline, the deposit is returned to the
  organizer wallet;
- the remaining short checkout time.

The organizer can pay with either `Số dư` or `SePay`.

## Payment behavior

### Balance

The frontend requests the existing organizer-contribution balance payment for
the created match. A successful response is treated as payment success and
starts completion polling to allow the event-driven match transition to become
observable.

### SePay

The frontend requests the existing organizer-contribution SePay intent and
shows the returned VietQR information. It polls the existing payment/match
status. Redirect happens only after the backend reports that the deposit has
completed and the match is no longer `awaiting_deposit`.

Repeated clicks must reuse the match created for the active checkout. They must
not create another hold or match. Payment API idempotency remains authoritative
for retries.

## Successful completion

After the match becomes public/open, navigate with replacement to:

`/matches?created=<matchId>`

The match list reloads its public matches, finds that ID, scrolls its card into
view, applies a temporary highlight, and displays:

`Kèo đã được tạo và đang tìm đối thủ.`

The URL parameter may remain for refresh-safe feedback, but highlighting must
not interfere with filters. If active filters exclude the new match, the page
shows the success message and a direct link to its detail instead of claiming
the card is visible.

## Failure and recovery

- Hold or match creation failure leaves the selected slots intact and shows the
  backend error.
- Payment failure keeps the checkout open so the organizer can retry or switch
  payment method.
- Leaving an unpaid checkout does not cancel synchronously; the existing
  10-minute expiry releases the draft match and short hold.
- If status polling times out, keep the checkout visible and tell the user that
  confirmation is still pending; do not create a second match.
- An expired or cancelled draft cannot be paid again. The UI returns to slot
  selection after refreshing availability.

## Component and API boundaries

- `BookingPage` owns the selection-to-checkout state transition.
- A focused deposit-checkout component owns payment method selection, QR
  presentation, countdown and pending/success/error rendering.
- Existing match APIs are reused for match creation and organizer contribution
  payment. Any missing public status polling helper should be a thin wrapper
  around the existing match-detail endpoint.
- `MatchListPage` owns created-match feedback and card highlighting.
- Normal booking payment behavior remains isolated and unchanged.

## Proof

Focused frontend tests cover:

- both booking actions are visible and independent;
- `Tìm đối thủ` creates one match from the selected hold;
- checkout displays exact full price and 50% deposit;
- balance success redirects only after the match opens;
- SePay renders payment data and waits for confirmed status;
- retries do not create duplicate matches;
- the match list highlights the `created` match and handles filtered-out cards;
- creation and payment errors remain recoverable.

Browser verification covers one balance flow and one SePay pending-state flow.

