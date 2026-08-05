# DESIGN.md — Badminton Community Booking Platform

> Design reference: adapted from actl.me (ACTL – Dubai Private Tennis League) visual language,
> re-purposed for badminton, web-only (no native mobile app), and stripped of heavy 3D/WebGL
> animation for free-tier hosting performance.

---

## 1. Product Context

A web application combining **court booking** (e-commerce-style reservation flow) with a
**player community/forum** and **competitive ranking system** for badminton players.

Backend: microservices architecture — **5 services + API Gateway** (`account-service`,
`venue-booking-service`, `finance-service`, `matchmaking-service`, `community-service` + gateway;
xem [system-architecture.md §4](architecture/system-architecture.md)), PostgreSQL (schema-per-service),
RabbitMQ Outbox Pattern, Redis (temporary slot-holding). Frontend: React 19, web application only
(desktop + mobile-responsive browser, NOT a native app).

> **Phạm vi GĐ1:** chỉ `account-service`, `venue-booking-service`, `finance-service` (+ gateway)
> hoạt động. `matchmaking-service` và `community-service` thuộc **GĐ2**. Không có "Notification
> Service" hay "Admin Service" riêng — thông báo là cross-cutting, còn Admin là **giao diện tổng
> hợp** các chức năng nằm trong service nghiệp vụ sở hữu chúng (không phải một service).

**Performance constraint (hard requirement):** target free-tier hosting (Vercel/Netlify free,
no dedicated GPU/CDN budget). No WebGL, no Three.js, no scroll-jacked 3D canvas scenes, no heavy
particle/video backgrounds. Motion must be CSS-only (transition/transform/opacity) or lightweight
JS (Framer Motion basic variants at most).

---

## 1.1 Mức độ tương đồng với actl.me (chốt 2026-08-06)

**Mục tiêu: giống actl.me ~90% ở bố cục, nhịp điệu spacing, ngôn ngữ chuyển động (motion) và
hành vi tương tác (UX) — KHÔNG áp dụng cho cảnh 3D WebGL.** Quyết định bỏ 3D ở mục 1 và mục 5
(ràng buộc hiệu năng) **vẫn giữ nguyên, không đổi**.

Cụ thể "giống 90%" nghĩa là:

| Giống ~90% (làm theo sát) | Không copy / thay thế |
|---|---|
| Thứ tự section trên trang, cấu trúc layout tổng thể | Nội dung chữ/copy thật của actl.me (viết lại bằng tiếng Việt, đúng sản phẩm cầu lông) |
| Nhịp spacing, tỉ lệ typography (H1/H2/Body/Caption) | Model 3D `.glb`, canvas WebGL, thư viện Lenis smooth-scroll |
| Ngôn ngữ motion: cách hover đổi màu, cách menu overlay full-screen bung ra, cách card nhấc lên khi hover, cách section fade/slide-in khi cuộn tới | Logo, ảnh, icon gốc của actl.me |
| Hành vi UX: nav bar sticky đổi nền khi cuộn, menu overlay full-screen thay vì dropdown nhỏ, ranking/leaderboard dạng list đậm số liệu | Cảnh hero 3D xoay theo scroll — thay bằng ảnh tĩnh/illustration + parallax CSS nhẹ (mục 2.3) |
| Cảm giác "thể thao cạnh tranh, cao cấp" qua contrast màu tối/sáng mạnh, chữ hoa đậm | Bất kỳ thứ gì cần WebGL/canvas/particle 3D |

Khi viết prompt cho Stitch hoặc code component, luôn diễn đạt theo hai cột trên: mô tả đúng
layout/motion muốn giống, đồng thời nhắc rõ cấm 3D — để AI không tự suy ra cần dựng lại cảnh 3D
khi thấy yêu cầu "giống actl.me 90%".

---

## 2. Visual Identity (adapted from actl.me)

### 2.1 Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--color-primary-navy` | `#15446C` | Header/nav background, primary dark surfaces |
| `--color-primary-blue` | `#105482` | Secondary surfaces, hover states on navy |
| `--color-slate` | `#274162` | Cards, secondary background blocks |
| `--color-court-green` | `#16301f` → adapt to `#1B4D2E` | Dark section backgrounds (footer, hero) — badminton court green instead of tennis court green |
| `--color-accent-lime` | `#DCFF40` | Primary CTA buttons, active states — reference only |
| `--color-accent-shuttle` | `#F5E663` (thay thế) | **Màu nhấn chính của dự án** — vàng nhạt giống lông vũ quả cầu, thay cho lime-tennis-ball |
| `--color-accent-shuttle-alt` | `#FFFFFF` với viền đỏ nhẹ `#E63946` | Điểm nhấn phụ (đế quả cầu màu đỏ/trắng), dùng cho badge "Live", "Hot" |
| `--color-text-primary` | `#171717` | Body text on light background |
| `--color-text-dark-bg` | `#FFFFFF` | Text on navy/dark backgrounds |
| `--color-bg-light` | `#ededed` / `#F7F7F5` | Light section background |
| `--color-bg-white` | `#FFFFFF` | Card backgrounds |

> Lý do đổi màu: ACTL dùng xanh sân + vàng-chanh (màu quả tennis). Dự án cầu lông nên dùng
> **xanh lá đậm sân cầu lông (`#1B4D2E`)** làm nền tối chủ đạo, và **vàng ngà/trắng ngà
> (`#F5E663` hoặc trắng lông vũ)** làm accent thay cho lime — vừa giữ tinh thần thể thao
> cạnh tranh, vừa đúng bản sắc cầu lông.

### 2.2 Typography

- **Font chính:** Geist (sans-serif) — heading đậm, chữ hoa, letter-spacing rộng cho slogan
  (giống "PLAY. COMPETE. CLIMB THE RANKINGS.")
- **Font số liệu:** Geist Mono — dùng riêng cho: điểm ranking, tỉ số trận đấu, mã đặt sân,
  đồng hồ đếm ngược giữ chỗ
- **Scale gợi ý:**
  - H1 (Hero slogan): 48–64px, font-weight 800, uppercase, line-height 1.1
  - H2 (Section title): 32–40px, font-weight 700
  - Body: 16px, font-weight 400, line-height 1.6
  - Caption/label: 12–13px, uppercase, letter-spacing 0.05em, màu accent

### 2.3 Component Style Cues (từ ACTL, đã lược bỏ 3D)

- **Nav bar:** cố định trên cùng, nền navy trong suốt/blur nhẹ khi scroll, logo bên trái,
  nút CTA dạng pill (accent color) bên phải, hamburger menu tròn có avatar nhỏ bên trong.
- **Menu overlay (mobile/tablet):** full-screen, nền navy đặc, danh sách link cỡ chữ lớn
  (~40–48px) màu trắng, có 1 label phụ màu accent (ví dụ "STAY CONNECTED", "LIÊN HỆ") +
  social icon dạng viền tròn outline. **Bỏ phần "Download App / Google Play / App Store"
  vì dự án không có app.**
- **Hero section:** thay 3D court bằng **ảnh tĩnh chất lượng cao sân cầu lông** hoặc
  **illustration SVG phẳng** (line-art sân + lưới cầu lông), overlay gradient tối nhẹ,
  slogan lớn + CTA "Đặt sân ngay" / "Tham gia cộng đồng". Để giữ cảm giác "camera di chuyển
  quanh sân" của bản gốc mà không cần WebGL: dùng **parallax nhiều lớp bằng CSS
  transform** (2–3 lớp ảnh/SVG tách nền-giữa-cận cảnh, mỗi lớp di chuyển tốc độ khác nhau
  theo scroll qua `transform: translateY()`) — vẫn thuần CSS/JS nhẹ, không canvas, không
  tải model 3D, nhưng tạo được chiều sâu tương tự.

- **Loading screen (preloader):** overlay phủ toàn màn hình khi trang vừa load
  (`position: fixed; inset: 0; z-index: 9999`), nền xanh lá đậm sân cầu lông
  (`--color-court-green` `#1B4D2E`), giữa màn hình là icon quả cầu lông (line-art hoặc
  flat SVG, ~64px) chuyển động nảy/xoay nhẹ bằng **CSS `@keyframes`** (translateY lên
  xuống hoặc rotate, KHÔNG dùng Framer Motion để giữ bundle nhẹ). Overlay tự ẩn (fade-out
  CSS transition ~300ms) khi các asset chính của trang đã tải xong.
- **Ranking/Leaderboard:** bảng dạng list, mỗi row = avatar + tên + điểm (Geist Mono) +
  mũi tên tăng/giảm hạng (icon SVG màu xanh lá/đỏ), hàng top 1-3 có highlight màu accent.
- **Card pattern:** border-radius trung bình (12–16px), shadow nhẹ, hover = translateY(-2px)
  + shadow tăng nhẹ (transition 150ms, KHÔNG dùng 3D transform/tilt).

---

## 3. Sitemap (map từ ACTL sang kiến trúc dự án)

| ACTL (tham khảo) | → | Trang dự án | Service liên quan | Giai đoạn |
|---|---|---|---|---|
| Home | → | **Trang chủ** | Landing (FE) + gateway | **GĐ1** |
| — | → | **Đăng ký / Đăng nhập / Xác minh email** | `account-service` | **GĐ1** |
| About | → | **Giới thiệu** | Static content | GĐ1 |
| — | → | **Hồ sơ cá nhân** | `account-service` (ACC-07) | **GĐ1** |
| Tournaments | → | **Sự kiện / Giải đấu nội bộ** (tuỳ chọn) | mở rộng tương lai | sau GĐ2 |
| App | → | *(bỏ — không có app)* | — | — |
| Ranking | → | **Bảng xếp hạng** | `matchmaking-service` | GĐ2 |
| Gallery | → | **Cộng đồng / Diễn đàn** (feed, bài viết) | `community-service` | GĐ2 |
| Testimonials | → | **Đánh giá / Phản hồi** | — (đánh giá booking **không** thuộc GĐ1, D7) | GĐ2 |
| Contact | → | **Liên hệ / Hỗ trợ** | Static content | GĐ1 |
| *(mới)* | → | **Đặt sân (Booking)** — trang trung tâm | `venue-booking-service` + Redis | **GĐ1** |
| *(mới)* | → | **Thông báo** | cross-cutting (không service riêng) | GĐ2 |
| *(mới)* | → | **Quản trị (Admin)** | giao diện tổng hợp trong service nghiệp vụ (ACC/VEN/FIN) | **GĐ1** |

---

## 4. Trang cần thiết kế chi tiết trong Stitch

> **Gắn nhãn giai đoạn.** Gdesign (GĐ1) chỉ dựng **component dùng chung + page shell của các
> trang GĐ1**. Trang GĐ2 giữ lại ở đây làm tầm nhìn thiết kế, dựng sau bằng cùng baseline.

**GĐ1 — Gdesign dựng baseline:**

1. **Trang chủ (Home)** — hero tĩnh (không 3D), giới thiệu nhanh 3 tính năng chính, CTA rõ ràng.
2. **Đăng ký / Đăng nhập / Xác minh email** — form auth (ACC), trạng thái lỗi/thành công.
3. **Đặt sân (Booking)** — lịch grid slot theo giờ/sân, trạng thái slot (trống/đang giữ/đã đặt),
   countdown giữ chỗ Redis, luồng thanh toán 3 bước.
4. **Hồ sơ cá nhân** — profile, ví cá nhân/kinh doanh, lịch sử booking (ACC-07). *(Không gồm
   bảng xếp hạng — xếp hạng thuộc GĐ2.)*
5. **Quản trị (Admin)** — bảng quản lý duyệt NCC / người dùng / rút tiền / tranh chấp, dạng
   table, là giao diện tổng hợp các chức năng Admin nằm trong service nghiệp vụ (ACC/VEN/FIN).

**GĐ2 — dựng sau, cùng baseline (không thuộc Gdesign GĐ1):**

6. **Cộng đồng/Diễn đàn** — feed bài viết, tạo bài "tìm đối", nhóm/CLB. *(GĐ2 — `community-service`.)*
7. **Bảng xếp hạng** — leaderboard, lịch sử trận đấu. *(GĐ2 — `matchmaking-service`.)*
8. **Thông báo** — danh sách thông báo. *(GĐ2 — cross-cutting.)*

---

## 5. Ràng buộc hiệu năng (nhắc lại — bắt buộc)

- ❌ Không WebGL / Three.js / canvas 3D
- ❌ Không video nền
- ❌ Không scroll-jacking phức tạp
- ✅ CSS transition/transform cơ bản
- ✅ SVG icon, ảnh nén tối ưu (WebP)
- ✅ Skeleton loading cho danh sách/slot booking
- ✅ Mobile-first, tối ưu tốc độ tải trên 3G/4G
