# PLAN_PHASE2.5 — Tinh chỉnh UI/UX theo Playo.co

> **Mục tiêu phase:** đưa toàn bộ giao diện web (`apps/web`) đạt độ tương đồng
> **90–100%** với [playo.co](https://playo.co) về **bố cục trang, hệ thống thị giác
> (màu/typography/spacing), thành phần UI, và hành vi tương tác** — nhưng **giữ
> nguyên phạm vi nghiệp vụ của dự án** (cầu lông, không trainer, không đa môn).

Nguồn khảo sát: phiên khám phá trực tiếp playo.co ngày 2026-08-09 (Home, Venue
List, Venue Detail, Booking flow, Game/Match List, Match Detail, Profile,
Passbook, Auth modal). Ảnh chụp và ghi chú bố cục lưu trong các design spec bên dưới.

## 0. Quyết định đã chốt (PO, 2026-08-09)

| # | Quyết định | Chốt |
|---|---|---|
| D-UI1 | Chèn GĐ2.5 (re-skin/re-layout theo Playo) giữa GĐ2 và GĐ3, 0 UC nền mới | ✅ |
| D-UI2 | **Tách** Venue List / Venue Detail / Booking thành 3 trang riêng (khớp Playo); không đổi API/logic | ✅ |
| D-UI3 | **Đổi theme sáng/xanh lá** (ngôn ngữ Playo) thay actl.me tối/navy/vàng | ✅ |
| D-UI4 | Font UI = **Inter** (tự host); giữ Geist Mono cho số liệu | ✅ |
| D-UI5 | **Lồng Phase 2.5 THẲNG vào goal GĐ2** (2026-08-09): frontend GĐ2 build luôn trên design Playo, không tạo baseline actl.me rồi re-skin sau. Thực thi qua `docs/product/phase-2-goal.md` (milestone P2-FE0/FE1/FE2). GĐ2 đang ở P2-M4, frontend chưa bắt đầu nên không phát sinh rework. | ✅ |

---

## 1. Vị trí trong lộ trình

| | |
|---|---|
| Vị trí (cập nhật 2026-08-09) | **Lồng THẲNG vào goal GĐ2** (D-UI5), không còn là phase riêng sau GĐ2. Frontend GĐ2 build luôn trên design Playo. |
| Thực thi qua | `docs/product/phase-2-goal.md` — track frontend **P2-FE0 → P2-FE1 → P2-FE2** (thay P2-Gd/P2-Mfe cũ). |
| Vì sao lồng được không rework | GĐ2 đang ở **P2-M4**, frontend **chưa bắt đầu** (P2-Mfe chưa chạy). Không có UI actl.me nào đã dựng để phải re-skin. |
| Không sửa backend | Đúng — chỉ `apps/web` + docs design; không đụng service/API/schema/logic GĐ2. |
| Ảnh hưởng GĐ3 | GĐ3 (P3-M4 "UI/UX Polish") **thu hẹp lại**: polish thị giác đã làm trong GĐ2; P3-M4 chỉ còn polish nội dung demo + a11y cuối. |

## 2. Ranh giới thay đổi (rất quan trọng)

- **CHỈ sửa `apps/web`** (React FE) + tài liệu design. **KHÔNG** đụng
  `services/*`, schema, API contract, event, hay logic nghiệp vụ.
- Mọi trang phải nối **API thật đang có** (bài học F1 GĐ1/GĐ2: không mock shell).
  Nếu một trang cần dữ liệu API chưa cung cấp → **dừng, báo PO** (không tự thêm endpoint).
- Đây là **re-skin + re-layout**, không phải thêm/bớt tính năng. Số trang, số
  luồng bằng đúng những gì GĐ1+GĐ2 đã có.

## 3. Nguyên tắc đối chiếu Playo ↔ dự án (PO đã chốt)

| Playo có, dự án KHÔNG có → **loại bỏ** | Dự án có, Playo KHÔNG có → **tự thiết kế theo ngôn ngữ Playo** |
|---|---|
| Đa môn thể thao (Sports selector, category grid) — dự án **chỉ cầu lông** | Quản trị (Admin console) |
| Trainer / Coaching (nav "Train", tab Coaching, Trainer Queries) | Player Passport (rating + độ bất định) |
| Karma points, Gift cards, Playo Credits | Trợ lý AI (gợi ý kèo + chatbot RAG) |
| Events, Memberships (tab trong Venue List) | Cộng đồng / diễn đàn (feed, bài viết, report) |
| Playo Partner App (app riêng cho chủ sân) | Ví kinh doanh + luồng rút tiền / đối soát (provider/admin) |
| "Download the App" / store badges (dự án web-only) | Tranh chấp giao dịch (dispute) |

> **Quy tắc vàng:** khớp Playo về **hình thức** (layout, màu, component, motion);
> khớp dự án về **nội dung & chức năng**. Khi Playo có thứ dự án không có, bỏ hẳn
> chứ không thay bằng feature mới. Khi dự án có thứ Playo không có, thiết kế mới
> nhưng **tái dùng đúng design system** (màu/type/card/spacing) để nhìn vẫn là "một Playo".

## 4. Thay đổi hệ thị giác cốt lõi (so với DESIGN.md hiện tại)

Phase 2.5 **thay** ngôn ngữ thị giác actl.me (tối, navy/court-green, accent vàng)
bằng ngôn ngữ Playo (**sáng, nền trắng/xám, accent xanh lá**). Chi tiết token trong
[`docs/design/design-system.md`](docs/design/design-system.md).

| Yếu tố | DESIGN.md (actl.me) | Phase 2.5 (Playo) |
|---|---|---|
| Theme | Tối (navy `#15446C`, court-green `#1B4D2E`) | **Sáng** (canvas `#F4F5F6`, surface trắng) |
| Accent chính | Vàng cầu `#F5E663` | **Xanh lá emerald `#23A455`** |
| Navbar | Tối, blur, menu overlay full-screen | **Trắng, ngang, đơn giản; dropdown avatar khi đăng nhập** |
| Card | Tối trên nền tối | **Trắng, shadow rất nhẹ, radius 16px** |
| Cảm giác | Thể thao cạnh tranh, cao cấp, kịch tính | **Sạch, thân thiện, cộng đồng, dễ dùng** |

**Giữ nguyên từ DESIGN.md (không đổi):** ràng buộc hiệu năng §1/§5 — ❌ WebGL /
Three.js / canvas 3D / video nền; ✅ motion CSS-only, SVG icon, WebP, skeleton,
mobile-first, `prefers-reduced-motion`. Playo vốn nhẹ và tĩnh → dễ đạt free-tier.

> DESIGN.md §1.1 và §2 (visual identity actl.me) được Phase 2.5 **thay thế**.
> `design-system.md` là nguồn thị giác có thẩm quyền từ Phase 2.5 trở đi. Đã ghi
> chú superseding ở đầu DESIGN.md.

## 5. Sản phẩm tài liệu (đã tạo trong phiên này)

```
PLAN_PHASE2.5.md                     ← file này
docs/design/
  README.md                          ← chỉ mục + quy ước design spec
  design-system.md                   ← NỀN TẢNG: token màu/type/spacing, component, motion, a11y
  pages/
    01-home.md                       ← Trang chủ
    02-auth.md                       ← Đăng nhập/Đăng ký (modal) + xác minh email + đặt lại/đổi mật khẩu
    03-venue-list.md                 ← Danh sách sân (tìm/lọc)
    04-venue-detail.md               ← Chi tiết cơ sở sân
    05-booking.md                    ← Luồng đặt sân (chọn slot → giữ chỗ → thanh toán)
    06-profile.md                    ← Hồ sơ + Ví (personal/business) + lịch sử booking + tranh chấp
    07-admin.md                      ← Quản trị (duyệt NCC / rút tiền / đối soát / tranh chấp)
    08-match.md                      ← Kèo: danh sách + chi tiết (GĐ2)
    09-passport.md                   ← Player Passport (GĐ2)
    10-community.md                  ← Cộng đồng / diễn đàn (GĐ2)
    11-ai-assistant.md               ← Trợ lý AI (GĐ2)
```

Mỗi page spec có khung cố định: **Tham chiếu Playo → Đối chiếu scope → Route →
Bố cục (desktop/mobile theo section) → Component dùng → Nối API thật → Trạng thái
(loading/empty/error/auth) → Motion → Tiêu chí đạt (AC-UI)**.

## 6. Chuỗi milestone

Thứ tự theo **dependency thị giác** (design system trước, rồi trang công khai →
giao dịch → tài khoản → GĐ2 → admin → QA). Mỗi milestone: dựng theo spec → tự
kiểm (typecheck + build sạch + đối chiếu ảnh Playo + responsive) → 1 vòng Codex
review → commit riêng.

| # | Milestone | Nội dung | Trang / spec | Phụ thuộc |
|---|---|---|---|---|
| **P25-0** | Nền tảng thiết kế | Token màu/type/spacing (Tailwind config); component lõi (Button, Card, Input, Badge, Pill, Tabs, Modal, Toast, Skeleton, EmptyState); chrome toàn cục: **Navbar trắng**, Footer, AppLayout, Preloader, khung Auth modal | `design-system.md` | GĐ2 xong |
| **P25-1** | Trang công khai | Home, Venue List, Venue Detail + Auth modal (đăng nhập/đăng ký) | `01`, `03`, `04`, `02` | P25-0 |
| **P25-2** | Luồng đặt sân | Booking flow (chọn slot → hold + countdown → tạo booking → thanh toán số dư/SePay), hủy booking + hoàn tiền | `05` | P25-1 |
| **P25-3** | Khu vực tài khoản | Profile (info + ví personal/business + lịch sử booking + edit + tranh chấp), xác minh email, đặt lại/đổi mật khẩu | `06`, `02` (phần verify/reset) | P25-1 |
| **P25-4** | Kèo & Passport (GĐ2) | Match List, Match Detail (players/JOIN/thanh toán phí), Player Passport (rating/RD/lịch sử/đánh giá) | `08`, `09` | P25-2, P25-3 |
| **P25-5** | Cộng đồng & AI (GĐ2) | Community feed (bài viết/bình luận/report + moderation), Trợ lý AI (2 tab: gợi ý kèo + chat RAG) | `10`, `11` | P25-4 |
| **P25-6** | Quản trị | Admin console: duyệt NCC / rút tiền / đối soát / tranh chấp / moderation — table + queue theo design system | `07` | P25-1 |
| **P25-QA** | Kiểm thử & đánh bóng | Audit responsive (mobile/tablet/desktop), a11y (focus, contrast, `prefers-reduced-motion`), đối chiếu pixel với Playo, nhất quán xuyên trang, empty/error tiếng Việt | tất cả | P25-0..6 |
| **P25-final** | Cổng nghiệm thu | Toàn bộ AC-UI pass + build/typecheck sạch + Lighthouse ≥ mục tiêu + PO duyệt trực quan | — | tất cả |

## 7. Ràng buộc xuyên suốt

- **Không đổi service/API/schema/event/logic.** Chỉ FE + docs design.
- Mọi trang nối API thật; không mock làm bằng chứng hoàn thành.
- Giữ ràng buộc hiệu năng DESIGN.md §5 (không WebGL/3D/video nền; motion CSS-only).
- Mọi text UI **tiếng Việt** (empty/error/nhãn), tiền tệ `đ` (VND), không "INR/Karma".
- `prefers-reduced-motion`: tắt mọi chuyển động không thiết yếu.
- Không đưa lại tính năng đã loại ở mục 3 (trainer, đa môn, karma, gift card).

## 8. Pause rules (dừng, báo PO)

- Một trang cần dữ liệu mà API hiện tại không trả → dừng (không tự thêm endpoint/field).
- Việc "khớp Playo" đòi thêm một feature nghiệp vụ mới (ví dụ karma, trainer) → dừng.
- Đổi màu/typography ở mức phá nhận diện đã chốt (§4) → xác nhận PO trước.
- Cần asset bản quyền của Playo (logo/ảnh/icon) → dừng; chỉ dùng asset tự tạo/ảnh
  hợp lệ (mục Bản quyền, `design-system.md`).

## 9. Cổng nghiệm thu (Done when)

1. 11 trang khớp Playo ≥ mục tiêu ở bố cục + hệ thị giác (đối chiếu ảnh, PO duyệt).
2. Toàn bộ **AC-UI** trong 11 page spec đạt (checklist mỗi spec).
3. `apps/web` typecheck + build sạch; không lỗi console runtime ở các luồng chính.
4. Responsive 3 breakpoint (mobile 375 / tablet 768 / desktop ≥1280) không vỡ layout.
5. A11y cơ bản: focus nhìn thấy, contrast đạt WCAG AA cho text, `prefers-reduced-motion` tôn trọng.
6. Không regression: các luồng E2E GĐ1/GĐ2 vẫn chạy (chỉ đổi selector nếu cần).

## 10. Bước tiếp theo

1. ✅ **PO đã duyệt** PLAN + 4 quyết định D-UI1..D-UI4 (mục 0) ngày 2026-08-09.
2. Chờ **GĐ2 hoàn tất** → chạy **P25-0 (design system)** đầu tiên: cập nhật Tailwind
   config theo `design-system.md` (token màu sáng/xanh, Inter tự host), dựng
   component lõi + Navbar/Footer/Preloader mới.
3. Executor: Claude Code dựng theo spec; Codex review mỗi milestone; PO duyệt trực quan.
