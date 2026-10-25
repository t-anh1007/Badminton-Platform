---
type: use-case-spec
status: approved
updated: 2026-10-22
owner: Tuan Anh (PO)
author: Claude Code
source:
  - docs/product/specs/result-ocr-autoconfirm.md (BR-RA-*, AC-RA-*)
  - docs/product/diagrams/result-ocr/ (UC1–UC3, A1–A5, ST1)
  - docs/product/decision-log.md D60, D61, D62
---

# UC-RA-01 — Khai kết quả kèo bằng ảnh và tự chốt kết quả (AI agent)

Đặc tả use case chính của chức năng AI agent automation. Các use case nhỏ UC01–UC17 trên sơ đồ use case được gộp vào luồng thay thế và luồng ngoại lệ dưới đây. Khi lệch với spec thì spec là nguồn đúng.

## 1. Use case ID

UC-RA-01

## 2. Use case name

Khai kết quả kèo bằng ảnh và tự chốt kết quả

## 3. Tiền điều kiện

- Người chơi đã đăng nhập và thuộc danh sách người chơi (roster) của một kèo thi đấu đơn (2 người) hoặc đôi (4 người).
- Kèo đã qua giờ kết thúc; hồ sơ kết quả đang ở trạng thái mở khai, áp luật mới (`ra_v1`).
- Còn trong cửa sổ khai 12 giờ (đã giãn qua đêm nếu hạn rơi vào 23:00–07:00).
- Người chơi chưa dùng hết hạn mức 7 ảnh của hồ sơ.

## 4. Hậu điều kiện

- **Thành công:** hồ sơ ở trạng thái kết quả cuối (một đội thắng hoặc không có kết quả). Tiền tạm giữ được chia bằng code, rating và điểm bảng xếp hạng cập nhật đúng một lần, vi phạm tự động được ghi nếu có. Mọi lần AI đọc ảnh và phán quyết được lưu cùng đầu vào để đo đạc.
- **Chưa tự xử được:** hồ sơ chuyển Admin (SLA 48 giờ); tiền và điểm vẫn khóa tới khi Admin ra kết quả cuối.
- **Luôn đúng:** bản khai đã gửi không sửa được; AI không quyết định bên thắng hay số tiền.

## 5. Actor chính

Người chơi khai kết quả (bất kỳ thành viên nào trong roster của kèo).

## 6. Actor phụ

- **Thành viên đội kia:** đồng ý hoặc phản đối kết quả đề xuất, nộp bằng chứng, kháng nghị.
- **Đồng đội của người khai:** gửi thêm ảnh hoặc bản khai.
- **AI agent đọc ảnh:** chuyển ảnh bảng tỉ số thành tỉ số từng set (chuỗi model miễn phí có dự phòng).
- **AI agent phán quyết tạm:** soạn phán quyết tranh chấp từ văn bản bằng chứng và kho luật, án lệ (RAG).
- **Admin:** phúc thẩm hồ sơ chuyển lên, ra kết quả cuối, xác nhận vi phạm.
- **Bộ hẹn giờ hệ thống:** chốt khi hết hạn (quét định kỳ và quét khi có người mở hồ sơ).

## 7. Basic flow

Kèo đơn, ảnh rõ, AI đọc được, đội kia đồng ý.

| Người chơi khai kết quả | Hệ thống |
|---|---|
| 1. Mở trang chi tiết kèo, vào khối "Kết quả trận". | 2. Hiện hạn khai, nút "Chọn ảnh" và số ảnh còn được nộp. |
| 3. Chọn 1–5 ảnh bảng tỉ số từ thư viện hoặc camera. | 4. Kiểm định dạng (JPG/PNG/WebP), tối đa 15 MB/ảnh và hạn mức ảnh. Lưu ảnh gốc ở kho riêng tư, trích giờ chụp, checksum và vân tay ảnh. |
| | 5. Gửi từng ảnh cho AI agent đọc ảnh (tối đa 3 ảnh song song, tổng tối đa 30 giây, tự chuyển model dự phòng khi lỗi). Nhận về tỉ số từng set, nhãn cột và độ chắc từng ô. AI không kết luận ai thắng. |
| | 6. Gộp set theo thứ tự, khớp cột với đội theo tên thành viên, kiểm luật tỉ số và thể thức (BO3/BO5), giờ chụp, trùng ảnh. Hiện bản nháp tỉ số kèm ảnh nguồn từng set và mức dự kiến **Xanh**. |
| 7. Kiểm bản nháp, không sửa ô nào, bấm **Gửi**. | 8. Tính lại mức ở server, ghi bản khai (không sửa được), suy ra bên thắng bằng code. Bản khai thành kết quả đề xuất, mở cửa sổ phản hồi **2 giờ** (giãn qua đêm), báo cả roster. |
| 9. *(Thành viên đội kia)* xem kết quả đề xuất, ảnh và số AI đọc, bấm **Đồng ý**. | 10. Kiểm đồng ý đúng phiên bản bản khai đang xem. Chốt kết quả cuối, chia tiền tạm giữ, cập nhật rating và điểm bảng xếp hạng một lần, báo roster. |

## 8. Alternative flow

### AF1 — Bản khai mức Vàng

- **Điểm rẽ:** bước 6–7. **Điều kiện:** có ô AI đọc chưa chắc (< 0,9), người khai sửa ô, tự chọn cột, set không có ảnh, ảnh không có giờ chụp hoặc chụp sau giờ kết thúc quá 2 giờ, ảnh gần trùng hồ sơ khác, ảnh nhiều bảng điểm, các ảnh cùng set lệch nhau, hoặc người khai có uy tín Thấp.

| Người chơi khai kết quả | Hệ thống |
|---|---|
| 7a. Sửa ô hoặc chọn "Cột trái là đội nào?", bấm **Gửi**. | 8a. Xếp mức **Vàng**, mở cửa sổ phản hồi **6 giờ**. Hiện lý do cho roster nhưng không bao giờ nêu uy tín; không có lý do công khai thì hiện câu chung "Đội kia có 6 giờ để kiểm tra". Số AI đọc ban đầu vẫn hiện bên cạnh số đã sửa. |

- **Kết quả:** quay lại bước 9 với hạn 6 giờ.

### AF2 — AI không đọc được ảnh, nhập tay

- **Điểm rẽ:** bước 5. **Điều kiện:** mọi model trong chuỗi lỗi, hết hạn mức, quá 30 giây, hoặc đọc ảnh tự động đang tắt.

| Người chơi khai kết quả | Hệ thống |
|---|---|
| | 5b. Báo đọc ảnh không thành công (hoặc đang tạm tắt), mở bảng gõ tay theo số set của thể thức; ảnh vẫn kèm bản khai. |
| 6b. Gõ tỉ số từng set, bấm **Gửi**. | 7b. Kiểm luật tỉ số, xếp tối đa **Vàng** (AF1). Khi AI hoạt động lại, đọc bù các ảnh chưa đọc để bổ sung thông tin, không đổi bản khai đã gửi. |

- **Kết quả:** quay lại bước 8 theo AF1.

### AF3 — Hết hạn phản hồi, không ai phản đối

- **Điểm rẽ:** bước 9. **Điều kiện:** hết cửa sổ phản hồi, không có bất đồng, bản khai không ở mức Đỏ.

| Bộ hẹn giờ hệ thống | Hệ thống |
|---|---|
| 9c. Đến hạn (hoặc có người mở hồ sơ sau hạn). | 10c. Chốt theo kết quả đề xuất; chạy lại nhiều lần vẫn chỉ chốt một lần. |

- **Kết quả:** như bước 10.

### AF4 — Kèo đôi: chờ người còn lại, người được trả phần

- **Điểm rẽ:** bước 9. **Điều kiện:** kèo đôi.

| Thành viên đội kia | Hệ thống |
|---|---|
| 9d. Một người của đội bị xử thua bấm **Đồng ý**. | 10d. Mở thời gian chờ **1 giờ** cho người còn lại, báo "đồng đội đã chấp nhận, còn tới HH:MM để phản đối". |
| 11d. Người còn lại bấm **Đồng ý**, hoặc không phản hồi. | 12d. Chốt ngay khi người còn lại đồng ý, hoặc chốt khi hết 1 giờ. |

- **Nhánh người được trả phần:** người đồng ý là người được chủ kèo trả tiền thay. Hệ thống không tính là đội thua chấp nhận, cửa sổ chạy theo mức, và chỉ chốt sớm khi chủ kèo (người trả) cũng đồng ý; hệ thống báo cho chủ kèo.
- **Kết quả:** như bước 10.

### AF5 — Người khai tự khai đội mình thua

- **Điểm rẽ:** bước 8. **Điều kiện:** bản khai cho thấy đội của người khai thua.

| Người chơi khai kết quả | Hệ thống |
|---|---|
| 7e. Gửi bản khai đội mình thua. | 8e. Xử như đội thua chấp nhận: kèo đơn chốt ngay; kèo đôi theo AF4. |

### AF6 — Đồng đội gửi thêm bản cùng bên thắng

| Đồng đội của người khai | Hệ thống |
|---|---|
| Gửi ảnh hoặc bản khai cùng bên thắng, mức cao hơn. | Thêm vào bằng chứng; rút ngắn cửa sổ phản hồi theo mức mới (tính từ lúc mở cửa sổ ban đầu), không bao giờ kéo dài. |

### AF7 — Khai "Không có kết quả"

- **Điều kiện:** tỉ số hợp luật cho thấy hết giờ sân mà hòa số set và set dở cũng hòa.

| Người chơi khai kết quả | Hệ thống |
|---|---|
| Nhập tỉ số hòa theo luật, bấm **Gửi**. | Suy ra "không có kết quả" từ tỉ số, đi chung luồng phản hồi; khi chốt, chi phí chia 50:50, không tính rating. |

### AF8 — Thay bản khai

- **Điều kiện:** còn cửa sổ khai, đội kia chưa phản hồi, đồng đội chưa có bản khác.

| Người chơi khai kết quả | Hệ thống |
|---|---|
| Bấm "Thay bản khai", tải ảnh và gửi lại. | Ghi bản mới, tính lại cửa sổ phản hồi từ lúc thay theo mức mới; ảnh của bản cũ vẫn tính vào hạn mức. |

## 9. Exception

### EX1 — Tỉ số sai luật

- **Điểm phát sinh:** bước 7. **Điều kiện:** tỉ số không hợp luật cầu lông hoặc sai thể thức.

| Người chơi khai kết quả | Hệ thống |
|---|---|
| Bấm **Gửi**. | Từ chối (`RESULT_SCORE_INVALID`), đánh dấu set sai, không ghi bản khai. |

- **Kết quả:** quay lại bước 7 để sửa.

### EX2 — Ảnh lạ, mức Đỏ

- **Điểm phát sinh:** bước 6. **Điều kiện:** ảnh trùng chính xác ảnh của hồ sơ khác, hoặc chụp trước giờ bắt đầu quá 30 phút.

| Người chơi khai kết quả | Hệ thống |
|---|---|
| Bấm **Gửi**. | Xếp **Đỏ**, mở cửa sổ 12 giờ, hiện lý do cho roster. Không bao giờ tự chốt: hết 12 giờ hoặc ngay khi có người chấp nhận thì chuyển Admin. Ảnh trùng chính xác ghi vi phạm uy tín tự động cho người nộp. |

- **Kết quả:** Admin xử theo EX6.

### EX3 — Bản khai đã bị thay khi đội kia bấm Đồng ý

| Thành viên đội kia | Hệ thống |
|---|---|
| Bấm **Đồng ý** trên bản cũ. | Từ chối (`RESULT_VERSION_STALE`), tải lại hồ sơ và báo "bản khai vừa được thay". |

- **Kết quả:** quay lại bước 9 với bản mới.

### EX4 — Phản đối tỉ số: tranh chấp tầng 1 (luật bằng chứng)

- **Điểm phát sinh:** bước 9. **Điều kiện:** thành viên đội kia bấm **Phản đối** với lý do "tỉ số sai", hoặc gửi bản khác bên thắng; hoặc đồng đội của người khai gửi bản khác bên thắng; hoặc người còn lại phản đối trong 1 giờ chờ. Người có uy tín Thấp phải kèm ảnh, nếu không bị từ chối (`RESULT_OBJECTION_EVIDENCE_REQUIRED`).

| Các thành viên roster | Hệ thống |
|---|---|
| 1. Nộp ảnh bằng chứng trong **2 giờ**, bấm "Đội tôi đã nộp đủ". | 2. Giữ kín ảnh mới tới khi hết 2 giờ hoặc cả hai đội bấm nộp đủ. Đọc và xếp mức từng ảnh, gom theo bên thắng mà ảnh ủng hộ; ảnh lạ chỉ bị loại riêng ảnh đó. |
| | 3. Chỉ một bên có bằng chứng hợp lệ (Xanh/Vàng) → kết quả tạm theo bên đó; không bên nào có → "không có kết quả" tạm; cả hai bên có → EX5. Ảnh mới chưa đọc được sau 30 phút thử lại → chuyển Admin. |
| | 4. Công bố kết quả tạm kèm lý do và trích luật, mở **6 giờ kháng nghị** (EX6). |

### EX5 — Tranh chấp tầng 2: AI agent phán quyết tạm

- **Điểm phát sinh:** EX4 bước 3. **Điều kiện:** có bằng chứng hợp lệ ủng hộ cả hai bên thắng.

| AI agent phán quyết tạm | Hệ thống |
|---|---|
| | 1. Dựng đầu vào chỉ là **văn bản**: tỉ số AI đọc từ từng ảnh, kết quả kiểm tra (giờ chụp, nghi trùng, chụp màn hình), mức từng ảnh, thời điểm gửi. Không gửi ảnh, không gửi uy tín. |
| 2. Truy hồi luật và án lệ liên quan (tìm kiếm lai: vector + toàn văn), soạn phán quyết: một trong ba kết quả, lý do, trích dẫn, độ tin cậy. | 3. Kiểm khuôn kết quả và kiểm mọi trích dẫn phải nằm trong tập đoạn đã truy hồi; sai thì thử model kế tiếp. |
| | 4. Độ tin cậy ≥ 0,85 → công bố phán quyết tạm kèm lý do và chip trích luật, mở **6 giờ kháng nghị** (EX6). Độ tin cậy thấp, AI lỗi, hoặc hết chuỗi model → chuyển Admin kèm bản phân tích nếu có. |

### EX6 — Kháng nghị và Admin phúc thẩm

- **Điểm phát sinh:** sau EX4 bước 4, EX5 bước 4 hoặc EX2. **Điều kiện kháng nghị:** người thuộc bên bị xử thua (với "không có kết quả": cả hai đội), trong 6 giờ, kèm ảnh mới (tối đa 2) hoặc chỉ ra điểm sai cụ thể trong lý do.

| Thành viên bên bị xử thua / Admin | Hệ thống |
|---|---|
| 1. Gửi kháng nghị có căn cứ, hoặc bấm **Chấp nhận**, hoặc không làm gì. | 2. Thiếu căn cứ → từ chối (`RESULT_APPEAL_GROUNDS_REQUIRED`), không lên Admin. Chấp nhận (kèo đôi cần đủ người) hoặc hết 6 giờ → chốt theo kết quả tạm. Kháng nghị hợp lệ → đưa vào hàng chờ Admin với lý do "Kháng nghị". |
| 3. *(Admin)* xem bản khai, ảnh, số AI đọc, tín hiệu ảnh, phán quyết tạm và ghi chú AI; chọn kết quả, viết lý do, đánh giá kháng nghị có căn cứ hay không, xác nhận vi phạm nếu có. | 4. Xem trước tác động, xác nhận hai bước, chốt kết quả cuối, hiện lý do của Admin cho roster. Lưu hồ sơ làm án lệ ẩn danh cho các lần truy hồi sau. |

### EX7 — Báo sự cố (không có trận, vắng mặt, bỏ dở)

- **Điểm phát sinh:** trong cửa sổ khai, cửa sổ phản hồi hoặc 2 giờ nộp bằng chứng. **Điều kiện:** phản đối với lý do "không có trận" hoặc bấm báo sự cố; mỗi người một lần cho mỗi hồ sơ.

| Thành viên roster | Hệ thống |
|---|---|
| Báo sự cố kèm mô tả. | Dừng mọi bộ đếm, chuyển thẳng Admin. Admin luôn ra kết quả cuối dựa trên bằng chứng đã có; hồ sơ không quay lại bước cũ. |

### EX8 — Hết cửa sổ khai mà không ai khai

| Bộ hẹn giờ hệ thống | Hệ thống |
|---|---|
| Đến hạn khai 12 giờ (đã giãn qua đêm). | Chuyển "không có kết quả" tạm theo luật kèo thi đấu hiện có. |
