---
name: release
description: Đưa thay đổi từ working tree lên production an toàn — build toàn repo, commit đúng chuẩn, push TuanAnh, merge main, xác minh deploy Railway + Vercel. Dùng khi PO nói "commit", "push", "merge", "deploy", "lên production", "release".
---

# Release — từ diff đến production

Quy trình chuẩn hóa việc PO vẫn yêu cầu lặp lại mỗi lần xong một mốc. Mọi hard
rule trong `.Codex/AGENTS.md` áp dụng; skill này chỉ sắp chúng thành thứ tự.

## Đầu vào

- Diff đang có trong working tree (skill không tự tạo thay đổi mới).
- Phạm vi PO yêu cầu: chỉ commit, hay commit + push, hay tới tận merge/deploy.
  Không tự vượt phạm vi — "commit đi" không có nghĩa là được merge vào main.

## Các bước

1. **Soát diff**: `git status` + `git diff --stat`. Nhóm thay đổi theo chủ đề;
   loại file rác (`~$*.docx`, `output/`, file scratch). Nếu working tree trộn
   nhiều chủ đề không liên quan, hỏi PO tách hay gộp trước khi commit.
2. **Kiểm chứng bắt buộc**:
   - `npm run build` ở **root** (tsc -b toàn repo). Hard rule: lỗi type ở
     `apps/web` làm fail cả deploy backend Railway — không được bỏ qua dù chỉ
     sửa backend.
   - `npm run test -w <workspace>` cho từng workspace bị chạm.
   - Build/test fail → dừng, sửa hoặc báo PO; không commit code đỏ.
3. **Commit**: dạng `type(scope): mô tả` (fix/feat/chore/docs...) như lịch sử
   hiện có. Nhiều chủ đề → nhiều commit tách bạch.
4. **Push**: lên branch `TuanAnh`. Không bao giờ force-push khi chưa hỏi.
5. **Merge** (chỉ khi PO yêu cầu): PR từ `TuanAnh` về `main` bằng `gh pr create`,
   merge bằng `gh pr merge` **không kèm `--delete-branch`** — branch `TuanAnh`
   phải sống mãi.
6. **Xác minh deploy** (chỉ khi PO yêu cầu deploy):
   - Railway auto-build theo path diff. Service cần redeploy nhưng commit không
     chạm thư mục của nó → tạo commit chạm thư mục service đó để ép rebuild.
   - Kiểm tra build log Railway (MCP railway `get-logs` / `list-deployments`)
     và deployment Vercel cho FE.
   - Mở web production trong browser pane, smoke nhanh trang vừa đổi.

## Đầu ra

Báo cáo tách 3 phần: (1) kết quả — commit hash, nhánh, PR link nếu có;
(2) bằng chứng — output build/test, trạng thái deploy; (3) rủi ro còn lại —
những gì chưa kiểm chứng được. Thiếu bước nào nói rõ là thiếu.
