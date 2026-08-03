# Checklist chất lượng `$usecase`

Chạy trước khi ghi hoặc bàn giao. Trạng thái: `✅ Pass`, `⚠️ TBD`, `❌ Fail`.

## A. Phạm vi và nhận diện

- **C1** — Use case ID đúng `UC-<MODULE>-<NN>` và không trùng trong feature.
- **C2** — Use case name là động từ + đối tượng.
- **C3** — Một Actor chính, một mục tiêu nghiệp vụ, ranh giới hệ thống rõ.
- **C4** — Use Case vượt qua coffee-break test; không quá lớn hoặc quá nhỏ.

## B. Chín trường bắt buộc

- **C5** — Có đủ: ID, name, Tiền điều kiện, Hậu điều kiện, Actor chính, Actor phụ, Basic flow, Alternative flow, Exception.
- **C6** — Actor chính là vai trò cụ thể; Actor phụ ghi rõ hoặc `Không có`.
- **C7** — Tiền điều kiện đều xảy ra trước flow và có thể kiểm chứng.
- **C8** — Hậu điều kiện mô tả trạng thái thành công có thể kiểm chứng.

## C. Flow

- **C9** — Basic flow dùng đúng bảng hai cột `{Actor chính} | Hệ thống`.
- **C10** — Bước được đánh số liên tục; mỗi ô một hành động chính và đúng chủ thể.
- **C11** — Basic flow đi từ trigger đến hậu điều kiện, không chứa if/else hoặc lỗi.
- **C12** — Mỗi Alternative flow có mã, bước rẽ, điều kiện, bảng hai cột và điểm kết thúc/quay lại.
- **C13** — Mỗi Exception có mã, bước phát sinh, điều kiện, phản hồi và trạng thái cuối.
- **C14** — Alternative flow vẫn thành công; Exception không đạt hoặc chỉ đạt một phần mục tiêu.

## D. Nguồn và cách viết

- **C15** — Đã đọc nguồn liên quan và không hỏi lại thông tin đã có.
- **C16** — Không tự phát minh tên bảng/column, endpoint, framework, giao thức, giới hạn hoặc thông báo chính xác.
- **C17** — Thuật ngữ, tên Actor và ngôn ngữ nhất quán.
- **C18** — TBD nằm đúng trường và diễn đạt thành câu hỏi cụ thể.

## E. File đầu ra

- **C19** — Markdown nằm tại `docs/{feature}/use-cases/{UC-ID}-{slug}.md` và render Markdown hợp lệ.
- **C20** — Nếu yêu cầu DOCX: file cùng basename, bảng không tràn/cắt chữ và mọi trang đã được render–inspect; nếu không có LibreOffice thì trạng thái QA được báo rõ.

## Mẫu báo cáo

```markdown
| Mục | Trạng thái | Ghi chú |
|---|---|---|
| C1 | ✅ | `UC-BOOKING-01` chưa trùng |
| C13 | ⚠️ | EX-02 còn thiếu trạng thái cuối |
```

Không báo `pass` nếu còn bất kỳ `❌`. Có thể báo `partial` khi chỉ còn `⚠️` và người dùng đồng ý giữ TBD.
