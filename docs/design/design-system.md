---
type: design-system
phase: 2.5
status: draft-for-po-review
supersedes: docs/DESIGN.md §1.1, §2 (visual identity actl.me)
source: khảo sát playo.co 2026-08-09
updated: 2026-08-09
---

# Design System — Historical Playo baseline

> Historical baseline only: tài liệu này không còn là nguồn quyết định màu, bố cục,
> typography, radius hoặc shadow. Visual authority hiện hành là Figma COURTIN
> `FHuhhmlhPSl8gOUuUx7az2` theo D45; xem [courtin-figma-authority.md](courtin-figma-authority.md).

Nguồn thị giác **có thẩm quyền** cho `apps/web` từ Phase 2.5. Mọi page spec tham
chiếu token và component ở đây; không tự đặt màu/spacing rời rạc trong trang.

> **Giữ nguyên** ràng buộc hiệu năng DESIGN.md §5 (không WebGL/3D/video nền;
> motion CSS-only; SVG/WebP; mobile-first; `prefers-reduced-motion`).

---

## 0. Bản chất phong cách Playo (nắm trước khi chỉnh)

- **Sáng, sạch, nhiều khoảng trắng.** Nền xám rất nhạt, nội dung trên thẻ trắng bo
  góc, đổ bóng cực nhẹ. Không gradient nặng, không viền đậm.
- **Xanh lá là nhân vật chính.** Dùng cho hành động (button), trạng thái tích cực,
  logo, link nhấn. Còn lại là trung tính (đen mực + xám).
- **Bo tròn nhiều.** Button dạng pill (bo hết), card 16px, input 12px, avatar tròn.
- **Chữ đậm vừa, thân thiện.** Heading bold nhưng không uppercase kịch tính như
  actl.me; sentence case, ấm áp.
- **Ít chuyển động.** Hover nhấc nhẹ + đổi nền; fade/slide ngắn. Không parallax nặng.

---

## 1. Màu (design tokens)

> Giá trị hex dưới đây được hiệu chỉnh từ ảnh chụp playo.co; **P25-0 phải calibrate
> lại bằng color-picker trên ảnh Playo** rồi khóa giá trị cuối vào Tailwind config.

### 1.1 Thương hiệu — xanh lá

| Token | Hex | Dùng |
|---|---|---|
| `green-700` | `#1B7C41` | Hover đậm, banner khuyến mãi nền xanh, text xanh trên nền sáng |
| `green-600` | `#23A455` | **Màu hành động chính** — button primary, logo, link nhấn, tab active |
| `green-500` | `#2BB463` | Accent sáng, highlight, panel minh hoạ (auth) |
| `green-100` | `#D8F0E1` | Nền chip/badge tích cực nhạt |
| `green-50`  | `#EAF7EF` | Nền success block, hover row nhạt |

### 1.2 Trung tính

| Token | Hex | Dùng |
|---|---|---|
| `ink-900` | `#1A1D1F` | Text chính, heading |
| `ink-700` | `#3A3F45` | Text đậm phụ |
| `ink-500` | `#6B7280` | Text phụ, caption, placeholder |
| `ink-300` | `#9AA0A6` | Icon mờ, disabled text |
| `line`    | `#E7E8EA` | Viền, divider |
| `surface` | `#FFFFFF` | Nền card, nav, modal |
| `canvas`  | `#F4F5F6` | Nền trang (page background) |

### 1.3 Ngữ nghĩa

| Token | Hex | Dùng |
|---|---|---|
| `success` | `#23A455` | = green-600 (đã đặt/bookable/confirmed) |
| `warning` | `#F5A623` | Badge "Featured", pill "Chỉ còn 1 slot", cảnh báo nhẹ |
| `danger`  | `#E5484D` | Lỗi, hủy, từ chối, badge "Live/Hot" (đế cầu) |
| `info`    | `#2B7FFF` | Thông tin trung lập (hiếm dùng) |
| `warning-bg` `#FEF3E2` · `danger-bg` `#FDECEC` | | Nền block cảnh báo/lỗi |

> Giữ mã cũ `--color-accent-red #E63946` cho "Live/Hot" nếu cần đồng bộ; ưu tiên
> `danger #E5484D` cho lỗi hệ thống để tách nghĩa.

## 2. Typography

| Vai trò | Font | Ghi chú |
|---|---|---|
| UI / body / heading | **Inter** (400/500/600/700) — **PO chốt 2026-08-09** | Thay Geist. Sạch, trung tính, giống nhịp chữ Playo. Tự host qua `@fontsource/inter` (không gọi Google Fonts runtime — free-tier/offline). |
| Số liệu | **Geist Mono** (giữ nguyên) | Giá tiền, rating/RD, mã booking, đồng hồ giữ chỗ |

**Scale** (line-height trong ngoặc):

| Bậc | Size / weight | Dùng |
|---|---|---|
| Display | 40–48px / 700 (1.15) | Hero H1 trang chủ |
| H1 | 28–32px / 700 (1.2) | Tên trang, tên sân/kèo |
| H2 | 22–24px / 600 (1.25) | Tiêu đề section |
| H3 | 18px / 600 (1.3) | Tiêu đề card |
| Body | 15–16px / 400 (1.6) | Nội dung |
| Small | 13–14px / 400 (1.5) | Phụ, meta |
| Caption | 12px / 500, tracking 0.02em | Nhãn, badge (sentence/Title case, **không** uppercase kịch tính) |
| Figure | Geist Mono 14–28px | Số liệu |

## 3. Spacing, bo góc, bóng, layout

- **Spacing scale:** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 (px). Section dọc: 48–64
  desktop, 32 mobile. Gutter lưới card: 16–24.
- **Container:** `max-width: 1200px`, canh giữa, padding ngang 16 (mobile) / 24 (≥sm).
- **Bo góc:** card `16px` · input/select `12px` · button **pill (999px)** · badge/chip
  `8px` · avatar/`img` tròn hoặc `12px`.
- **Bóng:** rest `0 1px 3px rgba(20,30,40,.06), 0 1px 2px rgba(20,30,40,.04)`;
  hover `0 8px 24px rgba(20,30,40,.10)`. Không dùng bóng đậm/nhiều lớp.
- **Breakpoint:** mobile `<640` · sm `640` · md/tablet `768` · lg/desktop `1024` ·
  xl `1280`. **Mobile-first.**

## 4. Component lõi (dựng ở P25-0)

Tất cả tái dùng token trên. Trạng thái bắt buộc: `default / hover / active /
focus-visible / disabled / loading`.

| Component | Đặc tả ngắn |
|---|---|
| **Button** | *Primary*: nền `green-600`, chữ trắng, pill, hover `green-700` + nhấc `translateY(-1px)`. *Secondary*: nền trắng, viền `line`, chữ `ink-900`. *Ghost/link*: chữ `green-600`. *Danger*: nền/viền `danger`. Kích cỡ sm/md/lg. |
| **Card** | Nền `surface`, radius 16, bóng rest, padding 16–24. Biến thể *hoverable* (nhấc + bóng hover) cho card có link. |
| **Input / Select / Textarea** | Nền trắng, viền `line`, radius 12, focus viền `green-600` + ring `green-100`. Label trên, helper/error dưới (error màu `danger`). |
| **Badge / Chip** | Pill nhỏ. *success* (green-100/green-700), *warning* ("Featured"), *danger* ("Live"), *neutral* (ink). Có biến thể có chấm rating (nền green-100, số Geist Mono). |
| **Tabs** | Hàng ngang, tab active gạch chân `green-600` + chữ đậm; inactive `ink-500`. Dùng cho Profile, Admin, Venue List, AI. |
| **Segmented control** | Pill group (như "Upcoming/Past/Cancelled" của Playo): item active nền `green-600` trắng, còn lại viền `line`. |
| **Modal / Dialog** | Overlay `rgba(20,30,40,.5)`, hộp trắng radius 16, đóng bằng X góc phải + click nền + `Esc`. Auth modal có 2 nửa: nửa minh hoạ (green-500 + illustration) + nửa form. |
| **Toast** | Góc trên phải, trắng, viền trái theo ngữ nghĩa, auto-dismiss ~4s. success/error/info. |
| **Skeleton** | Khối xám `#ECEDEF` bo góc, shimmer CSS nhẹ. Dùng cho list sân/kèo/slot. |
| **EmptyState** | Icon line-art + tiêu đề + mô tả + CTA. Tông trung tính, thân thiện (tránh mặt buồn nếu không hợp ngữ cảnh). |
| **Avatar** | Tròn, fallback chữ cái đầu trên nền `green-100`. |
| **Pagination / Carousel** | Nút tròn ‹ › viền `line`; carousel card cuộn ngang (Home, Venue Detail "gần đây"). |

## 5. Chrome toàn cục

### 5.1 Navbar (thay bản navy hiện tại)

- **Nền trắng**, cao ~64px, sticky top, bóng rất nhẹ khi cuộn (thay vì đổi từ
  trong suốt → navy). Logo **cầu lông** bên trái (SVG tự tạo, chữ + biểu tượng
  quả cầu, tông xanh `green-600`).
- **Giữa:** liên kết chính dạng icon + chữ giống Playo, **rút còn đúng scope dự án**:
  `Đặt sân` (Book) · `Kèo` (Play, GĐ2) · `Cộng đồng` (GĐ2). **Bỏ "Train".**
- **Phải:** chưa đăng nhập → `Đăng nhập / Đăng ký` (mở Auth modal). Đã đăng nhập →
  **avatar tròn** mở dropdown: Hồ sơ · (Passport nếu GĐ2) · Trợ lý AI · Quản trị
  (chỉ admin) · Đăng xuất. **Bỏ** Trainer Queries, Blogs, store badges.
- Mobile: gộp liên kết vào menu (sheet trượt hoặc dropdown), **không** cần overlay
  full-screen kịch tính như actl.me.

### 5.2 Footer

- Nền trắng/`canvas`, chia cột: giới thiệu ngắn + các nhóm link (**Về chúng tôi,
  Liên hệ, Điều khoản, Chính sách hủy, Chính sách bảo mật**), mạng xã hội dạng icon
  viền tròn. **Bỏ** "Download the App / Google Play / App Store" (web-only).

### 5.3 AppLayout & Preloader

- `AppLayout`: Navbar sticky + `<Outlet/>` trên nền `canvas` + Footer. Padding-top
  chừa Navbar.
- **Preloader:** giữ ý tưởng overlay full-screen nhưng **đổi sang tông sáng** —
  nền trắng/`canvas`, quả cầu lông SVG nảy nhẹ bằng `@keyframes` (không Framer
  Motion), fade-out ~300ms khi asset chính tải xong.

## 6. Motion

- Hover card/button: `transform: translateY(-1px..-2px)` + đổi nền/bóng, `150ms ease`.
- Vào section khi cuộn: fade + slide-up nhẹ 8–12px, `200–250ms`, chạy một lần.
- Modal: fade overlay + scale 0.98→1 hộp, `180ms`.
- WS/tin realtime (GĐ2): fade/slide 150–250ms, **không auto-scroll cưỡng bức**.
- `@media (prefers-reduced-motion: reduce)`: tắt transform/opacity không thiết yếu,
  giữ đổi màu tức thời.

## 7. Icon & minh hoạ

- Icon: bộ line/duotone đồng nhất (đề xuất **Lucide** — nhẹ, tree-shake, tự host).
  Tránh emoji cho UI chính. Playo dùng vài icon duotone; ta dùng Lucide + vài SVG
  cầu-lông tự vẽ (vợt, quả cầu, sân).
- Minh hoạ: flat/line tự tạo (auth modal, empty state). **Không** dùng ảnh/nhân vật
  bản quyền của Playo.

## 8. A11y

- Contrast text ≥ WCAG AA (ink-900/ink-500 trên trắng đạt; xanh `green-600` chỉ
  dùng cho chữ ≥ 16px bold hoặc trên nền trắng đủ tương phản — button dùng chữ trắng).
- `focus-visible`: ring `green-100` + viền `green-600`, luôn nhìn thấy.
- Mọi input có `<label>`; trạng thái lỗi có `aria-describedby`.
- Modal: bẫy focus, đóng bằng `Esc`, trả focus về trigger.
- Ảnh có `alt`; icon-only button có `aria-label` (giữ như code hiện tại).

## 9. Bản quyền (bắt buộc)

Copy **phong cách** (layout, hệ màu, nhịp spacing, hành vi), **không** copy tài
sản: không dùng logo Playo, ảnh chụp venue/nhân vật của Playo, icon gốc, hay copy
text nguyên văn. Chữ viết lại tiếng Việt đúng sản phẩm cầu lông. Ảnh dùng nguồn
hợp lệ (tự chụp/CC/mua) hoặc placeholder tự tạo.

## 10. Bản đồ token cũ → mới (di trú)

| Cũ (actl.me, đang trong Tailwind) | Mới (Playo) |
|---|---|
| `primary-navy`, `primary-blue`, `slate` | → nền trắng/`surface`, nhấn `green-600` |
| `court-green` (nền tối) | → `canvas`/`green-700` (chỉ khi cần khối xanh) |
| `accent-shuttle` (vàng) | → `green-600` (hành động) ; giữ `warning` cho badge |
| `on-dark` (chữ trên nền tối) | → `ink-900`/`ink-500` (chữ trên nền sáng) |
| `text-figures` (Geist Mono) | giữ nguyên |

P25-0 cập nhật Tailwind config theo bảng này; các trang sau chỉ dùng token mới.
