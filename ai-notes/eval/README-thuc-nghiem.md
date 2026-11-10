# Thực nghiệm 1 — AI đọc ảnh bảng tỉ số (59 ảnh đã chấm)

Bộ dữ liệu và kết quả để viết bài báo NCKH. Báo cáo chính: `paper/bao-cao-ket-qua.md`
(số liệu đầy đủ: `paper/ket-qua-analyze.txt`, kết quả từng ảnh: `paper/per-image.json`).

## Dữ liệu

- `samples-internet/real*.png|jpg` — bộ real32 (ảnh thật, xem `samples-internet/README.md`, `real32_index.csv`).
- `samples-internet/roboflow80/` — 80 khung hình bảng điểm từ Roboflow (`roboflow80_index.csv`).
- `graded-59.txt` — 59 ảnh PO đã chấm: `file|tỉ số thật|Likert1|Likert2`.
- Không đưa lên git: `samples-internet/score board/` (551 MB, bộ gốc Roboflow) và
  `samples-internet/roboflow-dedup/` (195 MB) — chỉ là nguồn để lọc ra roboflow80.

## Pipeline (thứ tự chạy, từ gốc repo)

1. `run-real.mts` (rf80: truyền thư mục + file ra làm tham số, log ở `run-rf80.log`) → `results-*.json`: chỉ gọi chuỗi AI đọc ảnh (`readScoreImage`,
   đúng thứ tự model production). **Không** đọc EXIF, không kiểm trùng ảnh.
2. `map-real.mts` / `map-rf80.mts` → `map-*.json`: hàm ghép cột theo tên `mapColumns` của hệ thống.
3. `draft-sim.mts` → `draft-sim.json`: hàm dựng bản nháp `buildDraft` của hệ thống → mức `level`
   + `reasons` mà người khai thấy (trường `prod`, `prodReasons` trong per-image.json).
4. `build-form-data.py` → `likert-data.js` (trang chấm `likert-form.html`).
5. `paper/analyze.py` → báo cáo số liệu, hình `paper/fig/`, `paper/per-image.json`.

## Tín hiệu đã dùng khi xếp mức (quan trọng cho phần mô tả thực nghiệm)

**Tín hiệu giờ chụp (EXIF) KHÔNG được kiểm thật — bị trung hòa.** Ảnh internet không có EXIF,
nên `draft-sim.mts` giả lập `capturedAt = now` và khung trận `startAt = endAt = now`. Vì vậy
không ảnh nào bị gắn `NO_CAPTURE_TIME`, `CAPTURED_BEFORE_START`, `CAPTURED_LATE`.
Tương tự, `exactDuplicate = nearDuplicate = multipleBoards = false` cố định
(không có `EXACT_DUPLICATE`, `NEAR_DUPLICATE`). `isScreenshot` lấy từ AI nhưng chỉ là cờ, không hạ mức.

Tín hiệu thực sự tác động đến mức trong thực nghiệm:

| Tín hiệu | Nguồn | Mã lý do |
|---|---|---|
| Độ tin cậy ô < 0,9 (`OCR_CELL_CONFIDENCE`) | AI (minConf gán cho mọi ô) | `LOW_CELL_CONFIDENCE` |
| Không tự ghép cột theo tên | `mapColumns` | `USER_COLUMN_MAPPING` |
| AI không trả kết quả / không đọc được | AI | `AI_UNAVAILABLE` |
| Nhiều bảng trong ảnh (AI báo `boards > 1`) | AI | `MULTIPLE_BOARDS` (0 ảnh trong 59) |

Phân bố trên 59 ảnh (mức hệ thống hiện tại, `prod`): green 36 (không lý do), yellow 23 —
`USER_COLUMN_MAPPING` 15, `LOW_CELL_CONFIDENCE` 5, `AI_UNAVAILABLE` 2,
`LOW_CELL_CONFIDENCE + USER_COLUMN_MAPPING` 1. Không ảnh nào red (red chỉ do `EXACT_DUPLICATE`
hoặc `CAPTURED_BEFORE_START`, cả hai đều bị tắt trong giả lập).

Bộ phân tầng đa tín hiệu post-hoc (mục 4 của analyze.py, trường `tier`, `tierWhy`) dùng:
conf ≥ 0,95 · tự ghép cột theo tên · mọi ván hợp lệ theo luật điểm · không có ván 0-0.
Cũng không dùng EXIF.

## Trường trong `paper/per-image.json`

`f` file · `set` real32/rf80 · `model` · `conf` minConf · `ok` AI đọc khớp tỉ số thật ·
`l1`,`l2` Likert · `mapped` tự ghép cột · `rules` hợp lệ theo luật · `tier` Xanh/Vàng/Đỏ post-hoc ·
`tierWhy` các điều kiện Xanh không đạt · `taxo` kiểu lỗi · `prod` mức hệ thống hiện tại ·
`prodReasons` mã lý do của mức đó.
