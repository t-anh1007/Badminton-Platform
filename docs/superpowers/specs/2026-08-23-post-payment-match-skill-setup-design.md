# Post-payment Match Skill Setup

## Outcome

After the organizer pays the 50% court deposit, keep the existing redirect to
the match-list page but require the organizer to configure the accepted skill
range before the match becomes public.

## Authority and unchanged rules

- The approved singles deposit flow in
  `docs/plans/active/PLAN_MATCH-DEPOSIT.md` remains authoritative.
- Payment still changes `awaiting_deposit` to `open` and extends the court hold.
- The organizer deposit, opponent payment, deadlines, cancellation and wallet
  refund behavior do not change.
- Skill tiers remain `newcomer`, `beginner`, `intermediate`,
  `intermediate_plus`, and `advanced`.

## Visibility gate

Add nullable `Match.skillConfiguredAt`.

- New deposit matches are created with `skillConfiguredAt = null`.
- `findPublicMatches` and AI/quick-match discovery exclude matches whose
  `skillConfiguredAt` is null.
- The organizer can still retrieve the match detail by ID so the setup can be
  recovered after refresh.
- Existing rows are backfilled with `skillConfiguredAt = createdAt` in the
  migration so this feature does not hide historical/open matches.
- A match with `skillConfiguredAt = null` still participates in the existing
  cutoff scheduler and refund lifecycle.

The gate is independent of `Match.status`: payment may make the match `open`,
but public discovery additionally requires completed skill setup.

## Setup API

Add:

`PATCH /matches/:matchId/skill-range`

Request:

```json
{
  "skillMin": "beginner",
  "skillMax": "intermediate_plus"
}
```

Rules:

- authenticated player must be the organizer;
- match status must be `open`;
- organizer contribution must already be paid;
- `skillConfiguredAt` must still be null;
- both tiers are required;
- `skillMin` must not exceed `skillMax` in the canonical tier order;
- update `skillMin`, `skillMax`, and `skillConfiguredAt` atomically;
- a repeated identical request returns the configured match successfully;
- a repeated different request returns conflict and does not alter the range.

Response contains the match ID, skill range and `skillConfiguredAt`.

## Match-list interaction

Successful deposit navigation becomes:

`/matches?created=<matchId>&setup=1`

On this URL, `MatchListPage` opens a required modal titled
`Thiết lập bậc trình độ`.

The modal contains:

- `Bậc tối thiểu` select;
- `Bậc tối đa` select;
- preview `Đối thủ phù hợp: <min> – <max>`;
- validation when minimum exceeds maximum;
- primary action `Lưu và mở kèo`.

The modal cannot be dismissed with Escape, backdrop, or a close button while
setup is incomplete. It does not create another match or issue another payment.

On save success:

1. remove `setup` from the URL while retaining `created`;
2. reload public matches;
3. close the modal;
4. show `Thiết lập hoàn tất — kèo đang tìm đối thủ.`;
5. scroll to and temporarily highlight the new match card.

If saving fails, preserve both selected tiers, keep the modal open and show the
backend error. A refresh of the setup URL reopens the modal. If the match is
already configured, the page removes `setup`, reloads the list and shows the
normal created-match result without resubmitting.

## Boundaries

- `matchmaking-service` owns persistence, authorization, validation and public
  visibility.
- `apps/web` owns the modal, URL state, API call, feedback and list refresh.
- No finance or venue-booking contract changes are required.
- This scope does not add later editing of the skill range after the setup is
  completed.

## Proof

Focused backend tests cover:

- newly paid but unconfigured match is absent from public and AI discovery;
- organizer can configure a valid range;
- invalid order, non-organizer, unpaid/non-open match and conflicting retry are
  rejected;
- identical retry is idempotent;
- configured match appears in public discovery.

Focused frontend tests cover:

- post-payment URL includes `setup=1`;
- modal opens on the match list and cannot be dismissed;
- invalid tier order is blocked client-side;
- successful save reloads and highlights the match;
- failed save preserves selections and displays an error;
- already-configured refresh recovers without a duplicate update.

Browser verification pays one eligible match, completes the modal, and confirms
that the configured range appears on the highlighted public card/detail.

