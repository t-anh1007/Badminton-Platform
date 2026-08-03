# Brainstorm skill

Skill này phỏng vấn từng phần để biến một ý tưởng thô thành tài liệu brainstorm có cấu trúc trước khi viết URD hoặc PRD.

## Cách gọi

```text
$brainstorm <mô tả ý tưởng>
$brainstorm @<đường-dẫn-file>
```

Muốn rút gọn quy trình, thêm cụm từ `brainstorm nhanh gọn` vào yêu cầu.

## Thành phần đã cài

- Skill chính: `.agents/skills/brainstorm/SKILL.md`
- Ví dụ tham khảo: `.agents/skills/brainstorm/references/example-brainstorm.md`
- Nhận diện từ khóa: `.agents/rules/keyword-detection.md`
- Mẫu đầu ra: `_templates/brainstorm.md`
- Nhật ký hoạt động dùng chung: `.agents/scripts/activity-log.mjs`

Skill không cần cài thêm thư viện. Khởi động lại Codex sau khi cài để danh sách skill được nạp lại.
