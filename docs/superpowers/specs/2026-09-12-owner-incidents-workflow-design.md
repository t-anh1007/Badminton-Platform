# Owner incidents workflow design

## Approved outcome

Redesign `/manage/incidents` as a clean, guided three-step owner workflow that
matches the existing COURTIN management UI. The approved direction is the
step-by-step layout, not a dense calendar or priority-list dashboard.

## Scope

1. Select an owned booking by venue and date.
2. Select one of the existing actions: move it to an available court in the
   same venue and time range, or cancel it for a provider-fault refund.
3. Display a review before the existing mutation is submitted.

No API, authorization, booking, refund, or notification behavior changes.
The screen continues to use the existing `getReplacementCourts`,
`changeBookingCourt`, and `cancelProviderBooking` contracts.

## Interaction rules

- The action step is unavailable until a booking is selected.
- Replacement options are loaded only on request; an empty result points the
  owner toward cancellation.
- Cancellation requires a non-empty provider-fault reason.
- The final confirmation preserves the existing operation and refreshes the
  booking list after completion.

## Visual language

Use COURTIN's existing canvas/surface/card layout, `text-h1` and `text-h3`
hierarchy, navy primary treatment, rounded controls, and danger color only for
the irreversible cancellation action. Step pills reuse the booking-flow visual
pattern already used in `BookingPage`.

## Proof

The focused operations test covers loading replacement choices, confirming a
court move, requiring a cancellation reason, and confirming provider-fault
cancellation. Broader validation is deliberately omitted at the user's
request.
