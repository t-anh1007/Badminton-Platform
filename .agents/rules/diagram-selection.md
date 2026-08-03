---
paths:
  - ".agents/skills/sequence/**"
  - ".agents/skills/activity/**"
  - ".agents/skills/activity-swimlane/**"
  - ".agents/skills/d2-activity/**"
  - ".agents/skills/d2-erd/**"
  - ".agents/skills/d2-architect/**"
  - ".agents/skills/state/**"
  - ".agents/skills/erd/**"
  - ".agents/skills/dbdiagram/**"
  - ".agents/skills/bpmn/**"
  - ".agents/skills/usecase-diagram/**"
  - "docs/**/srs/*.md"
---

# Diagram Selection — Khi nào dùng diagram nào

> Guide cho IT-BA: chọn đúng loại diagram cho từng tình huống. Áp dụng khi viết `/srs`, `$brainstorm`, hoặc khi user hỏi "vẽ diagram cho X".

## Decision matrix

| Tình huống nghiệp vụ | Diagram type | Skill | Output file (1 cố định) | Lý do |
|---|---|---|---|---|
| Tương tác nhiều actor theo thời gian (login, payment, webhook, OAuth callback) | **Sequence** | `$sequence` | `docs/{feature}/srs/{feature}-flows.md` (append section) | Trục thời gian + message giữa actors rõ ràng |
| Entity có nhiều state + transition (Account: unverified → verified → locked) | **State** | `$state` | `docs/{feature}/srs/{feature}-states.md` (append section per entity) | Force user nghĩ về mọi transition + trigger |
| **DEFAULT cho quy trình nghiệp vụ đa vai trò** (nhiều decision/lane, tương tác chéo — refund, onboarding, duyệt nhiều cấp) | **Activity swimlane (PlantUML)** ⭐ | `$activity-swimlane` | `docs/{feature}/srs/{feature}-{slug}-swimlane.svg` + section nhúng trong `flows.md` | `\|Lane\|` giữ lane thẳng cột cố định, node nhảy lane theo actor — swimlane THẬT. Mermaid subgraph xô lệch, D2/ELK kéo lane thành "mì Ý" khi nhiều cross-edge. **Đây là lựa chọn mặc định cho activity đa-vai.** |
| Flow **đơn giản 1-2 vai trò** (ít hoặc không cross-lane) VÀ cần **nhúng inline auto-render** GitHub/Obsidian (không phải embed ảnh) | **Activity / Flowchart (Mermaid)** | `$activity` | `docs/{feature}/srs/{feature}-flows.md` (cùng file sequence) | Nhúng thẳng code ` ```mermaid ` vào MD, GitHub/Obsidian tự render. CHỈ hợp flow gọn — nhiều lane/cross-edge thì subgraph xô lệch, dùng `$activity-swimlane`. |
| Activity cần **hình ĐẸP standalone** không cần swimlane thật (nhiều nhánh, cho stakeholder xem/export) | **Activity / Flowchart (D2)** | `$d2-activity` | `docs/{feature}/d2/{slug}.svg` (đứng riêng) | Layout ELK gọn hơn Mermaid rõ rệt: đường vuông góc, không đè. Nhưng lane xô lệch khi nhiều cross-edge → luồng đa-vai nhiều tương tác vẫn ưu tiên `$activity-swimlane`. |
| Quy trình đa vai trò cần CHUẨN OMG hoặc import tool BPM (Camunda/Bizagi) — onboarding, duyệt nội dung, approval nhiều phòng ban | **BPMN 2.0** | `$bpmn` | `docs/{feature}/bpmn/{process}.bpmn` + `_viewer.html` | Ký hiệu chuẩn (◇gateway ○event \|lane\|), file `.bpmn` import được workflow engine |
| High-level scope: actors + use cases (kickoff stakeholder, system boundary), package grouping khi nhiều UC | **Use Case diagram (PlantUML)** | `$usecase-diagram` | `docs/{feature}/usecases/{feature}-usecase-diagram.puml` + `.svg` (ảnh + bảng Actors/Relationships nhúng vào `{feature}-usecase-index.md`, KHÔNG còn `.md` wrapper riêng) | Native `actor`/`usecase`/`package`, đúng UML chuẩn hơn Mermaid workaround cũ |
| Data model + relationship — cần **nhúng inline** GitHub/Obsidian | **ER diagram (Mermaid)** | `$erd` | `docs/{feature}/srs/{feature}-erd.md` | Entity + attributes + cardinality, nhúng thẳng MD |
| Data model — cần **hình ĐẸP standalone** (PK/FK rõ, nhiều entity, cho stakeholder/export) | **ER diagram (D2)** | `$d2-erd` | `docs/{feature}/d2-erd/{feature}.svg` (đứng riêng) | `sql_table` header đậm + PK/FK canh phải + quan hệ nhãn nghiệp vụ; đẹp hơn Mermaid `erDiagram` |
| Data model — cần **bàn giao dev / export SQL / dbdocs** (kiểu DB thật, enum, index) | **Schema (DBML)** | `$dbdiagram` | `docs/{feature}/dbdiagram/{feature}.dbml` (+ `.sql`) | Tầng gần dev nhất: DBML import dbdiagram.io/dbdocs.io, `dbml2sql` export SQL thật. Enum/index/default là first-class (Mermaid/D2 không có) |
| **Kiến trúc hệ thống** (component/service/DB/dịch vụ ngoài lồng nhau, bức tranh bối cảnh) | **Architecture (D2)** | `$d2-architect` | `docs/{feature}/d2-architect/{slug}.svg` hoặc `_shared/` | Nested container + shape cylinder/person; Mermaid không vẽ được đẹp loại này |

## Abstraction level — KHÔNG trộn diagram với UC

**Use Case (UC) = business black-box** (actor goal + expected result + numbered steps). Mở UC là đọc *prose nghiệp vụ*, KHÔNG đọc technical detail.

**Sequence/State = technical white-box** (component call, internal state). Trộn vào UC → stakeholder nghiệp vụ lạc, dev vẫn phải nhảy file.

→ **Sequence + State KHÔNG embed UC.** Đặt riêng trong `srs/{feature}-flows.md` (sequence) và `srs/{feature}-states.md` (state). UC link 1 chiều xuống screens (Mục f); flow/state link ngược về UC (metadata "Related UC").

**Activity** là exception duy nhất được phép inline UC Mục e — vì activity cùng level abstraction business (diễn tả quy trình nghiệp vụ, không phải call component). Mặc định UC Mục e vẫn skip; chỉ fill khi process có ≥3 decision/parallel.

## Khi nào dùng diagram nào (chi tiết)

### Sequence diagram — `$sequence`

**Dùng khi:**
- Có ≥2 actors tương tác qua thời gian (user, backend, third-party).
- Quan tâm "ai gọi ai, response gì, order như nào".
- Có async / callback / webhook.
- Flow có nhánh error path (alt/opt).

**KHÔNG dùng khi:**
- Chỉ có 1 actor (vẽ activity hợp hơn).
- Cần show state của entity tại từng moment (vẽ state diagram).
- High-level scope (vẽ use case diagram).

### State diagram — `$state`

**Dùng khi:**
- Có entity với ≥3 trạng thái (Account, Order, Subscription, Session, Ticket).
- Có transition rule cụ thể (trigger + condition).
- Có invalid transitions cần document (vd "không quay lại từ `paid` về `pending`").
- State machine table trong brainstorm Mục 6.3 đã phức tạp (>5 rows) → upgrade sang state diagram visual.

**KHÔNG dùng khi:**
- Entity chỉ 2 state (on/off) — bảng đủ, không cần diagram.
- Quan tâm interaction thay vì state (vẽ sequence).

### Activity — 3 lựa chọn engine (chọn theo số vai trò + nhu cầu nhúng)

> Cùng "activity diagram" nhưng 3 engine, định vị KHÁC nhau. **Mặc định cho quy trình nghiệp vụ đa vai trò là `$activity-swimlane` (PlantUML)** — swimlane thật. Chỉ dùng Mermaid `$activity` cho flow gọn cần nhúng inline.

#### Activity swimlane (PlantUML) — `$activity-swimlane` ⭐ DEFAULT đa-vai

**Dùng khi (đây là lựa chọn mặc định cho activity đa vai trò):**
- Quy trình có **≥2 vai trò/lane** làm bước khác nhau (Khách/Hệ thống/Agent/Quản lý...) — cần thấy rõ "ai làm bước nào".
- Nhiều **tương tác chéo lane** (bước nhảy qua lại giữa các vai) — đây là chỗ Mermaid subgraph xô lệch, D2 kéo lane thành "mì Ý", còn PlantUML `|Lane|` giữ lane thẳng cột cố định.
- Business process nhiều decision branch (≥3 if/else) + loop (retry, polling) trong bối cảnh đa vai.
- Mục 6.1 Decision Points trong brainstorm có ≥5 decisions kèm nhiều vai → dùng swimlane.

**KHÔNG dùng khi:**
- Flow đơn giản tuyến tính (numbered steps đủ) hoặc chỉ 1 vai không cross-lane + cần nhúng inline → `$activity` Mermaid.
- Cần chuẩn OMG / import Camunda/Bizagi → `$bpmn`.
- Nội dung nhạy cảm (render gửi qua plantuml.com) → cân nhắc `$activity` local.

#### Activity / Flowchart (Mermaid) — `$activity` (thứ yếu — flow gọn + nhúng inline)

**Dùng khi (phạm vi hẹp lại):**
- Flow **đơn giản 1-2 vai trò**, ít hoặc không có tương tác chéo lane.
- VÀ cần **nhúng inline auto-render** thẳng trong MD trên GitHub/Obsidian (không muốn embed ảnh `.svg` như PlantUML/D2).
- Minh hoạ nhanh trong tài liệu BA, không cần swimlane thật.

**KHÔNG dùng khi:**
- Quy trình đa vai trò nhiều cross-lane → subgraph xô lệch, dùng `$activity-swimlane`.
- Flow tuyến tính đơn giản (sequence hoặc numbered steps đủ).
- Tương tác async multi-actor theo thời gian (vẽ sequence).

#### Activity đẹp standalone (D2) — `$d2-activity`

**Dùng khi:** cần hình đẹp để export/stakeholder xem, layout ELK đường vuông góc không đè, KHÔNG bắt buộc swimlane thật. Lane nhiều cross-edge vẫn ưu tiên `$activity-swimlane` (D2 kéo lane xa nhau).

### BPMN 2.0 — `$bpmn`

**Dùng khi:**
- Quy trình **đa vai trò** (≥2 lane: Author/Reviewer/System, nhiều phòng ban) cần thể hiện rõ "ai làm bước nào".
- Cần **ký hiệu chuẩn OMG** — gateway ◇, event ○, message flow — vì stakeholder/đối tác quen đọc BPMN.
- Cần file **import được tool BPM** (Camunda Modeler, Bizagi, Signavio, draw.io) để chạy workflow engine hoặc edit tiếp.
- Quy trình approval/onboarding/duyệt nội dung phức tạp, nhiều nhánh + loop quay lại.

**KHÔNG dùng khi:**
- Quy trình đa vai trò nhưng chỉ để mô tả nghiệp vụ trong SRS (không cần import workflow engine) → dùng `$activity-swimlane` (PlantUML swimlane thật, nhẹ hơn, không cần XML/engine).
- Flow gọn cần nhúng inline → `$activity` (Mermaid).
- Tương tác async theo thời gian → `$sequence`.

**`$activity-swimlane` (PlantUML) vs `$bpmn` (OMG) — chọn nhanh (cả 2 đều swimlane đa-vai):**

| | `$activity-swimlane` | `$bpmn` |
|---|---|---|
| Engine | PlantUML `\|Lane\|` (render plantuml.com) | BPMN 2.0 XML (bpmn-js + auto-layout) |
| Swimlane | Thật, lane thẳng cột | Thật, pool/lane chuẩn OMG |
| Output | `.puml`+`.svg` trong `srs/` + nhúng ảnh vào `flows.md` | `bpmn/{process}.bpmn` + `_viewer.html` |
| Ký hiệu | activity UML (◇ decision, ○ start/end) | chuẩn OMG thật (◇gateway ○event message flow) |
| Import Camunda/Bizagi | ✗ | ✓ (file .bpmn) |
| Edit kéo-thả | ✗ (sửa .puml text) | ✓ (editor bpmn-js) |
| Khi nào | mô tả nghiệp vụ đa-vai trong tài liệu BA, không cần engine | cần chuẩn OMG / import tool BPM / kéo-thả sửa |

→ Đa vai trò mô tả nghiệp vụ thường ngày → `$activity-swimlane` (nhẹ, không cần XML/engine). Chỉ lên `$bpmn` khi thật sự cần chuẩn OMG, import workflow engine, hoặc editor kéo-thả.

### Use case diagram — `$usecase-diagram`

**Dùng khi:**
- Kickoff feature, cần show "ai làm gì với system" ở 1 hình.
- Stakeholder non-technical cần overview scope.
- Feature có ≥3 actors + ≥3 use cases — bảng text không hiệu quả bằng visual.
- Cần thể hiện `<<include>>` / `<<extend>>` relationship giữa use cases.

**KHÔNG dùng khi:**
- Chỉ 1 actor + 1 use case (overkill).
- Cần detail flow của 1 use case cụ thể (vẽ sequence hoặc activity).

### ERD — `$erd`

**Dùng khi:**
- Có ≥2 entity với relationship.
- Cần show cardinality (1:1, 1:N, N:N).
- Data model cần share với dev/architect.

**KHÔNG dùng khi:**
- Chỉ 1 entity (bảng attributes đủ).
- Quan tâm behavior thay vì data (vẽ state/sequence).

### Data model — 3 lựa chọn (chọn theo mục đích + độ gần dev)

> Cùng "data model" nhưng 3 tầng: `$erd` (Mermaid, BA đọc, nhúng inline) → `$d2-erd` (D2, hình đẹp standalone) → `$dbdiagram` (DBML, gần dev nhất, export SQL). Chọn theo *ai xem + làm gì với nó*.

| | `$erd` | `$d2-erd` | `$dbdiagram` |
|---|---|---|---|
| Ai xem | BA/stakeholder trong tài liệu | stakeholder, export đẹp | **dev/DBA, bàn giao** |
| Type | gọn (`string`/`date`) | gọn nghiệp vụ | **kiểu DB thật** (`uuid`/`varchar`) |
| Enum/index/default | ✗ | ✗ | **✓ first-class** |
| Export SQL | ✗ | ✗ | **✓ (`dbml2sql`)** |
| Xem hình | IDE/Obsidian inline | mở `.svg` | dbdiagram.io / dbdocs.io |

→ Nhúng vào doc BA đọc → `$erd`. Cần hình đẹp cho slide/export → `$d2-erd`. Cần **bàn giao schema cho dev, export SQL, hoặc dbdocs** (nhiều enum/index) → `$dbdiagram`.

## Kết hợp nhiều diagram cho 1 feature

Feature phức tạp thường cần **nhiều diagram bổ trợ**:

| Feature ví dụ | Set diagram |
|---|---|
| Authentication (login + signup + OAuth + verify) | Use case (overview) + Sequence (mỗi flow) + State (Account lifecycle) |
| Payment / Checkout | Use case + Sequence (payment flow) + Activity-swimlane (refund workflow đa-vai) + State (Order status) + ERD (Order/Transaction/Refund) |
| Approval workflow | Use case + Activity-swimlane (workflow duyệt nhiều cấp) + State (Request status) |
| Notification system | Use case + Sequence (delivery) + State (Notification status) |

**Default trong SRS `flows.md`:** chỉ vẽ những diagram thực sự cần. Đừng vẽ diagram cho mọi flow — nguyên tắc "diagram phục vụ communication, không phải để show".

## Mermaid native support

| Diagram | Mermaid syntax | Render OK trong IDE/Obsidian/GitHub? |
|---|---|---|
| Sequence | `sequenceDiagram` | ✓ |
| State | `stateDiagram-v2` | ✓ |
| Activity / Flowchart | `flowchart TB` / `flowchart LR` | ✓ |
| **Use case** | **KHÔNG phải Mermaid** | PlantUML native (`actor`/`usecase`/`package`) từ 2026-07-11 — trước đó Mermaid `flowchart` workaround. Render qua server `plantuml.com` (`.svg`), không render trực tiếp Obsidian/GitHub (cần plugin, giống D2). |
| ERD | `erDiagram` | ✓ |
| **BPMN** | **KHÔNG phải Mermaid** | XML đầy đủ (semantic + BPMNDiagram swimlane). Render qua bpmn-js trong `_viewer.html` (double-click). Không render Obsidian/GitHub. |

Mọi diagram skill dùng mermaid (trừ `$bpmn`), **skip L3 iterate** (chat không render — review từ rendered file/viewer).

## Mermaid syntax safety (CRITICAL — tránh parse error)

Mermaid parser strict với 1 số ký tự trong node label. Vi phạm → cả file diagram crash render (export HTML/PDF/DOCX hỏng cả block). Quy tắc khi compose label:

### Flowchart (`flowchart TD/LR`)
- **CẤM double-quote `"..."` bên trong shape `[...]`, `([...])`, `{...}`, `{{...}}`**. Wrap toàn label trong `"..."` OK (escape), nhưng nested `"` thì fail.
- Cách an toàn: bỏ quotes, dùng từ Vietnamese trần `Start([User click Gỡ liên kết Google])`. Cần emphasize → dùng `**bold**` markdown KHÔNG work; thay bằng `<b>...</b>` HTML inside label.
- Newline: dùng `<br/>` (HTML), KHÔNG `\n`.
- **KHÔNG dùng HTML entity `&amp;` `&lt;` `&gt;` trong label** — mermaid.live/verifier có thể nuốt được nhưng nhiều renderer (GitHub/Obsidian) báo "Invalid mermaid syntax". Thay `&amp;` → chữ "và", `<`/`>` → "nhỏ hơn"/"lớn hơn" hoặc bỏ. Ký tự `&` trần cũng nên tránh trong label.
- Ký tự `()`, `[]`, `{}` trong label → escape bằng `#40;` `#41;` `#91;` `#93;` `#123;` `#125;` hoặc viết lại không có chúng.
- Ký tự `:` cuối label OK; `;` cuối câu OK; `,` OK.

### Sequence (`sequenceDiagram`)
- Message text sau `:` được tự do — `A->>B: Đăng nhập "với Google"` OK (sequence parser lenient hơn flowchart).
- `Note over`, `alt/else/opt/loop` block — text tự do sau `:`.

### State (`stateDiagram-v2`)
- Transition label sau `:` tự do — `A --> B: Click verify link còn hạn` OK.
- KHÔNG dùng `"..."` quanh state name (vd `state "Locked Account" as Locked` chỉ dùng khi cần alias).

### ERD (`erDiagram`)
- Relationship label `||--o{` bắt buộc trong `"..."` — `ACCOUNT ||--o{ SESSION : "có nhiều session"`.
- Attribute comment trong entity block dùng `"..."` — `string email PK "unique, primary key"`.

### Khi nghi ngờ
- Thử rút gọn label về plain text Vietnamese không quote → render trước → enhance sau.
- Skill `$sequence` `$activity` `$state` `$erd` `/srs` PHẢI tuân rules trên khi sinh mermaid. Nếu user yêu cầu label phức tạp → đề xuất reformulate.

## Tóm tắt 1 dòng

> **Time-based → Sequence. State-based → State. Process đa-vai → Activity-swimlane (PlantUML). Process gọn cần nhúng inline → Activity (Mermaid). Scope-based → Use Case. Data-based → ERD. Chuẩn-OMG/import-BPM → BPMN.**
