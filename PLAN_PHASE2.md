# PLAN_PHASE2 — Lộ trình Giai đoạn 2 (matchmaking · community · AI · FIN-05)

Nguồn: `docs/product/phasing.md §4`, `docs/SCOPE_BASELINE.md §2.5–2.7`,
`docs/architecture/system-architecture.md §6.3/§10`. Mô hình lặp lại thành công của GĐ1: **docs
thẩm quyền (spec + AC) → goal điều phối chạy milestone có cổng kiểm**.

## Phân công (đã PO chốt)
- **Claude Code (tôi)** viết toàn bộ **docs thẩm quyền** GĐ2: specs + AC, phase-2-goal,
  phase-2-handoff (cổng kiểm), cập nhật data-model/decision-log/ADR, chốt các quyết định treo.
- **Codex** thực thi build theo spec, chạy **goal mode** xuyên các milestone có cổng kiểm.
- **PO** duyệt spec trước khi Codex build; nghiệm thu cuối phase.

## Quyết định hướng đã chốt (PO, phiên này)
- **Spec-first**: có spec + AC đo được trước khi build (như 198 AC GĐ1).
- **AI provider = Google Gemini API** cho AI-01 (matchmaker có giải thích) và AI-02 (chatbot RAG).
- **Làm đủ hết, không cắt**: cả 22 UC + 5 feature (F-01/02/03/04/07). Thứ tự milestone theo
  **dependency kỹ thuật**, không phải ưu tiên-để-cắt.

## Phạm vi GĐ2 (đủ, không cắt)
- `matchmaking-passport` (MMP-01..11) — kèo (tạo/tìm/tham gia/duyệt/rút/hủy/xác nhận), khai báo
  trình độ, đánh giá sau trận, Player Passport.
- `community-support` (COM-01..08) — bảng tin, bài viết CRUD, bình luận, báo cáo, kiểm duyệt, ticket.
- `ai` (AI-01, AI-02) — gợi ý kèo có giải thích; chatbot RAG trên chính sách + dữ liệu của chính user.
- `FIN-05` — thanh toán phí tham gia kèo (finance consume event của matchmaking).
- 5 feature mới: F-01 (rating có độ bất định), F-02 (điểm độ hợp + giải thích), F-03 (ghép kèo live),
  F-04 (gom nhóm lẻ cân bằng), F-07 (trợ lý đánh giá công bằng).

---

## GIAI ĐOẠN A — Claude Code viết docs thẩm quyền  ✅ ĐÃ XONG (2026-08-07)

Đã tạo:
- `docs/product/specs/matchmaking-passport.md` (MMP-01..11 + F-01/02/03/04/07)
- `docs/product/specs/community-support.md` (COM-01..08)
- `docs/product/specs/ai-assist.md` (AI-01, AI-02 — Gemini)
- `docs/product/specs/finance-match-fee.md` (FIN-05, phí góp qua platform)
- `docs/architecture/data-model-phase-2.md` (schema matchmaking/community/ai)
- `docs/product/phase-2-goal.md` (goal điều phối — thẩm quyền build cho Codex)

Còn tùy chọn (có thể sinh khi cần): `phase-2-handoff.md` (Hard Gate từng milestone chi tiết) và
`phase-2-progress.md` (test ledger từng AC). Hiện goal đã đủ để Codex bắt đầu.

<details><summary>Kế hoạch gốc Giai đoạn A (tham khảo)</summary>

Sản phẩm tôi sẽ tạo trong `docs/`:
1. `docs/product/specs/matchmaking-passport.md` — spec MMP-01..11 + F-01/F-02/F-03/F-04/F-07, mỗi UC
   có AC đánh số (kiểu `AC-MMP-xx-y`, `AC-F01-y`...).
2. `docs/product/specs/community-support.md` — spec COM-01..08 + AC.
3. `docs/product/specs/ai-assist.md` — spec AI-01, AI-02 + AC (gồm ràng buộc bất biến #8: AI chỉ
   hỗ trợ + giải thích, không tự hành động).
4. Bổ sung `FIN-05` vào spec `finance-disputes.md` (hoặc phụ lục) + AC bảo toàn ba vế cho phí kèo.
5. `docs/product/phase-2-goal.md` — goal điều phối (đích + success condition + chuỗi milestone).
6. `docs/product/phase-2-handoff.md` — Hard Gate từng milestone (kiểu handoff GĐ1).
7. `docs/product/phase-2-progress.md` — test ledger (một dòng mỗi AC) — thước đo "done".
8. Cập nhật `docs/architecture/data-model.md` — schema matchmaking/community/ai (schema-per-service,
   không FK chéo).
9. ADR mới trong `docs/decisions/` cho các quyết định lớn (rating, WS topology, Gemini integration).

### Quyết định tôi sẽ chốt TRONG spec (đề xuất mặc định, cờ để PO duyệt khi review spec)
| # | Quyết định treo | Đề xuất mặc định của tôi | Nguồn |
|---|---|---|---|
| D-P2-1 | Thuật toán rating F-01 (có độ bất định) | Glicko-2 (rating + RD + volatility) ánh xạ sang 5 bậc hiển thị; cold-start từ MMP-09 khai báo | SCOPE_BASELINE §5 (5 bậc + rating bất định) |
| D-P2-2 | Cách chia phí FIN-05 | Người tổ chức đặt phí/người; người tham gia trả vào ví platform giữ tạm; giải ngân cho tổ chức khi `MatchConfirmed`, hoàn về số dư nếu `MatchCancelled` — bảo toàn ba vế, append-only | system-arch §6.3 |
| D-P2-3 | WS nối thẳng matchmaking hay qua gateway | Nối **thẳng** matchmaking-service (đề xuất §10 #3) | system-arch §10 #3 |
| D-P2-4 | Ngưỡng "đánh giá bất thường" F-07 | Phát hiện outlier thống kê (lệch chuẩn) + chống self/collusion vote; đánh dấu để Admin xử, không tự phạt | phasing.md Q1 |
| D-P2-5 | Nguồn RAG cho AI-02 | Chỉ chính sách công khai (docs) + dữ liệu CỦA CHÍNH user (booking/kèo/ví của họ) — không rò chéo user | SCOPE_BASELINE §2.7 |
| D-P2-6 | Tích hợp Gemini | Gọi Gemini API từ `packages/ai`; API key qua env (không hardcode); có fallback khi hết quota | PO chốt provider = Gemini |

> Khi tôi viết xong Giai đoạn A, bạn review spec + 6 quyết định trên. Duyệt xong mới sang Giai đoạn B.

</details>

---

## GIAI ĐOẠN B — Codex build theo spec (goal mode, milestone có cổng kiểm)

Thứ tự theo dependency (F-01 rating là nền cho F-02/03/04/AI-01; FIN-05 cần event matchmaking;
AI cần dữ liệu kèo). Mỗi milestone: self-verify (test AC + typecheck + build sạch) → Codex review
1 vòng → commit riêng.

| # | Milestone | Nội dung | Phụ thuộc |
|---|---|---|---|
| P2-G0 | Schema + skeleton | Data-model + migration matchmaking/community/ai; service nối eventbus/outbox; test cách ly schema | GĐ1 xong |
| ~~P2-Gd~~ | ~~Design baseline GĐ2~~ | **BỎ (D-UI5, 2026-08-09):** baseline actl.me bị loại; thay bằng **P2-FE0** (nền tảng Playo). Xem `phase-2-goal.md` + `PLAN_PHASE2.5.md`. | — |
| P2-M1 | Rating F-01 + Passport | Engine rating có độ bất định (D-P2-1); MMP-09 khai báo trình độ; MMP-11 xem Passport | P2-G0 |
| P2-M2 | Kèo lifecycle | MMP-01..08 (tìm/tạo/chi tiết/tham gia/duyệt/xác nhận/rút/hủy); phát event `MatchCreated/JoinApproved/MatchConfirmed/MatchCancelled` | P2-M1 |
| P2-M3 | FIN-05 phí kèo | finance consume event matchmaking; thu phí vào ví platform giữ tạm → giải ngân/hoàn (D-P2-2); **bảo toàn ba vế** | P2-M2 |
| P2-M4 | MMP-10 đánh giá + F-07 | Đánh giá sau trận (mở khi `BookingCompleted`); trợ lý phát hiện bất thường (D-P2-4) | P2-M2 |
| P2-M5 | F-03 ghép kèo live (WS) | Realtime tìm-nhanh + lấp-chỗ, WS thẳng matchmaking (D-P2-3); tái dùng hold 10' + chống trùng | P2-M2 |
| P2-M6 | F-02 độ hợp + F-04 gom nhóm | Điểm độ hợp có giải thích; gom nhóm lẻ cân bằng (bài toán tối ưu) | P2-M1, P2-M2 |
| P2-M7 | AI-01 matchmaker (Gemini) | Gợi ý kèo có giải thích, xây trên F-02; Gemini qua `packages/ai` (D-P2-6) | P2-M6 |
| P2-M8 | community-support | COM-01..08 (bài viết/bình luận/báo cáo/kiểm duyệt/ticket) | P2-G0 (độc lập, có thể sớm) |
| P2-M9 | AI-02 chatbot RAG (Gemini) | RAG trên chính sách + dữ liệu của chính user (D-P2-5) | P2-M8, GĐ1 data |
| P2-FE0/FE1/FE2 | Frontend GĐ2 (design **Playo**) | Thay P2-Mfe. FE0 nền tảng Playo (thay theme actl.me) → FE1 trang GĐ1 (re-skin + tách trang) → FE2 trang GĐ2. Nối API thật, KHÔNG mock. Theo `docs/design/`. | P2-FE0 + M tương ứng |
| P2-final | Cổng cuối phase | E2E các hành trình kèo/community/AI + bảo toàn giá trị FIN-05 + ledger AC đủ pass | tất cả |

## Ràng buộc xuyên suốt (giữ nguyên từ GĐ1)
- 9 ràng buộc bất biến `SCOPE_BASELINE §4` — đặc biệt **#6 không chuyển tiền ngang hàng**,
  **#8 AI chỉ hỗ trợ/giải thích không tự hành động**, **#9 cộng đồng chỉ nội dung công khai**.
- Schema-per-service (D17): không FK/query xuyên schema; giao tiếp qua API/event.
- Mọi luồng tiền (FIN-05): bảo toàn ba vế + ledger append-only.
- Frontend: KHÔNG lặp lại lỗi F1 GĐ1 — mọi UC phải nối API thật, không để mock shell.

## Pause rules (Codex dừng, báo PO)
- Lộ nhu cầu FK/query xuyên schema → dừng.
- Luồng phí kèo (FIN-05) không bảo toàn ba vế → dừng ngay.
- AI muốn tự thực hiện hành động nhạy cảm (đặt kèo/thu phí/khóa user) → dừng (phá bất biến #8).
- Cần thêm actor ngoài player/provider/admin (kèo có "người tổ chức" = vẫn là player theo ngữ cảnh,
  không tạo role mới) → dừng.
- Gemini API cần credential/quota vượt free-tier → dừng, báo PO.

## Cổng cuối phase (điều kiện nghiệm thu GĐ2)
Toàn bộ AC trong `phase-2-progress.md` ledger `pass` + E2E hành trình kèo/community/AI xanh + kịch
bản bảo toàn giá trị FIN-05 pass + build/typecheck/migrate sạch. Báo cáo tách: kết quả, bằng chứng,
rủi ro.

---

## Bước tiếp theo ngay
1. ✅ Giai đoạn A xong (specs + data-model + phase-2-goal).
2. (Tùy chọn) Bạn rà các mục `【PO-REVIEW】` cuối mỗi spec — nhất là mục chạm tiền/quyền.
3. Giao Codex chạy goal mode bằng prompt bên dưới (trỏ vào `phase-2-goal.md`).

## Prompt goal-mode cho Codex (dán vào goal mode)
```
/goal Thực thi toàn bộ Giai đoạn 2 theo docs/product/phase-2-goal.md.

Đọc trước (thẩm quyền): docs/product/phase-2-goal.md và 4 spec nó trỏ tới
(specs/matchmaking-passport.md, community-support.md, ai-assist.md, finance-match-fee.md) +
docs/architecture/data-model-phase-2.md; nền GĐ1: AGENTS.md, docs/WORKFLOW.md,
docs/SCOPE_BASELINE.md §4 (9 bất biến), code GĐ1 (mẫu outbox/idempotency/ledger/hold).

Chạy theo chuỗi milestone P2-G0→...→P2-final trong phase-2-goal.md. Mỗi milestone: build đúng AC
trong spec → self-verify (test AC + typecheck + build sạch) → 1 vòng Codex review → commit riêng.
Điền test ledger docs/product/phase-2-progress.md (một dòng mỗi AC) làm thước đo done.

Tuân thủ "Ràng buộc xuyên suốt" và dừng theo "Pause rules" trong phase-2-goal.md — đặc biệt:
không FK/query xuyên schema; phí kèo bảo toàn ba vế + không ngang hàng; AI không tự hành động (#8);
frontend nối API thật không mock. Gặp 【PO-REVIEW】 chạm tiền/quyền chưa chốt → dừng hỏi PO.

QUY TẮC HOÀN THÀNH 100% (xem "Quy tắc hoàn thành 100%" trong phase-2-goal.md — bắt buộc, quan
trọng hơn tốc độ): mọi AC phải `pass` hoặc được PO tường minh miễn trừ, không có trạng thái thứ ba.
Cấm tự đánh dấu AC "để sau"/"known issue"/TODO rồi âm thầm chuyển milestone kế. Gặp khó ở một AC cụ
thể → DỪNG NGAY tại đó, hỏi PO rõ ràng (nêu đúng mã AC/quyết định bị chặn), KHÔNG nhảy sang việc
khác để "né" rồi quay lại sau. Trước khi báo hoàn tất Giai đoạn 2, tự đếm AC pass/tổng AC trong 4
spec — phải khớp 100% tuyệt đối.

Cổng cuối: 5 success condition + E2E xanh + AC-FIN-05-8 bảo toàn giá trị + 100% AC pass (không AC
nào ở trạng thái blocked chưa PO quyết). Báo cáo tách: kết quả, bằng chứng, rủi ro. Không tự nghiệm
thu — dừng chờ PO.
```
