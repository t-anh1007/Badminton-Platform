---
type: progress-log + test-ledger
phase: 1
status: implemented-awaiting-po-acceptance
updated: 2026-08-06
purpose: Bằng chứng bàn giao GĐ1 — trạng thái milestone + test ledger từng AC (198 dòng). KHÁC coverage-matrix.md (file kia theo dõi spec đã duyệt; file này theo dõi implementation đã test pass).
---

# Tiến độ + Test ledger — Giai đoạn 1

Nguồn goal: [phase-1-goal.md](phase-1-goal.md). Chuỗi 10 milestone:
`Gboot → G0 → Gdesign → G1 → G2 → G3 → G4 → (G5 ∥ G6) → G7`.

Executor: **Claude Code** cho toàn bộ 10 milestone (không Codex — xem [D21](decision-log.md)).
Cổng chuyển milestone do **Claude self-verification** quyết (test pass + review diff + kiểm scope,
có evidence). **PO chỉ nghiệm thu cuối phase** hoặc khi có escalation. Nhờ vậy goal chạy xuyên GĐ1
không dừng chờ PO 10 lần.

## 1. Trạng thái milestone

| # | Gói | Executor | Trạng thái | AC pass/tổng | Self-verify OK (cho sang gói kế) | Ngày |
|---|---|---|---|---:|---|---|
| 0a | Gboot | Claude | **self-verify OK** | — (6/6 proof) | ✅ (xem §3) | 2026-08-06 |
| 0b | G0 | Claude | **self-verify OK** | — (12/12 thay đổi) | ✅ (xem §3) | 2026-08-06 |
| 0c | Gdesign | Claude | **self-verify OK** | — (5/5 proof) | ✅ (xem §3) | 2026-08-06 |
| 1 | G1 | Claude | **self-verify OK** | 34/34 (08-3 xong ở G2, 08-4 xong ở G3, 02-5 xong ở G4) | ✅ (xem §3) | 2026-08-06 |
| 2 | G2 | Claude | **self-verify OK; 2 AC cross-service đã đóng tại G4/final E2E** | 43/43 | ✅ (xem §3) | 2026-08-06 |
| 3 | G3 | Claude | **self-verify OK** | 25/25 | ✅ (xem §3) | 2026-08-06 |
| 4 | G4 | Claude | **self-verify OK, đã commit `a94701d`** | 32/32 | ✅ (xem §3) | 2026-08-06 |
| 5 | G5 | Codex | **self-verify OK, D22 review không còn P0/P1/P2** | 24/24 | ✅ (xem §3) | 2026-08-06 |
| 6 | G6 | Codex | **self-verify OK, D22 review không còn P0/P1** | 26/26 | ✅ (xem §3) | 2026-08-06 |
| 7 | G7 | Codex | **self-verify OK, D22 không còn P0/P1; residual migration đã ghi** | 14/14 | ✅ (xem §3) | 2026-08-06 |

Trạng thái: `chưa bắt đầu` · `đang làm` · `đã test` · `self-verify OK` · `báo cáo PO`.
PO nghiệm thu ghi ở §5, chỉ cuối phase.

## 2. Test ledger (198 AC)

> Một dòng mỗi AC. `status`: `todo` · `pass` · `fail` · `blocked`. `evidence`: đường dẫn file
> test / log / ảnh E2E. **Thước đo "done" của phase** — không phải coverage-matrix. Sinh sẵn đủ
> 198 dòng để không bỏ sót AC nào; điền dần khi làm từng gói.

| AC ID | Milestone | Automated test | E2E/manual proof | Status | Evidence |
|---|---|---|---|---|---|
| AC-ACC-01-1 | G1 | services/account-service/test/registration.test.ts | — | pass | services/account-service/test/registration.test.ts |
| AC-ACC-01-2 | G1 | services/account-service/test/registration.test.ts | — | pass | services/account-service/test/registration.test.ts |
| AC-ACC-01-3 | G1 | services/account-service/test/registration.test.ts | — | pass | services/account-service/test/registration.test.ts |
| AC-ACC-01-4 | G1 | services/account-service/test/registration.test.ts | — | pass | services/account-service/test/registration.test.ts |
| AC-ACC-02-1 | G1 | services/account-service/test/verification.test.ts | — | pass | services/account-service/test/verification.test.ts |
| AC-ACC-02-2 | G1 | services/account-service/test/verification.test.ts | — | pass | services/account-service/test/verification.test.ts |
| AC-ACC-02-3 | G1 | services/account-service/test/verification.test.ts | — | pass | services/account-service/test/verification.test.ts |
| AC-ACC-02-4 | G1 | services/account-service/test/verification.test.ts | — | pass | services/account-service/test/verification.test.ts |
| AC-ACC-02-5 | G1 | services/finance-service/test/walletProvisioning.test.ts | — | pass | services/finance-service/test/walletProvisioning.test.ts — đóng ở G4 (finance-service consume UserRegistered) |
| AC-ACC-03-1 | G1 | services/account-service/test/session.test.ts | — | pass | services/account-service/test/session.test.ts |
| AC-ACC-03-2 | G1 | services/account-service/test/session.test.ts | — | pass | services/account-service/test/session.test.ts |
| AC-ACC-03-3 | G1 | services/account-service/test/session.test.ts | — | pass | services/account-service/test/session.test.ts |
| AC-ACC-03-4 | G1 | services/account-service/test/session.test.ts | — | pass | services/account-service/test/session.test.ts |
| AC-ACC-03-5 | G1 | services/account-service/test/session.test.ts | — | pass | services/account-service/test/session.test.ts |
| AC-ACC-03-6 | G1 | services/account-service/test/session.test.ts | — | pass | services/account-service/test/session.test.ts |
| AC-ACC-04-1 | G1 | services/account-service/test/session.test.ts | — | pass | services/account-service/test/session.test.ts |
| AC-ACC-04-2 | G1 | services/account-service/test/session.test.ts | — | pass | services/account-service/test/session.test.ts |
| AC-ACC-05-1 | G1 | services/account-service/test/passwordReset.test.ts | — | pass | services/account-service/test/passwordReset.test.ts |
| AC-ACC-05-2 | G1 | services/account-service/test/passwordReset.test.ts | — | pass | services/account-service/test/passwordReset.test.ts |
| AC-ACC-05-3 | G1 | services/account-service/test/passwordReset.test.ts | — | pass | services/account-service/test/passwordReset.test.ts |
| AC-ACC-05-4 | G1 | services/account-service/test/passwordReset.test.ts | — | pass | services/account-service/test/passwordReset.test.ts |
| AC-ACC-05-5 | G1 | services/account-service/test/passwordReset.test.ts | — | pass | services/account-service/test/passwordReset.test.ts |
| AC-ACC-06-1 | G1 | services/account-service/test/passwordReset.test.ts | — | pass | services/account-service/test/passwordReset.test.ts |
| AC-ACC-06-2 | G1 | services/account-service/test/passwordReset.test.ts | — | pass | services/account-service/test/passwordReset.test.ts |
| AC-ACC-06-3 | G1 | services/account-service/test/passwordReset.test.ts | — | pass | services/account-service/test/passwordReset.test.ts |
| AC-ACC-07-1 | G1 | services/account-service/test/profile.test.ts | — | pass | services/account-service/test/profile.test.ts |
| AC-ACC-07-2 | G1 | services/account-service/test/profile.test.ts | — | pass | services/account-service/test/profile.test.ts |
| AC-ACC-07-3 | G1 | services/account-service/test/profile.test.ts | — | pass | services/account-service/test/profile.test.ts |
| AC-ACC-08-1 | G1 | services/account-service/test/adminAccounts.test.ts | — | pass | services/account-service/test/adminAccounts.test.ts |
| AC-ACC-08-2 | G1 | services/account-service/test/adminAccounts.test.ts | — | pass | services/account-service/test/adminAccounts.test.ts |
| AC-ACC-08-3 | G1/G2 | services/venue-booking-service/test/accountLockedConsumer.test.ts | — | pass | Hoàn thành ở G2: venue-booking-service tiêu thụ AccountLocked, ẩn cơ sở khỏi tìm kiếm khi NCC bị khóa, booking giữ nguyên. |
| AC-ACC-08-4 | G1/G3 | services/venue-booking-service/test/accountLockedConsumer.test.ts | — | pass | Hoàn thành ở G3: createHold (BOK-06) chặn ngay bước sớm nhất của luồng đặt sân (BR-BOK-01 "mới đặt được") khi provider.status != approved. |
| AC-ACC-08-5 | G1 | services/account-service/test/adminAccounts.test.ts | — | pass | services/account-service/test/adminAccounts.test.ts |
| AC-ACC-08-6 | G1 | services/account-service/test/adminAccounts.test.ts | — | pass | services/account-service/test/adminAccounts.test.ts |
| AC-VEN-01-1 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-01-2 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-01-3 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-01-4 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-02-1 | G2/G4 | services/venue-booking-service/test/provider.test.ts + services/account-service/test/providerRole.test.ts + services/finance-service/test/g4Saga.test.ts | e2e/phase-1.spec.ts (HT2) | pass | D25 đã phê duyệt `ProviderApproved`; test xuyên venue/account/finance chứng minh cộng vai `provider`, giữ vai `player` và tạo ví `business` số dư 0. |
| AC-VEN-02-2 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-02-3 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-02-4 | G2/G4 | services/venue-booking-service/test/provider.test.ts + services/finance-service/test/g4Saga.test.ts | e2e/phase-1.spec.ts (HT2, HT3) | pass | NCC đã duyệt vẫn đặt sân dưới vai người chơi; luồng thanh toán trừ ví `personal`, không dùng ví `business`. |
| AC-VEN-02-5 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-03-1 | G2 | services/venue-booking-service/test/venue.test.ts | — | pass | services/venue-booking-service/test/venue.test.ts |
| AC-VEN-03-2 | G2 | services/venue-booking-service/test/venue.test.ts | — | pass | services/venue-booking-service/test/venue.test.ts |
| AC-VEN-03-3 | G2 | services/venue-booking-service/test/venue.test.ts | — | pass | services/venue-booking-service/test/venue.test.ts |
| AC-VEN-03-4 | G2 | services/venue-booking-service/test/venue.test.ts | — | pass | services/venue-booking-service/test/venue.test.ts |
| AC-VEN-04-1 | G2 | services/venue-booking-service/test/court.test.ts | — | pass | services/venue-booking-service/test/court.test.ts |
| AC-VEN-04-2 | G2 | services/venue-booking-service/test/court.test.ts | — | pass | services/venue-booking-service/test/court.test.ts |
| AC-VEN-04-3 | G2 | services/venue-booking-service/test/court.test.ts | — | pass | services/venue-booking-service/test/court.test.ts |
| AC-VEN-04-4 | G2 | services/venue-booking-service/test/court.test.ts | — | pass | services/venue-booking-service/test/court.test.ts |
| AC-VEN-04-5 | G2 | services/venue-booking-service/test/court.test.ts | — | pass | services/venue-booking-service/test/court.test.ts |
| AC-VEN-05-1 | G2 | services/venue-booking-service/test/schedule.test.ts | — | pass | services/venue-booking-service/test/schedule.test.ts |
| AC-VEN-05-2 | G2 | services/venue-booking-service/test/schedule.test.ts | — | pass | services/venue-booking-service/test/schedule.test.ts |
| AC-VEN-05-3 | G2 | services/venue-booking-service/test/schedule.test.ts | — | pass | services/venue-booking-service/test/schedule.test.ts |
| AC-VEN-05-4 | G2 | services/venue-booking-service/test/schedule.test.ts | — | pass | services/venue-booking-service/test/schedule.test.ts |
| AC-VEN-05-5 | G2 | services/venue-booking-service/test/schedule.test.ts | — | pass | services/venue-booking-service/test/schedule.test.ts |
| AC-VEN-05-6 | G2 | services/venue-booking-service/test/schedule.test.ts | — | pass | services/venue-booking-service/test/schedule.test.ts |
| AC-VEN-06-1 | G2 | services/venue-booking-service/test/pricing.test.ts | — | pass | services/venue-booking-service/test/pricing.test.ts |
| AC-VEN-06-2 | G2 | services/venue-booking-service/test/pricing.test.ts | — | pass | services/venue-booking-service/test/pricing.test.ts |
| AC-VEN-06-3 | G2 | services/venue-booking-service/test/pricing.test.ts | — | pass | services/venue-booking-service/test/pricing.test.ts |
| AC-VEN-06-4 | G2 | services/venue-booking-service/test/pricing.test.ts | — | pass | services/venue-booking-service/test/pricing.test.ts |
| AC-VEN-06-5 | G2 | services/venue-booking-service/test/pricing.test.ts | — | pass | services/venue-booking-service/test/pricing.test.ts |
| AC-VEN-07-1 | G2 | services/venue-booking-service/test/bookingRule.test.ts | — | pass | services/venue-booking-service/test/bookingRule.test.ts |
| AC-VEN-07-2 | G2 | services/venue-booking-service/test/bookingRule.test.ts | — | pass | services/venue-booking-service/test/bookingRule.test.ts |
| AC-VEN-07-3 | G2 | services/venue-booking-service/test/bookingRule.test.ts | — | pass | services/venue-booking-service/test/bookingRule.test.ts |
| AC-VEN-07-4 | G2 | services/venue-booking-service/test/bookingRule.test.ts | — | pass | services/venue-booking-service/test/bookingRule.test.ts |
| AC-VEN-08-1 | G2 | services/venue-booking-service/test/calendar.test.ts | — | pass | services/venue-booking-service/test/calendar.test.ts |
| AC-VEN-08-2 | G2 | services/venue-booking-service/test/calendar.test.ts | — | pass | services/venue-booking-service/test/calendar.test.ts |
| AC-VEN-08-3 | G2 | services/venue-booking-service/test/calendar.test.ts | — | pass | services/venue-booking-service/test/calendar.test.ts |
| AC-VEN-08-4 | G2 | services/venue-booking-service/test/calendar.test.ts | — | pass | services/venue-booking-service/test/calendar.test.ts |
| AC-VEN-08-5 | G2 | services/venue-booking-service/test/calendar.test.ts | — | pass | services/venue-booking-service/test/calendar.test.ts |
| AC-VEN-09-1 | G2 | services/venue-booking-service/test/internalBooking.test.ts | — | pass | services/venue-booking-service/test/internalBooking.test.ts |
| AC-VEN-09-2 | G2 | services/venue-booking-service/test/internalBooking.test.ts | — | pass | services/venue-booking-service/test/internalBooking.test.ts |
| AC-VEN-09-3 | G2 | services/venue-booking-service/test/internalBooking.test.ts | — | pass | services/venue-booking-service/test/internalBooking.test.ts |
| AC-VEN-09-4 | G2 | services/venue-booking-service/test/internalBooking.test.ts | — | pass | services/venue-booking-service/test/internalBooking.test.ts |
| AC-VEN-09-5 | G2 | services/venue-booking-service/test/internalBooking.test.ts | — | pass | services/venue-booking-service/test/internalBooking.test.ts |
| AC-BOK-01-1 | G3 | services/venue-booking-service/test/search.test.ts | — | pass | services/venue-booking-service/test/search.test.ts |
| AC-BOK-01-2 | G3 | services/venue-booking-service/test/search.test.ts | — | pass | services/venue-booking-service/test/search.test.ts |
| AC-BOK-01-3 | G3 | services/venue-booking-service/test/search.test.ts | — | pass | services/venue-booking-service/test/search.test.ts |
| AC-BOK-01-4 | G3 | services/venue-booking-service/test/search.test.ts | — | pass | services/venue-booking-service/test/search.test.ts |
| AC-BOK-02-1 | G3 | services/venue-booking-service/test/search.test.ts | — | pass | services/venue-booking-service/test/search.test.ts |
| AC-BOK-02-2 | G3 | services/venue-booking-service/test/search.test.ts | — | pass | services/venue-booking-service/test/search.test.ts |
| AC-BOK-02-3 | G3 | services/venue-booking-service/test/search.test.ts | — | pass | services/venue-booking-service/test/search.test.ts |
| AC-BOK-03-1 | G3 | services/venue-booking-service/test/venueDetail.test.ts | — | pass | services/venue-booking-service/test/venueDetail.test.ts |
| AC-BOK-03-2 | G3 | services/venue-booking-service/test/venueDetail.test.ts | — | pass | services/venue-booking-service/test/venueDetail.test.ts |
| AC-BOK-04-1 | G3 | services/venue-booking-service/test/availability.test.ts | — | pass | services/venue-booking-service/test/availability.test.ts |
| AC-BOK-04-2 | G3 | services/venue-booking-service/test/availability.test.ts | — | pass | services/venue-booking-service/test/availability.test.ts |
| AC-BOK-04-3 | G3 | services/venue-booking-service/test/availability.test.ts | — | pass | services/venue-booking-service/test/availability.test.ts |
| AC-BOK-04-4 | G3 | services/venue-booking-service/test/availability.test.ts | — | pass | services/venue-booking-service/test/availability.test.ts |
| AC-BOK-04-5 | G3 | services/venue-booking-service/test/availability.test.ts | — | pass | services/venue-booking-service/test/availability.test.ts |
| AC-BOK-04-6 | G3 | services/venue-booking-service/test/availability.test.ts | — | pass | services/venue-booking-service/test/availability.test.ts |
| AC-BOK-05-1 | G3 | services/venue-booking-service/test/slotSelection.test.ts | — | pass | services/venue-booking-service/test/slotSelection.test.ts |
| AC-BOK-05-2 | G3 | services/venue-booking-service/test/slotSelection.test.ts | — | pass | services/venue-booking-service/test/slotSelection.test.ts |
| AC-BOK-05-3 | G3 | services/venue-booking-service/test/slotSelection.test.ts | — | pass | services/venue-booking-service/test/slotSelection.test.ts |
| AC-BOK-05-4 | G3 | services/venue-booking-service/test/slotSelection.test.ts | — | pass | services/venue-booking-service/test/slotSelection.test.ts |
| AC-BOK-05-5 | G3 | services/venue-booking-service/test/slotSelection.test.ts | — | pass | services/venue-booking-service/test/slotSelection.test.ts |
| AC-BOK-06-1 | G3 | services/venue-booking-service/test/hold.test.ts | — | pass | services/venue-booking-service/test/hold.test.ts |
| AC-BOK-06-2 | G3 | services/venue-booking-service/test/hold.test.ts | — | pass | services/venue-booking-service/test/hold.test.ts (20 request đồng thời, BẮT BUỘC theo BR-BOK-03) |
| AC-BOK-06-3 | G3 | services/venue-booking-service/test/hold.test.ts | — | pass | services/venue-booking-service/test/hold.test.ts |
| AC-BOK-06-4 | G3 | services/venue-booking-service/test/hold.test.ts | — | pass | services/venue-booking-service/test/hold.test.ts |
| AC-BOK-06-5 | G3 | services/venue-booking-service/test/hold.test.ts | — | pass | services/venue-booking-service/test/hold.test.ts |
| AC-BOK-07-1 | G4 | services/venue-booking-service/test/booking.test.ts + services/finance-service/test/g4Saga.test.ts | — | pass | services/venue-booking-service/test/booking.test.ts |
| AC-BOK-07-2 | G4 | services/venue-booking-service/test/booking.test.ts | — | pass | services/venue-booking-service/test/booking.test.ts |
| AC-BOK-07-3 | G4 | services/venue-booking-service/test/booking.test.ts | — | pass | services/venue-booking-service/test/booking.test.ts |
| AC-BOK-07-4 | G4 | services/venue-booking-service/test/booking.test.ts | — | pass | services/venue-booking-service/test/booking.test.ts |
| AC-BOK-07-5 | G4 | services/venue-booking-service/test/booking.test.ts | — | pass | services/venue-booking-service/test/booking.test.ts |
| AC-BOK-08-1 | G4 | services/venue-booking-service/test/booking.test.ts | — | pass | services/venue-booking-service/test/booking.test.ts |
| AC-BOK-08-2 | G4 | services/venue-booking-service/test/booking.test.ts | — | pass | services/venue-booking-service/test/booking.test.ts |
| AC-BOK-08-3 | G4 | services/venue-booking-service/test/booking.test.ts | — | pass | services/venue-booking-service/test/booking.test.ts |
| AC-BOK-08-4 | G4 | services/venue-booking-service/test/booking.test.ts | — | pass | services/venue-booking-service/test/booking.test.ts |
| AC-BOK-08-5 | G4 | services/venue-booking-service/test/booking.test.ts | — | pass | services/venue-booking-service/test/booking.test.ts |
| AC-FIN-01-1 | G4 | services/finance-service/test/wallet.test.ts | — | pass | services/finance-service/test/wallet.test.ts |
| AC-FIN-01-2 | G4 | services/finance-service/test/wallet.test.ts | — | pass | services/finance-service/test/wallet.test.ts |
| AC-FIN-01-3 | G4 | services/finance-service/test/wallet.test.ts | — | pass | services/finance-service/test/wallet.test.ts |
| AC-FIN-01-4 | G4 | services/finance-service/test/wallet.test.ts | — | pass | services/finance-service/test/wallet.test.ts |
| AC-FIN-02-1 | G4 | services/finance-service/test/topup.test.ts | — | pass | services/finance-service/test/topup.test.ts |
| AC-FIN-02-2 | G4 | services/finance-service/test/topup.test.ts | — | pass | services/finance-service/test/topup.test.ts |
| AC-FIN-02-3 | G4 | services/finance-service/test/topup.test.ts | — | pass | services/finance-service/test/topup.test.ts |
| AC-FIN-02-4 | G4 | services/finance-service/test/topup.test.ts | — | pass | services/finance-service/test/topup.test.ts |
| AC-FIN-03-1 | G4 | services/finance-service/test/g4Saga.test.ts | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-03-2 | G4 | services/finance-service/test/g4Saga.test.ts | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-03-3 | G4 | services/finance-service/test/g4Saga.test.ts | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-03-4 | G4 | services/finance-service/test/g4Saga.test.ts | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-04-1 | G4 | services/finance-service/test/g4Saga.test.ts | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-04-2 | G4 | services/finance-service/test/g4Saga.test.ts | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-04-3 | G4 | services/finance-service/test/g4Saga.test.ts (tích hợp thật qua RabbitMQ, bắc qua 2 service) | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-04-4 | G4 | services/finance-service/test/g4Saga.test.ts | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-06-1 | G4 | services/finance-service/test/g4Saga.test.ts | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-06-2 | G4 | services/finance-service/test/g4Saga.test.ts | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-06-3 | G4 | services/finance-service/test/g4Saga.test.ts (assertion trong bài AC-FIN-04-3: refType='booking'+type='topup' phân biệt tiền về muộn) | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-09-1 | G4 | services/finance-service/test/g4Saga.test.ts | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-09-2 | G4 | services/finance-service/test/g4Saga.test.ts (ba vế cân bằng, kiểm trực tiếp LEDGER_ENTRY) | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-FIN-09-3 | G4 | services/finance-service/test/g4Saga.test.ts | — | pass | services/finance-service/test/g4Saga.test.ts |
| AC-BOK-09-1 | G5 | services/venue-booking-service/test/cancellation.test.ts + services/finance-service/test/refund.test.ts | — | pass | HTTP hủy 100% + LEDGER_ENTRY đảo ba vế |
| AC-BOK-09-2 | G5 | services/venue-booking-service/test/cancellation.test.ts + services/finance-service/test/refund.test.ts | — | pass | HTTP hủy 50% + LEDGER_ENTRY đảo ba vế |
| AC-BOK-09-3 | G5 | services/venue-booking-service/test/cancellation.test.ts + services/finance-service/test/refund.test.ts | — | pass | HTTP hủy 0% + không có refund entry |
| AC-BOK-09-4 | G5 | services/venue-booking-service/test/cancellation.test.ts | — | pass | booking cancelled không còn chặn slot |
| AC-BOK-09-5 | G5 | services/venue-booking-service/test/cancellation.test.ts | — | pass | từ chối khi ca đã bắt đầu |
| AC-BOK-09-6 | G5 | services/venue-booking-service/test/cancellation.test.ts | — | pass | dùng policySnapshot cũ |
| AC-BOK-09-7 | G5 | services/venue-booking-service/test/cancellation.test.ts | — | pass | updateMany có điều kiện + một Outbox event |
| AC-BOK-10-1 | G5 | services/venue-booking-service/test/cancellation.test.ts | — | pass | đổi courtId, giữ giờ/giá/status |
| AC-BOK-10-2 | G5 | services/venue-booking-service/test/cancellation.test.ts | — | pass | sân bận không xuất hiện trong danh sách thay thế |
| AC-BOK-10-3 | G5 | services/venue-booking-service/test/cancellation.test.ts + services/finance-service/test/refund.test.ts | — | pass | provider_fault luôn refundPercent=100 + đảo ba vế |
| AC-BOK-10-4 | G5 | services/venue-booking-service/test/cancellation.test.ts | — | pass | reason rỗng bị Zod từ chối |
| AC-BOK-10-5 | G5 | services/venue-booking-service/test/cancellation.test.ts | — | pass | provider khác nhận FORBIDDEN_NOT_OWNER |
| AC-BOK-10-6 | G5 | services/venue-booking-service/test/cancellation.test.ts | — | pass | courtChangedAt sinh ghi chú chi tiết booking |
| AC-FIN-07-1 | G5 | services/finance-service/test/refund.test.ts | — | pass | personal +200k, business.pending đảo -180k, platform -20k |
| AC-FIN-07-2 | G5 | services/finance-service/test/refund.test.ts | — | pass | personal +100k, business.pending còn 90k |
| AC-FIN-07-3 | G5 | services/finance-service/test/refund.test.ts | — | pass | không refund, pending/commission giữ nguyên |
| AC-FIN-07-4 | G5 | services/finance-service/test/refund.test.ts | — | pass | platform giữ đúng 10k sau hoàn 50% |
| AC-FIN-07-5 | G5 | services/finance-service/test/refund.test.ts | — | pass | kiểm bảo toàn 200k cho cả ba mức |
| AC-FIN-07-6 | G5 | services/finance-service/test/refund.test.ts | — | pass | replay cùng event không thêm ledger entry |
| AC-FIN-08-1 | G5 | services/finance-service/test/refund.test.ts | — | pass | provider_fault hoàn personal 100% |
| AC-FIN-08-2 | G5 | services/finance-service/test/refund.test.ts | — | pass | business.pending về giá trị trước booking |
| AC-FIN-08-3 | G5 | services/finance-service/test/refund.test.ts | — | pass | platform commission bị đảo đủ |
| AC-FIN-08-4 | G5 | services/finance-service/test/refund.test.ts | — | pass | ba vế sau hủy = 200k, toàn bộ ở personal |
| AC-FIN-08-5 | G5 | services/finance-service/test/refund.test.ts | — | pass | bút toán gốc còn nguyên; điều chỉnh là entry mới |
| AC-FIN-09-4 | G6 | services/finance-service/test/g6Revenue.test.ts | — | pass | scheduler chuyển đúng booking pending → available sau 24h |
| AC-FIN-09-5 | G6 | services/finance-service/test/g6Revenue.test.ts | — | pass | tranh chấp chỉ giữ pending của booking liên quan |
| AC-FIN-09-6 | G6 | services/finance-service/test/g6Revenue.test.ts | — | pass | booking nội bộ bị loại và không sinh hoa hồng |
| AC-FIN-10-1 | G6 | services/finance-service/test/g6Withdrawal.test.ts | — | pass | available → reserved, tổng ví không đổi, không ledger |
| AC-FIN-10-2 | G6 | services/finance-service/test/g6Withdrawal.test.ts | — | pass | từ chối vượt available, số dư giữ nguyên |
| AC-FIN-10-3 | G6 | services/finance-service/test/g6Withdrawal.test.ts | — | pass | từ chối yêu cầu thứ hai đang pending |
| AC-FIN-10-4 | G6 | services/finance-service/test/g6Withdrawal.test.ts | — | pass | chủ sân hủy: reserved trả về available |
| AC-FIN-10-5 | G6 | services/finance-service/test/g6Http.test.ts | — | pass | player bị chặn ở API provider |
| AC-FIN-10-6 | G6 | services/finance-service/test/g6Withdrawal.test.ts | — | pass | hai yêu cầu đồng thời chỉ một thành công |
| AC-FIN-11-1 | G6 | services/finance-service/test/g6Withdrawal.test.ts | — | pass | webhook tiền ra đúng số: paid + payout + PayoutCompleted |
| AC-FIN-11-2 | G6 | services/finance-service/test/g6Withdrawal.test.ts | — | pass | replay webhook không thêm payout |
| AC-FIN-11-3 | G6 | services/finance-service/test/g6Withdrawal.test.ts | — | pass | lệch số tiền vào unmatched, không tự ghi ledger |
| AC-FIN-11-4 | G6 | services/finance-service/test/g6Withdrawal.test.ts | — | pass | Admin reject hoàn reserved và ghi audit có lý do |
| AC-FIN-11-5 | G6 | services/finance-service/test/g6Withdrawal.test.ts | — | pass | lý do rỗng bị từ chối |
| AC-FIN-11-6 | G6 | services/finance-service/test/g6Withdrawal.test.ts | — | pass | available + reserved + payout bảo toàn doanh thu ròng |
| AC-FIN-14-1 | G6 | services/finance-service/test/g6Reconciliation.test.ts | — | pass | tiền vào không khớp không đổi ví và vào queue |
| AC-FIN-14-2 | G6 | services/finance-service/test/g6Reconciliation.test.ts | — | pass | gán tay topup đúng ví, ledger, allocation và audit |
| AC-FIN-14-3 | G6 | services/finance-service/test/g6Reconciliation.test.ts | — | pass | Admin gán tiền ra đủ đưa yêu cầu sang paid |
| AC-FIN-14-4 | G6 | services/finance-service/test/g6Reconciliation.test.ts | — | pass | chi thiếu tạo partially_paid và giữ đúng reserved còn lại |
| AC-FIN-14-5 | G6 | services/finance-service/test/g6Reconciliation.test.ts | — | pass | sự kiện đã matched không được xử lý lại |
| AC-FIN-14-6 | G6 | services/finance-service/test/g6Http.test.ts | — | pass | mọi thao tác đối soát bắt buộc lý do |
| AC-FIN-14-7 | G6 | services/finance-service/test/g6Reconciliation.test.ts + services/finance-service/test/topup.test.ts | — | pass | allocation đủ số tiền, đúng hướng, đối ứng không dùng lại |
| AC-FIN-14-8 | G6 | services/finance-service/test/g6Reconciliation.test.ts | — | pass | bảo toàn toàn luồng G6; nhánh dispute được mở rộng tại G7 theo handoff |
| AC-FIN-14-9 | G6 | services/finance-service/test/g6Reconciliation.test.ts | — | pass | chốt chi thiếu trả reserved còn lại, không đảo payout |
| AC-FIN-14-10 | G6 | services/finance-service/test/g6Reconciliation.test.ts | — | pass | không thể reject sau khi đã payout một phần |
| AC-FIN-14-11 | G6 | services/finance-service/test/g6Reconciliation.test.ts | — | pass | chi vượt tách payout + out_of_scope đủ tổng sự kiện |
| AC-FIN-12-1 | G7 | services/finance-service/test/g7Dispute.test.ts | — | pass | mở dispute trong cửa sổ và scheduler giữ đúng booking pending |
| AC-FIN-12-2 | G7 | services/finance-service/test/g7Dispute.test.ts | — | pass | đồng hồ giả lập 30h trả DISPUTE_EXPIRED |
| AC-FIN-12-3 | G7 | services/finance-service/test/g7Dispute.test.ts | — | pass | ca chưa kết thúc trả BOOKING_NOT_ENDED |
| AC-FIN-12-4 | G7 | services/finance-service/test/g7Dispute.test.ts | — | pass | unique booking + booking lock chặn tranh chấp thứ hai |
| AC-FIN-12-5 | G7 | services/finance-service/test/g7Dispute.test.ts + services/finance-service/test/g7Http.test.ts | — | pass | chỉ người đã thanh toán booking được gửi |
| AC-FIN-12-6 | G7 | services/finance-service/test/g7Dispute.test.ts | — | pass | race đúng mốc 24h lặp 20 lần, chỉ open hoặc release thắng |
| AC-FIN-13-1 | G7 | services/finance-service/test/g7Dispute.test.ts | — | pass | hoàn toàn bộ đảo personal/business/platform trong một transaction |
| AC-FIN-13-2 | G7 | services/finance-service/test/g7Dispute.test.ts | — | pass | hoàn 80k và release đúng 108k ròng còn lại |
| AC-FIN-13-3 | G7 | services/finance-service/test/g7Dispute.test.ts | — | pass | bác không thêm ledger và release toàn bộ net |
| AC-FIN-13-4 | G7 | services/finance-service/test/g7Dispute.test.ts | — | pass | chặn hoàn vượt giá trị còn lại |
| AC-FIN-13-5 | G7 | services/finance-service/test/g7Dispute.test.ts + services/finance-service/test/g7Http.test.ts | — | pass | lý do Admin rỗng bị từ chối |
| AC-FIN-13-6 | G7 | services/finance-service/test/g7Dispute.test.ts | — | pass | booking lock + trạng thái resolved chặn quyết định lại |
| AC-FIN-13-7 | G7 | services/finance-service/test/g7Dispute.test.ts | — | pass | bút toán booking gốc còn nguyên, điều chỉnh dùng ref dispute mới |
| AC-FIN-13-8 | G7 | services/finance-service/test/g7Dispute.test.ts + services/finance-service/test/g6Reconciliation.test.ts | — | pass | ba quyết định và full-system scenario đều bảo toàn giá trị |

## 3. Nhật ký thực thi (tất cả milestone — Claude execute)

### Gboot — 2026-08-06 — ✅ self-verify OK (6/6 proof)

**Đã dựng:**
- Root: `package.json` (npm workspaces `packages/*`, `services/*`), `tsconfig.base.json`,
  `.env.example` (đủ biến 6 service + hạ tầng), `.gitignore` cập nhật, script `dev`
  (**concurrently** 6 service), `infra:up/down`.
- `docker-compose.infrastructure.yml`: Postgres 16 + Redis 7 + RabbitMQ 3.13 (chỉ hạ tầng).
- `infra/postgres-init/01-schemas-roles.sql`: tạo **5 schema + 5 role** sở hữu schema riêng.
- 3 package: `packages/shared`, `packages/eventbus`, `packages/ai` (skeleton, build sạch).
- 6 service: `api-gateway` (proxy, **không Prisma**) + 5 service nghiệp vụ (account, venue-booking,
  finance, matchmaking, community) — Express + TS + `/health`, mỗi service nghiệp vụ có
  `prisma/schema.prisma` trỏ schema riêng (chưa có model — model áp ở G0).

**6 proof cuối (bằng chứng):**
1. **`npm ci` sạch** trên `node_modules` rỗng — exit 0, 137 packages, ~20s.
2. **`docker compose ... up -d`** — postgres/redis/rabbitmq đều `healthy`.
3. **`prisma migrate dev` sạch cho cả 5 service** — mỗi service nối đúng schema riêng
   (`account`/`venue_booking`/`finance`/`matchmaking`/`community`), "Already in sync". `validate` sạch.
   *(Ghi chú: `prisma generate` báo "no models" — đúng bản chất Gboot, model áp ở G0.)*
4. **6 service `/health` trả 200** — gateway :3000, account :3001, venue :3002, finance :3003,
   match :3004, community :3005 (khởi động bằng `node dist`).
5. **Quét FK/model chéo schema**: cả 5 `schema.prisma` chỉ có `datasource`+`generator`, KHÔNG
   model/@relation/references — 0 tham chiếu chéo.
6. **Test cách ly 5 role: PASS 10/10** — mỗi role thao tác được schema riêng và **bị từ chối
   quyền** khi chạm schema service khác (`permission denied for schema ...`).

**Ghi chú Railway:** SQL init dùng `CREATEDB` cho role (chỉ để `prisma migrate dev` tạo shadow DB
ở local). Railway provisioning riêng, giữ đúng schema/grant **contract** (ADR 0004).

**Hạ tầng local đang chạy** (3 container). Dừng: `npm run infra:down`.

_(Milestone kế: G0 — áp lược đồ data model vào 5 schema.prisma.)_

### G0 — 2026-08-06 — ✅ self-verify OK (12/12 thay đổi)

**Phạm vi đã tự quyết (self-verification, ghi rõ để minh bạch):**
- Chỉ áp 12 thay đổi lên **3 schema GĐ1** mà chúng thực sự chạm tới: `account-service`,
  `venue-booking-service`, `finance-service`. Không có dòng nào trong 12 thay đổi chạm
  `matchmaking-service`/`community-service` — hai service này thuộc GĐ2 (theo DESIGN.md đã sửa
  ở phiên trước), `schema.prisma` của chúng **giữ nguyên trạng thái Gboot** (chỉ datasource +
  generator), không migrate.
- **`OPERATING_HOURS`, `CLOSURE`, `BOOKING_RULE`**: được nhắc trong quan hệ ở `data-model.md`
  gốc nhưng **chưa từng có cột nào được định nghĩa** — khoảng trống có từ trước, không thuộc 12
  thay đổi. Không tự suy đoán field (tránh lặp lỗi "kiến trúc tự mở rộng phạm vi" đã bị bắt 2 lần
  với `BOOKING_REVIEW`/`CANCELLATION_POLICY`). Để **G2** (chủ sở hữu VEN-05/06/07) định nghĩa khi
  hiện thực use case.
- `tstzrange` (Postgres) và `time` không có kiểu native trong Prisma → dùng `Unsupported("...")`
  để giữ đúng kiểu cột thật ở DB (migrate vẫn tạo đúng cột Postgres), truy vấn qua các cột này để
  G3 tự viết raw SQL khi thêm `EXCLUDE` constraint (BR-BOK-03).

**Đã cập nhật:**
- `docs/architecture/data-model.md`: áp đủ 12 dòng vào ERD account/venue-booking/finance; thêm
  ghi chú rõ ràng cho các thực thể bị loại (`BOOKING_REVIEW`, `CANCELLATION_POLICY`) và các thực
  thể còn thiếu định nghĩa cột (`OPERATING_HOURS`/`CLOSURE`/`BOOKING_RULE`).
- `docs/architecture/system-architecture.md`: §11 trỏ build order sang `phase-1-handoff.md` thay
  vì lát cắt dọc cũ (D1); §4.6 sửa câu "đánh giá booking ở venue-booking-service" thành ghi rõ
  KHÔNG thuộc phạm vi GĐ1 (D7).
- 3 `schema.prisma` (account, venue-booking, finance) có đủ model theo ERD + 12 delta.

**Bằng chứng (proof):**
- `prisma validate` sạch cho cả 3 service.
- `prisma migrate dev --name g0_init` chạy sạch trên CSDL rỗng cho cả 3 service (migration
  `g0_init` mới, áp thành công).
- Đối chiếu trực tiếp trong Postgres: **12/12 thay đổi xác nhận đúng** (roles là mảng enum;
  Provider.status có `rejected`; Booking.userId nullable + guestName/guestContact +
  cancellationReason; `booking_reviews`/`cancellation_policies` không tồn tại; Wallet có
  walletType + userId nullable + pending/reserved; WithdrawalRequest có `partially_paid` +
  paidAmount; SepayEvent có đủ 4 status; Dispute có bookingId + deadlineAt).
- Quét `@relation`: toàn bộ quan hệ chỉ trỏ nội bộ trong cùng schema, 0 tham chiếu chéo service.
- `npm run build` sạch toàn bộ 9 workspace sau khi thêm model.

_(Milestone kế: Gdesign — design baseline 5 page shell GĐ1.)_

### Gdesign — 2026-08-06 — ✅ self-verify OK (5/5 proof)

**Đã dựng `apps/web`:**
- Vite 8 + React 19 + TypeScript + Tailwind v4 (`@tailwindcss/vite`, CSS-first `@theme` — không cần
  `tailwind.config.js`) + React Router v7. Fonts: `@fontsource/geist-sans` (400/700/800),
  `@fontsource/geist-mono` (400/500) — tự host, không phụ thuộc CDN Google Fonts.
- Design tokens: 10 màu ở `src/index.css` `@theme` (navy, blue, slate, court-green `#1B4D2E`,
  accent-shuttle `#F5E663`, accent-red `#E63946`, text/bg) → Tailwind tự sinh utility
  (`bg-court-green`, `text-accent-shuttle`, ...). Typography scale `.text-h1/h2/body/caption` +
  `.text-figures` (Geist Mono cho số liệu).
- Component dùng chung: `Preloader` (CSS `@keyframes`, không Framer Motion), `Navbar` (sticky,
  đổi nền khi cuộn), `MenuOverlay` (full-screen navy, không có "Download App"), `Hero` (SVG phẳng +
  parallax 3 lớp bằng CSS `transform: translateY()`, không WebGL), `Card` (hover translateY),
  `AdminTable`, `AuthForm`, `SlotGrid`.
- 5 page shell GĐ1: Trang chủ, Auth (login/register/verify), Đặt sân, Hồ sơ, Quản trị — dữ liệu
  mock ở `src/data/mock.ts`, chưa gọi API thật (đúng scope boundary).

**Một lỗi thật tự phát hiện và tự sửa (self-verification, ghi minh bạch):**
- Bình luận trong `index.css` chứa chuỗi `--color-*/--font-*` — literal `*/` **đóng comment CSS
  sớm**, làm hỏng toàn bộ khối `@theme` phía sau (đây cũng là nguồn gốc 2 warning Lightning CSS
  lúc build đầu tiên). Hệ quả: 0 token màu được sinh, mọi utility như `bg-court-green` không tồn
  tại, trang render sai hoàn toàn (nền sáng thay vì xanh lá đậm, caption xanh xám thay vì vàng).
  Phát hiện bằng cách so khớp trực tiếp `grep` trên CSS build ra (không có `--color-court-green`
  nào), không phải chỉ nhìn ảnh chụp. Sửa bằng cách viết lại câu chữ tránh literal `*/`. Rebuild
  sạch, không còn warning, token/utility sinh đúng — xác nhận lại bằng ảnh chụp thực tế.
- `Hero.tsx` có 3 dòng SVG `stroke="#F5E663"` hardcode hex, vi phạm nguyên tắc "không hardcode
  hex trong component". Sửa thành `className="stroke-accent-shuttle"` (Tailwind utility từ token).

**Bằng chứng (proof):**
1. `npm run dev` (port 5173, http 200) và `vite build` đều sạch, không lỗi/warning.
2. 5 page shell render đúng qua Browser pane, không lỗi console (kiểm từng trang: Home, Booking,
   Profile, Auth, Admin).
3. **10 screenshot** (5 trang × 2 viewport: desktop 1440×900, mobile 390×844) lưu tại
   `docs/product/gdesign-screenshots/` bằng script Playwright (`scripts/gdesign-screenshots.mjs`,
   dùng lại được cho Playwright E2E ở G1..G7 theo master goal). Đối chiếu bảng dưới.
4. Grep-âm: không `three`/`webgl`/`<canvas`/`lenis`/`<video` trong `apps/web/src` (1 kết quả duy
   nhất là dòng comment tự mô tả "không cần WebGL/canvas" — không phải import thật). Không
   dependency `three`/`lenis` trong `package.json`.
5. Token tập trung một nguồn (`index.css` `@theme`) — quét lại 0 hex hardcode trong
   `src/components`/`src/pages`/`src/layout` sau khi sửa Hero.tsx.

**Đối chiếu "giống actl.me 90%" (DESIGN.md §1.1, cột trái):**

| Tiêu chí | Đạt/lệch | Ghi chú |
|---|---|---|
| Thứ tự section, layout tổng thể | ✅ Đạt | Nav → Hero → 3 tính năng, giống cấu trúc ACTL |
| Nhịp spacing, tỉ lệ typography H1/H2/Body/Caption | ✅ Đạt | Scale `clamp()` đúng khoảng 48–64px/32–40px/16px/13px |
| Motion: hover đổi màu, overlay bung, card nhấc, fade khi cuộn | ✅ Đạt (một phần) | Hover/overlay/card đã có; fade-in khi cuộn tới (scroll-triggered reveal) **chưa làm** — chỉ có parallax hero, để G1..G7 bổ sung nếu cần khi có nội dung thật |
| UX: nav sticky đổi nền, overlay thay dropdown, list đậm số liệu | ✅ Đạt | Nav đổi nền khi cuộn; overlay full-screen; `AdminTable`/`SlotGrid` dùng Geist Mono cho số liệu |
| Cảm giác thể thao cạnh tranh (contrast mạnh, chữ hoa đậm) | ✅ Đạt | H1 uppercase 800, contrast navy/court-green vs vàng |
| KHÔNG WebGL/3D/canvas/particle | ✅ Đạt | Xác nhận bằng grep-âm (mục 4) |

**Ghi chú:** dùng ảnh chụp Playwright viewport cố định làm bằng chứng bền vững, không dùng
actl.me trực tiếp (site sống, có thể đổi) làm bằng chứng duy nhất — đúng yêu cầu goal.
`react-router-dom@7.18.2` (mới nhất) có advisory GHSA-qwww-vcr4-c8h2 (CSRF, chỉ ảnh hưởng RSC
Mode) — dự án dùng SPA `BrowserRouter` thuần, không có bề mặt tấn công đó; chưa có bản vá mới hơn,
không hạ version.

### G1 — 2026-08-06 — ✅ self-verify OK (31/34 pass, 3 blocked)

**Đã dựng (business logic thật, account-service):**
- `packages/eventbus`: publish RabbitMQ (topic exchange `domain-events`) + Outbox relay
  (`startOutboxRelay`, poll 500ms, `SELECT...FOR UPDATE SKIP LOCKED`).
- `account-service`: lib nền (env, prisma, redis, password/bcrypt, jwt, outbox, email-stub,
  errors) + 6 domain module (registration, verification, session, passwordReset, profile,
  adminAccounts) + routes Express (`/auth/*`, `/profile/me`, `/admin/users/:id/lock|unlock`) +
  middleware `requireAuth`/`requireRole`.
- Outbox + ProcessedEvent thêm vào schema account (data-model.md §7, đúng phạm vi service này).
- 2 sự kiện domain đúng tên đã có trong system-architecture.md (không tự đặt tên mới):
  `UserRegistered` (ACC-02), `AccountLocked` (ACC-08, dùng field `locked:boolean` cho cả
  khóa/khôi phục thay vì bịa thêm `AccountUnlocked`).

**Quyết định phạm vi tự đưa ra (ghi minh bạch):** `AC-ACC-02-5` (ví personal ở finance) và
`AC-ACC-08-3/08-4` (ẩn cơ sở khỏi tìm kiếm, chặn booking ở venue-booking) đòi hỏi logic ở service
khác — trái với "Không đổi: các service khác" của scope boundary G1, và venue-booking/finance
chưa được xây (G2/G4). Áp đúng mô hình Outbox đã chốt (ADR 0004): G1 xây **đầy đủ phía producer**
(ghi Outbox + relay publish RabbitMQ đúng một lần, xác nhận bằng smoke test thật — xem dưới); phía
**consumer** đánh dấu `blocked` trong ledger, không tự xây trước logic thuộc milestone khác.

**2 lỗi hạ tầng nghiêm trọng tự phát hiện và tự sửa (self-verification, ghi minh bạch):**
1. **Prisma Client bị ghi đè giữa các service.** `generator client` mặc định generate ra
   `node_modules/@prisma/client` — do npm workspaces hoist, **cả 5 service dùng chung một
   thư mục**, nên service generate SAU sẽ đè client (và model) của service generate TRƯỚC. Xác
   nhận bug ĐANG XẢY RA từ G0 (client chung lúc đó là của finance, ghi đè lên account/venue-booking).
   Sửa: thêm `output = "../node_modules/@prisma/client"` vào cả 5 schema.prisma (kể cả 2 service
   GĐ2, tránh kế thừa bug sau) — mỗi service tự có client riêng. Xác nhận lại bằng cách in
   `Object.keys()` của client mỗi service, đúng model riêng của từng service.
2. **`npm install` ở root xóa mất Prisma Client generate thủ công.** Vì npm không biết thư mục đó
   là output của Prisma nên coi là rác và dọn khi cài thêm gói. Sửa bằng `postinstall: prisma
   generate` chuẩn Prisma cho cả 5 service — tự phục hồi sau mỗi `npm install`.

**Bằng chứng (proof):**
- **32/32 test không-skip PASS** (34 AC, 3 `it.skip` có lý do rõ + 1 test phụ xác nhận cấu trúc
  event `AccountLocked`), chạy bằng Vitest, tích hợp thật với Postgres + Redis (docker infra), viết
  ở `services/account-service/test/*.test.ts` (6 file, ~35 test case).
- **`AC-ACC-03-4` (thông báo lỗi trùng khớp từng ký tự):** kiểm bằng `expect(...).toBe(...)` so
  sánh chuỗi tuyệt đối giữa nhánh "sai mật khẩu" và "email không tồn tại" — chặt hơn yêu cầu
  "kiểm tra thủ công" của handoff.
- **Smoke test thật xác nhận relay publish đúng lên RabbitMQ** (không chỉ ghi Outbox): tạo 1 dòng
  Outbox thủ công → relay đọc → publish lên exchange `domain-events` → **nhận được message thật**
  qua một queue tạm bind wildcard → `publishedAt` được set. Chứng minh producer side "phát" thật,
  không chỉ dừng ở ghi DB.
- `npm run build` + `npm run typecheck` sạch toàn bộ 9 workspace sau khi thêm business logic.

**Test ledger:** 31 dòng `AC-ACC-*` chuyển `pass`, 3 dòng chuyển `blocked` kèm lý do (§2).

_(Milestone kế: G2 — Nhà cung cấp và lịch sân, 43 AC — tiêu thụ `AccountLocked` để hoàn thành
AC-ACC-08-3/08-4 còn blocked ở trên.)_

### G2 — 2026-08-06 — ✅ self-verify OK (41/43 pass, 2 blocked)

**Đã dựng (business logic thật, venue-booking-service):** 9 chức năng VEN-01→09 —
đăng ký/duyệt NCC, hồ sơ cơ sở, sân con, giờ hoạt động + ngày đóng cửa, biểu giá theo lịch
(tính tiền bắc cầu khung giá), quy tắc đặt sân, lịch hợp nhất, booking tại quầy. Consumer
`AccountLocked` (idempotent qua `ProcessedEvent`) — hoàn thành `AC-ACC-08-3` còn blocked từ G1.

**2 sửa hạ tầng tự phát hiện (self-verification, kế thừa từ G0, phát hiện khi bắt tay code G2):**
1. **`PricingRule.startTime/endTime` và `Hold/Booking.timeRange` dùng `Unsupported("time"/
   "tstzrange")`** (quyết định G0) — nhưng Prisma **không cho phép app code đọc/ghi field
   Unsupported qua Client**, chỉ raw SQL. VEN-04/05/06 (G2) cần Prisma Client truy vấn các
   trường này bình thường. Sửa: `PricingRule` dùng phút-trong-ngày (`Int`); `Hold/Booking` tách
   `startAt`/`endAt` (`DateTime` thường). Ràng buộc EXCLUDE chống đặt trùng (BR-BOK-03) vẫn để
   G3 thêm bằng migration SQL riêng trên cột generated — không mất gì, chỉ đổi shape cột đúng
   từ bây giờ. Phải `prisma migrate reset` + recreate schema bằng superuser (role
   `venue_booking_svc` không có quyền `CREATE SCHEMA`, đúng thiết kế bảo mật Gboot).
2. **`OperatingHour`/`Closure`/`BookingRule`** (hoãn ở G0, "để G2 định nghĩa khi hiện thực use
   case") — định nghĩa đầy đủ ở đây theo đúng ghi chú đã để lại.

**Quyết định phạm vi cần PO xác nhận (đã hỏi Codex trước khi tự quyết — xem hội thoại):**
`AC-VEN-02-1` (duyệt hồ sơ → cộng vai `provider` + tạo ví `business`) đòi hỏi (a) sự kiện mới
`ProviderApproved` chưa có trong catalog kiến trúc (system-architecture.md §6.3), và (b) sửa
`account-service` ngoài scope boundary G2 đã ghi. Codex khuyến nghị: tên `ProviderApproved` hợp
quy ước, kiến trúc nên dùng event (không đồng bộ HTTP), nhưng **cần PO xác nhận rõ trước khi
sửa `account-service`** vì đây là mâu thuẫn tài liệu thật (D21 chỉ đổi người thực thi, không
trao quyền tự giải mâu thuẫn scope). **Đã hỏi PO, đang chờ phản hồi** — theo mặc định an toàn:
chỉ làm phần venue-booking-service tự quyết được (status pending→approved), đánh dấu
`AC-VEN-02-1` và `AC-VEN-02-4` (cần thêm G3/G4) là `blocked`.

**Bằng chứng (proof):**
- **46/46 test không-skip PASS** (43 AC + 3 test bổ sung cho AccountLocked consumer, 3 skip có
  lý do rõ), vitest tích hợp thật với Postgres (docker infra).
- Một bug thật tự bắt: `effectiveFrom = new Date()` truyền vào `savePricingRules` bị chính hàm
  từ chối vì vài ms sau `Date.now()` đã lớn hơn — sửa bằng dung sai 60s cho "ngay bây giờ".
- `AC-ACC-08-3` xác nhận đầy đủ: khóa NCC → `isVenueSearchable` chuyển `false`, booking
  `confirmed` giữ nguyên; khôi phục → search lại `true`; xử lý trùng `eventId` không suspend lại.
- `npm run build` + `npm run typecheck` sạch toàn bộ 9 workspace.

**Test ledger:** 41 dòng `AC-VEN-*` chuyển `pass`, 2 dòng `blocked`; `AC-ACC-08-3` chuyển `pass`
(hoàn thành ở G2); `AC-ACC-08-4` giữ `blocked`, đổi lý do sang chờ G3 (không còn chờ G2).

_(Milestone kế: G3 — Tìm sân và giữ chỗ, 25 AC.)_

### G3 — 2026-08-06 — ✅ self-verify OK (25/25 pass)

**Đã dựng (business logic thật, venue-booking-service):** BOK-01→06 — tìm sân theo vị trí
(Haversine, bán kính mặc định 10km), lọc/sắp xếp (giá, khung giờ trống), xem chi tiết cơ sở,
xem lịch trống + giá theo ngày (dùng lại `getEffectivePricingWindows`/`calculateBookingPrice`
từ G2), chọn slot + thời lượng (dùng lại `isDurationAllowed` từ G2), **giữ chỗ 10 phút chống đua
THẬT** bằng EXCLUDE constraint Postgres + reap-then-insert trong cùng transaction — không chỉ
kiểm tra tầng ứng dụng (đúng yêu cầu BR-BOK-03 + Stop/pause của G3).

**Hạ tầng CSDL mới — EXCLUDE constraint thật (không phải giả lập):**
- Cài extension `btree_gist` ở cấp database (ghi vào `infra/postgres-init/02-extensions.sql`
  để tái lập được).
- **Phát hiện + sửa 1 lỗi kiểu dữ liệu thật:** `startAt/endAt` (G2) map thành Postgres
  `timestamp` (không timezone) theo mặc định của Prisma — `tstzrange()` trong EXCLUDE constraint
  phải cast ngầm `timestamp→timestamptz`, mà cast đó phụ thuộc timezone phiên (STABLE, không
  IMMUTABLE), khiến Postgres từ chối tạo constraint ("functions in index expression must be
  marked IMMUTABLE"). Sửa: đổi **toàn bộ** cột `DateTime` trong schema sang `@db.Timestamptz(3)`
  (không chỉ 2 cột liên quan) — đúng hơn cho hệ thống nói chung, không chỉ vá riêng lẻ.
- `EXCLUDE USING gist ("courtId" WITH =, tstzrange("startAt","endAt",'[)') WITH &&)` trên
  `holds` (vô điều kiện, kết hợp reap hold hết hạn trong cùng transaction trước khi insert) và
  trên `bookings` (`WHERE status='confirmed'`, predicate hằng số nên hợp lệ).
- Xác nhận trực tiếp trong Postgres: `contype='x'` (EXCLUDE) cho cả hai constraint.

**Hoàn thành 2 AC blocked từ G1 (không chờ đến G4):**
- `AC-ACC-08-3` (đã xong ở G2) và **`AC-ACC-08-4`** — phát hiện khoảng trống thật:
  `createHold` (BOK-06) ban đầu KHÔNG kiểm tra `provider.status`, nghĩa là người chơi vẫn tạo
  được Hold cho sân của NCC đã bị khóa (gọi thẳng API, bỏ qua tìm kiếm). BR-BOK-01 nói rõ "chỉ
  cơ sở thỏa BR-VEN-03 mới xuất hiện trong tìm kiếm **và mới đặt được**" — thêm kiểm tra
  `provider.status !== 'approved' → VENUE_NOT_AVAILABLE` ngay đầu `createHold`, chặn tại bước
  sớm nhất của luồng đặt sân (không cần chờ BOK-07/G4 mới chặn được).

**2 bug thật tự bắt (self-verification):**
1. `isExclusionViolation()` yêu cầu `'code' in err` làm điều kiện AND bắt buộc, nhưng
   `PrismaClientUnknownRequestError` (lỗi 23P01 thật từ Postgres) không có field `.code` — toàn
   bộ check tắt sớm, khiến TẤT CẢ request thua trong test đồng thời rơi vào nhánh lỗi chung thay
   vì `SLOT_ON_HOLD`. Debug bằng script trực tiếp in ra shape lỗi thật, sửa bằng cách chỉ kiểm
   tra `message` (chứa `23P01` hoặc tên constraint).
2. Test timeout 5s mặc định quá ngắn cho fixture dựng 4 cơ sở tuần tự (AC-BOK-01-1) — tăng
   timeout riêng cho test đó, không phải lỗi logic.

**Bằng chứng (proof):**
- **72/72 test không-skip PASS** (25 AC + 3 test bổ sung, 2 skip còn lại thuộc G2 chờ PO).
- **`AC-BOK-06-2` (BẮT BUỘC — kiểm thử đồng thời):** 20 request `createHold` song song cho
  đúng một slot → **đúng 1 thành công, 19 thất bại `SLOT_ON_HOLD`**, xác nhận thêm bằng truy vấn
  trực tiếp CSDL (đúng 1 dòng `Hold`). Chạy lặp lại 3 lần liên tiếp, không flaky.
- `npm run build` + `npm run typecheck` sạch toàn bộ 9 workspace.

**Test ledger:** 25 dòng `AC-BOK-01..06` chuyển `pass`; `AC-ACC-08-4` chuyển `pass` (hoàn thành
ở G3, không còn `blocked`).

_(Milestone kế: G4 — Thanh toán, xác nhận và ghi doanh thu, 32 AC — cần `r=10%` đã chốt.)_

### G4 — 2026-08-06 — ✅ self-verify OK (32/32 pass) — MILESTONE CHẠM TIỀN ĐẦU TIÊN

**Đã dựng finance-service từ đầu** (trước đó chỉ có schema G0, chưa có business logic): lib nền
(env/prisma/jwt-verify-only/errors/outbox/rabbitmq, giống hệt pattern account-service/venue-booking-
service), domain FIN-01 (xem ví+lịch sử), FIN-02 (nạp qua SePay), FIN-03 (trả bằng số dư), FIN-04
(trả qua SePay cho booking), FIN-06 (tiền về muộn), và consumer `BookingConfirmed` ghi doanh thu
(phần G4 của FIN-09: `AC-FIN-09-1/2/3`). Dùng đúng `r=10%` (D19) qua hằng số
`COMMISSION_RATE_PERCENT` (lib/constants.ts), tính bằng BigInt nguyên: `commission=floor(gross*10/100)`,
`net=gross-commission` — đảm bảo `net+commission=gross` TUYỆT ĐỐI theo cấu trúc phép tính, không
phụ thuộc làm tròn (đúng BR-FIN-15, kiểm trực tiếp ở `AC-FIN-09-2`).

**venue-booking-service (BOK-07/08):** thêm `holdExpiresAt` vào Booking (sao chép từ Hold gốc lúc
tạo booking, vì Hold bị xóa ngay sau đó — cần một cách biết booking `held` còn "trong hạn" hay
không mà không cần Hold). `POST /bookings` tạo `held` từ hold hợp lệ; `GET
/internal/bookings/:id/payment-status` cho finance-service hỏi (đúng flows.md §5: "Hỏi venue-
booking-service booking còn hold không?" — API đồng bộ, không phải event, vì FIN-03 cần quyết định
NGAY); consumer `PaymentCompleted` xác nhận hoặc hủy tùy hold còn hạn; `reapExpiredHeldBookings()`
cho AC-BOK-07-5; `GET /players/me/bookings(+/:id)` cho BOK-08, dùng lại một hàm thuần
`getRefundPercentage` (bậc thang BR-BOK-05) mà G5 (BOK-09/FIN-07 hoàn tiền thật) sẽ tái dùng.

**Quyết định kiến trúc tự đưa ra trong phạm vi G4 (không phải bịa nghiệp vụ mới — chỉ là cách nối
dây giữa 2 service, đã đối chiếu đúng flows.md/system-architecture.md trước khi code):**
- Sự kiện mới `PaymentTooLate{bookingId, userId, amount}` (venue-booking-service phát, finance-
  service tiêu thụ): cần cho đúng `AC-BOK-07-2`/`BR-BOK-04` — khi `PaymentCompleted` về sau khi
  hold đã hết hạn, venue-booking-service tự phát hiện (so `holdExpiresAt`) và phải báo lại cho
  finance-service ghi có ví, vì venue-booking-service không có quyền ghi ví. Khác với vụ
  `ProviderApproved` còn treo từ G2 — sự kiện này KHÔNG đụng account-service, không mở rộng vai trò
  nào, chỉ là plumbing nằm trọn trong ranh giới "outbox và consumer hai bên" mà scope boundary của
  G4 đã cho phép tường minh.
- `PaymentIntent` mở rộng `refType` thêm `topup` + thêm cột `matchCode` (mã nội dung chuyển khoản
  duy nhất, dùng chung cho FIN-02 và FIN-04) — vì schema G0 chỉ có `booking|matchFee`, chưa có chỗ
  chứa "yêu cầu nạp".
- `SepayEvent.externalRef` (mã giao dịch phía SePay, unique) — cần cho idempotency thật khi webhook
  bị gửi lại (BR-FIN-09); trước đó không có cột nào phân biệt được redelivery với sự kiện mới.
- ~~Ví `business` được tạo lazy tại thời điểm ghi doanh thu đầu tiên~~ — **đã thay bằng D25** (xem
  vòng sửa sau Codex review bên dưới): tạo qua sự kiện `ProviderApproved` thật.

**1 bug thật nghiêm trọng tự bắt (self-verification, phát hiện nhờ đây là lần đầu tiên dự án chạy
kiểm thử tích hợp THẬT qua RabbitMQ thay vì gọi thẳng hàm consumer):** hàm tính `eventId` dự phòng
(dùng khi message chưa có `messageId`) trong CẢ HAI `eventConsumer.ts` (venue-booking-service từ G2,
finance-service mới viết ở G4) cắt **64 ký tự đầu của base64(nội dung message)** làm khóa
idempotency. Với envelope `{"type":"...","occurredAt":"<ISO>","payload":{...}}`, riêng phần
`type`+`occurredAt` đã chiếm hết 64 ký tự đó với hầu hết tên sự kiện — `payload` KHÔNG BAO GIỜ lọt
vào hash. Hậu quả: hai sự kiện CÙNG LOẠI phát trong cùng một giây (rất dễ xảy ra, ví dụ 2 booking
được xác nhận gần nhau) bị coi là **trùng lặp** và sự kiện thứ hai bị **âm thầm bỏ qua** — tiền
thật bị mất (booking không bao giờ chuyển `confirmed`, ví không bao giờ được ghi có), không có lỗi
nào được ném ra. Lỗi này đã tồn tại từ G2 nhưng chưa từng bị bắt vì G1-G3 chỉ test bằng cách gọi
thẳng hàm consumer (`handleAccountLocked(...)`), chưa bao giờ đi qua hàng đợi RabbitMQ thật — kiểm
thử tích hợp thật của G4 (`g4Saga.test.ts`, bắt buộc bởi chính AC-FIN-04-3/AC-BOK-07-2/07-4) là lần
đầu lộ ra. Debug bằng loạt script `scratch-debug-saga.ts` (đã xóa), thu hẹp dần từ "toàn bộ saga
không nhận được message" xuống "transaction chạy đúng nhưng bị bỏ qua sớm do `already processed`
sai". Sửa: băm SHA-256 TOÀN BỘ nội dung message thay vì cắt một đoạn đầu cố định, ở cả hai service.

**Bằng chứng (proof):**
- **21/21 test finance-service PASS**, **82/82 test venue-booking-service không-skip PASS** (2
  skip còn lại vẫn là AC-VEN-02-1/02-4 chờ PO, không liên quan G4).
- `services/finance-service/test/g4Saga.test.ts` là kiểm thử **tích hợp thật** — khởi động ĐÚNG cả
  hai app (Express thật của venue-booking-service + RabbitMQ publish/consume thật của cả hai
  service) trong cùng tiến trình test, không mock; đúng yêu cầu "AC-FIN-04-3/AC-BOK-07-2/07-4 là
  kiểm thử tích hợp qua hàng đợi sự kiện" của court-booking.md/finance-disputes.md.
- **`AC-FIN-09-2` (ba vế cân bằng) kiểm trực tiếp trên `LEDGER_ENTRY`** (không chỉ số dư hiển thị):
  `releaseEntry.amount + commissionEntry.amount === gross` tuyệt đối, cộng kiểm riêng từng vế
  (`personal -200000`, `business.pending +180000`, `platform.available +20000` với gross=200000).
  Toàn bộ test tài chính khác (FIN-01..04, 06) cũng assert thẳng trên bảng `ledgerEntry`, không chỉ
  `wallet.available`.
- Đóng **`AC-ACC-02-5`** (blocked từ G1) — `services/finance-service/test/walletProvisioning.test.ts`.
- `npm run build` + `npm run typecheck` sạch toàn bộ 9 workspace.

**Câu hỏi còn treo từ G2 (vẫn CHƯA có quyết định PO, tiếp tục không tự ý xử lý):**
`AC-VEN-02-1`/`AC-VEN-02-4` — sự kiện `ProviderApproved` mới + việc account-service tự cấp vai trò
`provider` khi NCC được duyệt. G4 xử lý phần ví bằng lazy-creation (không cần sự kiện này), nhưng
BẢN THÂN câu hỏi kiến trúc (có nên có `ProviderApproved` hay không, ai phát, ai tiêu thụ) vẫn mở.

**Quy tắc mới từ PO (2026-08-06, D22):** mỗi milestone G phải qua một vòng Codex review trước khi
commit. Lần đầu áp dụng ngay ở G4 — PO tự chạy Codex review (không phải Claude), phát hiện **6 lỗi
P1 Standards + 3 P1 + 4 P2 Spec** mà toàn bộ test xanh ở trên KHÔNG bắt được, vì phần lớn test gọi
thẳng hàm domain, không đi qua HTTP hay hàng đợi thật. Xem mục "Vòng sửa sau Codex review" ngay dưới.

**Test ledger:** 32 dòng `AC-BOK-07/08`, `AC-FIN-01..04,06,09(1-3)` chuyển `pass`; `AC-ACC-02-5`
chuyển `pass` (không còn `blocked`).

### G4 — Vòng sửa sau Codex review (D22, cùng ngày 2026-08-06)

Codex (PO tự chạy, model do PO chọn) review diff G4 và kết luận **chưa nên commit**. 13 phát hiện,
đối chiếu từng cái với code thật rồi sửa toàn bộ — không có phát hiện nào bị bỏ qua:

**6 lỗi P1 Standards (đúng-đắn kỹ thuật):**
1. **Webhook SePay giả mạo được** — `/webhooks/sepay` không xác thực, ai biết `matchCode` cũng tự
   gửi được số tiền tùy ý, kể cả số âm. → **D23** (PO chốt): shared secret qua
   `SEPAY_WEBHOOK_SECRET` (header `x-sepay-signature`) + Zod chặn `amount<=0`. Không nhập credential
   SePay production vào code.
2. **`res.json()` với BigInt ném 500** — mọi route trả `priceSnapshot` (booking) đều lỗi runtime
   thật (`TypeError: Do not know how to serialize a BigInt`), POST đã commit DB rồi mới lỗi ở
   response. Test domain của G4 không chạm HTTP nên không lộ. Sửa: `serializeBooking()` chuyển sang
   chuỗi ở mọi route booking; thêm bộ test qua `supertest` thật (`bookingHttp.test.ts`) để không lặp
   lại kiểu lỗi này.
3. **Slot mở lại trước khi thanh toán xong** — `createBookingFromHold` xóa `Hold` ngay lúc tạo
   booking `held`, trái spec BOK-07 (xóa hold Ở BƯỚC XÁC NHẬN). Người thứ hai có thể giữ được slot
   và cả hai cùng trả tiền. Sửa: giữ hold tới khi `PaymentCompleted` → `confirmed` mới xóa (trong
   `eventConsumer.handlePaymentCompleted`); EXCLUDE constraint (G3) tiếp tục chặn suốt cửa sổ trả.
4. **Race trừ ví** — kiểm số dư ngoài transaction, `postLedgerEntry` đọc-sửa-ghi không khóa. Hai
   request thanh toán đồng thời có thể cùng qua được kiểm tra rồi cùng trừ tiền. Sửa: `SELECT ...
   FOR UPDATE` khóa hàng ví trong `postLedgerEntry` + đọc lại số dư TRONG transaction ở
   `payBookingWithBalance`; cộng thêm **unique index CSDL** `ledger_payment_once` (mỗi booking tối
   đa 1 bút toán `payment`) làm hàng rào cuối.
5. **Idempotency hỏng khi outbox replay** — `eventId` dự phòng băm nội dung message, nhưng
   `occurredAt` sinh mới mỗi lần `publishEvent` gọi, nên relay publish lại (crash giữa publish và
   `markPublished`) tạo message khác nội dung → khóa khác → xử lý trùng (ghi doanh thu/hoàn tiền hai
   lần). Sửa TẬN GỐC ở `packages/eventbus`: `publishEvent` nhận `messageId` tùy chọn, `startOutboxRelay`
   truyền `Outbox.id` làm `messageId` — mọi lần publish lại CÙNG dòng Outbox giờ mang cùng
   `messageId`, đúng nghĩa idempotency key ổn định. (Đây là bản vá SAU bản vá SHA-256 tôi tự làm
   trước đó trong cùng ngày — SHA-256 đúng hướng nhưng chưa đủ vì hash nội dung thay đổi theo
   `occurredAt`; Codex chỉ ra tận gốc.)
6. **Ví `platform` không duy nhất** — Postgres coi mỗi `NULL` là khác nhau trong unique constraint,
   nên `(userId, walletType)` không chặn được hai ví `platform` (`userId=NULL`) cùng tồn tại nếu hai
   `BookingConfirmed` đầu tiên chạy đồng thời (phá D16). Sửa: partial unique index
   `wallets_platform_singleton ON wallets(walletType) WHERE walletType='platform'`.

**3 lỗi P1 + 4 lỗi P2 Spec:**
7. **Vi phạm workflow BOK-07** — cùng nguyên nhân với #3 (xóa hold sai bước).
8. **Tiền SePay chuyển thừa bị mất đối ứng** — chuyển 250k cho booking 200k chỉ ghi
   `release+commission=200k`, 50k biến mất. → **D24** (PO chốt): phần đúng giá xác nhận booking,
   phần thừa ghi có ví `personal` (`refType='overpay'`).
9. **`AC-BOK-07-5` không chạy ở runtime** — `reapExpiredHeldBookings()`/`reapExpiredHolds()` (G3)
   chỉ được gọi trong test, không có scheduler. Booking không thanh toán kẹt `held` vô thời hạn thật
   ngoài môi trường test. Sửa: `lib/scheduler.ts` (`setInterval` 30s), khởi động trong `index.ts`.
10. **`AC-FIN-06-3` chưa đạt** — thanh toán thiếu và tiền về muộn cùng ghi `refType='booking'`,
    không phân biệt được trong lịch sử. Sửa: `refType` riêng cho từng trường hợp
    (`late_payment`/`partial_payment`/`overpay`), nêu rõ trong ledger.
11. **Bằng chứng "integration qua queue" bị ghi quá mức** — `AC-BOK-07-2/07-4` yêu cầu test qua
    hàng đợi thật nhưng gọi thẳng `handlePaymentCompleted`, nên chính lỗi #5 (outbox replay) không
    bị bắt bởi bộ test ban đầu. Đã thêm test replay/race THẬT vào `g4Saga.test.ts` (double-pay đồng
    thời, ví platform đồng thời) sau khi sửa.
12. **`AC-FIN-01-2` chưa thật sự pass** — ví business chỉ được tạo lazy khi có doanh thu đầu tiên,
    provider chưa có booking sẽ không thấy ví. Gắn với câu hỏi `ProviderApproved` treo từ G2.
13. **Refund preview bỏ qua `policySnapshot`** (vi phạm BR-BOK-06) — tính theo hằng chính sách hiện
    hành thay vì snapshot của chính booking. Sửa: `getRefundPercentageFromSnapshot()` đọc từ
    `booking.policySnapshot`.

**Câu hỏi treo từ G2 — ĐÃ ĐÓNG:** Codex chỉ ra #12 gắn trực tiếp với `ProviderApproved` (treo từ
G2). PO quyết ngay (D25): venue-booking-service phát `ProviderApproved{providerId, userId}` khi
duyệt NCC (trong cùng transaction với đổi status) → finance-service tạo ví `business` rỗng,
account-service cộng vai `provider`. **`AC-VEN-02-1`/`AC-VEN-02-4` đóng dứt điểm** — không còn
`blocked`, không còn treo. account-service có consumer RabbitMQ ĐẦU TIÊN (trước G4 chỉ publish).

**Bằng chứng sau vòng sửa:** build+typecheck sạch 9 workspace; account-service 35 pass/2 skip
(`AC-ACC-08-3/08-4`, đã đóng thật ở G2/G3 tại venue-booking-service — không liên quan G4); venue-
booking-service 87/87 pass (0 skip — hai bài `AC-VEN-02-1/02-4` đã gỡ block); finance-service 29/29
pass (thêm test double-pay đồng thời, overpay, ví platform đồng thời, webhook không có/sai chữ ký,
ProviderApproved qua queue thật).

_(Milestone kế: G5 — Hủy, hoàn tiền và điều chỉnh (24 AC) song song G6 — Doanh thu, đối soát, tranh
chấp (26 AC), theo đồ thị phụ thuộc của master goal. G4 đã commit tại `a94701d`.)_

### G5 — 2026-08-06 — ✅ self-verify OK + D22 review sạch (24/24 pass)

**Phạm vi:** BOK-09, BOK-10, FIN-07, FIN-08. Người chơi tự hủy theo đúng
`policySnapshot` ở ba bậc 100/50/0; phía sân đổi sân con cùng cơ sở hoặc hủy có
lý do và hoàn 100%. `BookingCancelled` đi qua Outbox; finance consumer idempotent
đảo đủ ba vế bằng bút toán append-only.

**Bổ sung schema có phê duyệt PO:** `Booking.courtChangedAt` nullable là dấu tối
thiểu để AC-BOK-10-6 hiển thị ghi chú đổi sân. Không lưu lịch sử sân cũ và không
mở rộng chính sách D12.

**UI:** `BookingPage` có khu vực booking của người chơi (tải danh sách, xem mức
hoàn và hủy) cùng khu vực provider tìm sân thay thế, đổi sân con hoặc hủy kèm lý
do. API client mặc định gọi same-origin `/api/venue`, có proxy cho Vite dev/preview;
triển khai khác origin dùng `VITE_VENUE_BOOKING_URL` cùng allowlist `WEB_ORIGIN`.

**Bằng chứng self-verify sau remediation D22:** venue-booking-service 104/104 pass;
finance-service 41/41 pass sạch (gồm saga RabbitMQ thật); test UI G5 1/1 pass;
root typecheck 9 workspace, root production build, migration deploy và
`git diff --check` đều exit 0. Test tài chính đọc trực tiếp
`LEDGER_ENTRY`/delta ví platform và chứng minh tổng ba vế riêng booking luôn bằng
200.000 ở cả ba mức hoàn; replay kể cả event ID mới không sinh entry mới; payload
không khớp payment/release/commission bị từ chối và bút toán G4 còn nguyên.

**D22:** reviewer Codex độc lập xác nhận không còn P0/P1/P2 sau hai vòng
remediation. Residual không chặn: test UI hiện ở mức component/SSR; tương tác
browser thật được giữ trong tám hành trình Playwright của gate cuối phase.

### G6 — 2026-08-06 — ✅ self-verify OK + D22 không còn P0/P1 (26/26 pass)

**Phạm vi:** FIN-09-4…6, FIN-10, FIN-11 và FIN-14. Doanh thu marketplace được
ghi theo từng booking, tự chuyển `pending → available` sau 24 giờ và chỉ hoãn
booking có tranh chấp mở. Rút tiền giữ tài sản trong phân vùng `reserved`, xử lý
webhook tiền ra idempotent, hỗ trợ từ chối/hủy/chi thiếu/chi vượt, và bắt buộc
audit lý do cho thao tác Admin.

**Đối soát và bảo toàn:** mỗi `SEPAY_EVENT` có allocation đủ tổng tiền; đối ứng
topup/payout trỏ tới `LedgerEntry.id` thật và bị ràng buộc không được dùng cho
hai sự kiện. Kiểm thử hệ thống phủ nạp tiền, thanh toán số dư, thanh toán trực
tiếp SePay, hoàn một phần, release và payout; phần dispute của AC-FIN-14-8 được
handoff giao mở rộng tại G7 cùng FIN-12/FIN-13.

**UI/API:** provider xem/lọc doanh thu, ba phân vùng ví, tạo/hủy yêu cầu rút và
thông tin ngân hàng; Admin xử lý withdrawal và queue đối soát. API kiểm vai
provider/Admin ở server; người chơi không có ví business không thấy panel này.

**Điều kiện migration đã ghi nhận theo D22:** migration G6 chỉ áp dụng cho schema
Phase 1 clean/pre-production, phù hợp gate migrate CSDL rỗng của Gboot; không
backfill fixture G4 cục bộ. Trước mọi môi trường có dữ liệu cần giữ, phải có
rehydration/backfill riêng cho metadata doanh thu booking và đối ứng SePay cũ.

**Bằng chứng fresh gate:** finance-service 10 file, 68/68 test pass; web 2 file,
3/3 test pass; venue-booking-service 17 file, 104/104 pass trên schema sạch;
Prisma validate + migrate deploy, root typecheck 9 workspace và root production
build đều exit 0. D22 round 2 xác nhận không còn P0/P1; hai residual UX P2 được
sửa trước gate cuối (`FinancePanel` ẩn khi không có ví business và reload ngay
sau khi tạo withdrawal).

### G7 — 2026-08-06 — ✅ self-verify OK + D22 không còn P0/P1 (14/14 pass)

**Phạm vi:** FIN-12 và FIN-13. Người chơi chỉ thấy/gửi tranh chấp cho booking
của mình đã kết thúc nhưng chưa hết 24 giờ; booking đã hủy, kể cả mức hoàn 0%,
không được tranh chấp để hoàn lần hai. `createDispute` và scheduler dùng chung
advisory lock theo booking, nên race đúng mốc 24 giờ chỉ có một kết quả thắng.

**Quyết định Admin:** hàng đợi hiển thị lý do, bằng chứng, gross/net/commission
và lịch sử ledger liên quan. Ba quyết định full refund, partial refund hoặc reject
đều bắt buộc lý do, ghi audit; hai nhánh hoàn đảo ba vế bằng entry append-only,
còn phần doanh thu ròng sau quyết định chuyển sang available. Form amount/reason
được tách riêng từng dispute để tránh dùng nhầm dữ liệu cũ giữa các hồ sơ.

**Bảo toàn cuối gói chạm tiền:** test race chạy 20 lần. Test AC-FIN-14-8 hoàn
chỉnh phủ nạp, thanh toán bằng balance, thanh toán trực tiếp SePay, hủy hoàn 50%,
tranh chấp hoàn một phần, release và payout; đo delta tổng tài sản của **mọi ví**
trong DB, giữ nguyên số sự kiện unmatched toàn hệ thống, và kiểm allocation đủ
từng sự kiện. Full/partial/rejected đều có proof BR-FIN-15 riêng.

**Điều kiện migration:** `cancelledAt` áp dụng cho schema Phase 1
clean/pre-production. Môi trường giữ dữ liệu phải backfill các hủy G5 cũ từ lịch
sử event venue-booking trước khi deploy; riêng hủy 0% không thể suy ra chỉ từ
ledger refund.

**Bằng chứng fresh gate:** finance-service 12 file, 79/79 test pass tuần tự;
web 3 file, 5/5 test pass; Prisma validate + 7 migration deploy; root typecheck
9 workspace, root production build và `git diff --check` đều exit 0. Reviewer
D22 độc lập xác nhận không còn P0/P1; residual migration đã được ghi caveat và
residual UI shared input đã được sửa trước commit.

## 4. Self-verification cuối mỗi milestone

### Gate cuối Phase 1 — 2026-08-06 — ✅ implemented, chờ PO nghiệm thu

- Ledger có đúng 198 dòng AC và 198/198 ở trạng thái `pass`; không còn
  `todo`, `blocked` hoặc `fail`.
- `npm test --workspaces --if-present` xanh trên schema venue sạch riêng:
  account 35 pass/2 skip, finance 79/79, venue 104/104 và web 5/5.
- `npm run e2e` xanh 8/8 hành trình Chromium; mỗi hành trình sinh trace tại
  `output/playwright/test-results/` (artifact runtime không commit).
- `npm run typecheck`, `npm run build`, Prisma validate cho 5 schema,
  Prisma migrate deploy hiện hành và `git diff --check` đều exit 0.
- Gate finance bao gồm kiểm tra trực tiếp `LEDGER_ENTRY`, conservation toàn hệ
  thống, refund/reversal, payout, reconciliation, idempotency và race boundary.

Schema venue cục bộ lâu ngày có nhiều fixture không được dọn nên 5 test search
chạm timeout 15 giây; cùng suite xanh 104/104 trong 12,56 giây trên schema sạch
`venue_gate_20260806_repository`. Không xóa hay thay đổi dữ liệu schema hiện hành.

## 5. PO nghiệm thu (chỉ cuối phase hoặc khi escalation)

Implementation gate đã đủ 198/198 AC và 8/8 E2E. Phần này vẫn để PO ký nhận;
Codex không tự ghi nhận nghiệm thu hoặc merge vào `main`.

## 6. Playwright E2E phase-level (8 hành trình)

| # | Hành trình | Chạm gói | Spec file | Status | Trace/evidence |
|---|---|---|---|---|---|
| 1 | Đăng ký → xác minh → đăng nhập → cập nhật hồ sơ | G1 | e2e/phase-1.spec.ts | pass | Playwright HT1; trace sinh tại `output/playwright/test-results/` khi chạy `npm run e2e` |
| 2 | Đăng ký NCC → Admin duyệt → cấu hình sân/lịch/giá | G1,G2 | e2e/phase-1.spec.ts | pass | Playwright HT2; trace sinh tại `output/playwright/test-results/` khi chạy `npm run e2e` |
| 3 | Tìm sân → giữ slot → thanh toán → booking confirmed | G3,G4 | e2e/phase-1.spec.ts | pass | Playwright HT3; trace sinh tại `output/playwright/test-results/` khi chạy `npm run e2e` |
| 4 | Tự hủy và hoàn tiền theo bậc | G5 | e2e/phase-1.spec.ts | pass | Playwright HT4; trace sinh tại `output/playwright/test-results/` khi chạy `npm run e2e` |
| 5 | Phía sân hủy và hoàn 100% | G5 | e2e/phase-1.spec.ts | pass | Playwright HT5; trace sinh tại `output/playwright/test-results/` khi chạy `npm run e2e` |
| 6 | Doanh thu pending → available → rút tiền | G6 | e2e/phase-1.spec.ts | pass | Playwright HT6; trace sinh tại `output/playwright/test-results/` khi chạy `npm run e2e` |
| 7 | Tranh chấp trong 24 giờ → Admin xử lý | G7 | e2e/phase-1.spec.ts | pass | Playwright HT7; trace sinh tại `output/playwright/test-results/` khi chạy `npm run e2e` |
| 8 | Đối soát giao dịch chưa khớp | G6 | e2e/phase-1.spec.ts | pass | Playwright HT8; trace sinh tại `output/playwright/test-results/` khi chạy `npm run e2e` |
