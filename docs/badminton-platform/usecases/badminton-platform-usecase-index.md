---
type: usecase-index
feature: badminton-platform
status: draft
updated: 2026-07-19
links:
  - docs/account-access/usecases/account-access-usecase-index.md
  - docs/venue-scheduling/usecases/venue-scheduling-usecase-index.md
  - docs/court-booking/usecases/court-booking-usecase-index.md
  - docs/finance-disputes/usecases/finance-disputes-usecase-index.md
  - docs/matchmaking-passport/usecases/matchmaking-passport-usecase-index.md
  - docs/community-support/usecases/community-support-usecase-index.md
  - docs/ai/usecases/ai-usecase-index.md
---

# Use Case Index tổng thể - Nền tảng cầu lông kết nối

## Mục đích

Đây là index điều phối của toàn dự án. Danh mục 79 Use Case được chia thành bảy module độc lập để tạo bảy sơ đồ Use Case tổng quát, thay vì đưa toàn bộ phạm vi vào một sơ đồ duy nhất.

Nguồn nghiệp vụ là kết quả Product Discovery đã được người dùng phê duyệt và báo cáo `Bao_cao_Phan_tich_De_tai.docx`. Trạng thái `draft` chỉ phản ánh việc danh mục Use Case vừa được chuẩn hóa thành index và chưa qua bước duyệt L1 riêng của skill `usecase-diagram`; không phủ nhận các quyết định Discovery đã được phê duyệt.

## Module diagram index

| STT | Module | Feature slug dùng với skill | Số Use Case | Index nguồn | Giai đoạn chính |
|---:|---|---|---:|---|---|
| 1 | Tài khoản và quyền truy cập | `account-access` | 9 | [[docs/account-access/usecases/account-access-usecase-index.md|Mở index]] | 1 |
| 2 | Nhà cung cấp và lịch sân | `venue-scheduling` | 13 | [[docs/venue-scheduling/usecases/venue-scheduling-usecase-index.md|Mở index]] | 1, 3 |
| 3 | Tìm sân và booking | `court-booking` | 10 | [[docs/court-booking/usecases/court-booking-usecase-index.md|Mở index]] | 1 |
| 4 | Tài chính và tranh chấp | `finance-disputes` | 14 | [[docs/finance-disputes/usecases/finance-disputes-usecase-index.md|Mở index]] | 1, 2, 3 |
| 5 | Kèo và Player Passport | `matchmaking-passport` | 15 | [[docs/matchmaking-passport/usecases/matchmaking-passport-usecase-index.md|Mở index]] | 2, 3 |
| 6 | Cộng đồng và CSKH | `community-support` | 12 | [[docs/community-support/usecases/community-support-usecase-index.md|Mở index]] | 2 |
| 7 | AI | `ai` | 6 | [[docs/ai/usecases/ai-usecase-index.md|Mở index]] | 2, 3 |
|  | **Tổng cộng** |  | **79** |  |  |

## Actor chuẩn toàn dự án

| Mã | Actor | Loại | Định nghĩa dùng thống nhất |
|---|---|---|---|
| ACT-01 | Người chơi | Người dùng chính | Cá nhân tìm sân, đặt sân, tham gia kèo và sử dụng cộng đồng. Quyền người đặt, người tham gia và người tổ chức phát sinh theo ngữ cảnh. |
| ACT-02 | Người tổ chức kèo | Vai trò theo ngữ cảnh | Người chơi đứng ra tạo, tuyển người và điều phối một kèo. |
| ACT-03 | Người tổ chức chuyên nghiệp | Vai trò có xác minh | Người tổ chức được Admin phê duyệt để vận hành kèo thương mại. |
| ACT-04 | Nhà cung cấp sân | Người dùng chính | Đơn vị sân độc lập hoặc chuỗi nhỏ; nhiều tài khoản có thể dùng chung quyền Nhà cung cấp sân. |
| ACT-05 | Admin | Người dùng quản trị | Vai trò vận hành duy nhất, gộp quản trị, kiểm duyệt và hỗ trợ. |
| ACT-06 | SePay | Hệ thống bên ngoài | Cung cấp thông tin giao dịch phục vụ thanh toán và nạp số dư. |
| ACT-07 | Dịch vụ bản đồ và định vị | Hệ thống bên ngoài | Hỗ trợ tọa độ, khoảng cách và hiển thị bản đồ. |
| ACT-08 | AI | Hệ thống nội bộ | Hỗ trợ gợi ý, chatbot, phân tích, kiểm duyệt và vận hành; không tự thực hiện hành động nhạy cảm. |

## Quy tắc sử dụng với usecase-diagram

- Không chạy `$usecase-diagram --feature badminton-platform` vì index tổng thể có 79 Use Case và sẽ tạo sơ đồ không đọc được.
- Chạy skill bảy lần bằng bảy feature slug trong bảng Module diagram index.
- System boundary của cả bảy sơ đồ có tên chính xác là `Badminton Community & Marketplace Platform`, không thêm tiền tố `System:`.
- Mỗi sơ đồ có đúng một package mang nguyên văn tên module trong bảng Module diagram index, ví dụ `Tài khoản và quyền truy cập`.
- Toàn bộ Use Case của module được đặt trực tiếp trong package duy nhất; không chia hoặc lồng thêm package.
- Mỗi module index là nguồn trực tiếp cho một sơ đồ, gồm Actor, Use Case, bằng chứng quan hệ và phụ thuộc chéo module.
- Chỉ vẽ `include`, `extend` hoặc `generalization` khi bảng bằng chứng trong module index giải thích được quan hệ. Các phụ thuộc chéo module không mặc định biến thành quan hệ UML.
- Khi render, tên Actor và Use Case sẽ được gửi đến máy chủ công khai `plantuml.com` theo cơ chế hiện tại của skill.

## Quy tắc phạm vi đã xác nhận

- Hệ thống là marketplace nhiều nhà cung cấp sân - nhiều người chơi, không phải phần mềm cho một chủ sân đơn lẻ.
- Admin là vai trò vận hành duy nhất; không có Moderator hoặc Support tách biệt.
- Nhà cung cấp sân là một quyền thống nhất; không tách quản lý, lễ tân hoặc tài chính.
- Người chơi có quyền theo ngữ cảnh: người đặt, người tham gia và người tổ chức.
- Thanh toán 100% qua SePay hoặc số dư; không đặt cọc và không thanh toán tại sân.
- AI chỉ hỗ trợ và giải thích; không tự đặt sân, tham gia kèo, thanh toán, hoàn tiền, áp giá hoặc khóa tài khoản.
