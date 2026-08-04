---
type: coverage-matrix
status: living
updated: 2026-08-05
purpose: Trạng thái spec của từng chức năng GĐ1. Đọc file này ở đầu mỗi phiên viết spec để biết làm tiếp module nào.
---

# Ma trận bao phủ — Giai đoạn 1

Trạng thái: `chưa phân tích` · `đang làm rõ` · `đủ context` · `còn câu hỏi mở` · `đã duyệt`

## Tổng quan module

| Module | Chức năng | Trạng thái module | File spec |
|---|---:|---|---|
| `account-access` | 8 | **đã duyệt** 2026-08-05 | [account-access.md](specs/account-access.md) |
| `venue-scheduling` | 9 | **đã duyệt** 2026-08-05 | [venue-scheduling.md](specs/venue-scheduling.md) |
| `court-booking` | 10 | **đã duyệt** 2026-08-05 | [court-booking.md](specs/court-booking.md) |
| `finance-disputes` | 13 | **đã duyệt** 2026-08-05 | [finance-disputes.md](specs/finance-disputes.md) |

**Tiến độ: 40/40 chức năng đã duyệt (100%).** Spec Giai đoạn 1 hoàn tất. Gói bàn giao cho
Codex: [phase-1-handoff.md](phase-1-handoff.md).

Tổng GĐ1 tăng từ 39 lên 40 do bổ sung `FIN-14` theo quyết định D15.

## `account-access`

| Mã | Chức năng | Trạng thái | AC |
|---|---|---|---:|
| ACC-01 | Đăng ký tài khoản | đã duyệt | 4 |
| ACC-02 | Xác minh email | đã duyệt | 5 |
| ACC-03 | Đăng nhập | đã duyệt | 6 |
| ACC-04 | Đăng xuất | đã duyệt | 2 |
| ACC-05 | Đặt lại mật khẩu | đã duyệt | 5 |
| ACC-06 | Đổi mật khẩu | đã duyệt | 3 |
| ACC-07 | Quản lý hồ sơ cá nhân | đã duyệt | 3 |
| ACC-08 | Quản lý quyền truy cập tài khoản | đã duyệt | 6 |

## `venue-scheduling`

| Mã | Chức năng | Trạng thái | AC |
|---|---|---|---:|
| VEN-01 | Đăng ký nhà cung cấp sân | đã duyệt | 4 |
| VEN-02 | Xét duyệt nhà cung cấp sân | đã duyệt | 5 |
| VEN-03 | Quản lý hồ sơ cơ sở sân | đã duyệt | 4 |
| VEN-04 | Quản lý danh sách sân con | đã duyệt | 5 |
| VEN-05 | Giờ hoạt động và ngày đóng cửa | đã duyệt | 6 |
| VEN-06 | Biểu giá theo lịch | đã duyệt | 5 |
| VEN-07 | Quy tắc đặt sân | đã duyệt | 4 |
| VEN-08 | Lịch sân hợp nhất | đã duyệt | 5 |
| VEN-09 | Booking tại quầy | đã duyệt | 5 |

## `court-booking`

Không có chức năng đánh giá booking sân (quyết định D7).

| Mã | Chức năng | Trạng thái | AC |
|---|---|---|---:|
| BOK-01 | Tìm sân bằng danh sách và bản đồ | đã duyệt | 4 |
| BOK-02 | Lọc và sắp xếp sân | đã duyệt | 3 |
| BOK-03 | Xem chi tiết cơ sở sân | đã duyệt | 2 |
| BOK-04 | Xem lịch trống và giá hiện hành | đã duyệt | 6 |
| BOK-05 | Chọn slot và thời lượng | đã duyệt | 5 |
| BOK-06 | Giữ slot trong 10 phút | đã duyệt | 5 |
| BOK-07 | Tạo booking đặt sân | đã duyệt | 5 |
| BOK-08 | Xem chi tiết và lịch sử booking | đã duyệt | 5 |
| BOK-09 | Hủy booking | đã duyệt | 7 |
| BOK-10 | Điều chỉnh hoặc hủy do phía sân | đã duyệt | 6 |

## `finance-disputes`

`FIN-05` thuộc GĐ2, không nằm ở đây.

| Mã | Chức năng | Trạng thái | AC |
|---|---|---|---:|
| FIN-01 | Xem số dư và lịch sử giao dịch | đã duyệt | 4 |
| FIN-02 | Nạp số dư qua SePay | đã duyệt | 4 |
| FIN-03 | Thanh toán booking bằng số dư | đã duyệt | 4 |
| FIN-04 | Thanh toán booking qua SePay | đã duyệt | 4 |
| FIN-06 | Nhận thanh toán đến muộn vào số dư | đã duyệt | 3 |
| FIN-07 | Nhận hoàn tiền khi tự hủy | đã duyệt | 6 |
| FIN-08 | Nhận hoàn toàn bộ do lỗi sân | đã duyệt | 5 |
| FIN-09 | Theo dõi doanh thu | đã duyệt | 4 |
| FIN-10 | Yêu cầu rút số dư khả dụng | đã duyệt | 6 |
| FIN-11 | Xử lý yêu cầu rút tiền | đã duyệt | 6 |
| FIN-12 | Gửi tranh chấp giao dịch | đã duyệt | 6 |
| FIN-13 | Giải quyết tranh chấp giao dịch | đã duyệt | 8 |
| FIN-14 | Đối soát giao dịch chưa khớp | đã duyệt | 10 |
