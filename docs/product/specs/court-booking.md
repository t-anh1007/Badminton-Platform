---
type: functional-spec
module: court-booking
phase: 1
status: approved
updated: 2026-08-05
approved: 2026-08-05
---

# Functional Spec — `court-booking` (BOK)

10 chức năng, GĐ1. Nguồn: [phasing.md](../phasing.md) §3.3.

## 1. Actor

| Actor | Vai trò | Phạm vi |
|---|---|---|
| Khách | — | BOK-01, BOK-02, BOK-03, BOK-04 — xem được nhưng không đặt được |
| Người chơi | `player` | BOK-05 … BOK-09 |
| Nhà cung cấp sân | `player` + `provider` | BOK-10 trên cơ sở của chính mình. Đặt sân của người khác thì dùng vai `player` như mọi người. |

## 2. Business rules dùng chung

| Mã | Quy tắc |
|---|---|
| BR-BOK-01 | Chỉ cơ sở thỏa `BR-VEN-03` mới xuất hiện trong tìm kiếm và mới đặt được. |
| BR-BOK-02 | Slot được giữ đúng 10 phút kể từ lúc tạo `HOLD`. Hết hạn thì tự giải phóng, không cần thao tác của ai. Ràng buộc bất biến #2. |
| BR-BOK-03 | Không tồn tại hai booking `confirmed` trùng `(courtId, timeRange)`. Thực thi bằng ràng buộc loại trừ ở tầng CSDL cộng khóa khi tạo hold, không chỉ kiểm tra ở tầng ứng dụng. Ràng buộc bất biến #4. |
| BR-BOK-04 | Booking chỉ chuyển `held → confirmed` khi `PaymentCompleted` về **trong lúc hold còn hạn**. Tiền về sau khi hold hết hạn thì booking không được phục hồi; khoản tiền ghi có vào ví cá nhân qua FIN-06. Ràng buộc bất biến #3 của baseline về thanh toán đến muộn. |
| BR-BOK-05 | **Chính sách hủy là thống nhất toàn nền tảng**, chủ sân không cấu hình được. Bậc thang tính theo khoảng cách từ thời điểm hủy tới **giờ bắt đầu ca**: từ 24 giờ trở lên hoàn 100%; từ 6 giờ đến dưới 24 giờ hoàn 50%; dưới 6 giờ không hoàn. **Quyết định D9, D10.** |
| BR-BOK-06 | `policySnapshot` lưu nguyên văn bậc thang đang hiệu lực tại thời điểm tạo booking. Nền tảng sửa chính sách về sau không áp ngược lên booking cũ. |
| BR-BOK-07 | Phần tiền không được hoàn thuộc về chủ sân, có trừ hoa hồng. Nền tảng không giữ riêng khoản này. Về mặt kế toán, phần này **không phải bút toán mới** mà là phần còn lại sau khi đảo, xem `BR-FIN-14`. **Quyết định D10.** |
| BR-BOK-13 | Slot được giải phóng khi hủy vẫn bán lại được, và **chủ sân giữ cả khoản không hoàn lẫn doanh thu từ lượt đặt mới**. Khoản không hoàn là bù đắp rủi ro slot ế, không phải thanh toán cho dịch vụ đã cung cấp; việc bán lại được hay không là may rủi. Hệ thống không theo dõi quan hệ giữa booking bị hủy và booking mới trên cùng slot. **Quyết định D14.** |
| BR-BOK-08 | Hủy do phía sân hoặc do lỗi nền tảng luôn hoàn **100%**, bất kể thời điểm hủy. Bậc thang BR-BOK-05 không áp dụng. |
| BR-BOK-09 | **Điều chỉnh booking** chỉ có nghĩa là chuyển sang sân con khác trong cùng cơ sở, **giữ nguyên khung giờ và giá**. Không đổi giờ, không đổi cơ sở, không cần người chơi đồng ý, chỉ cần thông báo. **Quyết định D12.** |
| BR-BOK-10 | Người chơi chỉ xem và hủy được booking của chính mình. Nhà cung cấp chỉ thao tác được trên booking thuộc cơ sở của mình. Kiểm tra ở tầng API. |
| BR-BOK-11 | Không tạo được hold hay booking cho khoảng thời gian đã trôi qua. |
| BR-BOK-12 | Booking nội bộ (`source=internal`, VEN-09) không thuộc phạm vi BOK-08 và BOK-09; người chơi không thấy và không hủy được nó. |

## 3. Trạng thái

**`BOOKING.status`** — khớp [data-model.md §6](../../architecture/data-model.md)

```
[*] ──(BOK-07 tạo)──> held
held ──(PaymentCompleted còn hạn hold)──> confirmed
held ──(hết hạn hold / người chơi bỏ)──> cancelled
confirmed ──(ca kết thúc)──> completed
confirmed ──(BOK-09 người chơi hủy / BOK-10 sân hủy)──> cancelled
```

`HOLD` không phải trạng thái của booking mà là một bản ghi riêng có `expiresAt`, bị quét
dọn bởi tác vụ nền. Điều chỉnh sân con (BOK-10) **không** đổi `status`, chỉ đổi `courtId`.

---

## 4. Chi tiết chức năng

### BOK-01 — Tìm sân bằng danh sách và bản đồ

| Trường | Nội dung |
|---|---|
| Actor chính | Khách hoặc người chơi |
| Mục tiêu nghiệp vụ | Tìm được sân khả dụng gần mình |
| User Story | Là người muốn chơi cầu lông, tôi muốn tìm sân theo vị trí trên danh sách và bản đồ, để chọn được chỗ tiện đường |
| Điều kiện trước | Không cần đăng nhập |
| Sự kiện kích hoạt | Mở trang tìm sân hoặc thay đổi vùng bản đồ |
| Workflow chính | 1. Hệ thống lấy vị trí người dùng hoặc nhận địa điểm nhập tay → 2. Truy vấn cơ sở thỏa BR-BOK-01 trong bán kính → 3. Hiển thị song song danh sách và chỉ dấu trên bản đồ → 4. Chọn một cơ sở để sang BOK-03 |
| Luồng thay thế | Từ chối chia sẻ vị trí: dùng địa điểm nhập tay, mặc định trung tâm thành phố |
| Luồng lỗi | Không có cơ sở nào trong bán kính → hiển thị trạng thái rỗng kèm gợi ý mở rộng bán kính; Dịch vụ bản đồ lỗi → vẫn hiển thị danh sách, bản đồ báo lỗi riêng |
| Business Rules | BR-BOK-01 |
| Trạng thái liên quan | — |
| Quyền hạn | Công khai |
| Dữ liệu vào | Vị trí hoặc địa điểm, bán kính |
| Dữ liệu ra | Danh sách cơ sở kèm tọa độ, khoảng cách, giá thấp nhất |
| Phụ thuộc | VEN-03 |
| Trong phạm vi | Tìm theo vị trí, hiển thị danh sách và bản đồ |
| Ngoài phạm vi | Gợi ý sân thông minh (đã loại ở `SCOPE_BASELINE` §3), tìm theo tên sân, lưu sân yêu thích |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-BOK-01-1` — **Given** có 3 cơ sở thỏa BR-BOK-01 trong bán kính và 1 cơ sở của nhà cung cấp đang bị khóa, **When** người dùng tìm sân, **Then** kết quả chỉ có 3 cơ sở, không có cơ sở bị khóa.
- `AC-BOK-01-2` — **Given** một cơ sở không có sân con nào đang hoạt động, **When** tìm sân, **Then** cơ sở đó không xuất hiện.
- `AC-BOK-01-3` — **Given** khách chưa đăng nhập, **When** mở trang tìm sân, **Then** kết quả hiển thị đầy đủ như người đã đăng nhập.
- `AC-BOK-01-4` — **Given** không có cơ sở nào trong bán kính, **When** tìm sân, **Then** hiển thị trạng thái rỗng chứ không phải lỗi.

**Tiêu chí kiểm chứng:** kiểm thử tự động 4 AC; AC-BOK-01-1 là kiểm thử tích hợp có dựng sẵn một nhà cung cấp bị khóa.

---

### BOK-02 — Lọc và sắp xếp sân

| Trường | Nội dung |
|---|---|
| Actor chính | Khách hoặc người chơi |
| Mục tiêu nghiệp vụ | Thu hẹp kết quả về đúng cái người dùng cần |
| User Story | Là người tìm sân, tôi muốn lọc theo giá, khoảng cách, tiện ích và khung giờ còn trống, để không phải mở từng sân một |
| Điều kiện trước | Đã có kết quả từ BOK-01 |
| Sự kiện kích hoạt | Áp dụng bộ lọc hoặc đổi tiêu chí sắp xếp |
| Workflow chính | 1. Chọn khoảng giá, bán kính, tiện ích, ngày và khung giờ mong muốn → 2. Hệ thống lọc trên tập kết quả → 3. Sắp xếp theo khoảng cách hoặc giá → 4. Cập nhật đồng thời danh sách và bản đồ |
| Luồng thay thế | Xóa toàn bộ bộ lọc, quay về kết quả gốc |
| Luồng lỗi | Bộ lọc không còn kết quả nào → trạng thái rỗng kèm nút xóa lọc |
| Business Rules | BR-BOK-01 |
| Trạng thái liên quan | — |
| Quyền hạn | Công khai |
| Dữ liệu vào | Khoảng giá, bán kính, tiện ích, ngày, khung giờ, tiêu chí sắp xếp |
| Dữ liệu ra | Tập kết quả đã lọc và sắp xếp |
| Phụ thuộc | BOK-01 |
| Trong phạm vi | Lọc theo giá, khoảng cách, tiện ích, còn trống; sắp xếp theo giá hoặc khoảng cách |
| Ngoài phạm vi | Lọc theo đánh giá sân (không có đánh giá booking ở GĐ1 — quyết định D7), lọc theo khuyến mãi |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-BOK-02-1` — **Given** tập kết quả có sân giá 80k và 200k, **When** lọc khoảng giá tới 100k, **Then** chỉ sân 80k còn lại.
- `AC-BOK-02-2` — **Given** người dùng lọc theo khung giờ 19h–21h ngày mai, **When** áp dụng, **Then** chỉ các cơ sở còn ít nhất một sân trống trọn khung đó xuất hiện.
- `AC-BOK-02-3` — **Given** đang có bộ lọc cho ra tập rỗng, **When** người dùng xóa lọc, **Then** kết quả gốc của BOK-01 hiện lại đầy đủ.

**Tiêu chí kiểm chứng:** kiểm thử tự động 3 AC.

---

### BOK-03 — Xem chi tiết cơ sở sân

| Trường | Nội dung |
|---|---|
| Actor chính | Khách hoặc người chơi |
| Mục tiêu nghiệp vụ | Cung cấp đủ thông tin để quyết định đặt |
| User Story | Là người tìm sân, tôi muốn xem ảnh, địa chỉ, tiện ích và danh sách sân con của một cơ sở, để biết chỗ đó có phù hợp không |
| Điều kiện trước | Cơ sở thỏa BR-BOK-01 |
| Sự kiện kích hoạt | Mở một cơ sở từ kết quả tìm kiếm |
| Workflow chính | 1. Hiển thị tên, ảnh, địa chỉ, vị trí bản đồ, tiện ích → 2. Liệt kê sân con đang hoạt động → 3. Khi chọn sân con, hiển thị 1–5 ảnh riêng cùng giờ hoạt động và khoảng giá → 4. Nút chuyển sang BOK-04 |
| Luồng thay thế | Mở trực tiếp bằng đường dẫn mà không qua tìm kiếm |
| Luồng lỗi | Cơ sở không còn thỏa BR-BOK-01 tại thời điểm mở → hiển thị thông báo không khả dụng thay vì lỗi kỹ thuật |
| Business Rules | BR-BOK-01 |
| Trạng thái liên quan | — |
| Quyền hạn | Công khai |
| Dữ liệu vào | Mã cơ sở |
| Dữ liệu ra | Hồ sơ cơ sở, danh sách sân con, giờ hoạt động, khoảng giá |
| Phụ thuộc | VEN-03, VEN-04 |
| Trong phạm vi | Xem thông tin cơ sở |
| Ngoài phạm vi | Bình luận về cơ sở, đánh giá sân, hỏi đáp với chủ sân |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-BOK-03-1` — **Given** một cơ sở có 3 sân con trong đó 1 sân `active=false`, **When** xem chi tiết, **Then** chỉ 2 sân đang hoạt động được liệt kê.
- `AC-BOK-03-2` — **Given** một cơ sở vừa bị ẩn do chủ tài khoản bị khóa, **When** mở đường dẫn trực tiếp tới cơ sở đó, **Then** hiển thị thông báo không khả dụng.
- `AC-BOK-03-3` — **Given** người chơi chọn một sân con, **When** xem hoặc bắt đầu đặt sân, **Then** hiển thị bộ ảnh riêng của đúng sân con đó.

**Tiêu chí kiểm chứng:** kiểm thử tự động 2 AC.

---

### BOK-04 — Xem lịch trống và giá hiện hành

| Trường | Nội dung |
|---|---|
| Actor chính | Khách hoặc người chơi |
| Mục tiêu nghiệp vụ | Cho biết chính xác khung nào còn đặt được và giá bao nhiêu |
| User Story | Là người tìm sân, tôi muốn xem lịch trống theo ngày kèm giá từng khung giờ, để chọn được giờ hợp túi tiền |
| Điều kiện trước | Cơ sở có sân con hoạt động, có giờ hoạt động và biểu giá |
| Sự kiện kích hoạt | Chọn ngày trên trang chi tiết cơ sở |
| Workflow chính | 1. Chọn ngày → 2. Hệ thống dựng lưới khung giờ theo bước thời gian của từng sân → 3. Đánh dấu khung đã có booking `confirmed` hoặc `HOLD` chưa hết hạn là không khả dụng → 4. Ẩn khung ngoài giờ hoạt động và ngày đóng cửa → 5. Hiển thị đơn giá từng khung theo BR-VEN-07 |
| Luồng thay thế | Xem ngày trong tương lai xa: hiển thị bình thường trong giới hạn cho phép |
| Luồng lỗi | Ngày đã qua → không cho chọn theo BR-BOK-11; Ngày đóng cửa → hiển thị nhãn đóng cửa, không phải lưới rỗng |
| Business Rules | BR-BOK-01, BR-BOK-02, BR-BOK-11; BR-VEN-05, BR-VEN-06, BR-VEN-07 |
| Trạng thái liên quan | Đọc `BOOKING.status` và `HOLD` |
| Quyền hạn | Công khai |
| Dữ liệu vào | Mã cơ sở, ngày |
| Dữ liệu ra | Lưới khung giờ theo sân, kèm trạng thái khả dụng và đơn giá |
| Phụ thuộc | VEN-05, VEN-06, VEN-07, VEN-09 |
| Trong phạm vi | Lịch trống và giá theo ngày |
| Ngoài phạm vi | Gợi ý giờ rẻ hoặc bản đồ nhiệt nhu cầu (F-05, đã hoãn) |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-BOK-04-1` — **Given** một sân mở 6h–22h với bước 30 phút, **When** xem lịch một ngày trống, **Then** lưới hiển thị đủ các khung từ 6h tới 22h và không có khung nào ngoài khoảng đó.
- `AC-BOK-04-2` — **Given** khung 19h có booking `confirmed`, **When** xem lịch, **Then** khung đó hiển thị là không khả dụng.
- `AC-BOK-04-3` — **Given** khung 20h đang có `HOLD` của người khác chưa hết hạn, **When** xem lịch, **Then** khung đó hiển thị là không khả dụng.
- `AC-BOK-04-4` — **Given** cùng khung 20h đó và hold vừa hết hạn, **When** tải lại lịch, **Then** khung đó trở lại khả dụng.
- `AC-BOK-04-5` — **Given** một booking nội bộ do chủ sân ghi tại quầy lúc 18h, **When** người chơi xem lịch, **Then** khung 18h hiển thị là không khả dụng.
- `AC-BOK-04-6` — **Given** ngày được chọn nằm trong danh sách đóng cửa, **When** xem lịch ngày đó, **Then** hiển thị nhãn đóng cửa cho toàn ngày.

**Tiêu chí kiểm chứng:** kiểm thử tự động 6 AC; AC-BOK-04-4 dùng đồng hồ giả lập để vượt qua mốc 10 phút.

---

### BOK-05 — Chọn slot và thời lượng đặt sân

| Trường | Nội dung |
|---|---|
| Actor chính | Người chơi |
| Mục tiêu nghiệp vụ | Xác định chính xác sân, giờ bắt đầu và thời lượng trước khi giữ chỗ |
| User Story | Là người chơi, tôi muốn chọn sân, giờ bắt đầu và thời lượng, để biết tổng tiền trước khi cam kết |
| Điều kiện trước | Đã đăng nhập; có khung khả dụng ở BOK-04 |
| Sự kiện kích hoạt | Chọn một khung giờ trên lưới |
| Workflow chính | 1. Chọn sân và giờ bắt đầu → 2. Chọn thời lượng trong khoảng cho phép theo BR-VEN-10 → 3. Hệ thống kiểm tra toàn bộ khoảng còn khả dụng → 4. Tính tổng tiền theo BR-VEN-07, cộng dồn nếu bắc qua nhiều khung giá → 5. Hiển thị tóm tắt và tổng tiền |
| Luồng thay thế | Đổi thời lượng: tính lại tổng tiền tức thì |
| Luồng lỗi | Chưa đăng nhập → điều hướng sang ACC-03 rồi quay lại đúng lựa chọn; Thời lượng không hợp lệ → chặn ở giao diện và ở API; Khoảng chọn chạm vào khung đã bận → báo và gợi ý khung gần nhất |
| Business Rules | BR-BOK-11; BR-VEN-07, BR-VEN-10 |
| Trạng thái liên quan | — |
| Quyền hạn | Cần đăng nhập |
| Dữ liệu vào | Mã sân, giờ bắt đầu, thời lượng |
| Dữ liệu ra | Tóm tắt lựa chọn và tổng tiền |
| Phụ thuộc | BOK-04, VEN-07, ACC-03 |
| Trong phạm vi | Chọn slot liền mạch trên một sân |
| Ngoài phạm vi | Đặt nhiều sân cùng lúc, đặt lặp hàng tuần (đã loại ở `SCOPE_BASELINE` §3), đặt nhiều khung rời rạc trong một lượt |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-BOK-05-1` — **Given** sân có bước 30 phút, tối thiểu 60, tối đa 180, **When** người chơi chọn thời lượng 90 phút, **Then** hệ thống chấp nhận và hiển thị tổng tiền.
- `AC-BOK-05-2` — **Given** cùng sân đó, **When** gọi thẳng API với thời lượng 45 phút, **Then** hệ thống từ chối.
- `AC-BOK-05-3` — **Given** booking 18h–20h bắc qua khung giá 100k/giờ và 150k/giờ, **When** hệ thống tính tiền, **Then** tổng hiển thị là 250k.
- `AC-BOK-05-4` — **Given** khoảng chọn 19h–21h nhưng 20h–20h30 đã có booking, **When** người chơi xác nhận lựa chọn, **Then** hệ thống từ chối và chỉ ra đoạn bị vướng.
- `AC-BOK-05-5` — **Given** khách chưa đăng nhập, **When** chọn một khung giờ, **Then** hệ thống điều hướng sang đăng nhập và giữ nguyên lựa chọn sau khi quay lại.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC.

---

### BOK-06 — Giữ slot trong 10 phút

| Trường | Nội dung |
|---|---|
| Actor chính | Người chơi |
| Mục tiêu nghiệp vụ | Dành riêng slot đủ lâu để người chơi hoàn tất thanh toán mà không bị người khác cướp mất |
| User Story | Là người chơi, tôi muốn slot mình chọn được giữ trong lúc thanh toán, để không mất chỗ giữa chừng |
| Điều kiện trước | Đã chọn slot hợp lệ ở BOK-05 |
| Sự kiện kích hoạt | Xác nhận lựa chọn để chuyển sang thanh toán |
| Workflow chính | 1. Hệ thống lấy khóa trên sân và khoảng thời gian → 2. Kiểm tra lại lần cuối không có booking `confirmed` hay `HOLD` nào chồng lấn → 3. Tạo `HOLD` với `expiresAt` bằng hiện tại cộng 10 phút → 4. Nhả khóa → 5. Hiển thị đồng hồ đếm ngược và chuyển sang thanh toán |
| Luồng thay thế | Người chơi bỏ giữa chừng: hold vẫn sống tới khi hết hạn rồi tự giải phóng. Người chơi đổi ý sang slot khác: hold cũ được giải phóng và hold mới được tạo trong cùng một giao dịch nguyên tử |
| Luồng lỗi | Hai người bấm cùng lúc → đúng một người tạo được hold, người còn lại nhận báo slot vừa có người giữ |
| Business Rules | BR-BOK-02, BR-BOK-03, BR-BOK-11 |
| Trạng thái liên quan | Tạo `HOLD`; chưa sinh `BOOKING` |
| Quyền hạn | Cần đăng nhập |
| Dữ liệu vào | Mã sân, khoảng thời gian |
| Dữ liệu ra | Hold kèm thời điểm hết hạn |
| Phụ thuộc | BOK-05 |
| Trong phạm vi | Giữ chỗ 10 phút, tự giải phóng khi hết hạn |
| Ngoài phạm vi | Gia hạn hold, giữ chỗ có phí, hàng đợi chờ slot |
| Sơ đồ cần vẽ | Sequence đặt sân và thanh toán; sơ đồ hoạt động cho tranh chấp đồng thời |

**Acceptance Criteria**

- `AC-BOK-06-1` — **Given** một slot khả dụng, **When** người chơi giữ chỗ, **Then** một `HOLD` được tạo với `expiresAt` đúng 10 phút sau và slot biến mất khỏi lịch trống của người khác.
- `AC-BOK-06-2` — **Given** hai người chơi gửi yêu cầu giữ cùng một slot **đồng thời**, **When** hệ thống xử lý, **Then** đúng một hold được tạo và người còn lại nhận thông báo slot vừa có người giữ.
- `AC-BOK-06-3` — **Given** một hold đã quá 10 phút và chưa thanh toán, **When** tác vụ nền chạy hoặc người khác truy vấn lịch, **Then** slot trở lại khả dụng.
- `AC-BOK-06-4` — **Given** người chơi đang có một hold chưa hết hạn ở slot A, **When** họ giữ chỗ slot B, **Then** hold ở slot A được giải phóng và hold ở slot B được tạo trong cùng một giao dịch; tại mọi thời điểm người chơi đó có tối đa một hold, và slot A trở lại khả dụng ngay.
- `AC-BOK-06-5` — **Given** một slot đã có booking `confirmed`, **When** gọi thẳng API tạo hold cho slot đó, **Then** hệ thống từ chối.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC. AC-BOK-06-2 là **kiểm thử đồng thời bắt buộc**, chạy nhiều yêu cầu song song và khẳng định đúng một hold tồn tại — đây là bằng chứng cho ràng buộc bất biến #4.

---

### BOK-07 — Tạo booking đặt sân

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Người chơi / `finance-service` |
| Mục tiêu nghiệp vụ | Biến một slot đang giữ thành booking đã xác nhận sau khi tiền về |
| User Story | Là người chơi, tôi muốn hoàn tất đặt sân sau khi thanh toán, để chắc chắn có chỗ chơi |
| Điều kiện trước | Đang có `HOLD` hợp lệ chưa hết hạn |
| Sự kiện kích hoạt | Người chơi chọn phương thức thanh toán và trả tiền |
| Workflow chính | 1. Tạo `BOOKING(status=held)` gắn với hold, chốt `priceSnapshot` và `policySnapshot` → 2. Chuyển sang FIN-03 hoặc FIN-04 → 3. Nhận sự kiện `PaymentCompleted` → 4. Kiểm tra hold còn hạn → 5. Chuyển `status=confirmed`, xóa hold → 6. Phát `BookingConfirmed` để finance ghi doanh thu `pending` và bắt đầu đếm 24 giờ |
| Luồng thay thế | Trả bằng số dư (FIN-03): tiền trừ tức thì nên bước 3 xảy ra ngay. Trả qua SePay (FIN-04): chờ webhook, có thể mất vài phút |
| Luồng lỗi | `PaymentCompleted` về sau khi hold hết hạn → booking chuyển `cancelled`, tiền ghi có ví cá nhân qua FIN-06, **không phục hồi booking**; Số dư không đủ → quay lại chọn phương thức, hold vẫn chạy; Người chơi không trả tới khi hết hold → booking `cancelled`, slot giải phóng |
| Business Rules | BR-BOK-02, BR-BOK-03, BR-BOK-04, BR-BOK-06 |
| Trạng thái liên quan | `BOOKING: [*] → held → confirmed \| cancelled` |
| Quyền hạn | Chỉ chủ hold |
| Dữ liệu vào | Mã hold, phương thức thanh toán |
| Dữ liệu ra | Booking đã xác nhận; sự kiện `BookingConfirmed` |
| Phụ thuộc | BOK-06, FIN-03, FIN-04 |
| Trong phạm vi | Tạo booking, xác nhận theo thanh toán, xử lý tiền về muộn |
| Ngoài phạm vi | Đặt cọc, trả tại sân (đã loại ở `SCOPE_BASELINE` §3), trả góp |
| Sơ đồ cần vẽ | Sequence saga đặt sân và thanh toán, gồm cả nhánh tiền về muộn |

**Acceptance Criteria**

- `AC-BOK-07-1` — **Given** một hold còn hạn và người chơi đủ số dư, **When** thanh toán bằng số dư, **Then** booking chuyển `confirmed`, hold bị xóa, và sự kiện `BookingConfirmed` được phát đúng một lần.
- `AC-BOK-07-2` — **Given** một hold đã hết hạn, **When** `PaymentCompleted` về cho booking đó, **Then** booking ở trạng thái `cancelled`, không chuyển sang `confirmed`, và khoản tiền được ghi có vào ví cá nhân của người chơi.
- `AC-BOK-07-3` — **Given** một booking vừa `confirmed` với giá 250k, **When** chủ sân đổi biểu giá ngay sau đó, **Then** `priceSnapshot` của booking vẫn là 250k.
- `AC-BOK-07-4` — **Given** sự kiện `PaymentCompleted` bị phát lại hai lần, **When** `venue-booking-service` xử lý, **Then** booking chỉ chuyển trạng thái một lần và không sinh sự kiện `BookingConfirmed` thứ hai.
- `AC-BOK-07-5` — **Given** người chơi xác nhận đặt sân thành công, **When** booking `held` được tạo, **Then** UI chuyển payment terminal, khóa lựa chọn và đếm ngược từ `holdExpiresAt` do backend trả về.
- `AC-BOK-07-5` — **Given** người chơi không thanh toán cho tới khi hold hết hạn, **When** tác vụ nền chạy, **Then** booking chuyển `cancelled` và slot trở lại khả dụng.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC. AC-BOK-07-2 và AC-BOK-07-4 là kiểm thử tích hợp qua hàng đợi sự kiện; AC-BOK-07-4 chứng minh consumer idempotent.

---

### BOK-08 — Xem chi tiết và lịch sử booking

| Trường | Nội dung |
|---|---|
| Actor chính | Người chơi |
| Mục tiêu nghiệp vụ | Cho người chơi biết mình đã đặt gì, khi nào, trả bao nhiêu |
| User Story | Là người chơi, tôi muốn xem các booking sắp tới và đã qua kèm số tiền đã trả, để theo dõi lịch chơi và chi tiêu |
| Điều kiện trước | Đã đăng nhập |
| Sự kiện kích hoạt | Mở trang booking của tôi |
| Workflow chính | 1. Hiển thị hai nhóm: sắp tới và đã qua → 2. Mỗi dòng gồm cơ sở, sân, khung giờ, trạng thái, số tiền đã trả → 3. Mở một booking để xem chi tiết gồm chính sách hủy đang áp và mức hoàn dự kiến nếu hủy bây giờ |
| Luồng thay thế | Booking đã bị hủy: hiển thị số tiền đã hoàn và lý do hủy |
| Luồng lỗi | Chưa có booking nào → trạng thái rỗng kèm nút tìm sân |
| Business Rules | BR-BOK-05, BR-BOK-06, BR-BOK-10, BR-BOK-12 |
| Trạng thái liên quan | Đọc `BOOKING.status` |
| Quyền hạn | Chỉ booking của chính mình |
| Dữ liệu vào | — |
| Dữ liệu ra | Danh sách booking, chi tiết một booking, mức hoàn dự kiến |
| Phụ thuộc | BOK-07 |
| Trong phạm vi | Xem booking của chính mình, xem mức hoàn dự kiến |
| Ngoài phạm vi | Xuất hóa đơn, chia sẻ booking, đánh giá sân sau khi chơi (quyết định D7) |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-BOK-08-1` — **Given** người chơi có 2 booking sắp tới và 3 booking đã qua, **When** mở trang booking, **Then** cả 5 hiển thị đúng nhóm.
- `AC-BOK-08-2` — **Given** một booking bắt đầu sau 30 giờ nữa, **When** người chơi mở chi tiết, **Then** mức hoàn dự kiến hiển thị là 100%.
- `AC-BOK-08-3` — **Given** một booking bắt đầu sau 10 giờ nữa, **When** mở chi tiết, **Then** mức hoàn dự kiến hiển thị là 50%.
- `AC-BOK-08-4` — **Given** người chơi A, **When** gọi API xem booking của người chơi B, **Then** hệ thống từ chối.
- `AC-BOK-08-5` — **Given** một cơ sở có booking nội bộ do chủ sân ghi, **When** bất kỳ người chơi nào mở trang booking của mình, **Then** booking nội bộ đó không xuất hiện.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC.

---

### BOK-09 — Hủy booking

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Người chơi / `finance-service`, nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Cho người chơi rút lui với mức hoàn tiền công bằng và biết trước |
| User Story | Là người chơi, tôi muốn hủy booking và biết trước mình được hoàn bao nhiêu, để quyết định có hủy hay không |
| Điều kiện trước | Booking ở trạng thái `confirmed`, ca chưa bắt đầu |
| Sự kiện kích hoạt | Người chơi xác nhận hủy |
| Workflow chính | 1. Hệ thống tính mức hoàn theo `policySnapshot` và khoảng cách tới giờ bắt đầu → 2. Hiển thị số tiền hoàn để người chơi xác nhận → 3. Chuyển `status=cancelled`, giải phóng slot → 4. Phát `BookingCancelled` kèm mức hoàn → 5. Finance ghi có ví cá nhân phần hoàn và ghi doanh thu chủ sân phần không hoàn |
| Luồng thay thế | Mức hoàn bằng 0: vẫn cho hủy, nêu rõ không được hoàn, slot vẫn giải phóng để chủ sân có cơ hội bán lại |
| Luồng lỗi | Ca đã bắt đầu → không cho hủy; Booking không ở `confirmed` → từ chối; Hủy hai lần do bấm trùng → lần thứ hai không sinh thêm bút toán nào |
| Business Rules | BR-BOK-05, BR-BOK-06, BR-BOK-07, BR-BOK-10 |
| Trạng thái liên quan | `BOOKING: confirmed → cancelled` |
| Quyền hạn | Chỉ chủ booking |
| Dữ liệu vào | Mã booking |
| Dữ liệu ra | Booking đã hủy; bút toán hoàn tiền; bút toán doanh thu phần không hoàn |
| Phụ thuộc | BOK-07, FIN-07 |
| Trong phạm vi | Hủy toàn bộ booking |
| Ngoài phạm vi | Hủy một phần thời lượng, dời lịch, nhượng booking cho người khác |
| Sơ đồ cần vẽ | Sequence hủy và hoàn tiền theo bậc thang |

**Acceptance Criteria**

- `AC-BOK-09-1` — **Given** booking 200k bắt đầu sau 30 giờ nữa, **When** người chơi hủy, **Then** 200k được ghi có vào ví cá nhân và chủ sân không nhận đồng nào.
- `AC-BOK-09-2` — **Given** booking 200k bắt đầu sau 10 giờ nữa, **When** người chơi hủy, **Then** 100k ghi có ví cá nhân và 100k ghi vào doanh thu chủ sân sau khi trừ hoa hồng.
- `AC-BOK-09-3` — **Given** booking 200k bắt đầu sau 2 giờ nữa, **When** người chơi hủy, **Then** không có khoản nào hoàn về ví cá nhân và toàn bộ 200k ghi vào doanh thu chủ sân sau khi trừ hoa hồng.
- `AC-BOK-09-4` — **Given** một booking vừa bị hủy, **When** người khác xem lịch trống khung đó, **Then** slot đã trở lại khả dụng.
- `AC-BOK-09-5` — **Given** ca đã bắt đầu, **When** người chơi thử hủy, **Then** hệ thống từ chối.
- `AC-BOK-09-6` — **Given** nền tảng đã sửa bậc thang hoàn tiền sau khi booking được tạo, **When** người chơi hủy booking cũ đó, **Then** mức hoàn tính theo `policySnapshot` chứ không theo chính sách mới.
- `AC-BOK-09-7` — **Given** người chơi bấm hủy hai lần liên tiếp, **When** hệ thống xử lý, **Then** chỉ một bộ bút toán được sinh ra.

**Tiêu chí kiểm chứng:** kiểm thử tự động 7 AC. AC-BOK-09-1 đến 09-3 phải kiểm tra trực tiếp trên `LEDGER_ENTRY` chứ không chỉ trên số dư hiển thị.

---

### BOK-10 — Điều chỉnh hoặc hủy booking do phía sân

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Nhà cung cấp sân, hoặc Admin thay mặt / người chơi, `finance-service` |
| Mục tiêu nghiệp vụ | Cho phía sân xử lý sự cố vận hành mà không đẩy thiệt hại sang người chơi |
| User Story | Là nhà cung cấp sân, tôi muốn chuyển khách sang sân khác khi một sân gặp sự cố, hoặc hủy và hoàn đủ tiền nếu không còn sân nào, để giữ uy tín |
| Điều kiện trước | Booking `confirmed` thuộc cơ sở của mình, ca chưa bắt đầu |
| Sự kiện kích hoạt | Nhà cung cấp chọn điều chỉnh hoặc hủy |
| Workflow chính (điều chỉnh) | 1. Chọn booking → 2. Hệ thống liệt kê sân con cùng cơ sở còn trống trọn khung giờ đó → 3. Chọn sân thay thế → 4. Đổi `courtId`, giữ nguyên khung giờ, `priceSnapshot`, `policySnapshot` và `status` → 5. Thông báo cho người chơi |
| Workflow phụ (hủy) | 1. Chọn hủy, nhập lý do bắt buộc → 2. `status=cancelled`, giải phóng slot → 3. Phát `BookingCancelled` với cờ lỗi phía sân → 4. Finance hoàn **100%** vào ví cá nhân người chơi, chủ sân không nhận gì |
| Luồng thay thế | Không còn sân trống nào cùng khung giờ: hệ thống chỉ cho phép hủy, không cho điều chỉnh |
| Luồng lỗi | Điều chỉnh sang sân đang bận → từ chối; Hủy mà không nhập lý do → từ chối; Ca đã bắt đầu → từ chối cả hai thao tác |
| Business Rules | BR-BOK-03, BR-BOK-08, BR-BOK-09, BR-BOK-10 |
| Trạng thái liên quan | Điều chỉnh không đổi `status`; hủy chuyển `confirmed → cancelled` |
| Quyền hạn | Chỉ nhà cung cấp sở hữu cơ sở, hoặc Admin |
| Dữ liệu vào | Mã booking; sân thay thế hoặc lý do hủy |
| Dữ liệu ra | Booking đã đổi sân hoặc đã hủy; bút toán hoàn 100% nếu hủy |
| Phụ thuộc | BOK-07, FIN-08 |
| Trong phạm vi | Đổi sân con cùng khung giờ; hủy kèm hoàn 100% |
| Ngoài phạm vi | Đổi giờ, đổi cơ sở, đổi giá, thương lượng với người chơi (quyết định D12) |
| Sơ đồ cần vẽ | Sơ đồ hoạt động: điều chỉnh hoặc hủy do phía sân |

**Acceptance Criteria**

- `AC-BOK-10-1` — **Given** một booking trên sân 1 và sân 3 còn trống trọn khung giờ đó, **When** nhà cung cấp chuyển booking sang sân 3, **Then** `courtId` đổi, khung giờ và `priceSnapshot` giữ nguyên, `status` vẫn là `confirmed`, và không có bút toán nào phát sinh.
- `AC-BOK-10-2` — **Given** không còn sân con nào trống trọn khung giờ đó, **When** nhà cung cấp mở chức năng điều chỉnh, **Then** hệ thống không đưa ra lựa chọn nào và chỉ cho phép hủy.
- `AC-BOK-10-3` — **Given** một booking 200k bắt đầu sau 2 giờ nữa, **When** nhà cung cấp hủy kèm lý do, **Then** toàn bộ 200k được hoàn vào ví cá nhân người chơi và chủ sân không nhận đồng nào, bất kể bậc thang BR-BOK-05.
- `AC-BOK-10-4` — **Given** nhà cung cấp bỏ trống lý do, **When** xác nhận hủy, **Then** hệ thống từ chối.
- `AC-BOK-10-5` — **Given** nhà cung cấp A, **When** gọi API điều chỉnh booking thuộc cơ sở của nhà cung cấp B, **Then** hệ thống từ chối.
- `AC-BOK-10-6` — **Given** một booking đã được chuyển sang sân 3, **When** người chơi mở chi tiết booking, **Then** thông tin sân hiển thị là sân 3 và có ghi chú về việc đổi sân.

**Tiêu chí kiểm chứng:** kiểm thử tự động 6 AC. AC-BOK-10-3 kiểm tra trực tiếp `LEDGER_ENTRY` để chứng minh không có bút toán doanh thu nào cho chủ sân.

---

## 5. Ma trận truy vết

| Mã | User Story | AC | Workflow / sơ đồ |
|---|---|---|---|
| BOK-01 | Tìm sân theo vị trí | AC-BOK-01-1…4 | — |
| BOK-02 | Lọc và sắp xếp | AC-BOK-02-1…3 | — |
| BOK-03 | Xem chi tiết cơ sở | AC-BOK-03-1…2 | — |
| BOK-04 | Lịch trống và giá | AC-BOK-04-1…6 | — |
| BOK-05 | Chọn slot và thời lượng | AC-BOK-05-1…5 | — |
| BOK-06 | Giữ slot 10 phút | AC-BOK-06-1…5 | Sequence đặt sân; activity tranh chấp đồng thời |
| BOK-07 | Tạo booking | AC-BOK-07-1…5 | Sequence saga đặt sân và thanh toán |
| BOK-08 | Xem booking của tôi | AC-BOK-08-1…5 | — |
| BOK-09 | Hủy booking | AC-BOK-09-1…7 | Sequence hủy và hoàn tiền |
| BOK-10 | Điều chỉnh hoặc hủy do phía sân | AC-BOK-10-1…6 | Activity điều chỉnh hoặc hủy |

## 6. Giả định cần duyệt

| # | Giả định | Rủi ro |
|---|---|---|
| A-BOK-01 | Một người chơi chỉ có tối đa **một hold đang hoạt động**. Khi họ chọn slot mới, hệ thống **giải phóng hold cũ và tạo hold mới trong cùng một giao dịch nguyên tử** thay vì từ chối — người dùng đổi ý không phải chờ hết 10 phút | **Trung bình — chạm chính sách.** Ngăn giữ chỗ hàng loạt mà vẫn cho đổi lựa chọn tự do |
| A-BOK-02 | Mốc tính bậc thang hoàn tiền là **giờ bắt đầu ca**, không phải giờ kết thúc | Trung bình — ảnh hưởng số tiền hoàn |
| A-BOK-03 | Không đặt được sân quá **30 ngày** kể từ hôm nay | Thấp — tham số |
| A-BOK-04 | Bán kính tìm kiếm mặc định **10 km**, người dùng đổi được | Thấp — tham số |
| A-BOK-05 | Lịch sử booking giữ vĩnh viễn, phân trang | Thấp |
| A-BOK-06 | Điều chỉnh sân con chỉ làm được **trước giờ bắt đầu ca** | Thấp |
| A-BOK-07 | Người chơi hủy khi mức hoàn bằng 0 thì slot **vẫn được giải phóng** để chủ sân có cơ hội bán lại | Thấp — có lợi cho cả hai bên |

## 7. Câu hỏi còn mở

Không có.
