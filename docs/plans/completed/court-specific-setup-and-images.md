# Court-specific setup and images

## Outcome

Cho phép chủ sân cấu hình lịch, giá, quy tắc đặt và 1-5 ảnh cho từng sân con ngay khi tạo cơ sở; hỗ trợ chế độ cấu hình chung hoặc riêng, có thể sửa lại sau. Người chơi thấy ảnh của sân con đang chọn khi đặt sân.

## Approach

1. Bổ sung trường ảnh cho sân con và API tạo/cập nhật có kiểm tra 1-5 ảnh.
2. Trả ảnh sân con trong API quản lý và chi tiết công khai.
3. Chuyển form tạo cơ sở sang draft sân con có cấu hình chung/riêng.
4. Bổ sung chỉnh sửa ảnh và cấu hình từ trang chi tiết cơ sở.
5. Cập nhật test nguồn; chỉ chạy kiểm chứng sau khi người dùng đồng ý.

## Risks and recovery

- Migration chỉ thêm cột JSON nullable nên rollback bằng cách bỏ cột nếu chưa có dữ liệu production cần giữ.
- Luồng tạo nhiều bước có thể tạo cơ sở một phần; giữ thông báo phục hồi hiện có và cho phép hoàn thiện từ trang chi tiết.
- Không chạy migration, build hoặc test nếu chưa được người dùng cho phép.

## Progress

- [x] Chốt ảnh riêng 1-5 ảnh và hiển thị khi người chơi chọn sân.
- [x] Backend và schema.
- [x] Form tạo chung/riêng.
- [x] Form sửa sau khi tạo.
- [x] Hiển thị ảnh sân đang chọn trong luồng đặt sân.
- [x] Impact scan, Prisma generate, migration và kiểm tra tập trung hoàn tất.

## Validation result

- Prisma client generated và migration `20260822120000_add_court_images` đã áp dụng thành công vào database cục bộ.
- `venue-booking-service` typecheck đạt; `test/court.test.ts` đạt 5/5.
- Web typecheck đạt; 3 file test tập trung đạt 7/7.
- `venue-booking-service` đã được khởi động lại và lắng nghe cổng 3002.
