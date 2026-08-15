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

## Khi nào dùng Global Skill

**Nguyên tắc**: Chỉ invoke skill khi task phức tạp, nhiều bước, hoặc cần cấu trúc
đặc thù — KHÔNG dùng cho task đơn giản có thể trả lời trực tiếp (tốn context).

| Tình huống | Skill cần dùng |
|---|---|
| Yêu cầu mục tiêu mơ hồ, thiếu tiêu chí | `/goal-griller` |
| Debug lỗi khó tái hiện hoặc nhiều nguyên nhân | `/systematic-debugging` |
| Review diff/PR phức tạp trước commit | `/requesting-code-review` |
| Nhận feedback review → áp dụng | `/receiving-code-review` |
| Triage bug/issue nhiều khả năng | `/rtk-triage` hoặc `/issue-triage` |
| Viết plan cho milestone mới | `/writing-plans` |
| Thực thi plan đã có từng bước | `/executing-plans` |
| UI/UX frontend phức tạp (layout, design system) | `/web-design-guidelines` |
| Brainstorm giải pháp kỹ thuật | `/brainstorming` |

**Không dùng skill khi**: sửa bug rõ ràng, thêm field nhỏ, trả lời câu hỏi đơn
giản, refactor cục bộ — làm trực tiếp sẽ nhanh hơn và rẻ hơn.
