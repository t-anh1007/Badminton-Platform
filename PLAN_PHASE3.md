# PLAN_PHASE3 — Lộ trình Giai đoạn 3 (Stabilization · Thesis · Defense)

Nguồn: `docs/product/phasing.md §5`, `PLAN_PHASE2.md` (tiền nhiệm). GĐ3 không có UC nền mới.
Mục tiêu: biến sản phẩm GĐ1+GĐ2 thành bản hoàn chỉnh cho demo bảo vệ đồ án.

## Phạm vi GĐ3 (đã chốt tại phasing.md)

- **0 UC nền mới** — toàn bộ 62 UC + 5 tính năng đã xong ở GĐ1+GĐ2.
- **F-05** (Bản đồ nhiệt nhu cầu & giờ vàng) — tính năng duy nhất có thể thêm, điều kiện: seed
  data sẵn sàng. Cắt được đầu tiên nếu deadline căng.
- Hoàn thiện, kiểm thử tổng thể, sửa lỗi tồn đọng.
- Viết tài liệu và báo cáo đồ án.
- Chuẩn bị demo bảo vệ.

## Phân công

| Vai | Ai |
|---|---|
| Executor (test, polish, seed, demo) | **Claude Code** |
| Review code change | **Codex** (1 vòng mỗi milestone có code change) |
| Viết báo cáo đồ án | **PO** (Claude Code hỗ trợ phần kỹ thuật) |
| Nghiệm thu | **PO** |

---

## GIAI ĐOẠN A — Assessment & Bug Fix

### P3-S0: Assessment & Triage

**Điều kiện vào:** GĐ2 hoàn tất (100% AC GĐ2 pass trong `phase-2-progress.md`).

**Công việc:**
1. Chạy toàn bộ test suite GĐ1 + GĐ2 trên một DB migration sạch.
2. Chạy `npm run typecheck` và `npm run build` — ghi lại mọi warning/error.
3. Chạy E2E Playwright hiện có — ghi lại failure.
4. Catalog toàn bộ bug/failure vào backlog (tệp `docs/product/phase-3-backlog.md`).
5. Quyết định F-05 go/no-go: kiểm tra seed data đã sẵn sàng chưa.

**Sản phẩm:** `phase-3-backlog.md` (danh sách bug ưu tiên) + quyết định F-05.

### P3-M1: Regression Fix & Cross-phase E2E

**Công việc:**
1. Sửa toàn bộ bug trong backlog (ưu tiên P0 → P1 → P2).
2. Đảm bảo 100% AC GĐ1 (198) + 100% AC GĐ2 vẫn pass.
3. Viết ≥ 5 kịch bản E2E Playwright xuyên phase:
   - J1: Đặt sân trả tiền (GĐ1 đầy đủ)
   - J2: Nhà cung cấp vận hành (GĐ1 cung)
   - J3: Hủy + hoàn tiền 3 mốc (GĐ1 tài chính)
   - J4: Kèo + ghép kèo live + AI gợi ý (GĐ1+GĐ2)
   - J5: Cộng đồng + chatbot AI (GĐ2)
4. Test bảo toàn giá trị tài chính end-to-end (kịch bản nạp → đặt → kèo → hủy → rút → kiểm
   tổng ledger bằng 0).

**Success condition:** 0 test failure; 5 E2E xanh; bảo toàn giá trị pass.

---

## GIAI ĐOẠN B — F-05 & Demo (song song được)

### P3-M2: F-05 Demand Heatmap (conditional)

> **Skip nếu:** seed data chưa sẵn sàng tại thời điểm này. Ghi `skipped` vào ledger.

**Công việc:**
1. Tạo script sinh seed data (`scripts/seed-demo.ts`):
   - ≥ 100 user, ≥ 5 nhà cung cấp, ≥ 2000 booking, ≥ 200 kèo.
   - Phân bố mô phỏng thực: giờ cao điểm 18–21h, cuối tuần > ngày thường.
2. Implement `packages/ai/analytics/demandAggregate`:
   - Tổng hợp booking theo `venue × court × weekday × hour`.
   - Phân mức bằng percentile (P75/P25).
   - Cache kết quả (TTL 1 giờ).
3. API endpoint cho venue-booking-service.
4. Frontend: heatmap component + slot gợi ý cho người chơi; báo cáo slot ế cho nhà cung cấp.
5. Test 8 AC trong `f05-demand-heatmap.md`.

**Phụ thuộc:** P3-M1 (regression clean).

### P3-M3: Seed Data & Demo Environment

**Công việc:**
1. Nếu P3-M2 đã tạo seed script → mở rộng cho đủ kịch bản demo. Nếu skip → tạo seed script
   từ đầu (chỉ cần đủ cho demo, không cần lượng lớn cho F-05).
2. Seed data phải tạo ra trạng thái thuyết phục:
   - Nhiều cơ sở sân với tên/địa chỉ giả nhưng hợp lý.
   - Booking ở nhiều trạng thái (confirmed, completed, cancelled).
   - Kèo ở nhiều trạng thái (open, confirmed, completed, cancelled).
   - Bài viết cộng đồng có nội dung.
   - Lịch sử giao dịch tài chính đa dạng.
3. Cấu hình demo environment:
   - `.env.demo` với giá trị phù hợp.
   - Script `npm run demo:setup` (migrate + seed + start).
   - Tài khoản demo (admin, player, provider) với mật khẩu đã biết.

**Sản phẩm:** `scripts/seed-demo.ts` + `npm run demo:setup` + tài liệu truy cập demo.

---

## GIAI ĐOẠN C — Polish & Documentation

### P3-M4: UI/UX Polish

**Công việc:**
1. Rà soát responsive trên mobile/tablet/desktop.
2. Loading states, empty states, error messages — nhất quán và tiếng Việt.
3. Sửa UX issues phát hiện khi chạy demo script.
4. Kiểm tra accessibility cơ bản (contrast, tab navigation).
5. Favicon, page titles, meta tags cho SEO cơ bản.

**Không làm:** redesign, thêm tính năng, animation phức tạp.

### P3-M5: Thesis Report & Documentation

**Công việc:**
1. **Hỗ trợ PO viết báo cáo đồ án** theo dàn ý 10 chương (xem `phase-3-goal.md`):
   - Chương 1–3: PO viết chính (giới thiệu, lý thuyết, phân tích yêu cầu).
   - Chương 4–8: Claude Code cung cấp nội dung kỹ thuật (kiến trúc, spec, code, test, deploy).
   - Chương 9–10: PO viết chính, Claude Code hỗ trợ số liệu.
2. Finalize tài liệu kiến trúc (system-architecture, data-model, flows, ai-design).
3. Tạo API documentation (Swagger/OpenAPI hoặc markdown) cho mỗi service.
4. Viết user guide ngắn cho demo.

**Sản phẩm:** nội dung kỹ thuật cho báo cáo + API docs + user guide.

### P3-M6: Defense Preparation

**Công việc:**
1. Viết **demo script** chi tiết (từng bước, dự kiến thời gian mỗi kịch bản).
2. Chuẩn bị bài trình bày (slide outline — PO quyết nội dung).
3. Liệt kê **câu hỏi hội đồng dự kiến** + câu trả lời chuẩn bị:
   - Vì sao microservices cho đồ án 1 người? → Lý do học thuật + kiến trúc co giãn.
   - Vì sao không dùng API hoàn tiền? → SePay không hỗ trợ, mô hình số dư nội bộ.
   - WebSocket có mâu thuẫn với quyết định cắt chat? → Không, xem discovery §8.
   - AI chỉ hỗ trợ — vì sao không cho AI tự hành động? → Bất biến #8, đồ án 1 người.
   - Glicko-2 so với ELO? → Có độ bất định, cold-start tốt hơn.
4. Chạy thử demo ≥ 1 lần trên demo environment, ghi lại vấn đề, sửa.

**Sản phẩm:** demo script + slide outline + Q&A doc + ≥ 1 dry-run thành công.

### P3-final: Cổng cuối phase

**Điều kiện:**
1. ✅ 100% AC GĐ1 + GĐ2 vẫn pass (regression clean).
2. ✅ 5 E2E xuyên phase xanh.
3. ✅ F-05: 8 AC pass HOẶC `skipped` có lý do.
4. ✅ Demo script chạy trọn ≥ 3 kịch bản không lỗi.
5. ✅ Báo cáo đồ án đủ chương; bài trình bày sẵn sàng.

---

## Ràng buộc xuyên suốt

- 9 ràng buộc bất biến SCOPE_BASELINE §4 — không ngoại lệ.
- Không thêm UC nền mới (phasing.md §5).
- Không refactor lớn — chỉ bug fix và polish.
- Seed data không dùng dữ liệu thật của người thật.
- Báo cáo đồ án theo format của trường (PO cung cấp template).

## Rủi ro

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| R1 | GĐ2 trượt tiến độ, GĐ3 bị nén | Cao | Cắt F-05 đầu tiên; giảm bớt kịch bản E2E từ 5 xuống 3; gộp P3-M4 vào P3-M3 |
| R2 | Seed data không thuyết phục khi demo | Trung bình | Ưu tiên chất lượng dữ liệu demo hơn số lượng; dùng tên thật (sân cầu lông nổi tiếng) |
| R3 | Regression khi merge GĐ2 code | Trung bình | P3-S0 chạy toàn bộ test ngay đầu phase |
| R4 | Format báo cáo trường yêu cầu thay đổi muộn | Thấp | Viết nội dung modular, dễ sắp xếp lại chương |
| R5 | Demo environment không ổn định (Railway free-tier) | Trung bình | Chạy demo local nếu cloud không ổn |

## Bước tiếp theo

1. PO review và duyệt `phase-3-goal.md` + `specs/f05-demand-heatmap.md`.
2. Chờ GĐ2 hoàn tất → vào P3-S0.
3. Chốt Q2 (seed data) → quyết định F-05 go/no-go.
4. PO cung cấp template báo cáo đồ án của trường (nếu có yêu cầu format cụ thể).
