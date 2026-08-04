# Prompt phỏng vấn hoàn thiện đặc tả Giai đoạn 1

**Điều kiện tiên quyết:** `docs/product/phasing.md` đã tồn tại với `status: approved`.
Nếu chưa, chạy [phase-0-phasing-approval.md](phase-0-phasing-approval.md) trước.

**Vị trí trong chuỗi:** phiên 0 chốt phân giai đoạn → **phiên này** viết và duyệt spec
Giai đoạn 1 → phiên sau dùng `/goal-griller` dựng goal triển khai cho Codex từ gói
bàn giao mà phiên này để lại.

**Nhịp làm việc:** mỗi lần chạy chỉ xử lý 1 đến 2 module. Prompt có cơ chế đọc
trạng thái để nối tiếp phiên trước.

---

```text
/goal-griller

Hãy phỏng vấn tôi nhằm thu thập, chuẩn hóa và xác nhận đầy đủ context nghiệp vụ
cho các chức năng thuộc Giai đoạn 1.

## 0. Cách áp dụng skill goal-griller trong phiên này

Phiên này dùng kỷ luật phỏng vấn của goal-griller: hỏi đúng một câu tại một thời
điểm, luôn kèm phương án khuyến nghị, và tự tra tài liệu thay vì hỏi khi câu trả lời
có thể tìm được.

Hai điều chỉnh so với mặc định của skill:

1. Goal Prompt Contract chưa áp dụng ở phiên này. Không xuất `/goal`, không gọi
   `create_goal` hay `set_goal`. Đầu ra của phiên là tài liệu spec.
2. Hard Gate 6 trường không dùng làm cổng dừng phỏng vấn, mà dùng làm khung cho
   gói bàn giao ở mục 9. Toàn bộ context thu được phải được ghi ra file theo đúng
   6 trường đó, để phiên tạo goal kế tiếp dựng được `/goal` và lập plan thực thi
   mà không phải phỏng vấn lại từ đầu.

Nói cách khác: implementation goal vẫn sẽ được tạo, nhưng chỉ sau khi spec được
tôi phê duyệt, và được tạo từ gói bàn giao chứ không phải từ trí nhớ hội thoại.

## 1. Mục tiêu của phiên làm việc

Tạo đủ context để hoàn thiện và phê duyệt:

- Functional Specification.
- User Story.
- Acceptance Criteria.
- Workflow chức năng.
- Business Rules.
- Trạng thái và điều kiện chuyển trạng thái.
- Phạm vi và quan hệ phụ thuộc giữa các chức năng.

Không lập implementation plan, không thiết kế kỹ thuật chi tiết và không viết code
trong phiên này.

## 2. Nguồn sự thật và cách vào việc

Đọc theo đúng thứ tự ưu tiên sau. Khi mâu thuẫn, tài liệu đứng trước thắng:

1. `docs/product/phasing.md` — danh sách chức năng Giai đoạn 1 và mã chức năng
   có thẩm quyền. Chỉ dùng khi `status: approved`.
2. `docs/SCOPE_BASELINE.md` — ràng buộc bất biến và ranh giới phạm vi.
3. `docs/product/specs/` — các module đã spec ở phiên trước.
4. `docs/product/coverage-matrix.md` — trạng thái tiến độ.
5. `docs/architecture/system-architecture.md`, `data-model.md`, `ai-design.md`, `flows.md`.
6. `docs/decisions/` — các ADR còn hiệu lực.

Loại trừ hoàn toàn, không được coi là nguồn: `.harness-backup/`, `legacy/`,
và `AGENTS.md` ở gốc repo.

Không hỏi tôi những thông tin có thể tìm thấy trong các tài liệu trên.

Nếu `docs/product/phasing.md` không tồn tại hoặc chưa ở trạng thái approved, hãy
dừng lại và báo cho tôi biết cần chạy phiên 0 trước. Không tự suy luận danh sách
Giai đoạn 1.

Đầu phiên, hãy đọc `docs/product/coverage-matrix.md` để xác định module nào đã
xong và module nào cần làm tiếp, rồi đề xuất phạm vi cho phiên hiện tại: 1 đến 2
module. Không cố xử lý toàn bộ Giai đoạn 1 trong một phiên.

## 3. Ràng buộc đã chốt, không hỏi lại

- 9 ràng buộc bất biến tại `docs/SCOPE_BASELINE.md` mục 4.
- SePay không có API hoàn tiền. Hoàn tiền ghi có vào số dư nội bộ, tự động.
  Rút tiền là chuyển khoản tay, đối soát bằng webhook tiền ra.
- Thang trình độ: 5 bậc hiển thị, Mới chơi / Y / TB / TB+ / BC, kèm rating số
  có độ bất định.
- WebSocket được phép dùng.
- Danh sách đã loại khỏi phạm vi tại `docs/SCOPE_BASELINE.md` mục 3.
- Mã chức năng và phân giai đoạn đã chốt ở `docs/product/phasing.md`.

Nếu spec buộc phải phá một trong các ràng buộc trên, hãy dừng và hỏi tôi.

## 4. Phân chia quyền quyết định

Bạn phải chủ động:

- Đọc và tổng hợp tài liệu.
- Dựng workflow cho từng chức năng.
- Phát hiện thiếu sót, mâu thuẫn và trường hợp ngoại lệ.
- Đề xuất phương án nghiệp vụ.
- Cập nhật các chức năng liên quan sau mỗi quyết định.
- Hoàn thiện bản nháp spec để tôi review.

Chỉ dừng lại phỏng vấn tôi khi ít nhất một trong hai điều kiện sau đúng:

a. Quyết định mâu thuẫn với một ràng buộc đã chốt ở mục 3.
b. Tồn tại từ hai phương án trở lên cho ra kết quả nghiệp vụ khác biệt rõ rệt,
   và không có căn cứ trong tài liệu để chọn.

Ưu tiên hỏi khi vấn đề chạm vào: chính sách nghiệp vụ; tiền, thanh toán, hoàn tiền,
rút tiền hoặc tranh chấp; actor và quyền hạn; trạng thái và điều kiện chuyển trạng
thái; phụ thuộc giữa nhiều module; hoặc lựa chọn khó đảo ngược sau khi triển khai.

Mọi chi tiết còn lại: tự đề xuất mặc định hợp lý, đánh dấu rõ là giả định, gom lại
và trình tôi duyệt theo lô ở cuối mỗi module. Không hỏi lẻ từng cái.

## 5. Quy tắc phỏng vấn

1. Bắt đầu bằng cách nhắc lại ngắn gọn phạm vi phiên và mục tiêu bạn hiểu được.
2. Chỉ hỏi đúng một câu tại một thời điểm.
3. Ưu tiên câu hỏi có ảnh hưởng đến nhiều module hoặc chức năng trước.
4. Không hỏi lại nội dung đã được xác nhận.
5. Mỗi câu hỏi phải bao gồm: vấn đề cần quyết định, những chức năng bị ảnh hưởng,
   phương án bạn khuyến nghị, và lý do ngắn gọn.
6. Chỉ đưa 2 đến 3 phương án khi thực sự tồn tại nhiều lựa chọn hợp lý.
7. Sau mỗi câu trả lời: ghi nhận quyết định, cập nhật giả định và câu hỏi còn mở,
   xác định workflow bị ảnh hưởng, rồi chuyển sang câu hỏi có giá trị cao nhất tiếp theo.
8. Không biến buổi phỏng vấn thành việc xác nhận từng màn hình hoặc từng nút bấm.
9. Có thể gộp các chức năng dùng chung một quy tắc, nhưng phải bảo đảm từng chức
   năng vẫn được truy vết đầy đủ bằng mã của nó.
10. Không coi im lặng hoặc phản hồi mơ hồ là phê duyệt.

## 6. Context bắt buộc cho mỗi chức năng

Với mỗi chức năng thuộc phạm vi phiên, context cuối cùng phải xác định được:

- Mã chức năng, lấy từ `docs/product/phasing.md`.
- Tên chức năng.
- Module.
- Actor chính và actor liên quan.
- Mục tiêu nghiệp vụ.
- User Story.
- Điều kiện trước.
- Sự kiện kích hoạt.
- Workflow chính.
- Luồng thay thế.
- Luồng lỗi và ngoại lệ.
- Business Rules.
- Trạng thái và chuyển trạng thái liên quan.
- Quyền hạn và giới hạn truy cập.
- Dữ liệu đầu vào và đầu ra ở mức nghiệp vụ.
- Quan hệ phụ thuộc với chức năng khác, ghi bằng mã.
- Nội dung nằm trong phạm vi.
- Nội dung ngoài phạm vi.
- Acceptance Criteria theo Given/When/Then.
- Tiêu chí kiểm chứng.
- Những nội dung cần thể hiện bằng sơ đồ workflow.
- Giả định hoặc câu hỏi còn mở, nếu có.

Không mặc định một chức năng luôn tương ứng với đúng một User Story hoặc một Use
Case. Việc tách hoặc gộp phải dựa trên mục tiêu của actor và ranh giới nghiệp vụ.

## 7. Ghi ra file, không giữ trong hội thoại

Toàn bộ kết quả phải nằm trên đĩa. Không được chỉ in ra chat.

### 7.1. Spec từng module

Ngay khi hoàn thành một module, ghi `docs/product/specs/<module>.md`:

    ---
    type: functional-spec
    module: <mã module>
    phase: 1
    status: draft
    updated: <ngày hôm nay>
    ---

Nội dung: toàn bộ context ở mục 6 cho mọi chức năng của module, cộng ma trận
truy vết Mã chức năng → User Story → Acceptance Criteria → Workflow.

### 7.2. Ma trận bao phủ

Cập nhật `docs/product/coverage-matrix.md` sau mỗi module. Mỗi chức năng một dòng,
trạng thái thuộc một trong: chưa phân tích, đang làm rõ, đủ context, còn câu hỏi mở,
đã duyệt.

### 7.3. Decision Log, giả định, mâu thuẫn

Cập nhật `docs/product/decision-log.md` gồm ba phần tách bạch:

- Quyết định đã xác nhận: nội dung tôi đã chốt rõ ràng, kèm ngày và chức năng bị ảnh hưởng.
- Giả định: nội dung bạn tạm đề xuất nhưng tôi chưa xác nhận.
- Câu hỏi còn mở và mâu thuẫn giữa các tài liệu.

Quyết định nào làm thay đổi chính sách nghiệp vụ thì ngoài decision log còn phải
tạo một ADR trong `docs/decisions/` theo mẫu `docs/templates/decision.md`.

### 7.4. Cập nhật liên tục

Ghi file ngay sau mỗi module, không dồn tới cuối phiên. Nếu phiên bị ngắt giữa
chừng, các file này là toàn bộ trí nhớ còn lại.

## 8. Cổng hoàn thành và phê duyệt từng module

Một module chỉ được coi là xong khi:

- Mọi chức năng của module có đủ context ở mục 6, hoặc câu hỏi mở được đánh dấu rõ.
- Quy tắc dùng chung nhất quán giữa các chức năng.
- Actor và quyền hạn không mâu thuẫn.
- Trạng thái không có chuyển đổi thiếu hoặc vô lý.
- Workflow liên module kết nối đúng với các module đã spec trước đó.
- Acceptance Criteria có thể kiểm chứng khách quan.
- Không còn giả định quan trọng bị trình bày như sự thật.

Khi đạt, trình tôi bản tóm tắt module gồm: danh sách chức năng và trạng thái,
các quyết định đã chốt, danh sách giả định cần tôi duyệt theo lô, câu hỏi còn mở.

Chỉ khi tôi trả lời đúng chuỗi `APPROVE <mã module>`, hãy sửa frontmatter của
file spec module đó thành `status: approved` kèm `approved: <ngày>`, và cập nhật
ma trận bao phủ.

Không tự coi bản nháp là đã duyệt. Không chuyển sang module tiếp theo khi module
hiện tại còn câu hỏi mở chặn, trừ khi tôi đồng ý gác lại tường minh.

## 9. Gói bàn giao, sau khi toàn bộ Giai đoạn 1 được duyệt

Chỉ khi mọi module Giai đoạn 1 đã ở trạng thái approved, hãy ghi
`docs/product/phase-1-handoff.md`.

File này là đầu vào trực tiếp cho phiên `/goal-griller` kế tiếp, nên phải viết
theo đúng 6 trường Hard Gate của skill, cho từng module hoặc từng nhóm chức năng
triển khai được độc lập:

1. **Outcome** — điều gì phải trở thành sự thật khi nhóm chức năng này xong.
2. **Success condition** — bằng chứng kiểm chứng khách quan, dẫn thẳng từ
   Acceptance Criteria đã duyệt.
3. **Scope boundary** — được phép đổi gì, tuyệt đối không đổi gì, nội dung ngoài phạm vi.
4. **Context** — danh sách file Codex phải đọc trước, theo thứ tự: spec module,
   ràng buộc bất biến, ADR liên quan, tài liệu kiến trúc.
5. **Validation loop** — kiểm tra rẻ chạy lặp trong lúc làm, và kiểm tra cuối
   trước khi tuyên bố xong.
6. **Stop and pause rules** — khi nào dừng vì đã xong, khi nào tạm dừng hỏi người.

Kèm theo, ở đầu file:

- Danh sách module và chức năng Giai đoạn 1 kèm mã.
- Thứ tự triển khai đề xuất và phụ thuộc giữa các nhóm.
- Quyết định đã chốt có ảnh hưởng xuyên module.
- Rủi ro còn lại.

Sau khi ghi xong, dừng lại và báo tôi biết gói bàn giao đã sẵn sàng. Việc tạo
`/goal` và lập plan thực thi thuộc phiên sau, không làm trong phiên này.

## 10. Điều kiện phải dừng và hỏi tôi

- `docs/product/phasing.md` thiếu hoặc chưa approved.
- Có mâu thuẫn quan trọng giữa các tài liệu nguồn.
- Một quyết định sẽ thay đổi chính sách nghiệp vụ hoặc phá ràng buộc ở mục 3.
- Có nhiều phương án ảnh hưởng đáng kể đến tiền, quyền hạn hoặc dữ liệu.
- Cần mở rộng phạm vi ra ngoài Giai đoạn 1.
- Không thể tạo Acceptance Criteria có thể kiểm chứng.
- Việc tiếp tục đòi hỏi thiết kế kỹ thuật mà nghiệp vụ chưa đủ rõ.

Bây giờ hãy:

1. Đọc `docs/product/phasing.md` và `docs/product/coverage-matrix.md`.
2. Nếu phasing chưa approved, dừng và báo tôi.
3. Đề xuất phạm vi phiên này: 1 đến 2 module, kèm lý do chọn thứ tự đó.
4. Nhắc lại ngắn gọn mục tiêu và phạm vi bạn hiểu được.
5. Hỏi tôi đúng một câu có ảnh hưởng lớn nhất còn chưa được làm rõ.
```
