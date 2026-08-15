# Bản đồ tài liệu sản phẩm

Thư mục này là nguồn sự thật cho phạm vi và hành vi sản phẩm đã được chấp nhận.
Đọc theo nhu cầu, không nạp toàn bộ tài liệu cho mọi task.

## Điểm vào chính

- `phasing.md`: phạm vi và phân bổ chức năng theo giai đoạn.
- `decision-log.md`: quyết định sản phẩm đang có hiệu lực.
- `phase-1-goal.md`: mục tiêu và chuẩn hoàn thành Giai đoạn 1.
- `phase-1-handoff.md`: thứ tự milestone, phụ thuộc và ranh giới bàn giao.
- `phase-1-progress.md`: trạng thái triển khai, test ledger và bằng chứng.
- `coverage-matrix.md`: độ phủ của spec đã duyệt; không thay thế test ledger.

## Spec theo miền

- `specs/account-access.md`: tài khoản, xác minh, phiên và phân quyền.
- `specs/venue-scheduling.md`: nhà cung cấp, cơ sở, sân, lịch và giá.
- `specs/court-booking.md`: tìm sân, giữ chỗ và booking.
- `specs/finance-disputes.md`: thanh toán, ví, doanh thu, hoàn tiền, đối soát và
  tranh chấp.

## Tài liệu thiết kế hỗ trợ

- `gboot-goal.md`: bootstrap monorepo và hạ tầng nền.
- `gdesign-goal.md`: baseline giao diện Giai đoạn 1.
- `gdesign-screenshots/`: bằng chứng hiển thị theo viewport.

Khi hành vi được duyệt thay đổi, cập nhật spec/decision liên quan và bằng chứng
thực thi tương ứng. Không suy ra trạng thái triển khai từ số lượng chức năng hay
frontmatter `approved`; dùng `phase-1-progress.md` và test chạy được.
