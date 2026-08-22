---
type: functional-spec
module: venue-scheduling
phase: 1
status: approved
updated: 2026-08-05
approved: 2026-08-05
---

# Functional Spec — `venue-scheduling` (VEN)

9 chức năng, GĐ1. Nguồn: [phasing.md](../phasing.md) §3.2.

## 1. Actor

| Actor | Vai trò | Phạm vi |
|---|---|---|
| Người chơi | `player` | Nộp hồ sơ VEN-01 |
| Nhà cung cấp sân | `player` + `provider` | VEN-03 … VEN-09, giới hạn trong cơ sở của chính mình |
| Admin | `admin` | VEN-02 |

## 2. Business rules dùng chung

| Mã | Quy tắc |
|---|---|
| BR-VEN-01 | Một tài khoản có tối đa một hồ sơ nhà cung cấp. Một nhà cung cấp có nhiều cơ sở, mỗi cơ sở có nhiều sân con. |
| BR-VEN-02 | Chỉ hồ sơ nhà cung cấp ở trạng thái `approved` mới tạo hay sửa được cơ sở, sân con, giờ hoạt động, biểu giá, quy tắc đặt sân. |
| BR-VEN-03 | Một cơ sở chỉ xuất hiện trong tìm kiếm (BOK-01) khi thỏa **tất cả**: hồ sơ nhà cung cấp `approved`, tài khoản chủ sở hữu `active`, cơ sở có ít nhất một sân con đang hoạt động, sân đó có giờ hoạt động, và có biểu giá phủ khung giờ đang xét. |
| BR-VEN-04 | Nền tảng là nguồn lịch chính thức duy nhất. Booking ghi tại quầy (VEN-09) khóa lịch y hệt booking từ nền tảng. Ràng buộc bất biến #3. |
| BR-VEN-05 | Không được lưu thay đổi giờ hoạt động, ngày đóng cửa, hoặc vô hiệu hóa sân con nếu khoảng thời gian bị ảnh hưởng còn booking `confirmed` trong tương lai **hoặc còn `HOLD` chưa hết hạn**. Hệ thống từ chối và liệt kê cả booking lẫn hold đang vướng. **Quyết định D5.** |
| BR-VEN-05a | Lý do chặn cả `HOLD`: hold sống tối đa 10 phút và có thể chuyển thành booking `confirmed` bất cứ lúc nào trong khoảng đó qua `PaymentCompleted`. Nếu chỉ chặn theo booking `confirmed`, một khoảng vừa bị đóng cửa vẫn có thể sinh ra booking hợp lệ ngay sau đó, tạo booking trên sân đã đóng. Chủ sân bị chặn vì hold chỉ cần chờ tối đa 10 phút rồi thao tác lại. |
| BR-VEN-06 | Thay đổi biểu giá không ảnh hưởng booking đã tạo. Mỗi booking giữ `priceSnapshot` tại thời điểm tạo. |
| BR-VEN-07 | Giá niêm yết theo giờ. Tổng tiền một booking bằng tổng các đoạn thời gian nhân đơn giá của khung giá tương ứng, khi booking bắc qua nhiều khung giá. |
| BR-VEN-08 | **Định nghĩa booking nội bộ:** một bản ghi chỉ để khóa lịch cho lượt đặt diễn ra ngoài marketplace. Nền tảng **không thu tiền, không hoàn tiền, không tính hoa hồng và không tính vào doanh thu nền tảng** cho bản ghi này. Việc khách trả tiền cho chủ sân bằng cách nào nằm ngoài phạm vi hệ thống. |
| BR-VEN-08a | Booking nội bộ **không gắn với tài khoản người chơi**. Thông tin khách được lưu dưới dạng tên và số liên hệ tự do trên chính bản ghi booking. Kéo theo: `BOOKING.userId` phải cho phép rỗng, và bản ghi cần trường thông tin khách nội bộ. |
| BR-VEN-09 | Sân con không bị xóa cứng. Bỏ sân con nghĩa là đặt `active=false`, giữ nguyên lịch sử booking. |
| BR-VEN-10 | Thời lượng đặt phải là bội số của bước thời gian và nằm trong khoảng `[minDur, maxDur]` của sân đó. |
| BR-VEN-11 | Nhà cung cấp chỉ thao tác được trên cơ sở và sân thuộc hồ sơ của chính mình. Mọi truy cập chéo bị từ chối ở tầng API, không chỉ ẩn ở giao diện. |
| BR-VEN-12 | Mỗi sân con phải có từ 1 đến 5 ảnh riêng. Thiết lập chung sao chép lịch, giá và quy tắc vào từng sân; sau đó từng sân vẫn sửa độc lập được. **Quyết định D49.** |

## 3. Trạng thái

**`PROVIDER.status`**

```
[*] ──(VEN-01 nộp)──> pending
pending ──(VEN-02 duyệt)──> approved
pending ──(VEN-02 từ chối)──> rejected
rejected ──(VEN-01 nộp lại sau khi sửa)──> pending
approved ──(ACC-08 khóa chủ tài khoản)──> suspended
suspended ──(ACC-08 khôi phục)──> approved
```

> `rejected` là trạng thái **bổ sung** so với [data-model.md](../../architecture/data-model.md),
> vốn chỉ có `pending|approved|suspended`. Xem giả định A-VEN-01.

**`COURT.active`**: `true ↔ false`, chuyển đổi chịu ràng buộc BR-VEN-05.

---

## 4. Chi tiết chức năng

### VEN-01 — Đăng ký nhà cung cấp sân

| Trường | Nội dung |
|---|---|
| Actor chính | Người chơi đã đăng nhập |
| Mục tiêu nghiệp vụ | Xin quyền đăng bán sân trên nền tảng |
| User Story | Là người chơi sở hữu sân cầu lông, tôi muốn nộp hồ sơ nhà cung cấp, để đưa sân của mình lên nền tảng và nhận booking |
| Điều kiện trước | Đang đăng nhập, đã xác minh email, chưa có hồ sơ nhà cung cấp ở trạng thái `pending` hoặc `approved` |
| Sự kiện kích hoạt | Gửi hồ sơ nhà cung cấp |
| Workflow chính | 1. Mở form đăng ký nhà cung cấp → 2. Nhập tên tổ chức hoặc hộ kinh doanh, thông tin liên hệ, mô tả ngắn → 3. Gửi → 4. Hệ thống tạo `PROVIDER(status=pending)` → 5. Hồ sơ vào hàng đợi duyệt của Admin |
| Luồng thay thế | Hồ sơ từng bị từ chối: người dùng sửa thông tin và nộp lại, trạng thái quay về `pending` |
| Luồng lỗi | Đã có hồ sơ `pending` → từ chối, hiển thị trạng thái hiện tại; Đã có hồ sơ `approved` → từ chối theo BR-VEN-01; Thiếu trường bắt buộc → báo lỗi từng trường |
| Business Rules | BR-VEN-01 |
| Trạng thái liên quan | `PROVIDER: [*] → pending`; `rejected → pending` |
| Quyền hạn | Bất kỳ tài khoản `player` đã xác minh |
| Dữ liệu vào | Tên tổ chức, thông tin liên hệ, mô tả |
| Dữ liệu ra | Hồ sơ ở trạng thái chờ duyệt |
| Phụ thuộc | ACC-03 |
| Trong phạm vi | Nộp và nộp lại hồ sơ dựa trên thông tin khai báo |
| Ngoài phạm vi | Tải lên giấy tờ chứng minh sở hữu sân (đã loại ở `SCOPE_BASELINE` §3), ký hợp đồng điện tử, thẩm định thực địa |
| Sơ đồ cần vẽ | Sơ đồ trạng thái `PROVIDER.status` |

**Acceptance Criteria**

- `AC-VEN-01-1` — **Given** người chơi đã xác minh và chưa có hồ sơ, **When** nộp hồ sơ hợp lệ, **Then** hệ thống tạo `PROVIDER` ở `pending` và hồ sơ xuất hiện trong hàng đợi duyệt của Admin.
- `AC-VEN-01-2` — **Given** người dùng đã có hồ sơ `pending`, **When** nộp hồ sơ lần nữa, **Then** hệ thống từ chối và không tạo bản ghi thứ hai.
- `AC-VEN-01-3` — **Given** người dùng có hồ sơ `rejected`, **When** sửa thông tin và nộp lại, **Then** chính hồ sơ đó quay về `pending`, không tạo bản ghi mới.
- `AC-VEN-01-4` — **Given** người dùng chưa xác minh email, **When** nộp hồ sơ, **Then** hệ thống từ chối.

**Tiêu chí kiểm chứng:** kiểm thử tự động 4 AC.

---

### VEN-02 — Xét duyệt nhà cung cấp sân

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Admin / người nộp hồ sơ |
| Mục tiêu nghiệp vụ | Kiểm soát ai được bán sân trên nền tảng |
| User Story | Là Admin, tôi muốn duyệt hoặc từ chối hồ sơ nhà cung cấp kèm lý do, để chỉ những bên nghiêm túc mới lên được nền tảng |
| Điều kiện trước | Có hồ sơ ở trạng thái `pending` |
| Sự kiện kích hoạt | Admin ra quyết định trên một hồ sơ |
| Workflow chính | 1. Admin mở hàng đợi hồ sơ chờ → 2. Xem thông tin khai báo → 3. Chọn duyệt → 4. `PROVIDER.status = approved`, **cộng thêm vai `provider`** cho tài khoản, tạo **ví kinh doanh** ở finance → 5. Thông báo cho người nộp |
| Luồng thay thế | Từ chối: `status = rejected`, lý do bắt buộc, người nộp sửa và nộp lại được (VEN-01) |
| Luồng lỗi | Hồ sơ không còn ở `pending` do đã được xử lý → báo trạng thái hiện tại, không ghi đè; Từ chối mà không nhập lý do → từ chối thao tác |
| Business Rules | BR-VEN-02; BR-ACC-11 (ghi vết hành động Admin) |
| Trạng thái liên quan | `PROVIDER: pending → approved \| rejected` |
| Quyền hạn | Chỉ vai `admin` |
| Dữ liệu vào | Hồ sơ đích, quyết định, lý do khi từ chối |
| Dữ liệu ra | Trạng thái hồ sơ; vai trò mới của tài khoản; ví kinh doanh |
| Phụ thuộc | VEN-01 |
| Trong phạm vi | Duyệt, từ chối, ghi lý do |
| Ngoài phạm vi | Duyệt có điều kiện, phân hạng nhà cung cấp, thu hồi tư cách nhà cung cấp độc lập với việc khóa tài khoản |
| Sơ đồ cần vẽ | Sơ đồ trạng thái `PROVIDER.status`; sequence duyệt → cấp vai trò → tạo ví kinh doanh |

**Acceptance Criteria**

- `AC-VEN-02-1` — **Given** một hồ sơ `pending`, **When** Admin duyệt, **Then** hồ sơ chuyển `approved`, tài khoản có thêm vai `provider` mà **vẫn giữ** vai `player`, và một ví `business` số dư 0 được tạo cho tài khoản đó.
- `AC-VEN-02-2` — **Given** một hồ sơ `pending`, **When** Admin từ chối kèm lý do, **Then** hồ sơ chuyển `rejected` và lý do hiển thị cho người nộp.
- `AC-VEN-02-3` — **Given** Admin từ chối mà bỏ trống lý do, **When** xác nhận, **Then** hệ thống từ chối thao tác và trạng thái không đổi.
- `AC-VEN-02-4` — **Given** tài khoản vừa được duyệt làm nhà cung cấp, **When** người đó đặt một sân của người khác, **Then** giao dịch thành công và trừ vào **ví cá nhân**, không phải ví kinh doanh.
- `AC-VEN-02-5` — **Given** người dùng không có vai `admin`, **When** gọi API duyệt hồ sơ, **Then** hệ thống từ chối.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC; AC-VEN-02-1 và AC-VEN-02-4 là kiểm thử tích hợp chạm `account-service`, `venue-booking-service` và `finance-service`.

---

### VEN-03 — Quản lý hồ sơ cơ sở sân

| Trường | Nội dung |
|---|---|
| Actor chính | Nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Mô tả cơ sở đủ để người chơi tìm thấy và quyết định đến |
| User Story | Là nhà cung cấp sân, tôi muốn tạo và cập nhật hồ sơ cơ sở gồm tên, địa chỉ, vị trí bản đồ, tiện ích và hình ảnh, để người chơi tìm được sân của tôi |
| Điều kiện trước | Hồ sơ nhà cung cấp `approved` |
| Sự kiện kích hoạt | Tạo hoặc lưu thay đổi cơ sở |
| Workflow chính | 1. Mở khu vực quản lý cơ sở → 2. Tạo cơ sở mới hoặc chọn cơ sở có sẵn → 3. Nhập tên, địa chỉ, chọn vị trí trên bản đồ, tiện ích, tải hình ảnh → 4. Lưu → 5. Cơ sở hiện trong tìm kiếm khi đủ điều kiện BR-VEN-03 |
| Luồng thay thế | Nhà cung cấp có nhiều cơ sở: mỗi cơ sở quản lý độc lập |
| Luồng lỗi | Thiếu tọa độ → từ chối, vì BOK-01 tìm theo bản đồ; Ảnh vượt dung lượng → từ chối kèm giới hạn; Hồ sơ nhà cung cấp chưa `approved` → chặn theo BR-VEN-02 |
| Business Rules | BR-VEN-01, BR-VEN-02, BR-VEN-03, BR-VEN-11 |
| Trạng thái liên quan | — |
| Quyền hạn | Chỉ chủ sở hữu cơ sở |
| Dữ liệu vào | Tên, địa chỉ, tọa độ, tiện ích, hình ảnh |
| Dữ liệu ra | Cơ sở đã lưu; khả năng hiển thị trong tìm kiếm |
| Phụ thuộc | VEN-02 |
| Trong phạm vi | Tạo, sửa, xem cơ sở của chính mình |
| Ngoài phạm vi | Xóa cơ sở, chuyển nhượng cơ sở cho tài khoản khác, nhiều tài khoản nhân viên cùng quản lý (đã loại ở `SCOPE_BASELINE` §3) |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-VEN-03-1` — **Given** nhà cung cấp `approved`, **When** tạo cơ sở đủ thông tin bắt buộc gồm tọa độ, **Then** cơ sở được lưu và thuộc về đúng nhà cung cấp đó.
- `AC-VEN-03-2` — **Given** cơ sở chưa có sân con nào hoạt động, **When** người chơi tìm sân, **Then** cơ sở đó không xuất hiện trong kết quả.
- `AC-VEN-03-3` — **Given** nhà cung cấp A, **When** gọi API sửa cơ sở của nhà cung cấp B, **Then** hệ thống từ chối.
- `AC-VEN-03-4` — **Given** hồ sơ nhà cung cấp ở trạng thái `pending`, **When** thử tạo cơ sở, **Then** hệ thống từ chối.

**Tiêu chí kiểm chứng:** kiểm thử tự động 4 AC, trong đó AC-VEN-03-3 gọi thẳng API.

---

### VEN-04 — Quản lý danh sách sân con

| Trường | Nội dung |
|---|---|
| Actor chính | Nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Khai báo đúng số sân thực tế, vì mỗi sân con là một đơn vị lịch độc lập |
| User Story | Là nhà cung cấp sân, tôi muốn thêm và tạm ngừng từng sân con, để lịch phản ánh đúng năng lực phục vụ thật |
| Điều kiện trước | Cơ sở đã tồn tại |
| Sự kiện kích hoạt | Thêm sân, đổi tên sân, hoặc vô hiệu hóa sân |
| Workflow chính | 1. Mở cơ sở → 2. Thêm sân con với tên gọi và 1–5 ảnh → 3. Chọn thiết lập lịch, giá và quy tắc chung hoặc riêng → 4. Lưu, sân ở trạng thái `active=true` → 5. Có thể mở lại từng sân để sửa cấu hình và ảnh |
| Luồng thay thế | Vô hiệu hóa sân: hệ thống kiểm tra booking `confirmed` trong tương lai **và `HOLD` chưa hết hạn**. Không có gì vướng → đặt `active=false`. Có → chặn theo BR-VEN-05 |
| Luồng lỗi | Vô hiệu hóa sân còn booking tương lai → từ chối kèm danh sách booking vướng và hướng dẫn hủy qua BOK-10; Còn `HOLD` chưa hết hạn → từ chối kèm thời điểm hold hết hạn để chủ sân biết khi nào thao tác lại được; Tên sân trùng trong cùng cơ sở → từ chối |
| Business Rules | BR-VEN-02, BR-VEN-05, BR-VEN-09, BR-VEN-11, BR-VEN-12 |
| Trạng thái liên quan | `COURT.active: true ↔ false` |
| Quyền hạn | Chỉ chủ sở hữu cơ sở |
| Dữ liệu vào | Tên sân, trạng thái hoạt động, 1–5 ảnh, lịch, giá và quy tắc đặt sân |
| Dữ liệu ra | Danh sách sân con |
| Phụ thuộc | VEN-03 |
| Trong phạm vi | Thêm, đổi tên, bật, tắt sân con |
| Ngoài phạm vi | Xóa cứng sân con, phân loại sân theo mặt sân hay chất lượng, gộp hoặc tách sân |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-VEN-04-1` — **Given** một cơ sở đã tồn tại, **When** thêm sân con, **Then** sân được tạo với `active=true` và thuộc đúng cơ sở đó.
- `AC-VEN-04-2` — **Given** một sân con không có booking `confirmed` nào trong tương lai, **When** vô hiệu hóa, **Then** `active` chuyển `false` và sân không còn nhận booking mới.
- `AC-VEN-04-3` — **Given** một sân con còn 2 booking `confirmed` trong tương lai, **When** thử vô hiệu hóa, **Then** hệ thống từ chối và liệt kê đúng 2 booking đó.
- `AC-VEN-04-4` — **Given** một sân con đã `active=false`, **When** truy vấn lịch sử booking của sân đó, **Then** các booking cũ vẫn còn nguyên.
- `AC-VEN-04-5` — **Given** một sân con không có booking `confirmed` nào nhưng đang có một `HOLD` còn 4 phút nữa mới hết hạn, **When** thử vô hiệu hóa, **Then** hệ thống từ chối và cho biết thời điểm hold hết hạn.
- `AC-VEN-04-6` — **Given** chủ sân tạo hoặc sửa sân con, **When** số ảnh ngoài khoảng 1–5, **Then** hệ thống từ chối; khi hợp lệ thì lưu đúng thứ tự ảnh.
- `AC-VEN-04-7` — **Given** nhiều sân con, **When** chọn thiết lập chung, **Then** cấu hình được áp dụng vào từng sân; chuyển sang thiết lập riêng cho phép chỉnh từng sân độc lập.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC.

---

### VEN-05 — Thiết lập giờ hoạt động và ngày đóng cửa

| Trường | Nội dung |
|---|---|
| Actor chính | Nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Xác định khi nào sân có thể được đặt |
| User Story | Là nhà cung cấp sân, tôi muốn khai báo giờ mở cửa theo thứ trong tuần và các ngày nghỉ, để người chơi chỉ đặt được vào lúc tôi thực sự phục vụ |
| Điều kiện trước | Sân con tồn tại và đang hoạt động |
| Sự kiện kích hoạt | Lưu giờ hoạt động hoặc thêm ngày đóng cửa |
| Workflow chính | 1. Chọn sân → 2. Khai báo giờ mở và đóng cho từng thứ trong tuần → 3. Thêm ngày đóng cửa ngoại lệ theo ngày cụ thể → 4. Hệ thống kiểm tra xung đột với booking `confirmed` **và `HOLD` chưa hết hạn** → 5. Không xung đột thì lưu, lịch cập nhật ngay |
| Luồng thay thế | Mở rộng giờ hoạt động: không thể tạo xung đột, lưu thẳng |
| Luồng lỗi | Thu hẹp giờ hoặc thêm ngày đóng cửa chồng lên booking `confirmed` → **từ chối** kèm danh sách booking vướng, hướng dẫn hủy qua BOK-10 rồi thao tác lại; Chồng lên `HOLD` chưa hết hạn → **từ chối** kèm thời điểm hold hết hạn; Giờ đóng sớm hơn giờ mở → từ chối |
| Business Rules | BR-VEN-02, BR-VEN-04, BR-VEN-05, BR-VEN-11 |
| Trạng thái liên quan | — |
| Quyền hạn | Chỉ chủ sở hữu cơ sở |
| Dữ liệu vào | Giờ mở và đóng theo thứ; danh sách ngày đóng cửa |
| Dữ liệu ra | Lịch khả dụng của sân |
| Phụ thuộc | VEN-04 |
| Trong phạm vi | Giờ hoạt động lặp theo tuần; ngày đóng cửa ngoại lệ |
| Ngoài phạm vi | Giờ hoạt động theo mùa, lịch nghỉ lễ dựng sẵn, giờ khác nhau giữa các sân con trong cùng cơ sở nếu nhà cung cấp muốn đặt hàng loạt |
| Sơ đồ cần vẽ | Sơ đồ hoạt động: kiểm tra xung đột trước khi lưu |

**Acceptance Criteria**

- `AC-VEN-05-1` — **Given** một sân chưa có booking nào, **When** khai báo giờ hoạt động cho cả tuần, **Then** lịch trống của sân (BOK-04) chỉ hiện các khung giờ trong khoảng đã khai.
- `AC-VEN-05-2` — **Given** một sân có booking `confirmed` lúc 19h ngày mai, **When** nhà cung cấp thêm ngày mai vào danh sách đóng cửa, **Then** hệ thống từ chối và chỉ ra đúng booking lúc 19h đó.
- `AC-VEN-05-3` — **Given** cùng tình huống trên, **When** nhà cung cấp hủy booking đó qua BOK-10 rồi thêm lại ngày đóng cửa, **Then** thao tác thành công.
- `AC-VEN-05-4` — **Given** một sân đang mở 6h–22h và có booking lúc 21h, **When** nhà cung cấp thu hẹp giờ đóng về 20h, **Then** hệ thống từ chối.
- `AC-VEN-05-5` — **Given** một sân đang mở 8h–20h, **When** nhà cung cấp mở rộng thành 6h–22h, **Then** thao tác thành công không cần kiểm tra gì thêm.
- `AC-VEN-05-6` — **Given** một sân có `HOLD` chưa hết hạn ở khung 19h ngày mai và không có booking `confirmed` nào, **When** nhà cung cấp thêm ngày mai vào danh sách đóng cửa, **Then** hệ thống từ chối; **và when** hold đó hết hạn rồi thao tác lại, **then** thành công.

**Tiêu chí kiểm chứng:** kiểm thử tự động 6 AC; AC-VEN-05-3 là kiểm thử tích hợp chạy trọn chuỗi hủy rồi đóng cửa; AC-VEN-05-6 chứng minh không tồn tại khe hở giữa lúc đóng cửa và lúc hold chuyển thành booking.

---

### VEN-06 — Thiết lập biểu giá theo lịch

| Trường | Nội dung |
|---|---|
| Actor chính | Nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Định giá khác nhau theo khung giờ và ngày trong tuần |
| User Story | Là nhà cung cấp sân, tôi muốn đặt giá riêng cho giờ cao điểm và giờ thấp điểm, để phản ánh đúng nhu cầu thực tế |
| Điều kiện trước | Sân con tồn tại và có giờ hoạt động |
| Sự kiện kích hoạt | Lưu biểu giá |
| Workflow chính | 1. Chọn sân → 2. Khai báo các khung giá: thứ trong tuần, giờ bắt đầu, giờ kết thúc, đơn giá theo giờ → 3. Đặt thời điểm bắt đầu hiệu lực → 4. Hệ thống kiểm tra các khung không chồng lấn và phủ hết giờ hoạt động → 5. Lưu, tăng `version` |
| Luồng thay thế | Sửa giá cho tương lai: tạo phiên bản mới với `effectiveFrom` ở tương lai, phiên bản cũ vẫn áp dụng tới thời điểm đó |
| Luồng lỗi | Hai khung giá chồng lấn nhau → từ chối; Giờ hoạt động có đoạn không được khung giá nào phủ → từ chối, vì BOK-04 sẽ không tính được giá; `effectiveFrom` trong quá khứ → từ chối |
| Business Rules | BR-VEN-02, BR-VEN-06, BR-VEN-07, BR-VEN-11 |
| Trạng thái liên quan | `PRICING_RULE.version` tăng dần, các phiên bản cũ giữ lại |
| Quyền hạn | Chỉ chủ sở hữu cơ sở |
| Dữ liệu vào | Thứ, giờ bắt đầu, giờ kết thúc, đơn giá, thời điểm hiệu lực |
| Dữ liệu ra | Biểu giá hiện hành và biểu giá tương lai |
| Phụ thuộc | VEN-05 |
| Trong phạm vi | Giá theo thứ và khung giờ; đặt hiệu lực trong tương lai |
| Ngoài phạm vi | Khuyến mãi, mã giảm giá, giá theo hạng thành viên, giá động (đã loại ở `SCOPE_BASELINE` §3) |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-VEN-06-1` — **Given** một sân mở 6h–22h, **When** nhà cung cấp lưu biểu giá phủ trọn 6h–22h không chồng lấn, **Then** biểu giá được lưu và BOK-04 hiển thị đúng đơn giá cho từng khung.
- `AC-VEN-06-2` — **Given** hai khung giá chồng lấn nhau, **When** lưu, **Then** hệ thống từ chối và chỉ ra đoạn chồng lấn.
- `AC-VEN-06-3` — **Given** giờ hoạt động 6h–22h nhưng biểu giá chỉ phủ 6h–20h, **When** lưu, **Then** hệ thống từ chối và chỉ ra đoạn 20h–22h chưa có giá.
- `AC-VEN-06-4` — **Given** một booking đã tạo với `priceSnapshot` là 120.000, **When** nhà cung cấp đổi giá khung đó thành 150.000, **Then** booking cũ vẫn giữ 120.000.
- `AC-VEN-06-5` — **Given** một booking kéo dài 18h–20h bắc qua hai khung giá 100.000/giờ và 150.000/giờ, **When** hệ thống tính tiền, **Then** tổng là 250.000.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC; AC-VEN-06-5 là kiểm thử tính tiền bắc cầu khung giá.

---

### VEN-07 — Thiết lập quy tắc đặt sân

| Trường | Nội dung |
|---|---|
| Actor chính | Nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Ràng buộc cách người chơi chọn slot cho khớp cách vận hành thật |
| User Story | Là nhà cung cấp sân, tôi muốn quy định bước thời gian và thời lượng đặt tối thiểu, tối đa, để tránh những lượt đặt vụn không phục vụ được |
| Điều kiện trước | Sân con tồn tại |
| Sự kiện kích hoạt | Lưu quy tắc đặt sân |
| Workflow chính | 1. Chọn sân → 2. Đặt bước thời gian, thời lượng tối thiểu, thời lượng tối đa → 3. Hệ thống kiểm tra tính hợp lệ → 4. Lưu, BOK-05 áp dụng ngay cho lượt đặt mới |
| Luồng thay thế | — |
| Luồng lỗi | Thời lượng tối thiểu lớn hơn tối đa → từ chối; Thời lượng tối thiểu không phải bội số của bước thời gian → từ chối; Thời lượng tối đa vượt quá độ dài giờ hoạt động trong ngày → từ chối |
| Business Rules | BR-VEN-02, BR-VEN-10, BR-VEN-11 |
| Trạng thái liên quan | — |
| Quyền hạn | Chỉ chủ sở hữu cơ sở |
| Dữ liệu vào | Bước thời gian, thời lượng tối thiểu, thời lượng tối đa |
| Dữ liệu ra | Quy tắc áp dụng cho BOK-05 |
| Phụ thuộc | VEN-04 |
| Trong phạm vi | Bước thời gian và giới hạn thời lượng |
| Ngoài phạm vi | Giới hạn số lượt đặt mỗi người, đặt trước tối đa bao nhiêu ngày, quy tắc riêng theo khung giờ |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-VEN-07-1` — **Given** nhà cung cấp đặt bước 30 phút, tối thiểu 60 phút, tối đa 180 phút, **When** lưu, **Then** quy tắc được áp dụng và BOK-05 chỉ cho chọn thời lượng 60, 90, 120, 150 hoặc 180 phút.
- `AC-VEN-07-2` — **Given** thời lượng tối thiểu 90 phút và bước 60 phút, **When** lưu, **Then** hệ thống từ chối vì tối thiểu không phải bội số của bước.
- `AC-VEN-07-3` — **Given** thời lượng tối thiểu lớn hơn tối đa, **When** lưu, **Then** hệ thống từ chối.
- `AC-VEN-07-4` — **Given** quy tắc đã lưu, **When** người chơi gọi thẳng API tạo hold với thời lượng 45 phút, **Then** hệ thống từ chối.

**Tiêu chí kiểm chứng:** kiểm thử tự động 4 AC; AC-VEN-07-4 gọi thẳng API không qua giao diện.

---

### VEN-08 — Quản lý lịch sân hợp nhất

| Trường | Nội dung |
|---|---|
| Actor chính | Nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Một màn hình duy nhất cho biết mọi sân đang bận hay trống lúc nào, bất kể booking đến từ đâu |
| User Story | Là nhà cung cấp sân, tôi muốn xem lịch của tất cả sân con trong một khung nhìn, để biết ngay tình trạng cơ sở mà không phải mở từng sân |
| Điều kiện trước | Cơ sở có ít nhất một sân con |
| Sự kiện kích hoạt | Mở màn hình lịch |
| Workflow chính | 1. Chọn cơ sở và khoảng ngày → 2. Hệ thống hiển thị lưới sân theo thời gian → 3. Mỗi ô thể hiện: trống, đang giữ chỗ, đã xác nhận, ngoài giờ hoạt động, hoặc ngày đóng cửa → 4. Booking hiện kèm nguồn: từ nền tảng hay ghi tại quầy |
| Luồng thay thế | Chọn xem một sân đơn lẻ thay vì toàn cơ sở |
| Luồng lỗi | Không có sân con nào đang hoạt động → hiển thị trạng thái rỗng kèm hướng dẫn thêm sân |
| Business Rules | BR-VEN-03, BR-VEN-04, BR-VEN-11 |
| Trạng thái liên quan | Đọc `BOOKING.status` và `HOLD` |
| Quyền hạn | Chỉ chủ sở hữu cơ sở |
| Dữ liệu vào | Cơ sở, khoảng ngày |
| Dữ liệu ra | Lưới lịch hợp nhất theo sân và thời gian |
| Phụ thuộc | VEN-05, VEN-06, VEN-09, BOK-07 |
| Trong phạm vi | Xem lịch hợp nhất, phân biệt nguồn booking |
| Ngoài phạm vi | Kéo thả để đổi lịch booking, in lịch, xuất tệp, đồng bộ sang lịch bên ngoài |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-VEN-08-1` — **Given** một cơ sở có 3 sân con, **When** nhà cung cấp mở lịch hợp nhất cho một ngày, **Then** cả 3 sân hiển thị song song trên cùng trục thời gian.
- `AC-VEN-08-2` — **Given** một slot có booking từ nền tảng và một slot khác có booking ghi tại quầy, **When** xem lịch, **Then** cả hai đều hiện là đã bận và phân biệt được nguồn.
- `AC-VEN-08-3` — **Given** một slot đang có `HOLD` chưa hết hạn, **When** xem lịch, **Then** slot đó hiển thị là đang giữ chỗ, khác với đã xác nhận.
- `AC-VEN-08-4` — **Given** một ngày nằm trong danh sách đóng cửa, **When** xem lịch ngày đó, **Then** toàn bộ khung giờ hiển thị là đóng cửa, không phải trống.
- `AC-VEN-08-5` — **Given** nhà cung cấp A, **When** gọi API xem lịch của cơ sở thuộc nhà cung cấp B, **Then** hệ thống từ chối.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC.

---

### VEN-09 — Ghi nhận booking tại quầy hoặc qua điện thoại

| Trường | Nội dung |
|---|---|
| Actor chính | Nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Đưa lượt đặt ngoài nền tảng vào cùng một lịch, để không xảy ra đặt trùng |
| User Story | Là nhà cung cấp sân, tôi muốn ghi lại lượt khách đặt trực tiếp tại quầy hoặc qua điện thoại, để lịch trên nền tảng luôn phản ánh đúng thực tế |
| Điều kiện trước | Sân con đang hoạt động, slot còn trống, nằm trong giờ hoạt động |
| Sự kiện kích hoạt | Nhà cung cấp tạo booking nội bộ |
| Workflow chính | 1. Mở lịch hợp nhất, chọn sân và slot trống → 2. Nhập tên khách và số liên hệ dạng ghi chú → 3. Xác nhận → 4. Hệ thống tạo `BOOKING(source=internal, status=confirmed)` khóa slot ngay → 5. Slot biến mất khỏi lịch trống của BOK-04 |
| Luồng thay thế | Hủy booking nội bộ: nhà cung cấp hủy trực tiếp, slot trả về trống, không phát sinh hoàn tiền vì nền tảng chưa từng thu tiền |
| Luồng lỗi | Slot đã có booking `confirmed` → từ chối theo ràng buộc bất biến #4; Slot đang có `HOLD` chưa hết hạn của người chơi khác → từ chối, chờ hold hết hạn; Slot ngoài giờ hoạt động hoặc trùng ngày đóng cửa → từ chối |
| Business Rules | BR-VEN-04, BR-VEN-08, BR-VEN-08a, BR-VEN-10, BR-VEN-11 |
| Trạng thái liên quan | `BOOKING.status = confirmed` ngay, không đi qua `held` |
| Quyền hạn | Chỉ chủ sở hữu cơ sở |
| Dữ liệu vào | Sân, khoảng thời gian, tên khách, số liên hệ |
| Dữ liệu ra | Booking nội bộ đã khóa lịch |
| Phụ thuộc | VEN-08 |
| Trong phạm vi | Tạo và hủy booking nội bộ, khóa lịch |
| Ngoài phạm vi | Thu tiền qua nền tảng cho booking nội bộ, tính hoa hồng trên booking nội bộ, gắn booking nội bộ với một tài khoản người chơi có thật |
| Sơ đồ cần vẽ | Sơ đồ hoạt động: tạo booking nội bộ và kiểm tra xung đột |

**Acceptance Criteria**

- `AC-VEN-09-1` — **Given** một slot trống trong giờ hoạt động, **When** nhà cung cấp ghi booking tại quầy, **Then** booking được tạo với `source=internal`, `status=confirmed`, và slot đó biến mất khỏi lịch trống mà người chơi nhìn thấy.
- `AC-VEN-09-2` — **Given** một slot đã có booking `confirmed` từ nền tảng, **When** nhà cung cấp thử ghi booking tại quầy cho cùng slot, **Then** hệ thống từ chối.
- `AC-VEN-09-3` — **Given** một slot đang có `HOLD` chưa hết hạn của người chơi khác, **When** nhà cung cấp thử ghi booking tại quầy, **Then** hệ thống từ chối.
- `AC-VEN-09-4` — **Given** một booking nội bộ đã tạo, **When** kiểm tra finance, **Then** không có `LEDGER_ENTRY` nào và không có bút toán hoa hồng nào được sinh ra.
- `AC-VEN-09-5` — **Given** một booking nội bộ, **When** nhà cung cấp hủy nó, **Then** slot trở lại trống và không có luồng hoàn tiền nào được kích hoạt.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC; AC-VEN-09-2 và AC-VEN-09-3 là kiểm thử đồng thời để chứng minh chống đặt trùng.

---

## 5. Ma trận truy vết

| Mã | User Story | AC | Workflow / sơ đồ |
|---|---|---|---|
| VEN-01 | Nộp hồ sơ nhà cung cấp | AC-VEN-01-1…4 | State `PROVIDER.status` |
| VEN-02 | Duyệt hoặc từ chối hồ sơ | AC-VEN-02-1…5 | State `PROVIDER.status` + sequence cấp vai trò và ví |
| VEN-03 | Quản lý hồ sơ cơ sở | AC-VEN-03-1…4 | — |
| VEN-04 | Quản lý sân con | AC-VEN-04-1…5 | — |
| VEN-05 | Giờ hoạt động và ngày đóng cửa | AC-VEN-05-1…6 | Activity kiểm tra xung đột |
| VEN-06 | Biểu giá theo lịch | AC-VEN-06-1…5 | — |
| VEN-07 | Quy tắc đặt sân | AC-VEN-07-1…4 | — |
| VEN-08 | Lịch sân hợp nhất | AC-VEN-08-1…5 | — |
| VEN-09 | Booking tại quầy | AC-VEN-09-1…5 | Activity tạo booking nội bộ |

## 6. Giả định cần duyệt

| # | Giả định | Rủi ro nếu sai |
|---|---|---|
| A-VEN-01 | Bổ sung trạng thái `rejected` vào `PROVIDER.status`; hồ sơ bị từ chối nộp lại được | Trung bình — sửa data model |
| A-VEN-02 | Một tài khoản có tối đa một hồ sơ nhà cung cấp; một nhà cung cấp có nhiều cơ sở | Trung bình |
| A-VEN-03 | VEN-02 duyệt dựa hoàn toàn trên thông tin khai báo, không yêu cầu giấy tờ | Thấp — `SCOPE_BASELINE` §3 đã cắt bằng chứng sở hữu sân |
| A-VEN-04 | Bỏ sân con là vô hiệu hóa, không xóa cứng | Thấp |
| A-VEN-05 | Bước thời gian mặc định 30 phút, thời lượng tối thiểu 60 phút, tối đa 240 phút; nhà cung cấp đổi được | Thấp — chỉ là giá trị khởi tạo |
| A-VEN-06 | **Booking nội bộ là bản ghi chỉ để khóa lịch cho lượt đặt ngoài marketplace. Nền tảng không thu tiền, không hoàn tiền, không tính hoa hồng, không tính vào doanh thu nền tảng, và bản ghi không gắn với tài khoản người chơi.** Cách khách trả tiền cho chủ sân nằm ngoài phạm vi hệ thống. | **Cao — chạm doanh thu và data model.** Nếu sai thì FIN-09, mô hình hoa hồng và `BOOKING` đều phải làm lại |
| A-VEN-07 | Giờ hoạt động khai theo thứ trong tuần; ngày đóng cửa là ngoại lệ theo ngày cụ thể | Thấp |
| A-VEN-08 | Giá niêm yết theo giờ; booking bắc qua nhiều khung giá thì cộng dồn từng đoạn | Trung bình — ảnh hưởng cách hiển thị giá ở BOK-04 |
| A-VEN-09 | Ví kinh doanh được tạo tại thời điểm VEN-02 duyệt, không phải lúc phát sinh doanh thu đầu tiên | Thấp |

## 7. Câu hỏi còn mở

Không có. Toàn bộ 9 chức năng đủ context để triển khai, với điều kiện A-VEN-06 được xác nhận.
