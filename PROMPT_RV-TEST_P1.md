# Prompt Review & Nghiệm thu Giai đoạn 1

Thực hiện một vòng review và nghiệm thu độc lập toàn bộ phạm vi Giai đoạn 1 (G1–G7) trên nhánh TuanAnh.

Đây là lượt READ-ONLY đối với source code và tài liệu:
- Không sửa code, tài liệu, migration hoặc cấu hình.
- Không commit, push, merge hay chuyển nhánh.
- Không xóa/reset/purge schema, DB hoặc queue đang dùng; không thay đổi dữ liệu hiện hành.
- **Miễn trừ cho kiểm thử**: được phép tạo schema/DB review *riêng biệt* (đặt tên rõ, ví dụ `review_phase1_*`) và ghi dữ liệu test/seed vào đó để chạy migration và E2E. Không đụng tới schema/DB/queue production hoặc đang dùng. Không xóa schema review đã tạo khi chưa được tôi duyệt.
- Chỉ được tạo log, screenshot và trace kiểm thử dưới `output/review-phase-1/`.
- Nếu phát hiện lỗi, chỉ báo cáo; chờ tôi duyệt trước khi sửa.
- Ưu tiên tự làm inline; chỉ spawn subagent khi thật cần cho một nhánh việc độc lập.

**Quy tắc xử lý khi bị chặn (áp dụng xuyên suốt):**
- Nếu một công cụ, đường dẫn, tệp hoặc con số nêu dưới đây không tồn tại đúng như mô tả: ghi nhận thực tế, bỏ qua, **không bịa** và không tự sáng tạo thay thế làm đổi ngữ nghĩa.
- Nếu một hạng mục không chạy được do thiếu hạ tầng/secret/env (SePay key, RabbitMQ, Redis, `.env`...): ghi vào phần Rủi ro là "chưa kiểm chứng — lý do", rồi tiếp tục hạng mục khác. Không bịa kết quả. Không tự nhập secret/credential thật của tôi.
- **Báo cáo theo checkpoint**: báo tiến độ ngay khi xong mỗi mục lớn (2, 3, 4), không dồn tất cả đến cuối.

## 0. Kiểm tra Harness và trạng thái repository

1. Chạy read-only (nếu công cụ tồn tại): `scripts/bin/harness.exe status`, `scripts/bin/harness.exe doctor`. Nếu không có, ghi nhận và bỏ qua.
2. Đọc AGENTS.md và docs/WORKFLOW.md.
3. Kiểm tra: `git branch --show-current`, `git status --short`, `git log --oneline -10`.
4. Không chạy onboard-repository hoặc áp dụng proposal nếu chưa được yêu cầu.

## 1. Nguồn sự thật bắt buộc

Đọc đầy đủ và đối chiếu chéo (tệp nào không tồn tại thì ghi nhận, bỏ qua):
- docs/product/phase-1-goal.md
- docs/product/phase-1-handoff.md
- docs/product/phase-1-progress.md
- docs/product/decision-log.md
- docs/architecture/system-architecture.md
- docs/architecture/data-model.md
- docs/WORKFLOW.md
- Các spec GĐ1 trong docs/product/specs/ (nếu có)
- Các ADR liên quan trong docs/decisions/ (nếu có)

Không coi frontmatter, coverage matrix, số lượng AC hoặc trạng thái `pass` trong phase-1-progress.md là bằng chứng implementation. Mỗi kết luận phải dựa trên code, test chạy thật hoặc quan sát UI/API. (Số AC — tài liệu ghi ~198 — hãy lấy con số thực từ tài liệu, không giả định.)

## 2. Review code toàn phạm vi GĐ1

Review code liên quan trong: apps/, services/, packages/, infra/ + migration, e2e/.

Kiểm tra:
1. Đủ/thiếu/thừa so với Phase 1 goal và bộ AC thực tế.
2. Không đưa tính năng Phase 2+ ra ngoài phạm vi.
3. Không vi phạm service ownership hoặc truy cập trực tiếp schema của service khác.
4. API Gateway, event/outbox/consumer và idempotency đúng ranh giới.
5. Authentication, authorization và multi-role player/provider/admin.
6. Booking hold, chống double-booking và concurrency boundary.
7. Finance: ledger append-only; bảo toàn giá trị; personal/business wallet; payment và direct SePay; cancellation/refund; revenue pending/available; withdrawal/payout; reconciliation; dispute; idempotency và race conditions.
8. Migration an toàn với cả DB sạch lẫn DB có dữ liệu cũ.
9. Frontend gọi API thật, xử lý loading/error/empty state và kiểm soát quyền đúng.
10. Tìm code chết, mock còn sót, TODO, hard-code, secret, fallback nguy hiểm và hành vi chỉ "trông như chạy" nhưng chưa nối end-to-end.

Mỗi finding phải ghi: Severity P0/P1/P2/P3; AC/quyết định bị ảnh hưởng; file và dòng; bước tái hiện; expected vs actual; bằng chứng; hướng khắc phục đề xuất (không thực hiện).

## 3. Chạy kiểm thử

Chạy và lưu log đầy đủ:
1. Unit/integration test toàn workspace.
2. Typecheck.
3. Production build.
4. Prisma validate.
5. Migration deploy trên schema review sạch, cô lập (theo miễn trừ ở đầu prompt).
6. Playwright E2E của GĐ1 (tìm tệp spec thực tế trong e2e/; tài liệu ghi 8 E2E).

Báo cáo chính xác: command; exit code; số test pass/fail/skip; test flaky/cần retry; lần chạy đầu và retry tách riêng, không che lần fail đầu; đường dẫn log/trace.

## 4. Kiểm thử UI/UX qua browser thật

Khởi động frontend + backend theo package scripts/hướng dẫn repository (dùng skill `run` nếu có; nếu không, dùng lệnh chính thức trong package.json và docs — không tự sáng tạo runtime khác làm đổi semantics).

Dùng browser thật, kiểm ít nhất:
1. Đăng ký → xác minh → đăng nhập → cập nhật hồ sơ.
2. NCC đăng ký → Admin duyệt → cấu hình sân/lịch/giá.
3. Tìm sân → chọn slot → hold → booking → thanh toán → confirmed.
4. Người chơi tự hủy → hoàn tiền theo policy.
5. Phía sân hủy → hoàn 100%.
6. Doanh thu pending → available → tạo yêu cầu rút.
7. Người chơi gửi tranh chấp → Admin full/partial/reject.
8. Admin đối soát giao dịch chưa khớp.

Edge cases tối thiểu: truy cập sai role; slot vừa hết hạn hoặc bị giữ đồng thời; double submit/payment/webhook; hủy sát boundary hoàn tiền; tranh chấp quá 24 giờ; rút vượt available balance; refund/dispute lặp lại; API lỗi hoặc dữ liệu rỗng; reload/back/forward không mất hoặc nhân đôi trạng thái.

Chụp screenshot trước/sau các trạng thái quan trọng, lưu dưới `output/review-phase-1/screenshots/`. Ghi rõ thao tác nào dùng UI thật, thao tác nào gọi API/seed fixture. Không gọi trực tiếp domain handler rồi mô tả là E2E thật.

## 5. Định dạng báo cáo bắt buộc

### A. Kết quả
Bảng theo từng tiêu chí/milestone:

| Phạm vi | Đạt/Chưa đạt | AC đã kiểm | Finding |
|---|---|---:|---|

Kết luận cuối: Đạt để PO nghiệm thu; hoặc Chưa đạt + danh sách finding chặn nghiệm thu.

### B. Bằng chứng
Command và exit code; thống kê test; file test; trace Playwright; screenshot UI; file:dòng cho mỗi finding; commit/branch đã review.

### C. Rủi ro còn lại / việc chưa làm
Tách rõ: lỗi đã chứng minh; rủi ro chưa đủ điều kiện kiểm chứng; caveat migration/deployment; test còn thiếu hoặc flaky; đề xuất sửa (chưa thực hiện).

Hoàn thành review rồi dừng lại chờ tôi duyệt. Không tự sửa finding.
