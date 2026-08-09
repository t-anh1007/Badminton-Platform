---
type: functional-spec
module: matchmaking-passport
phase: 2
status: draft-for-po-review
author: Claude Code
updated: 2026-08-08
source: docs/SCOPE_BASELINE.md §2.5, docs/product/phasing.md §4, docs/architecture/system-architecture.md §6.3
---

# Functional Spec — `matchmaking-passport` (MMP + F-01/02/03/04/07)

11 UC nền + 5 tính năng mới, Giai đoạn 2. Service: `matchmaking-service` (schema `matchmaking`,
schema-per-service D17 — không FK/query xuyên schema, chỉ giao tiếp qua API/event).

> **Trạng thái: draft chờ PO duyệt.** Các quyết định tiền/thuật toán được đánh dấu `【PO-REVIEW】`.
> Đã chốt phiên 2026-08-07: FIN-05 phí góp trả tiền sân qua platform (D-P2-2); rating Glicko-2 map
> 5 bậc (D-P2-1); WS thẳng matchmaking (D-P2-3); ngưỡng F-07 outlier + chống thông đồng (D-P2-4).

## 1. Actor

| Actor | Vai (role) | Phạm vi |
|---|---|---|
| Khách | — | MMP-01, MMP-03 (xem kèo công khai, không tham gia được) |
| Người chơi | `player` | Toàn bộ MMP; "người tổ chức kèo" KHÔNG phải role mới — chỉ là `player` đang sở hữu một kèo (ràng buộc bất biến #7: chỉ player/provider/admin) |
| Admin | `admin` | Chỉ liên quan qua F-07 (xem cờ đánh giá bất thường) và điều tra; không duyệt kèo |
| AI | nội bộ | AI-01 gợi ý (spec `ai-assist.md`); ở đây chỉ nêu điểm nối |

## 2. Mô hình miền (domain model)

- **MATCH (kèo)**: một player (`organizerUserId`) tổ chức một buổi chơi trên **một slot sân cụ thể**.
  Kèo gắn `bookingId` (booking ở `venue-booking-service`) — nền tảng vẫn là nguồn lịch chính thức
  duy nhất (bất biến #3). Kèo có `capacity` (tổng chỗ), `feePerSlot` (phí mỗi người), `skillMin/
  skillMax` (khoảng trình độ mong muốn, tùy chọn), `status`.
- **JOIN (lượt tham gia)**: quan hệ (matchId, participantUserId) với `status` riêng. Người tổ chức
  chiếm 1 chỗ mặc định (không tự trả phí cho chính suất tổ chức — xem BR-MMP-10).
- **PASSPORT**: hồ sơ năng lực của một player — rating có độ bất định (F-01), lịch sử kèo, điểm
  đánh giá tổng hợp. Một player một passport. Passport KHÔNG lưu ở account-service (tránh coupling);
  matchmaking sở hữu rating/đánh giá, đọc danh tính qua sự kiện/`userId` tham chiếu.
- **EVALUATION (đánh giá sau trận)**: (matchId, raterUserId, rateeUserId) → điểm/nhãn. Nuôi F-01 và
  bị F-07 soi bất thường.

### 2.1. Quan hệ với tiền (FIN-05 — D-P2-2, đã PO chốt)
Phí kèo **góp trả tiền sân qua platform**, KHÔNG chuyển ngang hàng (bất biến #6):
1. Người tổ chức tạo kèo trên một slot đã **giữ chỗ** (reuse hold 10' GĐ1) hoặc một booking `held`.
2. Mỗi người tham gia được duyệt sẽ **trả `feePerSlot`** → finance ghi khoản này vào ví `platform`
   ở trạng thái giữ tạm (reserved), tham chiếu `matchId`.
3. Khi kèo đủ người và tới ngưỡng xác nhận → tổng phí đã gom **thanh toán cho `bookingId`** (đường
   thanh toán booking chuẩn GĐ1). Booking `held → confirmed`. Phần chênh (nếu tổ chức góp thêm/bù)
   theo BR-MMP-11.
4. Hủy kèo / rút trước hạn → **hoàn phí về ví cá nhân** người tham gia (SePay không refund — bất
   biến hoàn-vào-số-dư). Ledger append-only, bảo toàn giá trị.

> `matchmaking-service` KHÔNG tự ghi ledger. Nó phát sự kiện; `finance-service` là nơi duy nhất
> động tới tiền (đọc chi tiết ở `ai-assist.md` không liên quan; xem `finance FIN-05` spec riêng).

## 3. Trạng thái

**`MATCH.status`**
```
[*] ─(MMP-02 tạo, gắn slot đã giữ)─> open
open ─(đủ người confirmed + tới ngưỡng)─> filled ─(tổng phí thanh toán booking OK)─> confirmed
confirmed ─(ca kết thúc: BookingCompleted)─> completed
open|filled ─(MMP-08 tổ chức hủy | hết hạn giữ chỗ | không đủ người tới hạn chốt)─> cancelled
```

**`JOIN.status`**
```
[*] ─(MMP-04 gửi yêu cầu)─> pending
pending ─(MMP-05 tổ chức duyệt)─> approved ─(MMP-06 trả phí)─> confirmed
pending ─(tổ chức từ chối)─> rejected
approved|confirmed ─(MMP-07 rút | MMP-08 kèo hủy)─> withdrawn (hoàn phí nếu đã trả)
```

## 4. Business rules

| Mã | Quy tắc |
|---|---|
| BR-MMP-01 | Chỉ `player` đã xác minh mới tạo/tham gia kèo. Khách chỉ xem kèo công khai. |
| BR-MMP-02 | Kèo phải gắn một slot sân hợp lệ đang được người tổ chức giữ chỗ (hold còn hạn) hoặc booking `held` của chính họ. Không tạo kèo "không có sân". Giữ bất biến #3 (nền tảng là nguồn lịch chính thức). |
| BR-MMP-03 | `capacity ≥ 2`. Người tổ chức chiếm 1 chỗ. Số người tham gia khác `≤ capacity − 1`. |
| BR-MMP-04 | Một player chỉ có **một** JOIN không-kết-thúc trên một kèo (không tự nhân bản chỗ). |
| BR-MMP-05 | Chỉ chuyển `approved → confirmed` khi phí `feePerSlot` đã trả thành công (FIN-05). Chỗ chưa trả phí không giữ vô hạn: hết `holdMinutes` (mặc định 10') kể từ lúc `approved` mà chưa trả → tự nhả về `pending`/giải phóng chỗ. Tái dùng cơ chế giữ 10' GĐ1 (bất biến #2). |
| BR-MMP-06 | Chống chồng chỗ: tổng JOIN `confirmed` + suất tổ chức ≤ `capacity`, kiểm ở tầng CSDL (ràng buộc/khóa), không chỉ tầng ứng dụng — tương tự chống double-booking GĐ1 (bất biến #4). |
| BR-MMP-07 | Kèo chỉ `confirmed` khi tổng phí gom đủ thanh toán `bookingId` và booking chuyển `confirmed`. **D28:** hạn chốt `cutoffAt = giờ bắt đầu ca − 60 phút`. Nếu tới hạn chốt mà chưa đủ người/tiền → kèo `cancelled`, hoàn toàn bộ phí đã trả về ví cá nhân, và **hold/booking sân được nhả** (slot bán lại được). |
| BR-MMP-08 | `feePerSlot ≥ 0`. Nếu `= 0` (kèo giao lưu miễn phí) thì bỏ qua bước trả phí; xác nhận chỗ ngay khi duyệt; booking sân do người tổ chức tự thanh toán theo luồng GĐ1 (không gom phí). |
| BR-MMP-09 | **D32/D35/D36/D39/D40:** trước `cutoffAt` hoàn 100% khi booking còn `held`; nếu booking đã `confirmed` thì không hoàn riêng. Khi settlement đang chờ, venue atomically quyết định `held→revoke` hay `held→confirmed`: revoke thắng thì hoàn và mở lại chỗ, confirm thắng thì áp D36. Hủy toàn kèo nhận `held_revoked` phải rebase revision và gửi lại lệnh đến kết quả terminal, không trả thành công khi sân vẫn held. Lệnh ghi Venue chỉ đi qua shared service secret D40. Từ cutoff không hoàn nếu kèo vẫn diễn ra. Nếu cả kèo cuối cùng bị hủy, D33/D35 phân bổ hoàn theo trạng thái booking. Không áp bậc thang booking cho lượt rút riêng. |
| BR-MMP-10 | Suất của người tổ chức KHÔNG tự trả phí cho chính mình (không P2P). Người tổ chức chịu phần sân của mình bằng cách: tổng phí người khác gom + phần tổ chức tự thanh toán (nếu thiếu) = giá booking. Xem BR-MMP-11. |
| BR-MMP-11 | **Bảo toàn giá trị FIN-05 — D29**: không cho đặt phí tùy ý. `feePerSlot = floor(giá booking / capacity)`; (tổng phí participant đã trả) + (phần organizer tự thanh toán, gồm số lẻ phép chia) = giá `bookingId`. Không tạo tiền, không mất tiền, không gom dư, không P2P. |
| BR-MMP-12 | Rating/Passport chỉ cập nhật từ kèo `completed` có đánh giá hợp lệ (đã qua F-07). Kèo `cancelled` không ảnh hưởng rating. |
| BR-MMP-13 | Đánh giá sau trận chỉ mở cho JOIN `confirmed` của kèo `completed`, trong cửa sổ 【PO-REVIEW: 72 giờ】 sau `BookingCompleted`; chỉ đánh giá người CÙNG kèo; không tự đánh giá mình. |
| BR-MMP-14 | Quyền: người tổ chức chỉ thao tác kèo của mình; người tham gia chỉ thấy/thao tác JOIN của mình. Kiểm ở tầng API. |

## 5. Sự kiện phát/tiêu thụ (khớp system-architecture §6.3)

| Event | Producer | Consumer |
|---|---|---|
| `MatchCreated` | matchmaking | — (nội bộ + AI-01) |
| `JoinApproved` | matchmaking | finance (mở khoản chờ phí FIN-05) |
| `MatchConfirmed` | matchmaking | finance (gom phí → thanh toán booking) |
| `MatchCancelled` | matchmaking | finance (hoàn phí về ví cá nhân) |
| `BookingConfirmed` | venue-booking | matchmaking (đánh dấu kèo confirmed) |
| `BookingCompleted` | venue-booking | matchmaking (mở đánh giá MMP-10) |
| `PaymentCompleted` | finance | matchmaking (xác nhận chỗ đã trả phí) |
| `RefundIssued` | finance | matchmaking (đánh dấu JOIN withdrawn/hoàn) |

---

## 6. Chi tiết chức năng — 11 UC nền

### MMP-01 — Tìm và lọc kèo
- **Actor**: khách/người chơi. **Quyền**: công khai (chỉ kèo `open` công khai).
- **Mục tiêu**: tìm kèo phù hợp theo địa điểm/thời gian/trình độ/phí.
- **Workflow**: nhập bộ lọc (khu vực, ngày/giờ, khoảng trình độ, phí tối đa, số chỗ trống) → hệ
  thống truy vấn kèo `open` còn chỗ, chưa qua `cutoffAt` → trả danh sách kèo + số chỗ trống + giá.
- **Ngoài phạm vi**: gợi ý AI (thuộc AI-01), bản đồ nhiệt (F-05 hoãn).

**AC**
- `AC-MMP-01-1` — Given 3 kèo `open` còn chỗ và 1 kèo đã `filled`, When tìm kèo, Then chỉ 3 kèo còn chỗ hiện ra.
- `AC-MMP-01-2` — Given lọc trình độ TB+, When áp dụng, Then chỉ kèo có `skillMin..skillMax` giao với TB+ hiện ra.
- `AC-MMP-01-3` — Given một kèo đã qua `cutoffAt`, When tìm kèo, Then kèo đó không xuất hiện.
- `AC-MMP-01-4` — Given không kèo nào khớp lọc, When tìm, Then trả trạng thái rỗng (không lỗi).

### MMP-02 — Tạo và công bố kèo (giao lưu, chia phí)
- **Actor**: người chơi (thành người tổ chức). **Điều kiện trước**: đang giữ chỗ một slot hợp lệ
  (hold còn hạn) hoặc có booking `held` của mình.
- **Workflow**: chọn slot đã giữ → nhập `capacity`, `skillMin/Max` (tùy chọn), chế độ phí (miễn phí
  hoặc chia đều `giá booking/capacity`) → công bố → kèo `open`, phát `MatchCreated`.
- **BR**: BR-MMP-02, 03, 08, 10, 11. **Ngoài phạm vi**: kèo thương mại (đã loại), kèo lặp lại (GĐ3).

**AC**
- `AC-MMP-02-1` — Given player giữ chỗ hợp lệ, When tạo kèo capacity=4 chia phí, Then kèo `open`, `feePerSlot = giá/4`, phát `MatchCreated`.
- `AC-MMP-02-2` — Given player KHÔNG giữ chỗ slot nào, When tạo kèo, Then bị từ chối (BR-MMP-02).
- `AC-MMP-02-3` — Given `capacity < 2`, When tạo kèo, Then bị từ chối (BR-MMP-03).
- `AC-MMP-02-4` — Given tạo kèo miễn phí (`feePerSlot=0`), When công bố, Then kèo `open` không yêu cầu trả phí ở bước duyệt.

### MMP-03 — Xem chi tiết kèo
- **Actor**: khách/người chơi. **Quyền**: công khai.
- **Workflow**: xem thông tin kèo: sân/giờ/địa điểm, tổ chức (tên hiển thị thật khi hồ sơ
  `public`; nhãn cố định “Người tổ chức” khi hồ sơ `private`, theo D31) + bậc trình độ, danh
  sách người đã `confirmed` (ẩn danh tính nhạy cảm), số chỗ trống, phí, hạn chốt.
- **BR-D31**: API account trả thêm `identityVisibility=public|hidden`; không được truyền tên thật
  của hồ sơ `private` qua ranh giới service. Bậc trình độ và dữ liệu kèo không bị ẩn.
- **Ngoài phạm vi**: chat trong kèo (không có realtime chat ở GĐ2 ngoài F-03 signalling).

**AC**
- `AC-MMP-03-1` — Given một kèo `open`, When xem chi tiết, Then thấy sân/giờ/phí/số chỗ trống/bậc trình độ tổ chức.
- `AC-MMP-03-2` — Given khách chưa đăng nhập, When xem kèo công khai, Then xem được nhưng không thấy nút tham gia.

### MMP-04 — Gửi yêu cầu tham gia kèo
- **Actor**: người chơi. **Điều kiện**: kèo `open`, còn chỗ, chưa `cutoffAt`, chưa có JOIN đang hoạt động.
- **Workflow**: gửi yêu cầu → JOIN `pending` → tổ chức nhận được để duyệt. Chưa trừ tiền ở bước này.
- **BR**: BR-MMP-01, 04.

**AC**
- `AC-MMP-04-1` — Given kèo `open` còn chỗ, When player gửi yêu cầu, Then tạo JOIN `pending`.
- `AC-MMP-04-2` — Given player đã có JOIN `pending`/`approved`/`confirmed` trên kèo đó, When gửi lại, Then bị từ chối (BR-MMP-04).
- `AC-MMP-04-3` — Given kèo đã `filled`, When gửi yêu cầu, Then bị từ chối.

### MMP-05 — Xét duyệt người tham gia
- **Actor**: người tổ chức. **Workflow**: xem danh sách `pending` (kèm bậc trình độ + điểm độ hợp
  F-02) → duyệt/từ chối. Duyệt → JOIN `approved`, phát `JoinApproved`, mở cửa sổ trả phí
  (`holdMinutes`). Từ chối → `rejected`.
- **BR**: BR-MMP-05, 14.

**AC**
- `AC-MMP-05-1` — Given JOIN `pending`, When tổ chức duyệt, Then JOIN `approved` + phát `JoinApproved`.
- `AC-MMP-05-2` — Given người KHÔNG phải tổ chức, When gọi duyệt, Then 403 (BR-MMP-14).
- `AC-MMP-05-3` — Given JOIN `approved` quá `holdMinutes` chưa trả phí, When hết hạn, Then chỗ tự giải phóng (BR-MMP-05).

### MMP-06 — Xác nhận tham gia kèo (sau khi trả phí)
- **Actor**: người chơi (đã `approved`). **Workflow**: trả `feePerSlot` bằng số dư/SePay (luồng
  FIN-05) → khi `PaymentCompleted` về trong hạn → JOIN `confirmed`, chiếm chỗ (BR-MMP-06).
- **BR**: BR-MMP-05, 06, 08, 11.

**AC**
- `AC-MMP-06-1` — Given JOIN `approved` và số dư đủ, When trả phí, Then JOIN `confirmed`, phí vào ví platform (reserved, ref matchId).
- `AC-MMP-06-2` — Given hai người cùng trả phí cho chỗ cuối đồng thời, When xử lý, Then chỉ một `confirmed`, người kia bị từ chối/hoàn (BR-MMP-06, chống chồng chỗ tầng CSDL).
- `AC-MMP-06-3` — Given kèo miễn phí, When tổ chức duyệt, Then JOIN `confirmed` ngay không cần trả phí.
- `AC-MMP-06-4` — Given tổng người `confirmed` đủ ngưỡng, When chỗ cuối `confirmed`, Then kèo `filled`, phát `MatchConfirmed`, gom phí thanh toán booking (bảo toàn giá trị BR-MMP-11).

### MMP-07 — Rút khỏi kèo
- **Actor**: người chơi (`approved`/`confirmed`). **Workflow**: rút → JOIN `withdrawn`; nếu đã trả
  phí và trước `cutoffAt` → hoàn phí về ví cá nhân (phát yêu cầu hoàn tới finance); chỗ giải phóng.
- **BR**: BR-MMP-09.

**AC**
- `AC-MMP-07-1` — Given JOIN `confirmed` đã trả phí, trước `cutoffAt` và booking còn `held`, When
  rút, Then `withdrawn` + hoàn phí về ví cá nhân + chỗ trống lại. Nếu booking đã confirmed thì D36 không hoàn riêng.
- `AC-MMP-07-2` — Given JOIN `confirmed`, từ `cutoffAt` trở đi và kèo vẫn diễn ra, When rút,
  Then `withdrawn` KHÔNG hoàn phí; nếu cả kèo về sau bị hủy thì D35 hoàn lại contribution đó.
- `AC-MMP-07-3` — Given rút một chỗ khiến kèo `filled` tụt dưới ngưỡng trước khi booking confirmed, Then kèo về `open` (còn chỗ) — không phá bảo toàn tiền.

### MMP-08 — Hủy kèo (gồm không đủ người)
- **Actor**: người tổ chức (thủ công) hoặc hệ thống (tới `cutoffAt` không đủ người).
- **Workflow**: kèo → `cancelled`, phát `MatchCancelled`; hoàn toàn bộ phí đã trả về ví cá nhân
  từng người; nhả hold/booking sân (slot bán lại được).
- **BR**: BR-MMP-07, 12.

**AC**
- `AC-MMP-08-1` — Given kèo có 2 người đã trả phí, When tổ chức hủy, Then kèo `cancelled` + cả 2 được hoàn phí về ví cá nhân + booking sân nhả.
- `AC-MMP-08-2` — Given tới `cutoffAt` chưa đủ người, When hệ thống chốt, Then kèo tự `cancelled` + hoàn phí + nhả sân.
- `AC-MMP-08-3` — Given kèo đã `confirmed` (booking đã confirmed), When tổ chức muốn hủy, Then
  áp `policySnapshot` bậc thang GĐ1 của booking; mỗi người nhận cùng tỷ lệ trên đúng phần đã góp
  theo D33. D37 floor phần participant và giao phần dư làm tròn cho organizer để tổng hoàn khớp
  booking. KHÔNG hủy tự do, không P2P và tổng hoàn không vượt tổng góp.

### MMP-09 — Khai báo trình độ chuẩn hóa
- **Actor**: người chơi. **Workflow**: chọn 1 trong 5 bậc (Mới chơi/Y/TB/TB+/BC) → hệ thống khởi
  tạo rating cold-start (F-01) với độ bất định cao. **D26:** có thể khai lại tối đa 1 lần/30 ngày.
  Khi đã có lịch sử, rating chỉ dịch về tâm bậc mới theo `25% × min(RD/350, 1)`, chặn tối đa
  `±50` điểm; không ghi đè rating/RD/σ đã học.
- **BR**: gắn F-01.

**AC**
- `AC-MMP-09-1` — Given player mới, When khai báo bậc "TB", Then rating khởi tạo quanh TB với độ bất định (RD) cao.
- `AC-MMP-09-2` — Given player đã có lịch sử đánh giá, When khai lại bậc, Then hệ thống KHÔNG ghi đè rating đã học mà chỉ điều chỉnh có kiểm soát theo D26 (chống gian lận hạ bậc).

### MMP-10 — Đánh giá sau trận
- **Actor**: người chơi (`confirmed` của kèo `completed`). **Workflow**: sau `BookingCompleted`, mở
  đánh giá các người cùng kèo (điểm trình độ cảm nhận + nhãn tinh thần thi đấu) → lưu EVALUATION →
  nuôi F-01, qua sàng lọc F-07.
- **BR**: BR-MMP-13.

**AC**
- `AC-MMP-10-1` — Given kèo `completed`, trong cửa sổ đánh giá, When player đánh giá người cùng kèo, Then EVALUATION được lưu.
- `AC-MMP-10-2` — Given player không thuộc kèo, When cố đánh giá, Then 403.
- `AC-MMP-10-3` — Given quá cửa sổ đánh giá, When cố đánh giá, Then bị từ chối.
- `AC-MMP-10-4` — Given player tự đánh giá mình, When gửi, Then bị từ chối (BR-MMP-13).

### MMP-11 — Xem Player Passport
- **Actor**: người chơi (của mình); người khác xem bản công khai rút gọn.
- **Workflow**: hiển thị bậc hiện tại + rating có độ bất định (F-01), số kèo đã chơi, điểm đánh giá
  tổng hợp (đã lọc F-07), lịch sử gần đây. **D27:** điểm tổng hợp = trung bình tâm bậc của các
  EVALUATION có `countedAt != null`, `flagged=false`; bản công khai không trả trường này.
- **BR**: chỉ nội dung phù hợp; không lộ dữ liệu nhạy cảm người khác (bất biến #9 tinh thần công khai).

**AC**
- `AC-MMP-11-1` — Given player có 5 kèo completed, When xem Passport mình, Then thấy bậc + rating + độ bất định + lịch sử.
- `AC-MMP-11-2` — Given xem Passport người khác, When mở, Then chỉ thấy bản công khai rút gọn (bậc + số kèo), không thấy chi tiết đánh giá cá nhân.

---

## 7. Tính năng mới (F-01/02/03/04/07)

### F-01 — Điểm trình độ có độ bất định  【D-P2-1】
- **Mô hình**: Glicko-2 (rating μ, độ lệch RD, volatility σ). Cold-start từ MMP-09 (bậc khai báo →
  μ khởi tạo, RD cao). Sau mỗi kèo `completed` có đánh giá hợp lệ, cập nhật μ/RD/σ. Ánh xạ μ → 5
  bậc hiển thị (Mới chơi/Y/TB/TB+/BC) theo ngưỡng cố định; RD cao → hiển thị "đang xác định trình độ".
  **D27:** M4 phát `RatingPeriodReady` nội bộ khi evaluation hợp lệ; M1 consume idempotent theo
  message ID và cập nhật Passport đúng một lần từ Glicko results đã xác thực trong event.
- **Vì sao Glicko-2**: xử lý độ bất định + số trận ít (đúng bối cảnh đồ án cold-start), chuẩn học
  thuật, giải thích được. **D26:** tâm cold-start = `1100/1300/1500/1700/1900`, ngưỡng bậc
  `<1200 / <1400 / <1600 / <1800 / ≥1800`, `RD=350`, `σ=0.06`, `τ=0.5`; `RD≥200` hiển thị
  "đang xác định trình độ" (RD bằng hoặc lớn hơn một bề rộng bậc).

**AC**
- `AC-F01-1` — Given player khai "TB" (chưa trận), When xem, Then bậc "TB" + cờ độ bất định cao (RD lớn).
- `AC-F01-2` — Given player thắng đánh giá nhiều trận với người bậc cao hơn, When cập nhật, Then μ tăng, RD giảm, có thể lên bậc.
- `AC-F01-3` — Given hai player μ bằng nhau nhưng RD khác nhau, When so sánh, Then hệ thống phản ánh độ tin cậy khác nhau (không coi bằng nhau tuyệt đối).
- `AC-F01-4` — Given rating cập nhật, When kiểm tra, Then tính xác định (cùng input → cùng output), không phụ thuộc thứ tự xử lý bất định.

### F-02 — Điểm độ hợp + giải thích  (gắn AI-01, MMP-01/05)
- **Mô hình**: với một player và một kèo/ứng viên, tính **điểm độ hợp** dựa trên khoảng cách rating
  (F-01), chênh RD, và khớp khung giờ/địa điểm → kèm **giải thích ngắn có căn cứ** ("hợp vì cùng
  bậc TB+, lệch rating nhỏ, cùng khu vực"). Ràng buộc bất biến #8: AI/điểm chỉ **gợi ý + giải
  thích**, không tự ghép.
- **Nối**: MMP-05 hiển thị điểm độ hợp của từng `pending`; AI-01 dùng điểm này (spec `ai-assist.md`).

**AC**
- `AC-F02-1` — Given hai player cùng bậc rating gần nhau, When tính độ hợp, Then điểm cao + giải thích nêu lý do cụ thể.
- `AC-F02-2` — Given lệch bậc lớn (Mới chơi vs BC), When tính, Then điểm thấp + giải thích nêu chênh trình độ.
- `AC-F02-3` — Given mỗi điểm độ hợp, When trả về, Then LUÔN kèm giải thích (không có điểm "trần trụi" — ràng buộc AI phải giải thích).

### F-03 — Ghép kèo live (Tìm nhanh + lấp chỗ)  【D-P2-3: WS thẳng matchmaking】
- **Mô hình**: người chơi bật "Tìm nhanh" → kết nối **WebSocket thẳng tới matchmaking-service** →
  hệ thống ghép realtime với kèo đang thiếu người (ưu tiên độ hợp F-02) hoặc gom người thành kèo
  mới. Khi khớp → tạo JOIN `pending`/tự duyệt theo cấu hình kèo → vào luồng trả phí FIN-05. Tái
  dùng cơ chế **giữ chỗ 10'** và **chống chồng chỗ** (BR-MMP-05/06).
- **Ngoài phạm vi**: matchmaking đấu xếp hạng cạnh tranh; chỉ ghép giao lưu.

**AC**
- `AC-F03-1` — Given một kèo đang thiếu 1 người, When player bật Tìm nhanh và khớp, Then nhận đề xuất kèo đó realtime qua WS.
- `AC-F03-2` — Given player nhận đề xuất và chấp nhận, When xử lý, Then vào luồng JOIN + trả phí bình thường (giữ chỗ 10').
- `AC-F03-3` — Given hai người cùng lấp chỗ cuối qua WS đồng thời, When xử lý, Then chỉ một giữ được chỗ (chống chồng chỗ tầng CSDL, BR-MMP-06).
- `AC-F03-4` — Given player ngắt WS, When mất kết nối, Then không để lại chỗ "ma" (chỗ chưa trả phí tự nhả theo BR-MMP-05).

### F-04 — Gom nhóm lẻ cân bằng
- **Mô hình**: nhiều người lẻ đăng ký cùng khung giờ/khu vực → thuật toán gom thành các kèo cân
  bằng trình độ (tối thiểu hóa phương sai rating trong nhóm, tôn trọng `capacity`). Đề xuất nhóm,
  KHÔNG tự chốt (bất biến #8) — người dùng xác nhận.

**AC**
- `AC-F04-1` — Given 8 người lẻ trình độ khác nhau cùng khung giờ, When gom nhóm, Then đề xuất 2 nhóm 4 người cân bằng rating (phương sai thấp), kèm giải thích.
- `AC-F04-2` — Given đề xuất nhóm, When chưa ai xác nhận, Then chưa tạo kèo/chưa trừ tiền (chỉ gợi ý).
- `AC-F04-3` — Given số người không chia hết capacity, When gom, Then xử lý phần dư minh bạch (báo còn N người chưa ghép), không ghép ép mất cân bằng.

### F-07 — Trợ lý đánh giá công bằng  【D-P2-4】
- **Mô hình**: soi EVALUATION (MMP-10) tìm bất thường: (a) outlier thống kê (điểm lệch xa phân phối
  của ratee/rater); (b) dấu hiệu thông đồng/tự nâng (vote qua lại bất thường giữa cùng nhóm, tần
  suất cao bất thường). Đánh dấu cờ `flagged` để **Admin xem xét**; đánh giá bị flag KHÔNG nuôi
  F-01 cho tới khi được duyệt. AI/trợ lý chỉ **đánh dấu + giải thích**, không tự phạt (bất biến #8).
- 【PO-REVIEW: ngưỡng outlier cụ thể (vd. |z| > 2.5); định nghĩa "thông đồng"】.

**AC**
- `AC-F07-1` — Given một player nhận một đánh giá lệch xa các đánh giá khác cùng kèo, When soi, Then đánh giá đó bị `flagged` + không tính vào rating ngay.
- `AC-F07-2` — Given hai player liên tục cho nhau điểm tối đa qua nhiều kèo bất thường, When soi, Then bị `flagged` nghi thông đồng cho Admin.
- `AC-F07-3` — Given đánh giá `flagged`, When Admin duyệt hợp lệ, Then đánh giá được tính lại vào F-01; nếu bác thì loại vĩnh viễn.
- `AC-F07-4` — Given trợ lý đánh dấu bất thường, When kiểm tra, Then hệ thống KHÔNG tự thay đổi rating/phạt (chỉ cờ + giải thích, bất biến #8).

---

## 8. Ngoài phạm vi (toàn module)
- Kèo thương mại, actor "người tổ chức chuyên nghiệp" (đã loại SCOPE_BASELINE §3).
- Kèo lặp lại định kỳ, giải đấu, bảng xếp hạng, gamification (đã loại / GĐ3).
- Chat realtime trong kèo ngoài signalling F-03.
- AI tự ghép/tự thu phí/tự phạt (phá bất biến #8).
- Chuyển tiền ngang hàng giữa người dùng (phá bất biến #6).

## 9. Quyết định chờ PO chốt (tổng hợp `【PO-REVIEW】`)
1. ~~`cutoffAt` = giờ bắt đầu − X phút (đề xuất X=60).~~ ✅ D28, PO chốt 60 phút ngày 2026-08-08.
2. ~~Rút sau cutoff: nhị phân không-hoàn hay bậc thang như booking.~~ ✅ D32, PO chốt nhị phân ngày 2026-08-08.
3. ~~Xử lý phí gom dư.~~ ✅ D29, PO chốt chia đều bắt buộc, organizer bù phần thiếu/số lẻ ngày 2026-08-08.
4. ~~MMP-08-3: hủy kèo đã confirmed áp luồng hủy booking GĐ1.~~ ✅ D33, PO chốt hoàn theo tỷ lệ trên phần góp ngày 2026-08-08.
5. ~~MMP-09 khai lại bậc: tần suất + mức ảnh hưởng lên rating đã học.~~ ✅ D26, PO chốt 2026-08-08.
6. ~~F-01: ngưỡng ánh xạ μ→5 bậc, hằng số τ Glicko-2.~~ ✅ D26, PO chốt 2026-08-08.
7. MMP-13 cửa sổ đánh giá (đề xuất 72h).
8. F-07: ngưỡng outlier (đề xuất |z|>2.5) + định nghĩa thông đồng.
