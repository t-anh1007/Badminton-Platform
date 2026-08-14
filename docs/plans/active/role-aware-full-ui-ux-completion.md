# Role-Aware Full UI/UX Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện UI/UX có phân biệt vai trò cho toàn bộ năng lực backend hiện có, sửa các lỗi PO ghi nhận và bổ sung đúng các seam backend tối thiểu đã được duyệt.

**Architecture:** Triển khai theo lát cắt nghiệp vụ dọc, mỗi lát cắt đi từ policy/spec đến domain/API, React UI và bằng chứng tự động. Giữ sáu service hiện có, giao tiếp qua API/event, dùng session context tập trung ở web và giữ COURTIN Figma làm visual authority.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Vite 8, Tailwind CSS 4, Express 4, Zod, Prisma 5/PostgreSQL, RabbitMQ/outbox, Socket.IO 4, Vitest, Testing Library, S3-compatible object storage và browser acceptance thủ công.

**Spec:** `docs/superpowers/specs/2026-08-14-role-aware-full-ui-ux-design.md`

## Global Constraints

- Visual authority là Figma COURTIN `FHuhhmlhPSl8gOUuUx7az2`; không thay bằng Playo/ACTL hay bố cục trang trí từ mockup lịch sử.
- Chỉ dùng ba role `player`, `provider`, `admin`; đổi context không cấp quyền và backend luôn kiểm tra authorization.
- Giữ sáu backend service hiện có; không query hoặc tạo FK xuyên schema.
- Ledger là append-only, bảo toàn giá trị; UI không rút gọn payment, refund, withdrawal, dispute hoặc settlement.
- AI chỉ gợi ý/giải thích từ F-02 deterministic; không tự JOIN hoặc thực hiện hành động nhạy cảm.
- Ngày hiển thị theo `dd/MM/yyyy`; timestamp truyền API bằng ISO 8601 và render theo formatter Việt Nam tập trung.
- Không hiển thị UUID, enum kỹ thuật hoặc tên ledger thô cho end user.
- Community lưu tối đa 4 ảnh cho mỗi bài; Community và Venue sở hữu namespace upload riêng trên object storage.
- Sau mỗi task chỉ chạy test tập trung nhỏ nhất liên quan; không chạy full suite, Playwright hoặc visual regression lặp lại.
- Lint/typecheck/build và `ui:coverage` chạy một lần ở checkpoint kỹ thuật trước browser acceptance, không lặp lại sau mỗi task.
- Lần kiểm chứng cuối chỉ dùng browser thật; không chạy E2E Playwright hoặc test script tổng hợp.
- Mọi route nghiệp vụ public/authenticated đã build phải có FE trực tiếp; route internal, webhook và event phải có trạng thái quan sát được trong FE của luồng sở hữu và bằng chứng focused-test hoặc browser.
- Không được đánh dấu hoàn thành nếu capability manifest còn endpoint/event chưa phân loại hoặc chưa có `surfaceId` và `evidenceId` hợp lệ.
- Không push, không merge `main`, không xóa dữ liệu và không stage file ngoài task nếu chưa có yêu cầu PO.

---

Date: 2026-08-14

## Status

Active — design đã được PO duyệt, implementation đang được điều phối theo hai worker.

## Outcome

- Người chơi có luồng đặt nhiều slot, thanh toán, xác nhận, hủy/hoàn, tìm kèo realtime, AI chat, hồ sơ trình độ, community media và support hoàn chỉnh.
- Chủ sân có onboarding và workspace `/manage/*` cho sân, lịch, giá, booking, sự cố, doanh thu và rút tiền.
- Admin có homepage `/admin` và các hàng chờ vận hành cho tài khoản, provider, booking, tài chính, tranh chấp, kiểm duyệt, đánh giá và ticket.
- Shell, homepage, navigation và role badge khác nhau rõ ràng theo context đã chọn.

## Context

- Product authority: `docs/product/phasing.md`, `docs/product/decision-log.md`, `docs/product/specs/*.md`.
- Approved design: `docs/superpowers/specs/2026-08-14-role-aware-full-ui-ux-design.md`.
- Visual tracking: `docs/plans/active/figma-full-screen-coverage.md`.
- Frontend: `apps/web/src/`.
- Services: `services/account-service`, `services/venue-booking-service`, `services/finance-service`, `services/matchmaking-service`, `services/community-service`.

## Scope

In scope:

- Toàn bộ 18 quyết định PO trong design spec và presentation/accessibility states dùng chung.
- Migration Community image metadata và Finance ledger presentation metadata dạng nullable/backward-compatible.
- Account session refresh, provider self-status/manage DTO, admin list/search DTO, match source DTO và quick-match progress event.
- Object storage S3-compatible với MinIO local và presigned upload.
- Capability manifest kiểm tra tự động không bỏ sót route/event backend hiện có hoặc được bổ sung trong lúc triển khai.

Out of scope:

- Role mới, service mới, cross-schema query/FK, tự động hóa AI hành động, F-05 heatmap.
- Thay đổi tỷ lệ tài chính, cửa sổ hoàn tiền, settlement, withdrawal hoặc dispute đã duyệt.
- Push remote, merge `main`, production deployment và cleanup dữ liệu thật.

## File Structure Map

### Shared web foundations

- `apps/web/src/session/session.ts`: decode/persist session và active role context.
- `apps/web/src/session/SessionProvider.tsx`: nguồn session/roles/refresh cho toàn app.
- `apps/web/src/routing/RoleGuard.tsx`: authorization presentation cho route.
- `apps/web/src/lib/formatters.ts`: ngày giờ, tiền và thời lượng Việt Nam.
- `apps/web/src/lib/presenters.ts`: role/status/ledger labels nghiệp vụ.
- `apps/web/src/components/RoleSwitcher.tsx`, `RoleBadge.tsx`, `RouteState.tsx`: shell dùng chung.

### Player flows

- `apps/web/src/booking/selection.ts`: state machine khoảng slot liên tiếp.
- `apps/web/src/components/BookingSummary.tsx`, `BookingPaymentPanel.tsx`: tóm tắt và payment state.
- `apps/web/src/pages/BookingConfirmationPage.tsx`: trang terminal sau thanh toán.
- `apps/web/src/components/BookingCard.tsx`: booking card và cancel preview inline.
- `apps/web/src/components/QuickMatchModal.tsx`: tìm nhanh realtime.
- `apps/web/src/components/AssistantChat.tsx`, `AssistantBubble.tsx`: chat đầy đủ và chat toàn cục.
- `apps/web/src/components/CommunityComposer.tsx`, `CommunityMediaGrid.tsx`: upload/preview/render ảnh.

### Provider and admin workspaces

- `apps/web/src/manage/ManageLayout.tsx` và `apps/web/src/pages/manage/*.tsx`: workspace chủ sân.
- `apps/web/src/admin/AdminLayout.tsx` và `apps/web/src/pages/admin/*.tsx`: workspace admin theo module.
- `apps/web/src/pages/ProviderOnboardingPage.tsx`: hồ sơ hợp tác và role refresh.

### Backend seams

- `services/account-service/src/domain/session.ts`, `routes/auth.ts`: refresh session.
- `services/account-service/src/domain/adminAccounts.ts`, `routes/admin.ts`: admin list/search account.
- `services/venue-booking-service/src/domain/provider.ts`, `venue.ts`, `booking.ts` và routes tương ứng: self-status/manage DTO, booking/admin/match-source query.
- `services/finance-service/src/domain/wallet.ts`, `prisma/schema.prisma`: ledger reference summary nullable.
- `services/matchmaking-service/src/domain/passport.ts`, `lib/quickMatchGateway.ts`, routes: cooldown và realtime progress.
- `services/community-service/src/domain/community.ts`, routes và schema: post image metadata/upload ownership.
- `packages/object-storage/`: S3 client/presign/ownership key helpers dùng chung.
- `docs/product/backend-ui-capability-matrix.md`: danh mục lâu dài của toàn bộ backend capability và FE sở hữu.
- `scripts/backend-ui-capabilities.json`, `scripts/verify-backend-ui-coverage.ts`: manifest máy đọc được và gate phát hiện route/event chưa được ánh xạ.

## Risks And Recovery

- Migration metadata chỉ thêm cột/model nullable; rollback code trước migration vẫn đọc được dữ liệu cũ. Không drop/rename cột tài chính.
- Nếu RabbitMQ làm chậm xác nhận payment/role, UI poll endpoint có deadline và hiển thị trạng thái “đang đồng bộ”; không tự suy đoán terminal state.
- Nếu object storage lỗi sau presign, post/venue command không lưu object key chưa xác minh; cleanup orphan theo prefix/user và tuổi object, idempotent.
- Quick Match disconnect phải đóng request local và cho phép tìm lại; server không tạo JOIN trước `quick_match:accept`.
- Mỗi task commit riêng; recovery là revert đúng commit logic và deploy lại migration-compatible code, không reset worktree.
- Nếu inventory phát hiện backend có command nhưng thiếu read model để FE chọn thực thể an toàn, chỉ thêm query/DTO owner-scoped tối thiểu; không cho FE nhập UUID thay cho read model.
- “Logic hiển nhiên” chỉ cho phép seam kỹ thuật/read model/loading-error-empty-retry và đồng bộ terminal state suy ra trực tiếp từ nghiệp vụ đã duyệt; nếu đụng chính sách tiền, quyền, trạng thái mới hoặc hành động khó phục hồi thì dừng để PO quyết định.

## Decisions

- 2026-08-14: Dùng lát cắt nghiệp vụ dọc thay vì UI-first hoặc backend-first.
- 2026-08-14: Multi-role dùng role switcher ghi nhớ context gần nhất.
- 2026-08-14: Object storage dùng S3-compatible API; MinIO là runtime local.
- 2026-08-14: Provider/Admin có workspace riêng và homepage theo context.
- 2026-08-14: “Đủ backend” nghĩa là 100% route nghiệp vụ có FE trực tiếp; internal/webhook/event có outcome quan sát được và test xuyên service.

## Backend-to-Frontend Coverage Gate

Inventory ngày 2026-08-14 có 105 route declaration trong năm business service, cộng 5 service health và 1 gateway health = 111 HTTP capability trước các seam mới. Mỗi dòng dưới đây phải xuất hiện trong `scripts/backend-ui-capabilities.json` với `service`, `methodOrEvent`, `pathOrName`, `access`, `surfaceId`, `task`, `evidenceId`. `evidenceId` trỏ tới focused test hoặc bước browser acceptance có tên. Script `npm run ui:coverage` đọc các route source, Socket.IO contracts và event-name allowlist; lệnh thất bại khi phát hiện capability mới không có trong manifest hoặc một dòng không có surface/evidence. Script này chạy ở Task 1 và checkpoint Task 19, không chạy lại trong lần test browser cuối.

### Account and gateway

| Backend capability | FE/observable surface | Task |
|---|---|---:|
| Gateway + Account health | Admin Tổng quan → Trạng thái hệ thống | 10 |
| `POST /auth/register` | Đăng ký | 17 |
| `POST /auth/verify` | Xác minh email | 17 |
| `POST /auth/verify/resend` | Gửi lại mã xác minh | 17 |
| `POST /auth/login` | Đăng nhập + khởi tạo SessionProvider | 2 |
| `POST /auth/logout` | Đăng xuất server-side rồi xóa local session | 2 |
| `POST /auth/password/forgot` | Quên mật khẩu | 17 |
| `POST /auth/password/reset` | Đặt lại mật khẩu | 17 |
| `POST /auth/password/change` | Hồ sơ → Đổi mật khẩu | 17 |
| `GET/PATCH /profile/me` | Hồ sơ cá nhân/avatar/visibility | 6, 17 |
| `POST /admin/users/:id/lock`, `unlock` | Admin → Tài khoản | 10 |
| `GET /internal/players/:userId/public-match-profile` | Gián tiếp: danh tính organizer/participant ở chi tiết kèo | 13, 18 |
| Minimal seam `POST /auth/refresh` | Role approval refresh và stale-role recovery | 2, 7 |
| Minimal seam `GET /admin/users` | Picker/list an toàn cho lock/unlock, không nhập UUID | 10 |

### Venue, schedule and booking

| Backend capability | FE/observable surface | Task |
|---|---|---:|
| Venue health | Admin Tổng quan → Trạng thái hệ thống | 10 |
| `GET/POST /providers`, `POST /providers/:id/approve|reject` | Hợp tác chủ sân + Admin duyệt NCC | 7, 10 |
| Minimal seams `GET /providers/me`, `/providers/me/venues`, `/providers/me/venues/:id` | Trạng thái hợp tác và workspace chủ sân | 7, 8 |
| `GET /venues/:id`, `GET /search` | Danh sách/chi tiết sân công khai, lọc giá/khoảng giờ | 4, 17 |
| `POST/PATCH /venues` | Quản lý → Sân kinh doanh | 8 |
| `POST /venues/:venueId/courts`, deactivate, court booking history | Quản lý → Sân con/ảnh hưởng lịch | 8, 9 |
| Operating hours, closure, pricing, booking-rule commands | Quản lý → Lịch hoạt động/Giá và quy tắc | 8 |
| Court availability, select-slot, holds | Đặt sân → grid/range/giữ chỗ | 4, 5 |
| `POST /bookings` | CTA `Xác nhận đặt sân` | 5 |
| Player booking list/detail/cancel | Hồ sơ → từng booking card | 5, 6 |
| Unified calendar + internal booking create/cancel | Quản lý → Lịch/khách vãng lai | 9 |
| Replacement courts/change court/provider cancel | Quản lý → Sự cố phía sân | 9 |
| Admin booking cancel + minimal admin booking list | Admin → Booking | 10 |
| Internal payment-status/match-context/match-resolution | Gián tiếp: countdown/payment terminal/tạo kèo/settlement state | 5, 13, 18 |
| Minimal `GET /players/me/match-sources` | Picker hold/held booking thuộc organizer | 13 |

### Finance

| Backend capability | FE/observable surface | Task |
|---|---|---:|
| Finance health | Admin Tổng quan → Trạng thái hệ thống | 10 |
| Wallet list + ledger | Hồ sơ → Ví cá nhân và nhãn giao dịch nghiệp vụ | 6 |
| Top-up intent | Hồ sơ → Nạp tiền SePay/mã chuyển khoản | 17 |
| Booking balance + SePay payment | Đặt sân → Thanh toán | 5 |
| Match participant balance + SePay payment | Chi tiết kèo → Thanh toán suất tham gia | 13, 17 |
| Match organizer balance + SePay contribution | Chi tiết kèo organizer → Hoàn tất đóng góp | 13, 17 |
| SePay webhook in/out | Gián tiếp: payment terminal, top-up ledger, withdrawal/reconciliation queue | 5, 9, 11, 18 |
| Provider revenue/list/create/cancel withdrawal | Quản lý → Doanh thu và rút tiền | 9 |
| Admin withdrawal reject/finalize-partial | Admin → Rút tiền | 11 |
| Reconciliation incoming/outgoing/out-of-scope | Admin → Đối soát | 11 |
| Player dispute eligible/list/create | Hồ sơ → Tranh chấp | 6, 17 |
| Admin dispute list/resolve | Admin → Tranh chấp | 11 |

### Matchmaking, Passport and AI

| Backend capability | FE/observable surface | Task |
|---|---|---:|
| Matchmaking health | Admin Tổng quan → Trạng thái hệ thống | 10 |
| Match create/list/detail/cancel | Tìm kèo/Chi tiết kèo/Tạo kèo | 13, 17 |
| Join request + organizer pending list/approve/reject | Chi tiết kèo player/organizer | 13, 17 |
| Join withdraw | Chi tiết kèo → Rút yêu cầu tham gia | 17 |
| Match evaluation submit | Hồ sơ trình độ → Đánh giá sau trận | 12, 17 |
| Evaluation admin review + minimal pending list | Admin → Đánh giá bất thường | 11 |
| Passport declare/own/public | Hồ sơ trình độ cá nhân và công khai | 12 |
| AI suggestions | Trợ lý AI → danh sách F-02 | 14 |
| Minimal grounded AI chat seam | Trợ lý AI → hội thoại tìm kèo | 14 |
| Socket.IO find/progress/stop/proposal/accept/join/error | Modal Tìm nhanh realtime | 13 |

### Community and support

| Backend capability | FE/observable surface | Task |
|---|---|---:|
| Community health | Admin Tổng quan → Trạng thái hệ thống | 10 |
| Post public list/detail, own list, create/edit/delete | Community feed/detail/composer/hoạt động của tôi | 16, 17 |
| Comment create/delete | Community detail | 17 |
| Report create + own reports | Community detail/hoạt động của tôi | 17 |
| Admin report list/action + content restore | Admin → Kiểm duyệt | 11 |
| Ticket list/create/detail/message/status | Support player + Admin ticket queue | 11, 16, 17 |
| `POST /assistant/chat` policy support | Trợ lý AI → chế độ `Hỏi chính sách` | 14 |
| Post/venue upload authorization seams | Community composer + Quản lý sân | 8, 15, 16 |

### Event-driven outcomes

| Event or internal outcome | FE observation | Task |
|---|---|---:|
| `UserRegistered` | Ví cá nhân và Passport xuất hiện sau đăng ký/xác minh | 17, 18 |
| `AccountLocked` | Session bị từ chối; provider/community state bị khóa và Admin thấy trạng thái | 10, 18 |
| `ProviderApproved` | Role provider + business wallet + workspace sau refresh | 2, 7, 9, 18 |
| `PaymentCompleted`, `PaymentTooLate` | Payment terminal/expired UI; không chạy timer sau thành công | 5, 18 |
| `BookingConfirmed`, `BookingCompleted`, `BookingCancelled`, `BookingCourtChanged` | Booking card, lịch, doanh thu/refund và thông báo đổi sân cập nhật | 6, 9, 18 |
| `MatchCreated`, `JoinApproved`, `MatchConfirmed`, `MatchCancelled` | Kèo, JOIN, payment contribution và trạng thái organizer/participant cập nhật | 13, 18 |
| `MatchFeeRefundRequested`, settlement requested/resolved/failed/too-late | Match payment/refund terminal và ledger an toàn | 6, 13, 18 |
| `RatingPeriodReady` | Rating/RD/Passport cập nhật đúng một lần | 12, 18 |
| `ContentReported` | Admin moderation queue | 11, 18 |
| `PayoutCompleted`, `DisputeResolved` | Provider/Admin finance và player ledger/dispute state | 6, 9, 11, 18 |

## Implementation Tasks

### Task 1: Promote approved policy and establish the web test harness

**Files:**
- Modify: `docs/product/decision-log.md`
- Modify: `docs/product/phasing.md`
- Modify: `docs/product/specs/account-access.md`
- Modify: `docs/product/specs/court-booking.md`
- Modify: `docs/product/specs/matchmaking-passport.md`
- Modify: `docs/product/specs/community-support.md`
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`
- Modify: `package-lock.json`
- Modify: `package.json`
- Create: `docs/product/backend-ui-capability-matrix.md`
- Create: `scripts/backend-ui-capabilities.json`
- Create: `scripts/verify-backend-ui-coverage.ts`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/lib/formatters.ts`
- Create: `apps/web/src/lib/formatters.test.ts`

**Interfaces:**
- Produces: `formatDateVi(value: Date | string): string`, `formatDateTimeVi(value: Date | string): string`, `formatMoneyVnd(value: string | bigint): string`, `formatDuration(minutes: number): string`.
- Produces: authoritative decisions D45 role-aware shell, D46 booking/payment UX, D47 7-day declaration cooldown, D48 community/venue media storage.
- Produces: `npm run ui:coverage`, which fails on an unclassified backend route, Socket.IO event or cross-service event; `--allow-planned` is accepted only while the active plan is incomplete.

- [ ] **Step 1: Record the four approved decisions and update affected acceptance criteria**

Append D45–D48 to the confirmed-decision table and add explicit AC rows for session refresh, payment terminal redirect, `nextDeclarationAt`, and maximum four image metadata entries. Remove the Community image PO-review marker that the new approval closes.

- [ ] **Step 2: Add React component test dependencies and jsdom configuration**

Run:

```powershell
npm install -D -w @khoaluantn/web @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Configure Vitest in `apps/web/vite.config.ts`:

```ts
test: {
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  restoreMocks: true,
},
```

- [ ] **Step 3: Create and verify the backend capability manifest**

Parse `services/*/src/routes/*.ts` for HTTP routes, declare app mount prefixes, and compare them with the checked-in manifest. Explicitly classify health, internal and webhook routes as `ops` or `indirect`; classification is not an exemption from `surfaceId`/`evidenceId`.

Run: `npm run ui:coverage -- --allow-planned`

Expected: PASS with `0 unclassified capabilities`; rows not implemented yet are reported as `planned`, grouped by service/access.

- [ ] **Step 4: Write failing formatter tests**

```ts
expect(formatDateVi('2026-08-15T00:00:00+07:00')).toBe('15/08/2026');
expect(formatMoneyVnd('180000')).toBe('180.000 ₫');
expect(formatDuration(90)).toBe('1 giờ 30 phút');
```

- [ ] **Step 5: Run the formatter test and verify failure**

Run: `npm test -w @khoaluantn/web -- src/lib/formatters.test.ts`

Expected: FAIL because `formatters.ts` does not exist.

- [ ] **Step 6: Implement centralized formatters and test setup**

Use `Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })` and `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`; never construct date-only display from browser locale.

- [ ] **Step 7: Run focused proof and commit**

Run:

```powershell
npm test -w @khoaluantn/web -- src/lib/formatters.test.ts
npm run ui:coverage -- --allow-planned
git add docs/product/decision-log.md docs/product/phasing.md docs/product/specs/account-access.md docs/product/specs/court-booking.md docs/product/specs/matchmaking-passport.md docs/product/specs/community-support.md docs/product/backend-ui-capability-matrix.md scripts/backend-ui-capabilities.json scripts/verify-backend-ui-coverage.ts package.json apps/web/package.json apps/web/vite.config.ts apps/web/src/test/setup.ts apps/web/src/lib/formatters.ts apps/web/src/lib/formatters.test.ts package-lock.json
git commit -m "chore(ui): establish backend capability coverage gate"
```

### Task 2: Refresh sessions and centralize multi-role context

**Files:**
- Modify: `services/account-service/src/domain/session.ts`
- Modify: `services/account-service/src/routes/auth.ts`
- Modify: `services/account-service/test/session.test.ts`
- Modify: `apps/web/src/lib/accountApi.ts`
- Create: `apps/web/src/session/session.ts`
- Create: `apps/web/src/session/session.test.ts`
- Create: `apps/web/src/session/SessionProvider.tsx`
- Create: `apps/web/src/session/SessionProvider.test.tsx`
- Modify: `apps/web/src/components/AuthForm.tsx`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Backend produces: `refreshSession(refreshToken: string): Promise<LoginResult>` at `POST /auth/refresh`.
- Web produces: `SessionState { userId: string; roles: UserRole[]; activeRole: UserRole; accessToken: string; refreshToken: string }`.
- Web produces: `useSession(): { session; setActiveRole(role); refresh(); logout() }`.

- [x] **Step 1: Write failing refresh-session integration cases**

Cover valid refresh returning current database roles, revoked token returning `401 INVALID_REFRESH_TOKEN`, locked user returning `403 ACCOUNT_LOCKED`, and replacement access token containing newly granted `provider`.

- [x] **Step 2: Verify backend tests fail**

Run: `npm test -w @khoaluantn/account-service -- test/session.test.ts`

Expected: FAIL because `/auth/refresh` is absent.

- [x] **Step 3: Implement refresh without minting a new refresh token**

```ts
export async function refreshSession(refreshToken: string): Promise<LoginResult> {
  const { sub, jti } = verifyRefreshToken(refreshToken);
  if (!(await isRefreshTokenValid(jti))) {
    throw new AppError('INVALID_REFRESH_TOKEN', 'Phiên đăng nhập không còn hợp lệ.', 401);
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: sub } });
  if (user.status === 'locked') throw new AppError('ACCOUNT_LOCKED', 'Tài khoản đã bị khóa.', 403);
  const roles = user.roles as string[];
  return { accessToken: signAccessToken(user.id, roles), refreshToken, roles };
}
```

Reuse the existing Redis token-store verification primitive; do not bypass revocation.

- [x] **Step 4: Write failing session parser/context tests**

Assert invalid local storage clears the session, active role must belong to `roles`, last role persists under `courtin.activeRole`, and refresh updates roles without a full login.

- [x] **Step 5: Implement `SessionProvider` and replace ad-hoc JWT decoding**

`AuthForm` calls `saveSession()`, `SessionProvider` owns storage/events, and consumers stop reading `localStorage` directly. `logout()` first calls `POST /auth/logout` with the refresh token, then clears local state even when the server reports that the token is already invalid.

- [x] **Step 6: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/account-service -- test/session.test.ts
npm test -w @khoaluantn/web -- src/session/session.test.ts src/session/SessionProvider.test.tsx
git add services/account-service/src/domain/session.ts services/account-service/src/routes/auth.ts services/account-service/test/session.test.ts apps/web/src/lib/accountApi.ts apps/web/src/session apps/web/src/components/AuthForm.tsx apps/web/src/main.tsx
git commit -m "feat(account): refresh multi-role sessions"
```

### Task 3: Build the role-aware shell, guards and home routing

**Files:**
- Create: `apps/web/src/routing/RoleGuard.tsx`
- Create: `apps/web/src/routing/RoleGuard.test.tsx`
- Create: `apps/web/src/components/RoleBadge.tsx`
- Create: `apps/web/src/components/RoleSwitcher.tsx`
- Create: `apps/web/src/components/RoleSwitcher.test.tsx`
- Modify: `apps/web/src/components/Navbar.tsx`
- Modify: `apps/web/src/layout/AppLayout.tsx`
- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Consumes: `useSession()` from Task 2.
- Produces: `<RoleGuard allow={['provider']}>`, `<RoleSwitcher />`, and context home redirect rules `player -> /`, `provider -> /manage`, `admin -> /admin`.

- [x] **Step 1: Write failing guard and role-switcher tests**

Assert role labels `Người chơi`, `Chủ sân`, `Quản trị viên`; forbidden provider route renders recovery CTA; switching role persists and navigates to context home; player shell shows `Hợp tác chủ sân` left of avatar.

- [x] **Step 2: Verify tests fail**

Run: `npm test -w @khoaluantn/web -- src/routing/RoleGuard.test.tsx src/components/RoleSwitcher.test.tsx`

Expected: FAIL because the components do not exist.

- [x] **Step 3: Implement guarded nested route groups**

```tsx
<Route element={<RoleGuard allow={['provider']} />}>
  <Route path="/manage/*" element={<ManageLayout />} />
</Route>
<Route element={<RoleGuard allow={['admin']} />}>
  <Route path="/admin/*" element={<AdminLayout />} />
</Route>
```

Keep backend authorization authoritative and show a Vietnamese forbidden state instead of silently redirecting to `/`.

- [x] **Step 4: Implement context-specific navigation and labels**

Player navigation remains Trang chủ/Đặt sân/Tìm kèo/Cộng đồng; provider navigation is Tổng quan/Sân/Lịch/Doanh thu; admin navigation is Tổng quan/Công việc. Rename `Player Passport` to `Hồ sơ trình độ` everywhere.

- [x] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/web -- src/routing/RoleGuard.test.tsx src/components/RoleSwitcher.test.tsx
git add apps/web/src/routing apps/web/src/components/RoleBadge.tsx apps/web/src/components/RoleSwitcher.tsx apps/web/src/components/Navbar.tsx apps/web/src/layout/AppLayout.tsx apps/web/src/pages/HomePage.tsx apps/web/src/App.tsx apps/web/src/index.css
git commit -m "feat(web): add role-aware application shell"
```

### Task 4: Implement contiguous multi-slot selection and deterministic booking summary

**Files:**
- Create: `apps/web/src/booking/selection.ts`
- Create: `apps/web/src/booking/selection.test.ts`
- Modify: `apps/web/src/components/SlotGrid.tsx`
- Create: `apps/web/src/components/BookingSummary.tsx`
- Create: `apps/web/src/components/BookingSummary.test.tsx`
- Modify: `apps/web/src/pages/BookingPage.tsx`
- Modify: `apps/web/src/lib/venueBookingApi.ts`

**Interfaces:**
- Produces: `BookingRange { courtId; date; startAt; endAt; slotCount; durationMinutes; totalPrice }`.
- Produces: `toggleSlot(range, slot, allSlots): BookingRange | null` that accepts only adjacent available slots on one court/day.

- [x] **Step 1: Write failing pure selection tests**

Cover first click, extending forward/backward, shrinking an endpoint, rejecting a gap/booked slot, clearing on court/date change, and summing different per-slot prices as `bigint` strings.

- [x] **Step 2: Verify pure tests fail**

Run: `npm test -w @khoaluantn/web -- src/booking/selection.test.ts`

Expected: FAIL because `toggleSlot` is absent.

- [x] **Step 3: Implement the pure range reducer**

```ts
export interface BookingRange {
  courtId: string;
  date: string;
  startAt: string;
  endAt: string;
  slotCount: number;
  durationMinutes: number;
  totalPrice: string;
}
```

Never mutate API slot objects and calculate the end time from `endMinute` of the final slot.

- [x] **Step 4: Write and implement component behavior**

Selected buttons use `aria-pressed`, navy/yellow selected styling and visible text `ĐÃ CHỌN`. `BookingSummary` renders venue, court, `dd/MM/yyyy`, start–end, slot count, duration and total; native `type=date` display is replaced by a controlled `dd/MM/yyyy` date field/calendar popover.

- [x] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/web -- src/booking/selection.test.ts src/components/BookingSummary.test.tsx
git add apps/web/src/booking apps/web/src/components/SlotGrid.tsx apps/web/src/components/BookingSummary.tsx apps/web/src/components/BookingSummary.test.tsx apps/web/src/pages/BookingPage.tsx apps/web/src/lib/venueBookingApi.ts
git commit -m "feat(booking): select contiguous court slots"
```

### Task 5: Merge booking confirmation with hold creation and build terminal payment UX

**Files:**
- Modify: `services/venue-booking-service/src/domain/booking.ts`
- Modify: `services/venue-booking-service/src/routes/bookings.ts`
- Modify: `services/venue-booking-service/test/bookingHttp.test.ts`
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Modify: `apps/web/src/lib/financeApi.ts`
- Create: `apps/web/src/components/BookingPaymentPanel.tsx`
- Create: `apps/web/src/components/BookingPaymentPanel.test.tsx`
- Create: `apps/web/src/pages/BookingConfirmationPage.tsx`
- Modify: `apps/web/src/pages/BookingPage.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Backend booking summary includes `holdExpiresAt`, `terminalStatus`, court/venue display snapshot and never returns a user-facing booking code.
- Web produces `waitForBookingTerminal(id, { signal, intervalMs: 750, timeoutMs: 15000 })`.

- [x] **Step 1: Write failing HTTP tests for safe payment/confirmation summary**

Assert held booking returns exact `holdExpiresAt`; confirmed/cancelled are terminal; player may only read their own booking; response includes display fields but no public booking UUID label.

- [x] **Step 2: Verify backend tests fail**

Run: `npm test -w @khoaluantn/venue-booking-service -- test/bookingHttp.test.ts`

- [x] **Step 3: Extend the existing DTO without changing booking state transitions**

Use existing `createHold -> createBookingFromHold -> finance payment -> PaymentCompleted` sequence. The single CTA invokes the first two calls, then stores `{ bookingId, holdExpiresAt }` in route state.

- [x] **Step 4: Write failing payment component tests**

Assert payment state disables date/court/slot controls, countdown derives from backend expiry, balance success stops timer, late terminal cancellation shows recovery, and successful polling navigates to `/booking/confirmation`.

- [x] **Step 5: Implement payment and confirmation UI**

```ts
type PaymentPhase = 'selecting' | 'creating' | 'paying' | 'confirming' | 'confirmed' | 'expired' | 'failed';
```

Do not render `booking.id`. Confirmation actions are `Xem đặt sân của tôi` and `Tìm kèo từ sân này` when the booking state permits it.

- [x] **Step 6: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/venue-booking-service -- test/bookingHttp.test.ts
npm test -w @khoaluantn/web -- src/components/BookingPaymentPanel.test.tsx
git add services/venue-booking-service/src/domain/booking.ts services/venue-booking-service/src/routes/bookings.ts services/venue-booking-service/test/bookingHttp.test.ts apps/web/src/lib/venueBookingApi.ts apps/web/src/lib/financeApi.ts apps/web/src/components/BookingPaymentPanel.tsx apps/web/src/components/BookingPaymentPanel.test.tsx apps/web/src/pages/BookingPage.tsx apps/web/src/pages/BookingConfirmationPage.tsx apps/web/src/App.tsx
git commit -m "feat(booking): confirm hold and payment in one flow"
```

### Task 6: Fix booking-card cancellation state and business transaction labels

**Files:**
- Modify: `services/finance-service/prisma/schema.prisma`
- Create: `services/finance-service/prisma/migrations/20260814_ui_ledger_reference_summary/migration.sql`
- Modify: `services/finance-service/src/domain/wallet.ts`
- Modify: `services/finance-service/src/domain/payment.ts`
- Modify: `services/finance-service/src/domain/refund.ts`
- Modify: `services/finance-service/src/domain/topup.ts`
- Modify: `services/finance-service/src/domain/withdrawal.ts`
- Modify: `services/finance-service/src/domain/matchFee.ts`
- Modify: `services/finance-service/src/routes/wallets.ts`
- Modify: `services/finance-service/test/wallet.test.ts`
- Modify: `apps/web/src/lib/financeApi.ts`
- Create: `apps/web/src/lib/presenters.ts`
- Create: `apps/web/src/lib/presenters.test.ts`
- Create: `apps/web/src/components/BookingCard.tsx`
- Create: `apps/web/src/components/BookingCard.test.tsx`
- Modify: `apps/web/src/components/BookingCancellationPanel.tsx`
- Modify: `apps/web/src/pages/ProfilePage.tsx`

**Interfaces:**
- Finance returns `referenceSummary?: { kind: 'booking' | 'topup' | 'withdrawal' | 'match'; title: string; subtitle?: string }`.
- Web produces `presentLedgerEntry(entry): { title; subtitle; amountTone }` with safe fallback labels and no UUID.

- [ ] **Step 1: Write failing cancellation-card tests**

Assert preview appears inside the selected card, confirming removes it from upcoming and moves it to cancelled, cancelled cards never show cancel/refund buttons, and selecting another card cannot reuse stale preview state.

- [ ] **Step 2: Write failing ledger DTO/presenter tests**

Cover `payment · personal -> Thanh toán đặt sân`, refund, top-up, payout, commission and unknown legacy rows. Unknown rows show `Giao dịch ví`, never `refId`.

- [ ] **Step 3: Add nullable ledger reference metadata**

Migration adds `referenceSummary JSONB NULL` to `ledger_entries`; existing append-only rows are untouched. New booking/refund/topup/payout writers provide safe display metadata from event/command payload when available.

- [ ] **Step 4: Implement booking card and reload after terminal mutation**

Key cancellation state by booking ID and always re-fetch `getMyUpcomingBookings()` plus history after success.

- [ ] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/finance-service -- test/wallet.test.ts
npm test -w @khoaluantn/web -- src/lib/presenters.test.ts src/components/BookingCard.test.tsx
git add services/finance-service/prisma services/finance-service/src/domain/wallet.ts services/finance-service/src/domain/payment.ts services/finance-service/src/domain/refund.ts services/finance-service/src/domain/topup.ts services/finance-service/src/domain/withdrawal.ts services/finance-service/src/domain/matchFee.ts services/finance-service/src/routes/wallets.ts services/finance-service/test/wallet.test.ts apps/web/src/lib/financeApi.ts apps/web/src/lib/presenters.ts apps/web/src/lib/presenters.test.ts apps/web/src/components/BookingCard.tsx apps/web/src/components/BookingCard.test.tsx apps/web/src/components/BookingCancellationPanel.tsx apps/web/src/pages/ProfilePage.tsx
git commit -m "fix(profile): keep cancellation and wallet context local"
```

### Task 7: Expose provider self-status and management read models

**Files:**
- Modify: `services/venue-booking-service/src/domain/provider.ts`
- Modify: `services/venue-booking-service/src/domain/venue.ts`
- Modify: `services/venue-booking-service/src/domain/venueDetail.ts`
- Modify: `services/venue-booking-service/src/routes/providers.ts`
- Modify: `services/venue-booking-service/src/routes/venues.ts`
- Modify: `services/venue-booking-service/test/provider.test.ts`
- Modify: `services/venue-booking-service/test/venue.test.ts`
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Create: `apps/web/src/pages/ProviderOnboardingPage.tsx`
- Create: `apps/web/src/pages/ProviderOnboardingPage.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- `GET /providers/me` returns `{ id; orgName; contact; status; decisionReason; decidedAt } | null`.
- `GET /providers/me/venues` returns owned venues with courts and configuration completion counts.
- `GET /providers/me/venues/:id` returns owned venue/court schedule/pricing/booking-rule read model.

- [x] **Step 1: Write failing provider ownership/status tests**

Cover no profile, pending, rejected with reason/resubmit, approved, provider attempting to read another owner, and admin list remaining unchanged.

- [x] **Step 2: Verify backend tests fail**

Run: `npm test -w @khoaluantn/venue-booking-service -- test/provider.test.ts test/venue.test.ts`

- [x] **Step 3: Implement owner-scoped read models**

All queries filter by `provider.userId = authenticated userId`; response serializers convert BigInt prices to strings.

- [x] **Step 4: Implement onboarding state UI and approved-role refresh**

Wizard sends `orgName` and structured contact, polls only while the status page is open, calls `useSession().refresh()` when status becomes approved, and offers re-login if refresh fails.

- [x] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/venue-booking-service -- test/provider.test.ts test/venue.test.ts
npm test -w @khoaluantn/web -- src/pages/ProviderOnboardingPage.test.tsx
git add services/venue-booking-service/src/domain services/venue-booking-service/src/routes services/venue-booking-service/test/provider.test.ts services/venue-booking-service/test/venue.test.ts apps/web/src/lib/venueBookingApi.ts apps/web/src/pages/ProviderOnboardingPage.tsx apps/web/src/pages/ProviderOnboardingPage.test.tsx apps/web/src/App.tsx
git commit -m "feat(provider): add onboarding status and manage read models"
```

### Task 8: Build provider venue, court, schedule and pricing workspace

**Files:**
- Create: `apps/web/src/manage/ManageLayout.tsx`
- Create: `apps/web/src/pages/manage/ManageOverviewPage.tsx`
- Create: `apps/web/src/pages/manage/ManageVenuesPage.tsx`
- Create: `apps/web/src/pages/manage/ManageVenueDetailPage.tsx`
- Create: `apps/web/src/pages/manage/ManageSchedulePage.tsx`
- Create: `apps/web/src/pages/manage/ManagePricingPage.tsx`
- Create: `apps/web/src/pages/manage/managePages.test.tsx`
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes existing create/update venue, add/deactivate court, operating-hour, closure, pricing and booking-rule routes plus Task 7 read models.
- Produces provider routes `/manage`, `/manage/venues`, `/manage/venues/:venueId`, `/manage/venues/:venueId/schedule`, `/manage/venues/:venueId/pricing`.

- [ ] **Step 1: Write failing route/page tests**

Assert empty state exposes `Thêm sân kinh doanh`, create/edit forms map every existing backend field, court deactivation confirmation lists conflicts from backend errors, and all async buttons prevent double submit.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -w @khoaluantn/web -- src/pages/manage/managePages.test.tsx`

- [ ] **Step 3: Implement responsive manage layout and venue CRUD UI**

Desktop uses sidebar and content header; mobile uses a horizontal module switcher. Keep forms in focused components and display field-level Zod/API errors next to the relevant input.

- [ ] **Step 4: Implement schedule/pricing editors**

Operating hours use minute-backed controls, closures use `dd/MM/yyyy`, pricing windows show overlap errors, and booking rules show step/min/max relationships before submit.

- [ ] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/web -- src/pages/manage/managePages.test.tsx
git add apps/web/src/manage apps/web/src/pages/manage apps/web/src/lib/venueBookingApi.ts apps/web/src/App.tsx
git commit -m "feat(provider): add venue operations workspace"
```

### Task 9: Build provider calendar, incident and finance workspace

**Files:**
- Create: `apps/web/src/pages/manage/ManageCalendarPage.tsx`
- Create: `apps/web/src/pages/manage/ManageIncidentsPage.tsx`
- Create: `apps/web/src/pages/manage/ManageFinancePage.tsx`
- Create: `apps/web/src/pages/manage/manageOperations.test.tsx`
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Modify: `apps/web/src/lib/financeApi.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/ProfilePage.tsx`

**Interfaces:**
- Consumes existing unified calendar/internal booking/replacement court/change court/provider cancel/revenue/withdrawal endpoints.
- Produces routes `/manage/calendar`, `/manage/incidents`, `/manage/finance` and removes provider operations from player profile.

- [ ] **Step 1: Write failing provider operations tests**

Cover venue/date calendar filters, walk-in booking create/cancel, replacement-court selection, provider-fault cancellation requiring reason, revenue date filters, withdrawal validation and cancellation.

- [ ] **Step 2: Implement calendar and incident pages**

Calendar uses one source of truth from `GET /venues/:venueId/calendar`; incident page selects a booking from provider-owned context rather than asking for raw booking UUID.

- [ ] **Step 3: Implement finance page and profile cleanup**

Show pending/available/reserved metric cards, business labels and bank fields; remove the dark provider panels from `/profile` while retaining personal wallet/disputes.

- [ ] **Step 4: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/web -- src/pages/manage/manageOperations.test.tsx
git add apps/web/src/pages/manage apps/web/src/lib/venueBookingApi.ts apps/web/src/lib/financeApi.ts apps/web/src/App.tsx apps/web/src/pages/ProfilePage.tsx
git commit -m "feat(provider): add calendar incidents and finance ui"
```

### Task 10: Add admin account, booking and provider queues

**Files:**
- Modify: `services/account-service/src/domain/adminAccounts.ts`
- Modify: `services/account-service/src/routes/admin.ts`
- Modify: `services/account-service/test/adminAccounts.test.ts`
- Modify: `services/venue-booking-service/src/domain/booking.ts`
- Modify: `services/venue-booking-service/src/routes/bookings.ts`
- Modify: `services/venue-booking-service/test/cancellation.test.ts`
- Modify: `apps/web/src/lib/accountApi.ts`
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Create: `apps/web/src/admin/AdminLayout.tsx`
- Create: `apps/web/src/pages/admin/AdminOverviewPage.tsx`
- Create: `apps/web/src/lib/systemHealthApi.ts`
- Create: `apps/web/src/pages/admin/AdminAccountsPage.tsx`
- Create: `apps/web/src/pages/admin/AdminProvidersPage.tsx`
- Create: `apps/web/src/pages/admin/AdminBookingsPage.tsx`
- Create: `apps/web/src/pages/admin/adminCore.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- `GET /admin/users?query=&status=` returns safe account summaries with role/status, never password/refresh data.
- `GET /admin/bookings?query=&status=&from=&to=` returns booking/court/venue/player display summary.
- Produces routes `/admin`, `/admin/accounts`, `/admin/providers`, `/admin/bookings`.
- Admin overview queries the health endpoints of gateway/account/venue/finance/matchmaking/community and labels each service in Vietnamese.

- [ ] **Step 1: Write failing admin query tests**

Cover admin-only access, pagination/filtering, lock/unlock audit, provider approve/reject reason and admin platform-fault cancellation.

- [ ] **Step 2: Implement safe list/search read models**

Account service returns profile display name/email/status/roles. Venue service returns only booking operations context and serializes BigInt/date values.

- [ ] **Step 3: Write and implement admin page tests**

Pages use actionable business rows, explicit confirmation modals, reason validation and reload only the affected queue after success. Health cards distinguish available, degraded and unreachable without exposing secrets.

- [ ] **Step 4: Remove the old monolithic admin page**

Replace `apps/web/src/pages/AdminPage.tsx` with nested module routes; retain any reusable panels by importing them into the new pages.

- [ ] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/account-service -- test/adminAccounts.test.ts
npm test -w @khoaluantn/venue-booking-service -- test/cancellation.test.ts
npm test -w @khoaluantn/web -- src/pages/admin/adminCore.test.tsx
git add services/account-service services/venue-booking-service/src/domain/booking.ts services/venue-booking-service/src/routes/bookings.ts services/venue-booking-service/test/cancellation.test.ts apps/web/src/admin apps/web/src/pages/admin apps/web/src/pages/AdminPage.tsx apps/web/src/lib/accountApi.ts apps/web/src/lib/venueBookingApi.ts apps/web/src/lib/systemHealthApi.ts apps/web/src/App.tsx
git commit -m "feat(admin): expose account provider and booking queues"
```

### Task 11: Add admin finance, dispute, moderation, evaluation and ticket operations

**Files:**
- Modify: `services/matchmaking-service/src/domain/evaluations.ts`
- Modify: `services/matchmaking-service/src/routes/matches.ts`
- Modify: `services/matchmaking-service/test/evaluations.test.ts`
- Modify: `apps/web/src/lib/matchApi.ts`
- Modify: `apps/web/src/lib/communityAdminApi.ts`
- Create: `apps/web/src/pages/admin/AdminFinancePage.tsx`
- Create: `apps/web/src/pages/admin/AdminDisputesPage.tsx`
- Create: `apps/web/src/pages/admin/AdminModerationPage.tsx`
- Create: `apps/web/src/pages/admin/AdminEvaluationsPage.tsx`
- Create: `apps/web/src/pages/admin/AdminTicketsPage.tsx`
- Create: `apps/web/src/pages/admin/adminOperations.test.tsx`
- Modify: `apps/web/src/components/FinanceAdminPanel.tsx`
- Modify: `apps/web/src/components/DisputeAdminPanel.tsx`
- Modify: `apps/web/src/components/CommunityAdminPanel.tsx`

**Interfaces:**
- `GET /matches/admin/evaluations?reviewStatus=pending` returns flagged evaluation context for the existing review action.
- Consumes existing withdrawal, reconciliation, dispute, moderation restore and ticket endpoints.

- [ ] **Step 1: Write failing flagged-evaluation list tests**

Assert admin-only, pending filter, safe player/match context and no automatic rating changes before explicit review.

- [ ] **Step 2: Implement the missing admin evaluation query**

Return evaluation IDs, match ID, tier/flag reason/status and timestamps; preserve existing `PATCH /:matchId/evaluations/:evaluationId/review` semantics.

- [ ] **Step 3: Write failing UI queue tests**

Cover withdrawal reject/finalize partial, reconciliation three actions, dispute decision validation, hide/remove/dismiss/restore, evaluation approve/reject, ticket reply/resolve/close.

- [ ] **Step 4: Implement module pages and shared operation tables**

Never display raw internal IDs as the primary label; use a shortened reference only in admin detail drawers when reconciliation requires it.

- [ ] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/matchmaking-service -- test/evaluations.test.ts
npm test -w @khoaluantn/web -- src/pages/admin/adminOperations.test.tsx
git add services/matchmaking-service/src/domain/evaluations.ts services/matchmaking-service/src/routes/matches.ts services/matchmaking-service/test/evaluations.test.ts apps/web/src/lib/matchApi.ts apps/web/src/lib/communityAdminApi.ts apps/web/src/pages/admin apps/web/src/components/FinanceAdminPanel.tsx apps/web/src/components/DisputeAdminPanel.tsx apps/web/src/components/CommunityAdminPanel.tsx
git commit -m "feat(admin): complete operations work queues"
```

### Task 12: Enforce 7-day level declarations and improve the profile UI

**Files:**
- Modify: `services/matchmaking-service/src/domain/passport.ts`
- Modify: `services/matchmaking-service/src/routes/passports.ts`
- Modify: `services/matchmaking-service/test/passport.test.ts`
- Modify: `apps/web/src/lib/passportApi.ts`
- Modify: `apps/web/src/pages/PassportPage.tsx`
- Create: `apps/web/src/pages/PassportPage.test.tsx`
- Modify: `apps/web/src/components/Navbar.tsx`

**Interfaces:**
- Own passport returns `nextDeclarationAt: string | null` and `canDeclareTier: boolean`.
- Domain constant: `DECLARATION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000`.

- [x] **Step 1: Write failing domain tests with an injected clock**

Cover first declaration, retry at 6 days 23:59:59 rejected with `LEVEL_DECLARATION_COOLDOWN`, retry exactly at 7 days accepted, and `nextDeclarationAt` serialization.

- [x] **Step 2: Implement backend enforcement**

Use `declaredAt`, not `updatedAt`, and reject before update. Include recovery metadata `{ nextDeclarationAt }` in the error.

- [x] **Step 3: Write and implement page behavior**

Rename all copy to `Hồ sơ trình độ`, disable CTA during cooldown and render the exact next Vietnamese date/time while preserving rating/RD/evaluation history.

- [x] **Step 4: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/matchmaking-service -- test/passport.test.ts
npm test -w @khoaluantn/web -- src/pages/PassportPage.test.tsx
git add services/matchmaking-service/src/domain/passport.ts services/matchmaking-service/src/routes/passports.ts services/matchmaking-service/test/passport.test.ts apps/web/src/lib/passportApi.ts apps/web/src/pages/PassportPage.tsx apps/web/src/pages/PassportPage.test.tsx apps/web/src/components/Navbar.tsx
git commit -m "feat(passport): enforce weekly level declaration"
```

### Task 13: Add realtime Quick Match progress and eligible match sources

**Files:**
- Modify: `services/matchmaking-service/src/lib/quickMatchGateway.ts`
- Modify: `services/matchmaking-service/test/quickMatch.e2e.test.ts`
- Modify: `services/venue-booking-service/src/domain/booking.ts`
- Modify: `services/venue-booking-service/src/routes/bookings.ts`
- Modify: `services/venue-booking-service/test/matchContext.test.ts`
- Modify: `apps/web/src/lib/matchApi.ts`
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Create: `apps/web/src/components/QuickMatchModal.tsx`
- Create: `apps/web/src/components/QuickMatchModal.test.tsx`
- Modify: `apps/web/src/components/QuickMatchPanel.tsx`
- Modify: `apps/web/src/pages/MatchListPage.tsx`

**Interfaces:**
- Client events: `quick_match:find { requestId; skill? }`, `quick_match:stop { requestId }`, `quick_match:accept { requestId; matchId }`.
- Server events: `quick_match:progress { requestId; elapsedMs; scannedCount; candidateCount; phase }`, `proposal`, `stopped`, `joined`, `error`.
- `GET /players/me/match-sources` returns owner-scoped active holds and payable held bookings.

- [ ] **Step 1: Write failing Socket.IO tests**

Assert start/progress/proposal ordering, stop prevents later proposal/join, disconnect cleanup, accept creates exactly one pending JOIN, and server never auto-accepts.

- [ ] **Step 2: Implement request-scoped progress and cancellation**

Track active request IDs per socket; emit monotonic counters around the existing deterministic search; delete state on stop/disconnect.

- [ ] **Step 3: Write failing match-source tests**

Return only current user active hold or payable `held` booking; exclude confirmed/cancelled/expired/other-user sources. Preserve existing create schema that accepts exactly one of `bookingId` or `holdId`.

- [ ] **Step 4: Implement modal and create-match source picker**

Animation uses transform/opacity and pauses with `prefers-reduced-motion`. Source picker shows venue/court/time/status, not raw IDs.

- [ ] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/matchmaking-service -- test/quickMatch.e2e.test.ts
npm test -w @khoaluantn/venue-booking-service -- test/matchContext.test.ts
npm test -w @khoaluantn/web -- src/components/QuickMatchModal.test.tsx
git add services/matchmaking-service/src/lib/quickMatchGateway.ts services/matchmaking-service/test/quickMatch.e2e.test.ts services/venue-booking-service/src/domain/booking.ts services/venue-booking-service/src/routes/bookings.ts services/venue-booking-service/test/matchContext.test.ts apps/web/src/lib/matchApi.ts apps/web/src/lib/venueBookingApi.ts apps/web/src/components/QuickMatchModal.tsx apps/web/src/components/QuickMatchModal.test.tsx apps/web/src/components/QuickMatchPanel.tsx apps/web/src/pages/MatchListPage.tsx
git commit -m "feat(matchmaking): show realtime search and valid sources"
```

### Task 14: Build grounded two-column AI chat and global assistant bubble

**Files:**
- Modify: `services/matchmaking-service/src/domain/aiMatchmaker.ts`
- Modify: `services/matchmaking-service/src/routes/matches.ts`
- Modify: `services/matchmaking-service/test/aiMatchmaker.e2e.test.ts`
- Modify: `packages/ai/src/geminiMatchmaker.ts`
- Modify: `packages/ai/test/geminiMatchmaker.test.ts`
- Modify: `apps/web/src/lib/assistantApi.ts`
- Create: `apps/web/src/components/AssistantChat.tsx`
- Create: `apps/web/src/components/AssistantBubble.tsx`
- Create: `apps/web/src/components/AssistantChat.test.tsx`
- Modify: `apps/web/src/pages/AssistantPage.tsx`
- Modify: `apps/web/src/layout/AppLayout.tsx`

**Interfaces:**
- `POST /matches/suggestions/ai/chat` accepts `{ message; criteria }` and returns `{ answer; normalizedCriteria; suggestions }`.
- `NormalizedMatchCriteria { area?: string; startFrom?: string; endBefore?: string; feeMax?: string }` is Zod-validated before F-02 search.
- Existing `POST /assistant/chat` remains the grounded policy-support mode; the page exposes `Tìm kèo` and `Hỏi chính sách` without conflating their contracts.

- [x] **Step 1: Write failing AI safety/criteria tests**

Assert model output cannot change F-02 scores, cannot invent a match, invalid criteria fall back safely, and action requests return a navigation CTA rather than executing JOIN/cancel/payment.

- [x] **Step 2: Implement grounded criteria adapter**

Gemini may normalize only user-supplied filter values and select verified reason indexes. Domain re-validates criteria and recomputes suggestions from F-02.

- [x] **Step 3: Write failing chat layout tests**

Assert messages append, loading/error retry is visible, suggestions update on each reply, clicking suggestion navigates to detail, global bubble appears only for authenticated player context and supports keyboard close/focus return.

- [x] **Step 4: Implement desktop two-column/mobile stacked layout**

Left column is a live suggestion region with `aria-live="polite"`; right is conversation and composer. The global bubble opens a compact drawer and links to `/assistant` for the full experience. In `Hỏi chính sách`, sources and safe `actionPath` from Community assistant are rendered; suggestions remain unchanged.

- [x] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/ai -- test/geminiMatchmaker.test.ts
npm test -w @khoaluantn/matchmaking-service -- test/aiMatchmaker.e2e.test.ts
npm test -w @khoaluantn/web -- src/components/AssistantChat.test.tsx
git add packages/ai services/matchmaking-service/src/domain/aiMatchmaker.ts services/matchmaking-service/src/routes/matches.ts services/matchmaking-service/test/aiMatchmaker.e2e.test.ts apps/web/src/lib/assistantApi.ts apps/web/src/components/AssistantChat.tsx apps/web/src/components/AssistantBubble.tsx apps/web/src/components/AssistantChat.test.tsx apps/web/src/pages/AssistantPage.tsx apps/web/src/layout/AppLayout.tsx
git commit -m "feat(ai): add grounded match assistant chat"
```

### Task 15: Add S3-compatible media infrastructure and Community image metadata

**Files:**
- Create: `packages/object-storage/package.json`
- Create: `packages/object-storage/tsconfig.json`
- Create: `packages/object-storage/src/index.ts`
- Create: `packages/object-storage/test/objectKeys.test.ts`
- Modify: `docker-compose.infrastructure.yml`
- Modify: `.env.example`
- Modify: `services/community-service/package.json`
- Modify: `services/venue-booking-service/package.json`
- Modify: `services/community-service/prisma/schema.prisma`
- Create: `services/community-service/prisma/migrations/20260814_post_images/migration.sql`
- Modify: `services/community-service/src/domain/community.ts`
- Create: `services/community-service/src/routes/uploads.ts`
- Modify: `services/community-service/src/app.ts`
- Modify: `services/community-service/test/community.e2e.test.ts`
- Create: `services/venue-booking-service/src/routes/uploads.ts`
- Modify: `services/venue-booking-service/src/app.ts`
- Modify: `services/venue-booking-service/test/venue.test.ts`
- Modify: `package-lock.json`

**Interfaces:**
- `ObjectStorageClient.authorizeUpload(input): Promise<{ objectKey; uploadUrl; headers; expiresAt }>`.
- `ObjectStorageClient.assertOwnedObject({ objectKey; namespace; ownerUserId; mimeType; maxBytes }): Promise<void>`.
- Community `PostImage { id; postId; objectKey; width; height; alt; position }`, maximum 4 unique positions.
- Namespaces are `community/posts/<userId>/...` and `venue/images/<userId>/...`.

- [ ] **Step 1: Write failing object-key and ownership tests**

Cover traversal rejection, namespace/user mismatch, MIME allowlist (`image/jpeg`, `image/png`, `image/webp`), maximum 8 MiB, 10-minute presign expiry and deterministic public/signed read URL behavior.

- [ ] **Step 2: Implement the shared S3 client and local MinIO runtime**

Use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`; configure endpoint, region, bucket, access key, secret, force-path-style and public base URL through environment variables.

- [ ] **Step 3: Write failing Community migration/domain tests**

Assert 0–4 images accepted, fifth rejected, ownership verified before transaction, order preserved, edit removes detached metadata, and deleted post schedules idempotent object cleanup.

- [ ] **Step 4: Add upload authorization routes owned by Community and Venue**

Routes require auth/role, return presigned data, and never accept a client-chosen full object key. Domain commands accept only `{ objectKey, width, height, alt }` after storage HEAD verification.

- [ ] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/object-storage
npm test -w @khoaluantn/community-service -- test/community.e2e.test.ts
npm test -w @khoaluantn/venue-booking-service -- test/venue.test.ts
git add packages/object-storage docker-compose.infrastructure.yml .env.example services/community-service services/venue-booking-service/src/routes/uploads.ts services/venue-booking-service/src/app.ts services/venue-booking-service/test/venue.test.ts services/venue-booking-service/package.json package-lock.json
git commit -m "feat(media): add owned s3 image uploads"
```

### Task 16: Build Community media composer and repair support-modal focus

**Files:**
- Modify: `apps/web/src/lib/communityApi.ts`
- Create: `apps/web/src/components/CommunityComposer.tsx`
- Create: `apps/web/src/components/CommunityComposer.test.tsx`
- Create: `apps/web/src/components/CommunityMediaGrid.tsx`
- Modify: `apps/web/src/pages/CommunityPage.tsx`
- Modify: `apps/web/src/pages/CommunityDetailPage.tsx`
- Modify: `apps/web/src/pages/manage/ManageVenuesPage.tsx`
- Modify: `apps/web/src/pages/manage/ManageVenueDetailPage.tsx`
- Create: `apps/web/src/pages/manage/ManageVenueImages.test.tsx`
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Modify: `apps/web/src/components/ui.tsx`
- Modify: `apps/web/src/pages/SupportPage.tsx`
- Create: `apps/web/src/pages/SupportPage.test.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Web upload pipeline: authorize -> PUT file -> submit post metadata.
- `Modal` accepts `initialFocusRef?: RefObject<HTMLElement | null>` and only runs initial focus when `open` changes false -> true.

- [ ] **Step 1: Write failing media composer tests**

Cover Community and venue-image select/drop, preview URL cleanup, max four Community files, per-file progress/error/retry, remove before submit, successful metadata submission, `object-fit: cover`, lazy image and lightbox keyboard close.

- [ ] **Step 2: Implement composer and media grid**

Revoke object URLs on remove/unmount, retain text if one upload fails, and disable `Đăng bài` until all selected files are uploaded or removed. Reuse the same upload state machine in provider venue create/edit, but call the Venue-owned authorization endpoint and namespace.

- [ ] **Step 3: Write failing support focus regression test**

Type three characters in subject and body and assert focus/caret stays in the field after every render; closing returns focus to `Tạo ticket mới`; Tab remains trapped while open.

- [ ] **Step 4: Stabilize modal identity/focus**

Move modal child components out of render scope, do not key the modal by form values, and focus the subject only once on opening instead of always focusing the first button.

- [ ] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/web -- src/components/CommunityComposer.test.tsx src/pages/manage/ManageVenueImages.test.tsx src/pages/SupportPage.test.tsx
git add apps/web/src/lib/communityApi.ts apps/web/src/lib/venueBookingApi.ts apps/web/src/components/CommunityComposer.tsx apps/web/src/components/CommunityComposer.test.tsx apps/web/src/components/CommunityMediaGrid.tsx apps/web/src/pages/CommunityPage.tsx apps/web/src/pages/CommunityDetailPage.tsx apps/web/src/pages/manage/ManageVenuesPage.tsx apps/web/src/pages/manage/ManageVenueDetailPage.tsx apps/web/src/pages/manage/ManageVenueImages.test.tsx apps/web/src/components/ui.tsx apps/web/src/pages/SupportPage.tsx apps/web/src/pages/SupportPage.test.tsx apps/web/src/index.css
git commit -m "feat(community): add post images and stable ticket focus"
```

### Task 17: Close Account, Venue and Finance frontend capability gaps

**Files:**
- Modify: `apps/web/src/components/AuthForm.tsx`
- Modify: `apps/web/src/pages/AuthPage.tsx`
- Modify: `apps/web/src/pages/ResetPasswordPage.tsx`
- Modify: `apps/web/src/pages/ProfilePage.tsx`
- Modify: `apps/web/src/pages/VenueListPage.tsx`
- Modify: `apps/web/src/pages/VenueDetailPage.tsx`
- Modify: `apps/web/src/components/FinancePanel.tsx`
- Modify: `apps/web/src/lib/accountApi.ts`
- Modify: `apps/web/src/lib/financeApi.ts`
- Modify: `apps/web/src/lib/venueBookingApi.ts`
- Create: `apps/web/src/pages/accountVenueFinanceSurfaces.test.tsx`

**Interfaces:**
- Every Account/Venue/Finance external business route in the capability matrix has a visible control or read surface.
- SePay intent view renders amount/match code/copy action and polls the owning aggregate; it never calls the webhook from the browser.

- [ ] **Step 1: Write failing Account surface tests**

Cover verify/resend, login, server logout, forgot/reset/change password, profile display name/avatar/phone/visibility and role badge. Assert server logout is attempted before local cleanup.

- [ ] **Step 2: Implement Account controls using existing endpoints**

Keep auth mode state stable, display field-level validation and make avatar URL editable until the shared media route is authorized for account avatars in a later product decision.

- [ ] **Step 3: Write failing Venue/Finance surface tests**

Cover venue radius/min/max price/sort/date/time filters, public venue detail, wallet top-up intent, wallet list/ledger, player dispute eligible/list/create and booking balance/SePay terminal behavior.

- [ ] **Step 4: Implement Venue/Finance controls and safe SePay polling**

Map search controls to the full current `/search` contract. Top-up and booking payment show business copy, copyable match code and outcome from wallet/booking refresh; they do not expose payment intent UUID.

- [ ] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/web -- src/pages/accountVenueFinanceSurfaces.test.tsx
git add apps/web/src/components/AuthForm.tsx apps/web/src/pages/AuthPage.tsx apps/web/src/pages/ResetPasswordPage.tsx apps/web/src/pages/ProfilePage.tsx apps/web/src/pages/VenueListPage.tsx apps/web/src/pages/VenueDetailPage.tsx apps/web/src/components/FinancePanel.tsx apps/web/src/lib/accountApi.ts apps/web/src/lib/financeApi.ts apps/web/src/lib/venueBookingApi.ts apps/web/src/pages/accountVenueFinanceSurfaces.test.tsx
git commit -m "feat(web): expose account venue and finance capabilities"
```

### Task 18: Close Matchmaking, Community and Support frontend capability gaps

**Files:**
- Modify: `apps/web/src/pages/MatchDetailPage.tsx`
- Modify: `apps/web/src/pages/MatchListPage.tsx`
- Modify: `apps/web/src/pages/PassportPage.tsx`
- Modify: `apps/web/src/pages/CommunityPage.tsx`
- Modify: `apps/web/src/pages/CommunityDetailPage.tsx`
- Modify: `apps/web/src/pages/SupportPage.tsx`
- Modify: `apps/web/src/lib/matchApi.ts`
- Modify: `apps/web/src/lib/communityApi.ts`
- Modify: `apps/web/src/lib/financeApi.ts`
- Create: `apps/web/src/pages/matchCommunitySupportSurfaces.test.tsx`

**Interfaces:**
- Every Matchmaking/Community/Support external business route in the capability matrix has a visible control or read surface.
- Join/payment/evaluation actions are derived from `MatchDetail.actions`; UI never grants an action from role alone.

- [ ] **Step 1: Write failing Matchmaking surface tests**

Cover create/list/detail/cancel match, join request/pending list/approve/reject/withdraw, participant and organizer balance/SePay payments, submit evaluation, own/public Passport and AI suggestion navigation.

- [ ] **Step 2: Implement action-state Match detail**

Reload match/join/contribution state after every terminal action. Organizer sees pending JOIN and contribution state; participant sees own JOIN/payment/withdraw state; unavailable actions render an explanation instead of a disabled mystery button.

- [ ] **Step 3: Write failing Community/Support surface tests**

Cover public/own post list, detail, edit/delete, comment create/delete, report create, own reports, ticket list/create/detail/message/resolve/close and policy-assistant source/action rendering.

- [ ] **Step 4: Implement Community activity and ticket lifecycle**

Keep ownership actions inside the owned post/comment card, preserve content after request errors and show admin-only status transitions only in Admin workspace.

- [ ] **Step 5: Run focused proof and commit**

```powershell
npm test -w @khoaluantn/web -- src/pages/matchCommunitySupportSurfaces.test.tsx
git add apps/web/src/pages/MatchDetailPage.tsx apps/web/src/pages/MatchListPage.tsx apps/web/src/pages/PassportPage.tsx apps/web/src/pages/CommunityPage.tsx apps/web/src/pages/CommunityDetailPage.tsx apps/web/src/pages/SupportPage.tsx apps/web/src/lib/matchApi.ts apps/web/src/lib/communityApi.ts apps/web/src/lib/financeApi.ts apps/web/src/pages/matchCommunitySupportSurfaces.test.tsx
git commit -m "feat(web): expose match community and support capabilities"
```

### Task 19: Complete shared UI states, accessibility and responsive polish

**Files:**
- Create: `apps/web/src/components/RouteState.tsx`
- Create: `apps/web/src/components/RouteState.test.tsx`
- Modify: `apps/web/src/components/ui.tsx`
- Modify: `apps/web/src/index.css`
- Modify: all pages changed in Tasks 3–18

**Interfaces:**
- `RouteState` variants: `loading | empty | error | forbidden`, with optional retry/action.
- Shared async button contract: disabled while pending, visible progress label, no duplicate request.

- [ ] **Step 1: Write failing shared-state accessibility tests**

Assert semantic roles, retry callback, focus-visible styles, 44×44 touch targets, reduced-motion class and no content conveyed by color alone.

- [ ] **Step 2: Implement shared route states and apply them to every route**

Each route must have observable loading, empty, error, forbidden and retry behavior. Field/action errors remain local; global fatal errors use `RouteState`.

- [ ] **Step 3: Run the one technical checkpoint before browser acceptance**

Run lint, repository typecheck/build and capability coverage once. Fix compile/static errors here so the final browser session tests only observable product behavior.

- [ ] **Step 4: Run focused proof, technical checkpoint and commit**

```powershell
npm test -w @khoaluantn/web -- src/components/RouteState.test.tsx
npm run ui:coverage
npm run lint -w @khoaluantn/web
npm run typecheck
npm run build
git add apps/web/src/components apps/web/src/index.css apps/web/src/pages apps/web/src/manage apps/web/src/admin
git commit -m "feat(web): complete accessible responsive states"
```

### Task 20: Run final browser acceptance and close the acceptance ledger

**Files:**
- Modify: `docs/plans/active/role-aware-full-ui-ux-completion.md`
- Modify: `docs/plans/active/figma-full-screen-coverage.md`
- Move on completion: `docs/plans/active/role-aware-full-ui-ux-completion.md` -> `docs/plans/completed/role-aware-full-ui-ux-completion.md`

**Interfaces:**
- Acceptance uses the running application in the real browser with real API/DB/Socket.IO; không dùng Playwright, route interception hoặc test script.
- Acceptance ledger maps all 18 approved PO notes and every capability manifest row to a named browser step, focused test from earlier tasks, screenshot or explicit PO waiver.

- [ ] **Step 1: Prepare browser sessions and observable diagnostics**

Open the running app in browser, keep DevTools Console and Network visible, and prepare three authenticated contexts: player, approved provider and admin. Do not inject tokens or bypass UI login.

- [ ] **Step 2: Verify the complete player journey in browser**

Register/verify/login -> update profile/password -> filter/view venue -> select two contiguous slots -> confirm -> pay -> confirmation -> wallet label -> refund preview inline -> cancel -> cancelled tab. Confirm correct `dd/MM/yyyy`, countdown stops, controls lock during payment and no technical UUID appears.

- [ ] **Step 3: Verify provider onboarding and workspace in browser**

From a player account submit `Hợp tác chủ sân`; approve it in admin context; return to the original browser and verify role refresh/switcher. In provider context create/edit venue with images, add/deactivate court, configure hours/closure/pricing/rule, create/cancel walk-in booking, handle replacement/cancellation incident, review revenue and submit/cancel withdrawal.

- [ ] **Step 4: Verify the complete admin workspace in browser**

Open Account, Provider, Booking, Withdrawal, Reconciliation, Dispute, Moderation, Evaluation and Ticket queues. Perform one valid action in each queue and verify status, business label, confirmation reason and affected list refresh.

- [ ] **Step 5: Verify matchmaking, AI, Community and Support in browser**

Create a match from a valid hold/held booking; use a second player context to observe Quick Match progress, accept, organizer approve, participant/organizer payment and withdrawal/cancel states. Verify own/public Hồ sơ trình độ, 7-day cooldown, grounded AI match chat, policy-support mode, image post CRUD, comment/report/moderation and ticket typing/reply/status without focus jumping.

- [ ] **Step 6: Review responsive and runtime quality directly in browser**

Resize to 375×812, 768×1024 and 1280×800 on shell, booking, provider, admin, AI and Community pages. Verify no horizontal overflow, keyboard/focus behavior, reduced-motion behavior, no console error and no failed request on successful paths. Capture browser screenshots for every major context and any recovered error state.

- [ ] **Step 7: Update the durable plan and commit browser evidence**

Record pass/fail của từng browser step, thời điểm kiểm tra, screenshot, lỗi console/network, known limitations và evidence của từng PO note. Move this plan to completed only when all gates pass or PO explicitly waives a named gap.

```powershell
git add docs/plans/active/figma-full-screen-coverage.md docs/plans/completed/role-aware-full-ui-ux-completion.md
git commit -m "docs(acceptance): record final browser verification"
```

## Progress

- [x] Design sections and technical architecture approved by PO.
- [x] Design spec committed as `753e666`.
- [x] Implementation plan drafted and self-reviewed.
- [x] Task 1 — authority and web test harness (`aaf0243`, fixes `486fd3a`, `96637c3`; review PASS).
- [x] Task 2 — session refresh and role context.
- [x] Task 3 — role-aware shell.
- [x] Task 4 — multi-slot booking selection.
- [x] Task 5 — payment terminal UX.
- [ ] Task 6 — cancellation and wallet labels.
- [x] Task 7 — provider onboarding/read models.
- [ ] Task 8 — provider venue operations.
- [ ] Task 9 — provider calendar/incidents/finance.
- [ ] Task 10 — admin core queues.
- [ ] Task 11 — admin operations queues.
- [x] Task 12 — weekly level declaration.
- [ ] Task 13 — Quick Match and match sources.
- [x] Task 14 — grounded AI chat.
- [ ] Task 15 — object storage and media backend.
- [ ] Task 16 — Community media and ticket focus.
- [ ] Task 17 — Account/Venue/Finance FE coverage.
- [ ] Task 18 — Match/Community/Support FE coverage.
- [ ] Task 19 — accessibility/responsive polish.
- [ ] Task 20 — final browser acceptance.

## Validation

- Focused proof: task-specific Vitest/Supertest suites listed above.
- Integration proof: focused migration/domain files only when the task changes persistence, RabbitMQ or Socket.IO behavior.
- Technical checkpoint before final browser: `npm run ui:coverage`, web lint, repository typecheck/build and diff check exactly once.
- Final proof: browser acceptance Steps 1–7 above; no Playwright/E2E or aggregate test script.
- Capability completeness: manifest row has a focused-test evidence ID or named browser step, and Task 19 reports zero unclassified capability before browser acceptance begins.

## Result

Pending implementation. On completion, record verified pass counts, accepted screenshots, residual limitations, migration recovery result and PO waivers before moving this file to `docs/plans/completed/`.
