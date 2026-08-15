---
type: page-design
page: passport
phase: GĐ2
milestone: P25-4
route: /passport/:userId? (mặc định của tôi)
updated: 2026-08-09
---

# Player Passport

## Tham chiếu Playo
Playo profile có chỉ số (Games played / Karma) nhưng **không** có hệ rating có độ
bất định. → Lấy **nhịp thị giác Playo** (user card + số liệu lớn + list lịch sử)
nhưng **tự thiết kế** phần rating/RD cho đúng nghiệp vụ dự án.

## Đối chiếu scope
- Dự án: **rating có độ bất định (Glicko-2, F-01)** hiển thị qua **5 bậc**
  (Mới chơi/Yếu/TB/TB+/BC) + số rating + **RD/độ chắc chắn**; **lịch sử trận**;
  **đánh giá sau trận** (MMP-10, F-07). RD cao → nhãn **"đang xác định trình độ"**;
  **không** biến thành leaderboard/gamification.
- Bản **owner** xem đầy đủ; bản **public** chỉ userId + bậc + số trận (D31 privacy).

## Route
`/passport` (của tôi) · `/passport/:userId` (người khác, rút gọn công khai).

## Bố cục

1. **Header Passport**: avatar lớn + tên + **badge bậc** (chip màu theo bậc) +
   dòng "Đã chơi N trận". Owner: nút **Khai báo trình độ** (MMP-09) + **Đánh giá
   trận gần đây**.
2. **Khối Rating** (owner / hoặc theo privacy):
   - Số **rating** lớn (Geist Mono) + **RD** nhỏ; thanh/khối **độ chắc chắn**
     (cao RD → nhãn "Đang xác định trình độ", màu `warning`; thấp RD → "Ổn định",
     `success`). Không xếp hạng so kè.
3. **Lịch sử trận** (list card): đối thủ/kèo, kết quả, thời điểm, thay đổi rating
   (±, Geist Mono). Owner xem chi tiết; public rút gọn.
4. **Đánh giá sau trận** (MMP-10): danh sách đánh giá đã nhận (ẩn danh/tổng hợp,
   theo F-07); đánh giá đang **flagged chờ Admin** hiển thị nhãn, không tính vội.
5. **Cold-start**: chưa đủ trận → khối rating hiện trạng thái khởi tạo + hướng dẫn
   khai báo trình độ để giảm bất định.

## Component dùng
User card, Avatar, TierBadge (5 bậc), RatingBlock (số + RD + độ chắc chắn),
HistoryList, ReviewList, Button, Modal (khai báo trình độ / đánh giá), Badge,
EmptyState, Skeleton.

## Nối API thật
Passport API (rating/RD/bậc/lịch sử — MMP-11), khai báo trình độ (MMP-09), đánh
giá (MMP-10). Tôn trọng D31 (public rút gọn userId+tier+matchesPlayed). Không bịa
số khi cold-start — hiện trạng thái bất định thật.

## Trạng thái
- Loading: skeleton header + rating + list.
- Empty: chưa có trận → cold-start block + CTA khai báo.
- Error: toast.
- Auth/Privacy: xem người khác → **chỉ** bản công khai rút gọn; owner mới thấy
  rating chi tiết/lịch sử đầy đủ.

## Motion
Rating số đếm tăng khi tải (tuỳ chọn, reduced-motion tắt); badge bậc scale-in; list
fade-in so le.

## Tiêu chí đạt (AC-UI)
1. Header + rating block + lịch sử theo nhịp Playo, tông sáng/xanh.
2. Rating có **độ bất định** (RD → nhãn "đang xác định"), **không** leaderboard.
3. Public view chỉ userId + bậc + số trận (privacy D31); owner đầy đủ.
4. Cold-start hiển thị đúng + CTA khai báo trình độ; đánh giá flagged có nhãn chờ Admin.
5. Nối Passport API thật; empty/error tiếng Việt; responsive (khối xếp dọc mobile, rating số lớn Geist Mono).
