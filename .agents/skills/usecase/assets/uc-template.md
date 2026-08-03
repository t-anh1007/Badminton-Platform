# {Use case ID} — {Use case name}

| Trường | Nội dung |
|---|---|
| **Use case ID** | `{UC-ID}` |
| **Use case name** | {Động từ + đối tượng} |
| **Tiền điều kiện** | 1. {Điều kiện có thể kiểm chứng}<br>2. {Điều kiện tiếp theo} |
| **Hậu điều kiện** | 1. {Trạng thái thành công có thể kiểm chứng}<br>2. {Thay đổi hoặc kết quả quan sát được} |
| **Actor chính** | {Tên vai trò cụ thể} |
| **Actor phụ** | {Vai trò/hệ thống hỗ trợ hoặc `Không có`} |

## Basic flow

| {Actor chính cụ thể} | Hệ thống |
|---|---|
| 1. {Actor khởi tạo Use Case} | 2. {Hệ thống phản hồi} |
| 3. {Actor thực hiện hành động tiếp theo} | 4. {Hệ thống xử lý và hiển thị kết quả} |
|  | 5. {Hệ thống hoàn tất hậu điều kiện} |

## Alternative flow

### AF-01 — {Tên luồng thay thế}

- **Rẽ từ Basic flow bước:** {N}
- **Điều kiện:** {Điều kiện dẫn đến đường thành công khác}

| {Actor chính cụ thể} | Hệ thống |
|---|---|
| AF-01.1. {Hành động của Actor nếu có} | AF-01.2. {Phản hồi của Hệ thống} |

- **Kết thúc:** {Quay lại Basic flow bước N hoặc hậu điều kiện thành công khác}

Nếu không có, ghi `Không có`.

## Exception

### EX-01 — {Tên ngoại lệ}

- **Phát sinh tại Basic/Alternative flow bước:** {N hoặc AF-XX.N}
- **Điều kiện:** {Lỗi hoặc điều kiện khiến mục tiêu không hoàn tất}

| {Actor chính cụ thể} | Hệ thống |
|---|---|
| {Hành động phục hồi của Actor nếu có} | EX-01.1. {Hệ thống thông báo/xử lý} |

- **Trạng thái cuối:** {Dữ liệu, giao dịch và trạng thái người dùng sau lỗi}

Nếu không có exception hợp lý, ghi `Không có` và nêu căn cứ trong báo cáo kiểm tra.
