# 0004 Chiến lược DB và ranh giới repository cho Giai đoạn 1

Date: 2026-08-05

## Status

Accepted

## Context

`system-architecture.md §10` để hai quyết định ở dạng đề xuất mặc định, chưa được PO xác nhận
tường minh: tách DB hẳn hay dùng chung một Postgres với schema riêng cho từng service, và
dùng monorepo hay nhiều repo. Hai quyết định này chặn gói **Gboot** (bootstrap monorepo và
Prisma) trong [phase-1-handoff.md](../product/phase-1-handoff.md) — không chốt thì không dựng
được khung để bắt đầu code.

Dự án là khóa luận một người phát triển, thời gian 4–6 tháng, không cần hạ tầng vận hành mức
sản xuất nhiều đội.

## Decision

**DB: một PostgreSQL, schema-per-service.** Mỗi service sở hữu một schema riêng, có migration,
tài khoản truy cập và quyền sở hữu schema riêng. Không tạo foreign key, không truy vấn hay đọc
bảng xuyên schema. Giao tiếp giữa các service chỉ qua API (đồng bộ) hoặc event (bất đồng bộ),
đúng nguyên tắc đã có ở `system-architecture.md §1` và `§6`.

**Repository: một monorepo dùng workspaces.** Mỗi service vẫn là một ứng dụng build, test và
deploy độc lập. Chỉ chia sẻ contract/DTO/event schema (`packages/shared`) và thư viện hạ tầng
chung (`packages/eventbus`, `packages/ai`). Không chia sẻ repository, entity, hay business
logic giữa các service.

## Alternatives Considered

1. **Nhiều PostgreSQL, mỗi service một instance.** Đúng lý thuyết database-per-service tuyệt
   đối. Bị loại vì chi phí triển khai, vận hành và demo cao hơn đáng kể so với một người phát
   triển trong 4–6 tháng có thể chịu, trong khi ranh giới logic (schema riêng, không FK chéo)
   đã đủ để giữ tính độc lập của service.
2. **Nhiều repository, mỗi service một repo.** Tách biệt tuyệt đối, gần với cách vận hành
   nhiều đội thật. Bị loại vì một người phát triển phải đồng bộ version, CI, và thay đổi
   contract xuyên nhiều repo — chi phí đó không tạo ra giá trị tương xứng ở quy mô một người.

## Consequences

Positive:

- Một Postgres, một `docker-compose`, một lệnh khởi động local — chạy và demo dễ hơn nhiều
  repo hay nhiều DB.
- Ranh giới schema và service được giữ đủ chặt: cấm FK chéo, cấm truy vấn chéo, cấm import
  entity hay business logic xuyên service. Nếu sau này cần tách hẳn database hoặc repository,
  việc tách chỉ là hạ tầng — không phải viết lại nghiệp vụ.
- Thay đổi xuyên service (ví dụ sửa một event contract) chỉ cần một commit, không cần đồng bộ
  nhiều repo.

Tradeoffs:

- Một Postgres là điểm chịu tải và điểm lỗi chung về hạ tầng, dù logic vẫn tách theo schema.
- Kỷ luật "không import xuyên service" phải giữ bằng review, không có rào cản kỹ thuật cứng
  như khi thực sự tách repo.

## Follow-Up

- `system-architecture.md §10` mục 1 và 2 đã cập nhật trạng thái trỏ về quyết định này.
- Gói **Gboot** ở [phase-1-handoff.md](../product/phase-1-handoff.md) được mở khoá.
