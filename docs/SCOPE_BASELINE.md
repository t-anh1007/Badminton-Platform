---
type: scope-baseline
status: baseline
updated: 2026-08-04
purpose: Đầu vào duy nhất cho vòng Product Discovery mới. Không phải kết quả discovery.
---

# Scope Baseline — Nền tảng cầu lông

Tài liệu này chỉ chứa **danh mục chức năng và use case đã rút gọn** từ vòng discovery trước.
Toàn bộ phân tích cũ (problem statement, opportunity map, business rules, rủi ro, giả định,
sơ đồ use case, tài liệu UC chi tiết) đã bị xóa và sẽ được làm lại từ đầu.

**Cách dùng:** đây là *sàn tối thiểu* — tập chức năng bắt buộc để hệ thống chạy được.
Vòng discovery mới có nhiệm vụ **khám phá và đề xuất chức năng mới ở phía trên sàn này**,
không phải mô tả lại nó.

## Bối cảnh ràng buộc

| Yếu tố | Giá trị |
|---|---|
| Loại dự án | Đồ án tốt nghiệp đại học |
| Nhân sự | 1 người phát triển (kiêm PO) + 1 người viết tài liệu |
| Thời gian | ~4–6 tháng |
| Người dùng thật | Không bắt buộc; không cần pilot thương mại |
| Hình thái sản phẩm | Web responsive |
| Thanh toán | SePay (100% trả trước, không cọc, không trả tại sân) |

---

## 1. Actor

| Mã | Actor | Loại |
|---|---|---|
| ACT-01 | Người chơi (kiêm vai trò người đặt / người tham gia / người tổ chức kèo theo ngữ cảnh) | Người dùng chính |
| ACT-02 | Nhà cung cấp sân | Người dùng chính |
| ACT-03 | Admin (gộp quản trị + kiểm duyệt + hỗ trợ) | Quản trị |
| ACT-04 | SePay | Hệ thống ngoài |
| ACT-05 | Dịch vụ bản đồ và định vị | Hệ thống ngoài |
| ACT-06 | AI | Hệ thống nội bộ (chỉ hỗ trợ, không tự quyết) |

> Đã bỏ actor **Người tổ chức chuyên nghiệp** so với bản cũ.

---

## 2. Danh mục use case sau rút gọn — 61 UC

### 2.1. Tài khoản và quyền truy cập — `account-access` (8)

| # | Use Case | Actor chính |
|---:|---|---|
| 1 | Đăng ký tài khoản | Người chơi |
| 2 | Xác minh số điện thoại hoặc email | Người chơi |
| 3 | Đăng nhập | Tất cả |
| 4 | Đăng xuất | Tất cả |
| 5 | Đặt lại mật khẩu | Tất cả |
| 6 | Đổi mật khẩu | Tất cả |
| 7 | Quản lý hồ sơ cá nhân | Người chơi |
| 8 | Quản lý quyền truy cập tài khoản (khóa / khôi phục) | Admin |

### 2.2. Nhà cung cấp và lịch sân — `venue-scheduling` (9)

| # | Use Case | Actor chính |
|---:|---|---|
| 1 | Đăng ký nhà cung cấp sân | Người chơi |
| 2 | Xét duyệt nhà cung cấp sân | Admin |
| 3 | Quản lý hồ sơ cơ sở sân | Nhà cung cấp sân |
| 4 | Quản lý danh sách sân con | Nhà cung cấp sân |
| 5 | Thiết lập giờ hoạt động và ngày đóng cửa | Nhà cung cấp sân |
| 6 | Thiết lập biểu giá theo lịch | Nhà cung cấp sân |
| 7 | Thiết lập quy tắc đặt sân (bước thời gian, thời lượng min/max) | Nhà cung cấp sân |
| 8 | Quản lý lịch sân hợp nhất | Nhà cung cấp sân |
| 9 | Ghi nhận booking tại quầy hoặc qua điện thoại | Nhà cung cấp sân |

### 2.3. Tìm sân và booking — `court-booking` (10)

| # | Use Case | Actor chính |
|---:|---|---|
| 1 | Tìm sân bằng danh sách và bản đồ | Người chơi |
| 2 | Lọc và sắp xếp sân | Người chơi |
| 3 | Xem chi tiết cơ sở sân | Người chơi |
| 4 | Xem lịch trống và giá hiện hành | Người chơi |
| 5 | Chọn slot và thời lượng đặt sân | Người chơi |
| 6 | Giữ slot trong 10 phút | Người chơi |
| 7 | Tạo booking đặt sân | Người chơi |
| 8 | Xem chi tiết và lịch sử booking | Người chơi |
| 9 | Hủy booking | Người chơi |
| 10 | Điều chỉnh hoặc hủy booking do phía sân | Nhà cung cấp sân |

### 2.4. Tài chính và tranh chấp — `finance-disputes` (13)

| # | Use Case | Actor chính |
|---:|---|---|
| 1 | Xem số dư và lịch sử giao dịch | Người chơi |
| 2 | Nạp số dư qua SePay | Người chơi |
| 3 | Thanh toán booking bằng số dư | Người chơi |
| 4 | Thanh toán booking qua SePay | Người chơi |
| 5 | Thanh toán phí tham gia kèo | Người chơi |
| 6 | Nhận khoản thanh toán đến muộn vào số dư | Người chơi |
| 7 | Nhận hoàn tiền khi tự hủy | Người chơi |
| 8 | Nhận hoàn toàn bộ do lỗi sân hoặc nền tảng | Người chơi |
| 9 | Theo dõi doanh thu (hoa hồng cố định, không cấu hình) | Nhà cung cấp sân |
| 10 | Yêu cầu rút số dư khả dụng | Nhà cung cấp sân |
| 11 | Xử lý yêu cầu rút tiền (chuyển khoản tay, webhook SePay tự đối soát) | Admin |
| 12 | Gửi tranh chấp giao dịch | Người chơi |
| 13 | Giải quyết tranh chấp giao dịch | Admin |

### 2.5. Kèo và Player Passport — `matchmaking-passport` (11)

| # | Use Case | Actor chính |
|---:|---|---|
| 1 | Tìm và lọc kèo | Người chơi |
| 2 | Tạo và công bố kèo (giao lưu, chia phí) | Người tổ chức kèo |
| 3 | Xem chi tiết kèo | Người chơi |
| 4 | Gửi yêu cầu tham gia kèo | Người chơi |
| 5 | Xét duyệt người tham gia | Người tổ chức kèo |
| 6 | Xác nhận tham gia kèo (sau khi trả phí) | Người chơi |
| 7 | Rút khỏi kèo | Người chơi |
| 8 | Hủy kèo (gồm trường hợp không đủ người) | Người tổ chức kèo |
| 9 | Khai báo trình độ chuẩn hóa | Người chơi |
| 10 | Đánh giá sau trận | Người chơi |
| 11 | Xem Player Passport | Người chơi |

### 2.6. Cộng đồng và hỗ trợ — `community-support` (8)

| # | Use Case | Actor chính |
|---:|---|---|
| 1 | Xem bảng tin cộng đồng công khai | Người chơi |
| 2 | Tạo bài viết | Người chơi |
| 3 | Chỉnh sửa bài viết | Người chơi |
| 4 | Xóa bài viết | Người chơi |
| 5 | Bình luận bài viết | Người chơi |
| 6 | Báo cáo nội dung vi phạm | Người chơi |
| 7 | Kiểm duyệt nội dung cộng đồng | Admin |
| 8 | Gửi và xử lý yêu cầu hỗ trợ (ticket bất đồng bộ) | Người chơi, Admin |

### 2.7. AI — `ai` (2)

| # | Use Case | Actor chính |
|---:|---|---|
| 1 | Nhận gợi ý kèo phù hợp (AI Matchmaker, có giải thích) | Người chơi |
| 2 | Nhận hỗ trợ từ chatbot (RAG trên chính sách + dữ liệu của chính user) | Người chơi |

---

## 3. Đã loại khỏi phạm vi — không đưa lại trong discovery mới

Trừ khi vòng discovery mới có lý do mới và mạnh hơn.

### Cắt vì quá tải nguồn lực

| Hạng mục | Lý do |
|---|---|
| Toàn bộ Giai đoạn 3 cũ: kèo lặp lại, khuyến mãi, AI Revenue Analysis, gói thuê bao, Admin Operations Assistant | Cần dữ liệu lịch sử mà đồ án không có |
| Import CSV sân và lịch | Transition requirement, không phải nghiệp vụ lõi |
| Nhiều tài khoản nhân viên cùng quyền nhà cung cấp | Chỉ là multi-tenancy phẳng, không thêm ý nghĩa nghiệp vụ |
| Actor Người tổ chức chuyên nghiệp + kèo thương mại | Cắt được một actor, một luồng duyệt, một luồng trách nhiệm hoàn tiền |
| Hoa hồng cấu hình được + đảo bút toán + đối soát đầy đủ | Giữ hoa hồng cố định; ledger vẫn bất biến |
| Báo cáo vắng mặt + phản đối vắng mặt | Trùng cơ chế với tranh chấp giao dịch |
| Quản lý master data / danh mục dùng chung | Hardcode |
| Xuất / xóa dữ liệu cá nhân theo chính sách riêng tư | Viết thành chính sách trong báo cáo, không code |
| Quản lý phiên đăng nhập | Giá trị thấp |
| Thích / lưu / chia sẻ bài viết | Giá trị thấp |
| Khiếu nại quyết định kiểm duyệt | Vòng thứ hai của moderation |
| 4/6 AI: Smart Court Recommendation, AI moderation, AI Revenue Analysis, Admin Ops Assistant | Giữ 2 AI làm sâu thay vì 6 AI hời hợt |
| Chat CSKH thời gian thực | Thay bằng ticket bất đồng bộ. *Cập nhật 2026-08-04:* hạ tầng realtime (WebSocket) được phép nhưng **chỉ** cho module ghép kèo live — xem [discovery F-03](discovery/2026-08-04-tinh-nang-moi.md). |

### Cắt từ vòng discovery trước (giữ nguyên quyết định)

CLB và bài riêng của CLB · Vai trò Moderator/Support tách biệt · Vai trò lễ tân/tài chính riêng của nhà cung cấp · Đặt cọc và thanh toán tại sân · Chuyển tiền giữa người dùng · QR check-in bắt buộc · Bằng chứng sở hữu sân · Đồng bộ API thời gian thực với phần mềm cũ · Di chuyển toàn bộ lịch sử cũ · AI tự đặt sân / thanh toán / hoàn tiền / đổi giá / khóa tài khoản · Giải đấu, bảng xếp hạng, gamification · Đa môn thể thao

---

## 4. Ràng buộc bất biến

Vòng discovery mới có thể đề xuất chức năng mới, nhưng không được phá các ràng buộc sau
mà không nêu rõ và xin quyết định của PO:

1. Thanh toán 100% trực tuyến qua SePay hoặc số dư nội bộ.
2. Slot được giữ 10 phút, hết hạn thì tự giải phóng.
3. Nền tảng là nguồn lịch chính thức duy nhất; booking tại quầy cũng khóa lịch.
4. Không có booking xác nhận trùng trong kịch bản đồng thời.
5. Doanh thu khả dụng sau khi ca kết thúc và hết 24 giờ khiếu nại.
6. Số dư không chuyển ngang hàng giữa người dùng.
7. Chỉ một quyền vận hành Admin.
8. AI chỉ hỗ trợ và giải thích; không tự thực hiện hành động nhạy cảm.
9. Cộng đồng chỉ có nội dung công khai.

---

## 5. Câu hỏi kỹ thuật cần chốt trước khi thiết kế

| Câu hỏi | Ảnh hưởng | Trạng thái |
|---|---|---|
| SePay hỗ trợ chính xác webhook/callback nào? Có API hoàn tiền không? | Nếu không có refund API, mọi hoàn tiền phải vào số dư nội bộ | ✅ Chốt 2026-08-04: **không** có API hoàn tiền. Hoàn tiền → ghi có số dư nội bộ (tự động). Rút tiền → chuyển khoản tay + webhook "tiền ra" tự đối soát. |
| Thang trình độ cầu lông dùng hệ nào? | Input bắt buộc của Player Passport và AI Matchmaker | ✅ Chốt 2026-08-04: 5 bậc hiển thị (Mới chơi/Y/TB/TB+/BC) + rating số có độ bất định. |
