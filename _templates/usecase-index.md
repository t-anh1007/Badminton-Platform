---
type: usecase-index
feature: {{feature_slug}}
status: draft
updated: {{date}}
links:
  - docs/{{feature_slug}}/srs/{{feature}}-spec.md
---

# {{feature_name}} — Use Cases Index

## Use cases

> Bảng này là **ma trận truy vết per-feature** (UC↔FR↔Screen↔Error↔OQ) đồng thời là metadata/lifecycle — 1 nguồn duy nhất, không tách file riêng. `/gap` mới soát orphan/link-lệch cross-doc (→ `docs/_shared/traceability.md`).

| # | Slug | Level | Status | Actor primary | Covers FR | Screens | Errors (E-*) | OQ ref | Priority | Updated |
|---|------|-------|--------|---------------|-----------|---------|--------------|--------|----------|---------|
| 1 | [{{uc_slug_1}}]({{uc_slug_1}}.md) | sea | draft | {{actor}} | FR-{{feature}}-001 | login, success | E-{{feature}}-001 | — | P0 | {{date}} |

## CRUD matrix

> Use case nào thao tác entity nào (C=Create, R=Read, U=Update, D=Delete). Ô trống = không đụng. Nguồn edge UC→entity (OPERATES_ON) — bảng CRUD kinh điển của nghề BA, đối chiếu với ERD (`srs/{{feature}}-erd.md`). Entity đặt tên CamelCase khớp ERD.

| UC \ Entity | {{Entity1}} | {{Entity2}} |
|---|---|---|
| [{{uc_slug_1}}]({{uc_slug_1}}.md) | CRUD | R |

## Actors

| Actor | Loại | Mô tả | Nguồn |
|---|---|---|---|
| {{actor_1}} | primary / secondary / system | {{description}} | {{source}} |

## Diagram

<img src="{{feature}}-usecase-diagram.svg" alt="Use case diagram: {{feature}}">

*Nguồn thật ở `{{feature}}-usecase-diagram.puml` (PlantUML native), render qua `node .agents/scripts/plantuml-render.mjs` ra `.svg`. Sửa nội dung → sửa `.puml` rồi gọi lại `$usecase-diagram`, KHÔNG sửa tay `.svg`.*

## Relationships

| Type | From | To | Rationale |
|---|---|---|---|
| include | {{base_uc}} | {{included_uc}} | {{included_uc}} luôn cần để {{base_uc}} hoàn thành |
| extend | {{extending_uc}} | {{base_uc}} | {{extending_uc}} bổ sung {{base_uc}} khi {{condition}} (base vẫn đủ nếu không xảy ra) |

## Nguồn dữ liệu

- FR + Error Matrix: [[../srs/{{feature}}-spec.md|SRS spec]]
- Screens: [[../ascii-wireframe/{{feature}}-wireframe-index.md|Screens index]]
- Open Questions: `srs/{{feature}}-spec.md` Mục Open Questions (canonical — bảng trên chỉ trỏ ref `spec.md#OQ-N`)
