---
name: d2-erd
description: Dùng khi cần vẽ ERD đẹp bằng D2 (sql_table với PK/FK, layout ELK). Kích hoạt bằng `$d2-erd --feature <slug>`. Khác `$erd` (Mermaid, nhúng inline). Cùng họ với `$d2-activity`, `$d2-architect`.
---

# $d2-erd — Entity-Relationship Diagram (D2, sql_table + ELK)

> Họ skill D2: `$d2-activity` (flow) · `$d2-erd` (data model này) · `$d2-architect` (kiến trúc). Cả 3 dùng chung `d2-render.mjs` ở `.agents/skills/d2-activity/`.

## Goal

Vẽ data model 1 feature thành ERD **đẹp, gọn** bằng [D2](https://d2lang.com) `shape: sql_table` — mỗi entity 1 bảng có cột + kiểu + constraint PK/FK, quan hệ giữa bảng có nhãn nghiệp vụ. Output trong `docs/{feature}/d2-erd/`:

1. `{feature}.d2` — source D2 (text, version git). Sửa khi gọi lại skill (tự vào update mode).
2. `{feature}.svg` — render sẵn (mở browser/IDE/Obsidian).

Plus `d2-erd/{feature}-d2-erd-index.md` (metadata + bảng entity).

## Tại sao D2 thay vì Mermaid?

`shape: sql_table` của D2 vẽ header đậm, cột thẳng cột, cột constraint (PK/FK) canh phải rõ; quan hệ là mũi tên có nhãn nghiệp vụ (`sở hữu`, `chứa`, `clone từ`). Mermaid `erDiagram` cardinality ký hiệu (`||--o{`) khó đọc + layout kém khi >5 entity. D2 + ELK dàn bảng gọn hơn.

> Giữ `$erd` (Mermaid) cho **nhúng inline** GitHub/Obsidian. Dùng `$d2-erd` khi cần **bản đẹp standalone** cho stakeholder / export / review data model phức tạp.

## Constraints

- **Output cố định** `docs/{feature}/d2-erd/{feature}.d2` + `.svg`. KHÔNG ghi vào `srs/{feature}-erd.md`.
- **`--feature` optional** — auto-detect từ ngữ cảnh; file đã tồn tại → tự vào update mode, không cần flag. **Feature chưa có + mô tả data model → tự derive slug + tạo feature** (điểm-vào, xem `feature-bootstrap.md` nhóm A).
- **AI viết source, KHÔNG toạ độ** — ELK lo layout.
- **Render qua `node .agents/scripts/d2-render.mjs`** (dùng chung). KHÔNG gọi d2/Chrome trực tiếp.
- **Compile phải PASS** trước khi báo xong.
- **L1 approval** trước Write — prose BA-friendly, mô tả bằng từ nghiệp vụ (các thực thể + quan hệ), KHÔNG dump source.
- **KHÔNG L3 iterate** — review từ .svg.
- **KHÔNG hỏi kiểu DB/column type kỹ thuật** — data model ở mức nghiệp vụ (theo `ba-conventions.md` IT-BA framing). Cột = "loại thông tin nghiệp vụ" (email, status, ngày tạo), KHÔNG phải "varchar(255)".
- **Vietnamese-first** nhãn quan hệ; tên entity/cột giữ theo srs/{feature}-erd.md nếu đã có (thường English).
- **Per `diagram-selection.md`** — `$d2-erd` khi cần ERD đẹp standalone; nhúng inline → `$erd`.
- **Idempotent** — 1 feature = 1 file `{feature}.d2`; chạy lại → tự vào update mode (L2 diff), không refuse.

## Inputs

```
$d2-erd --feature <slug>            # tạo ERD mới (đọc srs/{feature}-erd.md hoặc srs/{feature}-spec.md làm nguồn)
$d2-erd "<mô tả data model>"        # feature chưa có → derive slug + phỏng vấn entity/quan hệ + tạo (điểm-vào)
```

Feature đã có ERD D2 → skill tự nhận ra và vào update mode (L2 diff), không cần gõ thêm gì.

## Context (dynamic)

Khi chạy, lấy ngày hiện tại từ runtime; quét feature và ERD nguồn hiện có bằng công cụ filesystem của Codex. Kiểm tra lệnh `d2` trong PATH trước khi ghi.

## Flow runtime

```
User gọi $d2-erd --feature X   (hoặc $d2-erd "<mô tả data model>")
   │  d2 chưa cài? → dừng, hướng dẫn install
   │  ┌─ Feature chưa khớp docs/{feature}/ nào (điểm-vào, feature-bootstrap.md nhóm A):
   │  │  arg là mô tả data model → derive feature slug (kebab-case, ASCII, ≤50 ký tự),
   │  │  confirm slug ở L1 (user override được), tạo docs/{feature}/d2-erd/ khi Write.
   │  │  arg là slug-lạ 1 từ → hỏi "feature mới hay gõ nhầm?" (liệt kê feature hiện có).
   │  └─ KHÔNG bắt user chạy /brainstorm trước.
   ▼
1. Đọc nguồn data model theo thứ tự ưu tiên:
   docs/X/srs/{feature}-erd.md (Mermaid erDiagram — chuyển thẳng) → nếu không có:
   docs/X/srs/{feature}-spec.md (Business Rules + entity mentions) → nếu không có:
   phỏng vấn ĐÚNG PHẠM VI ERD cần (feature-bootstrap.md nhóm A bước 3), gom 1 batch
   business-language (KHÔNG hỏi DB/column type): các entity · attribute nghiệp vụ mỗi
   entity (tên + nghĩa: email, status, ngày tạo — KHÔNG varchar) · quan hệ (cardinality
   1:1 / 1:N / N:N). No-re-ask cái nguồn đã có.
   Mô tả mơ hồ dù có nguồn (srs/{feature}-erd.md chỉ liệt kê tên entity không rõ attribute/quan hệ) →
   PHẢI hỏi clarifying trước khi generate, KHÔNG tự bịa attribute/cardinality.
   ▼
2. Trích: entity → cột (tên + loại nghiệp vụ + PK/FK), quan hệ (nguồn→đích + nhãn)
   ▼
3. Viết source .d2 (công thức bên dưới)
   ▼
4. L1 plan preview (prose: N entity, M quan hệ). User Y → tiếp
   ▼
5. Write {feature}.d2 → d2-render.mjs → {feature}.svg (compile fail → sửa, tối đa 2 lần)
   ▼
6. Update d2-erd/{feature}-d2-erd-index.md — set env note trước Write,
   │  chạy `activity-log.mjs` để append activity.log (không phụ thuộc spec.md tồn tại hay chưa).
   ▼ Báo user.
```

## Cách xây (build step-by-step)

### Bước 1 — Skeleton d2-erd/ nếu chưa có

`docs/{feature}/d2-erd/{feature}-d2-erd-index.md` (type `d2-erd-index`): frontmatter chuẩn + bảng entity (tên / số cột / PK / FK ra). Lifecycle inherit `srs/{feature}-spec.md`.

### Bước 2 — Công thức viết source .d2 (ERD)

```
direction: right       # ERD ngang dễ đọc; đổi 'down' nếu nhiều entity dọc

USER: {
  shape: sql_table
  id: string { constraint: primary_key }
  email: "string (unique)"        # QUOTE khi có () / ký tự đặc biệt
  status: "active | locked"
  createdAt: datetime
}

DECK: {
  shape: sql_table
  id: string { constraint: primary_key }
  userId: string { constraint: foreign_key }
  name: string
}

# Quan hệ = cạnh từ cột này sang cột kia, nhãn nghiệp vụ:
USER.id -> DECK.userId: sở hữu
```

**Quy tắc:**
- 1 entity = 1 block `shape: sql_table`. Cột: `tên: kiểu { constraint: primary_key | foreign_key }`.
- **QUOTE giá trị cột** khi chứa `()`, `|`, `/`, `:` — vd `"free | premium"`, `"string (nullable)"`. Tên cột trần (`id`, `userId`) không cần.
- Quan hệ: `A.pk -> B.fk: nhãn`. Nhãn tiếng Việt nghiệp vụ (`sở hữu`, `chứa`, `được ôn`).
- Loại nghiệp vụ đủ dùng: `string`, `int`, `boolean`, `datetime`, enum liệt kê `"a | b | c"`. KHÔNG `varchar(255)`, KHÔNG index/DB detail.
- KHÔNG toạ độ/width — ELK lo.

### Bước 3 — Render + verify

```bash
node .agents/scripts/d2-render.mjs docs/{feature}/d2-erd/{feature}.d2
# compile fail → thường thiếu quote giá trị cột có () hoặc | → sửa, render lại.
```

## L1 plan preview (mẫu BA-friendly)

> Em sẽ vẽ sơ đồ dữ liệu (ERD) feature **{feature}** tại `docs/{feature}/d2-erd/{feature}.d2` (+ ảnh `.svg`):
>
> **Các thực thể ({N}):** {liệt kê: USER, DECK, CARD, CARD_REVIEW...}
> **Quan hệ chính ({M}):** {vd "USER sở hữu DECK", "DECK chứa CARD", "CARD được ôn qua CARD_REVIEW"}
>
> Nguồn: {srs/{feature}-erd.md | srs/{feature}-spec.md | bạn cung cấp}.
>
> **Ghi nhận:** activity log "{note}".
>
> Apply? (Y / sửa)

## Output report

```
✅ D2 ERD: docs/{feature}/d2-erd/{feature}.svg
   Thực thể: {N} | Quan hệ: {M}

Mở {feature}.svg bằng browser/IDE/Obsidian để xem (bảng PK/FK gọn).
Cần sửa? $d2-erd --feature {feature} (skill tự vào update mode)
```

## Gotchas

- **d2 chưa cài** → dừng, in 1 dòng install.
- **QUOTE giá trị cột có ký tự đặc biệt** (gotcha #1) — `"free | premium"`, `"string (nullable)"`, `"A1 | A2 | B1"`. Quên quote → compile fail "unexpected text".
- **Nguồn tốt nhất là srs/{feature}-erd.md** — nếu có, chuyển 1-1 (USER {...} → sql_table). Đừng bịa entity ngoài spec.
- **ERD >8 entity** → cân nhắc `direction: down` + nhóm entity liên quan gần nhau bằng thứ tự khai báo.
- **Quan hệ nhiều-nhiều** → thể hiện qua bảng nối (junction table) như 1 entity riêng, đúng như data model thật.
- **KHÔNG hỏi DB detail** — index, migration, column length là việc dev/DBA, không phải ERD nghiệp vụ.
- **Update mode (feature đã có ERD)** → Read source cũ, L2 diff, re-render sau khi user Y.
- **Feature vừa bootstrap** — không có xử lý đặc biệt: sự kiện luôn vào activity.log qua `activity-log.mjs`, không phụ thuộc spec.md.

## References

- @../../rules/ba-conventions.md
- @../../rules/approval-gate.md
- @../../rules/naming-conventions.md
- @../../rules/changelog.md
- @../../rules/diagram-selection.md
- @../../rules/feature-bootstrap.md
