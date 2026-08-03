# PRODUCT DISCOVERY PROMPT - NỀN TẢNG CẦU LÔNG

## 1. Bối cảnh dự án

Tôi muốn thực hiện Product Discovery cho một nền tảng cầu lông kết nối ba nhóm nhu cầu:

1. Doanh nghiệp/chủ sân cầu lông quản lý sân, lịch trống và booking.
2. Người chơi tìm sân, đặt sân và quản lý lịch chơi.
3. Cộng đồng giao lưu, tìm người chơi, tìm kèo, lập nhóm và thảo luận.

Mục tiêu của phiên làm việc là tìm đúng vấn đề cần giải quyết và xác định đầy đủ danh mục chức năng dự kiến của ứng dụng. Chỉ sau khi discovery hoàn tất mới sắp xếp toàn bộ chức năng đã được chấp nhận vào Giai đoạn 1, Giai đoạn 2 hoặc Giai đoạn 3 theo mức độ ưu tiên, quan hệ phụ thuộc, độ phức tạp và tiến độ thực hiện đồ án.

## 2. Skill và tài liệu phải đọc

Trước khi bắt đầu phỏng vấn, hãy đọc đầy đủ Product Discovery tại:

`D:\Khoaluantn\product-discovery-main\SKILL.md`

Đọc đầy đủ hai báo cáo benchmark:

- `D:\Khoaluantn\Bao_cao_khao_sat_Pengo.docx`
- `D:\Khoaluantn\Bao_cao_khao_sat_GiaoLuuCauLong_so_sanh_Pengo.docx`

Không yêu cầu tôi nhắc lại những thông tin đã có trong các tài liệu trên.

Không kích hoạt Grill Me trong discovery ban đầu. Sau khi đã có Discovery Summary, danh mục chức năng đầy đủ và phương án phân chia ba giai đoạn sơ bộ, hãy đề xuất những quyết định có rủi ro cao cần stress-test. Chỉ khi tôi đồng ý mới đọc và sử dụng:

`C:\Users\firet\.agents\skills\grill-me\SKILL.md`

Khi Grill Me được kích hoạt, chỉ stress-test một chủ đề tại một thời điểm và kết thúc chủ đề khi quyết định, lý do, rủi ro và câu hỏi còn mở đã rõ.

## 3. Mục tiêu discovery

- Xác định vấn đề kinh doanh và nguyên nhân gốc.
- Phân tích nhu cầu riêng của chủ sân, người chơi, nhân viên sân và quản trị viên.
- Làm rõ mô hình kết nối giữa đặt sân, tìm kèo và cộng đồng.
- Xác định giá trị dành cho cả hai phía marketplace.
- Xác định chức năng có thể học từ Pengo và GiaoLuuCauLong.com.
- Phân biệt chức năng quan sát từ đối thủ, nhu cầu đã xác nhận và sáng kiến mới.
- Xác định lợi thế khác biệt có thể kiểm chứng.
- Xác định Business Rules, tiêu chí đánh giá đồ án, rủi ro, giả định và trường hợp biên.
- Xác định đầy đủ chức năng dự kiến của ứng dụng trước khi phân bổ chúng vào ba giai đoạn thực hiện.
- Xây dựng phương án ưu tiên Giai đoạn 1, Giai đoạn 2 và Giai đoạn 3 sau khi discovery hoàn tất.

## 4. Nguyên tắc làm việc bắt buộc

1. Không bắt đầu viết code, thiết kế database, chọn kiến trúc hoặc chốt danh sách chức năng ngay.
2. Không tiếp nhận một feature request như requirement đã được xác nhận.
3. Trước tiên, phân loại intent và kiểm tra năm lớp requirement:
   - Business Requirement.
   - Stakeholder Requirement.
   - Functional Requirement.
   - Non-functional Requirement.
   - Transition Requirement.
4. Trình bày bảng Known/Unknown ở đầu phiên và cập nhật khi có thông tin mới.
5. Ưu tiên hỏi một câu quan trọng mỗi lượt. Chỉ hỏi thêm câu liên quan nếu chúng phụ thuộc chặt chẽ và có thể trả lời cùng nhau.
6. Mỗi câu hỏi phải:
   - Dựa trên context hoặc khoảng trống vừa phát hiện.
   - Giải thích ngắn gọn vì sao quyết định này quan trọng.
   - Đưa ra phương án hoặc câu trả lời được khuyến nghị.
   - Cho phép tôi chọn phương án khác hoặc bổ sung thông tin.
7. Sau mỗi câu trả lời của tôi:
   - Diễn giải lại điều đã hiểu trong 1-2 câu.
   - Phân loại nó là mục tiêu, triệu chứng, nguyên nhân gốc, giả định, ràng buộc, requirement hoặc quyết định.
   - Cập nhật Known/Unknown, assumptions, open questions và decision log.
   - Sau đó mới đặt câu tiếp theo.
8. Không coi chức năng của Pengo hoặc GiaoLuuCauLong.com là requirement mặc định. Xem chúng là bằng chứng thị trường hoặc giả thuyết cần kiểm chứng.
9. Với mỗi chức năng được đề xuất, ghi rõ:
   - Vấn đề được giải quyết.
   - Nhóm người dùng hưởng lợi.
   - Nguồn ý tưởng: Pengo, GiaoLuuCauLong.com, nhu cầu người dùng hoặc sáng kiến mới.
   - Giá trị kinh doanh.
   - Tiêu chí đánh giá trong phạm vi đồ án.
   - Business Rules liên quan.
   - Mức ưu tiên.
   - Giả định, phụ thuộc và rủi ro.
   - Mức độ cần thiết và thứ tự ưu tiên sơ bộ; chưa gán giai đoạn chính thức khi danh mục chức năng chưa hoàn tất.
10. Những ý tưởng AI như AI Matchmaker, gợi ý sân thông minh, chatbot hỗ trợ, phân tích doanh thu, AI moderation và trợ lý vận hành chỉ là giả thuyết cho đến khi discovery làm rõ vấn đề, dữ liệu đầu vào, giá trị và chi phí thực hiện. Sau discovery, chúng được ưu tiên và xếp giai đoạn theo cùng tiêu chí như các chức năng khác; không mặc định đưa toàn bộ AI vào Giai đoạn 3.
11. Chỉ phân chia ba giai đoạn sau khi đã rà soát đủ actor, module, hành trình nghiệp vụ, chức năng và phụ thuộc chính. Mỗi chức năng được chấp nhận phải thuộc đúng một giai đoạn:
    - Giai đoạn 1: ưu tiên cao nhất, tạo nền tảng và các hành trình cốt lõi cần triển khai trước.
    - Giai đoạn 2: mở rộng các hành trình hoặc chức năng phụ thuộc vào Giai đoạn 1.
    - Giai đoạn 3: chức năng nâng cao, tối ưu hoặc có độ phức tạp và phụ thuộc lớn hơn.
12. Việc phân giai đoạn biểu thị thứ tự và tiến độ dự kiến thực hiện chức năng trong đồ án, không được trình bày như bằng chứng đã kiểm chứng với thị trường hoặc người dùng thật.

## 5. Các nhóm rủi ro phải khảo sát

- Bài toán thu hút đồng thời chủ sân và người chơi.
- Lịch trống không chính xác hoặc đặt trùng sân.
- Hủy sân, no-show, đặt cọc và hoàn tiền.
- Người chơi bỏ kèo, kèo thiếu người hoặc chênh lệch trình độ.
- Tài khoản giả, spam, lừa đảo và hành vi không phù hợp.
- Xác minh chủ sân và quyền quản lý sân.
- Phân quyền giữa người chơi, chủ sân, nhân viên sân và quản trị viên.
- Quyền riêng tư của số điện thoại, vị trí và dữ liệu cá nhân.
- Tranh chấp thanh toán.
- Nội dung xấu trong cộng đồng.
- Audit trail, dữ liệu không nhất quán và khả năng phục hồi khi thao tác thất bại.

## 6. Kết quả discovery phải duy trì

- Problem Statement.
- Business goals và tiêu chí đánh giá đồ án.
- Bảng năm lớp requirement.
- Known/Unknown.
- Stakeholder Map.
- Persona hoặc phân khúc người dùng.
- Jobs To Be Done.
- Quy trình hiện tại và pain points.
- Quy trình tương lai đề xuất.
- Opportunity Map.
- Danh mục đầy đủ chức năng dự kiến của ứng dụng, có truy vết nguồn gốc.
- Ma trận so sánh với Pengo và GiaoLuuCauLong.com.
- Business Rules.
- Functional và Non-functional Requirements ở mức discovery.
- Ma trận ưu tiên và phương án phân bổ toàn bộ chức năng được chấp nhận vào Giai đoạn 1, Giai đoạn 2 hoặc Giai đoạn 3 sau khi discovery hoàn tất.
- Danh sách ý tưởng bị loại khỏi phạm vi ứng dụng và lý do loại, nếu có.
- Rủi ro và trường hợp biên.
- Assumptions.
- Open Questions và người cần trả lời.
- Decision Log.

## 7. Điều kiện kết thúc discovery

Chỉ đề xuất kết thúc khi:

- Mục tiêu kinh doanh đã rõ và có thể đánh giá.
- Nguyên nhân gốc đã được phân biệt với triệu chứng.
- Nhu cầu của các stakeholder chính đã đủ rõ.
- Giá trị dành cho hai phía marketplace đã được xác định.
- Các hành trình cốt lõi đã được mô tả.
- Các actor, module, hành trình và chức năng chính đã được rà soát đủ để hình thành danh mục chức năng toàn ứng dụng.
- Có đủ thông tin về mức độ cần thiết, phụ thuộc, độ phức tạp và giá trị trình diễn để ưu tiên chức năng.
- Rủi ro và giả định quan trọng đã được ghi nhận.
- Requirement đủ rõ để chuyển sang phân tích và thiết kế hệ thống.
- Những nội dung chưa xác nhận đã được đưa vào Open Questions.
- Việc hỏi thêm bắt đầu tạo ra ít giá trị mới.

Khi đạt điều kiện dừng, hãy:

1. Trình bày Discovery Summary.
2. Trình bày danh mục đầy đủ chức năng dự kiến của ứng dụng theo actor và module.
3. Đề xuất ma trận ưu tiên và phân bổ mỗi chức năng vào đúng một trong ba giai đoạn; giải thích lý do, phụ thuộc và thứ tự thực hiện.
4. Liệt kê các ý tưởng bị loại khỏi phạm vi ứng dụng và lý do loại, nếu có.
5. Liệt kê assumptions và open questions còn lại.
6. Đề xuất những quyết định cần Grill Me để stress-test.
7. Yêu cầu tôi chỉnh sửa hoặc phê duyệt danh mục chức năng và phương án ba giai đoạn.

Không tạo báo cáo Word trước khi tôi phê duyệt Discovery Summary, danh mục chức năng đầy đủ, phương án phân chia ba giai đoạn và danh sách sơ đồ dự kiến.

Sau khi tôi phê duyệt, hãy đọc:

`D:\Khoaluantn\REPORT_SPEC.md`

Sau đó thực hiện đúng quy định trong file này để tạo báo cáo Word. Không tự chuyển sang viết code hoặc triển khai hệ thống.

## 8. Phản hồi đầu tiên

Trong phản hồi đầu tiên, hãy:

1. Xác nhận Product Discovery và hai báo cáo benchmark đã được đọc.
2. Tóm tắt context đã hiểu trong tối đa 10 dòng.
3. Hiển thị bảng năm lớp requirement ban đầu.
4. Hiển thị bảng Known/Unknown ban đầu.
5. Chỉ hỏi một câu discovery có mức ưu tiên cao nhất.
6. Kèm theo phương án trả lời được khuyến nghị.
