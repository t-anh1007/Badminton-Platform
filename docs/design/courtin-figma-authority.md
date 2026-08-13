---
type: design-authority
status: active
source_file: FHuhhmlhPSl8gOUuUx7az2
decision: D45
updated: 2026-08-13
---

# COURTIN Figma visual authority

Figma file `FHuhhmlhPSl8gOUuUx7az2` là nguồn quyết định duy nhất cho hình thức của
`apps/web`. Tài liệu này ghi lại token và anatomy đã đọc trực tiếp từ Homepage `67:3`,
Booking `3:8`, và Admin Finance Reconciliation `96:106`, đồng thời không cấp quyền
thay đổi nghiệp vụ hay API.

## Typography

- Display và section heading: Archivo ExtraBold, uppercase có chủ đích.
- Body, navigation, controls và labels: Inter (Regular, Medium, Semi Bold, Bold).
- Tiền, mã tham chiếu, rating/RD và thời gian: Geist Mono (Regular hoặc Bold).

## Palette và semantic role

| Role | Value | Use |
|---|---|---|
| Navy | `#15446C` | Chrome, heading, active filter, primary text on light surface |
| Navy raised | `#1E547C` | Hero feature card and dark supporting surface |
| Yellow | `#F5E663` | Primary CTA, attention badge and selected/held slot |
| Canvas | `#F7F7F5` | Page background and subdued table header |
| Surface | `#FFFFFF` | Card, form and operational table surface |
| Line | `#E5E5E0` | Divider and neutral control border |
| Body | `#171717` | Primary body text |
| Muted | `#666666` | Secondary text and labels |
| Danger | `#E63946` | Error, hold urgency and destructive/exception action |

Semantic status always retains text/icon/ARIA naming in addition to color.

## Layout, spacing and anatomy

- Desktop chrome: 80px navy bar, 60px horizontal gutter; mobile uses a compact menu
  and responsive one-column content.
- Page canvas uses clear bands: page/title context, filter/action rail, then task
  content. Do not flatten different workflows into one repeated card template.
- Common spacing visible across authority frames: 4, 6, 8, 10, 12, 16, 20, 24, 28,
  32, 40, 44, 56 and 60px. Desktop content changes to grid/table; mobile transforms
  to stacked cards or scroll-safe controls.
- CTA and filter controls are pill-shaped (99/200px radius); cards use 14–16px;
  compact exception actions use 6px. Borders are thin and shadows are restrained.
- Navbar anatomy: yellow logo badge, Archivo wordmark, uppercase Inter navigation,
  yellow utility CTA and profile/menu cluster.
- Operations anatomy: explicit page context, task-specific filters, dense semantic
  table/list, status badge and reason/confirmation-preserving actions.

## Asset policy

Only export assets supplied by the COURTIN Figma file to
`apps/web/public/assets/courtin/` with descriptive names. Do not hotlink temporary
Figma URLs, recreate unknown icons, or use repository Playo assets as visual source.
Dynamic images remain API data when supported by the existing contract.

## Route/frame reference

Route-to-node mapping and missing F1–F5 screens are maintained in
[`../plans/active/figma-to-code-implementation.md`](../plans/active/figma-to-code-implementation.md)
and [`../plans/active/figma-full-screen-coverage.md`](../plans/active/figma-full-screen-coverage.md).
Implementation may start only after F1–F5 are visually reviewed and recorded there.

## Evidence

- 2026-08-13: `get_design_context`, metadata and screenshot reviewed for Homepage
  `67:3` (1440×2090), Booking `3:8` (1440×950) and Admin Finance Reconciliation
  `96:106` (1440×1237).
- 2026-08-13: Figma MCP authenticated with a Full seat; the target file has no
  subscribed libraries. No unrelated community library is adopted.
