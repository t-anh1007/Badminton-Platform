# Ví dụ Use Case trung tính

## UC-APPOINTMENT-01 — Đặt lịch hẹn

| Trường | Nội dung |
|---|---|
| **Use case ID** | `UC-APPOINTMENT-01` |
| **Use case name** | Đặt lịch hẹn |
| **Tiền điều kiện** | 1. Khách hàng đã đăng nhập.<br>2. Có ít nhất một khung giờ còn nhận lịch. |
| **Hậu điều kiện** | 1. Lịch hẹn được ghi nhận ở trạng thái Đã xác nhận.<br>2. Khung giờ không còn hiển thị là khả dụng cho khách hàng khác. |
| **Actor chính** | Khách hàng |
| **Actor phụ** | Nhân viên phụ trách |

## Basic flow

| Khách hàng | Hệ thống |
|---|---|
| 1. Chọn chức năng **Đặt lịch hẹn**. | 2. Hiển thị các ngày và khung giờ còn nhận lịch. |
| 3. Chọn ngày, giờ và nhập nội dung cuộc hẹn. | 4. Kiểm tra thông tin và hiển thị bản tóm tắt. |
| 5. Xác nhận đặt lịch. | 6. Ghi nhận lịch hẹn và hiển thị kết quả thành công. |

## Alternative flow

### AF-01 — Chọn người phụ trách khác

- **Rẽ từ Basic flow bước:** 3
- **Điều kiện:** Khách hàng muốn chọn một người phụ trách cụ thể.

| Khách hàng | Hệ thống |
|---|---|
| AF-01.1. Chọn người phụ trách mong muốn. | AF-01.2. Chỉ hiển thị các khung giờ khả dụng của người đó. |

- **Kết thúc:** Quay lại Basic flow bước 3 để chọn khung giờ.

## Exception

### EX-01 — Khung giờ vừa được người khác đặt

- **Phát sinh tại Basic flow bước:** 6
- **Điều kiện:** Khung giờ không còn khả dụng tại thời điểm xác nhận.

| Khách hàng | Hệ thống |
|---|---|
|  | EX-01.1. Không ghi nhận lịch hẹn và thông báo khung giờ đã hết. |
| EX-01.2. Chọn một khung giờ khác hoặc dừng thao tác. | EX-01.3. Hiển thị lại danh sách khung giờ hiện còn khả dụng. |

- **Trạng thái cuối:** Không có lịch hẹn mới; dữ liệu lựa chọn cũ không làm khóa khung giờ.
