---
type: page-design
page: venue-detail
phase: GĐ1
milestone: P25-1
route: /venues/:id
updated: 2026-08-09
---

# Chi tiết cơ sở sân (Venue Detail)

## Tham chiếu Playo
`/venues/:city/:slug`: **breadcrumb** (Venues › City › Tên); H1 tên + rating +
"Rate Venue"; **carousel ảnh** lớn; **sidebar phải sticky** với nút **Book Now**
primary + Share + Timing + Location (map); khối "Sports Available" (price chart),
"Amenities" (tick), "Related", "Games Near By" (card kèo gần đó).

## Đối chiếu scope
- **Bỏ** "Sports Available" đa môn → thay bằng **"Bảng giá cầu lông theo khung giờ"**
  (VEN-06 biểu giá) nếu API trả; nếu chỉ có giá theo slot thì hiển thị ở trang Booking.
- **Bỏ** "Bulk / Corporate" nếu không có nghiệp vụ tương ứng.
- **Giữ**: breadcrumb, carousel ảnh, sidebar sticky Book Now, Timing, Location/map,
  Amenities, và **"Kèo gần đây tại sân này"** (GĐ2, MMP) thay cho "Games Near By".

## Route
`/venues/:id` (mới, tách từ `BookingPage`). Nút Book Now → `/booking?venueId=:id`.

## Bố cục

1. **Breadcrumb**: Sân › {Khu vực} › {Tên sân}.
2. **Header**: H1 tên sân + dòng địa chỉ. **Rating/"Đánh giá sân":** `phasing.md`
   **A5** — đánh giá (MMP-10) chỉ áp dụng cho **kèo**, KHÔNG cho booking sân ở GĐ1.
   Do đó **mặc định bỏ** rating chip + link "Đánh giá sân"; chỉ hiển thị rating nếu
   venue API thực sự trả field rating (không bịa). Nếu PO muốn đánh giá sân → là UC
   mới, **dừng hỏi PO** (ngoài phạm vi Phase 2.5).
3. **Layout 2 cột (desktop)**:
   - **Trái (nội dung)**: carousel ảnh sân (radius 12, chấm chỉ mục); **Sân con**
     (danh sách court VEN-04, mỗi court tên + loại mặt sân nếu có); **Bảng giá theo
     khung giờ** (VEN-06); **Tiện ích** (Amenities, icon tick xanh + nhãn); **Quy
     tắc đặt sân** (bước thời gian, min/max VEN-07); **Mô tả**.
   - **Phải (sidebar sticky)**: card CTA — **Đặt sân** (primary, → booking) + Chia
     sẻ; card **Giờ hoạt động** (VEN-05, kèm ngày đóng cửa); card **Vị trí** + map
     tĩnh/nhúng nhẹ + nút chỉ đường.
   - Mobile: 1 cột; CTA "Đặt sân" **cố định đáy** (sticky bottom bar).
4. **Kèo gần đây tại sân** *(GĐ2)*: carousel MatchCard lọc theo venue.

## Component dùng
Breadcrumb, ImageCarousel, Card, Badge/rating chip, AmenityList, PriceTable,
StickyBottomBar (mobile), Button, Map embed nhẹ (ảnh tĩnh + link, tránh JS nặng),
(MatchCard GĐ2), Skeleton.

## Nối API thật
`getVenueDetail(venueId)` → tên, địa chỉ, courts, giờ, giá, tiện ích (theo field
API trả). Bảng giá/giờ mở lấy từ detail; nếu field thiếu → ẩn khối, không bịa.
"Kèo gần đây" (GĐ2): API list match theo venue.

## Trạng thái
- Loading: skeleton ảnh + sidebar.
- Empty: cơ sở chưa có sân con hoạt động → thông báo "Sân đang cập nhật lịch",
  disable Book Now.
- Error: 404 venue → EmptyState "Không tìm thấy cơ sở" + link về `/venues`.
- Auth: xem công khai; bấm Đặt sân khi chưa đăng nhập → mở Auth modal rồi tiếp tục.

## Motion
Carousel trượt 250ms; sidebar sticky theo cuộn; CTA mobile trượt lên khi cuộn xuống.

## Tiêu chí đạt (AC-UI)
1. Breadcrumb + header + carousel + sidebar sticky Book Now đúng bố cục Playo.
2. Không còn "Sports Available" đa môn; nội dung là cầu lông (court, giá, giờ, tiện ích) từ API thật.
3. Amenities dạng tick, Timing, Location/map hiển thị.
4. Book Now → `/booking?venueId=`; mobile có sticky CTA đáy.
5. Responsive 2→1 cột; loading/empty/error/404 tiếng Việt.
