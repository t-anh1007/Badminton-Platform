---
type: goal
scope: Giai đoạn 2 (toàn bộ)
kind: orchestration-goal (chạy milestone có cổng kiểm)
phase: 2
status: draft-for-po-review
executor: Codex (goal mode) — build theo spec
author_of_specs: Claude Code
final_acceptance: PO (Tuan Anh) — cuối phase
created: 2026-08-07
source: 4 spec GĐ2 trong docs/product/specs/ + docs/architecture/data-model-phase-2.md
---

# Goal bao quát — Hoàn thành toàn bộ Giai đoạn 2

> **Hình dạng:** goal điều phối (giống `phase-1-goal.md`). Đích là cả phase, chạy theo milestone
> tuần tự/song song có cổng kiểm. Mỗi milestone theo **Giao thức thực hiện RÚT GỌN** (mục dưới):
> build đúng AC → verify MỘT lượt → 1 vòng review trên diff → commit. Vẫn bắt buộc test + review,
> nhưng KHÔNG lặp vòng khi đã xanh.
>
> **Cập nhật 2026-08-09 (PO):** **Phase 2.5 (tinh chỉnh UI/UX theo playo.co) được lồng thẳng vào
> goal này.** Toàn bộ frontend GĐ2 dùng **design system Playo** trong `docs/design/`; **loại bỏ
> hoàn toàn** baseline thị giác actl.me cũ (DESIGN.md §1.1/§2, Navbar navy, MenuOverlay tối, Hero
> parallax tối, font Geist heading). Xem mục **"Frontend GĐ2 — design Playo"**. Giao thức thực hiện
> cũng được rút gọn (chống overthinking) — xem mục cùng tên.

## Vai trò
| Vai | Ai |
|---|---|
| Tác giả spec/thẩm quyền | **Claude Code** (đã xong: 4 spec + data-model addendum) |
| Executor build | **Codex** (goal mode) |
| Nghiệm thu | **PO** — cuối phase |

## Nguồn thẩm quyền (đọc trước khi build)
- `docs/product/specs/matchmaking-passport.md` (MMP-01..11 + F-01/02/03/04/07)
- `docs/product/specs/community-support.md` (COM-01..08)
- `docs/product/specs/ai-assist.md` (AI-01, AI-02 — Gemini)
- `docs/product/specs/finance-match-fee.md` (FIN-05)
- `docs/architecture/data-model-phase-2.md` (schema matchmaking/community + `packages/ai`)
- **Frontend (design Playo — thẩm quyền thị giác):** `PLAN_PHASE2.5.md`,
  `docs/design/design-system.md`, `docs/design/pages/01..11`. **Thay thế** DESIGN.md §1.1/§2 (actl.me);
  DESIGN.md chỉ còn hiệu lực ở ràng buộc hiệu năng §5 (không WebGL/3D). KHÔNG dùng token/màu/Navbar/
  theme actl.me cũ.
- Nền tảng GĐ1: `AGENTS.md`, `docs/WORKFLOW.md`, `docs/SCOPE_BASELINE.md §4` (9 bất biến),
  `docs/decisions/` (ADR 0002/0003/0004), code GĐ1 (mẫu outbox/idempotency/ledger/hold).

## Mục tiêu phase (Outcome)
Toàn bộ **22 UC** (MMP-01..11, COM-01..08, AI-01/02, FIN-05) + **5 tính năng** (F-01/02/03/04/07)
của GĐ2 chạy được và pass **toàn bộ AC** trong 4 spec, trên khung monorepo schema-per-service, với
frontend nối API thật (không mock shell — rút kinh nghiệm F1 GĐ1).

## Success condition (khách quan)
1. **Cổng cấu trúc:** 2 service domain (`matchmaking`, `community`) migrate sạch trên DB rỗng,
   cách ly quyền schema (test âm), không FK/query xuyên schema. AI giữ là thư viện dùng chung
   `packages/ai` theo ADR 0002, không có service/schema riêng.
2. **Cổng nghiệp vụ:** mọi AC trong 4 spec đạt `pass` trong test ledger `phase-2-progress.md`
   (Codex điền dần; thước đo "done", KHÔNG dùng coverage-matrix).
3. **Cổng bảo toàn tiền (FIN-05):** `AC-FIN-05-8` — một kèo chạy trọn vòng + một kèo hủy, sau khi
   hàng chờ rỗng, bảo toàn giá trị mức hệ thống pass.
4. **Cổng AI (bất biến #8):** test chứng minh KHÔNG có đường AI tự thực hiện hành động nhạy cảm;
   AI-01/02 luôn kèm giải thích; fallback khi Gemini lỗi không chặn nghiệp vụ.
5. **Cổng E2E + UI Playo:** các hành trình đặt sân/kèo/community/AI qua UI thật (Playwright) xanh;
   toàn bộ frontend theo **design system Playo** (`docs/design/`), KHÔNG còn theme actl.me; **AC-UI**
   trong mỗi page spec đạt.

## Chuỗi milestone (thứ tự theo dependency)
```
Backend (xong TẤT CẢ trước — thứ tự cứng):
          P2-G0 ─> P2-M1 ─> P2-M2 ─> P2-M3 ─> (P2-M4 ∥ P2-M5 ∥ P2-M6) ─> P2-M7
                                     P2-M8 (community, song song sớm) ─> P2-M9

Frontend (Playo — CHỈ bắt đầu SAU khi TOÀN BỘ backend P2-M1..M9 pass):
          P2-FE0 (nền tảng Playo) ─> P2-FE1 (trang GĐ1) ─> P2-FE2 (trang GĐ2) ─> P2-final
```
| # | Milestone | Nội dung (spec) | Phụ thuộc |
|---|---|---|---|
| P2-G0 | Schema + skeleton | data-model-phase-2; `matchmaking`/`community` nối eventbus/outbox; `packages/ai` giữ skeleton; test cách ly schema | GĐ1 |
| ~~P2-Gd~~ | ~~Design baseline GĐ2~~ | **BỎ** — baseline actl.me bị loại hoàn toàn. Thay bằng **P2-FE0** (nền tảng Playo). | — |
| P2-M1 | Rating F-01 + Passport | F-01, MMP-09, MMP-11 | P2-G0 |
| P2-M2 | Kèo lifecycle phi tiền | MMP-01..05 + AC-MMP-06-3 + contract event MatchCreated/JoinApproved/MatchConfirmed/MatchCancelled (D30) | P2-M1 |
| P2-M3 | FIN-05 + lifecycle tích hợp | finance-match-fee + AC-MMP-06-1/2/4 + AC-MMP-07-1/2/3 + AC-MMP-08-1/2/3; E2E ledger/venue thật (D30) | P2-M2 |
| P2-M4 | Đánh giá + F-07 | MMP-10, F-07 | P2-M2 |
| P2-M5 | F-03 ghép kèo live (WS) | F-03 (WS thẳng matchmaking) | P2-M2 |
| P2-M6 | F-02 độ hợp + F-04 gom nhóm | F-02, F-04 | P2-M1, P2-M2 |
| P2-M7 | AI-01 matchmaker (Gemini) | AI-01 | P2-M6 |
| P2-M8 | community-support | COM-01..08 | P2-G0 (song song sớm) |
| P2-M9 | AI-02 chatbot RAG (Gemini) | AI-02 | P2-M8, dữ liệu GĐ1 |
| P2-FE0 | Nền tảng thị giác Playo | Tailwind tokens (sáng/xanh) + font Inter + component lõi + Navbar/Footer/AppLayout/Preloader theo `design-system.md`; **xóa hẳn** theme actl.me (navy/court-green/accent-shuttle/MenuOverlay tối/Hero tối) | **TOÀN BỘ backend P2-M1..M9 pass** (thứ tự cứng) |
| P2-FE1 | Trang GĐ1 (re-skin + tách trang) | Home/Auth-modal/Venue List/Venue Detail/Booking/Profile/Admin theo `docs/design/pages/01..07`; **tách** Venue List/Detail/Booking thành 3 route; nối API GĐ1 thật | P2-FE0 |
| P2-FE2 | Trang GĐ2 | Kèo(list+detail)/Passport/Cộng đồng/Trợ lý AI theo `docs/design/pages/08..11`; nối API GĐ2 thật | P2-FE1 |
| P2-final | Cổng cuối phase | E2E + bảo toàn FIN-05 + ledger đủ pass + UI Playo (AC-UI) | tất cả |

## Frontend GĐ2 — design Playo (THAY baseline actl.me cũ)

**Thứ tự cứng:** frontend (P2-FE0/FE1/FE2) **chỉ bắt đầu khi TOÀN BỘ backend P2-M1..M9 đã pass**.
Không xen frontend giữa các milestone backend.

**Bắt buộc bỏ hoàn toàn thiết kế frontend cũ.** Baseline actl.me (tối/navy/court-green, accent vàng
`accent-shuttle`, `MenuOverlay` full-screen tối, Hero parallax tối, Geist heading) **bị loại** —
không mở rộng, không tái dùng. Frontend GĐ2 build **mới** trên design system Playo.
Thẩm quyền thị giác: `docs/design/design-system.md` + `docs/design/pages/01..11` + `PLAN_PHASE2.5.md`.

- **P2-FE0 (làm TRƯỚC mọi trang):** cập nhật Tailwind config sang token Playo (map cũ→mới theo
  design-system §10, gỡ class actl.me không còn dùng); font **Inter** tự host (`@fontsource/inter`),
  giữ Geist Mono cho số liệu; dựng component lõi; thay **Navbar** (trắng, nav rút gọn + dropdown
  avatar), **Footer**, **AppLayout**, **Preloader** (tông sáng); xóa `MenuOverlay`/Hero tối.
- **P2-FE1:** trang GĐ1 theo pages 01..07 — gồm **tách** Venue List/Detail/Booking thành 3 route
  (`/venues`, `/venues/:id`, `/booking?venueId=`), KHÔNG đổi API GĐ1.
- **P2-FE2:** trang GĐ2 theo pages 08..11 (Kèo list+detail, Passport, Cộng đồng, Trợ lý AI), nối
  API GĐ2 thật theo milestone backend tương ứng.
- **AC-UI** trong mỗi page spec là checklist "done" của frontend (responsive 375/768/1280, a11y cơ
  bản, empty/error tiếng Việt, không lỗi console luồng chính).

## Giao thức thực hiện milestone (RÚT GỌN — giữ test+review, bỏ lặp vô ích)

> Mục tiêu: nhanh hơn, bớt overthinking. **Vẫn bắt buộc test + review**, nhưng mỗi milestone chỉ
> làm **một lượt** verify và **một vòng** review — không lặp khi đã xanh.

Mỗi milestone theo đúng 4 bước, không thêm:
1. **Build đúng AC/spec của milestone** — không làm quá: không refactor ngoài phạm vi, không thêm
   test ngoài AC, không "đánh bóng" phong cách / tối ưu chưa cần.
2. **Verify MỘT lượt**: chạy đúng **test AC của milestone này** + `typecheck` + `build`. Xanh là
   xong verify. **KHÔNG** chạy lại toàn bộ suite các milestone cũ đã xanh (regression toàn bộ chỉ
   một lần ở P2-final). **KHÔNG** lặp verify nhiều vòng khi không đổi code.
3. **Review MỘT vòng** trên **diff vừa đổi** (không review lại code cũ đã pass). Chỉ sửa khi review
   tìm **lỗi thật**: sai AC/spec, phá bất biến (#6/#7/#8/#9), bug, rò tiền. Sửa xong → commit;
   **KHÔNG** mở thêm vòng review mới trừ khi bản sửa lớn tới mức có rủi ro hồi quy.
4. **Commit riêng** + điền ledger `phase-2-progress.md` (chỉ AC của milestone này).

**Chống overthinking (bắt buộc):**
- Không lặp chu trình test→review→test→review khi không phát sinh lỗi mới.
- Không tự mở rộng scope/AC; không thêm cấu hình/khả năng "phòng xa".
- **Time-box mỗi AC:** thử tối đa **2 hướng** mà vẫn kẹt → **DỪNG hỏi PO** ngay (đừng thử vô hạn).
- Nghi ngờ → chọn cách **đơn giản, đúng spec**; không cầu toàn.
- **Skill/plugin:** dùng khi cần, **không bừa bãi** — chỉ những gì thật sự giúp việc, tần suất hợp
  lý (tránh lãng phí token). **Không bắt buộc dùng hết.** Ưu tiên khi phù hợp (nhất là track
  frontend P2-FE*): `superpowers`, `frontend-design`, `web-design-guidelines`, Vercel
  `react-best-practices`, `mattpocock-skills`, bộ `rtk`.

## Quy tắc hoàn thành (giữ nguyên tinh thần, KHÔNG nới lỏng)

1. **Mọi AC phải `pass` hoặc được PO miễn trừ tường minh** — không có trạng thái thứ ba; cấm
   "để sau / known issue / TODO" rồi âm thầm đi tiếp.
2. **Kẹt (AC không rõ, spec mâu thuẫn, thiếu quyết định, lỗi khó) → DỪNG tại đúng AC đó, hỏi PO,
   nêu rõ mã AC/quyết định bị chặn.** Không tự đổi AC cho dễ pass. Ghi "blocked — chờ PO" vào ledger.
3. **Không nhảy qua AC bị chặn** để làm AC khác rồi quay lại (tránh nợ ẩn).
4. **Trước khi báo "GĐ2 hoàn tất"**: đếm AC `pass` khớp **100%** tổng AC 4 spec + AC-UI — không xấp xỉ.


- Schema-per-service (D17): không FK/query xuyên schema; giao tiếp API/event.
- Tiền (FIN-05): bảo toàn giá trị + ledger append-only; phí góp qua platform, KHÔNG ngang hàng (#6).
- AI chỉ hỗ trợ + giải thích, KHÔNG tự hành động nhạy cảm (#8).
- Cộng đồng chỉ nội dung công khai (#9); chỉ một quyền vận hành admin (#7).
- Không thêm role ngoài player/provider/admin (#7) — "người tổ chức kèo" vẫn là player.
- Frontend: dùng **design system Playo** (`docs/design/`), **KHÔNG** dùng theme actl.me cũ; nối API
  thật, KHÔNG mock shell (bài học F1 GĐ1).
- Realtime (WS) chỉ dùng đúng phạm vi F-03; giữ ràng buộc hiệu năng free-tier (không WebGL/3D).

## Pause rules (Codex dừng, báo PO)
- Lộ nhu cầu FK/query xuyên schema → dừng.
- Luồng phí kèo không bảo toàn ba vế → dừng ngay.
- AI muốn tự thực hiện hành động nhạy cảm → dừng (phá #8).
- Cần thêm actor/role mới → dừng.
- Gemini cần credential/quota vượt free-tier → dừng, báo PO.
- Gặp `【PO-REVIEW】` trong spec ảnh hưởng tiền/quyền/trạng thái mà chưa có quyết định → dừng, hỏi PO.

## Done when
Cả 5 success condition pass; **100% AC trong 4 spec `pass` trong `phase-2-progress.md`** (đếm khớp
tuyệt đối, không xấp xỉ) có evidence; **AC-UI 11 page spec đạt, frontend theo design Playo (không còn
theme actl.me)**; E2E xanh; không còn AC ở trạng thái `blocked` chưa được PO quyết; PO nghiệm thu cuối phase.

## Quyết định `【PO-REVIEW】` cần chốt trước/trong khi build
Tổng hợp ở cuối mỗi spec (matchmaking §9, community §8, ai §6, finance-match-fee §7, data-model §5).
Các mục chạm tiền/quyền phải chốt trước milestone tương ứng; mục thuần tham số (ngưỡng, hằng số) có
thể chốt khi vào milestone.
