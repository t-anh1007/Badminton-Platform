# Prompt phiên 0 — Chốt phân giai đoạn

**Dùng khi nào:** trước mọi phiên viết spec. Repo hiện chỉ có danh mục chức năng
phẳng (`docs/SCOPE_BASELINE.md`, 61 UC / 7 module) và chưa có phân giai đoạn nào
được phê duyệt, nên phiên spec Giai đoạn 1 sẽ dừng ngay câu đầu nếu chưa chạy phiên này.

**Đầu ra:** `docs/product/phasing.md` với `status: approved`.

**Phiên kế tiếp:** [goal-griller-phase-1-spec-interview.md](goal-griller-phase-1-spec-interview.md).

---

```text
Hãy phỏng vấn tôi để chốt phương án phân bổ toàn bộ chức năng đã được chấp nhận
vào Giai đoạn 1, Giai đoạn 2 và Giai đoạn 3, và chốt quy ước mã chức năng dùng
xuyên suốt dự án.

## 1. Mục tiêu của phiên làm việc

Mục tiêu duy nhất là tạo ra một tài liệu phân giai đoạn được tôi phê duyệt tường minh,
đủ để phiên sau bắt đầu viết đặc tả chi tiết cho Giai đoạn 1.

Đây chưa phải phiên viết spec.

Không viết Functional Specification, không viết User Story, không viết Acceptance
Criteria, không thiết kế kỹ thuật, không tạo goal và không viết code.

## 2. Nguồn sự thật

Đọc theo đúng thứ tự ưu tiên sau. Khi mâu thuẫn, tài liệu đứng trước thắng:

1. `docs/SCOPE_BASELINE.md` — status baseline. Danh mục 61 use case / 7 module,
   9 ràng buộc bất biến, danh sách đã loại khỏi phạm vi, 2 câu hỏi kỹ thuật đã chốt.
2. `docs/discovery/2026-08-04-tinh-nang-moi.md` — status draft. 6 tính năng mới
   đề xuất thêm; chưa được duyệt, phải xử lý tường minh ở mục 4 bên dưới.
3. `docs/architecture/system-architecture.md`, `data-model.md`, `ai-design.md`, `flows.md`.
4. `docs/decisions/0002-tech-stack-microservices.md` và các ADR còn hiệu lực.

Loại trừ hoàn toàn, không được coi là nguồn: `.harness-backup/`, `legacy/`,
và `AGENTS.md` ở gốc repo (bản trùng lặp của `.claude/CLAUDE.md`).

Không hỏi tôi những thông tin có thể tìm thấy trong các tài liệu trên.

## 3. Việc phải làm

### 3.1. Chốt quy ước mã chức năng

`SCOPE_BASELINE.md` chỉ đánh số trong bảng, chưa có mã ổn định. Không có mã thì
ma trận truy vết ở các phiên sau không dựng được.

Hãy đề xuất một quy ước mã ngắn, ổn định, gắn với module, ví dụ dạng
`<MODULE>-<số thứ tự>` và gán mã cho toàn bộ chức năng được chấp nhận.

Mã đã cấp là bất biến. Chức năng bị loại khỏi phạm vi thì mã của nó bị bỏ trống,
không tái sử dụng cho chức năng khác.

### 3.2. Phân bổ chức năng vào ba giai đoạn

Mỗi chức năng được chấp nhận phải thuộc đúng một giai đoạn.

Tiêu chí phân bổ, xếp theo mức độ quan trọng:

1. Phụ thuộc kỹ thuật và nghiệp vụ: cái gì phải có trước mới làm được cái sau.
2. Giai đoạn 1 phải tự chạy được end-to-end mà không cần bất kỳ chức năng nào
   của Giai đoạn 2 hoặc 3. Nếu một chức năng Giai đoạn 1 phụ thuộc chức năng ở
   giai đoạn sau, đó là lỗi phân bổ và phải sửa.
3. Độ phức tạp so với ràng buộc thực tế: một người phát triển, khoảng 4 đến 6 tháng.
4. Giá trị khi bảo vệ đồ án.

### 3.3. Xử lý 6 tính năng mới đang ở trạng thái draft

`docs/discovery/2026-08-04-tinh-nang-moi.md` chưa được duyệt. Với từng tính năng,
hãy đề xuất một trong ba kết luận và nêu lý do ngắn gọn:

- Chấp nhận vào phạm vi và gán giai đoạn.
- Hoãn, ghi rõ điều kiện để xét lại.
- Loại, ghi rõ lý do.

Không được âm thầm đưa tính năng draft vào Giai đoạn 1 như thể đã được duyệt.

### 3.4. Kiểm tra tính nhất quán

Trước khi trình bày phương án, hãy tự kiểm:

- Mọi chức năng trong danh mục đều đã có mã và đúng một giai đoạn.
- Không có phụ thuộc ngược từ giai đoạn trước sang giai đoạn sau.
- Phương án không phá 9 ràng buộc bất biến ở `SCOPE_BASELINE` mục 4.
- Không đưa lại nội dung đã nằm trong danh sách loại khỏi phạm vi ở mục 3,
  trừ khi có lý do mới và mạnh hơn, và lý do đó được nêu rõ để tôi quyết định.
- Giai đoạn 1 tạo thành ít nhất một hành trình nghiệp vụ hoàn chỉnh có thể demo.

## 4. Ràng buộc đã chốt, không hỏi lại

Những nội dung sau đã được quyết định và phải được tôn trọng, không đưa ra
phỏng vấn lại trừ khi phương án phân giai đoạn buộc phải phá vỡ chúng:

- 9 ràng buộc bất biến tại `docs/SCOPE_BASELINE.md` mục 4.
- SePay không có API hoàn tiền. Hoàn tiền ghi có vào số dư nội bộ, tự động.
  Rút tiền là chuyển khoản tay, đối soát bằng webhook tiền ra.
- Thang trình độ: 5 bậc hiển thị, Mới chơi / Y / TB / TB+ / BC, kèm rating số
  có độ bất định.
- WebSocket được phép dùng. Ràng buộc tránh hạ tầng realtime đã được gỡ.
- Triển khai: backend, PostgreSQL, Redis, RabbitMQ trên Railway; frontend trên Vercel.

Nếu một phương án buộc phải phá một trong các ràng buộc trên, hãy dừng và hỏi tôi.

## 5. Quy tắc phỏng vấn

1. Bắt đầu bằng cách nhắc lại ngắn gọn phạm vi và mục tiêu bạn hiểu được.
2. Chỉ hỏi đúng một câu tại một thời điểm.
3. Mỗi câu hỏi phải nêu: vấn đề cần quyết định, những chức năng bị ảnh hưởng,
   phương án bạn khuyến nghị, và lý do ngắn gọn.
4. Chỉ đưa 2 đến 3 phương án khi thực sự tồn tại nhiều lựa chọn hợp lý.
5. Chỉ hỏi khi quyết định làm thay đổi ranh giới giai đoạn, phá một ràng buộc
   bất biến, hoặc thay đổi kết luận về một tính năng draft. Những chi tiết còn lại
   hãy tự đề xuất mặc định và ghi rõ là giả định.
6. Không hỏi lại nội dung đã nằm ở mục 4.
7. Không coi im lặng hoặc phản hồi mơ hồ là phê duyệt.

## 6. Đầu ra

Ghi ra file `docs/product/phasing.md` với frontmatter:

    ---
    type: phasing
    status: draft
    updated: <ngày hôm nay>
    owner: Tuan Anh (PO)
    builds_on: docs/SCOPE_BASELINE.md
    ---

Nội dung file gồm:

1. Quy ước mã chức năng, kèm cách cấp mã cho chức năng mới về sau.
2. Bảng đầy đủ: Mã chức năng, Tên, Module, Actor chính, Giai đoạn, Lý do xếp
   giai đoạn, Phụ thuộc vào mã nào.
3. Kết luận cho từng tính năng trong 6 tính năng draft: chấp nhận, hoãn hay loại.
4. Danh sách hành trình nghiệp vụ hoàn chỉnh mà Giai đoạn 1 phủ được.
5. Giả định và câu hỏi còn mở.
6. Rủi ro của phương án phân bổ này.

Sau khi ghi file, trình bày cho tôi bản tóm tắt và yêu cầu tôi review.

## 7. Cơ chế phê duyệt

Chỉ khi tôi trả lời đúng chuỗi `APPROVE PHASING`, hãy sửa frontmatter của
`docs/product/phasing.md` thành `status: approved` và bổ sung `approved: <ngày>`.

Trước khi có chuỗi đó, tài liệu vẫn là draft và không được dùng làm căn cứ cho
phiên viết spec.

Không tự coi bản nháp là đã duyệt.

## 8. Điều kiện phải dừng và hỏi tôi

- Danh mục chức năng trong repo mâu thuẫn với nhau.
- Một phương án phân bổ buộc phải phá ràng buộc bất biến.
- Không thể đưa một chức năng vào bất kỳ giai đoạn nào mà không tạo phụ thuộc ngược.
- Cần mở rộng phạm vi ra ngoài danh mục đã được chấp nhận.

Bây giờ hãy:

1. Đọc các nguồn sự thật ở mục 2.
2. Nhắc lại ngắn gọn phạm vi và mục tiêu bạn hiểu được.
3. Hỏi tôi đúng một câu có ảnh hưởng lớn nhất tới ranh giới Giai đoạn 1.
```
