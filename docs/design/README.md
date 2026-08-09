---
type: design-index
phase: 2.5
status: draft-for-po-review
updated: 2026-08-09
---

# Design — Phase 2.5 (UI/UX theo Playo.co)

Thư mục này chứa thiết kế trực quan cho `apps/web` ở **Phase 2.5** — đưa giao diện
đạt ~90–100% độ tương đồng với [playo.co](https://playo.co) về bố cục, hệ thị giác,
component và tương tác, **giữ nguyên phạm vi nghiệp vụ cầu lông của dự án**.

Kế hoạch phase: [`../../PLAN_PHASE2.5.md`](../../PLAN_PHASE2.5.md).

## Đọc theo thứ tự

1. [`design-system.md`](design-system.md) — **nền tảng**: token màu/type/spacing,
   component lõi, chrome toàn cục, motion, a11y. Mọi page spec tham chiếu file này.
2. Các page spec trong [`pages/`](pages/):

| # | Trang | Giai đoạn | Milestone | Route (đề xuất) |
|---|---|---|---|---|
| [01](pages/01-home.md) | Trang chủ | GĐ1 | P25-1 | `/` |
| [02](pages/02-auth.md) | Đăng nhập/Đăng ký + xác minh + đổi mật khẩu | GĐ1 | P25-1/3 | modal · `/verify-email` · `/reset-password` |
| [03](pages/03-venue-list.md) | Danh sách sân | GĐ1 | P25-1 | `/venues` |
| [04](pages/04-venue-detail.md) | Chi tiết cơ sở sân | GĐ1 | P25-1 | `/venues/:id` |
| [05](pages/05-booking.md) | Luồng đặt sân | GĐ1 | P25-2 | `/booking?venueId=` |
| [06](pages/06-profile.md) | Hồ sơ + Ví + Lịch sử | GĐ1 | P25-3 | `/profile` |
| [07](pages/07-admin.md) | Quản trị | GĐ1 | P25-6 | `/admin` |
| [08](pages/08-match.md) | Kèo (list + detail) | GĐ2 | P25-4 | `/matches` · `/matches/:id` |
| [09](pages/09-passport.md) | Player Passport | GĐ2 | P25-4 | `/passport/:userId?` |
| [10](pages/10-community.md) | Cộng đồng | GĐ2 | P25-5 | `/community` |
| [11](pages/11-ai-assistant.md) | Trợ lý AI | GĐ2 | P25-5 | `/assistant` |

## Khung cố định mỗi page spec

**Tham chiếu Playo** → **Đối chiếu scope dự án** → **Route** → **Bố cục
(desktop/mobile theo section)** → **Component dùng** → **Nối API thật** →
**Trạng thái (loading/empty/error/auth)** → **Motion** → **Tiêu chí đạt (AC-UI)**.

## Nguyên tắc

- Khớp Playo về **hình thức**; khớp dự án về **chức năng**. Không thêm/bớt feature.
- Chỉ sửa `apps/web` + docs design. Không đụng service/API/schema/logic.
- Route/component "đề xuất" cần PO duyệt trong page spec tương ứng trước khi dựng.
