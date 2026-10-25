---
type: diagrams
status: draft-for-po-review
updated: 2026-10-21
source: docs/product/specs/result-ocr-autoconfirm.md
style: .claude/skills/diagram-design (skin mặc định)
---

# Bộ sơ đồ BA — Quét ảnh tỉ số, tự chốt kết quả, tranh chấp tự động

Minh họa spec [`result-ocr-autoconfirm.md`](../../specs/result-ocr-autoconfirm.md); khi
lệch nhau thì spec là nguồn đúng.

- UML (use case, activity, sequence, state) và flowchart vẽ theo hệ thiết kế
  `diagram-design` (từ OpenBA-Kit): lưới 4px, đường nối vuông góc bo r=8, nhãn có nền
  che, tối đa ~9 nút mỗi sơ đồ nên sơ đồ lớn được tách thành nhiều sơ đồ nhỏ.
- BPMN là file BPMN 2.0 chuẩn, mở và kéo thả chỉnh sửa trên https://demo.bpmn.io
  hoặc Camunda Modeler.

## Mục lục

| Mã | Loại | Nội dung | HTML (xem) | SVG (chèn báo cáo) |
|---|---|---|---|---|
| UC1 | Use case | Khai kết quả bằng ảnh (UC01–UC05) | `html/uc-1-khai-ket-qua.html` | `svg/uc-1-khai-ket-qua.svg` |
| UC2 | Use case | Phản hồi, tranh chấp, kháng nghị (UC06–UC12) | `html/uc-2-phan-hoi-tranh-chap.html` | `svg/…` |
| UC3 | Use case | Xử lý tự động và quản trị (UC13–UC17) | `html/uc-3-tu-dong-va-quan-tri.html` | `svg/…` |
| 02 | BPMN 2.0 AS-IS | Luồng hiện tại: chủ kèo khai, chủ sân đề xuất, Admin quyết | `02-bpmn-as-is.bpmn` | xuất từ bpmn.io |
| 03 | BPMN 2.0 TO-BE | Luồng mới; tranh chấp là tiến trình con (dấu +) | `03-bpmn-to-be.bpmn` | xuất từ bpmn.io |
| 03b | BPMN 2.0 TO-BE | Tiến trình con: tranh chấp hai tầng, kháng nghị | `03b-bpmn-to-be-tranh-chap.bpmn` | xuất từ bpmn.io |
| A1 | Activity | Khai kết quả và AI đọc ảnh | `html/a1-khai-va-doc-anh.html` | `svg/…` |
| A2 | Activity | Xếp mức tin cậy Xanh / Vàng / Đỏ | `html/a2-xep-muc-tin-cay.html` | `svg/…` |
| A3a | Activity | Phản hồi kết quả đề xuất | `html/a3a-phan-hoi-ket-qua.html` | `svg/…` |
| A3b | Activity | Đội thua chấp nhận (grace, slot trả thay) | `html/a3b-doi-thua-chap-nhan.html` | `svg/…` |
| A4 | Activity | Tranh chấp tầng 1: luật bằng chứng | `html/a4-tranh-chap-tang-1.html` | `svg/…` |
| A5 | Activity | Tầng 2 (AI + RAG) và kháng nghị | `html/a5-tang-2-va-khang-nghi.html` | `svg/…` |
| S1 | Sequence | Khai kết quả bằng ảnh | `html/s1-khai-ket-qua.html` | `svg/…` |
| S2 | Sequence | Đội thua chấp nhận và chốt | `html/s2-doi-thua-chap-nhan.html` | `svg/…` |
| S3 | Sequence | Tầng 2: AI agent ra phán quyết tạm | `html/s3-tang-2-ai-phan-quyet.html` | `svg/…` |
| S4 | Sequence | Kháng nghị và chốt kết quả | `html/s4-khang-nghi-va-chot.html` | `svg/…` |
| ST1 | State machine | Vòng đời hồ sơ kết quả | `html/st1-vong-doi-ho-so.html` | `svg/…` |
| ST2 | State machine | Chi tiết trạng thái tranh chấp | `html/st2-chi-tiet-tranh-chap.html` | `svg/…` |
| F1 | Flowchart | Ghi vi phạm uy tín | `html/f1-ghi-vi-pham-uy-tin.html` | `svg/…` |

Sequence S1–S4 ở **mức nghiệp vụ**. Sequence mức kỹ thuật (service, API, nguồn AI dự
phòng) thuộc bước thiết kế kỹ thuật.

## Sửa và sinh lại

Nguồn sinh nằm ở `scripts/diagrams/` (Python, không cần cài thêm gì):

```bash
python scripts/diagrams/d_usecase.py      # UC1–UC3
python scripts/diagrams/d_activity.py     # A1–A5
python scripts/diagrams/d_seq_state.py    # S1–S4, ST1–ST2, F1
python scripts/diagrams/bpmn_models.py    # 02, 03, 03b (.bpmn)
```

Sau khi sinh HTML, kiểm tra và xuất SVG bằng script của skill:

```bash
python .claude/skills/diagram-design/scripts/self_check.py docs/product/diagrams/result-ocr/html/<file>.html
python .claude/skills/diagram-design/scripts/export_svg.py docs/product/diagrams/result-ocr/html/<file>.html docs/product/diagrams/result-ocr/svg/<file>.svg
```

## Điều chỉnh so với skin mặc định (vì nhãn tiếng Việt)

- Tiêu đề trang dùng Noto Serif thay Instrument Serif (Instrument Serif không có dấu
  tiếng Việt). Geist / Geist Mono có bộ tiếng Việt nên giữ nguyên.
- Nhãn thông điệp sequence và nhãn chuyển trạng thái viết thường, đôi khi dài hơn 14
  ký tự, để đọc được tiếng Việt có dấu.
- Kit không kèm `verify-geometry.py`; hình học đã soát bằng mắt trên trình duyệt,
  tất cả file qua `self_check.py`.
