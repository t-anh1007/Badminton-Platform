# Thiết kế skill `$usecase`

## Mục tiêu

Chuyển `use-case-writer-main` thành skill `$usecase` cho IT Business Analyst, ưu tiên tiếng Việt, kế thừa tài liệu upstream và tạo đặc tả Use Case gọn theo mẫu hai cột Actor–Hệ thống.

## Đầu ra bắt buộc

Mỗi Use Case gồm đúng chín trường: Use case ID, Use case name, Tiền điều kiện, Hậu điều kiện, Actor chính, Actor phụ, Basic flow, Alternative flow và Exception.

Basic flow dùng bảng hai cột với tên Actor chính cụ thể ở cột trái và `Hệ thống` ở cột phải. Alternative flow và Exception dùng cùng cách trình bày, đồng thời ghi rõ điểm rẽ hoặc điểm phát sinh, điều kiện và kết quả cuối.

## Nguồn dữ liệu và tương tác

Ưu tiên dữ liệu theo thứ tự: yêu cầu hiện tại hoặc Use Case đang sửa, URD/PRD, rồi brainstorm. Skill đọc toàn bộ nguồn liên quan, lập danh sách phần đã có và chỉ hỏi phần còn thiếu hoặc mâu thuẫn. Nếu nguồn đủ, tạo một bản nháp hoàn chỉnh và xin duyệt một lần; không bắt năm vòng xác nhận.

## Định dạng

Mặc định tạo Markdown tại `docs/{feature}/use-cases/{UC-ID}-{slug}.md`. Khi prompt yêu cầu Word hoặc DOCX, tạo thêm file cùng tên với đuôi `.docx`, dùng quy trình của skill `documents`, render ra PNG và kiểm tra trực quan trước khi bàn giao.

## Giới hạn

Không tự suy đoán tên bảng, column, endpoint, framework, giao thức bảo mật hoặc số liệu phi chức năng. Không dùng ví dụ EdTech làm mặc định. Các giá trị chưa có bằng chứng phải được hỏi hoặc đánh dấu TBD.

## Tiêu chí hoàn thành

- Skill được nhận diện bằng `$usecase`.
- Gói nguồn và bản cài có cùng nội dung vận hành.
- Template Markdown hợp lệ, không trộn bảng hai và bốn cột.
- Checklist phù hợp chín trường mới.
- Không còn quy tắc English-only, 13/16 fields hay quy trình năm cổng xác nhận.
- Nhánh DOCX có render-and-inspect gate.
