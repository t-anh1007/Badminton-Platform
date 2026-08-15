# PLAN_FIX-P1 — Sửa để hoàn tất nghiệm thu Giai đoạn 1

Nguồn: kết quả review độc lập GĐ1 (branch `TuanAnh` @ `4e2d5ef`), findings đầy đủ tại
[`output/review-phase-1/findings.md`](output/review-phase-1/findings.md).

Mục tiêu: đưa GĐ1 từ "chưa đạt nghiệm thu vô điều kiện" → "đạt", bằng cách xử lý 5 finding.
Executor dự kiến: **Codex** (theo D21 thực tế G5–G7). Áp quy trình Codex-review mỗi milestone
(model 5.6 Sol, Effort High, Speed Standard) trước khi commit từng mốc R.

## Findings cần xử lý (đã PO chốt: sửa toàn bộ)

| ID | Sev | Tóm tắt | Milestone |
|---|---|---|---|
| F1 | P1 | 2 khu vực UI (BookingPage tìm/hold/pay, AdminPage duyệt NCC) + 2 card ProfilePage (ví, lịch sử) còn mock | R2, R3, R4 |
| F4 | P1 | API `/profile/me` rò rỉ `passwordHash` (bcrypt) cho client | R1 |
| F3 | P2 | Race latent khi tạo ví `platform` lần đầu (tự phục hồi, không mất tiền) | R1 |
| F5 | P2 | Thiếu route-guard client cho `/admin` (backend vẫn chặn đúng 403) | R3 |
| F2 | P3 | Lệch tài liệu: goal D21 "không Codex" vs progress ghi Codex làm G5–G7 | R5 |

## Ràng buộc chung (mọi milestone phải giữ)

- KHÔNG đổi lược đồ Prisma đã chốt ở G0; nếu thấy thiếu schema → dừng, báo PO (Pause rule goal).
- Giữ ranh giới schema-per-service (D17/ADR-0004): không FK/query xuyên schema, giao tiếp qua API/event.
- Mọi luồng tiền giữ **bảo toàn ba vế** + ledger **append-only** (không sửa/xoá bút toán gốc).
- Frontend bám DESIGN.md: không WebGL/3D/animation nặng; dùng lại api client + component sẵn có.
- Thay đổi tối thiểu, đúng phạm vi; không dọn dẹp ngoài phạm vi.
- Sau mỗi R: chạy test liên quan + `npm run typecheck` + `npm run build` sạch trước khi commit.

## Grounding đã xác minh trong review (đỡ cho Codex khỏi dò lại)

- Endpoint backend cho luồng đặt sân **đã tồn tại hết**: `GET /search` (discovery.ts),
  `POST /courts/:id/select-slot`, `POST /holds` (discovery.ts:77), `POST /bookings` (bookings.ts:23),
  `POST /bookings/:id/pay/balance` (finance). → R2 chỉ cần client wrapper + wiring, KHÔNG cần backend mới.
- `financeApi.getMyWallets()` **đã có sẵn** → R4 card ví sửa rất nhẹ.
- `venue-booking-service/src/domain/booking.ts:listMyBookings` **đã trả cả `upcoming` lẫn `past`**,
  nhưng route `/players/me/bookings` (bookings.ts:61) chỉ serialize `upcoming` → R4 chỉnh nhỏ ở route.
- `providers.ts` **chỉ có** POST `/`, `/:id/approve`, `/:id/reject` — **KHÔNG có GET list**.
  → R3 là mục DUY NHẤT cần thêm endpoint backend mới (list providers cho admin).

---

## R1 — Bảo mật + race tiền (backend) `[F4, F3]`

**Scope**
- F4: `account-service/src/domain/profile.ts` `getOwnProfile` — thêm `select` tường minh loại
  `passwordHash` (và field nhạy cảm khác), hoặc map sang DTO trước khi trả. Audit thêm
  `routes/adminAccounts.ts` + mọi handler trả object `user` thô xem có rò rỉ tương tự.
- F3: `finance-service` — seed ví `platform` (singleton) một lần lúc bootstrap app, HOẶC bọc
  `getOrCreateWallet` (`src/domain/wallet.ts:7-15`) bắt P2002 rồi `findFirst` lại.

**Acceptance / evidence**
- Test mới: response profile KHÔNG chứa `passwordHash`.
- Test regression F3: gửi đồng thời ≥2 `BookingConfirmed` trên schema SẠCH (chưa có ví platform)
  không throw P2002; ví platform cuối cùng đúng 1 hàng.
- `vitest run` account + finance pass **ở chế độ song song file mặc định** (không cần
  `--no-file-parallelism` — đây là bằng chứng F3 đã hết).
- `typecheck` + `build` sạch.

**Ngoài phạm vi**: không đổi cơ chế auth/JWT; không thêm field mới vào schema.

---

## R2 — BookingPage: nối luồng đặt sân thật `[F1c]`

**Scope**
- Thêm client method:
  - `venueBookingApi.ts`: `searchVenues(params)`, `selectSlot(courtId, body)`, `createHold(body)`,
    `createBooking(holdId)`.
  - `financeApi.ts`: `payBookingBalance(bookingId)` (+ tuỳ chọn tạo SePay intent nếu làm luôn).
- `apps/web/src/pages/BookingPage.tsx`:
  - Thay `MOCK_COURTS` bằng dữ liệu search/availability thật.
  - `HoldCountdown` đếm ngược theo `expiresAt` THẬT của hold (bỏ hardcode "09:47").
  - Nút bước 1→2→3 thực sự tạo hold → booking → gọi thanh toán số dư; bỏ chữ "(mock)".

**Acceptance / evidence**
- **Cập nhật E2E HT3** trong `e2e/phase-1.spec.ts`: thao tác tìm→chọn slot→hold→pay QUA UI thật
  (thay `request.post` trực tiếp), assert booking `confirmed`. Playwright HT3 pass qua UI.
- `typecheck` + `build` sạch.

**Ngoài phạm vi**: không dựng lại design baseline; giữ nguyên tokens/layout Gdesign.

---

## R3 — AdminPage duyệt NCC + route-guard `[F1d, F5]`

**Scope**
- Backend mới (mục duy nhất cần endpoint mới): thêm `GET /providers` (hoặc `/admin/providers`)
  trong `venue-booking-service`, `requireRole('admin')`, lọc theo status (`pending`/all); domain
  `listProviders`.
- Client method + `apps/web/src/pages/AdminPage.tsx` tab "Duyệt NCC": thay `MOCK_ADMIN_PROVIDERS`
  bằng list thật; nút Duyệt/Từ chối gọi `/:id/approve` + `/:id/reject` (đã có).
- F5: role-guard client cho route `/admin` (redirect nếu thiếu role admin, đọc roles từ JWT ở
  `apps/web/src/App.tsx`); ẩn link "Quản trị" trong `MenuOverlay.tsx` theo role.

**Acceptance / evidence**
- **Cập nhật E2E HT2**: duyệt NCC qua UI admin thật (thay `request.post`); assert provider
  `approved`. Thêm assert: user role `player` truy cập `/admin` bị redirect (không thấy khung admin).
- Playwright HT2 pass qua UI; `typecheck` + `build` sạch.

**Ngoài phạm vi**: KHÔNG bỏ kiểm quyền phía server (đó là lớp bảo vệ thật, giữ nguyên); F5 chỉ là
lớp bổ sung phía client.

---

## R4 — ProfilePage: ví + lịch sử thật `[F1a, F1b]`

**Scope**
- F1a: card "Ví cá nhân/kinh doanh" dùng `financeApi.getMyWallets()` (đã có) thay số hardcode.
- F1b: route `/players/me/bookings` (bookings.ts:61) trả thêm `past`; client
  `getMyBookingHistory`; `ProfilePage.tsx` render lịch sử thật thay `MOCK_BOOKING_HISTORY`.
- Xoá `apps/web/src/data/mock.ts` sau khi không còn import.

**Acceptance / evidence**
- Số dư ví hiển thị khớp ledger thật; lịch sử khớp booking thật.
- `grep -rn "MOCK_" apps/web/src` = rỗng.
- `typecheck` + `build` sạch.

---

## R5 — Đồng bộ tài liệu nghiệm thu `[F2]`

**Scope**
- Sửa lệch executor: `docs/product/phase-1-goal.md` (D21 "không Codex") vs
  `docs/product/phase-1-progress.md` (G5–G7 Codex) — chốt mô tả đúng thực tế đã xảy ra.
- Cập nhật `phase-1-progress.md`: ghi evidence UI thật cho các AC frontend sau khi R2–R4 xong; ghi
  đợt remediation R1–R5 + kết quả test/E2E.

**Acceptance / evidence**
- Không còn mâu thuẫn thẩm quyền trong tài liệu; ledger phản ánh trạng thái sau sửa.

---

## Thứ tự thực thi & cổng cuối

```
R1 ─> (R2 ∥ R3 ∥ R4)  ─> R5
```
- R1 trước (nền tảng bảo mật + tiền). R2/R3/R4 độc lập, làm song song được. R5 cuối.
- **Cổng cuối phase**: chạy lại toàn bộ test (account/venue-booking/finance) + `typecheck` + `build`
  + 8 Playwright E2E (đã cập nhật HT2/HT3 qua UI) — tất cả xanh → báo PO nghiệm thu.

## Hạ tầng review đang còn (quyết định: GIỮ để phục vụ đợt sửa này)

- Docker infra (`npm run infra:up`): postgres/redis/rabbitmq đang chạy — cần cho test/E2E R1–R5.
- 5 schema review + role: `review_phase1_{account,venue_booking,finance,matchmaking,community}` +
  role `<svc>_svc_review` (password `review_pw`). Dùng để chạy test cô lập, không đụng schema dev.
- **Reset một schema về trạng thái sạch** (cần cho regression F3):
  `DROP SCHEMA review_phase1_finance CASCADE; CREATE SCHEMA review_phase1_finance AUTHORIZATION finance_svc_review;`
  rồi `prisma migrate deploy` với `FINANCE_DATABASE_URL=...schema=review_phase1_finance`.
- **Dọn sạch sau khi nghiệm thu xong** (chạy khi không cần nữa):
  `DROP SCHEMA review_phase1_* CASCADE` cho 5 schema + `DROP ROLE <svc>_svc_review` cho 5 role;
  `npm run infra:down` nếu muốn tắt Docker.

## Lưu ý khi giao Codex

- Grill goal trước khi dispatch (mỗi R là một goal có scope/acceptance/evidence/ngoài-phạm-vi rõ).
- Sau mỗi R: 1 vòng Codex review trước commit; commit riêng từng R (không gộp).
- Không tự đổi `r` (hoa hồng 10%), không tạo vai trò ngoài player/provider/admin, không đảo bút
  toán payout (BR-FIN-19) — nếu chạm phải các ranh giới này thì dừng, báo PO.
