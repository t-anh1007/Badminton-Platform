---
name: brainstorm
description: Dùng khi cần ghi lại 1 ý tưởng thô rồi phỏng vấn làm rõ trước khi viết URD/PRD. Kích hoạt bằng `$brainstorm <mô tả ý tưởng>` hoặc `$brainstorm @<file>`.
---

# $brainstorm — Deep Interview + Clarify

## Goal

Expand raw idea thành structured brainstorm board qua **structured 7-section interview** (one section at a time). Output 12 sections theo `_templates/brainstorm.md`: user types, capabilities P0/P1/P2, **Core Flows (Happy Path)** với numbered steps + ASCII diagram per flow, **System Behavior Deep Dive** (decision points, scenario matrix, state transitions, interrupted transaction handling, other edge cases), **Validation/Limits/Wording** (validation rules, exact limits, wording samples: error/success/info messages), assumptions, risks (IT-BA framing), success metrics, open questions. Dependencies tách sang `/prd-epic` hoặc `/srs` — không capture ở brainstorm. Checkpoint BẮT BUỘC trước URD/PRD cho idea raw.

## Constraints

- **L1 approval** trước Write — bao gồm confirm feature slug + idea slug do skill auto-derive.
- **L3 iterate** cho ASCII flow diagram + mermaid diagrams (tối đa 3 vòng theo `../../rules/approval-gate.md`).
- **Per-feature path** — `docs/{feature}/brainstorms/{idea-slug}.md`.
- **Auto-derive feature slug từ idea content** — KHÔNG bắt user nhập. Đề xuất trong L1, user override được.
- **Auto-derive idea slug** — semantic slug từ idea topic. Fallback `idea-{NNN}`. Collision → suffix `-v2`.
- **Idea input free-form** — text trực tiếp HOẶC `@<file-path>` tag.
- **Interview hỏi từng section một** — KHÔNG dồn batch 10 câu. Wait reply giữa các section. User có thể skip section bất kỳ → fill `<!-- TBD: ... -->`.
- **Mandatory artifacts theo complexity** (auto-detect):
  - **ASCII flow diagram** — bắt buộc nếu detect: external API/redirect (OAuth, payment, webhook), branching ≥2 paths, async/background job.
  - **Interrupted transaction matrix** — bắt buộc nếu detect external redirect/webhook (browser close mid-flow, link expired, callback fail).
  - **Scenario matrix** — bắt buộc nếu ≥2 input states / role combinations.
  - **State transitions table** — bắt buộc nếu có entity status (account, order, subscription, request).
- **Push for exact values** — KHÔNG chấp nhận "có rate limit" mà phải hỏi "bao nhiêu lần/phút". KHÔNG chấp nhận "show error" mà phải hỏi "exact wording". Vague answer → re-ask 1 lần. Vẫn vague → ghi TBD + flag open question.
- **No-re-ask rule — KHÔNG hỏi lại câu user đã trả lời**. Trước mỗi section, scan toàn bộ context (idea seed + previous answers + existing brainstorm doc nếu là continuation) → loại bỏ câu hỏi đã có answer. Nếu answer partial → hỏi follow-up cụ thể chỉ phần thiếu, KHÔNG hỏi lại từ đầu. Vd: user đã nói "default off remember-me" → KHÔNG hỏi lại "remember-me default ON hay OFF". Continuation mode (file brainstorm đã có) → đọc kỹ doc trước khi phỏng vấn, chỉ hỏi gap.
- **IT-BA framing — KHÔNG hỏi câu coding/architect-level**. Skill này phục vụ IT Business Analyst, KHÔNG phải developer. **CẤM hỏi**: tên column DB, schema table, function/service name, API endpoint cụ thể, JWT vs session, framework choice, refresh-token rotation, hashing algorithm, payload structure, SDK name. **ĐƯỢC hỏi (business language)**: "system làm gì" (validate, lưu thông tin, gửi email, gọi dịch vụ ngoài), "cần lưu loại thông tin nghiệp vụ gì" (vd email, status, ngày tạo — KHÔNG hỏi column type), "có gọi dịch vụ bên ngoài nào" (Google, SendGrid, Stripe — chỉ tên dịch vụ + mục đích, KHÔNG hỏi endpoint/SDK), "ai trigger action", "khi nào trigger", "kết quả nghiệp vụ user thấy". Quyết định kỹ thuật (DB schema, auth strategy, framework) là việc của `/srs` + dev/architect.
- **Quality checklist gate** trước L1 — nếu fail check → đề xuất hỏi thêm trước khi write.
- **Vietnamese-first** default, auto-detect từ idea content. Muốn tiếng Anh thì nói "viết bằng tiếng Anh".
- **KHÔNG nhảy thẳng URD/PRD** — brainstorm là checkpoint riêng.
- **Doc sạch — KHÔNG chèn meta-text vào doc sinh ra** (per ba-conventions Mục 0). CẤM cụ thể: câu nguồn seed ("*Seed lấy từ mini-brief...*"), vị trí roadmap/điểm RICE ("Feature này ở horizon Now..."), chỉ dẫn quy trình cho người viết ("*KHÔNG nhảy thẳng SRS — qua PRD trước*"). Mục 1/2 chỉ chứa nội dung nghiệp vụ thật; Mục 12 chỉ list lệnh next. Provenance sống ở frontmatter `links:`.
- **Shallow mode qua lời nói** — user nói "brainstorm nhanh gọn" / "làm nhanh thôi" (cho idea nhỏ, MVP, prototype scope) → skill bypass deep mode, chạy fast 1-batch version. Không cần gõ flag.

## Inputs

```
$brainstorm                                      # interactive: ask idea
$brainstorm <idea text>                          # idea text inline
$brainstorm @<file-path>                         # idea from tagged file
```

Examples:
```
$brainstorm thêm spaced repetition cho vocabulary trainer
$brainstorm @notes/idea-2026-05-13.md
$brainstorm đăng nhập email + Google OAuth      # complex → deep mode auto
$brainstorm dark mode toggle, brainstorm nhanh gọn thôi   # trivial → nói "nhanh gọn" là đủ, không cần flag
```

Muốn đổi hành vi mặc định, nói bằng lời:
- Viết bằng tiếng Anh → nói "viết bằng tiếng Anh".
- Chạy nhanh gọn, bỏ qua deep interview → nói "brainstorm nhanh gọn" / "shallow thôi".

## Context (dynamic)

Khi chạy, lấy ngày hiện tại từ runtime; quét các thư mục con trực tiếp của `docs/` bằng công cụ filesystem của Codex và bỏ qua tên bắt đầu bằng `_`. Không dùng cú pháp nội suy shell của Claude Code.

## Approach

### Phase A — Resolve & Auto-derive (silent)

1. **Resolve idea source:**
   - No arg → nếu có `docs/_product/roadmap.md`, đọc horizon **Now** (Mục 3) → gợi ý slug đầu Now làm điểm khởi đầu: "Roadmap đang ưu tiên `{slug đầu Now}` ở horizon Now — brainstorm cái này? (Y / gõ feature khác / paste ý tưởng)". Không có roadmap → ask "Bạn brainstorm gì? (paste text hoặc tag file `@path`)". Wait.
   - Arg start `@` → Read file (image → vision, warn quality).
   - Otherwise → arg as text.
2. **Auto-derive feature slug** — extract main domain noun phrase, kebab-case ASCII, max 30 chars. Check `docs/<slug>/` exist → reuse hoặc propose new.
3. **Auto-derive idea slug** — semantic from topic delta. Fallback `idea-{NNN}`. Collision → `-v2`.
4. **Detect language** từ idea content.
5. **Detect complexity signals** từ idea content + keyword scan:
   - External redirect/OAuth/payment/webhook keywords → `has_external_redirect = true`
   - "signup", "checkout", "subscribe", "verify", "callback" → `has_async_flow = true`
   - "admin/user/guest", "P0/P1/free/paid", "≥2 roles" → `has_multi_role = true`
   - "pending → active", "draft → published", entity status → `has_state_machine = true`
   - "rate limit", "quota", "captcha", "lockout" → `has_throttle_rules = true`
   - Flag từng để mandate corresponding artifact.

### Phase B — Interview (7 sections, one-at-a-time)

> Mỗi section: in 1 message, 2-5 câu hỏi tối đa, wait reply. Push for exact values. User `skip` → TBD placeholder + open question.

**Section 1 — Overview**
1. Feature này làm gì (1-2 câu từ góc user)?
2. Vấn đề/pain cụ thể đang giải? Ai bị?
3. Why now? (request từ ai, deadline, signal market)

**Section 2 — Users & Access**
1. Roles nào dùng (admin, free, paid, guest, ...)?
2. Gating: cần subscription/verified/role gì để truy cập?
3. Entry point: user vào feature qua đâu (menu, button, deep link, notification)?
4. Số lượng user dự kiến (giúp size capacity + cost)?

**Section 3 — Core Flow (Happy Path)**
1. Walk-through từng bước: user làm gì → system làm gì → user thấy gì (success state)?
2. Có sub-flow khác không (signup vs login, new vs returning, upgrade vs downgrade)?
3. Output cuối user thấy gì? Có notification/email gửi đi không?

**Section 4 — Detailed Flow Deep Dive** (chỉ chạy nếu complexity signal trigger từ Phase A)

4a. **System actions (business level)** — mỗi bước nghiệp vụ system làm gì? Mô tả bằng action verb nghiệp vụ: "validate email format", "check email tồn tại", "tạo user record", "gửi verification email", "gọi Google OAuth", "ghi audit log". KHÔNG hỏi function name / service class / API endpoint. Loại thông tin nghiệp vụ nào cần lưu (liệt kê field nghiệp vụ vd email, status, created_at — KHÔNG hỏi column type / schema). Có gọi dịch vụ ngoài nào (chỉ tên dịch vụ + mục đích nghiệp vụ, vd "Google OAuth để xác thực", "SendGrid để gửi email" — KHÔNG hỏi endpoint/SDK).

4b. **Decision points** — if/else nghiệp vụ nào trong flow? Condition + path YES/NO? Có calculation/business rule gì?

4c. **State transitions** — entity nào có status? Liệt kê: `entity: stateA → stateB → stateC`. Trigger từng transition? Reversible không?

4d. **Interrupted transactions** (MANDATORY nếu `has_external_redirect || has_async_flow`):
   - User đóng browser/app giữa flow → state gì còn lại, resume kiểu gì?
   - External service fail/timeout → retry? State?
   - User start flow mới trong khi cái cũ pending → behavior?
   - Link/token expired → flow?
   - Concurrent → 2 device cùng action → ai win?

4e. **ASCII flow diagram (L3 iterate)** (MANDATORY nếu `has_external_redirect || has_async_flow || branching ≥2`):
   - Skill draw v1 từ section 3+4a+4b answers.
   - Show user: "Diagram này đúng không? Sửa gì?"
   - Iterate max 3 vòng.
   - Diagram phải show: user vs system action, decision với condition, external call, data change, error path.

4f. **Scenario matrix** (MANDATORY nếu `has_multi_role || ≥2 input states`):
   - Liệt kê combo (from_state × to_state × rule) → action + result.
   - Skill draft từ flow + ask confirm/correct.

### Section 5 — Validation, Limits & Wording
1. Required fields + format + min/max?
2. Limits/quotas (EXACT numbers): rate limit X/min, max Y items, retry Z, lockout sau N fail?
3. Business rules: conditions, calculations, state-transition rules?
4. **Exact error messages** cho từng error case (string đúng wording, tiếng Việt natural)?
5. **Exact success messages** cho từng confirmation state?
6. **Exact info/neutral messages** (vd "Đã gửi email xác nhận tới {email}…")?

> Push: "Rate limit bao nhiêu/phút?" → "Lockout sau bao nhiêu fail?" → "Câu error chính xác là gì?". Vague vẫn vague → TBD + flag OQ.
> Wording chia 3 nhóm khi synthesize: error / success / info — KHÔNG dồn 1 bảng chung.

### Section 6 — System Context (business-level only, KHÔNG technical)
1. Cần lưu thêm loại thông tin nghiệp vụ nào (vd "device list", "login history", "subscription status") — chỉ liệt kê **thông tin gì**, KHÔNG hỏi DB schema / table name?
2. Có cần dịch vụ bên ngoài nào (email service, OAuth provider, payment, SMS, captcha) — **tên dịch vụ + mục đích nghiệp vụ**, KHÔNG hỏi SDK/endpoint?
3. Notification gửi cho user qua kênh nào (email / push / in-app / SMS) + khi nào trigger (sau action gì)?
4. Có xử lý nền / scheduled không (vd cleanup token expired hằng ngày, send digest tuần) — chỉ **business need**, KHÔNG hỏi cron syntax / queue system?
5. Có cần real-time không (vd thông báo ngay khi event xảy ra) — chỉ **business need**, KHÔNG hỏi websocket/SSE/polling?

### Section 7 — Edge Cases, Risks, Open Questions
1. Lost connection mid-flow?
2. External service down?
3. Concurrent usage (2 user cùng action lên cùng resource)?
4. Pending/abandoned transactions — TTL, cleanup, resume path?
5. Top 3 rủi ro nghiệp vụ (adoption / vendor / compliance / process / timeline / data) — khả năng (thường/thỉnh thoảng/hiếm), hậu quả nghiệp vụ, cách phòng?
6. Đang chưa rõ gì → liệt kê thành open questions?

### Phase C — Synthesize + Quality Gate

6. **Synthesize** tất cả answers → build content sections.
7. **Auto-fill sections** theo `_templates/brainstorm.md` (12 sections):
   - Mục 5 Core Flows — numbered steps + ASCII diagram embedded per flow.
   - Mục 6.1 Decision Points — table `ID | Flow | Khi nào | YES | NO`.
   - Mục 6.2 Scenario matrix (nếu trigger) — table `From | To | Rule | Action | Result`.
   - Mục 6.3 State transitions (nếu trigger) — table `Entity | Từ | Sang | Trigger | Quay lại?`.
   - Mục 6.4 Interrupted-tx matrix (nếu trigger) — table 4 cột.
   - Mục 6.5 Other edge cases — gom chung, KHÔNG tách section riêng.
   - Mục 7.3 Wording samples — 3 nhóm tables: error / success / info.
   - Mục 9 Risks — IT-BA format (Khả năng / Hậu quả nghiệp vụ / Cách phòng).
8. **Quality checklist** — skill self-check trước L1:
   - [ ] Mỗi flow ở Mục 5 có numbered steps user + system actions.
   - [ ] Flow phức tạp có ASCII diagram đi kèm trong Mục 5.
   - [ ] Mục 6.1 Decision Points có tối thiểu các nhánh chính của flow.
   - [ ] Interrupted flow handling documented (nếu external redirect).
   - [ ] Scenario matrix cover all combo (nếu multi-state).
   - [ ] State transitions mapped (nếu có entity status).
   - [ ] Mục 7.2 limits/quotas có exact numbers (không "phù hợp").
   - [ ] Mục 7.3 error/success/info messages là exact strings.
   - [ ] Risks dùng IT-BA framing (adoption/vendor/compliance/process/timeline/data), không phải bug/infra.
   - [ ] Open questions có ID `OQ-1, OQ-2, ...`.
   - Fail check → in checklist gap + đề xuất "hỏi thêm Q-X" trước proceed. User pick "proceed anyway with TBD" được.

### Phase D — Approval + Write

9. **L1 plan preview** — viết bằng **ngôn ngữ tự nhiên cho BA**, KHÔNG bảng dày tag/flag/checklist. Format:

   > Em sẽ {tạo mới | viết lại} file `docs/{feature}/brainstorms/{slug}.md` với:
   >
   > **Thêm/cập nhật nội dung:**
   > - {liệt kê 4-8 bullet bằng từ nghiệp vụ: "luồng / bảng / diagram/ hình minh họa / số liệu cụ thể / wording mẫu" — KHÔNG dùng "matrix / flag"}
   > - {các số liệu nghiệp vụ cụ thể nếu có: lockout sau X lần, link expire Y giờ, ...}
   >
   > **Câu hỏi mở:** {N resolved} đã chốt trong session này; còn {M} câu để dành cho `/urd` hoặc `/prd-epic`: {liệt kê ngắn}.
   >
   > **Ghi nhận:** activity log "{note}".
   >
   > Apply? (Y / sửa / override-feature `<slug>` / override-idea `<slug>`)

   **CẤM** trong L1 BA-facing:
   - Bảng `# | path | action | summary` (kiểu log dev)
   - Tag flag: `has_external_redirect=Y`, `Quality checklist: 9/11`, `Mandatory artifacts ✓`
   - Từ technical: matrix, diagram, flag, scaffold, schema

   **GIỮ:** số liệu nghiệp vụ cụ thể (lockout 5 lần, link 24h) — đó là content nghiệp vụ, không phải metadata.
10. **Write** `docs/{feature}/brainstorms/{idea-slug}.md` từ `_templates/brainstorm.md`.
11. **Activity log sau Write** — chạy `node .agents/scripts/activity-log.mjs --skill brainstorm --file docs/{feature}/brainstorms/{idea-slug}.md --note "initial brainstorm {title}, {N} OQs"`.
12. **Output report (initial)**:
    ```
    ✅ Brainstorm captured: docs/{feature}/brainstorms/{slug}.md
       Mode: deep | Sections: 12 | OQs: {N} | Quality gate: {pass|partial}
    ```

13. **Phase E — Resolve Open Questions (PRIORITY gate trước downstream)** — per @../../rules/resolve-oqs.md. Brainstorm là gốc → chỉ có own OQs (Mục 12), không inherit. Collect → prompt Y/skip/ids → loop 1-by-1 → side-effect L2 diff cho Assumptions/Risks/Capabilities nếu OQ tác động → activity log qua `activity-log.mjs`.

13b. **Phase E2 — Mark "đã chi tiết hóa" ngược lên PRD sản phẩm** — sau khi brainstorm write xong:
    - Check `docs/_product/prd.md` tồn tại. Không có → skip phase này (không phải dự án nào cũng có PRD cấp sản phẩm).
    - Read brief, tìm row trong Mục 7 Feature Map có slug khớp `{feature}` của brainstorm vừa tạo.
    - **Không tìm thấy row** → in gợi ý "Feature `{feature}` chưa có trong PRD sản phẩm — chạy `/prd` (tự vào update mode) để thêm?" (KHÔNG tự thêm row). Skip update.
    - **Tìm thấy row** + cột Chi tiết hóa chưa phải `✅` → đếm `docs/{feature}/brainstorms/*.md` (N file) → **propose L2 diff** đổi cột Chi tiết hóa của row đó sang `✅ đã chi tiết (N brainstorm)`. User Y → Edit brief, rồi chạy `node .agents/scripts/activity-log.mjs --skill brainstorm --file docs/_product/prd.md --note "mark {feature} đã chi tiết hóa ({N} brainstorm)"`.
    - **Đã là `✅`** (thêm brainstorm thứ 2+) → cập nhật số N trong ngoặc qua L2 diff (silent-ish, vẫn show diff).
    - KHÔNG block nếu user từ chối diff — chỉ là sync metadata.

14. **Output report (final, sau Phase E)**:
    ```
    ✅ Brainstorm finalized: docs/{feature}/brainstorms/{slug}.md
       Resolved OQs trong session: {R}/{N}
       Còn hold: {M} (sẽ inherit downstream)
    
    BA approval gate: review trước khi proceed downstream.
    
    Recommended next:
      - /urd {feature}    — capture user perspective (inherit {M} OQ còn hold)
      - /brd {feature}    — business case
      - /prd-epic {feature}    — product scope
      
    Hoặc:
      - $brainstorm <another idea>  — capture idea khác
    ```

## Shallow mode (nói "brainstorm nhanh gọn")

User nói "nhanh gọn" / "shallow thôi" / "làm nhanh" (thay vì gõ flag) → skip Phase B (multi-section). Ask 6-question single batch (như version cũ). Skip mandatory artifacts. Recommend trong report: "shallow mode — nên chạy lại deep nếu feature go beyond prototype".

## Gotchas

- **Auto-derived feature slug có thể sai** — LUÔN show L1, user override được.
- **Idea content generic** (vd `$brainstorm thêm feature mới`) — không suy được slug → ask hint trước Phase A.
- **User trả lời vague** ("show error", "có rate limit") — re-ask 1 lần với câu hỏi cụ thể hơn. Vẫn vague → TBD + open question.
- **User bỏ giữa Phase B** (skip section 5+) — proceed quality gate, in checklist gap, để user quyết "write minimal" hay "tiếp tục interview".
- **`@<image-file>` experimental** — warn user.
- **Idea quá dài (>2k tokens)** — extract key signals, link source file.
- **Idea slug collision** — auto suffix `-v2`, show L1.
- **Workflow rule** — brainstorm là checkpoint, KHÔNG auto-trigger downstream.
- **ASCII diagram render trong markdown** — dùng box-drawing `┌ ─ ┐ │ ▼` và code block; KHÔNG dùng mermaid (mermaid để dành `/sequence`).
- **Complexity detection có thể miss** — user override được qua follow-up "skip ASCII flow" / "force deep".
- **Activity-log propagation** — edit brainstorm hiếm propagate.
- **Sync PRD sản phẩm (Phase E2)** — nếu dự án có `docs/_product/prd.md`, brainstorm tự đề xuất mark feature `✅ đã chi tiết` ngược lên Feature Map (L2 diff, user duyệt). Không có brief → skip, không lỗi.
- **Section 4 chỉ chạy nếu có complexity signal** — đừng force user trả lời 6 sub-questions cho dark-mode-toggle.
- **Push exact values KHÔNG là grilling** — chỉ re-ask 1 lần, tôn trọng user; vague-vẫn-vague → TBD chứ KHÔNG block.
- **@author resolution (cho activity log, KHÔNG vào frontmatter)** — resolve từ memory `user-identity` (file `current_user`). Nếu memory chưa có → đọc `git config user.name` + `user.email`, ask user confirm @handle, save vào memory `user-identity.md`. KHÔNG kế thừa từ upstream brainstorm/doc khác — upstream có thể là người khác. Frontmatter KHÔNG chứa field owner (đã diet 2026-07-12); "ai làm" ghi per-event ở cột @author của `docs/_shared/activity.log`.
- **Vietnamese-friendly typography** — KHÔNG dùng ký hiệu ngoại lai khó đọc trong prose tiếng Việt: `Mục ` (section sign) → dùng "Mục N", `¶` → "đoạn N". `→` chỉ dùng trong flow/diagram/table cell, narration tiếng Việt nên dùng "sang/đến/dẫn tới". Bold (`**...**`) **vẫn dùng bình thường** — phục vụ emphasis (số liệu, key term, câu chốt). Quy ước này tránh làm doc trông như legal/spec Tây.
- **L1 cho BA, không cho dev** — L1 plan preview dùng prose tự nhiên với từ nghiệp vụ ("luồng", "bảng", "hình minh họa"). KHÔNG dùng bảng `# | path | action`, KHÔNG dùng flag tag, KHÔNG dùng technical jargon. User là IT-BA — họ cần biết "doc sẽ có gì mới về nghiệp vụ" chứ không phải "structural metadata".
- **Re-asking là red flag** — user đã trả lời mà skill hỏi lại = mất uy tín + lãng phí thời gian. Continuation mode (existing brainstorm file): MUST Read full file trước khi hỏi, mark câu nào đã có answer trong doc, chỉ hỏi gap. Trong cùng session: track answers theo section, đừng quên.
- **Skill phục vụ IT-BA, không phải dev** — nếu user feedback "câu hỏi quá technical" / "đây là BA chứ không phải code", re-frame ngay sang business language. Câu hỏi có chữ "DB column", "function name", "JWT", "endpoint", "schema", "SDK" là red flag — refactor về "lưu thông tin gì?", "system làm gì?", "login session bao lâu?", "dịch vụ nào?". Quyết định kỹ thuật để dành `/srs` + dev/architect.

## References

- @../../rules/feature-bootstrap.md
- @../../rules/ba-conventions.md
- @../../rules/approval-gate.md
- @../../rules/naming-conventions.md
- @../../rules/keyword-detection.md
- @../../rules/resolve-oqs.md
- @../../rules/changelog.md
- @../../../_templates/brainstorm.md
- @./references/example-brainstorm.md
