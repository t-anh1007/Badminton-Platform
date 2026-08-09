---
type: page-design
page: booking
phase: GĐ1
milestone: P25-2
route: /booking?venueId=
updated: 2026-08-09
---

# Luồng đặt sân (Booking)

## Tham chiếu Playo
`/booking?venueId=`: **2 cột** — trái là **form đặt** (tên sân + "Earn karma" banner,
Sports, Date, Start Time, Duration ± , Court dropdown, nút "Add To Cart"); phải là
**Cart** ("Cart Is Empty" khi trống). Sau khi thêm giỏ → tổng tiền + thanh toán.

## Đối chiếu scope
- **Bỏ** dropdown Sports (chỉ cầu lông) và banner "Earn karma".
- **Giữ** bố cục 2 cột (form trái + giỏ/tóm tắt phải) và các bước.
- Dự án có **giữ chỗ 10 phút (hold Redis)** + **countdown** + **thanh toán số dư
  hoặc SePay** (FIN-03/04). Đây là điểm khác Playo — thiết kế phần này theo design
  system (Playo không có countdown giữ chỗ hiển thị).
- Gộp lại từ `BookingPage` hiện tại (đang 3-step wizard trong một trang): giữ logic
  chọn slot → hold → booking → thanh toán, **re-layout** theo 2 cột + stepper Playo-style.

## Route
`/booking?venueId=:id` (đến từ Venue Detail). Nếu vào trực tiếp không có venue →
điều hướng `/venues`.

## Bố cục

1. **Header**: tên sân + khu vực (từ venue) + **stepper** 3 bước (Chọn slot ·
   Xác nhận · Thanh toán) dạng pill; **countdown giữ chỗ** hiện bên phải khi có hold.
2. **2 cột (desktop)**:
   - **Trái — chọn lịch**: Date picker; Court (sân con) dropdown; **lưới slot**
     (SlotGrid hiện có, re-skin): mỗi slot = ô giờ + giá, trạng thái `trống` (viền
     xanh, chọn được) / `đang giữ` (mờ + khóa) / `đã đặt` (xám). Chọn slot → sang giỏ.
   - **Phải — Tóm tắt / Giỏ** (sticky): trống = EmptyState "Chưa chọn slot"; có
     chọn = card tóm tắt (sân, ngày giờ, thời lượng, **tổng tiền** Geist Mono) +
     nút theo bước:
     - Bước Chọn → **Giữ chỗ** (tạo hold, bật countdown 10:00).
     - Bước Xác nhận → **Tạo booking** (trước khi hết giờ).
     - Bước Thanh toán → chọn **Số dư** (FIN-03) hoặc **SePay** (FIN-04) → xác nhận.
3. **Kết quả**: thành công → card xác nhận (mã booking, trạng thái) + link "Xem
   trong Hồ sơ"; countdown hết hạn → cảnh báo "Hết thời gian giữ chỗ" + chọn lại.
4. **Hủy booking + hoàn tiền** (BOK-09/FIN-07): panel `BookingCancellationPanel`
   re-skin — có thể đặt ở Hồ sơ; ở đây chỉ link tới.

## Component dùng
Stepper/pill, DatePicker, Select (court), SlotGrid (re-skin sáng), Card tóm tắt,
HoldCountdown (đỏ nhạt `danger-bg`), Button (primary/secondary), payment method
selector (radio card: Số dư / SePay), Toast, Skeleton, EmptyState (giỏ trống).

## Nối API thật
`getVenueDetail`, `getCourtAvailability(courtId, date)`, `selectSlot`, `createHold`,
`createBooking`, `payBookingBalance` (số dư) / luồng SePay (FIN-04). Giữ nguyên
countdown dựa `hold.expiresAt`. **Không đổi API**.

## Trạng thái
- Loading: skeleton slot grid; nút spinner khi hold/booking/pay.
- Empty: ngày đóng cửa → "Sân đóng cửa ngày này"; hết slot → "Không còn slot trống".
- Error: hold hết hạn, slot bị người khác giữ, thanh toán lỗi → thông báo + đường
  thử lại rõ ràng.
- Auth: bắt buộc đăng nhập để giữ chỗ/thanh toán → mở Auth modal, quay lại đúng bước.

## Motion
Chọn slot → highlight + trượt tóm tắt vào giỏ; countdown đổi màu khi <2:00 (đỏ đậm
dần); thành công → tick scale-in. Không auto-scroll cưỡng bức.

## Tiêu chí đạt (AC-UI)
1. Bố cục 2 cột (lịch trái + giỏ/tóm tắt phải), stepper 3 bước, phong cách sáng/xanh.
2. Không dropdown môn, không banner karma.
3. SlotGrid re-skin đủ 3 trạng thái slot; chọn slot cập nhật tóm tắt.
4. Hold + countdown 10 phút hoạt động; hết hạn xử lý đúng.
5. Thanh toán Số dư / SePay nối API thật; xác nhận + mã booking hiển thị.
6. Loading/empty/error/auth tiếng Việt; responsive 2→1 cột (giỏ thành sticky đáy mobile).
