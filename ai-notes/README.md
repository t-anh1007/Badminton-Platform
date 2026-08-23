# ai-notes — vùng nháp cho AI agent

Thư mục này là **nơi duy nhất** để agent (Claude Code, Codex…) ghi **file tạm**:
kết quả điều tra trung gian, script truy vấn dùng một lần, log phân tích, ghi chú
nháp, báo cáo tạm khi làm task. Mục đích: không rải file rác ra `apps/`,
`services/`, `packages/` hay gốc repo.

## Quy tắc

- Mọi file trong đây (trừ `README.md`) đều bị `.gitignore` — **không commit**.
- Không đặt mã ứng dụng, test thật, hay tài liệu sản phẩm ở đây. Test thật nằm
  cạnh mã nguồn (`*.test.ts(x)`); tài liệu sản phẩm nằm trong `docs/`.
- File ở đây có thể bị xóa bất cứ lúc nào — đừng để thứ gì cần giữ lâu dài.
- Nếu một ghi chú/nháp trở nên đáng giữ, chuyển nó vào `docs/` và commit tử tế.
