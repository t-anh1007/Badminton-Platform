# BA Conventions

> Common rules cho mọi BA skills (`$brainstorm`, `/urd`, `/brd`, `/prd-epic`, `/srs`, `/usecase`, `/userstory`, `/ac`). Mỗi skill MUST reference file này trong Constraints + References.

## 0. Doc sạch — không meta-text trong template/doc

- Template chỉ chứa **cấu trúc** (heading, khung bảng, placeholder). Doc sinh ra chỉ chứa **nội dung nghiệp vụ thật**.
- KHÔNG chèn vào template/doc: blockquote giải thích section là gì, công thức viết (vd công thức pitch), format ID, khối "Cách điền", pointer "chạy `/skill-x` để fill", quy tắc format cell. Mọi hướng dẫn cho người viết sống ở SKILL.md (Constraints/Gotchas) hoặc `.agents/rules/`.
- ĐƯỢC giữ: placeholder dữ liệu render dạng blockquote (`> Scope: {{scope}}`, `> Decided: {{date}} | By: ...`), chú giải mà **người đọc** cần để hiểu nội dung (thang nhãn ✅/🔵/🟡 của reverse-doc, định nghĩa horizon Now/Next/Later của roadmap), marker file auto-gen (jira-map "Updated bởi `/jira`").
- Update mode gặp doc cũ còn meta-text → đề xuất dọn qua L2 diff, user quyết.

## 1. Author resolution (cho activity log)

> Frontmatter KHÔNG còn field `owner` (diet 2026-07-12) — "ai làm" ghi per-event ở cột @author của `docs/_shared/activity.log`.

- Resolve @author từ memory `user-identity.md` (key `current_user`).
- Nếu memory chưa có → đọc `git config user.name` + `git config user.email` → ask user confirm @handle (vd `@hoangpm` từ `hoangpm.qn96@gmail.com`) → save vào memory.
- Sau mỗi Write/Edit đã được duyệt, skill gọi `.agents/scripts/activity-log.mjs`; có thể dùng `CODEX_CHANGELOG_AUTHOR` để truyền @handle.
- Doc demo cũ còn field `owner` trong frontmatter → giữ nguyên (di sản), không thêm vào doc mới.

## 2. No-re-ask rule

- KHÔNG hỏi lại câu user đã trả lời (cùng session HOẶC trong file đã tồn tại).
- Trước mỗi vòng câu hỏi: scan idea seed + previous answers + existing doc (continuation/update mode) → loại câu đã có answer.
- Answer partial → follow-up chỉ phần thiếu, KHÔNG hỏi lại từ đầu.
- Continuation/update mode: MUST Read full file trước khi phỏng vấn, đối chiếu mỗi planned question với content có sẵn.

## 3. IT-BA framing (no coding/architect questions)

Skill phục vụ IT Business Analyst, KHÔNG phải developer.

**CẤM hỏi:** tên column DB, schema table, function/service name, API endpoint, JWT vs session, framework choice, refresh-token rotation, hashing algorithm, payload structure, SDK name.

**ĐƯỢC hỏi (business language):**
- "system làm gì" (validate, lưu thông tin, gửi email, gọi dịch vụ ngoài)
- "cần lưu loại thông tin nghiệp vụ gì" (vd email, status, ngày tạo — KHÔNG hỏi column type)
- "có gọi dịch vụ bên ngoài nào" (Google, SendGrid, Stripe — chỉ tên + mục đích, KHÔNG hỏi endpoint/SDK)
- "ai trigger action", "khi nào trigger", "kết quả nghiệp vụ user thấy"

Quyết định kỹ thuật (DB schema, auth strategy, framework choice) là việc của `/srs` + dev/architect, KHÔNG phải BA skills khác.

## 4. Vietnamese-friendly typography

- KHÔNG dùng ký hiệu ngoại lai khó đọc trong prose tiếng Việt: `§` (section sign) → dùng "Mục N", `¶` → "đoạn N".
- `→` chỉ dùng trong flow/diagram/table cell, narration tiếng Việt nên dùng "sang/đến/dẫn tới".
- Bold (`**...**`) dùng bình thường — phục vụ emphasis số liệu, key term, câu chốt.
- Tránh làm doc trông như legal/spec Tây.

## 5. L1 plan preview cho BA, không cho dev

L1 plan preview phải dùng **prose tự nhiên với từ nghiệp vụ**, KHÔNG bảng dày tag/flag/checklist.

**Format đề xuất:**

> Em sẽ {tạo mới | viết lại} file `docs/{feature}/{name}.md` với:
>
> **Thêm/cập nhật nội dung:**
> - {liệt kê 4-8 bullet bằng từ nghiệp vụ: "luồng / bảng / hình minh họa / số liệu cụ thể / wording mẫu"}
> - {các số liệu nghiệp vụ cụ thể nếu có}
>
> **Câu hỏi mở:** {N resolved} đã chốt; còn {M} cho `/{next-skill}`.
>
> **Ghi nhận:** activity log "{note}".
>
> Apply? (Y / sửa)

**CẤM trong L1 BA-facing:**
- Bảng `# | path | action | summary` (kiểu log dev)
- Tag flag: `has_external_redirect=Y`, `Quality checklist: 9/11`, `Mandatory artifacts ✓`
- Từ technical: matrix, diagram, flag, scaffold, schema

**GIỮ:** số liệu nghiệp vụ cụ thể (lockout 5 lần, link 24h) — đó là content nghiệp vụ.

## 6. Độ sâu cột "Description" trong bảng mô tả màn hình

> Áp cho `/wireframe-ascii`, `/wireframe-html`, `/prototype-html` — bảng 5 cột `# | Items | Control type | Data type | Description`. Cột Description KHÔNG được nông ("• Bắt buộc. Validate email"). Phải đủ để BA/dev/QC dùng thật.

**Nguồn rút mô tả (ưu tiên, KHÔNG bịa):** `srs/{feature}-spec.md` (FR/BR/NFR/Error Matrix) → use case `uc-*.md` (branches) → brainstorm/URD/PRD. Rút số liệu + mã ID + wording THẬT từ đó.

**6 lớp thông tin cho mỗi element** (fill lớp nào áp dụng — element đơn giản như link chỉ cần 1-2 lớp):

1. **Mục đích nghiệp vụ** — field/nút này để làm gì (business meaning), 1 câu.
2. **Validation / ràng buộc** — bắt buộc/tùy chọn, rule cụ thể (trích BR-xxx), default, placeholder. Nêu rõ cả điều KHÔNG áp (vd "login không validate password policy, chỉ so khớp").
3. **States** — default / focus / disabled / submitting / error / success (chỉ liệt kê state element thật sự có).
4. **Navigation** — click/submit đi màn nào, điều kiện enable/disable.
5. **Error + wording** — mã `E-{feature}-NNN` + wording exact + hệ quả (vd "tăng bộ đếm fail +1" / "KHÔNG tính vào fail counter").
6. **Edge / security / compliance** — anti-enumeration, audit log, lỗi mạng, auto-link, fallback, PDPA... khi áp dụng (trích NFR-xxx).

**Gọn — KHÔNG dài dòng thừa:** giữ đủ 6 lớp nhưng wording súc tích; KHÔNG lặp lại 1 mã ID nhiều lần nếu đã rõ; gộp branch cùng loại. Mục tiêu: đọc 1 row hiểu đủ 1 element, KHÔNG phải nhảy file.

**Thiếu nguồn nghiệp vụ (chưa chạy `/srs`):** KHÔNG bịa validation/error/số liệu. **Hỏi user bổ sung** các điểm thiếu (từng field một, theo no-re-ask rule) — vd "Password field: rule độ dài + charset cho phép?", "Nút Submit: các case fail + thông báo?". User "bỏ qua" → ghi mức nông + đánh dấu rõ chỗ cần bổ sung, KHÔNG chặn tiến độ.

## 7. Confirm device size TRƯỚC khi vẽ wireframe/prototype

> Áp cho `/wireframe-ascii`, `/wireframe-html`, `/prototype-html`. Device size (mobile 375 / tablet 768 / desktop 1024 / responsive) quyết định bề rộng khung + cách xếp layout — là **quyết định thiết kế**, KHÔNG được tự đoán im lặng (đúng tinh thần `approval-gate.md`: không auto-pick dù "có vẻ rõ").

- **Luôn hỏi user device** ở đầu skill (trước khi vẽ), qua AskUserQuestion 4 lựa chọn: Mobile 375 / Tablet 768 / Desktop 1024 / Responsive.
- **Đề xuất sẵn 1 device** để user chỉ cần xác nhận nhanh: ưu tiên `srs/{feature}-userflow.md` frontmatter `primary_device`; thiếu thì suy từ `docs/design.md` (Breakpoints / Max content width). Đặt option đề xuất lên đầu + note "(đề xuất — từ {nguồn})".
- **KHÔNG suy 1 device rồi vẽ luôn** — kể cả khi design.md rõ ràng. Suy được chỉ để *đề xuất*, không để *tự chốt*.
- User chốt device mà `userflow.md` chưa có `primary_device` → gợi ý ghi ngược vào userflow frontmatter (single-source, để `/wireframe-html` + `/prototype-html` + lần sau dùng chung, không hỏi lại — no-re-ask).
- `responsive` chỉ dùng khi user chọn rõ VÀ renderer thực sự sinh nhiều breakpoint; KHÔNG gắn nhãn responsive rỗng.

## 8. 1 màn = 1 trạng thái tại 1 thời điểm; form không trải rộng

> Áp cho `/wireframe-ascii`, `/wireframe-html`, `/prototype-html`.

- **State loại trừ nhau → tách screen riêng, KHÔNG nhồi chung 1 khung.** Nếu 1 màn có ≥2 kết quả chỉ 1 hiện tùy điều kiện (vd verify-result: thành công / hết-hạn; payment-result: success / fail; OTP: nhập / hết-hạn) → render **mỗi state 1 screen** (slug `{screen}-{state}`, vd `verify-email-success` + `verify-email-expired`). KHÔNG vẽ 2 khối side-by-side trong 1 khung (đọc nhầm là "màn có cả 2"). Chỉ chung 1 khung khi các phần **cùng hiện đồng thời**. Userflow gộp chung → đề xuất tách + hỏi user.
- **Form/auth/dialog KHÔNG trải rộng hết khung desktop.** Content dạng form (login/signup/forgot/modal) phải nằm trong **1 box căn giữa hẹp** (~380-460px), input/nút full-width TRONG box đó — KHÔNG kéo dài full 1024px (trông sai, không giống màn thật). HTML: `<div class="wf-form">`. ASCII: vẽ khung form hẹp căn giữa trong khung device rộng, KHÔNG cho field chạm 2 mép. Full-content screen (dashboard/list/table) thì trải thẳng, không cần box.
