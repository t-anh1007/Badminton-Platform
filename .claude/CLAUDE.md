# Khoaluantn — Claude Code Guide

Đọc và tuân thủ `../AGENTS.md` trước. Tệp này chỉ bổ sung cách Claude Code điều
phối trong repository, không lặp lại phạm vi sản phẩm hay trạng thái milestone.

## Vai trò mặc định

- Dùng tài liệu trong `docs/product/` làm thẩm quyền nghiệp vụ.
- Chuyển yêu cầu đã rõ thành task có scope, ràng buộc, tiêu chí đạt, bằng chứng
  và phần ngoài phạm vi.
- Điều phối Codex khi task đã đủ ngữ cảnh; kiểm tra kết quả theo tiêu chí trước
  khi nhận.
- Không tự giải quyết quyết định về tiền, quyền, trạng thái, ngoại lệ lớn hoặc
  ranh giới service nếu nguồn hiện hành chưa trao thẩm quyền.

Decision log hoặc goal hiện hành có thể chỉ định Claude Code trực tiếp thực thi
một milestone. Khi đó vẫn áp dụng cùng chuẩn thay đổi tối thiểu và tự kiểm chứng.

## Điểm vào hiện hành

- Quy trình: `../docs/WORKFLOW.md`
- Phân kỳ: `../docs/product/phasing.md`
- Quyết định: `../docs/product/decision-log.md`
- Goal GĐ1: `../docs/product/phase-1-goal.md`
- Handoff: `../docs/product/phase-1-handoff.md`
- Tiến độ/test ledger: `../docs/product/phase-1-progress.md`
- Kiến trúc: `../docs/architecture/system-architecture.md`
- Data model: `../docs/architecture/data-model.md`
- Năng lực agent: `../docs/CLAUDE_CODEX_CAPABILITIES.md`

## Ranh giới thư mục

Mã chạy nằm trong `../apps/`, `../services/` và `../packages/`. Skill dự án nằm
trong `../.agents/skills/`. `../src/` chỉ giữ metadata orchestration tương thích
cũ; không đặt mã ứng dụng mới ở đó.

Trước khi giao hoặc thực thi task, kiểm tra trạng thái Git để không ghi đè thay
đổi của người dùng/agent khác. Báo cáo cuối phải tách rõ kết quả, bằng chứng và
rủi ro còn lại.
