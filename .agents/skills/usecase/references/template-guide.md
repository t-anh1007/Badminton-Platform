# Hướng dẫn template Use Case

## Mục lục

1. Phạm vi Use Case
2. Chín trường bắt buộc
3. Basic flow
4. Alternative flow
5. Exception
6. Dữ liệu chưa rõ

## 1. Phạm vi Use Case

Một Use Case đúng phạm vi có một Actor chính, một mục tiêu nghiệp vụ và thường hoàn tất trong một phiên tương tác. Kết quả phải đủ ý nghĩa để Actor có thể dừng công việc mà không cảm thấy nhiệm vụ còn dang dở.

Tên Use Case dùng động từ + đối tượng, ví dụ `Đặt lịch hẹn`, `Phê duyệt yêu cầu nghỉ phép`. Tránh `Quản lý`, `Xử lý` hoặc danh từ đứng riêng nếu chưa thể hiện mục tiêu cụ thể.

## 2. Chín trường bắt buộc

### Use case ID

Dùng `UC-<MODULE>-<NN>`, ví dụ `UC-BOOKING-01`. Kiểm tra trùng ID trong `docs/{feature}/use-cases/` trước khi ghi.

### Use case name

Gồm động từ + đối tượng, không chèn Actor vào tên.

### Tiền điều kiện

Chỉ ghi điều kiện phải đúng trước khi flow bắt đầu và có thể kiểm chứng. Không ghi động cơ, mong muốn hoặc chi tiết triển khai.

### Hậu điều kiện

Ghi trạng thái có thể kiểm chứng sau khi Basic flow hoặc Alternative flow thành công. Dùng ngôn ngữ nghiệp vụ, ví dụ `Yêu cầu được ghi nhận ở trạng thái Đã gửi`, không tự đặt tên bảng hoặc column.

### Actor chính

Vai trò khởi tạo và nhận giá trị từ Use Case. Dùng tên cụ thể như `Khách hàng`, `Nhân viên lễ tân`, `Quản trị viên sân`; không dùng `User` khi đã biết vai trò.

### Actor phụ

Người hoặc hệ thống hỗ trợ flow nhưng không sở hữu mục tiêu chính. Không có thì ghi `Không có`.

### Basic flow

Đường thành công mặc định, từ trigger đến hậu điều kiện.

### Alternative flow

Đường khác Basic flow nhưng vẫn đạt mục tiêu hoặc một hậu điều kiện thành công đã xác định.

### Exception

Đường lỗi khiến mục tiêu không hoàn tất hoặc chỉ hoàn tất một phần. Phải nêu trạng thái cuối để developer và QA biết dữ liệu/giao dịch đang ở đâu.

## 3. Basic flow

- Dùng bảng hai cột `{Actor chính} | Hệ thống`.
- Đánh số liên tục trên cả hai cột: `1`, `2`, `3`...
- Mỗi ô chứa một hành động chính, chủ thể rõ ràng.
- Có thể để trống ô đối diện khi nhiều hành động liên tiếp thuộc cùng một phía.
- Không đặt điều kiện, nhánh hoặc lỗi trong Basic flow.
- Bước đầu là trigger; bước cuối đạt hậu điều kiện.

Không viết endpoint, payload, function, service class, framework, schema, tên bảng hoặc column nếu nguồn nghiệp vụ không cung cấp và người dùng không yêu cầu đặc tả kỹ thuật.

## 4. Alternative flow

Mỗi luồng phải có:

- Mã `AF-XX` và tên.
- Bước rẽ từ Basic flow.
- Điều kiện kích hoạt.
- Bảng hai cột Actor–Hệ thống.
- Điểm quay lại Basic flow hoặc hậu điều kiện thành công khác.

Không dùng Alternative flow cho lỗi khiến mục tiêu thất bại; trường hợp đó thuộc Exception.

## 5. Exception

Mỗi ngoại lệ phải có:

- Mã `EX-XX` và tên.
- Bước phát sinh trong Basic hoặc Alternative flow.
- Điều kiện/lỗi cụ thể.
- Phản hồi của Actor và Hệ thống trong bảng hai cột.
- Trạng thái cuối: dữ liệu có được lưu không, giao dịch có hoàn tác không, Actor có thể thử lại hay phải dừng.

Chỉ thêm ngoại lệ liên quan đến Use Case. Không tự động nhét mọi lỗi mạng, timeout, concurrency hoặc phân quyền nếu không phù hợp với flow.

## 6. Dữ liệu chưa rõ

Không bịa giá trị. Đặt `<!-- TBD: câu hỏi cụ thể -->` ngay tại trường liên quan và đưa gap vào preview trước khi ghi. Khi upstream đã trả lời, dùng lại câu trả lời và không hỏi lần nữa.
