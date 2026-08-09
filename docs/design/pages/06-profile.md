---
type: page-design
page: profile
phase: GĐ1
milestone: P25-3
route: /profile
updated: 2026-08-09
---

# Hồ sơ + Ví + Lịch sử (Profile)

## Tham chiếu Playo
`/myprofile/...`: **2 cột** — trái **user card** (avatar, tên, "Yet to play your
first match", các chỉ số Games played / Karma Points / Playpals, "Update Personal
Info"); phải **tabbed content** (Bookings | Passbook), Bookings có segmented
(Upcoming/Past/Cancelled/Gift Cards), Passbook có Wallet | Karma + "Available
Balance" + Wallet History; EmptyState "No Results Found" mặt cầu buồn.

## Đối chiếu scope
- **Bỏ** Karma Points, Karma tab, Gift Cards, Playpals (không có nghiệp vụ).
- **Giữ** khung 2 cột + tab + segmented + EmptyState.
- Chỉ số trái đổi theo dự án: **Số booking**, (GĐ2) **Bậc/Rating** link Passport.
- Passbook → **Ví**: dự án có **ví cá nhân + ví kinh doanh** (provider) + **nạp
  SePay** (FIN-02) + lịch sử giao dịch (FIN-01). Rút tiền (FIN-10) hiện ở luồng
  provider.
- Có thêm **Tranh chấp** (FIN-12, `DisputePanel`) — đưa vào một tab/section riêng.

## Route
`/profile` (đã có `ProfilePage`) → re-layout. Tabs qua query: `?tab=bookings|wallet|disputes`.

## Bố cục

1. **Layout 2 cột (desktop)**:
   - **Trái — User card** (sticky): avatar tròn (fallback chữ cái), tên hiển thị,
     email, dòng trạng thái ("Chưa có kèo nào" nếu GĐ2 rỗng); chỉ số dạng list
     (Số booking · (GĐ2) Bậc trình độ + link Passport); nút **Cập nhật thông tin**
     (mở form edit); nút **Đổi mật khẩu** (spec `02`).
   - **Phải — Tabs**:
     - **Đặt sân của tôi**: segmented Sắp tới / Đã qua / Đã hủy; list booking card
       (sân, ngày giờ, giá Geist Mono, badge trạng thái); rỗng → EmptyState.
     - **Ví**: segmented Cá nhân / Kinh doanh (ẩn Kinh doanh nếu không là provider).
       Card **Số dư khả dụng** (số lớn Geist Mono) + nút **Nạp tiền (SePay)**;
       (provider) nút **Rút tiền**. **Lịch sử giao dịch** dạng list (loại, số tiền
       +/−, thời gian, trạng thái). `FinancePanel` re-skin.
     - **Tranh chấp**: `DisputePanel` re-skin — gửi tranh chấp giao dịch + theo dõi
       trạng thái (open/resolved).
2. **Form Cập nhật thông tin**: displayName, phone, visibility (Công khai/Riêng tư)
   — như API hiện có; lưu → toast.

## Component dùng
User card, Avatar, Tabs, Segmented control, BookingCard, WalletCard, TxnList,
Button, Modal (edit/đổi mật khẩu), EmptyState, Toast, Badge trạng thái, Skeleton.

## Nối API thật
`getMyProfile`, `updateMyProfile({displayName,phone,visibility})`, `getMyWallets`
(personal/business), `getMyBookingHistory`, nạp SePay (FIN-02), lịch sử giao dịch
(FIN-01), tranh chấp (`DisputePanel` API). **Giữ nguyên** phân biệt ví personal/business.

## Trạng thái
- Loading: skeleton user card + list.
- Empty: chưa có booking/giao dịch → EmptyState tiếng Việt (không mặt cầu buồn nếu
  không hợp — dùng icon trung tính); chưa là provider → ẩn ví kinh doanh + gợi ý
  "Đăng ký nhà cung cấp".
- Error: toast; giữ dữ liệu cũ nếu có.
- Auth: bắt buộc đăng nhập; chưa đăng nhập → chuyển Auth modal.

## Motion
Chuyển tab fade nhẹ; số dư đếm tăng khi tải (tuỳ chọn, tôn trọng reduced-motion);
card hover nhấc.

## Tiêu chí đạt (AC-UI)
1. Bố cục 2 cột (user card trái + tab phải) đúng nhịp Playo, tông sáng/xanh.
2. Không Karma/Gift Cards/Playpals; chỉ số đúng dữ liệu dự án.
3. Tab Đặt sân với segmented Sắp tới/Đã qua/Đã hủy nối `getMyBookingHistory`.
4. Tab Ví: phân biệt cá nhân/kinh doanh, số dư từ `getMyWallets`, nạp SePay, lịch sử giao dịch.
5. Tab Tranh chấp nối `DisputePanel` thật.
6. Form cập nhật hồ sơ + đổi mật khẩu hoạt động; empty/error tiếng Việt; responsive 2→1 cột.
