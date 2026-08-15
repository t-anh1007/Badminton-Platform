# DESIGN.md — Badminton Community Booking Platform

> ⚠️ **Superseded một phần từ Giai đoạn 2.5 (2026-08-09).** Ngôn ngữ thị giác
> actl.me trong §1.1 và §2 (màu tối/navy/vàng, menu overlay, hero parallax) được
> **thay thế** bởi ngôn ngữ Playo (sáng/trắng-xám/xanh lá) — xem
> [`docs/design/design-system.md`](design/design-system.md) và
> [`PLAN_PHASE2.5.md`](../PLAN_PHASE2.5.md). **Giữ nguyên** ràng buộc hiệu năng §1
> và §5 (không WebGL/3D/video nền; motion CSS-only). Tài liệu này vẫn đúng cho
> baseline GĐ1/GĐ2 đã dựng; GĐ2.5 re-skin lên trên.

> Design reference: adapted from actl.me (ACTL – Dubai Private Tennis League) visual language,
> re-purposed for badminton, web-only (no native mobile app), and stripped of heavy 3D/WebGL
> animation for free-tier hosting performance.

---

## 1. Product Context

A web application combining **court booking** (e-commerce-style reservation flow) with a
**public player community**, match-making and an uncertainty-aware **Player Passport**.

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
| Hành vi UX: nav bar sticky đổi nền khi cuộn, menu overlay full-screen thay vì dropdown nhỏ, Passport/rating-history dạng list đậm số liệu | Cảnh hero 3D xoay theo scroll — thay bằng ảnh tĩnh/illustration + parallax CSS nhẹ (mục 2.3) |
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
- **Font số liệu:** Geist Mono — dùng riêng cho: rating/RD trong Passport, tỉ số trận đấu, mã đặt sân,
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
- **Passport/Rating summary:** rating và độ bất định dùng Geist Mono; bậc hiển thị bằng badge,
  lịch sử trận dạng list. RD cao phải hiện nhãn "đang xác định trình độ", không biến rating thành
  leaderboard/gamification ngoài phạm vi.
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
| Ranking | → | **Player Passport** (bậc, rating, độ bất định, lịch sử) | `matchmaking-service` | GĐ2 |
| *(mới)* | → | **Kèo** (tìm/tạo/tham gia/quản lý/Tìm nhanh) | `matchmaking-service` | GĐ2 |
| Gallery | → | **Cộng đồng / Diễn đàn** (feed, bài viết) | `community-service` | GĐ2 |
| Testimonials | → | **Đánh giá sau trận** | `matchmaking-service` | GĐ2 |
| Contact | → | **Liên hệ** | Static content | GĐ1 |
| *(mới)* | → | **Đặt sân (Booking)** — trang trung tâm | `venue-booking-service` + Redis | **GĐ1** |
| *(mới)* | → | **Trợ lý AI** (gợi ý kèo + chatbot có nguồn) | `packages/ai` qua service sở hữu luồng | GĐ2 |
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
   Player Passport/rating — thuộc GĐ2.)*
5. **Quản trị (Admin)** — bảng quản lý duyệt NCC / người dùng / rút tiền / tranh chấp, dạng
   table, là giao diện tổng hợp các chức năng Admin nằm trong service nghiệp vụ (ACC/VEN/FIN).

**GĐ2 — P2-Gd chốt page shell, cùng baseline GĐ1:**

6. **Kèo** — tìm/lọc, tạo, xem chi tiết, gửi yêu cầu, organizer xét duyệt, rút/hủy và panel
   Tìm nhanh realtime. *(GĐ2 — `matchmaking-service`.)*
7. **Player Passport** — bậc, rating, độ bất định, lịch sử và đánh giá sau trận; bản xem người
   khác luôn rút gọn dữ liệu công khai. *(GĐ2 — `matchmaking-service`.)*
8. **Cộng đồng & hỗ trợ cá nhân** — feed công khai, bài viết/bình luận/report, moderation Admin và ticket
   riêng user↔Admin. Không nhóm kín/CLB/tin nhắn riêng. *(GĐ2 — `community-service`.)*
9. **Trợ lý AI** — gợi ý kèo có giải thích và chatbot RAG có nguồn; chỉ hướng dẫn/dẫn tới luồng
   nghiệp vụ, không tự tạo JOIN, hủy booking, hoàn tiền hay moderation. *(`packages/ai` dùng chung.)*

### 4.1 Cấu trúc page shell GĐ2 (P2-Gd)

Mọi shell tái dùng `AppLayout`, nav sticky, card, badge và token hiện có. P2-Gd chỉ chốt bố cục;
P2-Mfe phải nối API thật, không để mock/placeholder thành bằng chứng hoàn thành.

| Shell | Desktop | Mobile | Trạng thái bắt buộc |
|---|---|---|---|
| **Kèo** | Cột lọc trái + danh sách kèo giữa + panel Tìm nhanh/giải thích độ hợp bên phải; chi tiết dùng hero thông tin sân/giờ/phí và drawer yêu cầu tham gia | Bộ lọc thành bottom sheet; card một cột; CTA tham gia cố định đáy, không che countdown giữ chỗ | loading skeleton; empty không có kèo; cutoff/filled; JOIN pending/approved/confirmed; lỗi thanh toán/realtime có đường thử lại |
| **Player Passport** | Header avatar+bậc; khối rating/RD; lịch sử trận và đánh giá; owner có CTA khai báo/đánh giá, public view chỉ bản rút gọn | Các khối xếp dọc; rating số lớn bằng Geist Mono; lịch sử thành card | cold-start/RD cao; chưa có trận; đánh giá đang flagged chờ Admin; public privacy-safe |
| **Cộng đồng & hỗ trợ** | Feed trung tâm, composer phía trên, rail phải cho report/ticket; Admin dùng queue + audit table cùng pattern Admin GĐ1 | Feed một cột; composer/report/ticket mở full-screen sheet; moderation table thành stacked rows | public guest; empty feed; post hidden/removed; report open/actioned/dismissed; ticket open/in-progress/resolved/closed; 403 rõ ràng |
| **Trợ lý AI** | Hai tab: Gợi ý kèo và Chat hỗ trợ; mỗi gợi ý có điểm+giải thích; câu trả lời chat có source chips và CTA mở luồng chuẩn | Tab dạng segmented control; chat full-height trong content area; source chips cuộn ngang | Gemini fallback; AI tạm bận; không có gợi ý; nguồn công khai/dữ liệu của chính user; action request luôn trả hướng dẫn, không tự thi hành |

**Motion GĐ2:** WS proposal và tin nhắn mới chỉ fade/slide nhẹ 150–250ms; không auto-scroll cưỡng
bức, không 3D. Badge `Live` dùng đỏ đế cầu `#E63946`, trạng thái thanh toán/confirmed dùng accent
shuttle; `prefers-reduced-motion` phải tắt chuyển động không thiết yếu.

---

## 5. Ràng buộc hiệu năng (nhắc lại — bắt buộc)

- ❌ Không WebGL / Three.js / canvas 3D
- ❌ Không video nền
- ❌ Không scroll-jacking phức tạp
- ✅ CSS transition/transform cơ bản
- ✅ SVG icon, ảnh nén tối ưu (WebP)
- ✅ Skeleton loading cho danh sách/slot booking
- ✅ Mobile-first, tối ưu tốc độ tải trên 3G/4G
