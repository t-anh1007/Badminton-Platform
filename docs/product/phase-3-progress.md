# Tiến độ GĐ3 — test ledger

Nguồn mục tiêu: `phase-3-goal.md`. Ledger này ghi bằng chứng tự động theo từng milestone; "pass" chỉ có nghĩa là có test
tự động xanh ở mức ghi trong cột bằng chứng, không thay cho E2E hay gọi thật API AI.

## M-RA — Quét ảnh tỉ số, tự chốt, tranh chấp hai tầng (backend + AI)

- Plan: `docs/plans/active/2026-10-21-result-ocr-autoconfirm.md` (16 task, không gồm UI web).
- Spec: `specs/result-ocr-autoconfirm.md` (vẫn `draft-for-po-review`); thiết kế: `architecture/result-ocr-tech-design.md`; D60, D61.
- Trạng thái: backend + AI xong theo plan, **chưa kiểm chứng E2E và chưa gọi thật nhà cung cấp AI** (`GEMINI_API_KEY` local trống).
  Mọi test dùng AI giả (`fetchImpl`), không gọi mạng. UI web làm plan riêng sau khi PO duyệt mockup desktop.
- Chạy lại: `npm test -w services/matchmaking-service -- test/result test/confidence.test.ts test/deadlines.test.ts test/evidenceSignals.test.ts test/knowledge.test.ts test/disputeRulingJob.test.ts test/reputation.test.ts` và `npx vitest run packages/ai/test`.

| AC | Bằng chứng tự động (matchmaking-service/test trừ khi ghi khác) | Trạng thái |
|---|---|---|
| AC-RA-01 | `resultOcr.test.ts` (người ngoài roster 403), `resultResponsesV2.test.ts` (đồng đội/đối thủ đều gửi được bản khai) | pass |
| AC-RA-02 | `resultClaimsV2.test.ts` (bản đầu mở cửa sổ ngay theo mức) | pass |
| AC-RA-03 | `resultOcr.test.ts` (mọi mắt xích lỗi → gõ tay, Vàng), `packages/ai/test/resultOcr.test.ts` (JSON sai khuôn bị loại) | pass |
| AC-RA-04 | `confidence.test.ts` (từng điều kiện Xanh/Vàng/Đỏ), `resultClaimsV2.test.ts` (lý do không lộ uy tín) | pass |
| AC-RA-05 | `confidence.test.ts`, `resultClaimsV2.test.ts` (sửa ô → Vàng + `EDITED_CELL`); DTO trả `aiReading` từng ảnh nhưng chưa có test đọc DTO | một phần |
| AC-RA-06 | `confidence.test.ts` (cột người khai chọn không bao giờ Xanh) | pass |
| AC-RA-07 | `confidence.test.ts` (gộp set, ảnh chụp muộn nhất, lệch set → Vàng), `resultOcr.test.ts` (ảnh không đọc kịp → set gõ tay); giới hạn 6 ảnh/bản (zod) và ảnh thứ 8/người chưa có test riêng | một phần |
| AC-RA-08 | `resultClaimsV2.test.ts` (NO_RESULT hết giờ hòa) | pass |
| AC-RA-09 | `resultClaimsV2.test.ts` (2h/6h/12h), `resultSweepV2.test.ts` (final đúng một lần) | pass |
| AC-RA-10 | `deadlines.test.ts`, `resultClaimsV2.test.ts` (22:30 → 08:00), `resultSweepV2.test.ts` (hạn khai 02:00 → 08:00); SLA Admin không giãn theo code, chưa có test riêng | một phần |
| AC-RA-11 | `resultResponsesV2.test.ts` (đơn final ngay; đôi grace 1h; phản đối trong grace → tranh chấp; bản cùng bên thắng) | pass |
| AC-RA-12 | `resultResponsesV2.test.ts` (partner được trả thay không chốt sớm; chủ kèo chấp nhận → final) | pass |
| AC-RA-13 | `resultResponsesV2.test.ts` (Đỏ + Đồng ý → Admin), `resultSweepV2.test.ts` (Đỏ hết 12h → Admin) | pass |
| AC-RA-14 | `resultResponsesV2.test.ts` (đồng đội khác bên thắng → tranh chấp) | pass |
| AC-RA-15 | `resultResponsesV2.test.ts` (`no_match` → Admin; `score_wrong` → tranh chấp) | pass |
| AC-RA-16 | `resultResponsesV2.test.ts` (`RESULT_VERSION_STALE`, hai hành động đồng thời không 500) | pass |
| AC-RA-17 | `resultTier1.test.ts` (ảnh đội kia 404 `RESULT_EVIDENCE_SEALED`, hai đội Đã nộp đủ → mở) | pass |
| AC-RA-18 | `resultTier1.test.ts` (`tier1Decide` 3 nhánh, Đỏ bị loại riêng, Xanh ngược Vàng → tầng 2) | pass |
| AC-RA-19 | `disputeRulingJob.test.ts` (≥ ngưỡng → 6h; < ngưỡng/lỗi quá 30 phút → Admin; không ảnh, không uy tín), `resultTier1.test.ts` (ảnh không đọc được sau 30 phút → Admin) | pass |
| AC-RA-20 | `resultAppeals.test.ts` (bên thắng, thiếu căn cứ, quá 6h bị từ chối; hợp lệ → Admin) | pass |
| AC-RA-21 | `resultAppeals.test.ts` (Chấp nhận đơn/đôi) | pass |
| AC-RA-22 | `resultResponsesV2.test.ts` (sự cố mỗi người một lần), `resultAppeals.test.ts` (Admin ra kết quả cuối) | pass |
| AC-RA-23 | `packages/ai/test/disputeRuling.test.ts` (ngoài 3 kết quả bị loại); không có đường code AI ghi tiền (tiền chỉ qua `writeResultFinal` hiện có) | một phần |
| AC-RA-24 | `resultSweepV2.test.ts` (quét hai lần chỉ một sự kiện final), `disputeRulingJob.test.ts` (chạy song song chỉ một phán quyết) | một phần |
| AC-RA-25 | `resultAppeals.test.ts` (vi phạm tự động chỉ khi trùng chính xác, Admin xác nhận, tối đa 1/người/hồ sơ) | pass |
| AC-RA-26 | `resultClaimsV2.test.ts`, `resultResponsesV2.test.ts`, `reputation.test.ts` (API công khai không có uy tín) | pass |
| AC-RA-27 | `resultOcr.test.ts` (AI lỗi → gõ tay); đóng bằng chứng khi chuỗi tầng 2 rỗng → Admin theo code, chưa có test `RESULT_AI_ENABLED=false` | một phần |
| AC-RA-28 | Án lệ chỉ được tạo khi Admin quyết định (`resultAppeals.test.ts`) + ca mẫu từ `scripts/knowledge/ingest.ts` | một phần |

Đánh giá NCKH: `scripts/eval/ocr-eval.ts`, `scripts/eval/ruling-eval.ts`, `scripts/eval/metrics.sql` (đã chạy trên DB local).

### Lượt gọi thật đầu tiên (22/10/2026, free tier, dữ liệu giả)

Bộ thử rất nhỏ — 4 ảnh bảng tỉ số tự sinh (bảng in, chữ kiểu viết tay nghiêng, bảng lật điểm không tên, ảnh mờ nghiêng)
và 3 ca mẫu — nên chỉ là kiểm tra khói, **chưa phải số liệu cho chương thực nghiệm** (cần bộ ảnh thật của team, 30–50 ca mẫu).

| Việc | Mắt xích | Kết quả |
|---|---|---|
| Đọc ảnh | gemini-3.6-flash | 87,5% ô, 75% bên thắng; 1/4 lỗi 503 (quá tải); trễ ~3,8 s |
| Đọc ảnh | gemini-3.5-flash-lite | 100% ô, 100% bên thắng; trễ ~1,3 s |
| Đọc ảnh | groq qwen3.8-27b | 62,5% ô; 2/4 bị từ chối ngay (~150 ms, nghi giới hạn token/phút 8K); lượt gọi lẻ đọc đúng |
| Đọc ảnh | openrouter nemotron-3.5-super-vl:free | 100% ô, 100% bên thắng; trễ ~7,9 s |
| Tầng 2 | gemini-3.8-flash | 1/3 đúng; 2/3 lỗi 503 phía Google; khi chạy được trễ 15–67 s |
| Tầng 2 | groq gpt-oss-120b | 2/3 đúng, Faithfulness 100%; trễ ~1,2 s |
| Tầng 2 | openrouter nemotron-3-ultra:free | 2/3 đúng, 1 sai khuôn; trễ ~17 s |
| Embedding | gemini-embedding-2 | 62 đoạn, 768 chiều, ~0,6 s/lượt |

Nguồn bổ sung đo ngày 22/10/2026 (Cloudflare Workers AI free 10.000 neurons/ngày; Ollama Cloud free):

| Việc | Mắt xích | Kết quả |
|---|---|---|
| Đọc ảnh | cloudflare llama-4-scout-17b | 100% ô, 100% bên thắng; trễ ~4,5 s; ~68 neurons/ảnh (~147 ảnh/ngày free) |
| Đọc ảnh | cloudflare gemma-4-26b | 75% ô; 1/4 lỗi; trễ ~17,5 s |
| Đọc ảnh | ollama gemma4:31b | 0/4 (sai khuôn) |
| Tầng 2 | cloudflare gpt-oss-120b / qwen3-30b; ollama gpt-oss:120b/20b, gemma4:31b | 0–1/3 đúng, đa số sai khuôn: hai nguồn này không ép `json_schema` |
| — | ollama kimi-k3, deepseek-v4.1-flash, glm-5.3-flash | HTTP 402: không thuộc gói free |
| Tầng 2 (đối chứng) | gemini-3.7-flash | là tên khác của 3.8-flash, chung hạn mức free 20 lượt/ngày |
| Tầng 2 (đối chứng) | gemini-3.5-flash-lite / 3.6-flash | 3/3 và 2/3 đúng, không lỗi |

Sửa sau lượt gọi thật: tầng 2 gửi `reasoning_effort: low` (Gemini/Groq), thời hạn riêng `AI_RULING_TIMEOUT_MS` (mặc định
90 s, tầng 2 chạy nền); prompt nói rõ chỉ trích `rules[].id` (Nemotron từng trích mã bằng chứng và bị bộ kiểm loại đúng).
