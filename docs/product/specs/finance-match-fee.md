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
- Không chuyển tiền ngang hàng giữa user (bất biến #6): phí KHÔNG vào ví người tổ chức; nó gom ở
  platform (giữ tạm) rồi **thanh toán cho booking sân** — đúng đường tiền booking chuẩn GĐ1.

## 2. Mô hình dòng tiền FIN-05

Ký hiệu: kèo có `capacity = N`, giá booking sân = `P`, phí mỗi người `feePerSlot = P/N` (chia đều,
BR-MMP-11). Người tổ chức chiếm 1 suất và tự chịu phần `P/N` của mình (KHÔNG trả cho mình — không P2P).

```
Mỗi participant (không tính tổ chức) trả feePerSlot:
  ví cá nhân participant  ──payment(-feePerSlot)──>  ví platform (reserved, ref matchId)

Khi kèo đủ người + xác nhận (MatchConfirmed):
  Tổng đã gom ở platform = (N-1)*feePerSlot
  Người tổ chức thanh toán phần của mình = feePerSlot (luồng FIN-03/04 chuẩn cho booking)
  Tổng thanh toán booking = (N-1)*feePerSlot + feePerSlot = N*feePerSlot = P  ✓ (bảo toàn)
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
| BR-FIN-05-4 | Hoàn phí (hủy kèo/rút trước cutoff) ghi có ví cá nhân participant, append-only, ref `matchId`; không vượt số đã thu (không âm). |
| BR-FIN-05-5 | Rút từ cutoff trở đi KHÔNG hoàn (BR-MMP-09) — phần này gộp thanh toán sân đã chốt; không tạo tiền/không mất tiền. |
| BR-FIN-05-6 | Kèo miễn phí (`feePerSlot=0`): không có dòng tiền phí; tổ chức tự thanh toán booking luồng GĐ1. |

## 4. Sự kiện tiêu thụ (finance là consumer)

| Event (từ matchmaking) | Hành động finance |
|---|---|
| `JoinApproved` | Mở khoản chờ phí cho (matchId, participant); chưa trừ tiền |
| `MatchConfirmed` | Gom phí đã thu + phần tổ chức → thanh toán booking; giải phóng reserved |
| `MatchCancelled` | Hoàn toàn bộ phí đã thu về ví cá nhân từng participant |

Finance vẫn **phát** (như GĐ1): `PaymentCompleted` (khi participant trả phí), `RefundIssued` (khi
hoàn phí) — matchmaking consume để cập nhật JOIN/MATCH.

## 5. Acceptance Criteria

- `AC-FIN-05-1` — Given kèo N=4, P=200k, feePerSlot=50k, When 3 participant trả phí, Then ví platform reserved += 150k (ref matchId), mỗi ví cá nhân −50k, ledger append-only.
- `AC-FIN-05-2` — Given 3 participant đã trả + tổ chức thanh toán 50k, When `MatchConfirmed`, Then booking thanh toán đúng 200k, reserved giải phóng 150k, **tổng vào = tổng ra** (bảo toàn giá trị).
- `AC-FIN-05-3` — Given webhook phí gửi lại (redelivery), When xử lý, Then không thu phí lần hai (idempotent, BR-FIN-05-3).
- `AC-FIN-05-4` — Given kèo bị hủy sau khi 3 người đã trả phí, When `MatchCancelled`, Then 3 ví cá nhân được hoàn đúng 50k mỗi ví, reserved platform về 0 cho matchId đó.
- `AC-FIN-05-5` — Given participant rút trước cutoff, When xử lý, Then hoàn 50k về ví cá nhân + chỗ trống lại; rút từ cutoff trở đi → KHÔNG hoàn (BR-FIN-05-5).
- `AC-FIN-05-6` — Given kèo miễn phí, When xác nhận, Then không phát sinh dòng tiền phí; tổ chức thanh toán booking theo FIN-03/04.
- `AC-FIN-05-7` — Given hai participant trả phí cho chỗ cuối đồng thời, When xử lý, Then chỉ một `confirmed` chiếm chỗ, người kia được hoàn ngay (không giữ tiền sai).
- `AC-FIN-05-8` (cổng bảo toàn) — Given một kèo chạy trọn vòng (thu phí → confirmed → completed) và một kèo khác bị hủy (hoàn phí), When hàng chờ rỗng, Then bảo toàn giá trị mức hệ thống pass (tương tự AC-FIN-14-8 GĐ1).

## 6. Ngoài phạm vi
- Phí vào ví người tổ chức (P2P — phá bất biến #6).
- Phí phạt no-show/hủy trễ như nguồn thu riêng 【PO-REVIEW: có hay không】.
- Đặt phí tùy ý khác phần chia đều (đề xuất: khóa = P/N để không phát sinh dư/thiếu).

## 7. Quyết định chờ PO chốt
1. Có phí phạt no-show/rút trễ không (hiện: phần không hoàn khi rút sau cutoff đã là "phạt" ngầm).
2. Cho phép tổ chức đặt feePerSlot khác P/N không (đề xuất: không, để bảo toàn đơn giản).
