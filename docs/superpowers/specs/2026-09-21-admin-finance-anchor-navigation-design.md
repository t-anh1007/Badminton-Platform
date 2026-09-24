# Admin finance anchor navigation

## Outcome

Improve `/admin/finance` with a compact, three-item navigation rail that scrolls
within the existing page to its operational sections:

1. **Giao dịch ngân hàng và đối soát** — platform financial overview.
2. **Yêu cầu rút tiền** — withdrawal review queue.
3. **Đối soát** — incoming/outgoing reconciliation queue.

No route, API, data contract, payment rule, or approval behavior changes.

## Layout and visual system

Place the rail below the page introduction and above the financial overview. It
remains sticky below the global navigation while the admin scrolls through the
finance page, so any section can be reached without returning to the top. Use
the established `SegmentedControl` treatment: canvas container, thin `line`
border, pill-shaped items, `brand-navy` active item with white text, and muted
inactive labels. The entire control remains one horizontal row. Its outer
container scrolls horizontally on narrow viewports rather than wrapping labels.

Typography follows the active COURTIN authority:

- Section and page headings: Archivo ExtraBold.
- Navigation labels and operational text: Inter.
- Currency and references: Geist Mono.

Each content section uses the existing surface-card/table vocabulary and gains
a stable anchor target with enough scroll offset for both the global header and
the sticky finance rail.

## Interaction and accessibility

The three controls are keyboard-accessible in-page links with descriptive labels
and fragment targets. Clicking one performs native in-page navigation to the
matching section. Active styling initially represents the platform overview;
clicking a control updates that visual state. Narrow screens retain one row with
horizontal scrolling.

## Scope and proof

Only `AdminFinancePage` and its focused component test are expected to change.
The test will prove that all three labelled navigation links render and reference
the intended section anchors. Existing withdrawal and reconciliation tests remain
the behavioral guard for financial operations.
