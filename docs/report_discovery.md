# Discovery Summary — Nền tảng cầu lông kết nối

**Trạng thái:** Hoàn tất phỏng vấn 45/45 câu hỏi chính.  
**Kết luận:** Đủ thông tin để hình thành danh mục chức năng và phân ba giai đoạn sơ bộ. Đây chưa phải bằng chứng đã kiểm chứng với thị trường hoặc người dùng thật.

## 1. Problem Statement

Các nhà cung cấp sân có thể đang quản lý lịch trong những công cụ tách rời khỏi kênh tìm và đặt sân. Điều này tạo nguy cơ cập nhật lặp, lịch trống thiếu chính xác và đặt trùng. Đồng thời, người chơi phải sử dụng nhiều kênh riêng biệt để tìm sân, tìm kèo và tham gia cộng đồng.

Giả thuyết nguyên nhân gốc là **dữ liệu lịch bị phân tán và không có một nguồn khả dụng thống nhất nối vận hành sân với marketplace**. Giả thuyết này được hình thành từ khảo sát thị trường trực tuyến, chưa được xác nhận qua phỏng vấn trực tiếp chủ sân.

## 2. Business Goals

Bốn mục tiêu đều thuộc phạm vi sản phẩm:

1. Tạo hành trình đặt sân đáng tin cậy.
2. Số hóa vận hành nhà cung cấp sân.
3. Kết nối người chơi, người tổ chức và kèo phù hợp.
4. Xây dựng cộng đồng cầu lông công khai lâu dài.

Chuỗi giá trị đã chọn:

`Lịch và vận hành đáng tin cậy → Booking/tìm kèo → Community và quay lại`

### Tiêu chí thành công trong khóa luận

- Hoàn thành các luồng nghiệp vụ đầu-cuối bằng kiểm thử chức năng.
- Thu phản hồi từ người dùng đại diện; không bắt buộc pilot thương mại thật.
- Kiểm thử khoảng 100 người dùng đồng thời.
- Tìm kiếm sân có p95 không quá 3 giây.
- Giữ/xác nhận booking không quá 2 giây, không tính thời gian SePay.
- Không có booking xác nhận trùng trong các kịch bản đồng thời đã định nghĩa.
- Mọi thay đổi tiền, quyền và hành động Admin đều có audit.
- Sao lưu hằng ngày và có kiểm thử phục hồi.

## 3. Trạng thái năm lớp requirement

| Lớp | Trạng thái | Nhận định |
|---|---|---|
| Business Requirement | 🟡 | Mục tiêu, chuỗi giá trị và mô hình doanh thu đã rõ; nguyên nhân gốc chưa được phỏng vấn người dùng xác nhận. |
| Stakeholder Requirement | ✅ | Actor và nhu cầu chính đủ rõ ở mức discovery. |
| Functional Requirement | ✅ sơ bộ | Đủ lập danh mục toàn ứng dụng; cần người dùng phê duyệt danh mục. |
| Non-functional Requirement | ✅ sơ bộ | Có tiêu chí kiểm thử chính; một số tiêu chuẩn bảo mật cần xác nhận khi thiết kế. |
| Transition Requirement | ✅ | Đã xác định thiết lập thủ công kết hợp CSV; không tích hợp thời gian thực hệ thống cũ. |

## 4. Stakeholder Map và Jobs To Be Done

| Stakeholder | Jobs To Be Done chính |
|---|---|
| Người chơi đặt sân | Tìm được sân thật sự còn trống, biết đúng giá và hoàn tất thanh toán đáng tin cậy. |
| Người chơi lẻ | Tìm kèo phù hợp về thời gian, khoảng cách, trình độ và chi phí. |
| Người tổ chức kèo | Tạo kèo, tuyển đúng người, quản lý slot, thu phí và xử lý thay đổi. |
| Người tổ chức chuyên nghiệp | Vận hành kèo thương mại, nhận doanh thu và xây dựng uy tín. |
| Nhà cung cấp sân | Quản lý nhiều địa điểm, lịch, giá, booking, nhân viên, doanh thu và công suất. |
| Tài khoản nhân viên nhà cung cấp | Thao tác bằng tài khoản cá nhân nhưng cùng một quyền Nhà cung cấp sân. |
| Admin | Xác minh, vận hành marketplace, xử lý tiền, tranh chấp, nội dung và tài khoản. |
| Hội đồng/giảng viên | Đánh giá tính đúng đắn nghiệp vụ, chất lượng hệ thống và giá trị trình diễn. |
| SePay | Cung cấp kết quả thanh toán/nạp tiền cho các giao dịch tương ứng. |

## 5. Quy trình tương lai cốt lõi

### Booking sân

`Nhà cung cấp được duyệt → tạo/import sân và lịch → công khai khả dụng → người chơi tìm trên list–map/AI → giữ slot 10 phút → thanh toán 100% → xác nhận booking → hoàn thành → chờ khiếu nại 24 giờ → giải phóng doanh thu`

### Tổ chức kèo

`Người tổ chức tạo kèo → liên kết booking hoặc nhập sân ngoài → người chơi xin tham gia → người tổ chức duyệt → thanh toán phí nếu có → xác nhận slot → kèo diễn ra → đối soát/no-show/đánh giá`

### Community

`Đăng bài công khai → tương tác/báo cáo → AI đánh giá rủi ro → ẩn tạm hoặc chuyển Admin → Admin quyết định → tác giả có quyền khiếu nại`

## 6. Opportunity Map

| Vấn đề/giả thuyết | Cơ hội sản phẩm |
|---|---|
| Lịch phân tán, nguy cơ đặt trùng | Một lịch trung tâm cho booking marketplace và booking nội bộ |
| Khó tìm sân đáp ứng cả nhóm | List–map kết hợp Smart Court Recommendation |
| Người chơi phải đọc nhiều bài tìm kèo | Dữ liệu kèo có cấu trúc và AI Matchmaker |
| Trình độ và độ tin cậy chủ yếu tự khai | Player Passport, đánh giá giao dịch và Fair-play Score |
| Giao dịch/hủy/hoàn thực hiện ngoài hệ thống | Trả trước toàn phần, số dư, chính sách tự động và audit |
| Community phân tán ngoài nền tảng | Bảng tin công khai kết nối với kèo và hồ sơ người chơi |
| Chủ sân khó khai thác dữ liệu vận hành | Dashboard và AI Revenue Analysis |
| Admin có nhiều hàng đợi nghiệp vụ | Admin Operations Assistant |

## 7. Đối chiếu benchmark

Pengo là bằng chứng về kèo có cấu trúc, công cụ dành cho người tổ chức, thanh toán và gamification; GiaoLuuCauLong.com là bằng chứng mạnh hơn về map-first, lịch lặp và bộ lọc sát nhu cầu cầu lông. Hai nguồn không được coi là requirement mặc định. :codex-file-citation{path="D:\Khoaluantn\Bao_cao_khao_sat_Pengo.docx" artifact_kind="document"} :codex-file-citation{path="D:\Khoaluantn\Bao_cao_khao_sat_GiaoLuuCauLong_so_sanh_Pengo.docx" artifact_kind="document"}

| Năng lực | Pengo | GiaoLuuCauLong | Phương án dự án |
|---|---|---|---|
| Kèo có dữ liệu cấu trúc | Có | Có | Tiếp nhận và mở rộng |
| Danh sách đồng bộ bản đồ | Một phần | Nổi bật | Tiếp nhận |
| Kèo lặp lại | Chưa quan sát rõ | Có | Đề xuất Giai đoạn 3 |
| Công cụ người tổ chức | Khá mạnh | Cơ bản | Tiếp nhận và mở rộng |
| Danh bạ sân | Có | Tìm sân chưa xác minh ổn định | Nâng thành marketplace |
| Lịch trống và booking trực tiếp | Chưa quan sát | Chưa quan sát | Khác biệt cốt lõi |
| Vận hành đa địa điểm | Chưa quan sát | Chưa quan sát | Khác biệt cốt lõi |
| Ví, đối soát và tranh chấp | Chưa thấy đầy đủ | Chưa quan sát | Sáng kiến mới |
| Player Passport | Chưa quan sát | Chưa quan sát | Sáng kiến mới |
| Bảng tin community | Có một phần | Chưa quan sát | Tiếp nhận có chọn lọc |
| CLB riêng | Chưa đủ bằng chứng | Chưa quan sát | Đã loại khỏi phạm vi |
| Sáu requirement AI | Chưa quan sát | Chưa quan sát | Sáng kiến bắt buộc cụ thể hóa |

## 8. Ba cách ưu tiên đã cân nhắc

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| **Foundation-first — khuyến nghị** | Chứng minh được giao dịch hai phía, tạo dữ liệu thật cho kèo và AI | Community xuất hiện sau nền tảng booking |
| Community-first | Dễ tạo nội dung và người dùng ban đầu | Không giải quyết lịch sai; khó tạo doanh thu giao dịch đáng tin cậy |
| AI-showcase-first | Trình diễn hấp dẫn | Thiếu dữ liệu, dễ thành demo rời rạc và khó đánh giá giá trị |

**Phương án được chọn:** Foundation-first, nhất quán với quyết định booking-first.

---

# 9. Danh mục chức năng đầy đủ

Nguồn:

- **C:** người dùng xác nhận trong discovery.
- **P/G:** bằng chứng từ Pengo/GiaoLuuCauLong.
- **N:** sáng kiến hoặc requirement dẫn xuất mới.

Mỗi chức năng dưới đây thuộc đúng một giai đoạn. Các tiêu chí nghiệm thu chung gồm: giải quyết đúng vấn đề của module, tuân thủ Business Rules, có quyền truy cập phù hợp và có thể kiểm thử đầu-cuối.

## 9.1. Tài khoản, tổ chức và tin cậy

**Vấn đề/giá trị:** xác định đúng actor, cô lập dữ liệu giữa nhà cung cấp và tạo trách nhiệm cá nhân.  
**Rủi ro chính:** tài khoản giả, quyền Admin quá rộng, dùng chung mật khẩu, lộ dữ liệu.

| ID | Chức năng | Actor | Nguồn | Giai đoạn | Phụ thuộc/tiêu chí chính |
|---|---|---|---|---|---|
| IAM-01 | Đăng ký, đăng nhập, xác minh liên hệ, quên mật khẩu | Tất cả | C, G | 1 | Tài khoản và phiên truy cập an toàn |
| IAM-02 | Hồ sơ người chơi, sở thích, quyền hiển thị | Người chơi | C, N | 1 | Nền cho Passport và AI |
| IAM-03 | Đăng ký/xác minh nhà cung cấp và Admin phê duyệt | Nhà cung cấp, Admin | C, P, N | 1 | Không yêu cầu chứng minh sở hữu sân |
| IAM-04 | Tổ chức nhà cung cấp với nhiều tài khoản cá nhân cùng quyền | Nhà cung cấp | C, N | 1 | Mọi thao tác truy được về cá nhân |
| IAM-05 | Đăng ký và phê duyệt người tổ chức chuyên nghiệp | Người chơi, Admin | C, P | 2 | Danh tính, liên hệ, tài khoản nhận tiền |
| IAM-06 | Quản lý, tạm khóa và khôi phục tài khoản | Admin | C, N | 1 | Có lý do và audit |
| IAM-07 | Audit các thao tác tiền, quyền và Admin | Admin | C, N | 1 | Không sửa/xóa mất dấu lịch sử |
| IAM-08 | Đồng ý riêng tư, xuất/xóa dữ liệu phù hợp chính sách | Người dùng, Admin | C, N | 2 | Không xóa dữ liệu bắt buộc giữ cho audit |

## 9.2. Nhà cung cấp, địa điểm và lịch sân

**Vấn đề/giá trị:** tạo một nguồn lịch chính thức, hỗ trợ sân độc lập và chuỗi nhỏ.  
**Đánh giá:** booking nội bộ và marketplace dùng chung lịch; không xuất hiện booking xác nhận trùng.

| ID | Chức năng | Actor | Nguồn | Giai đoạn | Phụ thuộc/tiêu chí chính |
|---|---|---|---|---|---|
| VEN-01 | Hồ sơ nhà cung cấp và nhiều địa điểm | Nhà cung cấp | C, P | 1 | Cô lập theo tổ chức |
| VEN-02 | Quản lý sân con, ảnh, tọa độ và tiện ích | Nhà cung cấp | C, P, G | 1 | Dữ liệu phục vụ tìm kiếm/bản đồ |
| VEN-03 | Giờ hoạt động, ngày nghỉ, đóng sân/bảo trì | Nhà cung cấp | C, P, G | 1 | Không bán thời gian không khả dụng |
| VEN-04 | Bước thời gian, thời lượng tối thiểu/tối đa | Nhà cung cấp | C | 1 | Khoảng đặt phải liên tiếp |
| VEN-05 | Bảng giá theo sân, thứ, giờ và ngày đặc biệt | Nhà cung cấp | C | 1 | Có phiên bản; không đổi booking cũ |
| VEN-06 | Lịch trung tâm và trạng thái khả dụng | Nhà cung cấp | C, N | 1 | Nguồn sự thật duy nhất |
| VEN-07 | Booking nội bộ từ điện thoại/tại quầy | Nhà cung cấp | C, N | 1 | Khóa lịch, không tạo giao dịch SePay |
| VEN-08 | Nhập CSV, xem trước, kiểm tra và báo lỗi | Nhà cung cấp | C, N | 1 | Chỉ ghi sau xác nhận |
| VEN-09 | Phát hiện xung đột và chống đặt trùng | Hệ thống | C, N | 1 | Đạt NFR-04 |
| VEN-10 | Dashboard cơ bản: lịch, công suất và doanh thu | Nhà cung cấp | C, N | 1 | Tách booking nội bộ/marketplace |
| VEN-11 | Tạo và quản lý chương trình khuyến mãi | Nhà cung cấp | C, N | 3 | Phụ thuộc bảng giá; người dùng phê duyệt |
| VEN-12 | AI Revenue Analysis | Nhà cung cấp | C, N | 3 | Cần đủ lịch sử booking/doanh thu |
| VEN-13 | Gói thuê bao và quyền lợi nâng cao | Nhà cung cấp, Admin | C, N | 3 | Quyết định trực tiếp của người dùng |

## 9.3. Khám phá và booking sân

**Vấn đề/giá trị:** giúp người chơi tìm được slot thực và hoàn tất giao dịch khép kín.  
**Đánh giá:** đúng giá, đúng khả dụng, giữ slot 10 phút, thanh toán đầy đủ và xử lý được giao dịch đến muộn.

| ID | Chức năng | Actor | Nguồn | Giai đoạn | Phụ thuộc/tiêu chí chính |
|---|---|---|---|---|---|
| BKG-01 | Tìm sân bằng danh sách đồng bộ bản đồ | Người chơi | C, G, P | 1 | Lọc thời gian, giá, khoảng cách, tiện ích |
| BKG-02 | Chi tiết sân, lịch trống, giá, chính sách | Người chơi | C, P, G | 1 | Dữ liệu theo thời gian chọn |
| BKG-03 | Smart Court Recommendation cho nhóm/kèo | Người chơi, người tổ chức | C, N | 2 | Có giải thích; không tự đặt |
| BKG-04 | Giữ slot cố định 10 phút | Người chơi | C, N | 1 | Tự giải phóng khi hết hạn |
| BKG-05 | Checkout trả trước 100% qua SePay/số dư | Người chơi | C, P | 1 | Không đặt cọc, không trả tại sân |
| BKG-06 | Xử lý thanh toán đến muộn vào số dư | Người chơi | C, N | 1 | Không phục hồi booking hết hạn |
| BKG-07 | Xác nhận, lịch sử, chi tiết và thông báo booking | Người chơi, nhà cung cấp | C, N | 1 | Trạng thái nhất quán |
| BKG-08 | Mẫu chính sách hủy và hoàn tiền tự động | Nhà cung cấp, người chơi | C, N | 1 | Chính sách lưu cùng booking |
| BKG-09 | Tự hoàn thành và xác nhận sử dụng tùy chọn | Nhà cung cấp | C | 1 | Không xác nhận vẫn không thành lỗi |
| BKG-10 | Đánh giá hai chiều sau booking | Người chơi, nhà cung cấp | C, N | 2 | Chỉ sau giao dịch hoàn thành |

## 9.4. Ví, thanh toán, đối soát và tranh chấp

**Vấn đề/giá trị:** bảo vệ tiền người chơi và xác định doanh thu ròng của bên bán.  
**Đánh giá:** mọi biến động có giao dịch nguồn; tổng số dư không sai lệch sau hoàn/đảo giao dịch.

| ID | Chức năng | Actor | Nguồn | Giai đoạn | Phụ thuộc/tiêu chí chính |
|---|---|---|---|---|---|
| FIN-01 | Số dư người chơi: nạp, thanh toán, hoàn và lịch sử | Người chơi | C, N | 1 | Không chuyển ngang hàng |
| FIN-02 | Số dư bên bán: chờ xử lý và khả dụng | Nhà cung cấp/người tổ chức | C, N | 1 | Phân tách trạng thái |
| FIN-03 | Giải phóng doanh thu sau 24 giờ | Hệ thống | C | 1 | Khóa tiền nếu có tranh chấp |
| FIN-04 | Yêu cầu rút tiền và Admin xử lý | Bên bán, Admin | C, N | 1 | Chỉ rút số dư khả dụng |
| FIN-05 | Cấu hình, tính và đảo hoa hồng | Admin, hệ thống | C, N | 1 | Tính trên doanh thu thực giữ |
| FIN-06 | Sổ giao dịch và đối soát | Nhà cung cấp, Admin | C, N | 1 | Lưu giá trị trước/sau điều chỉnh |
| FIN-07 | Khiếu nại, bằng chứng và Admin phân xử | Tất cả, Admin | C, N | 1 | AI chỉ hỗ trợ, Admin quyết định |
| FIN-08 | Báo cáo doanh thu gộp, phí và doanh thu ròng | Nhà cung cấp/người tổ chức | C, N | 1 | Tách theo loại giao dịch |

## 9.5. Kèo, người tổ chức và Player Passport

**Vấn đề/giá trị:** chuẩn hóa tìm kèo, giảm bỏ kèo và tăng độ tin cậy của thành viên.  
**Đánh giá:** người chơi tìm–xin–được duyệt–thanh toán–tham gia; không bán vượt slot.

| ID | Chức năng | Actor | Nguồn | Giai đoạn | Phụ thuộc/tiêu chí chính |
|---|---|---|---|---|---|
| MAT-01 | Danh sách, bộ lọc và chi tiết kèo | Người chơi | C, P, G | 2 | Thời gian, khoảng cách, trình độ, phí |
| MAT-02 | Tạo kèo gắn booking hoặc sân ngoài | Người tổ chức | C, P, G | 2 | Kèo ngoài có nhãn chưa xác minh |
| MAT-03 | Kèo giao lưu và kèo thương mại | Người tổ chức | C, N | 2 | Công khai mục đích và chi phí |
| MAT-04 | Slot, tiêu chí tham gia và khoảng trình độ | Người tổ chức | C, P, G | 2 | Không vượt số chỗ |
| MAT-05 | Xin tham gia, duyệt và từ chối | Người chơi, người tổ chức | C, P | 2 | Có thông báo kết quả |
| MAT-06 | Thanh toán phí và xác nhận slot | Người chơi | C, N | 2 | Trả đủ mới xác nhận |
| MAT-07 | Danh sách thành viên và thông báo thay đổi | Người tổ chức | C, N | 2 | Đồng bộ khi booking thay đổi |
| MAT-08 | Hủy, hoàn phí và đối soát kèo | Người tổ chức, thành viên | C, N | 2 | Hủy do host/thiếu người hoàn 100% |
| MAT-09 | Xác nhận tùy chọn, báo no-show và phản đối | Người tổ chức, thành viên, Admin | C, N | 2 | Tranh chấp chưa ảnh hưởng uy tín |
| MAT-10 | Player Passport và độ tin cậy trình độ | Người chơi | C, N | 2 | Phân biệt tự khai/đã xác minh |
| MAT-11 | Đánh giá hai chiều sau kèo | Thành viên, người tổ chức | C, N | 2 | Công bố sau hai bên/hết hạn |
| MAT-12 | AI Matchmaker có giải thích | Người chơi | C, N | 2 | Không tự tham gia/thanh toán |
| MAT-13 | Kèo lặp lại cho người tổ chức thường xuyên | Người tổ chức | G, P | 3 | Phụ thuộc vòng đời kèo ổn định |

## 9.6. Community công khai và AI moderation

**Vấn đề/giá trị:** tạo tương tác lâu dài mà không cần CLB hoặc mạng xã hội ngoài hệ thống.  
**Đánh giá:** đăng–tương tác–báo cáo–moderate–khiếu nại hoạt động đầu-cuối.

| ID | Chức năng | Actor | Nguồn | Giai đoạn | Phụ thuộc/tiêu chí chính |
|---|---|---|---|---|---|
| COM-01 | Bảng tin và bài viết công khai | Người chơi | C, P | 2 | Không có phạm vi CLB |
| COM-02 | Bình luận, thích, lưu và chia sẻ | Người chơi | C, P, N | 2 | Tuân thủ quyền riêng tư |
| COM-03 | Báo cáo bài viết, bình luận, đánh giá và người dùng | Người dùng | C, G, N | 2 | Tạo vụ việc cho Admin |
| COM-04 | Hàng đợi moderation và khiếu nại | Admin | C, N | 2 | Admin quyết định cuối |
| COM-05 | AI moderation theo mức rủi ro | Admin, người dùng | C, N | 2 | Ẩn tạm rủi ro cao; không tự khóa |
| COM-06 | Hồ sơ công khai và cho phép xuất hiện trong gợi ý | Người chơi | C, N | 2 | Phải opt-in |
| COM-07 | Chatbot hỗ trợ theo ngữ cảnh | Người chơi | C, N | 2 | Không tự thực hiện giao dịch |
| COM-08 | Chatbot đề xuất bài viết và người chơi | Người chơi | C, N | 2 | Giải thích và tôn trọng quyền hiển thị |

## 9.7. Quản trị và năng lực nền tảng

**Vấn đề/giá trị:** cho phép một quyền Admin vận hành toàn bộ marketplace một cách có kiểm soát.

| ID | Chức năng | Actor | Nguồn | Giai đoạn | Phụ thuộc/tiêu chí chính |
|---|---|---|---|---|---|
| ADM-01 | Dashboard và hàng đợi vận hành hợp nhất | Admin | C, N | 1 | Hồ sơ, tiền, tranh chấp, tài khoản |
| ADM-02 | Quản lý mẫu chính sách, hoa hồng và master data | Admin | C, N | 1 | Có hiệu lực theo thời điểm |
| ADM-03 | Quản lý người dùng, nhà cung cấp và sân | Admin | C, P, N | 1 | Mọi hành động có audit |
| ADM-04 | Tiếp nhận hỗ trợ và quản lý vụ việc | Admin | C, N | 1 | Liên kết booking/giao dịch nguồn |
| ADM-05 | Quản lý nội dung và khiếu nại moderation | Admin | C, N | 2 | Phụ thuộc community |
| ADM-06 | Dashboard toàn marketplace | Admin | C, N | 2 | Booking, doanh thu, rủi ro, nội dung |
| ADM-07 | Admin Operations Assistant | Admin | C, N | 3 | Cần dữ liệu hàng đợi và audit trưởng thành |
| ADM-08 | Sao lưu, phục hồi và xuất audit | Admin | C, N | 1 | Đạt NFR-05 đến NFR-07 |

---

# 10. Phân chia ba giai đoạn

## Giai đoạn 1 — Marketplace và vận hành đáng tin cậy

Bao gồm toàn bộ chức năng có nhãn **Giai đoạn 1**:

- Tài khoản, nhà cung cấp, nhiều tài khoản nhân viên cùng quyền.
- Địa điểm, sân con, lịch trung tâm, bảng giá và booking nội bộ.
- Nhập CSV.
- List–map, chi tiết sân, giữ slot và checkout.
- SePay, số dư, hoa hồng, hoàn tiền, đối soát và rút tiền.
- Admin hợp nhất, audit, sao lưu và phục hồi.
- Dashboard cơ bản của nhà cung cấp.

**Kết quả trình diễn:** một nhà cung cấp được duyệt, công khai lịch; người chơi tìm và thanh toán; hệ thống không đặt trùng; tiền được đối soát và có thể hoàn/rút.

## Giai đoạn 2 — Kết nối người chơi, tin cậy và community

- Kèo giao lưu và thương mại.
- Người tổ chức chuyên nghiệp.
- Xin tham gia, duyệt, thanh toán, hoàn phí và no-show.
- Player Passport và đánh giá hai chiều.
- Bảng tin công khai và moderation.
- Smart Court Recommendation.
- AI Matchmaker.
- Chatbot hỗ trợ và đề xuất nội dung/người chơi.
- AI moderation.
- Dashboard marketplace nâng cao.

**Lý do:** phụ thuộc dữ liệu sân, booking, giao dịch và tài khoản từ Giai đoạn 1.

## Giai đoạn 3 — Tối ưu hóa và doanh thu nâng cao

- Kèo lặp lại.
- Khuyến mãi.
- AI Revenue Analysis.
- Gói thuê bao và quản lý quyền lợi.
- Admin Operations Assistant.

**Lý do:** cần dữ liệu lịch sử, hành vi ổn định và các hàng đợi vận hành đã tồn tại. Việc đặt thuê bao ở Giai đoạn 3 tuân theo quyết định trực tiếp của bạn.

### Phân bổ AI

| Giai đoạn 2 | Giai đoạn 3 |
|---|---|
| Smart Court Recommendation | AI Revenue Analysis |
| AI Matchmaker | Admin Operations Assistant |
| Chatbot hỗ trợ/đề xuất |  |
| AI moderation |  |

Như vậy AI không bị dồn mặc định vào Giai đoạn 3; thứ tự dựa trên dữ liệu và phụ thuộc.

# 11. Business Rules quan trọng

1. Mọi booking marketplace phải thanh toán 100%; không đặt cọc hoặc trả tại sân.
2. Slot được giữ 10 phút; hết hạn thì giải phóng.
3. Thanh toán SePay đến muộn được cộng vào số dư, không phục hồi booking.
4. Nền tảng là nguồn lịch chính thức; booking nội bộ cũng khóa lịch.
5. Nhà cung cấp chọn mẫu hủy chuẩn; lỗi nhà cung cấp/hệ thống hoàn 100%.
6. No-show không được hoàn nhưng phải có quyền phản đối trước khi ảnh hưởng uy tín.
7. Doanh thu khả dụng sau khi ca/kèo kết thúc và hết 24 giờ khiếu nại.
8. Hoa hồng khấu trừ từ bên bán và tính trên doanh thu thực giữ.
9. Số dư không được chuyển ngang hàng giữa người dùng.
10. Kèo ngoài marketplace phải gắn nhãn chưa xác minh.
11. Kèo thương mại chỉ do người tổ chức chuyên nghiệp đã duyệt tạo.
12. AI chỉ hỗ trợ quyết định; không tự thanh toán, hoàn tiền, đổi giá hoặc khóa tài khoản.
13. AI moderation chỉ được tự ẩn tạm nội dung rủi ro cao.
14. Nền tảng chỉ có một quyền vận hành Admin.
15. Nhà cung cấp có nhiều tài khoản cá nhân nhưng cùng một nhóm quyền.
16. Community chỉ có nội dung công khai; không có CLB hoặc bài riêng của CLB.

# 12. Rủi ro và trường hợp biên

| Rủi ro | Mức | Biện pháp discovery đề xuất |
|---|---|---|
| Cold-start hai phía marketplace | Cao | Onboard một nhóm sân trước; community/kèo ngoài nền tảng hỗ trợ tạo cầu |
| Lịch sai vì nhân viên không nhập booking ngoài | Cao | Lịch trung tâm, audit, cảnh báo xung đột và quy trình vận hành |
| Đặt trùng khi nhiều người thanh toán | Cao | Giữ 10 phút, xử lý duy nhất và kiểm thử đồng thời |
| Sai lệch số dư/hoa hồng | Cao | Ledger bất biến, bút toán đảo và đối soát |
| Nhà cung cấp giả do không chứng minh quyền quản lý sân | Cao | Xác minh danh tính/liên hệ/ngân hàng, Admin duyệt, cơ chế báo cáo |
| Admin bị chiếm quyền | Cao | Đề xuất MFA, xác nhận lại thao tác nhạy cảm và audit không thể sửa |
| Lạm dụng kèo thương mại | Cao | Xác minh người tổ chức, giữ doanh thu và xử lý tranh chấp |
| Đánh giá/no-show trả đũa | Trung bình–cao | Công bố trễ, quyền phản đối và không dùng dữ liệu đang tranh chấp |
| Lộ số điện thoại/vị trí | Cao | Phân quyền, opt-in, dùng vị trí gần đúng khi đủ |
| AI gợi ý sai/thiên lệch | Trung bình–cao | Giải thích, phản hồi, fallback theo quy tắc và không tự thực thi |
| AI moderation false positive | Cao | Ẩn tạm, thông báo, khiếu nại và Admin quyết định |
| Mất dữ liệu hoặc tác vụ nền thất bại | Cao | Sao lưu, phục hồi, retry an toàn và audit |

# 13. Assumptions và Open Questions

## Assumptions

- Giả thuyết lịch phân tán phản ánh vấn đề thật của một phần nhà cung cấp.
- Nhà cung cấp chấp nhận dùng nền tảng làm nguồn lịch chính.
- Có thể tiếp cận người dùng đại diện để đánh giá.
- Sản phẩm được triển khai trước dưới dạng web responsive.
- SePay đáp ứng cơ chế nhận diện và thông báo giao dịch cần thiết.
- Số dư nội bộ hai phía có thể triển khai phù hợp quy định áp dụng.
- Dữ liệu AI ban đầu ít; hệ thống cần fallback theo quy tắc.
- Một sinh viên có khoảng 4–6 tháng thực hiện.
- Community công khai không có CLB vẫn đủ tạo giá trị giữ chân ban đầu.

## Open Questions không cần hỏi thêm trong phiên này

| Open question | Người cần trả lời | Thời điểm |
|---|---|---|
| Vấn đề lịch phân tán có xảy ra phổ biến không? | Chủ sân/nhân viên đại diện | Trước khi khóa Problem Statement trong báo cáo |
| Người chơi đánh giá hành trình booking/tìm kèo thế nào? | Người chơi đại diện | Trong đánh giá khóa luận |
| Quy định áp dụng cho số dư, giữ tiền và rút tiền là gì? | Giảng viên/người có chuyên môn pháp lý–thanh toán | Trước thiết kế chi tiết tài chính |
| SePay hỗ trợ chính xác những callback/luồng hoàn nào? | Tài liệu kỹ thuật/đơn vị SePay | Trước thiết kế tích hợp |
| Tỷ lệ hoa hồng và giá thuê bao cụ thể? | Product Owner | Trước cấu hình triển khai |
| Quyền mời/thu hồi tài khoản nhà cung cấp và đổi tài khoản ngân hàng? | Product Owner/security review | Trước Use Case chi tiết |
| Thang trình độ và công thức Player Passport? | Người chơi/HLV/chuyên gia cầu lông | Trước thiết kế thuật toán |
| Ngưỡng AI moderation và KPI từng AI? | Nhóm AI/giảng viên | Trước kiểm thử AI |
| Mẫu đánh giá người dùng và ngưỡng đạt? | Sinh viên/giảng viên | Trước kế hoạch kiểm thử |
| Kèo lặp lại có giữ trong Giai đoạn 3 không? | Product Owner | Khi phê duyệt danh mục |

# 14. Ý tưởng bị loại khỏi phạm vi

| Ý tưởng | Lý do |
|---|---|
| CLB, thành viên CLB và bài riêng của CLB | Người dùng yêu cầu loại; giảm phân quyền và moderation |
| Vai trò Moderator và Support riêng | Gộp thành một quyền Admin |
| Vai trò quản lý/lễ tân/tài chính riêng của nhà cung cấp | Gộp thành một quyền Nhà cung cấp sân |
| Đặt cọc và thanh toán tại sân | Chỉ thanh toán trực tuyến 100% |
| Chuyển tiền giữa người dùng | Số dư chỉ phục vụ giao dịch nền tảng |
| QR check-in bắt buộc | Nhân viên có thể xác nhận tùy chọn |
| Bằng chứng sở hữu/quyền quản lý sân | Không yêu cầu trong xác minh nhà cung cấp |
| Đồng bộ API thời gian thực phần mềm cũ | Vượt Transition Requirement đã chọn |
| Di chuyển toàn bộ lịch sử cũ | Chỉ nhập cấu hình và booking sắp tới |
| AI tự đặt sân/tham gia/thanh toán | Người dùng phải quyết định |
| AI tự đổi giá/tạo khuyến mãi | Nhà cung cấp phê duyệt |
| AI tự hoàn tiền/khóa tài khoản | Admin quyết định |
| Giải đấu, bảng xếp hạng và gamification | Chỉ là bằng chứng benchmark, chưa gắn với vấn đề ưu tiên |
| Chat thời gian thực | Chưa được xác nhận; tăng đáng kể độ phức tạp |
| Đa môn thể thao | Sản phẩm ưu tiên cầu lông |


# 16. Quyết định nên Grill Me sau khi phê duyệt

Các chủ đề rủi ro cao đáng stress-test, mỗi lần một chủ đề:

1. Số dư nội bộ, giữ tiền 24 giờ và rút tiền.
2. Nền tảng làm nguồn lịch duy nhất nhưng không tích hợp phần mềm cũ.
3. Không yêu cầu bằng chứng quyền quản lý sân.
4. Một quyền Admin có phạm vi quá rộng.
5. Người tổ chức kèo thương mại và trách nhiệm hoàn tiền.
6. AI moderation được tự động ẩn nội dung.
7. Khả năng một sinh viên triển khai toàn bộ Giai đoạn 1 trong 4–6 tháng.
8. Khối lượng bốn AI trong Giai đoạn 2.
