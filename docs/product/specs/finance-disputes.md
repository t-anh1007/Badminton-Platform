---
type: functional-spec
module: finance-disputes
phase: 1
status: approved
updated: 2026-08-05
approved: 2026-08-05
---

# Functional Spec — `finance-disputes` (FIN)

13 chức năng, GĐ1. Nguồn: [phasing.md](../phasing.md) §3.4.
`FIN-05 Thanh toán phí tham gia kèo` thuộc GĐ2, không nằm trong tài liệu này.
`FIN-14` được bổ sung ngày 2026-08-05 theo quyết định D15.

## 1. Actor và mô hình ví

| Actor | Vai trò | Ví sở hữu |
|---|---|---|
| Người chơi | `player` | `personal` |
| Nhà cung cấp sân | `player` + `provider` | `personal` **và** `business` |
| Admin | `admin` | Không có ví cá nhân. Thao tác trên yêu cầu rút tiền, tranh chấp và đối soát. |
| **Nền tảng** | — | **Ví hệ thống `platform`**, duy nhất một bản ghi, không thuộc người dùng nào. Nhận `commission`, chi bút toán đảo hoa hồng khi hoàn tiền. |
| SePay | Hệ thống ngoài | Chỉ gửi webhook biến động số dư ngân hàng |

Ranh giới dòng tiền theo [ADR 0003](../../decisions/0003-multi-role-dual-wallet.md):

| Ví | Nhận | Chi | Phân vùng |
|---|---|---|---|
| `personal` | `topup`, `refund` | `payment` | Một số dư duy nhất |
| `business` | `release` (doanh thu ròng sau hoa hồng) | `payout` | `pending` → `available` → `reserved` |
| `platform` | `commission` | bút toán đảo hoa hồng khi hoàn | Một số dư duy nhất |

`reserved` là phần đã có yêu cầu rút đang chờ chi. Chuyển giữa ba phân vùng không sinh bút
toán ledger; chỉ khi tiền thật rời hệ thống mới ghi `payout`. Xem BR-FIN-16.

## 2. Business rules dùng chung

| Mã | Quy tắc |
|---|---|
| BR-FIN-01 | `LEDGER_ENTRY` là append-only. Không sửa, không xóa bút toán đã ghi. Mọi điều chỉnh thực hiện bằng bút toán mới. |
| BR-FIN-02 | Mỗi bút toán ghi `before` và `after` của ví. Số dư ví luôn bằng `after` của bút toán mới nhất. Bất kỳ sai lệch nào giữa hai giá trị này là lỗi toàn vẹn. |
| BR-FIN-03 | Số dư ví không bao giờ âm. Mọi thao tác làm số dư âm bị từ chối. |
| BR-FIN-04 | Không chuyển tiền giữa hai ví của cùng một người, và không chuyển ngang hàng giữa người dùng. Ràng buộc bất biến #6 và quyết định D3. |
| BR-FIN-05 | **Hoàn tiền luôn ghi có vào ví `personal`**, không bao giờ chuyển ngược ra ngân hàng. SePay không có API hoàn tiền. |
| BR-FIN-06 | Khi booking `confirmed`, finance ghi **đồng thời** doanh thu ròng `gross × (1 − r)` vào `pending` của ví `business` và hoa hồng `gross × r` vào ví `platform`. Phần `pending` chuyển sang `available` sau khi **ca kết thúc và hết 24 giờ**, với điều kiện booking đó không có tranh chấp đang mở. Ràng buộc bất biến #5. Chi tiết ở FIN-09. |
| BR-FIN-07 | **Hạn gửi tranh chấp trùng đúng cửa sổ 24 giờ** đó. Hết 24 giờ thì không gửi được nữa và tiền chuyển sang `available`. Bất biến thu được: tiền chỉ rời diện tranh chấp khi không còn ai được quyền tranh chấp. **Quyết định D11.** |
| BR-FIN-08 | Hoa hồng là **tỷ lệ cố định**, đặt lúc triển khai, không cấu hình được lúc chạy. Áp trên mọi booking marketplace. **Không** áp trên booking nội bộ theo `BR-VEN-08`. |
| BR-FIN-09 | Mọi webhook SePay được xử lý **idempotent** theo mã sự kiện. Nhận lại cùng một sự kiện không sinh bút toán thứ hai. |
| BR-FIN-10 | Nạp tiền khớp bằng **mã nội dung chuyển khoản duy nhất**. Webhook "tiền vào" không khớp mã nào thì không tự ghi có, mà vào hàng chờ đối soát tay của Admin. |
| BR-FIN-11 | Rút tiền khớp webhook "tiền ra" theo **số tiền cộng nội dung**. Không khớp thì không tự chuyển trạng thái, mà vào hàng chờ đối soát tay. |
| BR-FIN-12 | Người dùng chỉ xem được ví và giao dịch của chính mình. Admin xem được yêu cầu rút tiền và tranh chấp, nhưng không tạo bút toán tùy ý ngoài các luồng đã định nghĩa. |
| BR-FIN-13 | Mọi thao tác của Admin lên tiền đều ghi vết append-only kèm lý do bắt buộc. |
| BR-FIN-14 | **Mọi khoản hoàn đều là đảo ba vế, không bao giờ cộng thêm.** Doanh thu và hoa hồng đã được ghi đủ ngay khi booking `confirmed`. Khi hoàn với tỷ lệ `f` — bất kể nguyên nhân là người chơi tự hủy (FIN-07), sân hủy (FIN-08), hay Admin xử tranh chấp (FIN-13) — hệ thống ghi **đồng thời ba bút toán**: ví `personal` tăng `gross × f`; `pending` của ví `business` giảm `gross × f × (1 − r)`; ví `platform` giảm `gross × f × r`. Không luồng nào được đảo thiếu vế nào. |
| BR-FIN-15 | **Bảo toàn giá trị.** Với mọi booking, tổng số tiền người chơi trả luôn bằng tổng của: phần đã hoàn về ví `personal`, phần doanh thu ròng còn lại của chủ sân, và phần hoa hồng còn lại ở ví `platform`. Bất biến này phải đúng sau mọi luồng hủy hay tranh chấp. |
| BR-FIN-17 | **Mỗi giao dịch ngân hàng được giải trình trọn vẹn.** Mọi `SEPAY_EVENT` phải ánh xạ tới **một tập đối ứng cùng hướng, có tổng số tiền bằng đúng số tiền của sự kiện**. Mỗi đối ứng thuộc một trong bốn loại: (a) một bút toán `topup`; (b) một khoản thanh toán booking trực tiếp qua SePay, biểu hiện trên ledger là cặp `release` cộng `commission` của booking đó; (c) một bút toán `payout`; (d) một bản ghi `out_of_scope` kèm lý do. Đa số sự kiện có đúng một đối ứng; trường hợp chi lệch cho một yêu cầu rút thì một sự kiện tách thành hai đối ứng (ví dụ `payout` cộng `out_of_scope`) mà tổng vẫn bằng số tiền sự kiện. Không sự kiện nào được để chưa khớp vô thời hạn, và không đối ứng nào được dùng cho hai sự kiện. |
| BR-FIN-19 | **Không hoàn tác một khoản đã chi thật.** Yêu cầu rút chỉ chuyển sang `rejected` khi **chưa có bút toán `payout` nào** gắn với nó. Nếu tiền đã rời ngân hàng dù chỉ một phần, yêu cầu bắt buộc đi tiếp qua `partially_paid` rồi `paid`; phần chưa chi ở `reserved` được trả về `available`, còn phần đã chi không bao giờ được hoàn về ví. Vi phạm quy tắc này khiến chủ sân vừa giữ tiền ngoài ngân hàng vừa lấy lại số dư trong hệ thống. |
| BR-FIN-18 | **Bảo toàn ở mức hệ thống.** Tổng tiền vào trừ tổng tiền ra theo `SEPAY_EVENT`, sau khi loại các sự kiện `out_of_scope`, luôn bằng tổng số dư của toàn bộ ví: mọi ví `personal`, mọi ví `business` cộng cả ba phân vùng, và ví `platform`. Đây là phép kiểm tra duy nhất chứng minh hệ thống không tạo ra hay đánh mất tiền. |
| BR-FIN-16 | **Ví `business` có ba phân vùng: `pending`, `available`, `reserved`.** Các chuyển dịch hợp lệ là: `pending → available` (hết cửa sổ 24 giờ, không tranh chấp); `available → reserved` (tạo yêu cầu rút); `reserved → available` (hủy hoặc từ chối yêu cầu rút, hoặc trả lại phần dư sau chi một phần); `reserved → rời hệ thống` (chi thành công, ghi `payout`). Không có chuyển dịch nào khác. Ba chuyển dịch đầu là phân vùng nội bộ, **không sinh bút toán ledger** vì tổng tài sản không đổi; chỉ khi tiền thật rời hệ thống mới ghi `payout`. |

## 3. Trạng thái

**`PAYMENT_INTENT`**: `pending → completed` hoặc `pending → failed`.

**`WITHDRAWAL_REQUEST`** — mang thêm trường `paidAmount` ghi số tiền thực đã chi

```
[*] ──(FIN-10)──> pending
pending ──(webhook tiền ra khớp đủ)──> paid
pending ──(FIN-14 gán khoản chi thiếu)──> partially_paid
pending ──(Admin từ chối, chưa chi đồng nào)──> rejected
partially_paid ──(chi bù, webhook khớp phần còn lại)──> paid
partially_paid ──(Admin chốt ở mức đã chi, phần dư reserved trả về available)──> paid
```

**`rejected` chỉ đến được từ `pending` và chỉ khi chưa có bút toán `payout` nào.** Xem BR-FIN-19.

**`DISPUTE`**

```
[*] ──(FIN-12, trong 24h)──> open
open ──(FIN-13 Admin quyết định)──> resolved
```

**`SEPAY_EVENT`**

```
[*] ──(nhận webhook)──> unmatched
unmatched ──(khớp mã tự động)──> matched_auto
unmatched ──(FIN-14 Admin gán tay)──> matched_manual
unmatched ──(FIN-14 Admin đánh dấu)──> out_of_scope
```

`DISPUTE` ở trạng thái `open` **hoãn** việc chuyển `pending → available` cho đúng booking
liên quan, không hoãn toàn bộ ví.

---

## 4. Chi tiết chức năng

### FIN-01 — Xem số dư và lịch sử giao dịch

| Trường | Nội dung |
|---|---|
| Actor chính | Người chơi; nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Cho người dùng thấy tiền của mình đang ở đâu và vì sao |
| User Story | Là người dùng, tôi muốn xem số dư và toàn bộ giao dịch của mình, để đối chiếu và tin vào con số hệ thống đưa ra |
| Điều kiện trước | Đã đăng nhập |
| Sự kiện kích hoạt | Mở trang ví |
| Workflow chính | 1. Hiển thị số dư ví `personal` → 2. Nếu có vai `provider`, hiển thị thêm ví `business` tách riêng với ba con số `pending`, `available` và `reserved` → 3. Liệt kê giao dịch theo thời gian giảm dần, mỗi dòng gồm loại, số tiền, đối tượng tham chiếu, số dư sau giao dịch |
| Luồng thay thế | Lọc theo loại giao dịch hoặc khoảng thời gian |
| Luồng lỗi | Chưa có giao dịch nào → trạng thái rỗng |
| Business Rules | BR-FIN-02, BR-FIN-12 |
| Trạng thái liên quan | — |
| Quyền hạn | Chỉ ví của chính mình |
| Dữ liệu vào | Bộ lọc tùy chọn |
| Dữ liệu ra | Số dư từng ví; danh sách bút toán |
| Phụ thuộc | ACC-03 |
| Trong phạm vi | Xem số dư và lịch sử |
| Ngoài phạm vi | Xuất tệp sao kê, biểu đồ chi tiêu |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-FIN-01-1` — **Given** người dùng chỉ có vai `player`, **When** mở trang ví, **Then** chỉ một số dư `personal` hiển thị, không có khu vực ví kinh doanh.
- `AC-FIN-01-2` — **Given** người dùng có cả vai `provider`, **When** mở trang ví, **Then** hai ví hiển thị tách biệt, và ví kinh doanh nêu rõ ba con số `pending`, `available` và `reserved`.
- `AC-FIN-01-3` — **Given** một ví có 5 bút toán, **When** xem lịch sử, **Then** số dư hiển thị bằng đúng trường `after` của bút toán mới nhất.
- `AC-FIN-01-4` — **Given** người dùng A, **When** gọi API xem ví của người dùng B, **Then** hệ thống từ chối.

**Tiêu chí kiểm chứng:** kiểm thử tự động 4 AC; AC-FIN-01-3 là kiểm thử toàn vẹn đối chiếu số dư với ledger.

---

### FIN-02 — Nạp số dư qua SePay

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Người chơi / SePay |
| Mục tiêu nghiệp vụ | Đưa tiền thật vào ví nội bộ để dùng cho các giao dịch trên nền tảng |
| User Story | Là người chơi, tôi muốn nạp tiền bằng chuyển khoản ngân hàng, để thanh toán nhanh ở những lần đặt sau |
| Điều kiện trước | Đã đăng nhập và đã xác minh |
| Sự kiện kích hoạt | Người chơi tạo yêu cầu nạp |
| Workflow chính | 1. Nhập số tiền muốn nạp → 2. Hệ thống sinh **mã nội dung chuyển khoản duy nhất** và hiển thị thông tin tài khoản nhận kèm mã QR → 3. Người chơi chuyển khoản với đúng nội dung đó → 4. SePay gửi webhook "tiền vào" → 5. Hệ thống khớp mã, ghi bút toán `topup` vào ví `personal` → 6. Thông báo cho người chơi |
| Luồng thay thế | Chuyển số tiền khác với số đã khai: ghi có đúng **số tiền thực nhận**, không phải số đã khai |
| Luồng lỗi | Webhook không khớp mã nào → không tự ghi có, đưa vào hàng chờ đối soát tay của Admin; Webhook trùng lặp → bỏ qua theo BR-FIN-09; Mã nội dung quá hạn → khoản tiền vẫn vào hàng chờ đối soát tay, không mất |
| Business Rules | BR-FIN-01, BR-FIN-02, BR-FIN-09, BR-FIN-10 |
| Trạng thái liên quan | `PAYMENT_INTENT: pending → completed` |
| Quyền hạn | Chỉ ví của chính mình |
| Dữ liệu vào | Số tiền dự định nạp |
| Dữ liệu ra | Mã nội dung, thông tin chuyển khoản; sau đó là bút toán `topup` |
| Phụ thuộc | ACC-02 |
| Trong phạm vi | Nạp qua chuyển khoản khớp bằng mã nội dung |
| Ngoài phạm vi | Nạp bằng thẻ, ví điện tử, tự động nạp khi thiếu |
| Sơ đồ cần vẽ | Sequence nạp tiền và khớp webhook |

**Acceptance Criteria**

- `AC-FIN-02-1` — **Given** người chơi tạo yêu cầu nạp 200k, **When** webhook "tiền vào" 200k với đúng mã nội dung về, **Then** ví `personal` tăng 200k và một bút toán `topup` được ghi.
- `AC-FIN-02-2` — **Given** cùng webhook đó được gửi lại lần thứ hai, **When** hệ thống xử lý, **Then** không có bút toán thứ hai và số dư không đổi.
- `AC-FIN-02-3` — **Given** người chơi khai nạp 200k nhưng chuyển thực tế 150k, **When** webhook về, **Then** ví được ghi có đúng 150k.
- `AC-FIN-02-4` — **Given** một webhook "tiền vào" có nội dung không khớp mã nào, **When** hệ thống xử lý, **Then** không ví nào bị thay đổi và sự kiện đó xuất hiện trong hàng chờ đối soát của Admin.

**Tiêu chí kiểm chứng:** kiểm thử tự động 4 AC; AC-FIN-02-2 chứng minh consumer idempotent.

---

### FIN-03 — Thanh toán booking bằng số dư

| Trường | Nội dung |
|---|---|
| Actor chính | Người chơi |
| Mục tiêu nghiệp vụ | Thanh toán tức thì để chốt booking trong cửa sổ giữ chỗ 10 phút |
| User Story | Là người chơi có sẵn số dư, tôi muốn trả bằng ví, để xác nhận booking ngay không phải chờ chuyển khoản |
| Điều kiện trước | Có booking `held` với hold còn hạn; số dư `personal` đủ |
| Sự kiện kích hoạt | Chọn thanh toán bằng số dư |
| Workflow chính | 1. Kiểm tra số dư đủ → 2. Ghi bút toán `payment` trừ ví `personal` → 3. Phát `PaymentCompleted{bookingId}` → 4. `venue-booking-service` xác nhận booking → 5. Hiển thị kết quả |
| Luồng thay thế | Số dư thiếu: đề nghị chuyển sang FIN-04 hoặc nạp thêm; hold vẫn tiếp tục chạy |
| Luồng lỗi | Số dư không đủ → từ chối theo BR-FIN-03, không ghi bút toán nào; Hold đã hết hạn trước khi bấm → từ chối và không trừ tiền |
| Business Rules | BR-FIN-01, BR-FIN-02, BR-FIN-03 |
| Trạng thái liên quan | `PAYMENT_INTENT: pending → completed \| failed` |
| Quyền hạn | Chỉ chủ ví và chủ booking |
| Dữ liệu vào | Mã booking |
| Dữ liệu ra | Bút toán `payment`; sự kiện `PaymentCompleted` |
| Phụ thuộc | BOK-06, BOK-07, FIN-02 |
| Trong phạm vi | Trả toàn bộ bằng số dư |
| Ngoài phạm vi | Trả một phần bằng số dư và phần còn lại qua SePay |
| Sơ đồ cần vẽ | Nằm trong sequence saga đặt sân của BOK-07 |

**Acceptance Criteria**

- `AC-FIN-03-1` — **Given** ví `personal` có 300k và booking 200k đang `held`, **When** thanh toán bằng số dư, **Then** ví còn 100k, một bút toán `payment` 200k được ghi, và `PaymentCompleted` được phát.
- `AC-FIN-03-2` — **Given** ví `personal` có 100k và booking 200k, **When** thử thanh toán bằng số dư, **Then** hệ thống từ chối và không bút toán nào được ghi.
- `AC-FIN-03-3` — **Given** người dùng có vai `provider` với ví kinh doanh 500k và ví cá nhân 0đ, **When** thử thanh toán booking 200k bằng số dư, **Then** hệ thống từ chối, vì ví kinh doanh không chi được cho `payment`.
- `AC-FIN-03-4` — **Given** hold vừa hết hạn, **When** người chơi bấm thanh toán, **Then** hệ thống từ chối và số dư không đổi.

**Tiêu chí kiểm chứng:** kiểm thử tự động 4 AC. AC-FIN-03-3 là bằng chứng cho ranh giới hai ví của ADR 0003.

---

### FIN-04 — Thanh toán booking qua SePay

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Người chơi / SePay |
| Mục tiêu nghiệp vụ | Cho phép trả trực tiếp bằng chuyển khoản mà không cần nạp trước |
| User Story | Là người chơi chưa có số dư, tôi muốn chuyển khoản thẳng cho booking, để không phải nạp rồi mới trả |
| Điều kiện trước | Có booking `held` với hold còn hạn |
| Sự kiện kích hoạt | Chọn thanh toán qua SePay |
| Workflow chính | 1. Sinh mã nội dung gắn với booking → 2. Hiển thị thông tin chuyển khoản, mã QR và đồng hồ đếm ngược của hold → 3. Người chơi chuyển khoản → 4. Webhook "tiền vào" về, khớp mã → 5. Ghi bút toán và phát `PaymentCompleted{bookingId}` → 6. Booking xác nhận |
| Luồng thay thế | Người chơi chuyển thiếu tiền: khoản nhận được ghi có vào ví `personal` như một khoản nạp, booking **không** xác nhận, hold tiếp tục chạy |
| Luồng lỗi | Tiền về sau khi hold hết hạn → chuyển sang FIN-06, ghi có ví, **không** phục hồi booking; Webhook trùng → bỏ qua; Không khớp mã nào → hàng chờ đối soát tay |
| Business Rules | BR-FIN-01, BR-FIN-05, BR-FIN-09, BR-FIN-10; BR-BOK-04 |
| Trạng thái liên quan | `PAYMENT_INTENT: pending → completed` |
| Quyền hạn | Chỉ chủ booking |
| Dữ liệu vào | Mã booking |
| Dữ liệu ra | Thông tin chuyển khoản; sau đó là bút toán và sự kiện |
| Phụ thuộc | BOK-06, BOK-07 |
| Trong phạm vi | Trả bằng chuyển khoản khớp mã nội dung |
| Ngoài phạm vi | Cổng thanh toán thẻ, trả góp, trả sau |
| Sơ đồ cần vẽ | Nằm trong sequence saga đặt sân; nhánh tiền về muộn nối sang FIN-06 |

**Acceptance Criteria**

- `AC-FIN-04-1` — **Given** booking 200k đang `held` và hold còn 5 phút, **When** webhook "tiền vào" 200k đúng mã về, **Then** booking chuyển `confirmed` và không có bút toán `topup` nào vào ví.
- `AC-FIN-04-2` — **Given** booking 200k và người chơi chỉ chuyển 150k, **When** webhook về, **Then** booking vẫn ở `held`, và 150k được ghi có vào ví `personal`.
- `AC-FIN-04-3` — **Given** hold đã hết hạn, **When** webhook "tiền vào" đúng mã về, **Then** booking chuyển `cancelled` và toàn bộ số tiền được ghi có vào ví `personal` qua FIN-06.
- `AC-FIN-04-4` — **Given** cùng webhook được gửi lại, **When** hệ thống xử lý, **Then** không có thay đổi thứ hai nào.

**Tiêu chí kiểm chứng:** kiểm thử tự động 4 AC; AC-FIN-04-3 là kiểm thử tích hợp bắc qua `finance-service` và `venue-booking-service`.

---

### FIN-06 — Nhận khoản thanh toán đến muộn vào số dư

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Người chơi / SePay, `venue-booking-service` |
| Mục tiêu nghiệp vụ | Không để người chơi mất tiền khi chuyển khoản về chậm hơn cửa sổ giữ chỗ |
| User Story | Là người chơi chuyển khoản chậm, tôi muốn tiền của mình vào số dư thay vì biến mất, để dùng cho lần đặt sau |
| Điều kiện trước | Có khoản tiền về gắn với một booking đã hết hạn hold |
| Sự kiện kích hoạt | Webhook "tiền vào" khớp mã của một booking không còn hiệu lực |
| Workflow chính | 1. Nhận webhook, khớp mã booking → 2. Hỏi `venue-booking-service` booking còn trong hold không → 3. Nhận trả lời đã hết hạn hoặc đã hủy → 4. Ghi bút toán `topup` vào ví `personal` → 5. **Không** phục hồi booking → 6. Thông báo cho người chơi kèm giải thích |
| Luồng thay thế | Slot đó trong lúc chờ đã có người khác đặt: không ảnh hưởng gì, tiền vẫn vào ví |
| Luồng lỗi | Webhook trùng → bỏ qua |
| Business Rules | BR-FIN-01, BR-FIN-05, BR-FIN-09; BR-BOK-04 |
| Trạng thái liên quan | Booking đã ở `cancelled`, không đổi |
| Quyền hạn | Hệ thống tự thực hiện |
| Dữ liệu vào | Sự kiện webhook |
| Dữ liệu ra | Bút toán `topup`; thông báo |
| Phụ thuộc | FIN-04, BOK-07 |
| Trong phạm vi | Ghi có tiền về muộn |
| Ngoài phạm vi | Tự động đặt lại slot, giữ slot lâu hơn cho người đã chuyển khoản |
| Sơ đồ cần vẽ | Sequence thanh toán đến muộn; nguồn [flows.md §5](../../architecture/flows.md) |

**Acceptance Criteria**

- `AC-FIN-06-1` — **Given** một booking đã `cancelled` do hết hạn hold, **When** tiền 200k về đúng mã của booking đó, **Then** ví `personal` tăng 200k và booking vẫn ở `cancelled`.
- `AC-FIN-06-2` — **Given** cùng tình huống và slot đó đã được người khác đặt và xác nhận, **When** tiền về, **Then** ví vẫn được ghi có và booking của người khác không bị ảnh hưởng.
- `AC-FIN-06-3` — **Given** người chơi nhận khoản tiền về muộn, **When** xem lịch sử giao dịch, **Then** dòng đó nêu rõ đây là khoản thanh toán đến muộn được chuyển thành số dư.

**Tiêu chí kiểm chứng:** kiểm thử tự động 3 AC.

---

### FIN-07 — Nhận hoàn tiền khi tự hủy

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Người chơi / nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Trả lại phần tiền tương ứng với mức độ báo trước của người chơi |
| User Story | Là người chơi vừa hủy booking, tôi muốn nhận lại phần tiền theo đúng chính sách đã hiển thị, để không bị bất ngờ |
| Điều kiện trước | Có sự kiện `BookingCancelled` do người chơi chủ động |
| Sự kiện kích hoạt | Nhận `BookingCancelled` kèm mức hoàn |
| Workflow chính | 1. Đọc tỷ lệ hoàn `f` từ `policySnapshot` theo khoảng cách tới giờ bắt đầu ca → 2. Ghi bút toán `refund` số tiền `gross × f` vào ví `personal` → 3. **Đảo** đúng phần `f` của doanh thu đã ghi khi booking `confirmed`: `pending` của ví `business` giảm `gross × f × (1 − r)` → 4. Đảo hoa hồng tương ứng `gross × f × r` → 5. Phần `(1 − f)` còn lại giữ nguyên ở `pending`, giải phóng bình thường theo BR-FIN-06 |
| Luồng thay thế | `f = 1`: `pending` của chủ sân giảm về đúng giá trị trước khi có booking này. `f = 0`: không có bút toán `refund` và `pending` không đổi |
| Luồng lỗi | Sự kiện lặp lại → bỏ qua theo mã sự kiện đã xử lý |
| Business Rules | BR-FIN-01, BR-FIN-05, BR-FIN-06, BR-FIN-08, BR-FIN-14, BR-FIN-15; BR-BOK-05, BR-BOK-07 |
| Trạng thái liên quan | — |
| Quyền hạn | Hệ thống tự thực hiện |
| Dữ liệu vào | Sự kiện `BookingCancelled` |
| Dữ liệu ra | Bút toán `refund`; bút toán doanh thu phần không hoàn |
| Phụ thuộc | BOK-09 |
| Trong phạm vi | Hoàn theo bậc thang, chia phần không hoàn cho chủ sân |
| Ngoài phạm vi | Hoàn ra ngân hàng, hoàn bằng voucher |
| Sơ đồ cần vẽ | Sequence hủy và hoàn tiền, dùng chung với BOK-09 |

**Acceptance Criteria**

Mọi AC dưới đây bắt đầu từ trạng thái sau khi booking 200k đã `confirmed`, tức `pending` của
ví `business` **đã có sẵn** `200k × (1 − r)`. Với `r = 10%` thì đó là 180k.

- `AC-FIN-07-1` — **Given** booking 200k hủy ở mốc hoàn 100%, **When** finance xử lý, **Then** ví `personal` tăng đúng 200k và `pending` của ví `business` **giảm** đúng `200k × (1 − r)`, trở về giá trị trước khi có booking này.
- `AC-FIN-07-2` — **Given** booking 200k hủy ở mốc hoàn 50%, **When** finance xử lý, **Then** ví `personal` tăng 100k và `pending` của ví `business` **giảm** `100k × (1 − r)`, còn lại đúng `100k × (1 − r)` cho booking này.
- `AC-FIN-07-3` — **Given** booking 200k hủy ở mốc không hoàn, **When** finance xử lý, **Then** không có bút toán `refund` nào và `pending` của ví `business` **giữ nguyên** `200k × (1 − r)`.
- `AC-FIN-07-4` — **Given** booking 200k hủy ở mốc hoàn 50%, **When** kiểm tra hoa hồng nền tảng, **Then** hoa hồng ghi nhận cho booking này là đúng `100k × r`, tức đã đảo `100k × r` so với lúc xác nhận.
- `AC-FIN-07-5` — **Given** bất kỳ mốc hủy nào, **When** cộng tổng phần hoàn về ví `personal`, phần doanh thu ròng của chủ sân và phần hoa hồng nền tảng, **Then** tổng bằng đúng 200k. Đây là kiểm chứng cho BR-FIN-15.
- `AC-FIN-07-6` — **Given** sự kiện `BookingCancelled` bị phát lại, **When** finance xử lý lần hai, **Then** không có bút toán nào được ghi thêm.

**Tiêu chí kiểm chứng:** kiểm thử tự động 6 AC, viết theo tham số `r` để không phụ thuộc giá trị hoa hồng cụ thể. `AC-FIN-07-5` chạy cho cả ba mốc hủy và là chốt chặn chống lỗi cộng dồn.

---

### FIN-08 — Nhận hoàn toàn bộ do lỗi sân hoặc nền tảng

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Người chơi / nhà cung cấp sân, Admin |
| Mục tiêu nghiệp vụ | Bảo đảm người chơi không chịu thiệt khi lỗi không thuộc về họ |
| User Story | Là người chơi bị hủy booking vì lý do từ phía sân, tôi muốn nhận lại toàn bộ số tiền, để không mất gì vì chuyện tôi không gây ra |
| Điều kiện trước | Có `BookingCancelled` mang cờ lỗi phía sân hoặc lỗi nền tảng |
| Sự kiện kích hoạt | Nhận sự kiện hủy có cờ lỗi |
| Workflow chính | 1. Bỏ qua bậc thang BR-BOK-05, đặt `f = 1` → 2. Áp dụng **đảo ba vế** theo BR-FIN-14: ví `personal` tăng toàn bộ `priceSnapshot`; `pending` của ví `business` giảm `gross × (1 − r)`; ví `platform` giảm `gross × r` → 3. Thông báo kèm lý do hủy |
| Luồng thay thế | Cùng luồng khi Admin hủy thay mặt nền tảng |
| Luồng lỗi | Sự kiện lặp lại → bỏ qua |
| Business Rules | BR-FIN-01, BR-FIN-05, BR-FIN-14, BR-FIN-15; BR-BOK-08 |
| Trạng thái liên quan | — |
| Quyền hạn | Hệ thống tự thực hiện |
| Dữ liệu vào | Sự kiện `BookingCancelled` có cờ lỗi |
| Dữ liệu ra | Bút toán `refund` toàn phần; bút toán đảo nếu cần |
| Phụ thuộc | BOK-10 |
| Trong phạm vi | Hoàn 100% và triệt tiêu doanh thu tương ứng |
| Ngoài phạm vi | Bồi thường thêm ngoài số tiền đã trả, phạt chủ sân |
| Sơ đồ cần vẽ | Nằm trong activity của BOK-10 |

**Acceptance Criteria**

- `AC-FIN-08-1` — **Given** booking 200k bị chủ sân hủy 2 giờ trước giờ chơi, **When** finance xử lý, **Then** ví `personal` tăng đúng 200k dù bậc thang thông thường sẽ là không hoàn.
- `AC-FIN-08-2` — **Given** doanh thu của booking đó đã nằm ở `pending` của ví `business`, **When** finance xử lý hủy, **Then** `pending` giảm đúng `200k × (1 − r)` và trở về giá trị trước booking.
- `AC-FIN-08-3` — **Given** hoa hồng `200k × r` đã ghi vào ví `platform` khi booking xác nhận, **When** finance xử lý hủy, **Then** ví `platform` giảm đúng `200k × r`, tức nền tảng không giữ hoa hồng của một booking không diễn ra.
- `AC-FIN-08-4` — **Given** hủy đã xử lý xong, **When** cộng tổng ba vế theo BR-FIN-15, **Then** tổng bằng đúng 200k và toàn bộ nằm ở ví `personal` của người chơi.
- `AC-FIN-08-5` — **Given** các bút toán đảo đã ghi, **When** truy vấn ledger, **Then** các bút toán gốc vẫn còn nguyên, không bị sửa hay xóa.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC. `AC-FIN-08-3` là vế mà bản nháp trước bỏ sót; `AC-FIN-08-5` là bằng chứng cho tính append-only.

---

### FIN-09 — Theo dõi doanh thu

| Trường | Nội dung |
|---|---|
| Actor chính | Nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Cho chủ sân biết đã kiếm được bao nhiêu, phần nào đã rút được |
| User Story | Là nhà cung cấp sân, tôi muốn xem doanh thu theo thời gian và biết rõ phần nào đang chờ, phần nào rút được, để quản lý dòng tiền |
| Điều kiện trước | Có vai `provider` |
| Sự kiện kích hoạt | Mở trang doanh thu |
| Ghi doanh thu (nền, không phải màn hình) | Khi `finance-service` nhận `BookingConfirmed{bookingId, gross}`, nó ghi **đồng thời hai bút toán** trong một giao dịch: `release` cộng `gross × (1 − r)` vào `pending` của ví `business` chủ sân, và `commission` cộng `gross × r` vào ví `platform`. Đây là nơi duy nhất doanh thu và hoa hồng được tạo, và là gốc để BR-FIN-14 đảo lại khi hoàn. Consumer idempotent theo `bookingId`. |
| Workflow chính (màn hình) | 1. Hiển thị `pending`, `available`, `reserved` của ví `business` → 2. Liệt kê từng khoản doanh thu gắn với booking, kèm số tiền gộp, hoa hồng đã trừ, số ròng, và thời điểm dự kiến chuyển sang `available` → 3. Cho lọc theo khoảng thời gian và theo cơ sở |
| Luồng thay thế | Khoản đang bị hoãn do có tranh chấp mở: hiển thị nhãn riêng kèm lý do |
| Luồng lỗi | Chưa có doanh thu nào → trạng thái rỗng |
| Business Rules | BR-FIN-06, BR-FIN-07, BR-FIN-08, BR-FIN-12; BR-VEN-08 |
| Trạng thái liên quan | Đọc `pending` và `available` |
| Quyền hạn | Chỉ ví kinh doanh của chính mình |
| Dữ liệu vào | Bộ lọc thời gian, cơ sở |
| Dữ liệu ra | Doanh thu gộp, hoa hồng, doanh thu ròng, `pending`, `available` |
| Phụ thuộc | BOK-07, FIN-07 |
| Trong phạm vi | Theo dõi doanh thu và trạng thái giải phóng |
| Ngoài phạm vi | Phân tích doanh thu bằng AI, dự báo, so sánh với sân khác (đã loại ở `SCOPE_BASELINE` §3) |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-FIN-09-1` — **Given** một booking 200k vừa `confirmed` với hoa hồng `r`, **When** finance nhận `BookingConfirmed`, **Then** `pending` của ví `business` tăng đúng `200k × (1 − r)` **và** ví `platform` tăng đúng `200k × r`, cả hai trong cùng một giao dịch.
- `AC-FIN-09-2` — **Given** cùng booking đó, **When** cộng khoản trừ khỏi ví `personal` khi thanh toán, khoản vào `pending` chủ sân, và khoản vào ví `platform`, **Then** ba khoản cân bằng: người chơi trả 200k, chủ sân nhận `200k × (1 − r)`, nền tảng nhận `200k × r`. Đây là gốc bảo toàn giá trị mà BR-FIN-14 dựa vào để đảo.
- `AC-FIN-09-3` — **Given** `BookingConfirmed` bị phát lại hai lần, **When** finance xử lý, **Then** doanh thu và hoa hồng chỉ được ghi một lần.
- `AC-FIN-09-4` — **Given** ca đã kết thúc và đã qua 24 giờ mà không có tranh chấp, **When** tác vụ nền chạy, **Then** khoản đó chuyển từ `pending` sang `available`.
- `AC-FIN-09-5` — **Given** một booking có tranh chấp đang `open`, **When** đã qua 24 giờ, **Then** khoản của **riêng booking đó** vẫn ở `pending`, còn các khoản khác vẫn chuyển sang `available` bình thường.
- `AC-FIN-09-6` — **Given** một booking nội bộ do chủ sân ghi tại quầy, **When** xem doanh thu, **Then** booking đó không xuất hiện và không có hoa hồng nào được tính.

**Tiêu chí kiểm chứng:** kiểm thử tự động 6 AC. `AC-FIN-09-1` và `AC-FIN-09-2` là vế mà bản nháp trước bỏ sót — chúng chứng minh hoa hồng được ghi vào ví `platform` tại thời điểm xác nhận, thứ mà toàn bộ logic đảo của BR-FIN-14 phụ thuộc vào. `AC-FIN-09-6` là bằng chứng cho `BR-VEN-08`.

---

### FIN-10 — Yêu cầu rút số dư khả dụng

| Trường | Nội dung |
|---|---|
| Actor chính | Nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Đưa doanh thu ra tài khoản ngân hàng thật |
| User Story | Là nhà cung cấp sân, tôi muốn yêu cầu rút phần doanh thu khả dụng về tài khoản ngân hàng của mình, để sử dụng tiền đã kiếm được |
| Điều kiện trước | Có vai `provider`; `available` của ví `business` đạt ngưỡng tối thiểu |
| Sự kiện kích hoạt | Gửi yêu cầu rút |
| Workflow chính | 1. Nhập số tiền và thông tin tài khoản nhận → 2. Lấy khóa trên ví, kiểm tra không vượt `available` và đạt ngưỡng tối thiểu → 3. Tạo `WITHDRAWAL_REQUEST(pending)` → 4. **Chuyển số tiền từ `available` sang `reserved`** trong cùng một giao dịch với bước 3. Đây là phân vùng nội bộ, **không sinh bút toán ledger** vì tổng tài sản không đổi → 5. Nhả khóa, yêu cầu vào hàng đợi của Admin |
| Luồng thay thế | Hủy yêu cầu khi còn `pending`: chuyển số tiền từ `reserved` trở lại `available`, cũng không sinh bút toán |
| Luồng lỗi | Số tiền vượt `available` → từ chối; Dưới ngưỡng tối thiểu → từ chối kèm ngưỡng; Đang có yêu cầu `pending` → từ chối để tránh chồng chéo đối soát |
| Business Rules | BR-FIN-03, BR-FIN-04, BR-FIN-12, BR-FIN-16 |
| Trạng thái liên quan | `WITHDRAWAL_REQUEST: [*] → pending` |
| Quyền hạn | Chỉ chủ ví kinh doanh |
| Dữ liệu vào | Số tiền, thông tin tài khoản nhận |
| Dữ liệu ra | Yêu cầu rút ở trạng thái chờ |
| Phụ thuộc | FIN-09 |
| Trong phạm vi | Tạo và hủy yêu cầu rút |
| Ngoài phạm vi | Rút tự động định kỳ, rút từ ví cá nhân |
| Sơ đồ cần vẽ | Sequence rút tiền và đối soát, dùng chung với FIN-11 |

**Acceptance Criteria**

- `AC-FIN-10-1` — **Given** ví `business` có `available` 1.000k và `reserved` 0, **When** yêu cầu rút 600k, **Then** `available` còn 400k, `reserved` thành 600k, tổng tài sản ví không đổi, và **không** bút toán ledger nào được ghi.
- `AC-FIN-10-2` — **Given** `available` là 400k, **When** yêu cầu rút 600k, **Then** hệ thống từ chối và cả `available` lẫn `reserved` không đổi.
- `AC-FIN-10-3` — **Given** đang có một yêu cầu `pending`, **When** tạo yêu cầu thứ hai, **Then** hệ thống từ chối.
- `AC-FIN-10-4` — **Given** một yêu cầu `pending` 600k, **When** chủ sân hủy nó, **Then** `reserved` về 0 và `available` trở lại 1.000k.
- `AC-FIN-10-5` — **Given** người dùng chỉ có vai `player`, **When** gọi API yêu cầu rút, **Then** hệ thống từ chối vì không có ví kinh doanh.
- `AC-FIN-10-6` — **Given** ví `business` có `available` 1.000k, **When** hai yêu cầu rút 600k được gửi **đồng thời**, **Then** đúng một yêu cầu được tạo, `reserved` bằng đúng 600k, và tổng `available + reserved` vẫn là 1.000k.

**Tiêu chí kiểm chứng:** kiểm thử tự động 6 AC. `AC-FIN-10-6` là **kiểm thử đồng thời bắt buộc**, chứng minh hai yêu cầu không thể cùng chiếm một khoản tiền.

---

### FIN-11 — Xử lý yêu cầu rút tiền

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Admin / SePay, nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Chi tiền thật và đối soát tự động, để con người chỉ phải bấm chuyển khoản |
| User Story | Là Admin, tôi muốn chuyển khoản cho nhà cung cấp rồi hệ thống tự xác nhận khi ngân hàng báo tiền ra, để không phải đánh dấu thủ công và không sai sót |
| Điều kiện trước | Có `WITHDRAWAL_REQUEST(pending)` |
| Sự kiện kích hoạt | Admin thực hiện chuyển khoản, hoặc từ chối yêu cầu |
| Workflow chính | 1. Admin mở hàng đợi, xem thông tin tài khoản nhận và nội dung chuyển khoản hệ thống sinh sẵn → 2. Chuyển khoản tay từ tài khoản nền tảng → 3. SePay gửi webhook "tiền ra" → 4. Hệ thống khớp số tiền cộng nội dung → 5. Chuyển `paid`, **trừ số tiền khỏi `reserved`** và ghi bút toán `payout` — đây là lần duy nhất tiền rời khỏi ví, `available` không bị chạm tới lần thứ hai → 6. Phát `PayoutCompleted`, thông báo cho chủ sân |
| Luồng thay thế | Từ chối yêu cầu kèm lý do bắt buộc — **chỉ khi chưa có bút toán `payout` nào** theo BR-FIN-19: `rejected`, số tiền chuyển từ `reserved` trở lại `available`, không sinh bút toán |
| Luồng lỗi | Webhook "tiền ra" không khớp yêu cầu nào → không tự chuyển trạng thái, vào hàng chờ đối soát của FIN-14; Webhook trùng → bỏ qua; Admin chuyển sai số tiền → hệ thống **không tự khớp**, yêu cầu vẫn `pending` và sự kiện vào hàng chờ FIN-14 để gán tay; Thử từ chối yêu cầu đã chi một phần → từ chối theo BR-FIN-19 |
| Business Rules | BR-FIN-01, BR-FIN-09, BR-FIN-11, BR-FIN-13, BR-FIN-19 |
| Trạng thái liên quan | `WITHDRAWAL_REQUEST: pending → paid \| rejected` |
| Quyền hạn | Chỉ vai `admin` |
| Dữ liệu vào | Mã yêu cầu; lý do khi từ chối |
| Dữ liệu ra | Trạng thái yêu cầu; bút toán `payout`; ghi vết |
| Phụ thuộc | FIN-10 |
| Trong phạm vi | Chi tay, đối soát tự động bằng webhook, từ chối có lý do |
| Ngoài phạm vi | API chi hộ tự động của ngân hàng, chi hàng loạt |
| Sơ đồ cần vẽ | Sequence rút tiền và đối soát; nguồn [flows.md §3](../../architecture/flows.md) |

**Acceptance Criteria**

- `AC-FIN-11-1` — **Given** một yêu cầu rút 600k ở `pending` với `available` 400k và `reserved` 600k, **When** webhook "tiền ra" 600k khớp nội dung về, **Then** yêu cầu chuyển `paid`, `reserved` về 0, `available` **vẫn là 400k**, đúng một bút toán `payout` 600k được ghi, và `PayoutCompleted` được phát.
- `AC-FIN-11-2` — **Given** cùng webhook được gửi lại, **When** hệ thống xử lý, **Then** không có bút toán thứ hai và số dư không đổi.
- `AC-FIN-11-3` — **Given** webhook "tiền ra" 500k trong khi yêu cầu là 600k, **When** hệ thống xử lý tự động, **Then** yêu cầu vẫn `pending`, `reserved` vẫn là 600k, không bút toán nào được ghi, và sự kiện vào hàng chờ đối soát của FIN-14 để Admin gán tay.
- `AC-FIN-11-4` — **Given** Admin từ chối một yêu cầu 600k kèm lý do, **When** xác nhận, **Then** yêu cầu chuyển `rejected`, `reserved` về 0, `available` trở lại 1.000k, không bút toán nào được ghi, và một bản ghi vết kèm lý do được tạo.
- `AC-FIN-11-5` — **Given** Admin bỏ trống lý do khi từ chối, **When** xác nhận, **Then** hệ thống từ chối thao tác.
- `AC-FIN-11-6` — **Given** một yêu cầu rút 600k đã `paid`, **When** cộng tổng `available + reserved` cộng tổng các bút toán `payout`, **Then** kết quả bằng đúng tổng doanh thu ròng đã ghi nhận. Chứng minh tiền không bị trừ hai lần.

**Tiêu chí kiểm chứng:** kiểm thử tự động 6 AC. `AC-FIN-11-1` và `AC-FIN-11-6` cùng nhau chứng minh khoản rút chỉ bị trừ đúng một lần; `AC-FIN-11-3` chứng minh hệ thống không tự khớp sai.

---

### FIN-12 — Gửi tranh chấp giao dịch

| Trường | Nội dung |
|---|---|
| Actor chính | Người chơi |
| Mục tiêu nghiệp vụ | Cho người chơi một đường khiếu nại khi giao dịch không diễn ra như cam kết |
| User Story | Là người chơi gặp vấn đề với một booking đã trả tiền, tôi muốn gửi tranh chấp kèm bằng chứng, để được xem xét hoàn tiền |
| Điều kiện trước | Booking của chính mình, ca **đã kết thúc**, và **chưa quá 24 giờ** kể từ lúc ca kết thúc |
| Sự kiện kích hoạt | Gửi tranh chấp |
| Workflow chính | 1. Chọn booking trong danh sách đủ điều kiện → 2. Nhập lý do và đính kèm bằng chứng → 3. Tạo `DISPUTE(open)` → 4. **Hoãn** việc chuyển `pending → available` cho đúng khoản doanh thu của booking đó → 5. Vào hàng đợi xử lý của Admin |
| Luồng thay thế | — |
| Luồng lỗi | Quá 24 giờ → không cho gửi, nêu rõ đã hết hạn khiếu nại; Booking chưa kết thúc → không cho gửi, gợi ý dùng BOK-09 để hủy; Đã có tranh chấp cho booking đó → từ chối |
| Business Rules | BR-FIN-06, BR-FIN-07, BR-FIN-12 |
| Trạng thái liên quan | `DISPUTE: [*] → open`; hoãn chuyển `pending → available` |
| Quyền hạn | Chỉ booking của chính mình |
| Dữ liệu vào | Mã booking, lý do, bằng chứng |
| Dữ liệu ra | Tranh chấp ở trạng thái mở |
| Phụ thuộc | BOK-08, FIN-09 |
| Trong phạm vi | Gửi tranh chấp trong cửa sổ 24 giờ |
| Ngoài phạm vi | Tranh chấp sau 24 giờ, tranh chấp do chủ sân khởi xướng, báo cáo vắng mặt (đã loại ở `SCOPE_BASELINE` §3) |
| Sơ đồ cần vẽ | Sequence tranh chấp; nguồn [flows.md §6](../../architecture/flows.md) |

**Acceptance Criteria**

- `AC-FIN-12-1` — **Given** một booking có ca kết thúc cách đây 5 giờ, **When** người chơi gửi tranh chấp, **Then** một `DISPUTE(open)` được tạo và khoản doanh thu tương ứng vẫn ở `pending` sau khi qua mốc 24 giờ.
- `AC-FIN-12-2` — **Given** một booking có ca kết thúc cách đây 30 giờ, **When** người chơi thử gửi tranh chấp, **Then** hệ thống từ chối và nêu rõ đã hết hạn khiếu nại.
- `AC-FIN-12-3` — **Given** một booking chưa tới giờ chơi, **When** người chơi thử gửi tranh chấp, **Then** hệ thống từ chối.
- `AC-FIN-12-4` — **Given** đã có tranh chấp cho một booking, **When** gửi tranh chấp thứ hai cho cùng booking, **Then** hệ thống từ chối.
- `AC-FIN-12-5` — **Given** người chơi A, **When** gọi API gửi tranh chấp cho booking của người chơi B, **Then** hệ thống từ chối.
- `AC-FIN-12-6` — **Given** một booking có ca kết thúc đúng 24 giờ trước, **When** tác vụ nền chuyển `pending → available` và yêu cầu gửi tranh chấp chạy **đồng thời**, **Then** đúng một trong hai kết quả xảy ra và không bao giờ cả hai: hoặc tranh chấp được mở và khoản tiền vẫn ở `pending`; hoặc khoản tiền đã sang `available` và tranh chấp bị từ chối vì hết hạn.

**Tiêu chí kiểm chứng:** kiểm thử tự động 6 AC. `AC-FIN-12-1` và `AC-FIN-12-2` dùng đồng hồ giả lập cho hai phía của mốc 24 giờ. `AC-FIN-12-6` là **kiểm thử đồng thời bắt buộc** chạy đúng tại ranh giới — đây mới là bằng chứng thật cho bất biến của quyết định D11, vì hai AC kia chỉ kiểm tra hai phía chứ không kiểm tra chính cuộc đua.

---

### FIN-13 — Giải quyết tranh chấp giao dịch

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Admin / người chơi, nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Ra quyết định cuối cùng và điều chỉnh dòng tiền cho đúng |
| User Story | Là Admin, tôi muốn xem bằng chứng và quyết định hoàn tiền hay bác tranh chấp, để giải quyết dứt điểm mà vẫn truy được trách nhiệm |
| Điều kiện trước | Có `DISPUTE(open)` |
| Sự kiện kích hoạt | Admin ra quyết định |
| Workflow chính | 1. Admin mở hàng đợi tranh chấp → 2. Xem bằng chứng, thông tin booking và lịch sử bút toán liên quan → 3. Chọn một trong ba: hoàn toàn bộ, hoàn một phần với số tiền nhập tay, hoặc bác → 4. Nhập lý do bắt buộc → 5. Quy số tiền hoàn thành tỷ lệ `f` rồi áp dụng **đảo ba vế** theo BR-FIN-14: ví `personal` tăng `gross × f`, `pending` giảm `gross × f × (1 − r)`, ví `platform` giảm `gross × f × r` → 6. `DISPUTE(resolved)`, gỡ hoãn phần doanh thu còn lại → 7. Thông báo cho cả hai bên |
| Luồng thay thế | Bác tranh chấp: không có bút toán tiền nào, chỉ gỡ hoãn để doanh thu chuyển sang `available` |
| Luồng lỗi | Số tiền hoàn một phần vượt quá `priceSnapshot` → từ chối; Không nhập lý do → từ chối; Tranh chấp đã `resolved` → từ chối thao tác lại |
| Business Rules | BR-FIN-01, BR-FIN-03, BR-FIN-05, BR-FIN-06, BR-FIN-13, BR-FIN-14, BR-FIN-15 |
| Trạng thái liên quan | `DISPUTE: open → resolved` |
| Quyền hạn | Chỉ vai `admin` |
| Dữ liệu vào | Mã tranh chấp, quyết định, số tiền nếu hoàn một phần, lý do |
| Dữ liệu ra | Tranh chấp đã giải quyết; bút toán điều chỉnh; ghi vết |
| Phụ thuộc | FIN-12 |
| Trong phạm vi | Ba kết quả: hoàn toàn bộ, hoàn một phần, bác |
| Ngoài phạm vi | Khiếu nại lại quyết định của Admin (đã loại ở `SCOPE_BASELINE` §3), phạt chủ sân, AI tự quyết |
| Sơ đồ cần vẽ | Sequence tranh chấp, dùng chung với FIN-12 |

**Acceptance Criteria**

- `AC-FIN-13-1` — **Given** một tranh chấp `open` cho booking 200k, **When** Admin quyết định hoàn toàn bộ kèm lý do, **Then** ví `personal` người chơi tăng 200k, `pending` của chủ sân giảm `200k × (1 − r)`, **ví `platform` giảm `200k × r`**, và tranh chấp chuyển `resolved`.
- `AC-FIN-13-2` — **Given** cùng tranh chấp đó, **When** Admin quyết định hoàn một phần 80k, **Then** ví `personal` tăng 80k, `pending` giảm `80k × (1 − r)`, ví `platform` giảm `80k × r`, và phần doanh thu còn lại được gỡ hoãn để chuyển sang `available`.
- `AC-FIN-13-8` — **Given** bất kỳ quyết định nào đã thực hiện, **When** cộng tổng ba vế theo BR-FIN-15, **Then** tổng bằng đúng `priceSnapshot` của booking.
- `AC-FIN-13-3` — **Given** cùng tranh chấp đó, **When** Admin bác kèm lý do, **Then** không có bút toán tiền nào được ghi và toàn bộ doanh thu chuyển sang `available`.
- `AC-FIN-13-4` — **Given** Admin nhập số tiền hoàn 300k cho booking 200k, **When** xác nhận, **Then** hệ thống từ chối.
- `AC-FIN-13-5` — **Given** Admin bỏ trống lý do, **When** xác nhận bất kỳ quyết định nào, **Then** hệ thống từ chối.
- `AC-FIN-13-6` — **Given** một tranh chấp đã `resolved`, **When** Admin thử quyết định lại, **Then** hệ thống từ chối.
- `AC-FIN-13-7` — **Given** bất kỳ quyết định nào đã thực hiện, **When** truy vấn ledger, **Then** các bút toán gốc vẫn còn nguyên và mọi điều chỉnh đều là bút toán mới.

**Tiêu chí kiểm chứng:** kiểm thử tự động 8 AC. `AC-FIN-13-7` là bằng chứng append-only cho toàn bộ luồng tranh chấp; `AC-FIN-13-8` bảo đảm không luồng hoàn nào đảo thiếu vế.

---

### FIN-14 — Đối soát giao dịch chưa khớp

> Chức năng **bổ sung ngày 2026-08-05** theo quyết định D15. Không có trong
> `SCOPE_BASELINE`; được thêm vì `BR-FIN-10` và `BR-FIN-11` tạo ra một hàng chờ mà không
> chức năng nào chịu trách nhiệm dọn.

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Admin / người chơi, nhà cung cấp sân |
| Mục tiêu nghiệp vụ | Bảo đảm không có khoản tiền nào đã vào hoặc ra khỏi ngân hàng nền tảng mà không có bút toán tương ứng trong ledger |
| User Story | Là Admin, tôi muốn xử lý dứt điểm các giao dịch ngân hàng mà hệ thống không tự khớp được, để mọi đồng tiền đều truy được về đúng chủ |
| Điều kiện trước | Có `SEPAY_EVENT` ở trạng thái chưa khớp |
| Sự kiện kích hoạt | Admin xử lý một sự kiện trong hàng chờ |
| Workflow chính | 1. Mở hàng chờ đối soát, sắp theo thời gian nhận → 2. Mỗi dòng hiển thị hướng tiền, số tiền, nội dung thô, thời điểm, và lý do không khớp được → 3. Chọn một trong ba cách xử lý → 4. Nhập lý do bắt buộc → 5. Ghi bút toán tương ứng và ghi vết theo BR-FIN-13 |
| Ba cách xử lý | **a. Gán tiền vào cho một người dùng** — ghi bút toán `topup` đúng số tiền thực nhận vào ví `personal` của người đó. **b. Gán tiền ra cho một yêu cầu rút** — xem bảng dưới. **c. Đánh dấu ngoài phạm vi** — giao dịch không liên quan tới nền tảng, không sinh bút toán nào |
| Cách (a) — tiền vào không khớp | Luôn ghi `topup` vào ví `personal` của người được gán. **FIN-14 không xác nhận booking hộ**, kể cả khi tiền có vẻ là để trả một booking — làm vậy sẽ bỏ qua logic hold. Người chơi nhận lại tiền vào ví và tự đặt lại. Đây là catch-all an toàn cho mọi khoản tiền vào lạc. |
| Cách (b) theo số tiền | **Khớp đúng:** yêu cầu chuyển `paid`, ghi `payout`, `reserved` về 0. **Chi thiếu:** yêu cầu chuyển `partially_paid`, ghi `payout` **đúng số thực chi**, `reserved` giảm đúng số đó, phần dư vẫn nằm ở `reserved`. **Chi vượt số yêu cầu:** sự kiện tách thành **hai đối ứng** theo BR-FIN-17 — một `payout` bằng đúng số tiền yêu cầu (yêu cầu chuyển `paid`, `reserved` về 0), và một `out_of_scope` cho phần vượt kèm lý do, ghi nhận là khoản lỗ vận hành. Tổng hai đối ứng bằng số tiền đã chi. |
| Luồng thay thế | Sau khi một yêu cầu ở `partially_paid`, Admin có hai đường: chuyển bù phần còn thiếu, webhook mới khớp và yêu cầu sang `paid`; hoặc chốt ở mức đã chi, phần dư ở `reserved` trả về `available` và yêu cầu sang `paid` với `paidAmount` nhỏ hơn `amount` |
| Luồng lỗi | Không nhập lý do → từ chối; Gán tiền vào cho tài khoản không tồn tại → từ chối; Gán tiền ra cho yêu cầu đã `paid` hoặc `rejected` → từ chối; Xử lý một sự kiện đã được xử lý → từ chối; Thử từ chối một yêu cầu đã có bút toán `payout` → từ chối theo BR-FIN-19 |
| Business Rules | BR-FIN-01, BR-FIN-02, BR-FIN-12, BR-FIN-13, BR-FIN-17, BR-FIN-19 |
| Trạng thái liên quan | `SEPAY_EVENT: unmatched → matched_manual \| out_of_scope` |
| Quyền hạn | Chỉ vai `admin` |
| Dữ liệu vào | Mã sự kiện, cách xử lý, đối tượng đích, lý do |
| Dữ liệu ra | Bút toán nếu có; trạng thái sự kiện; bản ghi vết |
| Phụ thuộc | FIN-02, FIN-11 |
| Trong phạm vi | Gán tay giao dịch chưa khớp, đánh dấu ngoài phạm vi, ghi vết |
| Ngoài phạm vi | Tự động đoán chủ sở hữu bằng AI, sửa bút toán đã ghi, tạo bút toán tùy ý ngoài ba cách trên |
| Sơ đồ cần vẽ | Sơ đồ trạng thái `SEPAY_EVENT` |

**Acceptance Criteria**

- `AC-FIN-14-1` — **Given** một webhook "tiền vào" 200k có nội dung không khớp mã nạp nào, **When** hệ thống xử lý tự động, **Then** không ví nào đổi và sự kiện xuất hiện trong hàng chờ đối soát ở trạng thái chưa khớp.
- `AC-FIN-14-2` — **Given** sự kiện đó trong hàng chờ, **When** Admin gán cho người chơi A kèm lý do, **Then** ví `personal` của A tăng đúng 200k, một bút toán `topup` được ghi, sự kiện chuyển `matched_manual`, và một bản ghi vết kèm lý do được tạo.
- `AC-FIN-14-3` — **Given** một webhook "tiền ra" 600k khớp số tiền của một yêu cầu rút `pending`, **When** Admin gán, **Then** yêu cầu chuyển `paid`, `reserved` về 0, và một bút toán `payout` được ghi.
- `AC-FIN-14-4` — **Given** một webhook "tiền ra" 500k trong khi yêu cầu rút là 600k với `reserved` 600k, **When** Admin gán cho yêu cầu đó, **Then** yêu cầu chuyển `partially_paid` với `paidAmount` 500k, một bút toán `payout` 500k được ghi, `reserved` còn đúng 100k, và `available` **không** tăng.
- `AC-FIN-14-9` — **Given** yêu cầu ở `partially_paid` với `reserved` 100k, **When** Admin chốt ở mức đã chi, **Then** 100k chuyển từ `reserved` về `available`, yêu cầu sang `paid` với `paidAmount` 500k, và **không** có bút toán nào hoàn lại 500k đã chi.
- `AC-FIN-14-10` — **Given** một yêu cầu đã có bút toán `payout` 500k, **When** Admin thử chuyển yêu cầu sang `rejected`, **Then** hệ thống từ chối. Đây là kiểm chứng cho BR-FIN-19 và ngăn đúng kịch bản chủ sân vừa giữ 500k ngoài ngân hàng vừa lấy lại 600k trong hệ thống.
- `AC-FIN-14-5` — **Given** một sự kiện đã ở trạng thái `matched_manual`, **When** Admin thử xử lý lại, **Then** hệ thống từ chối.
- `AC-FIN-14-6` — **Given** Admin bỏ trống lý do, **When** xác nhận bất kỳ cách xử lý nào, **Then** hệ thống từ chối.
- `AC-FIN-14-7` — **Given** một tập giao dịch bất kỳ, **When** duyệt từng `SEPAY_EVENT`, **Then** mỗi sự kiện có một tập đối ứng cùng hướng với tổng số tiền bằng đúng số tiền sự kiện, mỗi đối ứng thuộc bốn loại của BR-FIN-17, và không đối ứng nào bị dùng cho hai sự kiện.
- `AC-FIN-14-11` — **Given** một webhook "tiền ra" 700k trong khi yêu cầu rút là 600k với `reserved` 600k, **When** Admin xử lý, **Then** sự kiện tách thành một `payout` 600k đưa yêu cầu sang `paid` và `reserved` về 0, cộng một `out_of_scope` 100k kèm lý do; tổng hai đối ứng bằng 700k và không phần nào của 700k bị bỏ sót khỏi đối soát.
- `AC-FIN-14-8` — **Given** một kịch bản đầy đủ gồm nạp tiền, thanh toán bằng số dư, thanh toán trực tiếp qua SePay, hủy có hoàn một phần, tranh chấp và rút tiền, **When** tính tổng tiền vào trừ tổng tiền ra theo `SEPAY_EVENT` sau khi loại các sự kiện `out_of_scope`, **Then** kết quả bằng đúng tổng số dư của mọi ví `personal`, mọi ví `business` gồm cả ba phân vùng, và ví `platform`. Đây là kiểm chứng cho BR-FIN-18.

**Tiêu chí kiểm chứng:** kiểm thử tự động 11 AC. `AC-FIN-14-8` là **kiểm thử toàn vẹn ở mức hệ thống** và là bằng chứng cuối cùng cho toàn bộ mô hình tài chính — nó phủ cả đường thanh toán trực tiếp qua SePay, thứ mà công thức ở bản nháp trước bỏ sót. `AC-FIN-14-10` chặn đúng kịch bản mất tiền của nền tảng; `AC-FIN-14-11` phủ nhánh chi vượt.

> `BR-FIN-18` được đo **sau khi mọi `SEPAY_EVENT` đã được xử lý**, tức không còn sự kiện nào
> ở trạng thái `unmatched`. Trong lúc một khoản chi lệch chưa được Admin gán, ngân hàng và ví
> lệch nhau đúng bằng số tiền đó — đây là trạng thái tạm thời hợp lệ, và chính là lý do FIN-14
> tồn tại.

---

## 5. Ma trận truy vết

| Mã | User Story | AC | Workflow / sơ đồ |
|---|---|---|---|
| FIN-01 | Xem số dư và giao dịch | AC-FIN-01-1…4 | — |
| FIN-02 | Nạp số dư qua SePay | AC-FIN-02-1…4 | Sequence nạp tiền |
| FIN-03 | Thanh toán bằng số dư | AC-FIN-03-1…4 | Trong sequence saga đặt sân |
| FIN-04 | Thanh toán qua SePay | AC-FIN-04-1…4 | Trong sequence saga đặt sân |
| FIN-06 | Thanh toán đến muộn | AC-FIN-06-1…3 | Sequence thanh toán đến muộn |
| FIN-07 | Hoàn tiền khi tự hủy | AC-FIN-07-1…6 | Sequence hủy và hoàn tiền |
| FIN-08 | Hoàn toàn bộ do lỗi sân | AC-FIN-08-1…5 | Trong activity BOK-10 |
| FIN-09 | Theo dõi doanh thu + ghi doanh thu/hoa hồng | AC-FIN-09-1…6 | — |
| FIN-10 | Yêu cầu rút tiền | AC-FIN-10-1…6 | Sequence rút tiền và đối soát |
| FIN-11 | Xử lý yêu cầu rút tiền | AC-FIN-11-1…6 | Sequence rút tiền và đối soát |
| FIN-12 | Gửi tranh chấp | AC-FIN-12-1…6 | Sequence tranh chấp |
| FIN-13 | Giải quyết tranh chấp | AC-FIN-13-1…8 | Sequence tranh chấp |
| FIN-14 | Đối soát giao dịch chưa khớp | AC-FIN-14-1…11 | State `SEPAY_EVENT`; state `WITHDRAWAL_REQUEST` |

## 6. Giả định cần duyệt

| # | Giả định | Rủi ro |
|---|---|---|
| ~~A-FIN-01~~ | ✅ **Đã duyệt — [decision-log D19](../decision-log.md) chốt `r = 10%` (0.10) ngày 2026-08-06.** Mọi AC vẫn tham số hóa theo `r` nên đổi số không phải sửa spec | Không còn là giả định |
| A-FIN-02 | Ngưỡng rút tối thiểu 100.000đ | Thấp — tham số |
| A-FIN-03 | Số tiền nạp tối thiểu 10.000đ | Thấp — tham số |
| A-FIN-04 | Mỗi nhà cung cấp chỉ có **một yêu cầu rút `pending`** tại một thời điểm | **Trung bình — chạm chính sách.** Đơn giản hóa đối soát, nhưng làm chậm chủ sân rút nhiều lần |
| ~~A-FIN-05~~ | ~~Webhook không khớp đưa vào hàng chờ đối soát tay~~ | ✅ Không còn là giả định — đã thành chức năng `FIN-14` theo D15 |
| A-FIN-06 | Tranh chấp mở chỉ hoãn giải phóng doanh thu của **đúng booking đó**, không phong tỏa toàn bộ ví kinh doanh | **Trung bình — chạm chính sách** |
| A-FIN-07 | FIN-13 có đúng ba kết quả: hoàn toàn bộ, hoàn một phần, bác | Trung bình |
| A-FIN-08 | Yêu cầu rút bị trừ khỏi `available` ngay khi tạo, không đợi Admin duyệt | Trung bình — ngăn rút chồng |
| A-FIN-09 | Ghi vết thao tác tiền của Admin dùng chung cơ chế `ACCOUNT_AUDIT` hay bảng riêng của finance — chọn bảng riêng để giữ ranh giới service | Thấp |

## 7. Câu hỏi còn mở

Không có.
