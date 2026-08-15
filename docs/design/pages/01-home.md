---
type: page-design
page: home
phase: GĐ1
milestone: P25-1
route: /
updated: 2026-08-09
---

# Trang chủ (Home)

## Tham chiếu Playo
Home playo.co: (1) **Hero split** — cột trái headline lớn + mô tả, cột phải ảnh
collage thể thao có vòng chữ "PLATFORM"; (2) carousel **Book Venues** (card sân,
badge Featured/Bookable, rating chip); (3) carousel **Discover Games**; (4) lưới
**sport categories**; (5) dải **promo banner** xanh; (6) **FAQ accordion**; (7) footer.

## Đối chiếu scope
- **Bỏ** lưới sport categories (chỉ cầu lông) và các card đa môn.
- **Bỏ** "Download the App" và mọi CTA tải app.
- **Giữ**: hero, carousel sân nổi bật, (GĐ2) carousel kèo, FAQ, footer.
- Collage hero: ảnh **cầu lông** hợp lệ (không copy ảnh Playo). Vòng chữ đổi thành
  slogan dự án nếu muốn giữ nét, hoặc bỏ để tối giản.

## Route
`/` — công khai. Đã có `HomePage` (`apps/web/src/pages/HomePage.tsx`) → re-layout.

## Bố cục (section theo thứ tự)

1. **Hero** (nền `canvas`)
   - Desktop: 2 cột. Trái: H1 Display "Đặt sân cầu lông. Tìm kèo. Nâng trình." +
     mô tả 1–2 dòng + 2 CTA (`Đặt sân ngay` primary → `/venues`; `Khám phá kèo`
     secondary → `/matches`, GĐ2). Phải: ảnh/illustration cầu lông (collage nhẹ,
     parallax CSS tuỳ chọn — không 3D).
   - Mobile: 1 cột, ảnh dưới headline, CTA full-width xếp dọc.

2. **Sân nổi bật** — carousel card sân (H2 "Sân nổi bật" + link "Xem tất cả" →
   `/venues`). Mỗi card = component VenueCard (định nghĩa ở spec `03`). Cuộn ngang, nút ‹ ›.

3. **Kèo đang mở** *(GĐ2, ẩn ở GĐ1)* — carousel MatchCard (spec `08`) + link
   "Xem tất cả kèo" → `/matches`.

4. **Ba tính năng** — 3 card (Đặt sân / Kèo / Cộng đồng) icon line + tiêu đề + mô
   tả + link. (Thay 3 card hiện có; bỏ chữ "Sắp ra mắt" khi GĐ2 xong.)

5. **FAQ** — accordion (câu hỏi + mũi ‹v› xoay khi mở). Nội dung tiếng Việt về đặt
   sân/hủy/hoàn tiền/kèo. Dùng `<details>` hoặc state, animation cao 200ms.

6. **Footer** (§5.2 design-system).

## Component dùng
Hero, Button (primary/secondary), Card, VenueCard, (MatchCard GĐ2), Carousel,
Accordion, Footer, Skeleton (khi carousel đang tải).

## Nối API thật
- Sân nổi bật: `searchVenues(...)`. Home không có vị trí người dùng → **cần chốt
  nguồn "nổi bật"**: (a) toạ độ mặc định theo thành phố chọn ở Navbar, hoặc (b)
  endpoint "popular/featured" nếu có. **Nếu API không hỗ trợ danh sách không cần
  lat/lng → dừng, hỏi PO** (Pause rule). Tạm thời có thể ẩn section nếu chưa có nguồn.
- Kèo đang mở (GĐ2): API list match công khai (`/matches` search) — spec `08`.
- FAQ: nội dung tĩnh trong FE.

## Trạng thái
- **Loading**: skeleton card cho carousel.
- **Empty**: không có sân → ẩn section hoặc EmptyState "Chưa có sân trong khu vực".
- **Error**: toast + EmptyState "Không tải được danh sách, thử lại".
- **Auth**: Home công khai; CTA phụ theo trạng thái đăng nhập (Navbar xử lý).

## Motion
Hero fade-in khi load; section fade/slide-up khi cuộn; card hover nhấc nhẹ;
accordion mở/đóng cao 200ms. Tôn trọng `prefers-reduced-motion`.

## Tiêu chí đạt (AC-UI)
1. Hero split desktop / xếp dọc mobile, đúng token màu sáng + xanh.
2. Không còn sport category grid, không CTA tải app, không màu navy tối.
3. Carousel sân nối `searchVenues` thật (hoặc ẩn có lý do rõ nếu chờ PO chốt nguồn).
4. FAQ accordion đóng/mở mượt, ≥4 câu tiếng Việt.
5. Footer đủ nhóm link, không store badge.
6. Responsive 375/768/1280 không vỡ; skeleton khi tải.
