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
> tuần tự/song song có cổng kiểm; mỗi milestone Codex self-verify (test AC + typecheck + build sạch)
> + 1 vòng Codex review → commit riêng, rồi mới sang milestone kế.

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
5. **Cổng E2E:** các hành trình kèo/community/AI qua UI thật (Playwright) xanh.

## Chuỗi milestone (thứ tự theo dependency)
```
P2-G0 ─> P2-Gd ─> P2-M1 ─> P2-M2 ─> P2-M3 ─> (P2-M4 ∥ P2-M5 ∥ P2-M6) ─> P2-M7
                                     P2-M8 (community, độc lập, song song sớm) ─> P2-M9
                                     P2-Mfe (frontend theo từng M) ─> P2-final
```
| # | Milestone | Nội dung (spec) | Phụ thuộc |
|---|---|---|---|
| P2-G0 | Schema + skeleton | data-model-phase-2; `matchmaking`/`community` nối eventbus/outbox; `packages/ai` giữ skeleton; test cách ly schema | GĐ1 |
| P2-Gd | Design baseline GĐ2 | page shell kèo/passport/community/AI-chat trên DESIGN.md (không dựng lại) | P2-G0 |
| P2-M1 | Rating F-01 + Passport | F-01, MMP-09, MMP-11 | P2-G0 |
| P2-M2 | Kèo lifecycle phi tiền | MMP-01..05 + AC-MMP-06-3 + contract event MatchCreated/JoinApproved/MatchConfirmed/MatchCancelled (D30) | P2-M1 |
| P2-M3 | FIN-05 + lifecycle tích hợp | finance-match-fee + AC-MMP-06-1/2/4 + AC-MMP-07-1/2/3 + AC-MMP-08-1/2/3; E2E ledger/venue thật (D30) | P2-M2 |
| P2-M4 | Đánh giá + F-07 | MMP-10, F-07 | P2-M2 |
| P2-M5 | F-03 ghép kèo live (WS) | F-03 (WS thẳng matchmaking) | P2-M2 |
| P2-M6 | F-02 độ hợp + F-04 gom nhóm | F-02, F-04 | P2-M1, P2-M2 |
| P2-M7 | AI-01 matchmaker (Gemini) | AI-01 | P2-M6 |
| P2-M8 | community-support | COM-01..08 | P2-G0 (song song sớm) |
| P2-M9 | AI-02 chatbot RAG (Gemini) | AI-02 | P2-M8, dữ liệu GĐ1 |
| P2-Mfe | Frontend GĐ2 | nối UI thật mọi UC | các M tương ứng |
| P2-final | Cổng cuối phase | E2E + bảo toàn FIN-05 + ledger đủ pass | tất cả |

## Quy tắc hoàn thành 100% — KHÔNG được bỏ qua âm thầm

Đây là điều kiện bắt buộc, cao hơn tốc độ:

1. **Mọi AC trong 4 spec đều phải đạt `pass` hoặc được PO tường minh miễn trừ.** Không có trạng
   thái thứ ba. Cấm: đánh dấu AC là "để sau", "known issue", "out of scope tạm thời", "TODO" rồi
   tự chuyển milestone kế mà không dừng hỏi PO.
2. **Gặp khó (AC không rõ cách làm, spec mâu thuẫn, thiếu quyết định, lỗi khó sửa) → DỪNG và hỏi
   PO ngay tại chỗ đó.** Không tự suy diễn để "cho xong", không âm thầm nới lỏng AC, không tự ý
   đổi acceptance criteria để dễ pass hơn.
3. **Không được coi một milestone "xong" nếu còn AC chưa pass trong milestone đó.** Nếu bị chặn bởi
   một AC, dừng NGAY tại AC đó — không nhảy sang AC/milestone tiếp theo rồi quay lại sau (tạo nợ ẩn
   dễ bị quên). Ghi rõ trạng thái "blocked — chờ PO" vào `phase-2-progress.md` cho đúng AC đó.
4. **Trước khi báo "Giai đoạn 2 hoàn tất"**, tự rà lại: đếm số AC `pass` trong ledger so với tổng số
   AC trong 4 spec — phải khớp 100%, không làm tròn, không ước lượng "gần đủ".
5. Mọi lần dừng hỏi PO đều phải nêu **rõ AC/quyết định cụ thể bị chặn**, không hỏi chung chung.


- Schema-per-service (D17): không FK/query xuyên schema; giao tiếp API/event.
- Tiền (FIN-05): bảo toàn giá trị + ledger append-only; phí góp qua platform, KHÔNG ngang hàng (#6).
- AI chỉ hỗ trợ + giải thích, KHÔNG tự hành động nhạy cảm (#8).
- Cộng đồng chỉ nội dung công khai (#9); chỉ một quyền vận hành admin (#7).
- Không thêm role ngoài player/provider/admin (#7) — "người tổ chức kèo" vẫn là player.
- Frontend nối API thật, KHÔNG mock shell (bài học F1 GĐ1).
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
tuyệt đối, không xấp xỉ) có evidence; E2E xanh; không còn AC ở trạng thái `blocked` chưa được PO
quyết; PO nghiệm thu cuối phase.

## Quyết định `【PO-REVIEW】` cần chốt trước/trong khi build
Tổng hợp ở cuối mỗi spec (matchmaking §9, community §8, ai §6, finance-match-fee §7, data-model §5).
Các mục chạm tiền/quyền phải chốt trước milestone tương ứng; mục thuần tham số (ngưỡng, hằng số) có
thể chốt khi vào milestone.
