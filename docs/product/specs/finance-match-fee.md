---
type: functional-spec-addendum
module: finance-disputes
phase: 2
status: draft-for-po-review
author: Claude Code
updated: 2026-08-07
extends: docs/product/specs/finance-disputes.md
source: docs/product/phasing.md §4.2, docs/architecture/system-architecture.md §6.3
---

# Functional Spec (phụ lục GĐ2) — FIN-05 Thanh toán phí tham gia kèo

Phụ lục cho `finance-disputes.md` (GĐ1). FIN-05 là chức năng GĐ1 duy nhất có phụ thuộc ngược nên
dời sang GĐ2 (D2, phasing §4.2): `finance-service` consume sự kiện của `matchmaking-service`.

> **Trạng thái: draft chờ PO duyệt.** Mô hình phí đã PO chốt 2026-08-07 (D-P2-2):
> **phí góp trả tiền sân qua platform** — user→platform→booking, KHÔNG chuyển ngang hàng (bất biến #6).

## 1. Nguyên tắc tiền (bất biến giữ nguyên từ GĐ1)

- Bảo toàn giá trị + ledger append-only (BR-FIN-14/15) áp dụng nguyên vẹn cho phí kèo.
- SePay không có refund API → mọi hoàn phí ghi có vào **ví cá nhân** (số dư nội bộ).
- Receipt SePay phí kèo đã đến nhưng contribution không còn payable (hết hạn, hủy hoặc race trạng
  thái) cũng được ghi nhận idempotent và ghi có toàn bộ vào **ví cá nhân** payer theo D38; nó không
  trở thành reserve/funding của kèo. Intent phần organizer chỉ mở khi kèo đã đủ điều kiện funding.
- Không chuyển tiền ngang hàng giữa user (bất biến #6): phí KHÔNG vào ví người tổ chức; nó gom ở
  platform (giữ tạm) rồi **thanh toán cho booking sân** — đúng đường tiền booking chuẩn GĐ1.

## 2. Mô hình dòng tiền FIN-05

Ký hiệu: kèo có `capacity = N`, giá booking sân = `P`, phí participant
`feePerSlot = floor(P/N)` theo D29/BR-MMP-11. Người tổ chức chiếm 1 suất và tự góp phần thiếu
`P − (N−1)×feePerSlot` (bao gồm số dư phép chia), không trả cho chính mình và không P2P.

```
Mỗi participant (không tính tổ chức) trả feePerSlot:
  ví cá nhân participant  ──payment(-feePerSlot)──>  ví platform (reserved, ref matchId)

Khi kèo đủ người + xác nhận (MatchConfirmed):
  Tổng participant góp = (N-1)*feePerSlot
  Organizer góp = P − (N-1)*feePerSlot
  Tổng giữ tạm ở platform = participant contributions + organizer contribution = P  ✓ (bảo toàn)
  Platform settlement đúng P vào booking, reserved về 0 cho matchId
  ──> booking `held → confirmed` (BookingConfirmed) ──> doanh thu chủ sân + hoa hồng (G4 chuẩn)

Khi hủy kèo / rút trước cutoff (MatchCancelled / withdraw):
  ví platform (reserved) ──refund(+feePerSlot)──> ví cá nhân participant
  ──> hold/booking sân được nhả
```

> Phần "platform giữ tạm" dùng field `reserved` của ví platform (đã có trong data-model finance),
> ref `matchId`, tách khỏi doanh thu/hoa hồng. Không tạo bút toán đảo payout (BR-FIN-19 giữ nguyên).

## 3. Business rules FIN-05

| Mã | Quy tắc |
|---|---|
| BR-FIN-05-1 | Phí tham gia thu vào ví `platform` ở `reserved`, ref `matchId` + `participantUserId`, append-only. |
| BR-FIN-05-2 | Chỉ khi `MatchConfirmed`: tổng phí gom + phần tổ chức = giá booking `P`; thanh toán booking qua luồng chuẩn; giải phóng `reserved` tương ứng. **Bảo toàn**: tổng vào = tổng ra. |
| BR-FIN-05-3 | Idempotency: mỗi (matchId, participantUserId) chỉ một khoản phí `confirmed`; webhook/redelivery không thu/hoàn hai lần (khóa như FIN-03/04). |
| BR-FIN-05-4 | Hoàn phí hủy kèo hoặc rút trước cutoff khi booking còn `held` ghi có ví cá nhân, append-only; không vượt số đã thu. D36 không hoàn riêng nếu booking đã confirmed. |
| BR-FIN-05-5 | Rút từ cutoff trở đi KHÔNG hoàn khi kèo vẫn diễn ra. Nếu cả kèo cuối cùng bị hủy và booking/hold được nhả, D35 ghi đè và hoàn contribution của cả người rút trễ; platform không giữ tiền khi dịch vụ sân không được dùng. |
| BR-FIN-05-6 | Kèo miễn phí (`feePerSlot=0`): không có dòng tiền phí; tổ chức tự thanh toán booking luồng GĐ1. |
| BR-FIN-05-7 | **D39/D40:** settlement phải mang attempt ID và booking revision fencing. Finance chỉ finalise ledger settlement sau quyết định `confirmed` bền vững của venue. Nếu venue revoke attempt khi booking còn `held`, finance triệt tiêu/đảo settlement stale theo ledger append-only trước khi hoàn contribution bị rút; không để stale `PaymentCompleted` xác nhận booking. Finance gửi command ghi Venue với shared service secret bắt buộc D40; Venue fail-closed khi thiếu/sai. Nếu venue đã confirm trước, D36 quyết định không hoàn riêng. |

## 4. Sự kiện tiêu thụ (finance là consumer)

| Event (từ matchmaking) | Hành động finance |
|---|---|
| `JoinApproved` | Mở khoản chờ phí cho (matchId, participant); chưa trừ tiền |
| `MatchConfirmed` | Gom phí đã thu + phần tổ chức → thanh toán booking; giải phóng reserved |
| `MatchCancelled` | Hoàn toàn bộ phí đã thu về ví cá nhân từng participant |

Với kèo chưa confirmed, `MatchCancelled` hoàn 100% phí JOIN đã thu. Với kèo đã confirmed do
organizer hủy, D33 áp tỷ lệ từ `policySnapshot` booking lên đúng phần góp của từng participant và
organizer; tổng hoàn không vượt tổng góp, phần không hoàn giữ nguyên luồng hủy booking GĐ1.
D37 quy định floor từng participant và organizer nhận phần dư làm tròn để tổng hoàn contributor
bằng đúng `refundGross` của booking.

Finance vẫn **phát** (như GĐ1): `PaymentCompleted` (khi participant trả phí), `RefundIssued` (khi
hoàn phí) — matchmaking consume để cập nhật JOIN/MATCH.

## 5. Acceptance Criteria

- `AC-FIN-05-1` — Given kèo N=4, P=200k, feePerSlot=50k, When 3 participant trả phí, Then ví platform reserved += 150k (ref matchId), mỗi ví cá nhân −50k, ledger append-only.
- `AC-FIN-05-2` — Given 3 participant đã trả + tổ chức thanh toán 50k, When `MatchConfirmed`, Then booking thanh toán đúng 200k, reserved giải phóng 150k, **tổng vào = tổng ra** (bảo toàn giá trị).
- `AC-FIN-05-3` — Given webhook phí gửi lại (redelivery), When xử lý, Then không thu phí lần hai (idempotent, BR-FIN-05-3).
- `AC-FIN-05-4` — Given kèo bị hủy sau khi 3 người đã trả phí, When `MatchCancelled`, Then 3 ví cá nhân được hoàn đúng 50k mỗi ví, reserved platform về 0 cho matchId đó.
- `AC-FIN-05-5` — Given participant rút trước cutoff khi booking còn `held`, Then hoàn 50k + chỗ
  trống lại; booking đã confirmed thì D36 không hoàn riêng. Rút từ cutoff và kèo vẫn diễn ra → không hoàn. Nếu cả kèo hủy thì D33/D35 áp dụng.
- `AC-FIN-05-6` — Given kèo miễn phí, When xác nhận, Then không phát sinh dòng tiền phí; tổ chức thanh toán booking theo FIN-03/04.
- `AC-FIN-05-7` — Given hai participant trả phí cho chỗ cuối đồng thời, When xử lý, Then chỉ một `confirmed` chiếm chỗ, người kia được hoàn ngay (không giữ tiền sai).
- `AC-FIN-05-8` (cổng bảo toàn) — Given một kèo chạy trọn vòng (thu phí → confirmed → completed) và một kèo khác bị hủy (hoàn phí), When hàng chờ rỗng, Then bảo toàn giá trị mức hệ thống pass (tương tự AC-FIN-14-8 GĐ1).

## 6. Ngoài phạm vi
- Phí vào ví người tổ chức (P2P — phá bất biến #6).
- Phí phạt no-show/hủy trễ như nguồn thu riêng: **không triển khai theo D34**. Chế tài duy nhất
  là phí JOIN đã thu không được hoàn từ cutoff trở đi theo D32.
- Đặt phí tùy ý khác công thức D29 `floor(P/N)` và phần thiếu của organizer.

## 7. Quyết định chờ PO chốt
1. ~~Có thu thêm phí phạt no-show/rút trễ không.~~ ✅ D34, PO chốt không thu thêm ngày 2026-08-08.
2. ~~Cho phép tổ chức đặt feePerSlot khác P/N không.~~ ✅ D29, PO chốt không cho phép ngày 2026-08-08.
