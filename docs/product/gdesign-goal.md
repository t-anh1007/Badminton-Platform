---
type: goal
package: Gdesign
phase: 1
status: draft-for-review
executor: Claude Code (D21 — Claude thực thi trọn goal GĐ1)
reviewer: Claude self-verification
final_acceptance: PO (Tuan Anh)
created: 2026-08-06
source: docs/DESIGN.md (design baseline, §1.1 định nghĩa "giống actl.me 90%", §4 sáu trang)
position: sau G0, trước G1 (chuỗi Gboot → G0 → Gdesign → G1)
---

# Goal — Gdesign: Design baseline + khung `apps/web`

> Milestone này tồn tại vì [phase-1-goal.md](phase-1-goal.md) đòi 198 AC (nhiều AC có UI) nhưng
> Gboot/G0 chỉ dựng backend. G1…G7 cần một **baseline UI có sẵn** để build lên, không mỗi gói tự
> dựng lại design từ đầu. Gdesign là baseline đó. (Toàn goal do Claude thực thi — [D21](decision-log.md).)

## Mục tiêu (Outcome)

`apps/web` (React 19 + Vite + TS + Tailwind, theo ADR 0002) có **design baseline chạy được**:
design tokens từ [DESIGN.md §2.1](../DESIGN.md), typography scale [§2.2](../DESIGN.md), và
component dùng chung + **page shell các trang nhóm "GĐ1" ở [§4](../DESIGN.md)** — đạt tiêu chí
"giống actl.me ~90%" đúng như [DESIGN.md §1.1](../DESIGN.md) định nghĩa, **không** WebGL/3D.
Trang GĐ2 (Cộng đồng, Xếp hạng, Thông báo) **không** thuộc Gdesign — dựng sau bằng cùng baseline.

## Success condition (đo được)

1. **`apps/web` khởi động sạch:** `npm run dev` trong `apps/web` chạy không lỗi; build production
   (`vite build`) sạch.
2. **Design tokens hiện thực hóa:** toàn bộ token màu [§2.1](../DESIGN.md) là CSS variables/Tailwind
   theme (navy, blue, slate, court-green `#1B4D2E`, accent-shuttle `#F5E663`, đỏ đế cầu `#E63946`…);
   không hardcode hex rời rạc trong component.
3. **Typography:** Geist + Geist Mono cấu hình đúng; scale H1/H2/Body/Caption khớp [§2.2](../DESIGN.md)
   (Geist Mono chỉ cho số liệu: ranking, tỉ số, mã đặt sân, countdown).
4. **5 page shell GĐ1** (nhóm "GĐ1" ở [§4](../DESIGN.md)): Trang chủ, Đăng ký/Đăng nhập/Xác minh
   email, Đặt sân, Hồ sơ cá nhân (không gồm xếp hạng), Quản trị — mỗi trang có layout + component
   khung (chưa cần data thật), là khung để gói nghiệp vụ tương ứng cắm logic vào. **Trang GĐ2
   (Cộng đồng, Xếp hạng, Thông báo) không dựng ở Gdesign.**
5. **"Giống 90%" kiểm được theo cột trái [§1.1](../DESIGN.md):** thứ tự section, nhịp spacing,
   tỉ lệ typography, ngôn ngữ motion (hover đổi màu, menu overlay full-screen, card nhấc khi hover,
   section fade/slide khi cuộn), hành vi UX (nav sticky đổi nền khi cuộn, overlay thay dropdown,
   leaderboard list đậm số liệu). Đối chiếu trực quan với https://actl.me/ hoặc ảnh crawl trong
   DESIGN.md.
6. **Component chủ đạo có sẵn:** nav bar sticky, menu overlay full-screen, hero tĩnh + parallax
   CSS ([§2.3](../DESIGN.md)), preloader quả cầu CSS keyframes, card pattern hover translateY,
   table Admin, form auth, slot-grid đặt sân. *(Leaderboard là component GĐ2, không bắt buộc ở đây.)*

## Scope boundary

- **Được đổi:** `apps/web` (mới), cấu hình Tailwind/theme, thư mục component/style dùng chung của FE.
- **Chỉ baseline, không nghiệp vụ:** dùng dữ liệu giả (mock/placeholder). Không gọi API thật,
  không state management phức tạp, không auth — những thứ đó thuộc G1…G7.
- **Ngoài phạm vi:** nội dung/copy thật của actl.me (viết lại tiếng Việt đúng cầu lông), logo/ảnh/
  icon gốc actl.me, model 3D `.glb`, canvas WebGL, Lenis smooth-scroll — theo cột phải [§1.1](../DESIGN.md).
- **Ngoài phạm vi (thuộc GĐ2):** trang Cộng đồng/Diễn đàn, Bảng xếp hạng, Thông báo — dựng sau
  bằng cùng baseline, không phải bây giờ.
- **Cấm cứng (ràng buộc hiệu năng [§5](../DESIGN.md)):** WebGL, Three.js, canvas 3D, video nền,
  scroll-jacking phức tạp.

## Context — đọc trước khi làm

- [DESIGN.md](../DESIGN.md) — toàn bộ, đặc biệt §1.1 (định nghĩa 90%), §2 (tokens/type/component),
  §3 (sitemap có nhãn giai đoạn), §4 (trang GĐ1 vs GĐ2), §5 (ràng buộc hiệu năng)
- [system-architecture.md §9](../architecture/system-architecture.md) — `apps/web` trong monorepo
- [ADR 0002](../decisions/0002-tech-stack-microservices.md) — React + Vite + TS + Tailwind + Router
- Tham chiếu trực quan: https://actl.me/ (chỉ layout/motion/UX — KHÔNG copy 3D, nội dung, asset)

## Operating rules

- Progress log tại `docs/product/phase-1-progress.md` (§3 Nhật ký hạ tầng): ghi mỗi trang/component
  baseline sau khi xong.
- Ưu tiên **token + component dùng chung trước**, rồi ráp trang — tránh mỗi trang tự chế style.
- Làm từng trang một, xác minh render + responsive ngay, không dồn 5 trang rồi mới xem.
- Không tự thêm thư viện nặng để "giống hơn"; mọi motion là CSS transition/transform hoặc Framer
  Motion basic ([§1](../DESIGN.md)).

## Validation loop

**Trong lúc làm:** sau mỗi trang — render được, responsive mobile/desktop, không lỗi console,
không import WebGL/canvas.

**Cuối cùng (proof):**
1. `npm run dev` và `vite build` của `apps/web` đều sạch.
2. 5 page shell GĐ1 [§4](../DESIGN.md) render được với baseline component, responsive.
3. **Lưu screenshot mỗi trang ở viewport cố định** (ví dụ 1440px desktop + 390px mobile) vào
   `docs/product/gdesign-screenshots/` — đây là bằng chứng "90%" **bền vững** (actl.me là site
   sống, thay đổi được, nên không dùng làm bằng chứng duy nhất). Đối chiếu từng điểm cột trái
   [§1.1](../DESIGN.md), ghi bảng đạt/lệch vào progress log.
4. Grep toàn `apps/web`: **không** có `three`, `webgl`, `<canvas`, `lenis`, video nền.
5. Design tokens tập trung một nguồn (theme), component không hardcode hex.

## Done when

- Cả 5 mục "Cuối cùng" pass; progress log ghi bảng đối chiếu 90% (đạt/lệch từng điểm) + danh sách
  5 page shell GĐ1 + component baseline + screenshot viewport cố định; Claude self-verify xong.

## Pause if

- Để "giống actl.me hơn" mà cần WebGL/3D/canvas/video nền → **dừng**; §1.1 đã chốt 90% là
  layout/motion/UX, KHÔNG phải cảnh 3D. Đây là ranh giới hiệu năng bất biến của dự án.
- Baseline đòi một quyết định cấu trúc dữ liệu/route mà thực ra thuộc nghiệp vụ G1…G7 → dừng,
  giữ Gdesign ở mức khung, không lấn sang logic.
- DESIGN.md và spec nghiệp vụ mâu thuẫn về một màn hình (ví dụ Admin) → dừng và hỏi PO.

---

## Vì sao goal này an toàn để chạy

- **Đo được:** build sạch + 5 page shell GĐ1 render + screenshot viewport cố định + bảng đối
  chiếu 90% từng điểm + grep-âm WebGL — không đánh giá cảm tính.
- **Phạm vi khoá:** chỉ baseline + mock, không nghiệp vụ, không API — G1…G7 mới cắm logic.
- **Rủi ro chính:** trôi phạm vi sang 3D để "giống hơn" → Pause rule đúng cho nó; ranh giới hiệu
  năng §5 là bất biến dự án.
- **Bằng chứng để review:** `phase-1-progress.md` (bảng đối chiếu 90% + danh sách trang/component)
  + diff `apps/web`.
