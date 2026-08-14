---
type: functional-spec
module: community-support
phase: 2
status: draft-for-po-review
author: Claude Code
updated: 2026-08-07
source: docs/SCOPE_BASELINE.md §2.6, docs/product/phasing.md §4
---

# Functional Spec — `community-support` (COM)

8 UC nền, Giai đoạn 2. Service: `community-service` (schema `community`, schema-per-service D17).

> **Trạng thái: draft chờ PO duyệt.** Quyết định mở đánh dấu `【PO-REVIEW】`.
> Ràng buộc bất biến #9: **cộng đồng CHỈ có nội dung công khai** — không nhóm kín, không tin nhắn
> riêng. Ticket hỗ trợ là kênh 1-1 user↔admin (bất đồng bộ), không phải nội dung cộng đồng.

## 1. Actor

| Actor | Vai | Phạm vi |
|---|---|---|
| Khách | — | COM-01 (xem bảng tin công khai), không tương tác |
| Người chơi | `player` | COM-01..06, COM-08 (phía user) |
| Admin | `admin` | COM-07 (kiểm duyệt), COM-08 (xử lý ticket) |

## 2. Mô hình miền

- **POST (bài viết)**: `authorUserId`, nội dung và tối đa bốn metadata ảnh đã xác minh ownership object storage, `status` (`published`/`hidden`/`removed`),
  timestamps. Chỉ công khai.
- **COMMENT (bình luận)**: `authorUserId`, `postId`, nội dung text, `status`.
- **REPORT (báo cáo vi phạm)**: `reporterUserId`, target (postId/commentId), lý do, `status`
  (`open`/`actioned`/`dismissed`).
- **TICKET (yêu cầu hỗ trợ)**: `requesterUserId`, chủ đề, nội dung, `status` (`open`/`in_progress`/
  `resolved`/`closed`), luồng phản hồi bất đồng bộ (danh sách message user↔admin). KHÔNG realtime.

## 3. Trạng thái

**`POST.status` / `COMMENT.status`**
```
[*] ─(tạo)─> published ─(tác giả sửa COM-03)─> published
published ─(tác giả xóa COM-04 | admin gỡ COM-07)─> removed
published ─(admin ẩn tạm COM-07)─> hidden ─(admin khôi phục)─> published
```
**`REPORT.status`**: `open → actioned | dismissed`
**`TICKET.status`**: `open → in_progress → resolved → closed`

## 4. Business rules

| Mã | Quy tắc |
|---|---|
| BR-COM-01 | Chỉ nội dung công khai (bất biến #9). Không nhóm kín/DM/nội dung riêng tư. |
| BR-COM-02 | Chỉ `player` đã xác minh mới tạo/sửa/xóa bài, bình luận, báo cáo, gửi ticket. Khách chỉ xem. |
| BR-COM-03 | Tác giả chỉ sửa/xóa bài & bình luận của CHÍNH mình (kiểm tầng API). Admin gỡ được bất kỳ nội dung nào qua COM-07 (một quyền vận hành, bất biến #7). |
| BR-COM-04 | Nội dung bị `removed` không hiển thị công khai nhưng giữ bản ghi (audit kiểm duyệt), không hard-delete (đối chiếu chính sách xử lý báo cáo). |
| BR-COM-05 | Báo cáo (COM-06) không tự gỡ nội dung; chỉ tạo REPORT `open` để Admin xử (COM-07). Chống lạm dụng: một user báo cáo một target một lần (chống spam report). |
| BR-COM-06 | Ticket (COM-08) là kênh 1-1 bất đồng bộ; chỉ requester và admin thấy; KHÔNG phải nội dung cộng đồng, KHÔNG công khai (ngoại lệ hợp lệ của #9 vì là hỗ trợ cá nhân, không phải "cộng đồng"). |
| BR-COM-07 | Không có khiếu nại quyết định kiểm duyệt (đã loại SCOPE_BASELINE §3) — quyết định admin là cuối. |
| BR-COM-08 | Kiểm duyệt AI KHÔNG thuộc GĐ2 (đã loại — giữ 2 AI khác). COM-07 là kiểm duyệt thủ công của admin. |

## 5. Sự kiện

| Event | Producer | Consumer |
|---|---|---|
| `ContentReported` | community | (moderation nội bộ — hàng chờ admin) |
| `AccountLocked` | account | community (chặn user bị khóa tạo nội dung) |

## 6. Chi tiết chức năng

### COM-01 — Xem bảng tin cộng đồng công khai
- **Actor**: khách/người chơi. **Quyền**: công khai.
- **Workflow**: xem danh sách bài `published` mới nhất (phân trang), mở chi tiết bài + bình luận.
- **Ngoài phạm vi**: thích/lưu/chia sẻ (đã loại), bảng tin cá nhân hóa.

**AC**
- `AC-COM-01-1` — Given có 5 bài `published` và 1 bài `removed`, When xem bảng tin, Then chỉ 5 bài published hiện ra.
- `AC-COM-01-2` — Given khách chưa đăng nhập, When mở bảng tin, Then xem được đầy đủ bài công khai.
- `AC-COM-01-3` — Given không có bài nào, When xem, Then trạng thái rỗng (không lỗi).

### COM-02 — Tạo bài viết
- **Actor**: người chơi. **Workflow**: nhập nội dung → đăng → bài `published` ngay (kiểm duyệt hậu
  kiểm qua báo cáo, không tiền kiểm). **BR**: BR-COM-01, 02.

**AC**
- `AC-COM-02-1` — Given player đã xác minh, When đăng bài hợp lệ, Then bài `published` và hiện trên bảng tin.
- `AC-COM-02-2` — Given nội dung rỗng/quá dài (【PO-REVIEW: giới hạn ký tự】), When đăng, Then bị từ chối với thông báo rõ.
- `AC-COM-02-3` — Given user bị khóa (`AccountLocked`), When cố đăng, Then bị chặn.
- `AC-COM-02-4` — Given player chọn từ 0 đến 4 ảnh JPEG/PNG/WebP đã được cấp quyền upload, When đăng bài, Then metadata ảnh được lưu theo đúng thứ tự; ảnh thứ năm hoặc object key ngoài namespace bị từ chối.

### COM-03 — Chỉnh sửa bài viết
- **Actor**: tác giả. **Workflow**: sửa nội dung bài của mình → cập nhật, đánh dấu "đã sửa".
  **BR**: BR-COM-03.

**AC**
- `AC-COM-03-1` — Given bài của mình, When sửa, Then nội dung cập nhật + hiển thị dấu "đã chỉnh sửa".
- `AC-COM-03-2` — Given bài của người khác, When cố sửa, Then 403.

### COM-04 — Xóa bài viết
- **Actor**: tác giả. **Workflow**: xóa bài của mình → `removed` (không hard-delete, BR-COM-04).

**AC**
- `AC-COM-04-1` — Given bài của mình, When xóa, Then bài `removed`, biến khỏi bảng tin công khai.
- `AC-COM-04-2` — Given bài của người khác, When cố xóa, Then 403.

### COM-05 — Bình luận bài viết
- **Actor**: người chơi. **Workflow**: bình luận text vào bài `published`.

**AC**
- `AC-COM-05-1` — Given bài published, When player bình luận, Then bình luận hiện dưới bài.
- `AC-COM-05-2` — Given bài `removed`, When cố bình luận, Then bị từ chối.
- `AC-COM-05-3` — Given bình luận của mình, When xóa, Then `removed`; của người khác → 403.

### COM-06 — Báo cáo nội dung vi phạm
- **Actor**: người chơi. **Workflow**: báo cáo bài/bình luận kèm lý do → tạo REPORT `open` cho
  admin; phát `ContentReported`. Không tự gỡ nội dung. **BR**: BR-COM-05.

**AC**
- `AC-COM-06-1` — Given một bài published, When player báo cáo, Then tạo REPORT `open` + phát `ContentReported`, bài VẪN hiển thị.
- `AC-COM-06-2` — Given player đã báo cáo target đó, When báo cáo lại, Then bị từ chối (chống spam, BR-COM-05).

### COM-07 — Kiểm duyệt nội dung cộng đồng
- **Actor**: admin. **Workflow**: xem hàng chờ REPORT `open` → hành động: ẩn tạm (`hidden`), gỡ
  (`removed`), hoặc bác báo cáo (`dismissed`) → cập nhật REPORT `actioned`/`dismissed`; ghi audit.
  **BR**: BR-COM-03, 04, 07.

**AC**
- `AC-COM-07-1` — Given REPORT `open` trên một bài, When admin gỡ, Then bài `removed` + REPORT `actioned` + ghi audit.
- `AC-COM-07-2` — Given admin bác báo cáo, When xử lý, Then bài giữ nguyên + REPORT `dismissed`.
- `AC-COM-07-3` — Given non-admin, When gọi API kiểm duyệt, Then 403 (bất biến #7).
- `AC-COM-07-4` — Given nội dung `removed`, When kiểm tra dữ liệu, Then bản ghi còn (audit), chỉ ẩn công khai (BR-COM-04).

### COM-08 — Gửi và xử lý yêu cầu hỗ trợ (ticket bất đồng bộ)
- **Actor**: người chơi (gửi), admin (xử lý). **Workflow**: user tạo ticket (chủ đề + nội dung) →
  `open`; admin xem, phản hồi → `in_progress`; trao đổi bất đồng bộ; admin đóng → `resolved`/
  `closed`. **BR**: BR-COM-06. **Ngoài phạm vi**: chat realtime CSKH (đã loại; dùng ticket).

**AC**
- `AC-COM-08-1` — Given player gửi ticket, When tạo, Then ticket `open`, chỉ player đó và admin thấy.
- `AC-COM-08-2` — Given ticket `open`, When admin phản hồi, Then `in_progress` + message hiện cho user.
- `AC-COM-08-3` — Given player khác, When cố xem ticket không phải của mình, Then 403 (BR-COM-06).
- `AC-COM-08-4` — Given admin giải quyết, When đóng, Then ticket `resolved`/`closed`.

## 7. Ngoài phạm vi (toàn module)
- Nhóm kín, DM, nội dung riêng tư (bất biến #9).
- Thích/lưu/chia sẻ bài; khiếu nại quyết định kiểm duyệt; AI moderation (đã loại SCOPE_BASELINE §3).
- Chat CSKH realtime (dùng ticket bất đồng bộ).

## 8. Quyết định chờ PO chốt
1. Giới hạn ký tự bài/bình luận.
2. Ticket có phân loại/độ ưu tiên không (đề xuất: chủ đề tự do, không phân loại GĐ2).
