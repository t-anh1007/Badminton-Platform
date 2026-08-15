---
type: page-design
page: match (list + detail)
phase: GĐ2
milestone: P25-4
route: /matches · /matches/:id
updated: 2026-08-09
---

# Kèo — Danh sách + Chi tiết (Match)

## Tham chiếu Playo
- **Games List** `/games/:city/sports/all`: thanh filter (GameTime toggle, Filter
  & Sort, Sports, Date, Pay & Join) + lưới **game card** (loại Singles/Doubles ·
  Regular, host avatar + tên + Karma, badge "Only N Slots" `warning`, giá, ngày
  giờ, địa điểm + km, badge skill, "BOOKED").
- **Game Detail** `/match/:id`: **2 cột** — trái card thông tin trận (tên hoạt
  động, host, ngày, địa điểm + "Show in map"); phải **Players (n)** + host badge,
  **Venues nearby**; **sticky CTA bar** đáy (Send Query · Join Game).

## Đối chiếu scope
- **Bỏ** Sports filter (chỉ cầu lông), **Karma** (đổi thành **bậc/rating** MMP),
  "GameTime by Playo" (sản phẩm riêng của Playo).
- **Giữ** bố cục list card + detail 2 cột + sticky CTA.
- Dự án: kèo có **skill range** (F-01/D28), **phí tham gia** (FIN-05), **JOIN
  pending → approved → confirmed** (MMP-04..06), **Tìm nhanh realtime** (F-03/WS),
  **rút/hủy** (MMP-07/08).
- **Bỏ "Send Query"** của Playo — dự án không có UC nhắn tin cho tổ chức; tương tác
  duy nhất là **gửi yêu cầu tham gia** (JOIN). Bỏ luôn "GameTime".

## Route
`/matches` (list) · `/matches/:id` (detail). Công khai xem; tham gia cần đăng nhập.

## Bố cục — Danh sách `/matches`

1. **Header**: H1 "Kèo cầu lông tại {khu vực}" + nút **Tạo kèo**.
   *Lưu ý quan trọng (BR-MMP-02):* không tạo được kèo "không có sân". Tạo kèo phải
   gắn **một slot đang giữ chỗ hợp lệ** (hold 10' còn hạn) hoặc booking `held` của
   chính mình → điểm vào tự nhiên là **từ luồng Đặt sân sau khi giữ chỗ** (spec `05`),
   hoặc modal Tạo kèo có bước chọn/giữ slot trước. Playo tạo game qua app; dự án
   web-only nên đây là modal/trang của dự án theo design system.
2. **Thanh filter**: Lọc & sắp xếp · Ngày · Bậc trình độ · (F-03) toggle **Tìm
   nhanh**. Bỏ Sports.
3. **Panel Tìm nhanh** (F-03, phải/hoặc trên cùng): realtime tìm-nhanh + lấp-chỗ,
   trạng thái WS (đang tìm / có đề xuất), fade khi có proposal.
4. **Lưới MatchCard**: loại (Đơn/Đôi) · trạng thái; host avatar + tên + **bậc**;
   badge **"Chỉ còn N chỗ"** (`warning`); **phí** (Geist Mono, "Miễn phí" nếu 0);
   ngày giờ; sân + km; badge **skill range**; badge trạng thái (Mở/Đầy/Đã xác nhận).
   Click → detail.

## Bố cục — Chi tiết `/matches/:id`

1. **Layout 2 cột**:
   - **Trái**: card thông tin trận (tên, host + bậc, ngày giờ, sân + "Xem bản đồ",
     phí, skill range, mô tả); (organizer) khu **Duyệt yêu cầu** (MMP-05): list
     pending + **bậc trình độ + điểm độ hợp F-02 kèm giải thích ngắn** cho từng
     người + nút Duyệt/Từ chối.
   - **Phải**: **Người chơi (n/сhỗ)** — avatar + tên + badge host/đã xác nhận;
     **Sân gần đây**; (nếu có) độ hợp F-02 + giải thích.
2. **Sticky CTA bar** (đáy): đổi theo **JOIN.status** (máy trạng thái MMP-04..08) —
   - Chưa tham gia + còn chỗ + trước cutoff → **Gửi yêu cầu tham gia** → JOIN
     `pending` (CHƯA trừ tiền; chờ tổ chức duyệt).
   - `pending` → nhãn "Chờ tổ chức duyệt" + **Rút yêu cầu**.
   - `approved` **chưa trả phí** → **Trả phí tham gia** (FIN-05, số dư/SePay) trong
     `holdMinutes` (mặc định 10', đếm ngược) → `confirmed`. Kèo miễn phí (`fee=0`)
     → `confirmed` ngay khi duyệt, không có bước này.
   - `confirmed` → "Đã tham gia" + **Rút khỏi kèo** (MMP-07; hoàn phí nếu trước
     `cutoffAt` và booking còn `held`, từ cutoff không hoàn — BR-MMP-09).
   - Organizer → **Quản lý kèo** (duyệt yêu cầu · hủy MMP-08).
   - `rejected` → nhãn "Yêu cầu bị từ chối". Đầy/quá `cutoffAt` → disable + lý do rõ.

## Component dùng
MatchCard, Filter bar, QuickMatchPanel (WS), Avatar stack, PlayerList, StickyCTABar,
Badge (skill/trạng thái/phí), Button, PaymentSelector (FIN-05), Modal (tạo kèo/duyệt/
rút/hủy), Toast, Skeleton, EmptyState, Map link.

## Nối API thật
List/detail match, JOIN (pending/approve/confirm), thanh toán phí (FIN-05 qua
finance), rút/hủy, WS Tìm nhanh (D-P2-3 nối thẳng matchmaking). **Không tự tạo
JOIN/thu phí qua AI** (bất biến #8). Field thiếu → dừng hỏi PO, không bịa.

## Trạng thái
- Loading: skeleton card/detail.
- Empty: không có kèo → EmptyState + CTA Tạo kèo; cutoff/filled rõ.
- Error: lỗi thanh toán/realtime → thông báo + đường thử lại.
- Auth: xem công khai (`canJoin=false` khi chưa đăng nhập); tham gia → Auth modal.

## Motion
Proposal WS + tin mới fade/slide 150–250ms; không auto-scroll cưỡng bức; badge
"Live" đỏ đế cầu; CTA đổi theo trạng thái mượt.

## Tiêu chí đạt (AC-UI)
1. List: MatchCard theo phong cách Playo nhưng dùng **bậc/phí** thay Karma; không Sports filter.
2. Detail 2 cột + sticky CTA đổi đúng theo JOIN pending/approved/confirmed/organizer/đầy.
3. Panel Tìm nhanh (WS) fade proposal, tôn trọng reduced-motion.
4. Luồng phí FIN-05 nối finance thật; rút/hủy đúng quy tắc.
5. Loading/empty/error/auth tiếng Việt; responsive 2→1 cột, CTA sticky đáy mobile.
