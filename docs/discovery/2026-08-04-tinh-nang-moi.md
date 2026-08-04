---
type: discovery-features
status: draft
updated: 2026-08-04
owner: Tuan Anh (PO)
builds_on: docs/SCOPE_BASELINE.md
purpose: Danh mục 6 tính năng mới lạ (hướng Dữ liệu & AI) xây trên scope baseline, làm điểm nhấn khi bảo vệ đồ án.
---

# Discovery — 6 tính năng mới cho nền tảng cầu lông

## 0. Bối cảnh và mục tiêu

Vòng discovery này **không kiểm kê lại chức năng phổ thông** (đã nằm trong
[SCOPE_BASELINE.md](../SCOPE_BASELINE.md)). Mục tiêu duy nhất: bổ sung một nhóm nhỏ
tính năng **khác biệt, ghi điểm khi bảo vệ, rẻ để làm trong 4–6 tháng / 1 người**.

Ràng buộc chỉ đạo:
- Novelty tập trung vào hướng **Dữ liệu & AI trên nền đã có** (2 AI của baseline: Matchmaker, Chatbot).
- Nguồn dữ liệu lúc demo: **kết hợp** — tính năng lõi chịu được cold-start (luôn demo được),
  cộng vài tính năng "wow" dựa trên **bộ dữ liệu seed mô phỏng**.

### Ý tưởng khung (câu chuyện khi bảo vệ)

> **Một lớp trí tuệ ghép nối & tin cậy biến marketplace đặt sân thành cộng đồng tự tổ chức.**

Sáu tính năng dùng chung **một mô hình dữ liệu** (điểm trình độ có độ bất định + phong cách chơi),
tạo một mạch trình bày liền: *đo trình độ đáng tin → chấm độ hợp → ghép real-time → gom nhóm cân bằng
→ đọc nhu cầu → đánh giá công bằng*. Đây là chiều sâu hệ thống, không phải các gimmick rời rạc.

---

## 1. Danh mục tính năng

Cột **Nền**: 🟢 = chạy tốt kể cả không có dữ liệu (cold-start) · 🟡 = cần bộ seed mô phỏng.

| # | Tên | Nền | Vai trò | Trạng thái thiết kế |
|---|---|---|---|---|
| F-01 | Điểm trình độ có độ bất định | 🟢 | Data model lõi | Ý tưởng |
| F-02 | Điểm độ hợp + giải thích | 🟢 | Nâng cấp AI Matchmaker | Ý tưởng |
| F-03 | **Ghép kèo live** (Tìm nhanh + lấp chỗ) | 🟢 | **Ngôi sao demo** | **Chi tiết** |
| F-04 | Gom nhóm lẻ cân bằng | 🟢 | Bài toán tối ưu | Ý tưởng |
| F-05 | Bản đồ nhiệt nhu cầu & giờ vàng | 🟡 seed | Quân bài "wow" | Ý tưởng |
| F-07 | Trợ lý đánh giá công bằng | 🟢 | Chống lạm dụng | Ý tưởng |

> Đánh số giữ nguyên theo phiên brainstorm (F-06, F-08 đã bị loại). Không đổi số để tránh lệch tham chiếu.

---

## 2. F-01 — Điểm trình độ có độ bất định

**Vấn đề:** trình độ tự khai không đáng tin, gây ghép kèo lệch.

**Ý tưởng:** AI duy trì một *khoảng* trình độ cho mỗi người chơi (mô hình kiểu Glicko/TrueSkill rút gọn:
một giá trị trung tâm + độ lệch thể hiện mức bất định). Người mới → khoảng rộng; càng chơi và càng được
đánh giá → khoảng hẹp lại.

**Thang trình độ (tách hai lớp — chốt 2026-08-04):**

- **Lớp hiển thị (người dùng):** 5 bậc — `Mới chơi → Yếu (Y) → Trung bình (TB) → Trung bình Khá (TB+) → Bán chuyên (BC)`.
- **Lớp nội bộ (AI):** một điểm số liên tục (kiểu Glicko, gốc ví dụ 1500 ± độ lệch). 5 nhãn chỉ là **điểm cắt** trên trục số.
  Người mới khai một bậc → khởi tạo ở giữa dải bậc đó với **độ bất định rộng**, rồi co lại theo kết quả.

> Nguyên tắc: *người dùng nghĩ bằng nhãn, AI nghĩ bằng số.* Số bậc chỉ là điểm cắt, đổi được mà không đụng phần lõi.

**Vì sao ghi điểm:** thể hiện hiểu biết về hệ thống rating và xử lý bất định — chiều sâu học thuật rõ ràng.
**Chi phí:** thấp, chủ yếu là toán + một form khai báo ban đầu.
**Cold-start:** có — khởi đầu với khoảng bất định rộng, không cần lịch sử.
**Là nền cho:** F-02, F-03, F-04.

---

## 3. F-02 — Điểm độ hợp + giải thích

**Vấn đề:** người chơi khó biết một kèo có hợp với mình không.

**Ý tưởng:** khi xem một kèo, AI chấm "độ hợp %" dựa trên chênh lệch trình độ (F-01), khoảng cách, giờ,
giá, phong cách; kèm **giải thích bằng lời tự nhiên**: *"Hợp 82% — cùng trình khá, cách 2km, nhưng kèo này
thiên về đánh đôi."*

**Vì sao ghi điểm:** nâng cấp trực tiếp AI Matchmaker của baseline; phần "giải thích" đúng tinh thần
AI-có-trách-nhiệm (ràng buộc baseline: AI phải giải thích, không tự quyết).
**Cold-start:** có — dùng dữ liệu hiện tại, không cần lịch sử.

---

## 4. F-03 — Ghép kèo live *(ngôi sao demo — thiết kế chi tiết)*

### 4.1. Bản chất

Một **engine ghép kèo, hai lối vào**, dùng chung một hàng chờ của host và một bộ xếp hạng độ hợp (F-02):

- **Lối vào A — "Tìm nhanh" (người chơi chủ động):** người chơi bấm *Tìm nhanh*, chọn bộ lọc
  (giá sân, khoảng trình độ, khoảng cách) → hệ thống **tự nộp** họ vào các kèo công khai phù hợp,
  chờ host duyệt.
- **Lối vào B — "Lấp chỗ trống" (hệ thống chủ động):** khi một người rút phút chót, hệ thống tự xếp hạng
  người chơi rảnh phù hợp gần đó và gạ họ vào lấp chỗ.

### 4.2. "Real-time" nghĩa là gì ở đây

Chất real-time **không nằm ở việc tìm-và-nộp** (đó chỉ là tìm kiếm + tự nộp đơn) mà nằm ở **liveness hai chiều**:
màn hình host tự hiện yêu cầu mới mà không cần refresh; host duyệt → màn hình người tìm tự chuyển sang
"được duyệt, mời thanh toán".

**Cơ chế:** **WebSocket** cho riêng module ghép kèo (nơi tức thì tạo giá trị demo). Các nơi khác của hệ thống
(thông báo booking, số dư) dùng **polling**. Đây là quyết định có chủ đích — xem mục 8.

### 4.3. Vòng đời và quy tắc

| Chủ đề | Quyết định |
|---|---|
| Trạng thái kèo | `công khai-đang mở` (nhận auto-match) · `đủ người` · `đóng` · `chỉ mời`. "Công khai hoàn toàn" = `công khai-đang mở`. |
| Lọc hai chiều | Auto-match phải thỏa **cả** bộ lọc người tìm **và** tiêu chí host (khoảng trình độ, số chỗ). Ai ngoài khoảng trình độ host → không thêm vào chờ (hoặc thêm nhưng gắn cờ đỏ). |
| Xếp hạng hàng chờ | Hàng chờ của host được sắp theo **điểm độ hợp F-02** (đây là chỗ F-01 + F-02 cắm vào). |
| Đua chỗ | **Không tự xác nhận.** Nhiều người vào hàng chờ; **host duyệt**. Chỗ chỉ khóa khi host duyệt + người đó thanh toán. |
| Thanh toán | Tự nộp → host duyệt → **giữ chỗ tạm 10 phút** (tái dùng hold của sân) → thanh toán → xác nhận. Hết 10 phút không trả → nhả chỗ cho người kế trong hàng chờ. |
| Nộp nhiều kèo | Một lần "Tìm nhanh" nộp vào **nhiều kèo phù hợp**. Kèo nào được host duyệt **và** người tìm **thanh toán trước** thì thắng; hệ thống **tự rút** yêu cầu ở các kèo còn lại. |
| Chống spam | Mỗi người **một phiên Tìm đang hoạt động**; bấm lại thì thay phiên cũ. |

### 4.4. Điểm kỷ luật kỹ thuật (chống-đặt-trùng)

Khi người tìm **thanh toán xong kèo A**, hệ thống phải thực hiện **nguyên tử** ba việc:
1. Khóa chỗ ở A.
2. Tự rút các yêu cầu đang chờ ở B, C…
3. Nếu host B vừa kịp duyệt → **nhả chỗ B về hàng chờ**.

Đây đúng là kỷ luật chống-đặt-trùng đã áp dụng cho slot sân (ràng buộc baseline #4), nên **tái dùng được**,
không phát sinh khái niệm mới.

### 4.5. Kịch bản demo live (30 giây)

Hai cửa sổ cạnh nhau.
1. **Cửa sổ người tìm:** bấm *Tìm nhanh*, chọn trình khá / <150k / <5km → "đã nộp vào 2 kèo phù hợp".
2. **Cửa sổ host** (không đụng chuột): ~tức thì, một dòng chờ mới hiện ra kèm *"Độ hợp 88% — cùng trình khá, cách 1.2km"*.
3. Host bấm **Duyệt** → cửa sổ người tìm tự chuyển "Được duyệt! Giữ chỗ 09:58… mời thanh toán".

Kể trọn mạch F-01 → F-02 → F-03 trong một cảnh.

**Cold-start:** có — dùng người chơi và kèo hiện có, không cần lịch sử.

---

## 5. F-04 — Gom nhóm lẻ cân bằng

**Vấn đề:** nhiều người muốn đánh nhưng lẻ, không đủ nhóm.

**Ý tưởng:** từ một hồ người chơi lẻ đang tìm, AI chia thành các nhóm **cân bằng trình độ** (dùng F-01).

**Vì sao ghi điểm:** đây là **bài toán tối ưu** (chia phân vùng cân bằng) — rất "đồ án", trình bày được thuật toán.
**Cold-start:** có (dùng hồ người đang chờ hiện tại; tốt hơn khi có dữ liệu trình độ).

---

## 6. F-05 — Bản đồ nhiệt nhu cầu & giờ vàng *(quân bài "wow", cần seed)*

**Ý tưởng:** đọc lịch sử booking (từ bộ seed mô phỏng) →
- **Cho người chơi:** *"sân này thường kín 19–21h, thử 17h rẻ hơn và dễ đặt."*
- **Cho chủ sân:** slot nào đang ế.

**Vì sao ghi điểm:** nối cả hai phía cung–cầu, trực quan đẹp khi demo.
**Cold-start:** không — **cần bộ seed**. Đây là tính năng phụ thuộc dữ liệu, chấp nhận rủi ro có kiểm soát
vì đã có seed. Nếu deadline căng, đây là tính năng **cắt được đầu tiên** mà không phá câu chuyện lõi.
**Trạng thái:** ⏸ hoãn — chưa chuẩn bị seed cho tới sau kỳ báo cáo tiến độ; các tính năng AI chưa đụng ở giai đoạn này.

---

## 7. F-07 — Trợ lý đánh giá công bằng sau trận

**Vấn đề:** đánh giá trả đũa làm hỏng độ tin cậy của Player Passport.

**Ý tưởng:** AI soạn tóm tắt trận + gợi ý mức đánh giá hợp lý; cảnh báo đánh giá bất thường (nghi trả đũa).

**Vì sao ghi điểm:** rẻ (LLM), chống lạm dụng, nối với kiểm duyệt; giữ Passport (F-01) sạch.
**Cold-start:** có.

---

## 8. Quyết định đã chốt trong phiên

| Quyết định | Nội dung | Ảnh hưởng baseline |
|---|---|---|
| Liveness | **WebSocket cho module ghép kèo**, polling cho phần còn lại. | **Sửa** ràng buộc "tránh hạ tầng realtime" của baseline — nhưng **giới hạn phạm vi** ở module ghép kèo, có chủ đích. |
| Nộp nhiều kèo | Nộp nhiều, **ai được duyệt + trả trước thắng**, tự rút phần còn lại. | Không đụng baseline; tái dùng cơ chế hold + chống-đặt-trùng. |
| Thang trình độ | 5 bậc hiển thị (Mới chơi/Y/TB/TB+/BC) + rating số có độ bất định (F-01). | Bổ sung chi tiết cho F-01. |
| Mô hình hoàn tiền SePay | SePay **không** có API hoàn tiền — xem mục 8.1. | Khớp ràng buộc baseline #5, #7, #9; không phát sinh khái niệm mới. |

### 8.1. Mô hình tài chính khi SePay không có API hoàn tiền

SePay chỉ là webhook lắng nghe biến động số dư (tiền vào/ra), không khởi tạo lệnh chuyển ngược. Do đó:

- **Hoàn tiền = ghi có vào số dư nội bộ.** Mọi khoản hoàn (hủy booking, lỗi sân, hủy kèo) chỉ là một bút toán
  ledger ghi có vào số dư người chơi — **tức thì, tự động, không cần SePay**. Tiền thật vẫn nằm trong tài khoản
  ngân hàng nền tảng; chỉ sổ nội bộ dịch chuyển. Không bao giờ chuyển ngược về ngân hàng.
- **Rút tiền = chuyển khoản tay + webhook tự đối soát.** Người bán yêu cầu rút → trạng thái `chờ chi` →
  Admin chuyển khoản tay từ tài khoản nền tảng → **SePay bắt biến động "tiền ra"** → hệ thống tự khớp số tiền +
  nội dung và chuyển sang `đã chi`, ghi ledger. Con người chỉ bấm chuyển khoản; xác nhận và đối soát là tự động.
- **API chi hộ/disbursement thật sự** (khởi tạo lệnh chi tự động) cần **API ngân hàng**, không phải SePay →
  để ở "Hướng phát triển", không làm trong đồ án.

> Lưu ý cho báo cáo: WebSocket là **lựa chọn cân nhắc chi phí có chủ đích** (chỉ ở nơi tức thì tạo giá trị),
> không phải mâu thuẫn với quyết định cắt chat realtime. Cần diễn đạt đúng như vậy để tránh hiểu nhầm khi bảo vệ.

---

## 9. Câu hỏi kỹ thuật cần chốt trước khi thiết kế chi tiết

Kế thừa từ baseline + phát sinh mới:

| Câu hỏi | Ảnh hưởng | Trạng thái |
|---|---|---|
| SePay hỗ trợ webhook/callback nào? Có API hoàn tiền không? | Luồng thanh toán/hoàn tiền của F-03 | ✅ Chốt — không có API hoàn tiền; dùng mô hình mục 8.1 |
| Thang trình độ cầu lông dùng hệ nào? | Input bắt buộc của F-01, F-02, F-04 | ✅ Chốt — 5 bậc lai, xem F-01 |
| Bộ seed mô phỏng gồm bao nhiêu user/booking/kèo, phân bố ra sao? | Chất lượng demo F-05 (và độ thuyết phục F-01) | ⏸ Hoãn đến sau báo cáo tiến độ |
| Ngưỡng "đánh giá bất thường" của F-07 định nghĩa thế nào? | Tránh false positive khi demo | Mở |

---

## 10. Ưu tiên nếu deadline căng

Thứ tự **giữ tới cùng → cắt trước**:

1. **Giữ chắc:** F-01, F-02, F-03 (mạch truyện lõi + ngôi sao demo). Không có ba cái này thì mất điểm nhấn.
2. **Nên có:** F-07 (rẻ), F-04 (bài toán tối ưu đẹp).
3. **Cắt đầu tiên nếu cần:** F-05 (phụ thuộc seed, wow nhưng không phá câu chuyện lõi nếu thiếu).
