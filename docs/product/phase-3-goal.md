---
type: goal
scope: Giai đoạn 3 (toàn bộ)
kind: orchestration-goal (stabilization + thesis + defense)
phase: 3
status: draft-for-po-review
executor: Claude Code — build, test, polish; Codex review mỗi milestone
author_of_specs: Claude Code
final_acceptance: PO (Tuan Anh) — cuối phase + hội đồng bảo vệ
created: 2026-08-08
source: phasing.md §5, PLAN_PHASE3.md
---

# Goal bao quát — Hoàn thành Giai đoạn 3 (Stabilization · Thesis · Defense)

> **Hình dạng:** GĐ3 không có UC nền mới. Mục tiêu là biến sản phẩm GĐ1+GĐ2 thành bản demo
> hoàn chỉnh, viết báo cáo đồ án, và chuẩn bị bảo vệ. F-05 là tính năng duy nhất có thể thêm
> (điều kiện: seed data sẵn sàng).

## Vai trò

| Vai | Ai |
|---|---|
| Executor | **Claude Code** (stabilization, test, polish, report hỗ trợ) |
| Review | **Codex** (1 vòng mỗi milestone có code change) |
| Nghiệm thu | **PO** — cuối phase |
| Hội đồng | Giảng viên — buổi bảo vệ |

## Nguồn thẩm quyền

- `docs/product/phasing.md` §5 (phạm vi GĐ3)
- `docs/product/specs/f05-demand-heatmap.md` (F-05 nếu kích hoạt)
- Toàn bộ specs GĐ1 (`account-access`, `venue-scheduling`, `court-booking`, `finance-disputes`)
- Toàn bộ specs GĐ2 (`matchmaking-passport`, `community-support`, `ai-assist`, `finance-match-fee`)
- `docs/architecture/` (kiến trúc, data model, ai-design, flows)
- `phase-1-progress.md` + `phase-2-progress.md` (test ledger — cơ sở regression)

## Mục tiêu phase (Outcome)

Sản phẩm đủ chất lượng để **demo trước hội đồng bảo vệ**: mọi hành trình chạy trơn tru trên
môi trường demo, có dữ liệu seed thuyết phục, kèm báo cáo đồ án và bài trình bày đầy đủ.

## Success condition (khách quan)

1. **Cổng regression:** 100% AC GĐ1 (198) + 100% AC GĐ2 vẫn `pass` trên cùng một DB migration
   sạch. Không regression.
2. **Cổng E2E xuyên phase:** ≥ 5 kịch bản E2E Playwright phủ hành trình xuyên cả 3 giai đoạn
   (đăng ký → đặt sân → kèo → AI → cộng đồng) xanh.
3. **Cổng F-05 (điều kiện):** nếu seed sẵn sàng, 8 AC trong `f05-demand-heatmap.md` pass; nếu
   không, ghi `skipped — thiếu seed` trong ledger, không chặn phase.
4. **Cổng demo:** demo script chạy trọn ≥ 3 kịch bản (J1 đặt sân, J4 kèo+AI, J5 cộng đồng)
   trên môi trường demo, không lỗi giữa chừng.
5. **Cổng tài liệu:** báo cáo đồ án đủ chương theo dàn ý, bài trình bày sẵn sàng.

## Chuỗi milestone

```
P3-S0 (assessment) ─> P3-M1 (regression+bugfix)
                       ├─> P3-M2 (F-05, conditional)
                       └─> P3-M3 (seed+demo env)
                            ─> P3-M4 (UI polish)
                               ─> P3-M5 (report)
                                  ─> P3-M6 (defense prep)
                                     ─> P3-final
```

| # | Milestone | Nội dung | Phụ thuộc |
|---|---|---|---|
| P3-S0 | Assessment & Triage | Chạy toàn bộ test GĐ1+GĐ2; catalog bug/failure; quyết định F-05 go/no-go; tạo backlog | GĐ2 xong |
| P3-M1 | Regression Fix & Cross-phase E2E | Sửa bug; viết E2E xuyên phase; đảm bảo 100% AC cũ vẫn pass | P3-S0 |
| P3-M2 | F-05 Demand Heatmap | Tạo seed data; implement `packages/ai/analytics/demandAggregate`; frontend heatmap. **Skip nếu seed chưa sẵn sàng** | P3-M1 |
| P3-M3 | Seed Data & Demo Environment | Tạo bộ dữ liệu demo thuyết phục (user/sân/booking/kèo/bài viết); cấu hình môi trường demo ổn định | P3-M1 |
| P3-M4 | UI/UX Polish | Sửa UX issues; responsive; loading states; empty states; error messages tiếng Việt; nhất quán giao diện | P3-M3 |
| P3-M5 | Thesis Report | Viết/hỗ trợ viết báo cáo đồ án theo dàn ý đã duyệt; finalize tài liệu kiến trúc; API docs | P3-M4 |
| P3-M6 | Defense Preparation | Demo script + rehearsal; bài trình bày; Q&A prep; technical deep-dive | P3-M5 |
| P3-final | Cổng cuối phase | 5 success condition pass; PO nghiệm thu | tất cả |

## Hành trình demo đề xuất (5 kịch bản E2E)

| # | Kịch bản | Hành trình | Phase phủ |
|---|---|---|---|
| J1 | Người chơi đặt sân trả tiền | ACC-01→ACC-03→BOK-01→BOK-04→BOK-05→BOK-06→FIN-04→BOK-07→BOK-08 | GĐ1 |
| J2 | Nhà cung cấp vận hành sân | VEN-01→VEN-02→VEN-03→VEN-04→VEN-05→VEN-06→VEN-08→FIN-09→FIN-10 | GĐ1 |
| J3 | Hủy booking + hoàn tiền | BOK-09→FIN-07 (3 mốc) | GĐ1 |
| J4 | Kèo + ghép kèo live + AI gợi ý | MMP-02→MMP-04→MMP-05→FIN-05→MMP-06→F-03→AI-01 | GĐ1+GĐ2 |
| J5 | Cộng đồng + chatbot AI | COM-02→COM-05→COM-06→COM-07→AI-02 | GĐ2 |

## Dàn ý báo cáo đồ án (đề xuất — 【PO-REVIEW】)

| Chương | Nội dung | Nguồn chính |
|---|---|---|
| 1. Giới thiệu | Bối cảnh, mục tiêu, phạm vi, ý nghĩa | SCOPE_BASELINE, phasing.md |
| 2. Cơ sở lý thuyết | Microservices, event-driven, Glicko-2, RAG, WebSocket | ADRs, ai-design.md |
| 3. Phân tích yêu cầu | Actor, UC, ràng buộc, phân kỳ | SCOPE_BASELINE, phasing.md, discovery |
| 4. Thiết kế hệ thống | Kiến trúc, data model, luồng event, security | system-architecture.md, data-model.md, flows.md |
| 5. Thiết kế chi tiết | Spec từng module, AC, business rules | 8 spec files |
| 6. Hiện thực | Tech stack, cấu trúc code, pattern (outbox, saga, hold), AI | ADR 0002, code |
| 7. Kiểm thử | Chiến lược test, coverage, E2E, bảo toàn giá trị | progress logs, test files |
| 8. Triển khai | Railway + Vercel, CI/CD, môi trường | deploy config |
| 9. Kết quả & đánh giá | Demo, so sánh mục tiêu, hạn chế | demo results |
| 10. Kết luận & hướng phát triển | Tổng kết, bài học, roadmap tương lai | — |

## Ràng buộc

- **Không thêm UC nền mới** — phasing.md §5 chốt 0 UC nền ở GĐ3.
- **Không refactor lớn** — chỉ sửa bug và polish, giữ kiến trúc hiện tại.
- 9 ràng buộc bất biến SCOPE_BASELINE §4 vẫn có hiệu lực.
- F-05 tuân thủ bất biến #8 (AI chỉ hiển thị, không tự hành động).
- Seed data không chứa dữ liệu thật của người thật.

## Pause rules

- F-05 cần seed data chưa sẵn sàng tại thời điểm P3-M2 → skip F-05, không chặn phase.
- Regression fix lộ lỗi thiết kế (không phải bug implementation) → dừng, báo PO.
- Báo cáo đồ án cần thông tin chưa có (yêu cầu của hội đồng, format trường) → dừng, hỏi PO.
- Demo environment cần tài nguyên vượt free-tier → dừng, báo PO.

## Done when

5 success condition pass; demo script chạy trơn tru; báo cáo đồ án đủ chương; bài trình bày
sẵn sàng; PO nghiệm thu cuối phase.
