# DESIGN.md — Badminton Community Booking Platform

> Design reference: adapted from actl.me (ACTL – Dubai Private Tennis League) visual language,
> re-purposed for badminton, web-only (no native mobile app), and stripped of heavy 3D/WebGL
> animation for free-tier hosting performance.

---

## 1. Product Context

A web application combining **court booking** (e-commerce-style reservation flow) with a
**player community/forum** and **competitive ranking system** for badminton players.

Backend: microservices architecture — 7 services + API Gateway, PostgreSQL (schema-per-service),
RabbitMQ Outbox Pattern, Redis (temporary slot-holding). Frontend: React 19, web application only
(desktop + mobile-responsive browser, NOT a native app).

**Performance constraint (hard requirement):** target free-tier hosting (Vercel/Netlify free,
no dedicated GPU/CDN budget). No WebGL, no Three.js, no scroll-jacked 3D canvas scenes, no heavy
particle/video backgrounds. Motion must be CSS-only (transition/transform/opacity) or lightweight
JS (Framer Motion basic variants at most).

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
  slogan lớn + CTA "Đặt sân ngay" / "Tham gia cộng đồng". Có thể thêm hiệu ứng parallax
  CSS transform đơn giản (di chuyển ảnh nền theo scroll ở mức nhẹ, không dùng canvas).
- **Ranking/Leaderboard:** bảng dạng list, mỗi row = avatar + tên + điểm (Geist Mono) +
  mũi tên tăng/giảm hạng (icon SVG màu xanh lá/đỏ), hàng top 1-3 có highlight màu accent.
- **Card pattern:** border-radius trung bình (12–16px), shadow nhẹ, hover = translateY(-2px)
  + shadow tăng nhẹ (transition 150ms, KHÔNG dùng 3D transform/tilt).

---

## 3. Sitemap (map từ ACTL sang kiến trúc dự án)

| ACTL (tham khảo) | → | Trang dự án | Service liên quan |
|---|---|---|---|
| Home | → | **Trang chủ** | Landing/Gateway |
| About | → | **Giới thiệu** | Static content |
| Ranking | → | **Bảng xếp hạng / Hồ sơ cá nhân** | Ranking/Matchmaking Service |
| Tournaments | → | **Sự kiện / Giải đấu nội bộ** (tuỳ chọn) | Booking Service (mở rộng) |
| App | → | *(bỏ — không có app)* | — |
| Gallery | → | **Cộng đồng / Diễn đàn** (feed ảnh, bài viết) | Community/Forum Service |
| Testimonials | → | **Đánh giá sân / Phản hồi người chơi** | Review module |
| Contact | → | **Liên hệ / Hỗ trợ** | Static content |
| *(mới)* | → | **Đặt sân (Booking)** — trang trung tâm của hệ thống | Booking Service + Redis slot-holding |
| *(mới)* | → | **Thông báo** | Notification Service |
| *(mới)* | → | **Trang quản trị (Admin)** | Admin Service |

---

## 4. Trang cần thiết kế chi tiết trong Stitch

1. **Trang chủ (Home)** — hero tĩnh (không 3D), giới thiệu nhanh 3 tính năng chính
   (Đặt sân / Cộng đồng / Xếp hạng), CTA rõ ràng.
2. **Đặt sân (Booking)** — lịch dạng grid slot theo giờ/sân, trạng thái slot
   (trống/đang giữ/đã đặt), countdown giữ chỗ Redis, luồng thanh toán 3 bước.
3. **Cộng đồng/Diễn đàn** — feed bài viết, tạo bài "tìm đối", danh sách nhóm/CLB theo khu vực.
4. **Hồ sơ & Xếp hạng** — profile, leaderboard, lịch sử trận đấu.
5. **Thông báo** — danh sách thông báo hệ thống.
6. **Quản trị (Admin)** — bảng quản lý sân/người dùng/giao dịch, dạng table đơn giản.

---

## 5. Ràng buộc hiệu năng (nhắc lại — bắt buộc)

- ❌ Không WebGL / Three.js / canvas 3D
- ❌ Không video nền
- ❌ Không scroll-jacking phức tạp
- ✅ CSS transition/transform cơ bản
- ✅ SVG icon, ảnh nén tối ưu (WebP)
- ✅ Skeleton loading cho danh sách/slot booking
- ✅ Mobile-first, tối ưu tốc độ tải trên 3G/4G
