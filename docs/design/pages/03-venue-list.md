---
type: page-design
page: venue-list
phase: GĐ1
milestone: P25-1
route: /venues
updated: 2026-08-09
---

# Danh sách sân (Venue List)

## Tham chiếu Playo
`/venues/:city/sports/all`: thanh trên có **city picker** + search theo tên +
dropdown Sports; hàng **tab** (Venues / Coaching / Events / Memberships) với số
đếm; lưới **3 cột card sân** (ảnh, badge Featured/Bookable, tên, rating chip, địa
chỉ + khoảng cách, icon môn). Popup "Get Karma Discounts" (bỏ).

## Đối chiếu scope
- **Bỏ** tab Coaching / Events / Memberships và dropdown Sports (chỉ cầu lông) →
  còn **một danh sách sân** duy nhất, không tab môn.
- **Bỏ** Karma popup, badge Karma.
- **Giữ**: city/location picker + search theo tên + lưới card + badge trạng thái +
  rating + khoảng cách.
- Dự án tìm theo **toạ độ + bán kính** (`searchVenues({lat,lng,radiusKm})`). City
  picker phải quy ra lat/lng (danh sách thành phố cố định → toạ độ, hoặc "Gần tôi"
  dùng geolocation). Đây là bọc UI quanh API sẵn có, **không đổi API**.

## Route
`/venues` (mới, tách từ `BookingPage`). Query giữ vị trí/bán kính: `?lat&lng&radiusKm`.

## Bố cục

1. **Thanh tìm kiếm** (sticky dưới Navbar): trái = location picker (`📍 Thành phố`
   hoặc "Gần tôi"); giữa = ô "Tìm theo tên sân"; phải = bán kính (5/10/20 km) hoặc
   sort (gần nhất / rating). Nền trắng, card bo góc.
2. **Tiêu đề + đếm**: "Sân cầu lông tại {khu vực}" + "(N sân)".
3. **Lưới card sân**: 3 cột desktop / 2 tablet / 1 mobile, gutter 24.
   - **VenueCard**: ảnh cover (16:9, radius 12) + badge góc (Featured `warning` /
     Bookable `success`); tên sân (H3); rating chip (green-100, số Geist Mono +
     "(số lượt)"); địa chỉ rút gọn + "~x.x km"; hover nhấc + bóng. Click → `/venues/:id`.
4. **Phân trang / tải thêm** nếu danh sách dài.

## Component dùng
Input search, Select/Segmented (bán kính/sort), LocationPicker, VenueCard, Badge,
Skeleton (card), EmptyState, Pagination.

## Nối API thật
`searchVenues({lat,lng,radiusKm})`. Lọc theo tên = client-side trên kết quả (hoặc
server nếu hỗ trợ). Rating/badge lấy từ dữ liệu venue trả về; field nào API **không**
trả (vd rating) → ẩn phần đó, **không bịa số**; nếu PO muốn rating mà API thiếu → dừng hỏi.

## Trạng thái
- Loading: 6–9 skeleton card.
- Empty: chưa nhập vị trí → EmptyState hướng dẫn chọn khu vực; có vị trí nhưng 0
  kết quả → "Không có sân trong bán kính này, thử mở rộng".
- Error: toast + nút thử lại.
- Auth: công khai (không cần đăng nhập để xem).

## Motion
Card fade-in so le khi tải; hover nhấc; đổi bộ lọc → fade danh sách.

## Tiêu chí đạt (AC-UI)
1. Chỉ một danh sách sân, **không** tab môn/coaching/events, không dropdown Sports.
2. Location picker quy ra lat/lng và gọi `searchVenues` thật.
3. VenueCard đúng phong cách Playo (ảnh, badge, rating chip, khoảng cách), hover nhấc.
4. Search theo tên hoạt động; bán kính/sort đổi được.
5. 3/2/1 cột theo breakpoint; skeleton + empty + error tiếng Việt.
