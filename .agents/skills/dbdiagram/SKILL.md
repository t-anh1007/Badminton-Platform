---
name: dbdiagram
description: Dùng khi cần sinh schema database dạng DBML (.dbml, import dbdiagram.io / dbdocs.io, export SQL) cho data model 1 feature — tầng gần dev nhất trong họ ERD. Kích hoạt bằng `$dbdiagram --feature <slug>`. Khác `$erd` (Mermaid nhúng inline, type gọn cho BA đọc) và `$d2-erd` (D2 hình đẹp standalone).
---

# $dbdiagram — Database schema (DBML, import dbdiagram.io)

> Họ 3 skill ERD: `$erd` (Mermaid, nhúng inline GitHub/Obsidian, type gọn) · `$d2-erd` (D2 `sql_table`, hình đẹp standalone) · `$dbdiagram` (DBML này — **tầng gần dev nhất**: file `.dbml` import dbdiagram.io/dbdocs.io, export ra SQL thật).

## Goal

Sinh **schema database** 1 feature dưới dạng [DBML](https://dbml.dbdiagram.io) (Database Markup Language) — file `.dbml` chuẩn mà [dbdiagram.io](https://dbdiagram.io) và [dbdocs.io](https://dbdocs.io) import trực tiếp để vẽ sơ đồ + export SQL (Postgres/MySQL/…). Output trong `docs/{feature}/dbdiagram/`:

1. `{feature}.dbml` — source DBML (text, version git). Sửa khi gọi lại skill (tự vào update mode).
2. `{feature}.sql` — SQL sinh từ `.dbml` qua `dbml2sql` (bằng chứng schema hợp lệ + dev import DB được ngay).

Plus `dbdiagram/{feature}-dbdiagram-index.md` (metadata + bảng table).

## Tại sao DBML bên cạnh $erd + /d2-erd?

| | `$erd` (Mermaid) | `$d2-erd` (D2) | `$dbdiagram` (DBML) |
|---|---|---|---|
| Định vị | BA đọc, nhúng inline | Hình đẹp standalone | **Bàn giao dev, gần schema thật** |
| Type | gọn (`string`/`date`) | gọn nghiệp vụ | **kiểu DB thật** (`uuid`/`varchar`/`timestamp`) |
| Xem hình | IDE/Obsidian tự render | mở `.svg` | dbdiagram.io / dbdocs.io (web) |
| Export SQL | ✗ | ✗ | **✓ (Postgres/MySQL/MSSQL)** |
| Index / enum / default | ✗ | ✗ | **✓ (DBML hỗ trợ đủ)** |

> **DBML là artifact kỹ thuật gần dev nhất** — đây là chỗ ĐƯỢC PHÉP chi tiết DB thật (kiểu `uuid`/`varchar`, index, enum, default, note) vì `.dbml` sinh ra để dev import DB. Vẫn KHÔNG hỏi user bằng ngôn ngữ DB (per `ba-conventions.md` Mục 3) — skill TỰ suy kiểu DB hợp lý từ nghĩa nghiệp vụ. Xem [[feedback_erd_technical_ok]].

## Constraints

- **Output cố định** `docs/{feature}/dbdiagram/{feature}.dbml` + `.sql`. KHÔNG ghi vào `srs/`.
- **`--feature` optional** — auto-detect từ ngữ cảnh; file đã tồn tại → tự vào update mode (L2 diff), không cần flag. **Feature chưa có + mô tả data model → tự derive slug + tạo feature** (điểm-vào, `feature-bootstrap.md` nhóm A).
- **AI viết source DBML, KHÔNG viết SQL tay** — `dbml2sql` sinh SQL. Sửa `.dbml` → regen `.sql`.
- **Validate BẮT BUỘC**: `dbml2sql {feature}.dbml --postgres` phải chạy thành công (exit 0) trước khi báo xong. Fail = DBML sai cú pháp → sửa, tối đa 2 lần.
- **L1 approval** trước Write — prose BA-friendly (các bảng + quan hệ bằng từ nghiệp vụ), KHÔNG dump source DBML.
- **KHÔNG L3 iterate** — DBML không render trong chat; user review qua dbdiagram.io hoặc `.sql`.
- **KHÔNG hỏi user kiểu DB** ("varchar hay text?") — skill tự suy kiểu DB từ nghĩa nghiệp vụ user mô tả. User chỉ nói "email là địa chỉ liên hệ", skill tự gán `varchar`.
- **Vietnamese-first** trong Note/comment nghiệp vụ; tên table/column giữ theo `srs/{feature}-erd.md` nếu đã có (thường English snake_case).
- **Per `diagram-selection.md`** — `$dbdiagram` khi cần bàn giao schema dev / export SQL / dbdocs. Nhúng inline BA → `$erd`; hình đẹp standalone → `$d2-erd`.
- **Idempotent** — 1 feature = 1 file `{feature}.dbml`; chạy lại → tự vào update mode (L2 diff), không refuse.

## Inputs

```
$dbdiagram --feature <slug>          # tạo mới (đọc srs/{feature}-erd.md hoặc srs/{feature}-spec.md làm nguồn)
$dbdiagram "<mô tả data model>"      # feature chưa có → derive slug + phỏng vấn entity/quan hệ + tạo (điểm-vào)
```

Feature đã có `.dbml` → skill tự nhận ra và vào update mode (L2 diff), không cần gõ thêm gì.

## Context (dynamic)

Khi chạy, lấy ngày hiện tại từ runtime; quét feature và ERD nguồn hiện có bằng công cụ filesystem của Codex. Kiểm tra lệnh `dbml2sql` trong PATH trước khi ghi.

## Flow runtime

```
User gọi $dbdiagram --feature X   (hoặc $dbdiagram "<mô tả data model>")
   │  dbml2sql chưa cài? → dừng, hướng dẫn: npm install -g @dbml/cli
   │  ┌─ Feature chưa khớp docs/{feature}/ nào (điểm-vào, feature-bootstrap.md nhóm A):
   │  │  arg là mô tả data model → derive feature slug (kebab-case, ASCII, ≤50 ký tự),
   │  │  confirm slug ở L1 (user override được), tạo docs/{feature}/dbdiagram/ khi Write.
   │  │  arg là slug-lạ 1 từ → hỏi "feature mới hay gõ nhầm?" (liệt kê feature hiện có).
   │  └─ KHÔNG bắt user chạy /brainstorm trước.
   ▼
1. Đọc nguồn data model theo thứ tự ưu tiên:
   docs/X/srs/{feature}-erd.md (Mermaid erDiagram — chuyển thẳng sang DBML) → nếu không có:
   docs/X/srs/{feature}-spec.md (Data Entities + Business Rules) → nếu không có:
   phỏng vấn ĐÚNG PHẠM VI schema cần (feature-bootstrap.md nhóm A bước 3), gom 1 batch
   business-language (KHÔNG hỏi kiểu DB): các entity · attribute nghiệp vụ mỗi entity
   (tên + nghĩa) · quan hệ (cardinality 1:1 / 1:N / N:N). No-re-ask cái nguồn đã có.
   Mô tả mơ hồ dù có nguồn → PHẢI hỏi clarifying, KHÔNG tự bịa attribute/cardinality.
   ▼
2. Trích: table → column (tên + kiểu DB skill tự suy + pk/unique/not null/ref), quan hệ (Ref)
   ▼
3. Viết source .dbml (công thức bên dưới)
   ▼
4. L1 plan preview (prose: N table, M quan hệ). User Y → tiếp
   ▼
5. Write {feature}.dbml → dbml2sql regen {feature}.sql (validate fail → sửa, tối đa 2 lần)
   ▼
6. Update dbdiagram/{feature}-dbdiagram-index.md — set env note trước Write,
   │  chạy `activity-log.mjs` để append activity.log.
   ▼ Báo user (mở dbdiagram.io, paste .dbml — hoặc dùng .sql).
```

## Cách xây (build step-by-step)

### Bước 1 — Skeleton dbdiagram/ nếu chưa có

`docs/{feature}/dbdiagram/{feature}-dbdiagram-index.md` (type `dbdiagram-index`): frontmatter chuẩn + bảng table (tên / số cột / PK / FK ra). Lifecycle inherit `srs/{feature}-spec.md`.

### Bước 2 — Công thức viết source .dbml

```dbml
// Schema {feature} — nguồn: srs/{feature}-erd.md (nếu có)

Table users {
  id uuid [pk]
  email varchar [unique, not null, note: 'địa chỉ liên hệ']
  display_name varchar [note: 'tên hiển thị']
  created_at timestamp [default: `now()`]
}

Table decks {
  id uuid [pk]
  user_id uuid [ref: > users.id, note: 'bộ thẻ của học viên nào']
  name varchar [not null]
  created_at timestamp
}

Enum card_recall {
  forgot
  fuzzy
  remembered
}

Table review_logs {
  id uuid [pk]
  card_id uuid [ref: > cards.id]
  recall card_recall
  reviewed_at timestamp

  Indexes {
    (card_id, reviewed_at) [name: 'idx_review_card_time']
  }
}
```

**Quy tắc:**
- **1 entity = 1 `Table` snake_case số nhiều** (`users`, `decks`, `review_logs`) — convention DB.
- **Kiểu DB skill TỰ suy** từ nghĩa nghiệp vụ: `uuid` (khoá), `varchar` (text ngắn), `text` (dài), `int`/`bigint`, `decimal` (tiền), `boolean`, `timestamp` (ngày giờ), `date`. KHÔNG hỏi user.
- **PK**: `[pk]`. **FK/quan hệ**: `[ref: > other_table.id]` (`>` = nhiều-một, `<` = một-nhiều, `-` = một-một). Có thể tách dòng `Ref:` riêng cuối file cũng được.
- **Constraint**: `[unique]`, `[not null]`, `[default: ...]` (backtick cho biểu thức `\`now()\``).
- **Enum**: khai `Enum name { val1 val2 }` rồi cột `status card_recall`. Đây là chỗ DBML hơn Mermaid — enum là first-class.
- **Index**: block `Indexes { (col_a, col_b) [name: '...'] }` trong Table. CHỈ thêm index khi nghiệp vụ rõ (unique idempotency, truy vấn thường) — đừng bịa index vô căn cứ.
- **Note nghiệp vụ**: `[note: 'tiếng Việt']` trên column, hoặc `Note: 'tiếng Việt'` trong Table — đây là chỗ ghi nghĩa nghiệp vụ, render lên dbdocs.io.

### Bước 3 — Validate + regen SQL

```bash
dbml2sql docs/{feature}/dbdiagram/{feature}.dbml --postgres -o docs/{feature}/dbdiagram/{feature}.sql
# fail (exit≠0) → đọc lỗi cú pháp DBML (thường ref sai tên table, enum chưa khai, thiếu dấu), sửa .dbml, chạy lại.
```

## L1 plan preview (mẫu BA-friendly)

> Em sẽ tạo schema database (DBML) feature **{feature}** tại `docs/{feature}/dbdiagram/{feature}.dbml` (+ SQL `.sql`):
>
> **Các bảng ({N}):** {liệt kê: users, decks, cards, review_logs...}
> **Quan hệ chính ({M}):** {vd "users có nhiều decks", "decks chứa nhiều cards", "cards có nhiều review_logs"}
> {**Enum/Index** nếu có: "trạng thái ôn (quên/mơ hồ/nhớ)", "index (card_id, reviewed_at)"}
>
> Nguồn: {srs/{feature}-erd.md | srs/{feature}-spec.md | bạn cung cấp}.
> Import: paste vào dbdiagram.io để xem sơ đồ, hoặc dùng `.sql` để tạo DB.
>
> **Ghi nhận:** activity log "{note}".
>
> Apply? (Y / sửa)

## Output report

```
✅ DBML schema: docs/{feature}/dbdiagram/{feature}.dbml (+ {feature}.sql)
   Bảng: {N} | Quan hệ: {M} | Enum: {E} | dbml2sql: OK

Xem sơ đồ: mở dbdiagram.io → paste nội dung {feature}.dbml (hoặc import lên dbdocs.io).
Tạo DB:    dùng {feature}.sql (PostgreSQL).
Cần sửa?   $dbdiagram --feature {feature} (skill tự vào update mode)
```

## Gotchas

- **dbml2sql chưa cài** → dừng, in 1 dòng: `npm install -g @dbml/cli` (cài 1 lần, như mmdc/d2). KHÔNG ghi file rồi bỏ mặc không validate.
- **DBML KHÔNG có đuôi .dbdiagram** — dbdiagram.io là tên *công cụ*, ngôn ngữ là DBML đuôi `.dbml`. Lệnh skill là `$dbdiagram` (gợi nhớ công cụ) nhưng file sinh ra là `.dbml` (import được). Đừng đặt đuôi `.dbdiagram` — toolchain không nhận.
- **Đây là tầng ĐƯỢC chi tiết DB thật** — khác `$erd`/`$d2-erd` (type gọn). DBML dùng `uuid`/`varchar`/`timestamp`, index, enum, default. Vì `.dbml` sinh ra để dev import DB. Nhưng VẪN không hỏi user kiểu DB — skill tự suy (xem [[feedback_erd_technical_ok]]).
- **Ref direction** — `[ref: > users.id]` trên cột `user_id` của bảng `decks` nghĩa "nhiều decks trỏ 1 user" (nhiều-một). Nhầm chiều `<`/`>` → sơ đồ vẽ ngược cardinality. Nhớ: `>` là "về phía một".
- **Enum phải khai TRƯỚC khi dùng** — cột `status order_status` mà chưa có `Enum order_status {...}` → dbml2sql fail. Khai enum ở đầu hoặc cuối file đều được, miễn có.
- **Nguồn tốt nhất là srs/{feature}-erd.md** — nếu có, chuyển 1-1 (mỗi entity Mermaid → 1 Table DBML). Kiểu DB: nâng từ type gọn của Mermaid lên kiểu DB thật (`string id PK` → `id uuid [pk]`). Đừng bịa table ngoài spec.
- **Index đừng bịa** — chỉ thêm index có căn cứ nghiệp vụ (unique để chống trùng, cột hay lọc/sắp xếp). Không rải index bừa "cho có".
- **Update mode (feature đã có .dbml)** → Read source cũ, L2 diff, re-validate + regen .sql sau khi user Y.
- **Đừng over-dùng** — feature nhỏ 2-3 bảng chỉ cần xem quan hệ → `$erd` đủ. `$dbdiagram` phát huy khi cần bàn giao dev, export SQL, hoặc schema nhiều enum/index.

## References

- @../../rules/ba-conventions.md
- @../../rules/approval-gate.md
- @../../rules/naming-conventions.md
- @../../rules/changelog.md
- @../../rules/diagram-selection.md
- @../../rules/feature-bootstrap.md
- @./references/example-dbdiagram.dbml (mẫu chuẩn đã validate qua dbml2sql)
