---
type: design-spec
status: approved
approved: 2026-09-12
---

# Rút tiền từ ví cá nhân

## Mục tiêu

Cho `player` yêu cầu rút về ngân hàng phần tiền từ hoàn tiền hoặc chuyển dư,
trong khi tiền người chơi tự nạp vẫn chỉ dùng để thanh toán trong nền tảng.

## Chính sách đã duyệt

- Chỉ khoản `refund` và khoản chuyển dư được nhận **sau khi thay đổi này được
  triển khai** mới làm tăng số dư có thể rút.
- Không suy ngược lịch sử. Mọi ví hiện có khởi tạo `withdrawable = 0`.
- Mức rút tối thiểu là `10.000đ`.
- Chờ Admin xử lý, đối soát và chi theo vòng đời withdrawal hiện có; người chơi
  chỉ hủy khi yêu cầu đang `pending`.
- Người chơi và chủ sân có thể có một withdrawal đang hoạt động cho mỗi loại ví.

## Mô hình tiền

Ví `personal` có ba số liên quan: `available` là tổng có thể chi, `withdrawable`
là tập con đủ điều kiện rút, và `reserved` là khoản rút đang chờ chi. Tạo yêu
cầu personal chuyển đồng thời `available → reserved` và `withdrawable` giảm;
hủy/từ chối đảo đúng hai chuyển dịch đó. Khi thanh toán, tiền không đủ điều kiện
được dùng trước; chỉ phần còn thiếu mới làm giảm `withdrawable`. Chi tiền thật
giảm `reserved` và ghi một `payout` append-only.

`WithdrawalRequest.walletType` phân biệt `personal` và `business`; các yêu cầu
cũ nhận mặc định `business`. Không có chuyển tiền giữa hai ví.

## Giao diện đã duyệt

Trang Ví hiển thị cùng lúc “Tổng số dư” và “Có thể rút”, hai nút pill cùng hàng:
Nạp tiền (vàng) và Rút tiền (viền). Modal Nạp có dòng cảnh báo đỏ “Tiền bạn chủ
động nạp vào ví không thể rút về tài khoản ngân hàng.” Modal Rút có dòng cảnh
báo đỏ “Chỉ tiền hoàn và tiền chuyển dư mới có thể rút.” Cả hai modal đặt nút
Hủy và nút xác nhận cùng hàng trên desktop; mobile hẹp mới xếp dọc.

## Bằng chứng cần có

- Domain test: refund mới tăng eligibility; topup không tăng; payment tiêu tiền
  không đủ điều kiện trước; create/cancel/payout personal bảo toàn các phân vùng.
- HTTP test: chỉ `player` tạo/xem/hủy withdrawal personal của chính mình.
- Component test: hai số dư, cảnh báo đỏ, modal và hai nút action cùng hàng.
