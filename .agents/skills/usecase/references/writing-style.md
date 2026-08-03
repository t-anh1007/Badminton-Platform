# Quy tắc viết Use Case

## Ngôn ngữ

- Mặc định viết tiếng Việt; chuyển toàn bộ artifact sang tiếng Anh khi người dùng yêu cầu.
- Dùng hiện tại đơn, chủ động, câu ngắn.
- Giữ nguyên thuật ngữ và tên Actor của dự án.

## Câu trong flow

- Mỗi bước có một chủ thể và một hành động chính.
- Dùng động từ cụ thể: `chọn`, `nhập`, `xác nhận`, `kiểm tra`, `hiển thị`, `ghi nhận`, `từ chối`.
- Tránh `quản lý`, `xử lý`, `thực hiện`, `hợp lệ`, `phù hợp` nếu chưa nói rõ hành động hoặc tiêu chí.
- Không trộn hành động Actor và Hệ thống trong cùng một ô.
- Không mô tả màu sắc, vị trí pixel hoặc component UI; chỉ dùng đúng nhãn màn hình/nút khi nguồn đã xác định.

## Mức độ chi tiết

Viết điều hệ thống làm và kết quả Actor quan sát được. Không tự phát minh:

- Tên bảng, column, kiểu dữ liệu.
- Endpoint, payload, hàm hoặc service class.
- Framework, SDK, JWT/session hay thuật toán.
- TLS, SLA, thời gian phản hồi, quota hoặc retry count.

Nếu nguồn đã cung cấp một chi tiết kỹ thuật có ý nghĩa truy vết, có thể giữ nguyên nhưng không mở rộng thêm.

## Nhánh và lỗi

- Basic flow chỉ chứa đường thành công mặc định.
- Alternative flow có điều kiện và vẫn thành công.
- Exception có trigger, phản hồi và trạng thái cuối.
- Thông báo chính xác chỉ được ghi khi upstream hoặc người dùng đã cung cấp; nếu chưa có thì dùng TBD.

## Độ dài tham khảo

- Use case name: 2–7 từ.
- Basic flow: đủ từ trigger đến hậu điều kiện; không ép số bước tối thiểu.
- Alternative/Exception: chỉ thêm nhánh có căn cứ và liên quan.
- Nếu một Use Case mang nhiều mục tiêu hoặc quá nhiều nhánh độc lập, đề xuất tách thay vì kéo dài tài liệu.
