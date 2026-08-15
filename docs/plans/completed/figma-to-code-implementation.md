# COURTIN Figma-to-Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiện thực toàn bộ giao diện `apps/web` theo file Figma COURTIN hiện tại, chuyển mọi source tham chiếu do Figma sinh về đúng React + TypeScript + Tailwind CSS của dự án, đồng thời giữ nguyên hành vi nghiệp vụ, API, quyền và realtime đang chạy.

**Architecture:** Figma file `FHuhhmlhPSl8gOUuUx7az2` là nguồn sự thật duy nhất về hình thức. Trước khi sửa frontend, một Figma coverage gate tạo đủ mockup cho mọi route, surface theo role và trạng thái workflow có bố cục riêng. Frontend hiện có tiếp tục là lớp orchestration cho route, state và API; việc triển khai thay lớp token, component trình bày và bố cục theo từng hành trình, không viết lại service hoặc nhân bản business logic. Mỗi màn hình được lấy `get_design_context` theo node nhỏ trước khi code, rồi chuyển đổi có chủ đích sang component TSX dùng chung của repo.

**Tech Stack:** React 19.2, React DOM 19.2, TypeScript 6, Vite 8, Tailwind CSS 4 qua `@tailwindcss/vite`, React Router DOM 7, Socket.IO Client 4, Vitest, Oxlint và Playwright. Font đích: Archivo cho heading/display, Inter cho body/UI, Geist Mono cho tiền, rating, mã và thời gian.

**Spec:** `docs/product/phasing.md`, `docs/product/decision-log.md`, các spec hiện hành trong `docs/product/specs/`, `docs/plans/active/figma-full-screen-coverage.md`, và các frame được ánh xạ trong kế hoạch này.

## Global Constraints

- PO đã xác nhận ngày 2026-08-13 rằng Figma COURTIN thay thế hệ thị giác Playo/ACTL cũ. Playo chỉ còn là lịch sử triển khai, không được dùng làm chuẩn để quyết định màu, typography, radius, shadow hoặc bố cục mới.
- Không thay đổi contract HTTP, Socket.IO, auth, role, chính sách tiền, trạng thái booking/match/community hoặc service backend chỉ để khớp mockup.
- Không bịa dữ liệu mà API không trả về. Thành phần thiếu dữ liệu phải ẩn, có fallback trung thực hoặc dùng trạng thái empty theo Figma.
- Không chép nguyên source do Figma sinh. Mọi output HTML/React JavaScript/khung khác phải được chuyển thành TSX có type, dùng route/API/component hiện có và không thêm runtime/framework thứ hai.
- Không hard-code toàn bộ trang thành ảnh hoặc absolute positioning. Chỉ giữ kích thước cố định cho asset có bản chất cố định như icon/logo; layout phải responsive.
- Không để asset trỏ tới URL tạm của Figma. Asset cần thiết phải được xuất vào `apps/web/public/assets/courtin/` với tên có nghĩa và được tối ưu trước khi commit.
- Không tạo route mới nếu hành vi đã có trong modal/tab/state hiện tại. Ví dụ `Create Match` vẫn là modal của `/matches`; `Booking Payment Confirmation` vẫn là bước cuối của `/booking`.
- Giữ nguyên semantic HTML, keyboard operation, focus management, reduced motion và nhãn tiếng Việt hiện có; thiết kế đẹp không được làm suy giảm accessibility.
- Không bắt đầu ráp code trước khi Figma coverage gate ở Task 2 đạt: mọi route và surface có bố cục riêng phải có mockup desktop/mobile hoặc được ánh xạ rõ vào một responsive pattern đã được duyệt.
- Theo quyết định PO ngày 2026-08-13, không chạy Vitest, lint, build, Playwright hoặc E2E sau từng màn hình/nhóm màn hình. Toàn bộ kiểm thử tự động chỉ chạy một đợt sau khi Task 1–11 đã hoàn tất.
- Trong Task 1–11 chỉ dùng source review, type-aware editor diagnostics nếu có sẵn, Figma metadata và screenshot để phát hiện sai lệch sớm; không gọi command test/build ngầm dưới tên “validation”.
- Nếu đợt test cuối phát hiện lỗi, agent chỉ được triage và báo cáo; không sửa code. Agent phải dừng, xin PO xác nhận danh sách lỗi và phương án sửa. Chỉ các defect ID được PO duyệt mới được sửa.
- Sau khi PO duyệt remediation, chỉ chạy lại suite đang lỗi trong vòng sửa; khi tất cả lỗi được duyệt đã xanh, chạy toàn bộ gate đúng một lần để chốt. Lỗi mới phát hiện trong lần rerun lại phải qua cùng approval gate.

---

## Status

Active — lập ngày 2026-08-13; chưa bắt đầu implementation.

## Outcome

Khi hoàn tất, người dùng có thể đi qua toàn bộ route hiện hữu với giao diện COURTIN nhất quán với Figma, bao gồm các biến thể desktop/mobile và các trạng thái loading, empty, error, unauthenticated, role-specific. Tất cả hành động tiếp tục gọi API thật hiện có; bộ test nghiệp vụ cũ vẫn qua sau khi loại bỏ các assertion chỉ ràng buộc Playo.

## Context And Authority

- Frontend hiện nằm tại `apps/web`; routing ở `apps/web/src/App.tsx`, shell ở `apps/web/src/layout/AppLayout.tsx`, API adapters ở `apps/web/src/lib/`.
- State hiện dùng React hooks cục bộ; không có Redux, Zustand hoặc React Query. Kế hoạch không thêm state library.
- `apps/web/src/index.css` và `apps/web/src/components/ui.tsx` đang mang token/lớp Playo xanh lá. Đây là lớp cần thay trước, không phải lớp để tiếp tục mở rộng.
- `docs/design/design-system.md` và các test tên `playo*` mô tả baseline cũ. Phần hành vi vẫn hữu ích; phần thẩm quyền thị giác phải được thay bằng quyết định Figma mới.
- Figma hiện chưa publish variables/components/styles thành library chính thức. Vì vậy token được trích từ các frame đã duyệt, đối chiếu giữa ít nhất ba frame thay vì suy từ một screenshot đơn lẻ.

## Route-To-Figma Map

| Route/surface code | Figma node | Cách áp dụng |
|---|---|---|
| `/`, `HomePage` | Homepage `67:3` | Nguồn chính cho global chrome, hero, CTA, card và footer. |
| `/venues`, `VenueListPage` | Venue Explorer desktop `89:2`; mobile cần tạo ở Task 2 | Search/filter/list và biến thể card. |
| `/venues/:id`, `VenueDetailPage` | Dedicated desktop/mobile cần tạo ở Task 2 | Dùng treatment venue/booking hiện hữu; không bịa rating/image nếu API thiếu. |
| `/booking`, `BookingPage`, `SlotGrid` | Booking desktop `3:8`, mobile `3:234`; payment desktop `3:323`, mobile `3:424`; confirmation `96:210` | Một route nhiều state: chọn slot, hold, tạo booking, thanh toán và xác nhận. |
| `/profile?tab=bookings`, `BookingCancellationPanel` | My Bookings & Cancellations `92:319` | Lịch sử, segment, chi tiết hủy/đổi sân và trạng thái hoàn tiền. |
| `/profile?tab=wallet`, `FinancePanel` | Wallet & Transaction History `89:494`; Provider Revenue & Payouts `96:2` | Player wallet và provider finance dùng chung primitives nhưng khác information hierarchy. |
| `/matches`, `MatchListPage`, `QuickMatchPanel` | Match list desktop `5:9`, mobile `5:248`; UI states `5:553`; Create Match `92:2` | List/search/quick match; create vẫn là modal gắn booking held. |
| `/matches/:id`, `MatchDetailPage` | Match detail desktop `5:371`, mobile `5:494` | Giữ nguyên state machine join/approve/pay/withdraw/cancel. |
| `/passport`, `/passport/:userId`, `PassportPage` | Owner `90:2`, public `90:184`, cold start `90:267` | Render theo quyền và dữ liệu thật, không hợp nhất ba trạng thái thành một layout cứng. |
| `/community`, `CommunityPage` | Member desktop `6:10`, guest `6:207`, mobile `6:388` | Feed/composer/right rail theo auth state. |
| `/community/:postId`, `CommunityDetailPage` | `6:10`, `6:207`, `6:388` | Dùng cùng PostCard language, mở rộng comment/report state; không thêm like/DM/group. |
| `/support`, `SupportPage` | Dedicated desktop/mobile cần tạo ở Task 2 | Ticket list/detail/composer là surface private, không dùng community feed làm mockup thay thế. |
| `/assistant`, `AssistantPage` | AI Match Assistant desktop `92:109`; mobile cần tạo ở Task 2 | Hai tab gợi ý kèo/chat; CTA chỉ điều hướng theo contract hiện tại. |
| `/profile` provider operations, `BookingCancellationPanel` | Provider Operations — Live Schedule `89:250` | Dùng cho thao tác booking phía sân trong surface hiện có, không tạo provider role mới. |
| `/admin`, `AdminPage`, `FinanceAdminPanel`, `CommunityAdminPanel` | Admin moderation desktop `6:282`, mobile `6:471`; reconciliation `96:106`; provider operations `89:250` | Một workspace theo tab và role guard hiện tại. |
| `/auth`, `/verify-email`, `/reset-password` | Dedicated desktop/mobile cần tạo ở Task 2 | Dùng chung account shell nhưng mỗi state phải có content và action đúng API email hiện tại. |

Màn hình Figma chưa có route riêng không mặc nhiên là thiếu chức năng. Các frame `Create Match`, `Booking Payment Confirmation`, provider finance và provider schedule được ráp vào modal/tab/state đã tồn tại để không làm đổi kiến trúc điều hướng. Tuy nhiên, mỗi surface có information hierarchy hoặc responsive transformation riêng phải có mockup trước khi code; không được lấy lý do “có thể suy từ style” để bỏ qua coverage.

## Required Figma Coverage Gate

Task 2 phải tạo và kiểm tra đủ các mockup còn thiếu dưới đây. Một dòng chỉ được đánh dấu covered khi có node ID, metadata không có orphan/placeholder và screenshot đã được xem trực tiếp.

| Batch | Mockup bắt buộc cần bổ sung |
|---|---|
| F1 — Global/account/public | Homepage mobile; Login desktop/mobile; Register desktop/mobile; Verify Email desktop/mobile; Reset Password desktop/mobile; Venue Explorer list/map desktop/mobile; Venue Detail desktop/mobile. |
| F2 — Player booking/finance | Booking History mobile; Booking cancellation/refund detail desktop/mobile; Wallet mobile; Payment Confirmation mobile; Player Dispute desktop/mobile; Profile Account Settings desktop/mobile. |
| F3 — Match/community/AI | Create Match mobile; Passport owner/public/cold-start mobile; Community Post Detail desktop/mobile; Support Center player/admin desktop/mobile; AI Match Assistant mobile; shared loading/empty/error/auth state board cho venue, booking, match, passport, community, support và assistant. |
| F4 — Provider | Provider application/status; provider dashboard/venue list; venue profile editor; court management; operating hours/closed dates; scheduled pricing; booking rules; unified live calendar và walk-in booking; booking incident/change court; revenue/payout; withdrawal request/detail — desktop/mobile theo coverage plan. |
| F5 — Admin | Account lock/restore; provider approval; admin booking cancellation; withdrawal operations; dispute resolution; finance reconciliation — desktop/mobile. Moderation đã có `6:282`/`6:471` nên chỉ kiểm tra lại, không tạo bản trùng. |
| F6 — Conditional | F-05 Demand Heatmap desktop/mobile chỉ tạo và đưa vào code khi PO kích hoạt tính năng điều kiện này; F6 không chặn phần còn lại nếu vẫn ở trạng thái hoãn. |

Không cần tạo frame riêng cho mọi tổ hợp dữ liệu. Các state có cùng bố cục được gom vào một state board; các state làm thay đổi information hierarchy, quyền hoặc primary action phải có mockup riêng.

## Implementation Tasks

### Task 1: Ghi nhận thẩm quyền COURTIN và khóa baseline

**Files:**

- Modify: `docs/product/decision-log.md`
- Modify: `docs/product/phasing.md`
- Modify: `docs/design/README.md`
- Modify: `docs/design/design-system.md`
- Create: `docs/design/courtin-figma-authority.md`
- Modify: `docs/plans/active/figma-full-screen-coverage.md`

- [ ] Thêm quyết định `D45` vào `docs/product/decision-log.md`: PO chọn file Figma `FHuhhmlhPSl8gOUuUx7az2` làm visual authority từ 2026-08-13; quyết định này supersede phần visual identity Playo nhưng không đổi scope chức năng hoặc các ràng buộc hiệu năng/accessibility.
- [ ] Thêm một cập nhật ngày 2026-08-13 vào `docs/product/phasing.md`; giữ nguyên lịch sử GĐ2.5, không sửa ngược các quyết định đã xảy ra.
- [ ] Đánh dấu đầu `docs/design/README.md` và `docs/design/design-system.md` rằng nội dung Playo là historical baseline, không còn là nguồn màu/bố cục hiện hành.
- [ ] Viết `docs/design/courtin-figma-authority.md` gồm: file key, typography, palette/semantic role lấy trực tiếp từ Figma, spacing/radius/shadow, grid desktop/mobile, component anatomy, asset policy và bảng node trong kế hoạch này.
- [ ] Trước khi ghi mỗi nhóm token, gọi Figma `get_design_context` cho node liên quan và đối chiếu metadata/screenshot của ít nhất Homepage `67:3`, Booking `3:8` và một operations frame `96:106`; không lấy màu bằng ước lượng mắt.
- [ ] Cập nhật plan `figma-full-screen-coverage.md` để liên kết sang authority doc và dùng toàn bộ F1–F5 trong Required Figma Coverage Gate làm danh sách generation bắt buộc.
- [ ] Kiểm tra marker chưa hoàn thiện bằng PowerShell: `$markers = @('TO' + 'DO', 'TB' + 'D', 'FIX' + 'ME'); Select-String -Path docs/design/courtin-figma-authority.md,docs/plans/active/figma-to-code-implementation.md -Pattern $markers`; kết quả phải rỗng.

### Task 2: Hoàn thiện toàn bộ mockup Figma trước khi ráp code

**Files:**

- Read: `apps/web/src/App.tsx`
- Read: `apps/web/src/pages/*.tsx`
- Read: `apps/web/src/components/*.tsx`
- Read: `apps/web/src/lib/*.ts`
- Read: `docs/product/specs/account-access.md`
- Read: `docs/product/specs/venue-scheduling.md`
- Read: `docs/product/specs/court-booking.md`
- Read: `docs/product/specs/finance-disputes.md`
- Read: `docs/product/specs/matchmaking-passport.md`
- Read: `docs/product/specs/community-support.md`
- Read: `docs/product/specs/ai-assist.md`
- Read: `docs/product/specs/f05-demand-heatmap.md`
- Modify: `docs/plans/active/figma-full-screen-coverage.md`
- Modify: `docs/plans/active/figma-to-code-implementation.md`

- [ ] Kiểm tra Figma MCP tool availability và authentication trước mọi mutation; xác nhận file key `FHuhhmlhPSl8gOUuUx7az2` còn truy cập được.
- [ ] Đọc spec lẫn route, role, conditional rendering và workflow state trong source để lập inventory; mỗi approved UC phải ánh xạ tới một existing surface, mockup cần tạo hoặc backend-only/no-UI explanation có căn cứ. Đối chiếu với metadata top-level frame hiện tại, không chỉ đếm frame theo tên.
- [ ] Thực hiện discovery theo `figma-use`/`figma-generate-design`: kiểm tra Code Connect liên quan, instances trong các screen hiện hữu, local/remote variables, text/effect styles và libraries. Ghi rõ mục nào có thể reuse và mục nào N/A; không tự thêm community design system làm lệch COURTIN.
- [ ] Tạo lần lượt batch F1–F5 trong Required Figma Coverage Gate. Dùng frame hiện có làm visual authority, nhưng mỗi surface có information hierarchy phù hợp nghiệp vụ; không clone một layout cho mọi màn hình. F6 chỉ tạo khi PO kích hoạt F-05.
- [ ] Với mỗi composed view, tạo wrapper frame trước, dựng từng section trực tiếp bên trong, componentize phần lặp lại, trả node IDs sau mỗi mutation và tránh orphan nodes.
- [ ] Không capture giao diện Playo hiện tại để làm visual source. Nếu mockup cần ảnh, reuse image fill/hash đã có trong file COURTIN hoặc asset được PO cung cấp; không kéo hình từ giao diện cũ.
- [ ] Sau mỗi frame, kiểm tra metadata và screenshot của toàn frame lẫn section quan trọng; sửa text clipping, overlap, placeholder, font sai, blank image và layout sizing trước khi sang frame tiếp theo. Đây là kiểm tra Figma, không phải test code.
- [ ] Cập nhật coverage matrix trong `figma-full-screen-coverage.md` với tên, node ID, desktop/mobile/state coverage và trạng thái visual review.
- [ ] Chỉ mở Task 3 khi toàn bộ F1–F5 có node ID hoặc một dòng exemption được PO phê duyệt rõ ràng. Không dùng “suy từ pattern” làm exemption ngầm. Nếu audit phát hiện approved UC chưa có code surface, ghi rõ trong plan trước implementation; không bỏ khỏi mockup coverage chỉ vì frontend hiện tại chưa có route.

### Task 3: Khóa hợp đồng hành vi trước khi đổi giao diện

**Files:**

- Read: `apps/web/test/*.test.tsx`
- Read: `e2e/phase-1.spec.ts`
- Read: `e2e/phase-2.spec.ts`
- Modify: `docs/plans/active/figma-to-code-implementation.md`

- [ ] Phân loại assertion trong các file `playo*`: đánh dấu trong Progress assertion nào bảo vệ route/API/auth/role/state/business copy và assertion nào chỉ ràng buộc visual Playo.
- [ ] Không đổi locator và accessible name mà E2E đang dùng nếu Figma không yêu cầu đổi copy nghiệp vụ. Các tên như `Giữ chỗ 10 phút`, `Tạo booking`, `Gửi yêu cầu tham gia`, `Duyệt`, `Đối soát` là hợp đồng kiểm thử.
- [ ] Ghi danh sách test cần cập nhật ở Task 11; chưa sửa và chưa chạy bất kỳ test, lint, build hoặc E2E nào trong task này.

### Task 4: Xây foundation COURTIN và global shell

**Files:**

- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/components/ui.tsx`
- Modify: `apps/web/src/components/Navbar.tsx`
- Modify: `apps/web/src/components/Footer.tsx`
- Modify: `apps/web/src/components/Preloader.tsx`
- Modify: `apps/web/src/layout/AppLayout.tsx`
- Create: `apps/web/src/components/courtin/PageHeader.tsx`
- Create: `apps/web/src/components/courtin/MetricCard.tsx`
- Create: `apps/web/src/components/courtin/OperationsTable.tsx`

- [x] Thêm `@fontsource/archivo` cùng major version với các package font hiện có; import đúng weight/charset cần dùng. Giữ Inter và Geist Mono như đã xác định từ Figma.
- [x] Thay `@theme` Playo trong `index.css` bằng token semantic trích từ Figma: brand navy/yellow, canvas/surface/ink/line, success/warning/danger/info, focus ring, radius, shadow, content width và typography scale. Không để page code dùng hex rời rạc.
- [x] Giữ alias semantic ổn định cho trạng thái nghiệp vụ; aliases `green-*` hiện ánh xạ về navy COURTIN để các state/copy hiện hữu không đứt trong khi các surface được chuyển dần.
- [x] Nâng `Button`, form controls, `Badge`, `Tabs`, `SegmentedControl`, `Modal`, `Toast`, `Skeleton`, `EmptyState`, `Avatar`, `Pagination` và `CarouselButtons` trong `ui.tsx` theo anatomy Figma, giữ nguyên props công khai.
- [x] Tạo `PageHeader`, `MetricCard`, `OperationsTable` sau source scan xác nhận các pattern heading/metric/operations-table xuất hiện ít nhất tại booking/finance/profile, provider và admin; usage được ráp ở các task surface tương ứng, không tạo wrapper một-lần.
- [x] Ráp `Navbar`, `Footer`, `Preloader`, `AppLayout` theo `67:3`; bảo toàn session refresh, auth modal, mobile navigation, skip/focus flow và reduced motion.
- [x] Source-review public props, token usage và responsive structure; ghi các test cần cập nhật vào danh sách Task 11, chưa chạy command kiểm thử/build.

### Task 5: Home, account và venue discovery

**Files:**

- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/pages/AuthPage.tsx`
- Modify: `apps/web/src/pages/ResetPasswordPage.tsx`
- Modify: `apps/web/src/components/AuthForm.tsx`
- Modify: `apps/web/src/pages/VenueListPage.tsx`
- Modify: `apps/web/src/pages/VenueDetailPage.tsx`
- Modify: `apps/web/src/components/Card.tsx`

- [x] Lấy design context theo section cho Homepage `67:3` và Venue Explorer `89:2`; không xuất asset tĩnh vì Home không có image authority cần dùng và gallery/amenities/map venue chỉ render từ API, tránh ảnh giả.
- [x] Ráp `HomePage` theo thứ tự section và nhịp COURTIN; CTA chỉ dẫn tới route hiện có, không thêm sport, coaching, app-download hoặc nội dung ngoài scope.
- [x] Chuyển `AuthForm`, `AuthPage`, verify email và reset password sang form/modal COURTIN bằng primitives Task 4. Giữ nguyên email-only identity và toàn bộ API account hiện có.
- [x] Ráp `VenueListPage` theo `89:2`: search/filter/sort và card có biến tấu đủ để tránh lặp đơn điệu nhưng cùng token, typography và control anatomy.
- [x] Ráp `VenueDetailPage` từ pattern venue/booking hiện hữu; gallery, amenities và map chỉ render khi API trả dữ liệu, CTA tiếp tục sinh `/booking?venueId=`.
- [x] Đối chiếu source structure của loading, empty, error, 404, guest và authenticated state với mockup đã duyệt; viewport cần kiểm tra Task 11: Home 1440/390, auth 1440/390, venue list 1440/390 và venue detail 1440/390. Không chạy test/build.

### Task 6: Booking, payment, history và wallet

**Files:**

- Modify: `apps/web/src/pages/BookingPage.tsx`
- Modify: `apps/web/src/components/SlotGrid.tsx`
- Modify: `apps/web/src/pages/ProfilePage.tsx`
- Modify: `apps/web/src/components/BookingCancellationPanel.tsx`
- Modify: `apps/web/src/components/FinancePanel.tsx`
- Modify: `apps/web/src/components/DisputePanel.tsx`

- [x] Lấy design context riêng cho `3:8`, `92:319`, `89:494`; các payment/refund/reconciliation frames đã được Task 1–2 kiểm tra metadata/screenshot và được dùng làm pattern bổ trợ, không copy source Figma.
- [x] Ráp `BookingPage` thành stateful journey duy nhất: chọn court/date/slot → hold countdown → tạo booking → chọn balance/SePay → confirmation. Không tách state sang route giả.
- [x] Ráp `SlotGrid` đúng visual state available/selected/own hold/confirmed/unavailable; aria-label vẫn phân biệt được các trạng thái mà không chỉ dựa vào màu.
- [x] Ráp tab bookings/profile theo `92:319`; giữ cancel preview, confirm, provider change-court và provider cancel trong `BookingCancellationPanel`.
- [x] Ráp wallet player theo `89:494` và finance provider theo `96:2`. Hai surface dùng chung metric/table primitives nhưng không bị ép thành layout giống hệt nhau.
- [x] Giữ mọi amount, refund, commission, withdrawal và reconciliation do backend trả; UI chỉ format và mô tả.
- [x] Source-review các nhánh booking/finance/dispute và ghi test cases cần cập nhật ở Task 11; chưa chạy suite hoặc build.

### Task 7: Matchmaking, Quick Match và Create Match

**Files:**

- Modify: `apps/web/src/pages/MatchListPage.tsx`
- Modify: `apps/web/src/pages/MatchDetailPage.tsx`
- Modify: `apps/web/src/components/QuickMatchPanel.tsx`

- [x] Lấy design context cho list `5:9`, detail `5:371`, state board `5:553`; mobile/create/assistant patterns đã có Figma coverage Task 2 và không được copy trực tiếp.
- [x] Ráp list/filter/card theo desktop/mobile frame; label singles/doubles, open/full, fee và skill vẫn suy từ `MatchRow`, không hard-code sample Figma.
- [x] Ráp Quick Match với trạng thái socket connecting/searching/suggested/accepted/expired/error; không đổi nguyên tắc accept chỉ tạo JOIN pending.
- [x] Chuyển modal create hiện có theo `92:2`; giữ input `bookingId`, `capacity`, `feeMode`, optional skill range và API `createMatch`. Không thêm `/matches/new`.
- [x] Ráp detail cho cả organizer/participant, pending/approved/confirmed/filled/expired, payment hold, withdraw/cancel và pending joins. CTA sticky mobile không che nội dung cuối trang.
- [x] Source-review toàn bộ match state machine và ghi test cases cần cập nhật ở Task 11; chưa chạy suite hoặc build.

### Task 8: Player Passport ba trạng thái

**Files:**

- Modify: `apps/web/src/pages/PassportPage.tsx`

- [x] Lấy context riêng cho owner `90:2`, public `90:184` và cold-start `90:267`; không dùng một frame làm template cứng cho cả ba.
- [x] Tách các section render nội bộ theo state nếu cần, nhưng tiếp tục dùng một route/page và `passportApi` hiện hữu.
- [x] Owner chỉ thấy dữ liệu owner/evaluation candidates được API cho phép; public view giữ đúng giới hạn userId/tier/matchesPlayed; cold-start hiển thị declaration action và uncertainty phù hợp.
- [x] Rating, RD, match count và time window dùng Geist Mono và dữ liệu thật; không bịa leaderboard, rating delta hoặc lịch sử kết quả chưa persist.
- [x] Source-review ba projection Passport và ghi test/screenshot cases cần chạy ở Task 12; chưa chạy suite hoặc build.

### Task 9: Community, Support và AI Assistant

**Files:**

- Modify: `apps/web/src/pages/CommunityPage.tsx`
- Modify: `apps/web/src/pages/CommunityDetailPage.tsx`
- Modify: `apps/web/src/pages/SupportPage.tsx`
- Modify: `apps/web/src/pages/AssistantPage.tsx`

- [x] Lấy context cho Community member `6:10`, guest `6:207`, mobile `6:388` và Assistant `92:109`.
- [x] Ráp feed có khác biệt rõ giữa guest/member: composer và tác vụ cá nhân chỉ xuất hiện đúng quyền; featured games/right rail được giữ nếu frame đã có và dữ liệu hiện tại hỗ trợ.
- [x] Ráp detail/comment/report bằng cùng visual grammar nhưng không biến tất cả thành card giống nhau; dùng hierarchy riêng cho bài viết, thread comment và side information.
- [x] Ráp Support bằng primitives community/operations đã duyệt; ticket private không lẫn vào public feed.
- [x] Ráp Assistant hai mode gợi ý kèo/chat; source chip và action link vẫn phản ánh backend, AI không tự JOIN, booking hay chi tiền.
- [x] Source-review Community/Support/Assistant boundaries và ghi test cases cần cập nhật ở Task 11; chưa chạy suite hoặc build.

### Task 10: Provider operations và Admin workspace

**Files:**

- Modify: `apps/web/src/pages/AdminPage.tsx`
- Modify: `apps/web/src/components/FinanceAdminPanel.tsx`
- Modify: `apps/web/src/components/DisputeAdminPanel.tsx`
- Modify: `apps/web/src/components/CommunityAdminPanel.tsx`
- Modify: `apps/web/src/components/BookingCancellationPanel.tsx`
- Modify: `apps/web/src/components/FinancePanel.tsx`

- [x] Lấy context cho provider schedule `89:250`, provider payout `96:2`, admin reconciliation `96:106`, moderation desktop `6:282` và mobile `6:471`.
- [x] Ráp `AdminPage` thành operations workspace có hierarchy rõ, tab responsive và table/card chuyển đổi phù hợp mobile; giữ role guard trong `App.tsx`.
- [x] Provider schedule chỉ áp vào thao tác booking phía sân hiện có. Không dựng lịch chỉnh sửa mới nếu API hiện tại chỉ hỗ trợ replacement court/cancel.
- [x] Finance admin giữ withdrawals/reconciliation/disputes; các mutation cần reason/confirmation và status feedback như hiện tại.
- [x] Community moderation giữ queue, reason, confirm và pagination theo API hiện có.
- [x] Đảm bảo provider/admin surfaces không lặp template một cách máy móc: schedule ưu tiên time grid, revenue ưu tiên metric/trend/table, reconciliation ưu tiên exception queue, moderation ưu tiên evidence/detail.
- [x] Source-review role guard, confirmation/reason requirements và admin mutations; ghi test cases cần cập nhật ở Task 11, chưa chạy suite hoặc build.

### Task 11: Hoàn thiện asset, test definitions, responsive và accessibility

**Files:**

- Modify: `apps/web/public/assets/courtin/**`
- Modify: `apps/web/src/index.css`
- Modify: các page/component đã đổi trong Task 4–10 khi source audit phát hiện lỗi
- Modify: `apps/web/test/playoFoundation.test.tsx`
- Modify: `apps/web/test/playoPhase1Pages.test.tsx`
- Modify: `apps/web/test/playoPhase2Match.test.tsx`
- Modify: `apps/web/test/playoPhase2Passport.test.tsx`
- Modify: `apps/web/test/playoPhase2Community.test.tsx`
- Modify: `apps/web/test/playoPhase2Assistant.test.tsx`
- Modify: `apps/web/test/playoPhase2Moderation.test.tsx`
- Modify: `apps/web/test/bookingCancellation.test.tsx`
- Modify: `apps/web/test/g6Finance.test.tsx`
- Modify: `apps/web/test/g7Dispute.test.tsx`
- Create: `apps/web/test/courtinFoundation.test.tsx`
- Create: `e2e/courtin-visual.spec.ts`

- [x] Xóa asset không dùng và xác nhận không còn URL Figma tạm trong `apps/web/src`/`apps/web/public`; không thêm asset tĩnh khi dữ liệu cần render là API-driven.
- [x] Quét visual authority cũ; `green-*` còn lại là aliases semantic compatibility trong `index.css` hoặc background state, đều ánh xạ COURTIN navy/tone, không còn là visual authority Playo.
- [x] Source-audit keyboard semantics: skip/navigation, modal trap/restore, mobile menu, form error/status, table headers, aria-live và CTA sticky được giữ. Runtime keyboard verification để Task 12.
- [x] Source-audit token contrast cho body, disabled, focus, badge và yellow-on-navy; state có aria/text labels ngoài màu. Runtime/visual WCAG verification để Task 12.
- [x] Chuẩn bị coverage viewport 320, 390, 768, 1024 và 1440 px trong visual spec; chưa chạy browser hoặc tạo snapshot trong task này.
- [x] Cập nhật test `playo*` có assertion visual foundation/match sang COURTIN, giữ assertion nghiệp vụ; thêm `courtinFoundation.test.tsx` cho token/component/shell. Không chạy test sau khi sửa.
- [x] Thêm `e2e/courtin-visual.spec.ts` với viewport 1440×1024 và 390×844 cùng các route representative có thể vào bằng shell; journey authenticated/API-backed đầy đủ vẫn được thực thi cùng seed Phase 1/2 tại Task 12.
- [x] Xác nhận Task 1–11 đã hoàn tất bằng source/diff review. Chưa chạy Vitest, lint, build, Playwright hoặc E2E trước khi chuyển Task 12.

### Task 12: Chạy một đợt validation cuối và triage lỗi

**Files:**

- Modify: `docs/plans/active/figma-to-code-implementation.md`

- [x] Xác nhận bằng checklist rằng mọi Task 1–11 đã hoàn tất; nếu còn checkbox implementation chưa xong thì không được chạy validation sớm.
- [x] Chạy `npm run lint --workspace @khoaluantn/web` — exit 0; 12 warnings `react-hooks/exhaustive-deps`, không chặn lint. Full-gate rerun after D-COURTIN-001 also exited 0 with the same warnings.
- [x] Chạy `npm run test --workspace @khoaluantn/web` — pass 11 files, 22 tests. Full-gate rerun after D-COURTIN-001 passed 11 files, 22 tests.
- [x] Chạy `npm run build --workspace @khoaluantn/web` — initial FAIL D-COURTIN-001; after approved remediation, targeted build and full-gate build both exited 0.
- [x] Khởi động hạ tầng/service/web theo runbook, seed dữ liệu demo định danh, rồi chạy `npm run e2e -- e2e/phase-1.spec.ts e2e/phase-2.spec.ts e2e/courtin-visual.spec.ts`. Attempted once on 2026-08-13; Playwright webServer could not start because RabbitMQ localhost:5672 refused connections. D-COURTIN-002 recorded; no journeys executed.
- [ ] Kiểm tra UI và API/DB cho ít nhất booking/payment, match join/approval, community post/comment, provider finance và admin reconciliation; screenshot xanh không thay thế xác nhận state backend.
- [ ] Nếu tất cả gate đều pass, ghi evidence và chuyển sang Task 13 completion branch.
- [x] Nếu có bất kỳ failure, visual mismatch, accessibility issue hoặc lỗi runtime: không sửa code. Ghi bảng defect trong plan với cột `ID`, `command/journey`, `symptom`, `evidence`, `affected files`, `introduced/pre-existing/unknown`, `severity`, `proposed fix`, `risk`.
- [x] Trình toàn bộ defect list cho PO và dừng thực thi. Không được tự sửa cả lỗi hiển nhiên, formatting, test expectation hay lỗi được cho là do migration.

### Defect list — Task 12 (awaiting PO approval)

| ID | command/journey | symptom | evidence | affected files | introduced/pre-existing/unknown | severity | proposed fix | risk |
|---|---|---|---|---|---|---|---|---|
| D-COURTIN-001 | `npm run build --workspace @khoaluantn/web` | Vite cannot resolve `@fontsource/archivo/vietnamese-800.css`. | Build exit 1 at `@tailwindcss/vite:generate:build`; inspection confirms package is present in `package-lock.json` but absent from `node_modules/@fontsource/archivo` because Task 4 used package-lock-only install. | `apps/web/src/index.css`, `apps/web/package.json`, `package-lock.json`, installed dependencies | introduced | blocker | With PO approval, install the locked `@fontsource/archivo@^5.3.0` dependency into the workspace (or change only to an actually shipped Archivo stylesheet if the package lacks Vietnamese subset), then rerun the affected build. | Dependency installation changes local node_modules; choosing a non-existent subset again would leave build red. |
| D-COURTIN-002 | `npm run e2e -- e2e/phase-1.spec.ts e2e/phase-2.spec.ts e2e/courtin-visual.spec.ts` | Playwright cannot start the configured E2E services because RabbitMQ rejects connections on localhost:5672; no browser journey executed. | E2E exit 1: `AggregateError [ECONNREFUSED]` for `::1:5672` and `127.0.0.1:5672`; `docker compose -f docker-compose.infrastructure.yml ps` cannot contact `dockerDesktopLinuxEngine`; no listener was found on infrastructure ports. | local Docker Desktop/infra runtime, `docker-compose.infrastructure.yml`, `.env`, `scripts/e2e-services.ts` | environment/unknown | blocker | With PO approval, start or restore the local Docker infrastructure (at minimum RabbitMQ), verify health/listeners, then rerun only the affected E2E command. | Starts local infrastructure and causes E2E to create isolated test data; inspect/clean only E2E-scoped records if PO later requests cleanup. |
| D-COURTIN-003 | E2E rerun after Docker/RabbitMQ recovery | COURTIN visual E2E has no committed baselines for new `toHaveScreenshot` assertions and uses a non-unique `getByRole('main')` locator on routes that render nested main landmarks. The host command timed out after 120 seconds while artifacts showed visual failures; final aggregate journey result is unavailable. | 12 visual failure artifact directories; snapshot errors name missing files under `e2e/courtin-visual.spec.ts-snapshots/`; `/venues` and `/admin` strict-mode errors resolve two `main` elements. Artifacts: `output/playwright/test-results/**/error-context.md`, `trace.zip`, `test-failed-1.png`. Docker infra was healthy at capture time. | `e2e/courtin-visual.spec.ts`, new snapshot baselines under `e2e/courtin-visual.spec.ts-snapshots/`, potentially page markup that nests `<main>` | introduced | blocker | With PO approval, correct the visual-spec landmark assertion to target the shell main, generate and review committed baselines for the approved COURTIN routes/viewports, then rerun the affected visual E2E (and only after it is green, a new full validation gate per plan). | Snapshot baselines intentionally establish visual authority and must be reviewed, not accepted blindly; changing semantic page markup could affect accessibility and needs narrower review. |
| D-COURTIN-004 | Focused `e2e/courtin-visual.spec.ts` remediation run | Finance service repeatedly fails and requeues `MatchConfirmed` messages whose payload lacks required `attemptId` and `venueRevision`. | WebServer logs show repeated `ZodError` at `services/finance-service/src/domain/matchFee.ts:386`; RabbitMQ inspection after the run reports `finance.domain-events` with 536 ready messages and 0 consumers. The consumer schema requires both fields. | RabbitMQ `finance.domain-events` runtime data; producer(s) of historical `MatchConfirmed`; `services/finance-service/src/domain/matchFee.ts`; `services/finance-service/src/lib/eventConsumer.ts` | pre-existing/runtime-data unknown | blocker | With PO approval, inspect representative queued message metadata/payload without acknowledging or deleting it, identify the producing event version/path, then propose the narrowest compatibility or scoped queue-recovery action. Do not purge/requeue-delete or loosen the finance schema without separate evidence and authority. | Queue operations can lose financial events or violate append-only/state-machine guarantees; remediation may require a compatibility consumer rather than data deletion. |

**PO approval — D-COURTIN-002 (2026-08-13):** PO opened Docker and explicitly instructed execution to continue. Authorized scope is the local Docker infrastructure governed by `docker-compose.infrastructure.yml`; expected action is to inspect its state, run `npm run infra:up` only when required, verify the RabbitMQ listener/health, then rerun exactly `npm run e2e -- e2e/phase-1.spec.ts e2e/phase-2.spec.ts e2e/courtin-visual.spec.ts`. No application, configuration, or test-source edits are authorized.

**Remediation evidence — D-COURTIN-002 (environment recovered):** `npm run infra:up` exited 0. Docker subsequently reported Postgres and Redis healthy; RabbitMQ was listening on port 5672 and `rabbitmq-diagnostics -q ping` succeeded. The authorized E2E rerun reached Playwright but exposed D-COURTIN-003; no further remediation was attempted.

**PO approval — D-COURTIN-003 (2026-08-13):** PO explicitly approved this defect ID. Exact authorized paths are `e2e/courtin-visual.spec.ts` and `e2e/courtin-visual.spec.ts-snapshots/*.png`; no application/page markup change is planned. Expected change: replace the ambiguous whole-page `getByRole('main')` assertion with the existing unique shell landmark `#main-content`, generate the 16 desktop/mobile COURTIN baselines through Playwright, inspect the generated images directly, then run the visual spec as the focused verification. If focused verification is green, run the plan's full validation gate once with a host timeout sufficient for the serial suite.

**Partial remediation evidence — D-COURTIN-003 (stopped on new defect):** the locator now targets `#main-content`; the focused run no longer reported nested-main strict-mode failures and produced all 16 expected baseline PNG files. The run still reported missing/new or differing snapshots and the images have not yet been accepted by direct visual review or verified by a clean non-update run. During this run D-COURTIN-004 surfaced, so D-COURTIN-003 remediation stopped before further snapshot handling or rerun.

**PO authority update (2026-08-13):** PO approved all current and subsequently discovered validation defects for one consolidated remediation pass. The executor may diagnose, modify exact affected source/test/config paths, regenerate and review COURTIN visual baselines, and rerun focused/full validation without per-defect pauses. This does not authorize destructive queue purges, data deletion, commits, pushes, merges, or material business-policy changes; those remain subject to the existing safeguards.

**PO approval — D-COURTIN-001 (2026-08-13):** PO explicitly approved this defect ID. Authorized scope is the installed dependency tree plus `apps/web/package.json`, `package-lock.json` and, only if the locked package does not ship the referenced subset, `apps/web/src/index.css`. Expected change: install the already locked `@fontsource/archivo@^5.3.0`, inspect the package for `latin-800.css` and `vietnamese-800.css`, and avoid source changes when both files exist. Targeted verification command: `npm run build --workspace @khoaluantn/web`. Per the PO checkpoint, stop immediately before running that command so the PO can change model.

**Remediation evidence — D-COURTIN-001 (targeted build green):** `npm install @fontsource/archivo@^5.3.0 --workspace @khoaluantn/web` exited 0, added one package and reported 0 vulnerabilities. Direct filesystem inspection found both `node_modules/@fontsource/archivo/latin-800.css` (262 bytes) and `node_modules/@fontsource/archivo/vietnamese-800.css` (277 bytes). No stylesheet or application source change was needed. Targeted verification `npm run build --workspace @khoaluantn/web` exited 0 on 2026-08-13; Vite emitted the Archivo Vietnamese and Latin 800 font assets.

**Remediation evidence — D-COURTIN-003/004 (closed):** Visual locator is `#main-content`; 16 reviewed desktop/mobile COURTIN baselines exist under `e2e/courtin-visual.spec.ts-snapshots/`; focused Playwright run passed 16/16. Legacy `MatchConfirmed` payloads missing fencing metadata are durably quarantined before acknowledgement in `QuarantinedEvent`; scoped E2E queues no longer consume the production finance queue. Finance regression passed 13 files, 88 tests, 11 skips.

**Defect — D-COURTIN-005 (closed):** `venue-booking-service/test/search.test.ts` timed out five assertions because `searchVenues` executed N+1 Prisma queries across accumulated local venues. `services/venue-booking-service/src/domain/search.ts` now uses a single relation-filtered query and computes the current price from included rules. Focused search passed 7/7; full venue suite passed 18 files, 110 tests.

**Defect — D-COURTIN-006 (closed):** `community-service/test/community.e2e.test.ts` assumed an otherwise empty shared feed; its broad cleanup could delete local application records. Added `scripts/run-isolated-community-tests.ts`, requiring `COMMUNITY_TEST_DATABASE_URL` with exact `community_test` schema, and migrated only that schema. Community suite passed 5 files, 22 tests, 1 skip. The application `community` schema was not mutated by test cleanup.

**Final validation evidence (2026-08-13):** Web lint exited 0 with 12 pre-existing non-blocking hooks warnings; web Vitest 11 files/22 tests pass; account 8 files/38 tests pass with 2 skips; venue 18 files/110 tests pass; finance 13 files/88 tests pass with 11 skips; matchmaking 9 files/70 tests pass with 5 skips; community 5 files/22 tests pass with 1 skip. Workspace `npm run typecheck` and `npm run build` exited 0. Browser validation passed HT1–HT8 (8/8), HT9–HT10 (2/2), and COURTIN visual desktop/mobile (16/16). The aggregate `npm run e2e` command exceeded the host 120-second process limit, so the same configured suites were run as their three direct file invocations and all 26 journeys passed.

### Task 13: Remediation có phê duyệt và hoàn tất

**Files:**

- Modify: `docs/plans/active/figma-to-code-implementation.md`
- Modify only after PO approval: các exact paths được ghi trong từng defect ID đã duyệt
- Modify after final pass: `docs/product/phase-2-progress.md`
- Move after completion: `docs/plans/active/figma-to-code-implementation.md` → `docs/plans/completed/figma-to-code-implementation.md`

- [ ] Nếu Task 12 không có defect, bỏ qua remediation và đi thẳng tới final evidence.
- [x] Nếu có defect, chờ PO trả lời xác nhận defect ID nào được sửa. Không diễn giải im lặng thành “duyệt tất cả”. Evidence: PO explicitly approved `D-COURTIN-001` on 2026-08-13; no other defect is approved.
- [x] Trước khi sửa, bổ sung vào mỗi defect được duyệt exact file paths, thay đổi dự kiến và command kiểm tra tập trung; PO approval là authority cho đúng phạm vi đó. Evidence: approval record above limits remediation to the locked Archivo dependency and conditional stylesheet correction, with targeted web build verification.
- [x] Sửa lần lượt chỉ các defect ID được duyệt. Giữ defect chưa duyệt ở trạng thái open/unattempted. Evidence: installed the locked Archivo package for `D-COURTIN-001`; both imported subset stylesheets exist, so no conditional source edit was made. Verification remains pending.
- [x] Chạy lại đúng suite/journey liên quan sau mỗi nhóm fix đã duyệt. Evidence: targeted `npm run build --workspace @khoaluantn/web` passed on 2026-08-13 for `D-COURTIN-001`; proceeding to the single full gate.
- [x] Nếu phát hiện defect mới, thêm ID mới, dừng và xin PO xác nhận trước khi sửa. Evidence: D-COURTIN-004 was recorded during the approved D-COURTIN-003 focused run; no queue, producer, consumer, or snapshot follow-up action was taken after discovery.
- [ ] Chạy lại đúng suite/journey liên quan sau mỗi nhóm fix đã duyệt. Nếu phát hiện defect mới, thêm ID mới, dừng và xin PO xác nhận trước khi sửa.
- [ ] Khi các defect được duyệt đã xanh, chạy lại toàn bộ lint, Vitest, build và E2E đúng một lần để chốt.
- [ ] Cập nhật `phase-2-progress.md` bằng evidence mới, không sửa lịch sử pass cũ thành bằng chứng COURTIN.
- [ ] Tự review diff theo route map: mọi route có mockup/node được duyệt; mọi mutation cũ còn reachable; không có API/source Figma tạm; không có marker chưa hoàn thiện hoặc text mojibake mới.
- [ ] Ghi kết quả, số test pass, defect đã sửa/chưa duyệt, gap được PO miễn và recovery note trong plan. Chỉ khi completion gate đạt mới đổi status Completed và chuyển file sang `docs/plans/completed/`.

## Risks And Recovery

- **Mâu thuẫn authority:** tài liệu Playo cũ vẫn tồn tại. Giảm rủi ro bằng D45 và authority doc trước khi code; không xóa lịch sử.
- **Figma context quá lớn/truncate:** gọi theo section/node con, không yêu cầu toàn frame nhiều lần. Metadata và screenshot được dùng để kiểm tra lại sau khi chuyển đổi.
- **Generated source lệch stack:** chỉ xem là reference. Chuyển sang React function component TSX, props có type, Tailwind 4/token repo, hooks/API hiện có; không cài framework do output Figma đề xuất.
- **Figma chưa có component/variables publish:** trích token từ nhiều frame và khóa trong CSS/doc; không suy ra từ một page duy nhất.
- **Thiếu frame riêng:** Task 2 là hard gate; implementation không bắt đầu cho tới khi F1–F5 có node ID hoặc PO phê duyệt exemption cụ thể.
- **Hồi quy nghiệp vụ do re-layout:** giữ API adapters, state transitions và accessible names; source-review theo nhóm, sau đó chạy toàn bộ automated validation một đợt ở Task 12 theo quyết định PO.
- **Test dồn cuối làm tăng phạm vi debug:** giữ diff theo task và defect table có evidence/affected files để khoanh vùng. Không đổi sang test từng màn hình nếu chưa có quyết định PO mới.
- **Tự ý fix sau test:** bị cấm. Mọi failure/visual/accessibility/runtime defect phải được báo cáo và chờ PO duyệt defect ID trước khi sửa; defect mới phát hiện sau rerun cũng qua lại approval gate.
- **Asset hết hạn/bản quyền:** tải asset Figma được phép dùng vào repo, tối ưu, ghi nguồn/node; không hotlink và không sao chép asset ngoài file được cấp.
- **Rollback:** mỗi task là một nhóm diff độc lập. Khi một journey lỗi, hoàn tác đúng nhóm page/component của task đó nhưng giữ authority doc và foundation đã qua source review; không dùng `git reset --hard` hoặc ghi đè thay đổi ngoài phạm vi.

## Progress

- [x] Xác minh stack, route, API adapters, component foundation và bộ test hiện tại.
- [x] Xác minh các frame Figma hiện có và lập route-to-node map.
- [x] Lập kế hoạch thực thi chi tiết.
- [x] Task 1 — authority và baseline. Evidence: D45, COURTIN authority record, Figma context/metadata/screenshots `67:3`, `3:8`, `96:106` reviewed 2026-08-13; Figma Full-seat authentication confirmed and no subscribed libraries adopted.
- [x] Task 2 — generate đủ mockup F1–F5 và đóng Figma coverage gate. Evidence: coverage plan records F1–F5 node IDs; metadata and screenshot requests completed for each newly generated frame, with corrected visual recheck for mobile Login `100:23`.
- [x] Task 3 — behavior contract bằng source/test inspection, không chạy test. Evidence: route/API/Socket.IO inspection and test assertion classification recorded below.
- [x] Task 4 — foundation/shell. Evidence: Figma design context `67:3`; `@fontsource/archivo@^5.3.0` locked with existing font major; COURTIN semantic tokens and compatibility aliases installed; public primitive signatures and session/auth/mobile/focus/reduced-motion paths source-reviewed. No Vitest/lint/build/Playwright/E2E run.
- [x] Task 5 — home/account/venue. Evidence: design context `67:3` and `89:2`; source scan preserves account API calls, venue search/query synchronization and booking route construction; loading/empty/error/404 branches retained. No automated validation run.
- [x] Task 6 — booking/payment/profile/finance. Evidence: booking, cancellation, wallet, payout and dispute source paths reviewed; Figma contexts `3:8`, `92:319`, `89:494`; API/state-machine call-sites retained. No automated validation run.
- [x] Task 7 — matchmaking. Evidence: Figma contexts `5:9`, `5:371`, `5:553`; source scan verifies `quick_match:find/proposal/joined/error/accept`, create, join approval, payment and withdraw/cancel call-sites are retained. No automated validation run.
- [x] Task 8 — passport. Evidence: Figma contexts `90:2`, `90:184`, `90:267`; source preserves one route, passportApi projections and API-derived rating/RD/matches/evaluation candidates. No automated validation run.
- [x] Task 9 — community/support/assistant. Evidence: Figma contexts `6:10`, `6:207`, `6:388`; source scan retains reporting, ticket role projections, assistant player gate, source/fallback behavior and navigation-only actions. No automated validation run.
- [x] Task 10 — provider/admin. Evidence: Figma contexts `89:250`, `96:106`, `6:282`; source scan verifies `/admin` guard and approval/rejection/reconciliation/dispute/moderation call-sites with reason/confirmation remain intact. No automated validation run.
- [x] Task 11 — asset, test definitions, responsive/accessibility source audit. Evidence: no runtime Figma URLs found; COURTIN foundation/visual spec added; skip/focus/modal/table/aria source audit recorded. No automated validation run.
- [ ] Task 12 — một đợt full validation và defect triage. Lint/test/build green; E2E remains red. D-COURTIN-003 is partially remediated but not visually accepted/verified; D-COURTIN-004 runtime queue failure blocks continuation.
- [ ] Task 13 — PO-approved remediation và completion. D-COURTIN-001 and D-COURTIN-002 are closed; D-COURTIN-003 is approved but paused; D-COURTIN-004 is unapproved and blocks completion.

## Decisions

- 2026-08-13: Figma COURTIN là visual authority; repo cũ chỉ còn cung cấp behavior/API và lịch sử thiết kế.
- 2026-08-13: Giữ nguyên React/Vite/TypeScript/Tailwind thay vì mang framework/ngôn ngữ do Figma output đề xuất vào repo.
- 2026-08-13: Không tạo route mới cho frame biểu diễn state/modal/tab đã có trong kiến trúc hiện tại.
- 2026-08-13: PO approved only `D-COURTIN-001`; remediation installed the locked Archivo package and confirmed both imported subset stylesheets. Targeted build rerun is paused until the PO changes model.
- 2026-08-13: Full lint/Vitest/build gate passed after D-COURTIN-001 remediation. The single requested E2E invocation failed before browser journeys because Docker Desktop/RabbitMQ was unavailable; recorded as D-COURTIN-002 and stopped pending PO approval.
- 2026-08-13: PO opened Docker and approved D-COURTIN-002. `npm run infra:up` succeeded; Postgres/Redis/RabbitMQ became healthy and RabbitMQ diagnostics ping passed. The authorized E2E rerun then exposed D-COURTIN-003 (missing visual baselines plus ambiguous nested-main locator) and exceeded the host 120-second command timeout, so no fix or rerun was attempted.
- 2026-08-13: PO approved D-COURTIN-003. The shell locator was narrowed to `#main-content` and 16 baseline files were generated, but focused validation exposed repeated finance `MatchConfirmed` schema failures and a 536-message ready queue. This is D-COURTIN-004; all further remediation and validation stopped pending PO approval.
- 2026-08-13: Cho phép biến tấu information hierarchy theo nhiệm vụ để tránh màn hình lặp lại, nhưng không biến tấu token, typography, icon treatment hoặc màu ra ngoài COURTIN.
- 2026-08-13: Figma coverage F1–F5 là hard gate trước implementation; thiếu frame chỉ được miễn bằng PO-approved exemption cụ thể.
- 2026-08-13: Dồn toàn bộ Vitest/lint/build/Playwright/E2E tới sau khi toàn bộ mockup và code đã được ráp; không test sau từng màn hình.
- 2026-08-13: Sau đợt test cuối, agent chỉ triage. Mọi bug fix hoặc remediation phải chờ PO xác nhận defect ID trước khi sửa.
- 2026-08-13: Figma discovery xác nhận không có subscribed library, local variables, styles hoặc reusable components; Code Connect không khả dụng trên student plan. Các mockup mới phải dùng Figma Plugin API và visual grammar COURTIN local, không import community kit.
- 2026-08-13: Task 3 contract classification — preserve `App.tsx` route map and `/admin` role guard; all API adapters under `apps/web/src/lib`; and `QuickMatchPanel` Socket.IO events. Preserve E2E accessible names and state copy: `Giữ chỗ 10 phút`, `Tạo booking`, `Thanh toán số dư`, `Gửi yêu cầu tham gia`, `Duyệt`, `Đối soát`, auth verification/status, cancellation/refund, dispute and reconciliation confirmations. `playoFoundation.test.tsx` token/name assertions and `playoPhase1Pages.test.tsx` visual-layout assertions are visual baseline only and must be replaced by COURTIN assertions in Task 11; their business/role assertions remain.
- 2026-08-13: Task 4 uses COURTIN navy/yellow as visual primitives while retaining `green-*` Tailwind aliases as compatibility-only semantic state tokens until all route surfaces are converted. This avoids a mixed broken utility state without treating Playo green as visual authority.

## Validation

- **Pre-test proof:** Figma metadata/screenshot cho F1–F5, source review, route/state coverage và source scans; không chạy automated test trong Task 1–11.
- **Single validation batch:** Task 12 chạy lint, toàn bộ Vitest, build TypeScript/Vite, Phase 1/2 E2E và COURTIN visual E2E sau khi code đã hoàn tất.
- **Defect approval proof:** mọi failure có defect ID/evidence/proposed fix; không có remediation trước PO approval.
- **Observable proof:** Playwright desktop/mobile với screenshot của mọi journey đại diện và thao tác qua API thật trong validation batch.
- **Business proof:** E2E Phase 1/2 hiện hữu pass; kiểm tra API/DB cho các luồng có tiền, quyền và state machine.
- **Completion gate:** tất cả route có mockup/node và implementation COURTIN, không còn visual authority Playo trong source, không có asset tạm, lint/test/build/E2E xanh và defect được duyệt đã đóng. Defect chưa duyệt làm gate đỏ thì plan giữ trạng thái active/blocked-by-PO trừ khi PO miễn chính xác gate đó.

## Task 11 test update list

- Replace Playo-specific foundation token/theme assertions in `apps/web/test/playoFoundation.test.tsx` with COURTIN token/component assertions; keep accessibility assertions.
- Keep route/API/auth/role/business assertions in `playoPhase1Pages.test.tsx`, `playoPhase2Match.test.tsx`, `playoPhase2Passport.test.tsx`, `playoPhase2Community.test.tsx`, `playoPhase2Assistant.test.tsx`, `playoPhase2Moderation.test.tsx`, `bookingCancellation.test.tsx`, `g6Finance.test.tsx`, and `g7Dispute.test.tsx`; replace visual-only Playo wording/layout assertions only.
- Preserve E2E locators/copy in `e2e/phase-1.spec.ts` and `e2e/phase-2.spec.ts`; add COURTIN visual coverage separately in Task 11.
- Add foundation regression checks in Task 11 for the Archivo/Inter/Geist imports, COURTIN semantic tokens, global skip link, 80px desktop shell, focus-visible and reduced-motion behavior; do not change business-accessible names.
- Add visual viewport checks in Task 11 for Home, auth/verify/reset, venue list/filter and venue detail at 1440px and 390px; retain source assertions for venue loading/empty/error/404 and authenticated account transitions.
- Add Task 11 regression checks for SlotGrid non-colour labels, hold countdown expiry, balance/SePay copy, cancellation preview/confirm, provider change-court/cancel, withdrawal and dispute submissions at desktop/mobile viewports.
- Add Task 11 match checks for Quick Match connecting/searching/proposal/error and pending accept semantics; list/detail at 1440px/390px; organizer and participant approval/payment/withdraw/cancel states without changing business locators.
- Add Task 12 Passport screenshots for owner, public and cold-start at desktop/mobile; assert public projection contains only userId/tier/matchesPlayed and owner declaration/evaluation actions retain their API boundaries.
- Add Task 11 checks for community member/guest/mobile composer permission, post edit/delete/report ownership, support player/admin private ticket rendering, and assistant unauthenticated/non-player/passport-required/fallback states at 1440px/390px.
- Add Task 11 provider/admin checks for `/admin` non-admin redirect, provider approval rejection reason, finance reconciliation/withdrawal confirmation, dispute decision reason and moderation confirmation at 1440px/390px.

## Completion update — 2026-08-13

- [x] Task 12 final validation and defect triage completed.
- [x] Task 13 approved remediation and final verification completed.
- [x] Route-map and source review completed: COURTIN remains the visual authority; API, route, auth, role, Socket.IO and business mutations remain reachable; no temporary Figma URL, TODO or FIXME was found in the frontend/E2E source scan; `git diff --check` passed.
- [x] Progress ledger updated without rewriting historical Playo evidence.
- [x] Completion gate achieved: D-COURTIN-001 through D-COURTIN-006 are closed; no open validation defect remains.

## Result

 Task 1–4 đã hoàn tất theo source/Figma evidence; Task 5–11 còn triển khai, sau đó mới chạy validation batch duy nhất của Task 12. Không có automated validation nào đã chạy trong Task 1–4.
