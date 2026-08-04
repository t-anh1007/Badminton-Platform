---
type: phasing
status: approved
updated: 2026-08-05
approved: 2026-08-05
owner: Tuan Anh (PO)
builds_on: docs/SCOPE_BASELINE.md
---

# Phân giai đoạn — Nền tảng cầu lông

Tài liệu này là **nguồn có thẩm quyền duy nhất** về mã chức năng và giai đoạn thực
hiện. Phiên viết spec Giai đoạn 1 lấy danh sách chức năng từ đây, không suy luận
lại từ `SCOPE_BASELINE.md`.

## 0. Quyết định nền của phiên

| # | Quyết định | Nội dung |
|---|---|---|
| D1 | Đơn vị phân giai đoạn | **Module trọn vẹn**, không cắt lát dọc. Một module thuộc đúng một giai đoạn. |
| D2 | Ngoại lệ duy nhất của D1 | `FIN-05 Thanh toán phí tham gia kèo` đẩy sang GĐ2 vì phụ thuộc ngược vào `matchmaking-passport`. Xem mục 4. |

### Sửa đổi sau phê duyệt

| Ngày | Thay đổi | Căn cứ |
|---|---|---|
| 2026-08-05 | `BOK-10` bổ sung **Admin** làm actor liên quan | D13 — hệ quả của D4, xem [decision-log](decision-log.md) |
| 2026-08-05 | Thêm `FIN-14 Đối soát giao dịch chưa khớp` vào GĐ1. Tổng chức năng GĐ1 tăng từ 39 lên **40** | D15 — bịt lỗ hổng tiền nằm ngoài ledger |

> D1 thay thế cách diễn đạt "lát cắt dọc mỏng" ở [ADR 0001](../decisions/0001-tech-stack.md)
> và [ADR 0002](../decisions/0002-tech-stack-microservices.md). Hai ADR đó vẫn đúng về
> tech stack; riêng phần build order thì tài liệu này là bản mới hơn.

---

## 1. Quy ước mã chức năng

Dạng mã: `<TIỀN TỐ MODULE>-<số thứ tự hai chữ số>`.

| Module | Tiền tố |
|---|---|
| account-access | `ACC` |
| venue-scheduling | `VEN` |
| court-booking | `BOK` |
| finance-disputes | `FIN` |
| matchmaking-passport | `MMP` |
| community-support | `COM` |
| ai | `AI` |

Số thứ tự chạy theo đúng thứ tự bảng trong `SCOPE_BASELINE.md` mục 2.

**Tính năng mới** giữ nguyên mã `F-xx` đã có trong
[discovery 2026-08-04](../discovery/2026-08-04-tinh-nang-moi.md); không đổi số, không
chuyển sang hệ mã module, để tránh lệch tham chiếu với tài liệu brainstorm.

**Quy tắc cấp mã:**

- Mã đã cấp là bất biến. Đổi tên chức năng không đổi mã.
- Chức năng bị loại khỏi phạm vi thì mã của nó bị bỏ trống vĩnh viễn, không tái sử dụng.
- Chức năng mới phát sinh lấy số kế tiếp trong module, không chèn vào giữa.
- Tách một chức năng thành hai: mã gốc giữ nguyên cho phần chính, phần tách ra lấy số mới.

---

## 2. Tổng quan phân bổ

| Giai đoạn | Module | Số chức năng | Vai trò |
|---|---|---:|---|
| **GĐ1** | account-access, venue-scheduling, court-booking, finance-disputes | **40** | Nền tảng + hành trình đặt sân trả tiền hoàn chỉnh |
| **GĐ2** | matchmaking-passport, community-support, ai, + `FIN-05` | **22 UC + 5 tính năng mới** | Cộng đồng, ghép kèo, lớp AI — điểm nhấn bảo vệ |
| **GĐ3** | — | **0 UC nền** | Hoàn thiện, kiểm thử, tài liệu, bàn giao. `F-05` nếu tái kích hoạt. |

Tổng: 62 UC nền (40 + 22) + 5 tính năng mới được chấp nhận + 1 hoãn. Trong đó 61 UC đến từ
`SCOPE_BASELINE` và 1 UC (`FIN-14`) được bổ sung ngày 2026-08-05 theo D15.

---

## 3. Giai đoạn 1 — 39 chức năng

### 3.1. `account-access` — 8 chức năng

| Mã | Chức năng | Actor chính | Phụ thuộc |
|---|---|---|---|
| ACC-01 | Đăng ký tài khoản | Người chơi | — |
| ACC-02 | Xác minh số điện thoại hoặc email | Người chơi | ACC-01 |
| ACC-03 | Đăng nhập | Tất cả | ACC-01 |
| ACC-04 | Đăng xuất | Tất cả | ACC-03 |
| ACC-05 | Đặt lại mật khẩu | Tất cả | ACC-01 |
| ACC-06 | Đổi mật khẩu | Tất cả | ACC-03 |
| ACC-07 | Quản lý hồ sơ cá nhân | Người chơi | ACC-03 |
| ACC-08 | Quản lý quyền truy cập tài khoản (khóa / khôi phục) | Admin | ACC-01 |

### 3.2. `venue-scheduling` — 9 chức năng

| Mã | Chức năng | Actor chính | Phụ thuộc |
|---|---|---|---|
| VEN-01 | Đăng ký nhà cung cấp sân | Người chơi | ACC-03 |
| VEN-02 | Xét duyệt nhà cung cấp sân | Admin | VEN-01 |
| VEN-03 | Quản lý hồ sơ cơ sở sân | Nhà cung cấp sân | VEN-02 |
| VEN-04 | Quản lý danh sách sân con | Nhà cung cấp sân | VEN-03 |
| VEN-05 | Thiết lập giờ hoạt động và ngày đóng cửa | Nhà cung cấp sân | VEN-04 |
| VEN-06 | Thiết lập biểu giá theo lịch | Nhà cung cấp sân | VEN-04 |
| VEN-07 | Thiết lập quy tắc đặt sân (bước thời gian, thời lượng min/max) | Nhà cung cấp sân | VEN-04 |
| VEN-08 | Quản lý lịch sân hợp nhất | Nhà cung cấp sân | VEN-05, VEN-06, VEN-07 |
| VEN-09 | Ghi nhận booking tại quầy hoặc qua điện thoại | Nhà cung cấp sân | VEN-08 |

### 3.3. `court-booking` — 10 chức năng

| Mã | Chức năng | Actor chính | Phụ thuộc |
|---|---|---|---|
| BOK-01 | Tìm sân bằng danh sách và bản đồ | Người chơi | VEN-03 |
| BOK-02 | Lọc và sắp xếp sân | Người chơi | BOK-01 |
| BOK-03 | Xem chi tiết cơ sở sân | Người chơi | BOK-01 |
| BOK-04 | Xem lịch trống và giá hiện hành | Người chơi | VEN-08 |
| BOK-05 | Chọn slot và thời lượng đặt sân | Người chơi | BOK-04, VEN-07 |
| BOK-06 | Giữ slot trong 10 phút | Người chơi | BOK-05 |
| BOK-07 | Tạo booking đặt sân | Người chơi | BOK-06, FIN-03 hoặc FIN-04 |
| BOK-08 | Xem chi tiết và lịch sử booking | Người chơi | BOK-07 |
| BOK-09 | Hủy booking | Người chơi | BOK-07, FIN-07 |
| BOK-10 | Điều chỉnh hoặc hủy booking do phía sân | Nhà cung cấp sân; **Admin** (actor liên quan, D13) | BOK-07, FIN-08 |

### 3.4. `finance-disputes` — 13 chức năng

`FIN-05` không thuộc GĐ1. Xem mục 4. `FIN-14` được bổ sung ngày 2026-08-05 theo D15.

| Mã | Chức năng | Actor chính | Phụ thuộc |
|---|---|---|---|
| FIN-01 | Xem số dư và lịch sử giao dịch | Người chơi | ACC-03 |
| FIN-02 | Nạp số dư qua SePay | Người chơi | FIN-01 |
| FIN-03 | Thanh toán booking bằng số dư | Người chơi | FIN-02, BOK-06 |
| FIN-04 | Thanh toán booking qua SePay | Người chơi | BOK-06 |
| FIN-06 | Nhận khoản thanh toán đến muộn vào số dư | Người chơi | FIN-04 |
| FIN-07 | Nhận hoàn tiền khi tự hủy | Người chơi | BOK-09 |
| FIN-08 | Nhận hoàn toàn bộ do lỗi sân hoặc nền tảng | Người chơi | BOK-10 |
| FIN-09 | Theo dõi doanh thu (hoa hồng cố định, không cấu hình) | Nhà cung cấp sân | BOK-07 |
| FIN-10 | Yêu cầu rút số dư khả dụng | Nhà cung cấp sân | FIN-09 |
| FIN-11 | Xử lý yêu cầu rút tiền (chuyển khoản tay, webhook SePay tự đối soát) | Admin | FIN-10 |
| FIN-12 | Gửi tranh chấp giao dịch | Người chơi | FIN-01 |
| FIN-13 | Giải quyết tranh chấp giao dịch | Admin | FIN-12 |
| FIN-14 | Đối soát giao dịch chưa khớp | Admin | FIN-02, FIN-11 |

---

## 4. Giai đoạn 2

### 4.1. Chức năng nền

| Mã | Chức năng | Module | Ghi chú |
|---|---|---|---|
| MMP-01 … MMP-11 | Toàn bộ 11 UC của `matchmaking-passport` | matchmaking-passport | Kèo, Passport, khai báo trình độ, đánh giá sau trận |
| COM-01 … COM-08 | Toàn bộ 8 UC của `community-support` | community-support | Bài viết, kiểm duyệt, ticket hỗ trợ |
| AI-01 | Nhận gợi ý kèo phù hợp (AI Matchmaker, có giải thích) | ai | Nâng cấp bởi F-02 |
| AI-02 | Nhận hỗ trợ từ chatbot (RAG) | ai | |
| **FIN-05** | **Thanh toán phí tham gia kèo** | finance-disputes | **Ngoại lệ D2** |

### 4.2. Vì sao `FIN-05` nằm ở đây

`FIN-05` là chức năng GĐ1 duy nhất có phụ thuộc ngược. Kèo do
`matchmaking-passport` sở hữu, và kiến trúc xác nhận `finance-service` consume
`JoinApproved` / `MatchConfirmed` do `matchmaking-service` phát
([system-architecture.md §6.3](../architecture/system-architecture.md)).

Nếu giữ ở GĐ1, sẽ tồn tại một Acceptance Criteria không bao giờ pass được ở cuối
GĐ1, làm hỏng tính kiểm chứng khách quan của cổng hoàn thành giai đoạn.

Đây là ngoại lệ **duy nhất** được phép so với quy tắc module trọn vẹn. Mọi ngoại lệ
mới phải được PO duyệt riêng và ghi vào bảng này.

### 4.3. Tính năng mới được chấp nhận

| Mã | Tên | Giai đoạn | Lý do | Gắn với |
|---|---|---|---|---|
| F-01 | Điểm trình độ có độ bất định | GĐ2 | Data model lõi, là nền cho F-02/03/04. Cold-start được. | MMP-09, MMP-11 |
| F-02 | Điểm độ hợp + giải thích | GĐ2 | Nâng cấp trực tiếp AI-01, đúng ràng buộc "AI phải giải thích". | AI-01, MMP-01 |
| F-03 | Ghép kèo live (Tìm nhanh + lấp chỗ) | GĐ2 | Ngôi sao demo. Tái dùng cơ chế hold 10 phút và chống đặt trùng của GĐ1. | MMP-04, MMP-05, MMP-06 |
| F-04 | Gom nhóm lẻ cân bằng | GĐ2 | Bài toán tối ưu, giá trị học thuật. Discovery mục 10 xếp "nên có". | MMP-01, F-01 |
| F-07 | Trợ lý đánh giá công bằng | GĐ2 | Rẻ, chống lạm dụng, giữ Passport sạch. | MMP-10 |

### 4.4. Tính năng hoãn

| Mã | Tên | Kết luận | Điều kiện xét lại |
|---|---|---|---|
| F-05 | Bản đồ nhiệt nhu cầu và giờ vàng | **Hoãn** | Cần bộ dữ liệu seed mô phỏng. Discovery đã đánh dấu ⏸ hoãn tới sau kỳ báo cáo tiến độ. Nếu chuẩn bị được seed, xếp vào GĐ3. Nếu deadline căng, đây là hạng mục cắt đầu tiên và việc cắt không phá câu chuyện lõi. |

`F-06` và `F-08` đã bị loại từ phiên brainstorm, không đưa lại.

---

## 5. Giai đoạn 3

Không chứa chức năng nền mới. Nội dung:

- Hoàn thiện, kiểm thử tổng thể, sửa lỗi tồn đọng.
- Viết tài liệu và báo cáo đồ án.
- Chuẩn bị demo bảo vệ.
- `F-05`, nếu điều kiện ở mục 4.4 được đáp ứng.

---

## 6. Hành trình nghiệp vụ hoàn chỉnh mà GĐ1 phủ được

GĐ1 tự chạy end-to-end, không cần bất kỳ chức năng nào của GĐ2 hoặc GĐ3.

**J1 — Người chơi đặt sân và trả tiền**
ACC-01 → ACC-02 → ACC-03 → BOK-01 → BOK-04 → BOK-05 → BOK-06 → FIN-03/FIN-04 → BOK-07 → BOK-08 → BOK-09 → FIN-07

**J2 — Nhà cung cấp vận hành sân và nhận tiền**
VEN-01 → VEN-02 → VEN-03 → VEN-04 → VEN-05 → VEN-06 → VEN-07 → VEN-08 → VEN-09 → FIN-09 → FIN-10 → FIN-11

**J3 — Admin vận hành nền tảng**
VEN-02 · ACC-08 · FIN-11 · FIN-12 → FIN-13

Ba hành trình này đủ để demo một marketplace đặt sân chạy thật, có tiền vào và tiền ra.

---

## 7. Kiểm tra tính nhất quán

| Kiểm tra | Kết quả |
|---|---|
| Mọi chức năng có mã và thuộc đúng một giai đoạn | ✅ 62/62 |
| Không có phụ thuộc ngược từ giai đoạn trước sang giai đoạn sau | ✅ sau khi áp dụng D2 |
| Không phá 9 ràng buộc bất biến (`SCOPE_BASELINE` §4) | ✅ |
| Không đưa lại nội dung đã loại khỏi phạm vi (`SCOPE_BASELINE` §3) | ✅ |
| GĐ1 tạo thành ít nhất một hành trình hoàn chỉnh demo được | ✅ ba hành trình, mục 6 |

---

## 8. Giả định cần PO duyệt theo lô

| # | Giả định | Cơ sở |
|---|---|---|
| A1 | Tiền tố mã module dùng 3 ký tự viết hoa như mục 1 | Đề xuất, chưa có tiền lệ trong repo |
| A2 | Tính năng mới giữ hệ mã `F-xx` riêng, không hòa vào hệ mã module | Discovery yêu cầu không đổi số để tránh lệch tham chiếu |
| A3 | F-01, F-02, F-03, F-04, F-07 đều thuộc GĐ2 | Cả năm đều gắn `matchmaking-passport`; discovery mục 10 xếp F-01/02/03 "giữ chắc", F-04/F-07 "nên có" |
| A4 | GĐ3 không chứa chức năng nền mới, chỉ hoàn thiện và bàn giao | Build order trong repo mô tả GĐ3 là bàn giao |
| A5 | Đánh giá sau trận (MMP-10) chỉ áp dụng cho kèo, không áp dụng cho booking sân ở GĐ1 | Kiến trúc đặt đánh giá booking ở `venue-booking-service` nhưng `SCOPE_BASELINE` không có UC đánh giá booking |
| A6 | GĐ2 tự nó không cần thêm chức năng nền nào từ GĐ1 ngoài những gì đã liệt kê | Rà soát phụ thuộc mục 3 và 4 |

---

## 9. Câu hỏi còn mở

| # | Câu hỏi | Ảnh hưởng | Thời điểm cần chốt |
|---|---|---|---|
| Q1 | Ngưỡng "đánh giá bất thường" của F-07 định nghĩa thế nào | Chất lượng F-07 khi demo | Trước khi spec GĐ2 |
| Q2 | Bộ seed mô phỏng gồm bao nhiêu user/booking/kèo | Điều kiện tái kích hoạt F-05 | Sau kỳ báo cáo tiến độ |
| Q3 | 4 quyết định kỹ thuật ở [system-architecture.md §10](../architecture/system-architecture.md) chưa được PO xác nhận | Thiết kế, không chặn spec | Trước khi tạo goal triển khai |

---

## 10. Rủi ro của phương án này

| # | Rủi ro | Mức | Giảm thiểu đề xuất |
|---|---|---|---|
| R1 | GĐ1 chiếm 39/61 chức năng nền, dồn khoảng hai phần ba khối lượng vào nửa đầu. Ngôi sao demo F-03 nằm trọn ở GĐ2. Nếu GĐ1 trượt tiến độ, điểm nhấn bảo vệ có nguy cơ không kịp làm. | Cao | Đặt một mốc kiểm tra cứng giữa GĐ1: nếu tới mốc mà J1 chưa chạy end-to-end, cắt FIN-12/FIN-13 (tranh chấp) xuống GĐ3 để bảo vệ thời gian cho GĐ2. |
| R2 | FIN-10, FIN-11 (rút tiền) và FIN-12, FIN-13 (tranh chấp) tốn công triển khai và vận hành tay nhưng đóng góp ít vào giá trị demo. | Trung bình | Ứng viên cắt đầu tiên nếu R1 xảy ra. |
| R3 | F-05 hoãn, GĐ3 có thể rỗng phần chức năng. | Thấp | Chấp nhận. GĐ3 vẫn cần cho kiểm thử và tài liệu. |
| R4 | Ngoại lệ D2 tạo tiền lệ cắt UC lẻ khỏi module. | Thấp | Mục 4.2 ghi rõ đây là ngoại lệ duy nhất; ngoại lệ mới phải PO duyệt riêng. |
