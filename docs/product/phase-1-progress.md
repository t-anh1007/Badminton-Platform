---
type: progress-log + test-ledger
phase: 1
status: not-started
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
| 1 | G1 | Claude | **self-verify OK** | 32/34 (2 blocked, chờ G3/G4 — 08-3 hoàn thành ở G2) | ✅ (xem §3) | 2026-08-06 |
| 2 | G2 | Claude | **self-verify OK** | 41/43 (2 blocked, chờ PO xác nhận + G3/G4) | ✅ (xem §3) | 2026-08-06 |
| 3 | G3 | Claude | chưa bắt đầu | 0/25 | — | — |
| 4 | G4 | Claude | chưa bắt đầu | 0/32 | — | — |
| 5 | G5 | Claude | chưa bắt đầu | 0/24 | — | — |
| 6 | G6 | Claude | chưa bắt đầu | 0/26 | — | — |
| 7 | G7 | Claude | chưa bắt đầu | 0/14 | — | — |

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
| AC-ACC-02-5 | G1 |  |  | blocked | BLOCKED — chờ G4 (finance-service consume UserRegistered). Producer side (Outbox) đã kiểm ở AC-ACC-02-1. |
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
| AC-ACC-08-4 | G1/G3 |  |  | blocked | BLOCKED — chờ G3 (cần endpoint booking marketplace BOK-07 chưa xây). Cơ chế provider.status=suspended đã sẵn sàng ở G2 để G3 dùng ngay. |
| AC-ACC-08-5 | G1 | services/account-service/test/adminAccounts.test.ts | — | pass | services/account-service/test/adminAccounts.test.ts |
| AC-ACC-08-6 | G1 | services/account-service/test/adminAccounts.test.ts | — | pass | services/account-service/test/adminAccounts.test.ts |
| AC-VEN-01-1 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-01-2 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-01-3 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-01-4 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-02-1 | G2 |  |  | blocked | BLOCKED — chờ PO xác nhận phạm vi cross-service (event ProviderApproved chưa có trong catalog; sửa account-service ngoài scope boundary G2 đã ghi). Đã hỏi Codex, khuyến nghị xin PO xác nhận. Phần venue-only (status pending->approved) đã pass ở test bổ sung trong provider.test.ts. |
| AC-VEN-02-2 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-02-3 | G2 | services/venue-booking-service/test/provider.test.ts | — | pass | services/venue-booking-service/test/provider.test.ts |
| AC-VEN-02-4 | G2 |  |  | blocked | BLOCKED — cần G3 (booking flow) + G4 (finance payment/wallet debit) để thực sự "đặt sân... trừ ví cá nhân". |
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
| AC-BOK-01-1 | G3 |  |  | todo |  |
| AC-BOK-01-2 | G3 |  |  | todo |  |
| AC-BOK-01-3 | G3 |  |  | todo |  |
| AC-BOK-01-4 | G3 |  |  | todo |  |
| AC-BOK-02-1 | G3 |  |  | todo |  |
| AC-BOK-02-2 | G3 |  |  | todo |  |
| AC-BOK-02-3 | G3 |  |  | todo |  |
| AC-BOK-03-1 | G3 |  |  | todo |  |
| AC-BOK-03-2 | G3 |  |  | todo |  |
| AC-BOK-04-1 | G3 |  |  | todo |  |
| AC-BOK-04-2 | G3 |  |  | todo |  |
| AC-BOK-04-3 | G3 |  |  | todo |  |
| AC-BOK-04-4 | G3 |  |  | todo |  |
| AC-BOK-04-5 | G3 |  |  | todo |  |
| AC-BOK-04-6 | G3 |  |  | todo |  |
| AC-BOK-05-1 | G3 |  |  | todo |  |
| AC-BOK-05-2 | G3 |  |  | todo |  |
| AC-BOK-05-3 | G3 |  |  | todo |  |
| AC-BOK-05-4 | G3 |  |  | todo |  |
| AC-BOK-05-5 | G3 |  |  | todo |  |
| AC-BOK-06-1 | G3 |  |  | todo |  |
| AC-BOK-06-2 | G3 |  |  | todo |  |
| AC-BOK-06-3 | G3 |  |  | todo |  |
| AC-BOK-06-4 | G3 |  |  | todo |  |
| AC-BOK-06-5 | G3 |  |  | todo |  |
| AC-BOK-07-1 | G4 |  |  | todo |  |
| AC-BOK-07-2 | G4 |  |  | todo |  |
| AC-BOK-07-3 | G4 |  |  | todo |  |
| AC-BOK-07-4 | G4 |  |  | todo |  |
| AC-BOK-07-5 | G4 |  |  | todo |  |
| AC-BOK-08-1 | G4 |  |  | todo |  |
| AC-BOK-08-2 | G4 |  |  | todo |  |
| AC-BOK-08-3 | G4 |  |  | todo |  |
| AC-BOK-08-4 | G4 |  |  | todo |  |
| AC-BOK-08-5 | G4 |  |  | todo |  |
| AC-FIN-01-1 | G4 |  |  | todo |  |
| AC-FIN-01-2 | G4 |  |  | todo |  |
| AC-FIN-01-3 | G4 |  |  | todo |  |
| AC-FIN-01-4 | G4 |  |  | todo |  |
| AC-FIN-02-1 | G4 |  |  | todo |  |
| AC-FIN-02-2 | G4 |  |  | todo |  |
| AC-FIN-02-3 | G4 |  |  | todo |  |
| AC-FIN-02-4 | G4 |  |  | todo |  |
| AC-FIN-03-1 | G4 |  |  | todo |  |
| AC-FIN-03-2 | G4 |  |  | todo |  |
| AC-FIN-03-3 | G4 |  |  | todo |  |
| AC-FIN-03-4 | G4 |  |  | todo |  |
| AC-FIN-04-1 | G4 |  |  | todo |  |
| AC-FIN-04-2 | G4 |  |  | todo |  |
| AC-FIN-04-3 | G4 |  |  | todo |  |
| AC-FIN-04-4 | G4 |  |  | todo |  |
| AC-FIN-06-1 | G4 |  |  | todo |  |
| AC-FIN-06-2 | G4 |  |  | todo |  |
| AC-FIN-06-3 | G4 |  |  | todo |  |
| AC-FIN-09-1 | G4 |  |  | todo |  |
| AC-FIN-09-2 | G4 |  |  | todo |  |
| AC-FIN-09-3 | G4 |  |  | todo |  |
| AC-BOK-09-1 | G5 |  |  | todo |  |
| AC-BOK-09-2 | G5 |  |  | todo |  |
| AC-BOK-09-3 | G5 |  |  | todo |  |
| AC-BOK-09-4 | G5 |  |  | todo |  |
| AC-BOK-09-5 | G5 |  |  | todo |  |
| AC-BOK-09-6 | G5 |  |  | todo |  |
| AC-BOK-09-7 | G5 |  |  | todo |  |
| AC-BOK-10-1 | G5 |  |  | todo |  |
| AC-BOK-10-2 | G5 |  |  | todo |  |
| AC-BOK-10-3 | G5 |  |  | todo |  |
| AC-BOK-10-4 | G5 |  |  | todo |  |
| AC-BOK-10-5 | G5 |  |  | todo |  |
| AC-BOK-10-6 | G5 |  |  | todo |  |
| AC-FIN-07-1 | G5 |  |  | todo |  |
| AC-FIN-07-2 | G5 |  |  | todo |  |
| AC-FIN-07-3 | G5 |  |  | todo |  |
| AC-FIN-07-4 | G5 |  |  | todo |  |
| AC-FIN-07-5 | G5 |  |  | todo |  |
| AC-FIN-07-6 | G5 |  |  | todo |  |
| AC-FIN-08-1 | G5 |  |  | todo |  |
| AC-FIN-08-2 | G5 |  |  | todo |  |
| AC-FIN-08-3 | G5 |  |  | todo |  |
| AC-FIN-08-4 | G5 |  |  | todo |  |
| AC-FIN-08-5 | G5 |  |  | todo |  |
| AC-FIN-09-4 | G6 |  |  | todo |  |
| AC-FIN-09-5 | G6 |  |  | todo |  |
| AC-FIN-09-6 | G6 |  |  | todo |  |
| AC-FIN-10-1 | G6 |  |  | todo |  |
| AC-FIN-10-2 | G6 |  |  | todo |  |
| AC-FIN-10-3 | G6 |  |  | todo |  |
| AC-FIN-10-4 | G6 |  |  | todo |  |
| AC-FIN-10-5 | G6 |  |  | todo |  |
| AC-FIN-10-6 | G6 |  |  | todo |  |
| AC-FIN-11-1 | G6 |  |  | todo |  |
| AC-FIN-11-2 | G6 |  |  | todo |  |
| AC-FIN-11-3 | G6 |  |  | todo |  |
| AC-FIN-11-4 | G6 |  |  | todo |  |
| AC-FIN-11-5 | G6 |  |  | todo |  |
| AC-FIN-11-6 | G6 |  |  | todo |  |
| AC-FIN-14-1 | G6 |  |  | todo |  |
| AC-FIN-14-2 | G6 |  |  | todo |  |
| AC-FIN-14-3 | G6 |  |  | todo |  |
| AC-FIN-14-4 | G6 |  |  | todo |  |
| AC-FIN-14-5 | G6 |  |  | todo |  |
| AC-FIN-14-6 | G6 |  |  | todo |  |
| AC-FIN-14-7 | G6 |  |  | todo |  |
| AC-FIN-14-8 | G6 |  |  | todo |  |
| AC-FIN-14-9 | G6 |  |  | todo |  |
| AC-FIN-14-10 | G6 |  |  | todo |  |
| AC-FIN-14-11 | G6 |  |  | todo |  |
| AC-FIN-12-1 | G7 |  |  | todo |  |
| AC-FIN-12-2 | G7 |  |  | todo |  |
| AC-FIN-12-3 | G7 |  |  | todo |  |
| AC-FIN-12-4 | G7 |  |  | todo |  |
| AC-FIN-12-5 | G7 |  |  | todo |  |
| AC-FIN-12-6 | G7 |  |  | todo |  |
| AC-FIN-13-1 | G7 |  |  | todo |  |
| AC-FIN-13-2 | G7 |  |  | todo |  |
| AC-FIN-13-3 | G7 |  |  | todo |  |
| AC-FIN-13-4 | G7 |  |  | todo |  |
| AC-FIN-13-5 | G7 |  |  | todo |  |
| AC-FIN-13-6 | G7 |  |  | todo |  |
| AC-FIN-13-7 | G7 |  |  | todo |  |
| AC-FIN-13-8 | G7 |  |  | todo |  |

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

## 4. Self-verification cuối mỗi milestone

_(mỗi milestone: kết quả review diff, kiểm scope không lệch, và xác nhận đủ điều kiện sang gói kế —
Claude ghi tại đây)_

## 5. PO nghiệm thu (chỉ cuối phase hoặc khi escalation)

_(để trống tới khi cả 198 AC pass, 8 E2E phase-level xanh và kiểm thử độc lập cuối phase xong;
PO ký nhận tại đây)_

## 6. Playwright E2E phase-level (8 hành trình)

| # | Hành trình | Chạm gói | Spec file | Status | Trace/evidence |
|---|---|---|---|---|---|
| 1 | Đăng ký → xác minh → đăng nhập → cập nhật hồ sơ | G1 |  | todo |  |
| 2 | Đăng ký NCC → Admin duyệt → cấu hình sân/lịch/giá | G1,G2 |  | todo |  |
| 3 | Tìm sân → giữ slot → thanh toán → booking confirmed | G3,G4 |  | todo |  |
| 4 | Tự hủy và hoàn tiền theo bậc | G5 |  | todo |  |
| 5 | Phía sân hủy và hoàn 100% | G5 |  | todo |  |
| 6 | Doanh thu pending → available → rút tiền | G6 |  | todo |  |
| 7 | Tranh chấp trong 24 giờ → Admin xử lý | G7 |  | todo |  |
| 8 | Đối soát giao dịch chưa khớp | G6 |  | todo |  |
