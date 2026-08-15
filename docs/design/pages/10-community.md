---
type: page-design
page: community
phase: GĐ2
milestone: P25-5
route: /community
updated: 2026-08-09
---

# Cộng đồng (Community)

## Tham chiếu Playo
Playo có Blogs (nội dung biên tập) nhưng **không** có feed cộng đồng UGC dạng diễn
đàn. → Lấy **ngôn ngữ thị giác Playo** (feed card trắng, avatar, tương tác gọn)
cho một **feed cộng đồng** đúng scope dự án.

## Đối chiếu scope
- Dự án COM-01..08: **feed công khai**, bài viết CRUD, bình luận, **báo cáo**,
  **kiểm duyệt** (Admin, spec `07`), **ticket hỗ trợ** user↔Admin. **Chỉ nội dung
  công khai** (bất biến #9): **không** nhóm kín/CLB/tin nhắn riêng.
- **Bỏ (ngoài phạm vi spec §7):** thích / lưu / chia sẻ bài — **không** có nút
  like/reaction; PostCard **không** có bộ đếm lượt thích. Không "bảng tin cá nhân
  hóa", không sắp xếp "nổi bật" (không có tín hiệu phổ biến).
- **Ảnh trong bài:** spec COM-02 mặc định **text-only GĐ2**, ảnh **hoãn**
  (`【PO-REVIEW】`). Thiết kế composer/PostCard cho text trước; chừa chỗ ảnh nhưng
  **không** dựng upload ảnh nếu PO chưa mở.
- Giữ tối giản, thân thiện như Playo; không thêm tính năng mạng xã hội ngoài scope.

## Route
`/community` (feed) · `/community/:postId` (chi tiết bài) · `/support` (ticket) —
đề xuất; PO chốt.

## Bố cục

1. **Layout 3 cột (desktop)** (thu gọn dần ở mobile):
   - **Trái** (tuỳ chọn): điều hướng nhanh; feed mặc định **mới nhất** (phân trang
     thời gian, COM-01) — không có bộ lọc "nổi bật".
   - **Giữa — Feed**: **Composer** trên cùng (avatar + ô "Chia sẻ với cộng đồng..."
     mở form bài viết text); danh sách **PostCard**: header (avatar, tên, thời gian,
     nhãn "đã chỉnh sửa" nếu có), nội dung text, số bình luận, hàng hành động
     (**Bình luận · Báo cáo** — KHÔNG có nút thích). Click → chi tiết + bình luận.
   - **Phải**: rail **Hỗ trợ** — nút tạo **Ticket** + trạng thái ticket của tôi
     (open/in-progress/resolved/closed).
2. **Chi tiết bài** `/community/:postId`: bài đầy đủ + luồng bình luận + composer
   bình luận + nút báo cáo.
3. **Ticket hỗ trợ** `/support`: form tạo ticket + hội thoại user↔Admin (list message,
   trạng thái), tách riêng với feed công khai.
4. **Moderation** thuộc Admin (spec `07` tab Kiểm duyệt).

## Component dùng
Composer (text), PostCard (không có like), CommentThread, ReportButton + Modal lý do,
TicketPanel, Avatar, Button, Toast, EmptyState, Skeleton,
Badge trạng thái (post published/hidden/removed; report open/actioned/dismissed; ticket open/in_progress/resolved/closed).

## Nối API thật
COM API: feed list/CRUD bài, bình luận, report, ticket. Bài bị ẩn/gỡ hiển thị
trạng thái phù hợp cho tác giả; 403 (không quyền) rõ ràng. **Chỉ nội dung công khai**.

## Trạng thái
- Loading: skeleton post/comment.
- Empty: feed rỗng → EmptyState "Chưa có bài viết, hãy là người đầu tiên"; guest xem
  được feed công khai nhưng composer yêu cầu đăng nhập.
- Error: toast; 403 rõ.
- Auth: xem công khai; đăng bài/bình luận/report/ticket cần đăng nhập → Auth modal.

## Motion
Bài/bình luận mới fade-slide 150–250ms (không auto-scroll cưỡng bức); composer mở
rộng mượt; report modal fade+scale.

## Tiêu chí đạt (AC-UI)
1. Feed công khai + composer + PostCard + bình luận + báo cáo, tông sáng/xanh Playo.
2. Ticket hỗ trợ tách riêng, có trạng thái; moderation ở Admin.
3. **Chỉ nội dung công khai** — không nhóm kín/CLB/DM.
4. Trạng thái post/report/ticket đủ; 403 rõ; guest vs đăng nhập phân biệt.
5. Nối COM API thật; empty/error tiếng Việt; responsive 3→1 cột (rail thành sheet).
