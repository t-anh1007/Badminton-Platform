# Quét ảnh tỉ số, tự chốt kết quả, tranh chấp hai tầng — Implementation Plan (giao diện web + bù backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (hoặc subagent-driven-development) để làm từng task. Steps dùng checkbox (`- [ ]`).

**Goal:** Đưa luồng kết quả kèo mới (`rulesVersion='ra_v1'`) lên web đúng mockup PO đã duyệt ngày 22/10/2026: người khai tải ảnh → bản nháp → gửi; đội kia phản hồi; tranh chấp hai tầng; uy tín của tôi; Admin phúc thẩm.

**Architecture:** Một khối "Kết quả trận" trên `MatchDetailPage` đổi nội dung theo trạng thái hồ sơ, có thanh tiến trình và hạn kế tiếp bên phải (Q1). Hồ sơ `legacy` vẫn dùng `MatchResultFlow` cũ, không đổi. Trước khi làm FE, bổ sung các trường backend còn thiếu (B1–B9, B12, B13) trong `matchmaking-service`. FE chỉ đọc API thật, mọi rẽ nhánh lỗi theo `code`.

**Tech Stack:** React 19 + Vite + Tailwind 4 + react-router-dom 7, vitest + testing-library (`apps/web`); Express 4 + Prisma 5 + zod + vitest/supertest (`services/matchmaking-service`).

**Nguồn:** mockup đã duyệt https://claude.ai/artifact/FYEMn78eczFsrpKKZfZUhC (nguồn `ai-notes/mockups/result-ocr/project/`, khung K1–K5, P1–P4, T1–T5, U1, A1–A3, S1; trang `Backend` và `Decisions`) · spec `docs/product/specs/result-ocr-autoconfirm.md` · tech design `docs/architecture/result-ocr-tech-design.md` · plan backend `2026-10-21-result-ocr-autoconfirm.md` (đã xong).

## Quyết định PO 22/10/2026 (Q1–Q9, đều theo khuyến nghị)

| Q | Chốt | Hệ quả |
|---|---|---|
| Q1 | Khối "Kết quả trận" trên trang chi tiết kèo; chỉ Phản đối và Kháng nghị mở hộp thoại | Không thêm route mới cho người chơi |
| Q2 | Bản Vàng không có lý do công khai → hiện câu chung "Đội kia có 6 giờ để kiểm tra"; không bao giờ nêu uy tín | Test: response và DOM của đội kia không chứa uy tín |
| Q3 | "AI chưa chắc" đánh dấu **theo set** (viền cả hàng) | Bỏ B10 |
| Q4 | Không gán lại ảnh vào set; mỗi set hiện ảnh nguồn, sai thì sửa số → Vàng | Bỏ B11 |
| Q5 | Chip "Luật 31" mở đoạn luật cho người chơi | B8 thành bắt buộc |
| Q6 | Không làm màn kho luật; nạp bằng script | Bỏ A4, B14 |
| Q7 | Một nút "Chọn ảnh" (`<input type=file accept="image/*">`), không có webcam | — |
| Q8 | FE tự tính mức **dự kiến** khi sửa ô / tự chọn cột / gõ tay (→ Vàng); server vẫn là chuẩn | Ghi chữ "dự kiến" |
| Q9 | Admin thấy nhà cung cấp, model, độ tin cậy trong phần thu gọn "Chi tiết AI" | — |

## Global Constraints

- Desktop trước, không tối ưu riêng mobile; sạch, ít chữ, không xé luồng; dùng token/component đang có trong `apps/web` (navy/vàng, Archivo/Inter/Geist Mono) — mockup là tham chiếu bố cục, **không** chép HTML mockup vào code.
- Chữ trên UI là ngôn ngữ nghiệp vụ tiếng Việt: không "slot / partner / claim / OCR / case"; dùng "bản khai", "người trả phần", "hồ sơ kết quả"…
- FE rẽ nhánh theo `error.code` (vd `RESULT_VERSION_STALE`, `RESULT_SCORE_INVALID`, `RESULT_APPEAL_GROUNDS_REQUIRED`, `RESULT_OBJECTION_EVIDENCE_REQUIRED`), **không** so `message`.
- Uy tín không bao giờ hiện cho người khác ngoài chính chủ và Admin (BR-RA-53).
- Ảnh: kiểm ở FE ≤ 15 MB/ảnh, JPG/PNG/WebP, 1–5 ảnh/bản khai; số còn lại lấy từ `viewerQuota` (B12), không viết cứng.
- Hồ sơ `legacy`: giữ nguyên `MatchResultFlow`, `ResultCaseReview`, `ManageMatchResultsPage`; không xóa code cũ.
- Thời gian hiển thị theo giờ VN; hạn đã dời qua đêm có nhãn "dời sang 08:00".
- Backend: thêm trường vào response là **thêm**, không đổi/xóa trường cũ; không đụng trigger chỉ ghi thêm.
- Kiểm chứng: test tập trung của task đó được chạy (TDD); `npm run build` ở root **trước mỗi commit** (hard rule); **không** tự chạy toàn bộ test workspace hay `npm run e2e` — hỏi PO. Baseline ~13 test `apps/web` đỏ sẵn, không để chặn.
- Commit dạng `type(scope): mô tả` mỗi task, **không push**, không xóa branch `TuanAnh`. File tạm chỉ ở `ai-notes/`.

## Review Focus

1. Đội kia không suy ra được uy tín Thấp của người khai (Q2) — kiểm cả JSON response lẫn DOM.
2. Đồng ý với bản khai đã bị thay → `RESULT_VERSION_STALE` → FE tải lại hồ sơ và báo "bản khai vừa được thay", không mất thao tác khác.
3. Bằng chứng tranh chấp giữ kín 2 giờ: FE không hiện ảnh đội kia trước khi cửa sổ đóng (dựa vào API, không ẩn bằng CSS).
4. Hạn kế tiếp đúng sau khi dời qua đêm, và đếm ngược tự chuyển trạng thái khi hết hạn (gọi lại `GET result-case`, backend quét lười).
5. Hồ sơ `legacy` mở trên trang kèo vẫn hiện luồng cũ.

---

## Phần A — Bù backend (`services/matchmaking-service`)

Đối chiếu mã B* với trang `Backend` trong mockup. Mỗi task: viết test thất bại → cài → PASS → root build → commit.

### Task A1: Hồ sơ người chơi đủ trạng thái phản hồi, kháng nghị, Admin (B1, B2, B3, B13)

**Files:** `src/domain/resultCaseViewV2.ts`, test mới `test/resultCaseViewV2.fields.test.ts`.

- [ ] Test thất bại: `GET /:matchId/result-case` (hồ sơ `ra_v1`) trả
  - `responses[{userId, displayName, kind:'confirm'|'object', createdAt}]` (B1);
  - `pendingPayerUserId` khi người được trả phần đã Đồng ý và còn chờ người trả, giữ nguyên sau khi tải lại (B2);
  - `viewerAppeal{accepted, createdAt}` hoặc `null` (bị từ chối vì thiếu căn cứ / đã lên Admin phân biệt được), `adminReason`, `adminReviewStartedAt` (B3);
  - `evidenceDoneSides: ('A'|'B')[]` (B13).
  - Hồ sơ `legacy` không đổi shape cũ.
- [ ] Cài đặt, PASS, chạy lại `test/resultResponsesV2.test.ts` cũ PASS.
- [ ] Root build, commit `feat(matchmaking): expose responses, appeal and admin state in result case`.

### Task A2: Trích dẫn luật đọc được (B8)

**Files:** `resultCaseViewV2.ts` (+ tra `KnowledgeChunk`), test cùng file A1.

- [ ] Test: kết quả tầng 1 và phán quyết tầng 2 trả `citations[{id, title, excerpt}]` (excerpt ≤ 400 ký tự); án lệ ẩn danh, không lộ tên người/mã kèo khác; không có `adminNotes` trong response người chơi.
- [ ] Cài, PASS, root build, commit `feat(matchmaking): return rule excerpts for result citations`.

### Task A3: Bản nháp có nhãn cột và hạn mức ảnh (B9, B12)

**Files:** `src/domain/resultOcr.ts` (draft), `resultCaseViewV2.ts`, test `test/resultOcr.test.ts`.

- [ ] Test: bản nháp trả `columns{left, right}` (chữ AI đọc được trên đầu cột, `null` nếu không thấy) (B9); hồ sơ và bản nháp trả `viewerQuota{photosUsed, photosLimit, draftsLeft}`, `photosLimit` tăng +2 khi đang kháng nghị (B12).
- [ ] Cài, PASS, root build, commit `feat(matchmaking): return column labels and photo quota for drafts`.

### Task A4: Uy tín của tôi có danh sách vi phạm (B4)

**Files:** `src/routes/passports.ts`, `src/domain/reputation.ts`, test `test/reputation.test.ts`.

- [ ] Test: `GET /passports/me/reputation` trả thêm `violations[{matchCode, kind, createdAt, expiresAt}]` còn hiệu lực + `recoversAt`; người khác không gọi được cho user khác.
- [ ] Cài, PASS, root build, commit `feat(matchmaking): list active violations in my reputation`.

### Task A5: Admin — lý do vào hàng chờ, chi tiết hồ sơ mới, loại vi phạm cố định (B5, B6, B7)

**Files:** routes admin trong `src/routes/matchResults.ts`, `resultCaseViewV2.ts`, `src/domain/reputation.ts`; test `test/adminResultCasesV2.test.ts`.

- [ ] Test:
  - `GET /admin/result-cases?reason=&level=` trả `adminReason ∈ {unknown_photo, appeal, ai_unavailable, evidence_unreadable, incident, legacy}`, `level`, lọc đúng (B5);
  - `GET /admin/result-cases/:caseId` hồ sơ `ra_v1` trả bản khai dạng `claimView` (kể cả lý do nội bộ), mỗi ảnh có `capturedAt`, `exactDuplicateOf{matchCode}`, `nearDuplicateOf{matchCode}`, `isScreenshot`, `ai{provider, model, confidence}` (B6, Q9);
  - `POST /:matchId/admin-decision` từ chối `violations[].kind` ngoài enum `{false_claim, near_duplicate_fraud, false_incident}` bằng `400 RESULT_VIOLATION_KIND_INVALID`; loại tự sinh (trùng chính xác, kháng nghị vô căn cứ) vẫn do hệ thống ghi (B7). Đối chiếu tên với BR-RA-51 trong spec, nếu khác thì theo spec.
- [ ] Kiểm `api-gateway` có cần thêm gì để truyền query `reason/level` (thường không).
- [ ] Cài, PASS, root build, commit `feat(matchmaking): admin queue reasons and richer photo-result case view`.

---

## Phần B — Giao diện web (`apps/web`)

### Task B1: API client và kiểu dữ liệu

**Files:** `src/lib/resultApi.ts` (mới, tách khỏi `matchApi.ts` đã 397 dòng), test `src/lib/resultApi.test.ts`.

- [ ] Hàm cho mọi route ở trang `Backend` mục "Đã đủ, FE dùng thẳng" + các trường A1–A5; kiểu `ResultCaseV2` phân biệt `rulesVersion`.
- [ ] Tải ảnh: xin URL (`POST result-evidence/uploads`) → PUT lên R2 → `POST result-uploads` (timeout phía FE 35 s).
- [ ] Hàm `estimateLevel(draft, edits)` thuần cho Q8 + test (sửa ô / tự chọn cột / gõ tay → Vàng; Đỏ giữ Đỏ).
- [ ] Test PASS, root build, commit `feat(web): result photo API client and level estimate`.

### Task B2: Khung "Kết quả trận" trên trang kèo

**Files:** `src/components/result/MatchResultPanel.tsx` (mới), `ResultProgressRail.tsx` (thanh tiến trình + hạn kế tiếp + nhãn dời qua đêm), sửa `src/pages/MatchDetailPage.tsx` chỉ để chọn panel.

- [ ] `rulesVersion==='legacy'` → render `MatchResultFlow` cũ; `ra_v1` → `MatchResultPanel` chọn khung theo trạng thái + vai trò người xem.
- [ ] Đếm ngược hết hạn → gọi lại `GET result-case`; có cập nhật realtime/thông báo hiện có thì tải lại theo cùng cơ chế.
- [ ] Test: legacy vẫn hiện luồng cũ; ra_v1 hiện rail đúng hạn, nhãn "dời sang 08:00".
- [ ] Root build, commit `feat(web): match result panel shell with deadline rail`.

### Task B3: Người khai — K1 tải ảnh, K2 đang đọc, K3 bản nháp, K4 gõ tay, K5 đã gửi

**Files:** `src/components/result/reporter/*.tsx` + test.

- [ ] K1: một nút "Chọn ảnh" (Q7), kiểm định dạng/15 MB/số ảnh theo `viewerQuota`; link báo sự cố.
- [ ] K2: trạng thái đọc ảnh tối đa 30 s; ảnh lỗi → set đó chuyển gõ tay.
- [ ] K3: bảng set, viền vàng cả hàng set AI chưa chắc (Q3), ảnh nguồn mỗi set (Q4, không gán lại), sửa ô vẫn hiện số AI đọc, hỏi cột theo `columns` (B9), kiểm luật tỉ số (`RESULT_SCORE_INVALID`), mức **dự kiến** + lý do (Q8), "Không có kết quả".
- [ ] K4: gõ tay khi AI lỗi/hết giờ, vẫn kèm ảnh, tối đa Vàng.
- [ ] K5: đã gửi, hạn phản hồi, thay bản khai khi chưa ai phản hồi (`RESULT_REPLACE_CLOSED` → tải lại), đồng đội gửi thêm ảnh.
- [ ] Test PASS, root build, commit `feat(web): photo result reporting flow`.

### Task B4: Đội kia — P1 phản hồi, P2 phản đối, P3 chờ người còn lại, P4 Đỏ / không KQ / đã chốt

**Files:** `src/components/result/respond/*.tsx` + test.

- [ ] P1: kết quả đề xuất, ảnh, số AI đọc so với số đã sửa, mức + lý do công khai; không có lý do công khai → câu chung (Q2); Đồng ý gửi `claimVersion`, `RESULT_VERSION_STALE` → tải lại + báo.
- [ ] P2: hộp thoại Phản đối ("Tỉ số sai" / "Không có trận"), bắt kèm ảnh khi server trả `RESULT_OBJECTION_EVIDENCE_REQUIRED`.
- [ ] P3: kèo đôi chờ người còn lại 1 giờ (từ `responses`), chờ người trả phần (`pendingPayerUserId`).
- [ ] P4: Đỏ chuyển Admin, không tự chốt; khai không có kết quả; đã chốt.
- [ ] Test (gồm: DOM đội kia không chứa chữ "uy tín"), root build, commit `feat(web): opponent response flow for photo results`.

### Task B5: Tranh chấp — T1 bằng chứng, T2 kết quả tạm, T3 phán quyết AI, T4 kháng nghị, T5 chờ Admin / kết quả cuối

**Files:** `src/components/result/dispute/*.tsx` + test.

- [ ] T1: nộp ảnh 2 giờ, ảnh đội kia giữ kín, "Đội tôi đã nộp đủ" + trạng thái đội kia (`evidenceDoneSides`).
- [ ] T2/T3: lý do + chip "Luật N" mở đoạn trích (`citations`, Q5); 6 giờ kháng nghị; "Chấp nhận" để chốt sớm.
- [ ] T4: hộp thoại kháng nghị chỉ cho bên bị xử thua; ảnh mới ≤ 2 hoặc chỉ ra lý do sai; `RESULT_APPEAL_GROUNDS_REQUIRED`.
- [ ] T5: lý do chuyển Admin (`adminReason`), hạn 48 giờ, tiền và điểm đang khóa; kết quả cuối.
- [ ] Test, root build, commit `feat(web): dispute, ruling and appeal screens for photo results`.

### Task B6: Uy tín của tôi (U1)

**Files:** `src/pages/PassportPage.tsx` (thêm mục, không viết lại trang) hoặc component con, test `PassportPage.test.tsx`.

- [ ] Mức của tôi, vi phạm còn hiệu lực, ngày tự hồi, 2 tác động; chỉ hiện trên hồ sơ của chính mình.
- [ ] Test, root build, commit `feat(web): my reputation and active violations`.

### Task B7: Admin — A1 hàng chờ, A2 xử hồ sơ, A3 soi ảnh

**Files:** `src/pages/admin/AdminMatchResultsPage.tsx` (thêm lọc theo lý do/mức), `src/components/result/admin/*.tsx`; giữ `ResultCaseReview` cho hồ sơ legacy.

- [ ] A1: lọc theo `adminReason`, `level`, đánh dấu quá 48 giờ.
- [ ] A2: bản khai + mức, phán quyết tạm kèm `adminNotes`, kháng nghị (có căn cứ hay không), uy tín; xem trước tác động (`admin-decision/preview`); ra 3 kết quả; ghi vi phạm theo enum B7; "Chi tiết AI" thu gọn (Q9).
- [ ] A3: soi ảnh — số AI đọc, giờ chụp, trùng/gần trùng hồ sơ khác, ảnh chụp màn hình.
- [ ] Test, root build, commit `feat(web): admin queue and case review for photo results`.

### Task B8: Trạng thái S1 và liên kết thông báo

- [ ] Đang tải / rỗng / lỗi mạng / bản đã bị thay / hết hạn / AI chậm cho các khung trên (theo khung S1).
- [ ] Thông báo kết quả kèo mở đúng trang kèo và cuộn tới khối "Kết quả trận".
- [ ] Test, root build, commit `feat(web): loading, empty and error states for photo results`.

### Task B9: Kiểm chứng và tài liệu

- [ ] Chạy local (backend + web, xem `ai-notes/qa/README.md`), đi trọn 3 luồng ở desktop 1440px: khớp → chốt; lệch → tầng 1; tầng 2 → kháng nghị → Admin. Chụp đúng vùng khối "Kết quả trận" và màn Admin, so với mockup; ảnh để `ai-notes/qa/`.
- [ ] Cập nhật `docs/product/phase-3-progress.md` (mục M-RA: phần web, AC nào có test FE).
- [ ] Báo PO: kết quả, bằng chứng, rủi ro; **hỏi** trước khi chạy test toàn workspace hoặc `npm run e2e`.
- [ ] Commit `docs(product): record web delivery for photo results`.

## Ngoài phạm vi

- Màn kho luật (Q6), webcam (Q7), gán lại ảnh vào set (Q4), độ chắc theo ô (Q3).
- Push, merge, deploy (đi qua `/release` khi PO yêu cầu).
- Mobile riêng.

## Kết quả (đóng plan 22/10/2026)

- Phần A (`b36c25e` … `fca0083`) và Phần B (`6c9c74c` … `6177747`) xong; vá sau review: `a48fcf3`, `a577d29`, `03c71c9`,
  `839599b`, `237fce8`, `4c64b10`, `2bf073b`.
- Kiểm chứng: toàn bộ test `apps/web` chạy 22/10 (248/250; một lỗi do thẻ uy tín đã sửa ở `a48fcf3`, một lỗi quá thời gian khi chạy
  song song); test tập trung từng task xanh; root build xanh trước mỗi commit; đi 3 luồng thật ở 1440px bằng Playwright (ảnh và script ở
  `ai-notes/qa/result-ocr/`).
- Lệch so với plan: lý do vào hàng chờ Admin suy ra từ dữ liệu, không thêm cột; số AI đọc của ô đã sửa xem ở chú thích ảnh; "Không có kết
  quả" suy ra từ tỉ số. Chưa chạy `npm run e2e`, chưa push/deploy.
