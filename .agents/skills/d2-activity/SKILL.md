---
name: d2-activity
description: Dùng khi cần vẽ activity/flowchart diagram ĐẸP đứng riêng (nhiều nhánh quyết định, swimlane) bằng D2 — layout ELK gọn hơn Mermaid rõ rệt. Kích hoạt bằng `$d2-activity "<mô tả quy trình>" --feature <slug>`. Khác `$activity` (Mermaid inline vào flows.md, dàn xấu khi nhiều nhánh), `$d2-erd` (ERD), `$d2-architect` (kiến trúc hệ thống) và `$bpmn` (chuẩn OMG, import Camunda).
---

# $d2-activity — Activity / Flowchart Diagram (D2, layout ELK)

> Họ skill D2: `$d2-activity` (flow này) · `$d2-erd` (data model) · `$d2-architect` (kiến trúc hệ thống). Cả 3 dùng chung `d2-render.mjs` ở `.agents/skills/d2-activity/`.

## Goal

Vẽ 1 quy trình nghiệp vụ nhiều nhánh (decision/parallel/loop/swimlane) thành diagram **đẹp, gọn, đường vuông góc không đè** bằng [D2](https://d2lang.com) + layout engine **ELK**. Đứng hoàn toàn riêng, KHÔNG trộn vào `srs/{feature}-flows.md`.

Output trong `docs/{feature}/d2/`:
1. `{process-slug}.d2` — **source** D2 do AI viết (text, version git được). Sửa cái này khi gọi lại skill (tự vào update mode).
2. `{process-slug}.svg` — render sẵn (mở bằng browser/IDE/Obsidian, không cần server).

Plus `d2/{feature}-d2-index.md` (metadata + bảng process).

## Tại sao D2 thay vì Mermaid?

Mermaid (`$activity`) dùng layout dagre — với flow >5 nhánh + nhiều điểm hội tụ, nó dàn mũi tên cong tùy tiện, cắt chéo qua node, chỗ merge chụm loạn. **Bạn mô tả logic, engine tự dàn, bạn chịu kết quả** — không kiểm soát được.

D2 + ELK cho: đường **orthogonal gom máng**, node **thẳng hàng cột/hàng**, **swimlane thật** (không hack subgraph), phân biệt shape+màu (decision ◇ / start-end ○ / process ▭). Cùng 1 flow, D2 sạch hơn Mermaid thấy rõ bằng mắt.

> Giữ `$activity` (Mermaid) cho trường hợp cần **nhúng inline** render tự động trên GitHub/Obsidian. Dùng `$d2-activity` khi cần **bản đẹp standalone** để stakeholder xem / export.

## Constraints

- **Output cố định** `docs/{feature}/d2/{slug}.d2` + `.svg`. KHÔNG ghi vào `flows.md`. KHÔNG flag layout/theme/direction (đã chốt ELK + theme neutral trong `d2-render.mjs`).
- **`--feature` optional** — auto-detect từ ngữ cảnh/feature đang làm dở; mơ hồ mới hỏi. File đã tồn tại → tự vào update mode, không cần flag. **Feature chưa có + arg là mô tả quy trình → tự derive slug + tạo feature** (điểm-vào, xem `feature-bootstrap.md` nhóm A). Mọi thứ khác suy luận từ mô tả (theo flag-diet).
- **AI viết source .d2, KHÔNG tự tính toạ độ** — ELK lo layout. Vai trò AI = mô tả đúng nghiệp vụ (node/nhánh/lane), giống viết Mermaid.
- **Render qua `d2-render.mjs`** — KHÔNG gọi `d2`/Chrome trực tiếp trong skill (script lo path + flag).
- **Compile phải PASS** trước khi báo xong. Fail cú pháp → sửa source, KHÔNG để .svg hỏng/thiếu.
- **L1 approval** trước Write — prose BA-friendly (xem `ba-conventions.md` Mục 5), mô tả bằng từ nghiệp vụ (các bước / nhánh quyết định / vai trò), KHÔNG dump source D2.
- **KHÔNG L3 iterate** — D2 không render trong chat; user review từ file .svg (theo `approval-gate.md` + memory skip-L3-mermaid, áp cả D2).
- **Vietnamese-first** trong label (D2 hỗ trợ Unicode); keyword cú pháp English.
- **Per `diagram-selection.md`** — `$d2-activity` khi cần activity đẹp standalone. Cần chuẩn OMG/import Camunda → `$bpmn`. Cần nhúng inline auto-render GitHub → `$activity`.
- **Idempotent** — `d2/{feature}-d2-index.md` track process; trùng slug → tự vào update mode (L2 diff), không refuse.

## Inputs

```
$d2-activity "<mô tả quy trình>" --feature <slug>          # tạo diagram mới
$d2-activity --feature <slug>                              # interactive: hỏi vẽ quy trình nào
$d2-activity "<mô tả quy trình>"                           # feature chưa có → derive slug + phỏng vấn + tạo (điểm-vào)
```

Trùng slug đã tồn tại → skill tự nhận ra và vào update mode (L2 diff), không cần gõ thêm gì.

## Context (dynamic)

Khi chạy, lấy ngày hiện tại từ runtime; quét feature và D2 index hiện có bằng công cụ filesystem của Codex. Kiểm tra lệnh `d2` trong PATH trước khi ghi.

## Flow runtime (skill chạy thế nào)

```
User gọi $d2-activity "<mô tả>" --feature X
   │
   ▼
1. Resolve feature + process slug (verb-object kebab-case từ mô tả)
   │  d2 chưa cài? → dừng, hướng dẫn 1 dòng install (xem Context)
   │  ┌─ Feature chưa khớp docs/{feature}/ nào (điểm-vào, feature-bootstrap.md nhóm A):
   │  │  arg là mô tả quy trình thô → derive feature slug từ mô tả (kebab-case, ASCII,
   │  │  ≤50 ký tự), confirm slug ở L1 (user override được), tạo docs/{feature}/d2/ khi Write.
   │  │  arg là slug-lạ 1 từ → hỏi "feature mới hay gõ nhầm?" (liệt kê feature hiện có).
   │  └─ KHÔNG bắt user chạy /brainstorm trước.
   ▼
2. Đọc context nghiệp vụ:
   │  ┌─ Đã có feature: đọc docs/X/srs/{feature}-spec.md, usecases/uc-*.md (nếu có) → hiểu bước,
   │  │  nhánh error, business rule để vẽ ĐÚNG (không bịa), no-re-ask cái đã có.
   │  └─ CHƯA có nguồn (feature mới hoặc feature cũ thiếu spec/UC): phỏng vấn ĐÚNG PHẠM VI
   │     activity cần (feature-bootstrap.md nhóm A bước 3), gom 1 batch business-language
   │     (KHÔNG hỏi DB/SDK): các bước tuần tự · điểm rẽ nhánh (câu hỏi quyết định + nhánh) ·
   │     vai trò/lane (nếu đa vai) · loop. Thiếu ý nào hỏi ý đó, không lan man như /brainstorm.
   │  Mô tả mơ hồ dù feature đã có nguồn (process description quá ngắn, không rõ nhánh/vai
   │  trò, nguồn đọc được cũng thiếu chi tiết) → PHẢI hỏi clarifying trước khi generate,
   │  KHÔNG tự suy đoán. Đây không phải bootstrap phỏng vấn — chỉ 1-2 câu hỏi ngắn bù chỗ thiếu.
   ▼
3. Xác định: bước tuần tự | nhánh quyết định (◇) | vai trò/lane | loop/parallel
   ▼
3.5. Xác nhận lane trước khi vẽ (BẮT BUỘC nếu ≥1 lane detect được từ mô tả/nguồn) — in ra
   │  "Phát hiện {N} vai trò tham gia: {list}. Đủ chưa?" trước khi sang bước 4. Actor bị ẩn/
   │  ngụ ý trong câu văn (không gọi tên rõ) dễ bị bỏ sót nếu chỉ tự suy luận rồi vẽ luôn.
   ▼
4. Viết source .d2 (công thức bên dưới) — AI chỉ mô tả cấu trúc, KHÔNG toạ độ
   ▼
5. L1 plan preview (prose BA-friendly: N bước, M nhánh, K lane). User Y → tiếp
   ▼
6. Write {slug}.d2 → chạy d2-render.mjs → sinh {slug}.svg
   │  compile fail? → sửa source, render lại (tối đa 2 lần), rồi mới báo
   ▼
7. Update d2/{feature}-d2-index.md (thêm row) — env note → activity.log. Báo user mở .svg xem.
```

## Cách xây (build step-by-step)

### Bước 1 — Skeleton d2/ nếu chưa có

`docs/{feature}/d2/{feature}-d2-index.md` (type `d2-index`): frontmatter chuẩn + bảng process (slug / title / decisions / lanes / updated). Lifecycle inherit từ `srs/{feature}-spec.md`.

### Bước 2 — Công thức viết source .d2

```
direction: down        # dọc; đổi 'right' nếu flow ngắn-rộng

# Node — đặt shape + màu theo LOẠI (giúp đọc nhanh):
start: <label>    { shape: circle;  style.fill: "#E8F0FE" }   # bắt đầu
end:   <label>    { shape: circle;  style.fill: "#E6F4EA" }   # kết thúc
dec:   <hỏi gì?>  { shape: diamond; style.fill: "#FFF4E5" }   # quyết định
step:  <hành động>                                            # bước xử lý (mặc định ▭)

# Cạnh — label nhánh trên mũi tên:
start -> dec
dec -> stepA: Có
dec -> stepB: Không
stepA -> end
stepB -> end
```

**Swimlane (nhiều vai trò)** — dùng container, ELK dàn lane thật:
```
User: {
  u1: Gửi yêu cầu
  u2: Nhận kết quả
}
CSKH: {
  c1: Xem yêu cầu
  approve: Duyệt? { shape: diamond }
}
User.u1 -> CSKH.c1
CSKH.approve -> User.u2: Đã duyệt
```

**Quy tắc:**
- Label tiếng Việt tự nhiên; xuống dòng bằng `\n` trong label dài.
- Decision >3 nhánh: cứ để nhiều cạnh ra từ 1 diamond (D2 xử lý được, khác Mermaid).
- Loop `A -> B -> A` OK; ≥2 loop chồng → tách 2 diagram.
- KHÔNG set width/height/toạ độ — để ELK lo.

### Bước 3 — Render + verify

```bash
node .agents/scripts/d2-render.mjs docs/{feature}/d2/{slug}.d2
# fail compile → đọc lỗi, sửa source, chạy lại. KHÔNG báo xong khi .svg thiếu.
```

## L1 plan preview (mẫu BA-friendly)

> Em sẽ tạo diagram quy trình **{tên}** tại `docs/{feature}/d2/{slug}.d2` (+ ảnh `.svg` xem sẵn):
>
> **Nội dung:**
> - {N} bước xử lý, {M} nhánh quyết định (vd "Kết quả đánh giá?", "interval ≥ 30 ngày?")
> - {K} vai trò/lane: {liệt kê nếu có}
> - Điểm bắt đầu: {...}; kết thúc: {...}
>
> **Vẽ bằng D2 + ELK** cho đường gọn, không đè (đẹp hơn Mermaid khi nhiều nhánh).
>
> **Ghi nhận:** activity log "{note}".
>
> Apply? (Y / sửa)

## Output report

```
✅ D2 activity diagram: docs/{feature}/d2/{slug}.svg
   Bước: {N} | Nhánh quyết định: {M} | Lane: {K}

Mở {slug}.svg bằng browser/IDE/Obsidian để xem (đường vuông góc, gom máng).
Cần sửa? $d2-activity "<thay đổi>" --feature {feature} (skill tự vào update mode)
```

## Gotchas

- **d2 chưa cài** → dừng ngay bước 1, in đúng 1 dòng install. KHÔNG ghi file rỗng.
- **QUOTE label có ký tự đặc biệt** (gotcha hay gặp nhất) — D2 hiểu `[] {} / () :` là cú pháp. Label chứa các ký tự này PHẢI bọc `"..."`. Vd: `A -> B: "POST /review {id}"` (đúng) vs `A -> B: POST /review {id}` (compile fail). Tiếng Việt/space/dấu → OK không cần quote; chỉ quote khi có ký tự cấu trúc.
- **Compile fail** — đọc lỗi d2 (chỉ rõ dòng:cột), thường là thiếu quote (xem trên) hoặc thiếu `:` trước label cạnh. Sửa, render lại.
- **SVG mở ra trắng** → thường do label rỗng hoặc node mồ côi. Kiểm mọi node có ít nhất 1 cạnh.
- **PNG (khi cần export)** → `d2-render.mjs {file}.d2 --png` (qua Chrome puppeteer-cache). Mặc định chỉ SVG cho nhẹ. Script tự đọc `viewBox` trong SVG để set đúng `--window-size` Chrome (khớp kích thước diagram thật) — **KHÔNG** đổi sang gọi D2 native PNG (`d2 file.d2 file.png`) để "đơn giản hoá": D2 v0.7.1 native PNG export phụ thuộc Playwright driver tự tải, và bản driver D2 cần (`playwright-1.47.2-mac-arm64.zip`) đã bị gỡ khỏi mọi CDN mirror của Playwright (404 vĩnh viễn tại thời điểm 2026-07, không phải lỗi mạng tạm) — Chrome/Puppeteer sẵn có là đường ổn định duy nhất trên môi trường này.
- **Đừng tự chốt lane từ heuristic** — bước 3.5 bắt buộc hỏi user xác nhận danh sách vai trò detect được trước khi generate, vì suy luận từ mô tả dễ bỏ sót actor bị ẩn/ngụ ý trong câu văn.
- **Đừng over-engineer** — flow 3-4 bước tuyến tính không cần diagram; numbered steps đủ.
- **Không trộn với /activity** — nếu feature đã có activity trong flows.md, /d2 vẫn ghi riêng d2/, KHÔNG xoá/sửa flows.md.
- **Update mode (slug đã tồn tại)** → Read source .d2 cũ, L2 diff phần sửa, re-render sau khi user Y.

## References

- @../../rules/ba-conventions.md
- @../../rules/approval-gate.md
- @../../rules/naming-conventions.md
- @../../rules/changelog.md
- @../../rules/diagram-selection.md
- @../../rules/feature-bootstrap.md
