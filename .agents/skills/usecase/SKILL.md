---
name: usecase
description: Dùng khi cần xác định phạm vi, chia danh sách, viết mới, chỉnh sửa hoặc review đặc tả Use Case từ ý tưởng, brainstorm, URD hay PRD. Kích hoạt bằng `$usecase --feature ten-feature`, `$usecase "mục tiêu của actor" --feature ten-feature` hoặc `$usecase @file`. Đầu ra ưu tiên tiếng Việt, gồm chín trường bắt buộc và có thể tạo thêm DOCX khi người dùng yêu cầu.
---

# `$usecase` — Đặc tả Use Case

## Mục tiêu

Tạo đặc tả Use Case ở mức **một Actor chính – một mục tiêu nghiệp vụ – một phiên tương tác**, đủ rõ cho BA, developer và QA nhưng không tự phát minh thiết kế kỹ thuật.

## Cách gọi

```text
$usecase --feature <slug>
$usecase "<mục tiêu của actor>" --feature <slug>
$usecase @<brainstorm|urd|prd|use-case-file>
$usecase review @<use-case-file>
$usecase split @<brainstorm|urd|prd>
```

Tùy chọn bằng lời nói:

- `viết bằng tiếng Anh`: đổi ngôn ngữ artifact sang tiếng Anh.
- `xuất DOCX`, `tạo file Word` hoặc tương đương: tạo thêm `.docx` bên cạnh Markdown.
- `chỉ Markdown`: không tạo DOCX.

## Đường dẫn đầu ra

- Markdown: `docs/{feature}/use-cases/{UC-ID}-{slug}.md`
- DOCX khi được yêu cầu: `docs/{feature}/use-cases/{UC-ID}-{slug}.docx`

`slug` dùng kebab-case ASCII. Nếu chưa có thư mục, áp dụng `../../rules/feature-bootstrap.md`. Không ghi đè Use Case hiện có nếu chưa được người dùng duyệt.

## Chín trường bắt buộc

1. Use case ID
2. Use case name
3. Tiền điều kiện
4. Hậu điều kiện
5. Actor chính
6. Actor phụ
7. Basic flow
8. Alternative flow
9. Exception

Không tự thêm Description, Priority, Frequency, Includes, Special Requirements, Assumptions hay Notes. Chỉ thêm trường ngoài danh sách nếu người dùng yêu cầu rõ.

## Quy tắc phạm vi

- Use case name là **động từ + đối tượng**, không chứa tên Actor.
- Actor chính là vai trò cụ thể, không dùng từ chung chung `User` hoặc `Người dùng` nếu có thể xác định vai trò.
- Actor phụ là người hoặc hệ thống hỗ trợ. Không có thì ghi `Không có`.
- Use Case phải vượt qua coffee-break test: khi kết thúc, Actor đã đạt một kết quả nghiệp vụ có ý nghĩa.
- Quá lớn, nhiều mục tiêu hoặc nhiều phiên thì tách Use Case.
- Quá nhỏ, chỉ là một bước như xác thực OTP thì đưa vào flow của Use Case cha, trừ khi nó được tái sử dụng và người dùng muốn đặc tả riêng.
- Chỉ mô tả tương tác Actor–Hệ thống và kết quả quan sát được. Không mô tả code hoặc kiến trúc nội bộ.

## Kế thừa nguồn và không hỏi lại

### Thứ tự ưu tiên

1. Yêu cầu hiện tại của người dùng và Use Case đang được chỉnh sửa.
2. URD/PRD liên quan.
3. Brainstorm liên quan.

Khi nguồn mâu thuẫn, ưu tiên nguồn cao hơn nhưng phải nêu mâu thuẫn để người dùng xác nhận nếu nó làm thay đổi flow.

### Ánh xạ dữ liệu

| Nguồn upstream | Trường Use Case |
|---|---|
| Users & Access | Actor chính, Actor phụ, Tiền điều kiện |
| Core Flows | Basic flow |
| Decision Points, Scenario Matrix | Alternative flow |
| Interrupted Transactions, Edge Cases | Exception |
| Validation, Limits, Wording | Điều kiện, phản hồi trong flow |
| State Transitions | Hậu điều kiện và trạng thái cuối của Exception |

Đọc đầy đủ nguồn trước khi hỏi. Ghi nhận phần đã có, phần thiếu và phần mâu thuẫn. Không hỏi lại dữ liệu đã rõ. Không suy đoán tên bảng, column, endpoint, framework, SDK, JWT/session, TLS hoặc số liệu giới hạn chưa được cung cấp.

## Chế độ làm việc

### Viết mới

1. Xác định Actor chính, mục tiêu và ranh giới hệ thống.
2. Đọc các file liên quan trong `docs/{feature}/brainstorms/`, URD và PRD nếu tồn tại.
3. Nếu đủ chín trường, tạo bản nháp đầy đủ và xin duyệt một lần.
4. Nếu thiếu, hỏi một nhóm tối đa ba câu chỉ về các gap đang chặn việc viết. Tiếp tục hỏi chỉ khi vẫn còn gap bắt buộc.

### Chia danh sách Use Case

Dùng goal-driven và event-driven để tạo danh sách ứng viên:

```markdown
| Use case ID | Use case name | Actor chính | Mục tiêu | Nguồn |
|---|---|---|---|---|
```

Sau đó hỏi người dùng chọn Use Case cần đặc tả. Không dùng CRUD như quy tắc mặc định; chỉ dùng khi mục tiêu nghiệp vụ thực sự là tạo, xem, cập nhật hoặc xóa một thực thể.

### Review hoặc chỉnh sửa

Đọc toàn bộ file, chạy checklist trong `references/quality-checklist.md`, liệt kê lỗi theo mức độ và chỉ sửa sau khi được yêu cầu. Giữ nguyên nội dung đúng; không viết lại toàn bộ nếu chỉ cần sửa cục bộ.

## Định dạng flow

Đọc `references/template-guide.md` và dùng `assets/uc-template.md`.

### Basic flow

- Bảng đúng hai cột: tên Actor chính cụ thể và `Hệ thống`.
- Đánh số bước liên tục trên cả hai cột.
- Mỗi ô chứa một hành động chính. Ô đối diện có thể để trống khi có hai hành động liên tiếp từ cùng một phía.
- Bắt đầu bằng trigger và kết thúc bằng hậu điều kiện thành công.
- Không nhúng if/else hoặc lỗi vào Basic flow.

### Alternative flow

Mỗi flow có mã `AF-01`, tên, bước rẽ, điều kiện, bảng Actor–Hệ thống và kết thúc bằng `quay lại bước N` hoặc một hậu điều kiện thành công khác.

### Exception

Mỗi exception có mã `EX-01`, tên, bước phát sinh, điều kiện, bảng Actor–Hệ thống và trạng thái cuối. Exception là đường không đạt mục tiêu chính hoặc chỉ đạt một phần; không trộn với Alternative flow.

## Ngôn ngữ

- Mặc định dùng tiếng Việt cho trao đổi và artifact.
- Nếu người dùng yêu cầu tiếng Anh, dịch cả nhãn trường, flow và thông báo; giữ nguyên ID.
- Giữ thuật ngữ dự án nhất quán. Không tự thay `Khách hàng` thành `User`, hoặc đổi tên Actor giữa các flow.

## Approval và ghi file

Trước khi ghi, đưa một preview ngắn gồm: phạm vi Use Case, Actor chính, file sẽ tạo/cập nhật, nguồn đã kế thừa và các TBD còn lại. Xin duyệt một lần theo `../../rules/approval-gate.md`.

Sau khi duyệt:

1. Ghi Markdown từ `assets/uc-template.md`.
2. Chạy checklist trong `references/quality-checklist.md`; sửa lỗi chắc chắn, giữ TBD cho dữ liệu chưa có bằng chứng.
3. Nếu người dùng yêu cầu DOCX, thực hiện nhánh DOCX bên dưới.
4. Ghi activity log:

```text
node .agents/scripts/activity-log.mjs --skill usecase --file docs/{feature}/use-cases/{UC-ID}-{slug}.md --note "create or update use case {UC-ID}"
```

## Nhánh DOCX theo yêu cầu

Chỉ chạy khi prompt yêu cầu DOCX hoặc Word.

1. Tạo `.docx` cùng basename với Markdown và giữ nguyên chín trường.
2. Dùng skill `documents` cùng runtime từ workspace dependency loader; không dựa vào Python/Node hệ thống.
3. Dùng bố cục tài liệu nghiệp vụ gọn: metadata dạng bảng hai cột; Basic/Alternative/Exception dùng bảng Actor–Hệ thống với độ rộng và padding rõ ràng, không đặt chiều cao hàng cố định.
4. Render DOCX thành PNG bằng `render_docx.py`, xem toàn bộ trang ở 100%, sửa clipping, tràn bảng, khoảng cách hoặc lỗi font rồi render lại.
5. Nếu thiếu LibreOffice/soffice, kiểm tra cấu trúc và nói rõ chưa thể visual-QA; lỗi render khác phải được sửa trước khi bàn giao.
6. Chỉ giao `.md` và `.docx`; không giao ảnh QA trừ khi người dùng yêu cầu.

## Báo cáo hoàn thành

```text
✅ Use Case: docs/{feature}/use-cases/{UC-ID}-{slug}.md
   Actor chính: {actor}
   Basic flow: {N} bước | Alternative: {A} | Exception: {E}
   Quality gate: pass | partial ({TBD})
   DOCX: created + visually verified | not requested | render unavailable
```

## References

- `references/template-guide.md`: quy tắc cho chín trường và flow.
- `references/writing-style.md`: cách viết ngắn, rõ, không thiên kỹ thuật.
- `references/quality-checklist.md`: checklist trước bàn giao.
- `references/examples-general.md`: ví dụ trung tính.
- `assets/uc-template.md`: template đầu ra.
- `../../rules/feature-bootstrap.md`
- `../../rules/approval-gate.md`
- `../../rules/naming-conventions.md`
- `../../rules/changelog.md`
