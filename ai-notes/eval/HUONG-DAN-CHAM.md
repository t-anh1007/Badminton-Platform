# Hướng dẫn chấm Likert (file likert-real.csv)

Chấm từng dòng: mở ảnh tương ứng trong samples-internet/, đọc các cột dữ kiện, điền 1-5 vào cột Likert.
Chấm hết một lượt, không xem thống kê giữa chừng.

## Likert ① — "AI đọc đúng tỉ số trong ảnh"
Cột dữ kiện: ti_so_that, ai_doc, loai.

| Mức | Khi nào |
|---|---|
| 5 | Đọc đúng hết mọi ván |
| 4 | Đúng, nhưng người chấm còn phân vân vì có ô nhòe hoặc khó nhìn |
| 3 | Thiếu hoặc thừa ván, hoặc ảnh không xác minh được |
| 2 | Sai một phần chữ số, bên thắng vẫn đúng |
| 1 | Sai bên thắng, hoặc đọc nhầm hàng thành ván |

## Likert ② — "Hệ thống gán đúng điểm của mỗi cột/hàng cho đúng người chơi (đội) tương ứng"
Cột dữ kiện: ten_tren_anh (tên AI đọc trên bảng), doi_A, doi_B (đội giả lập), ghep_cot (kết quả hàm mapColumns:
dung / trao / khong_tu_ghep), ai_doc (để xem có ván nào bị tráo).

| Mức | Khi nào |
|---|---|
| 5 | Mọi ván đều gán đúng người, tự động bằng tên trên ảnh |
| 4 | Gán đúng, nhưng tên trên ảnh viết tắt hoặc khác cách viết (ví dụ "LE" so với "Lê Đức Phát") nên khớp chưa chắc chắn |
| 3 | Hệ thống không tự gán được và yêu cầu người khai chọn cột. Không sai, nhưng cũng không tự động |
| 2 | Gán đúng một phần (ví dụ đúng ván 1, tráo ở ván 2) |
| 1 | Tráo hai người chơi, khiến người thắng thành người thua |

Lưu ý:
- Bảng lật đời thường không in tên nên ghep_cot luôn là khong_tu_ghep (thường mức 3).
- Ảnh AI đọc nhầm hàng thành ván (real09, real26) thì điểm từng ván đã lệch người từ bước đọc; xét theo kết quả cuối người khai nhìn thấy.
- Bộ muse20 (bảng lật, ảnh AI tạo, chấm riêng): ① so cả 4 lá với nhãn trong muse-prompts.md; đọc lẫn lá số ván thắng thành điểm ván, hoặc đọc nhầm bảng sân bên (muse14) thì mức 1. ② thường mức 3 vì bảng lật không in tên.
- Điểm tin cậy (min_conf) KHÔNG dùng để chấm ②; phần "Confidence-Tiered" báo cáo bằng chỉ số khách quan.
