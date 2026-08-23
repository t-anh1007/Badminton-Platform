# PLAN_MATCH-DEPOSIT — Tạo kèo bằng cọc, giữ slot có thời hạn

> **Mục tiêu:** thay luồng "tạo kèo từ slot đang giữ (hold 10 phút)" — vốn khiến
> kèo bốc hơi sau 10 phút — bằng luồng **cọc + giữ slot có thời hạn** cho **kèo
> đơn 2 người**. Chủ kèo trả cọc = phần của mình (50%), slot được giữ tới hạn X;
> có đối trả nốt 50% thì chốt sân, không có đối thì tự hủy và hoàn cọc vào ví.

Nguồn: phiên thiết kế với PO ngày **2026-08-23** (hội thoại quyết định luật).
Bối cảnh vấn đề gốc: `HOLD_DURATION_MS = 10 * 60_000` ([hold.ts](../../services/venue-booking-service/src/domain/hold.ts)),
booking-từ-hold thừa hưởng đúng cửa sổ 10 phút ([booking.ts:56](../../services/venue-booking-service/src/domain/booking.ts)),
trong khi kèo cần thời gian dài hơn để tìm đối → hết 10 phút booking tự hủy,
`getMatchContext` trả `cancelled` nên `findPublicMatches` lọc kèo ra → kèo biến mất.

---

## 0. Quyết định đã chốt (PO, 2026-08-23)

| # | Quyết định | Chốt |
|---|---|---|
| DM1 | **Chỉ kèo đơn 2 người** trong phạm vi này; mỗi bên trả **1/2** giá slot. Kèo >2 người để lại sau. | ✅ |
| DM2 | Tạo kèo từ **slot chưa đặt**; **giữ slot có thời hạn** (thay hold 10 phút). | ✅ |
| DM3 | **Chỉ cho tạo kèo khi slot còn ≥ 24h** tới giờ đá (bỏ ca sát giờ). | ✅ |
| DM4 | **Cọc = 50% giá slot = phần của chủ kèo.** Có đối: đối trả 50% còn lại → confirmed. Không đối: hoàn 50% vào ví. Không thu hai lần, không bước top-up. | ✅ |
| DM5 | **Hạn giữ X = lúc tạo + H**, H theo bậc thời gian dẫn L (xem §3). | ✅ |
| DM6 | **Cửa sổ đối trả tiền = 15 phút** sau khi tham gia (không vượt X). | ✅ |
| DM7 | **Trần 3 kèo đang giữ slot đồng thời / chủ kèo.** | ✅ |
| DM8 | Mọi khoản hoàn → **cộng vào ví** (SePay không có API refund — hard-rule). | ✅ |
| DM9 | Chủ kèo **tự hủy khi CHƯA có đối** → **hoàn 100% cọc** vào ví. | ✅ |
| DM10 | Chủ kèo **tự hủy SAU khi confirmed** → áp **cancellation policy** cho chủ kèo (mất theo % thời gian); **đối được hoàn 100%** vào ví. | ✅ |
| DM11 | ~~Phương án A (4 trạng thái)~~ → **điều chỉnh khi code M3 (2026-08-23)**: chỉ **thêm 1 trạng thái `awaiting_deposit`** (tạo xong, chưa trả cọc → không list, không cho join). Giữ nguyên `open`(=đang tìm đối)/`filled`(=đối trả đủ)/`confirmed`/`completed`/`cancelled` để **tái dùng saga tiền đang chạy đúng**; `expired` gộp vào `cancelled`+reason. Lý do: saga settlement kiểm `status` ở ~15+ chỗ, đổi 4 trạng thái là churn rủi ro cao trên code tiền mà chỉ lợi nhãn. | ✅ (2026-08-23) |
| DM12 | **Khi confirmed: một event `BookingConfirmed` gross = 100%** (cọc chủ kèo + phí đối) cho chủ sân — dễ đối soát, không tách hai bút toán. | ✅ (2026-08-23) |
| DM13 | **Kèo >2 người hoàn toàn ngoài scope** — chỉ hỗ trợ kèo đơn 2 người; không dựng máy trạng thái thanh toán từng phần. | ✅ (2026-08-23) |

---

## 1. Ranh giới thay đổi

- Chạm **3 service**: `matchmaking-service` (vòng đời + hạn X + cọc), `venue-booking-service`
  (giữ slot có thời hạn thay hold 10 phút, xác nhận booking khi đủ tiền), `finance-service`
  (ledger cọc escrow + phí đối + hoàn ví). Cộng `apps/web` (UI tạo kèo/tham gia/trạng thái).
- **Không** đổi thang trình độ, không đổi mô hình ví/ledger append-only, không thiết kế
  API refund SePay (hard-rule).
- Giữ nguyên hạ tầng event-driven hiện có (outbox + RabbitMQ + `processedEvent` idempotent,
  saga D39 `MatchResolution`). Ưu tiên **tái dùng** cơ chế sẵn có thay vì dựng mới.

---

## 2. Phát hiện tái dùng được (giảm rwork)

1. **Công thức 50/50 đã có sẵn.** Với `capacity = 2`:
   `feePerSlot = price / 2`, `organizerContribution = price − feePerSlot*(capacity−1) = price/2`
   ([matches.ts:61-62](../../services/matchmaking-service/src/domain/matches.ts)).
   → **Cọc chủ kèo = `organizerContribution` = 50%**, phí đối = `feePerSlot` = 50%. Không cần công thức mới.
2. **Hold đã là thứ chặn slot.** `isRangeFree` / `findConflictingRange` chặn theo
   `booking status='confirmed'` **và** `hold expiresAt>now`
   ([slotAvailability.ts](../../services/venue-booking-service/src/domain/slotAvailability.ts)).
   Booking `held` KHÔNG chặn — chính **hold** mới chặn. `reapExpiredHolds` chỉ xóa hold `expiresAt<=now`.
   → Nếu tạo hold với `expiresAt = X` (dài), slot bị chặn tới X mà không cần cơ chế mới.
3. **Saga hủy/settlement D39** (`MatchResolution`, `applyMatchBookingResolution`,
   `cancelMatchesAtCutoff`, `startMatchCutoffScheduler`) đã xử lý hủy theo hạn + hoàn phí.
   → Hạn X tái dùng đúng đường `cutoffAt`/scheduler; chỉ cần đổi cách tính hạn và thêm bước hoàn cọc.

---

## 3. Bảng giữ kèo theo thời gian dẫn (DM5)

Gọi **L = giờ đá − lúc tạo** (luôn ≥ 24h theo DM3). **X = lúc tạo + H**:

| L (tạo trước giờ đá) | H (giữ để tìm đối) |
|---|---|
| 24h – dưới 2 ngày | **6 giờ** |
| 2 – dưới 3 ngày | **12 giờ** |
| 3 – dưới 5 ngày | **18 giờ** |
| ≥ 5 ngày | **24 giờ** (trần) |

- Đặt thành **config** (không hard-code rải rác). Vì H ≤ 24h < L(min)=24h nên X luôn cách
  giờ đá ≥ 18h — không bao giờ đụng sát giờ, luôn còn thời gian nhả slot cho người khác.
- `cutoffAt` cũ (giờ đá − 60′) **không còn dùng làm hạn tìm đối**; thay bằng X. (Giữ hằng số
  `MATCH_CUTOFF_MINUTES` cho các đường legacy nếu còn, nhưng luồng mới dùng X.)

---

## 4. Máy trạng thái kèo mới

```
[tạo kèo + cọc VietQR]
        │  (chưa trả cọc, ≤10' checkout)
        ▼
 awaiting_deposit ──(hết 10' / hủy)──► (xóa nháp, nhả hold ngắn)
        │  PaymentCompleted(deposit)  → giữ slot tới X, ghi booking 'held' (holdExpiresAt=X)
        ▼
 awaiting_opponent ──(chủ kèo hủy: DM9 hoàn 100% cọc)──► cancelled
        │           ──(hết X không có đối: hoàn 100% cọc)──► expired
        │  đối tham gia + chủ kèo duyệt
        ▼
 awaiting_payment  ──(đối không trả trong 15': nhả lượt)──► quay lại awaiting_opponent
        │  PaymentCompleted(đối 50%) → đủ 100% → confirm booking 'held'→'confirmed'
        ▼
   confirmed ──(chủ kèo hủy: DM10 policy + đối hoàn 100%)──► cancelled
        │  sau giờ đá
        ▼
   completed
```

**Ánh xạ enum** (`MatchStatus` hiện có: `open/filled/confirmed/completed/cancelled`):
- Phương án A (khuyến nghị): **thêm** `awaiting_deposit`, `awaiting_opponent`, `awaiting_payment`, `expired`
  và bỏ dần `open/filled` trong luồng mới — rõ nghĩa, dễ đọc log/analytics.
- Phương án B (ít migration hơn): tái dùng `open`≈awaiting_opponent, `filled`≈awaiting_payment,
  gộp `expired` vào `cancelled` (phân biệt bằng lý do). → **Cần PO chốt** ở milestone M1.

---

## 5. Luồng chi tiết theo bước

### 5.1 Tạo kèo (chủ kèo)
1. FE gọi tạo kèo với `courtId + startAt + duration` (slot **chưa đặt**), kiểm DM3 (≥24h) & DM7 (≤3 kèo đang giữ).
2. venue-booking tạo **hold ngắn 10 phút** (checkout, tái dùng BOK-06) để chặn slot trong lúc trả cọc.
3. matchmaking tạo Match `awaiting_deposit`, tính `feePerSlot=price/2`, `deposit=price/2`, `X`.
4. finance phát hành **VietQR cọc = 50%**. Chủ kèo quét trả trong 10 phút.
5. `PaymentCompleted(deposit)`:
   - venue-booking **gia hạn hold → expiresAt = X** (hoặc thay bằng match-hold expiresAt=X) và ghi
     booking `held` với `holdExpiresAt = X`; giữ hold để chặn slot tới X.
   - matchmaking: Match → `awaiting_opponent`, ghi `MatchCreated` (đã có cọc) vào outbox.
   - finance: ghi bút toán **cọc escrow** (chưa payout cho chủ sân).
6. Không trả cọc trong 10 phút → xóa nháp, nhả hold ngắn (đúng như booking bỏ dở hiện nay).

### 5.2 Tìm & duyệt đối (kèo đơn)
1. Đối `requestJoin` → chủ kèo `approveJoin` (giữ bước duyệt hiện có).
2. Duyệt xong → Match `awaiting_payment`, phát **VietQR phí đối = 50%**, hạn **15 phút** (DM6),
   không vượt X. (Tái dùng `JoinApproved` + `expiresAt`, đổi `JOIN_HOLD_MINUTES` ngữ nghĩa cửa sổ trả tiền.)
3. Đối không trả trong 15′ → nhả lượt (join→`pending`/`rejected`), Match → `awaiting_opponent` (tái dùng `releaseExpiredApprovedJoins`).

### 5.3 Chốt kèo
1. `PaymentCompleted(đối 50%)` → đủ 100% (cọc chủ kèo + phí đối).
2. venue-booking: booking `held → confirmed`, **xóa hold**; phát `BookingConfirmed` → finance payout chủ sân.
3. matchmaking: Match → `confirmed`; finance chuyển cọc escrow thành phần thanh toán (không hoàn).

### 5.4 Hết hạn / hủy
- **Hết X chưa confirmed** (scheduler): hủy Match → `expired`, venue nhả hold + hủy booking `held`,
  finance **hoàn 100% cọc vào ví** chủ kèo (DM9-style, do hệ thống). Tái dùng `cancelMatchesAtCutoff`
  nhưng mốc = X và thêm nhánh hoàn cọc.
- **Chủ kèo hủy khi awaiting_opponent** (DM9): như trên nhưng do chủ động → vẫn **hoàn 100% cọc**.
- **Chủ kèo hủy sau confirmed** (DM10): áp `cancelConfirmedBooking` (policy % theo thời gian) cho chủ kèo;
  **đối hoàn 100%** vào ví. Tái dùng `finalizeConfirmedPolicyCancellation` + thêm nhánh hoàn đủ cho đối.

---

## 6. Delta data-model (đã khảo sát schema thật ở M1 — 2026-08-23)

### 6.1 matchmaking `Match` ([schema.prisma](../../services/matchmaking-service/prisma/schema.prisma))
- **`MatchStatus`**: thêm `awaiting_deposit`, `awaiting_opponent`, `awaiting_payment`, `expired`
  (DM11). Giữ `confirmed/completed/cancelled`; `open/filled` để lại cho đường legacy, không dùng ở luồng mới.
- Thêm cột:
  - `deadlineAt DateTime @db.Timestamptz(3)` — hạn X (thay vai trò `cutoffAt` trong luồng mới; `cutoffAt` giữ nguyên cho legacy).
  - `matchType` (mặc định `singles`) — chốt scope DM13; enum `MatchType { singles }` để mở rộng sau.
  - `depositContributionId String? @unique` — trỏ tới `MatchContribution` cọc bên finance (song song `organizerContributionId` sẵn có).
- `capacity` giữ **= 2**; `feePerSlot`/`organizerContribution` **tái dùng công thức hiện có** (=50/50).
- Index: đổi `@@index([status, cutoffAt])` → thêm `@@index([status, deadlineAt])` cho scheduler quét theo X.

### 6.2 venue-booking `Hold`/`Booking` ([schema.prisma](../../services/venue-booking-service/prisma/schema.prisma))
- **Không cần cột mới cho block slot**: `Hold.expiresAt` do caller đặt = X là đủ (EXCLUDE constraint
  BR-BOK-03 trên `holds` + `reapExpiredHolds` chỉ xóa `expiresAt<=now` → hold sống tới X).
  ⚠️ Kiểm ở M2: EXCLUDE constraint có chặn hold dài đúng ý không, và interplay với hold checkout 10′.
- `Booking.holdExpiresAt` tái dùng làm mốc self-heal — set = X (thay vì +10′) cho booking-kèo.
- Cần **đường tạo hold có `expiresAt` tùy biến** (match-hold) tách khỏi hằng `HOLD_DURATION_MS`;
  và bước **gia hạn hold ngắn → X** khi `PaymentCompleted(deposit)`.
- ⚠️ **Phát hiện M2**: `createHold` xóa mọi hold cũ của user (A-BOK-01: 1 hold/user) → phải thêm
  cột **`Hold.purpose` enum `{ checkout, match }`** (mặc định `checkout`). Quy tắc 1-hold/user chỉ áp
  cho `checkout`; match-hold miễn trừ. Trần ≤3 (DM7) enforce ở **matchmaking** (đếm match awaiting_* của
  organizer), không ở venue.

### 6.3 finance ([schema.prisma](../../services/finance-service/prisma/schema.prisma)) — phần lớn TÁI DÙNG
- `MatchFunding` (collecting→settling→settled→cancelled) và `MatchContribution`
  (`role: organizer|participant`, `status: pending|paid|settled|refunded`) **đã đủ** mô hình cọc:
  - Cọc chủ kèo = `MatchContribution(role=organizer, amount=50%)`.
  - Phí đối = `MatchContribution(role=participant, amount=50%)`.
- `LedgerEntryType` đã có `reserve/release/settlement/refund/payout` → escrow cọc dùng `reserve`
  khi trả, `settlement`/`payout` khi confirmed (DM12: một `BookingConfirmed` gross=100%), `refund`+ví khi hủy.
- `PaymentRefType.matchFee` + `PaymentIntent` tái dùng để phát VietQR cọc và phí đối.
- **Thay đổi chính = thứ tự**: organizer contribution được thu **ngay lúc tạo kèo** (trước `awaiting_opponent`),
  không phải sau `filled`. Điều chỉnh `handleMatchCreated`/`handleJoinApproved`/settlement cho đúng thứ tự mới.

### 6.4 shared (event contract)
- `MatchCreated`: bổ sung/không đổi tùy — cần mang `deadlineAt`, `deposit`(=organizerContribution), `matchType`.
- Hoàn cọc: tái dùng `MatchFeeRefundRequested` với `reason` mới (`deposit_refund_no_opponent` /
  `deposit_refund_organizer_cancel`) thay vì thêm event mới — giảm bề mặt.
- Giữ `MatchCancelled`/`MatchBookingResolved`/saga D39 nguyên vẹn; chỉ thêm nhánh hoàn cọc.

---

## 7. Edge cases phải phủ

1. Trả cọc trùng/độ trễ webhook (idempotent theo `processedEvent`).
2. Đối trả tiền sát mốc 15′ / sát X — biên thời gian, không cho vượt X.
3. Hai đối cùng lúc (kèo đơn chỉ 1 chỗ) — khóa `pg_advisory_xact_lock` như hiện có.
4. Slot bị closure/đổi giá sau khi giữ — dùng `priceSnapshot` tại thời điểm tạo (như booking).
5. Crash giữa "trả cọc" và "gia hạn hold" — replay event, không double-charge/double-hold.
6. Hết X đúng lúc đối vừa trả — venue là trọng tài (saga D39), một bên thắng revision.
7. Hoàn cọc khi ví/tài khoản bị khóa — vẫn cộng ví (rút bị chặn ở luồng rút).

---

## 8. Chia milestone (đề xuất)

| MS | Nội dung | Bằng chứng |
|---|---|---|
| **M1 — Spec khóa + data model** | Chốt enum (§4 A/B), field DB, event contract, ledger cọc. Viết vào `docs/product/specs/` (matchmaking + finance-match-fee). | Spec cập nhật + migration nháp |
| **M2 — venue-booking: match-hold có thời hạn** ✅ | `Hold.purpose`, `promoteHoldToMatch`, `activateMatchHold` (gia hạn tới X khi trả cọc); expiry tái dùng reaper sẵn có. | hold.test 9/9 pass |
| **M3 — matchmaking: vòng đời mới** ✅ | `awaiting_deposit`→open→filled→confirmed; `deadlineAt` theo bậc; DM3/DM6/DM7; scheduler+reaper cọc. | full suite 79 pass |
| **M4 — finance: cọc escrow + hoàn ví** ✅ | Bỏ guard "organizer sau participant" (trả cọc trước); organizer contribution hết hạn theo `depositExpiresAt`; hoàn 100% vào ví khi hủy/expired tái dùng `refundCollectingFunding` sẵn có. | matchFee suite pass |
| **M5 — apps/web** ✅ | Modal tạo kèo đơn (chỉ hold, singles/split, giải thích cọc); MatchDetail: badge "Chờ đặt cọc", CTA "Đặt cọc chốt sân" ở awaiting_deposit (tái dùng API `payMatchOrganizerContribution*` sẵn có); backend `getPublicMatchDetail` cho organizer xem+trả cọc ở awaiting_deposit. | tsc web PASS |
| **M6 — E2E + tài liệu** | `npm run e2e` luồng kèo đơn đầy đủ; cập nhật decision-log + test ledger. | e2e pass + docs |

---

## 9. Câu hỏi mở — ĐÃ CHỐT (PO, 2026-08-23)

1. **Enum trạng thái** → **Phương án A** (DM11): thêm `awaiting_deposit/awaiting_opponent/awaiting_payment/expired`.
2. **Cọc escrow payout** → **một `BookingConfirmed` gross=100%** (DM12).
3. **Kèo >2 người** → **ngoài scope** (DM13): chỉ singles.
