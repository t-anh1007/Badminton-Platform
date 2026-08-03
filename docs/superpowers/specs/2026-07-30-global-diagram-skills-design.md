# Bộ skill diagram global

## Mục tiêu

Cho phép dùng 11 skill diagram trong mọi workspace Codex mà không phụ thuộc vào thư mục `.agents` của dự án `D:\Khoaluantn`.

## Cấu trúc

- Mỗi skill được đặt trực tiếp trong `C:\Users\firet\.codex\skills\{skill-name}`.
- Dependency dùng chung được đặt tại `C:\Users\firet\.codex\skills\_diagram-common`:
  - `rules`: quy tắc BA, approval, naming, changelog và chọn diagram.
  - `scripts`: render/verify Mermaid, PlantUML, D2 và activity log.
  - `templates`: các template diagram và use case index.
  - `agents`: diagram reviewer.
- Engine BPMN và các package đi kèm giữ trong skill `bpmn` để nó tự chứa dependency.

## Tính độc lập

Reference tài liệu chuyển sang đường dẫn tương đối đến `_diagram-common`. Các lệnh thực thi dùng đường dẫn global của script hoặc BPMN engine. Bản trong `D:\Khoaluantn\.agents` không bị sửa.

## Kiểm tra

Xác minh đủ 11 thư mục skill, toàn bộ reference tồn tại, không còn marker `.agents` hoặc `_templates` trong file vận hành global, và mỗi `SKILL.md` vượt qua validator.
