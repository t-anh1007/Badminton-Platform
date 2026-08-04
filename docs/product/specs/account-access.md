---
type: functional-spec
module: account-access
phase: 1
status: approved
updated: 2026-08-05
approved: 2026-08-05
---

# Functional Spec — `account-access` (ACC)

8 chức năng, GĐ1. Nguồn: [phasing.md](../phasing.md) §3.1.

## 1. Actor và mô hình vai trò

| Actor | Vai trò hệ thống | Ghi chú |
|---|---|---|
| Khách | — | Chưa đăng nhập. Chỉ dùng được ACC-01, ACC-02, ACC-03, ACC-05. |
| Người chơi | `player` | Mọi tài khoản đều có vai này, vĩnh viễn. |
| Nhà cung cấp sân | `player` + `provider` | Vai `provider` được cộng thêm khi VEN-02 duyệt, không thay thế `player`. |
| Admin | `admin` | Seed sẵn khi triển khai. Không có luồng tự đăng ký. |

> **D3** — Vai trò là **tập hợp**, không phải giá trị đơn. `USER.role` đổi từ
> `enum` sang tập vai trò. Kéo theo: `WALLET.userId` bỏ ràng buộc `UK`, thêm
> `walletType "personal|business"`. Chi tiết ở [decision-log.md](../decision-log.md).

## 2. Business rules dùng chung

| Mã | Quy tắc |
|---|---|
| BR-ACC-01 | Email là định danh duy nhất của tài khoản, không trùng, không đổi được sau khi tạo. |
| BR-ACC-02 | Số điện thoại là thông tin liên hệ tùy chọn, không xác minh, không dùng để đăng nhập, không cần duy nhất. |
| BR-ACC-03 | Tài khoản chưa xác minh email không đăng nhập được. Xác minh là bước bắt buộc giữa đăng ký và đăng nhập. |
| BR-ACC-04 | Mật khẩu tối thiểu 8 ký tự, phải có ít nhất một chữ và một số. Lưu dưới dạng băm, không bao giờ lưu bản rõ. |
| BR-ACC-05 | Mã xác minh gồm 6 chữ số, hiệu lực 15 phút, dùng một lần. Tối đa 3 lần gửi lại trong 1 giờ cho cùng một tài khoản. |
| BR-ACC-06 | Token đặt lại mật khẩu hiệu lực 30 phút, dùng một lần, vô hiệu ngay khi phát hành token mới cho cùng tài khoản. |
| BR-ACC-07 | **Đặt lại** mật khẩu (ACC-05) thành công thu hồi **toàn bộ** refresh token, kể cả phiên vừa dùng để đặt lại. Lý do: người dùng đến ACC-05 khi đã mất kiểm soát mật khẩu, không có cơ sở để coi phiên nào là đáng tin. |
| BR-ACC-13 | **Đổi** mật khẩu (ACC-06) thành công thu hồi refresh token của **mọi thiết bị khác**, giữ lại phiên hiện tại. Lý do: người dùng vừa chứng minh biết mật khẩu cũ, nên phiên đang thao tác là đáng tin. |
| BR-ACC-08 | Sai mật khẩu 5 lần trong 15 phút với cùng một email sẽ khóa tạm việc đăng nhập 15 phút. Khóa tạm này khác `USER.status = locked`. |
| BR-ACC-09 | Tài khoản `locked` không đăng nhập được và mọi refresh token bị thu hồi ngay lập tức. |
| BR-ACC-10 | Thông báo lỗi khi đăng nhập và khi đặt lại mật khẩu không được tiết lộ email có tồn tại trong hệ thống hay không. |
| BR-ACC-11 | Mọi hành động của Admin lên tài khoản người khác đều ghi `ACCOUNT_AUDIT` append-only, kèm lý do bắt buộc. |
| BR-ACC-12 | Khóa tài khoản là vô thời hạn cho tới khi Admin khôi phục. Không có khóa tạm theo thời hạn định trước. |

## 3. Trạng thái

**`USER.status`**

```
active ──(ACC-08 khóa)──> locked ──(ACC-08 khôi phục)──> active
```

**`USER.verified`**: `false ──(ACC-02 nhập đúng mã)──> true`. Một chiều, không đảo ngược.

**`VERIFICATION`**: `pending → consumed` (nhập đúng) hoặc `pending → expired` (quá 15 phút).

**`PASSWORD_RESET`**: `pending → consumed` (đặt lại xong) hoặc `pending → expired`.

---

## 4. Chi tiết chức năng

### ACC-01 — Đăng ký tài khoản

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Khách / hệ thống gửi email |
| Mục tiêu nghiệp vụ | Tạo danh tính để người dùng bắt đầu dùng nền tảng |
| User Story | Là một người chơi cầu lông, tôi muốn tạo tài khoản bằng email, để đặt sân và tham gia cộng đồng |
| Điều kiện trước | Chưa đăng nhập; email chưa tồn tại trong hệ thống |
| Sự kiện kích hoạt | Khách gửi form đăng ký |
| Workflow chính | 1. Nhập email, mật khẩu, tên hiển thị, SĐT (tùy chọn) → 2. Hệ thống kiểm tra email chưa tồn tại và mật khẩu đạt BR-ACC-04 → 3. Tạo `USER(verified=false, status=active, role={player})` + `PLAYER_PROFILE` → 4. Sinh `VERIFICATION` và gửi mã qua email → 5. Chuyển sang màn hình nhập mã (ACC-02) |
| Luồng thay thế | Không nhập SĐT: bỏ qua, không chặn |
| Luồng lỗi | Email đã tồn tại → báo lỗi tại trường email; Mật khẩu không đạt → báo lỗi kèm yêu cầu cụ thể; Gửi email thất bại → tài khoản vẫn được tạo, hiển thị nút gửi lại mã |
| Business Rules | BR-ACC-01, BR-ACC-02, BR-ACC-04, BR-ACC-05 |
| Trạng thái liên quan | `USER.verified = false`, `USER.status = active` |
| Quyền hạn | Công khai, không cần đăng nhập |
| Dữ liệu vào | email, mật khẩu, tên hiển thị, SĐT (tùy chọn) |
| Dữ liệu ra | Xác nhận đã gửi mã tới email |
| Phụ thuộc | — |
| Trong phạm vi | Đăng ký bằng email và mật khẩu |
| Ngoài phạm vi | Đăng ký bằng SĐT, OAuth, đăng nhập mạng xã hội, mời qua liên kết |
| Sơ đồ cần vẽ | Sequence: đăng ký + xác minh (gộp với ACC-02) |

**Acceptance Criteria**

- `AC-ACC-01-1` — **Given** email chưa tồn tại và mật khẩu hợp lệ, **When** khách gửi form đăng ký, **Then** hệ thống tạo tài khoản với `verified=false`, `status=active`, vai trò `{player}`, và gửi một mã 6 chữ số tới email đó.
- `AC-ACC-01-2` — **Given** email đã tồn tại, **When** khách gửi form đăng ký, **Then** hệ thống từ chối và không tạo bản ghi nào, không gửi email nào.
- `AC-ACC-01-3` — **Given** mật khẩu ngắn hơn 8 ký tự hoặc thiếu chữ hoặc thiếu số, **When** khách gửi form, **Then** hệ thống từ chối và nêu rõ yêu cầu chưa đạt.
- `AC-ACC-01-4` — **Given** đăng ký thành công, **When** truy vấn bản ghi người dùng, **Then** trường mật khẩu là chuỗi băm, không phải bản rõ.

**Tiêu chí kiểm chứng:** kiểm thử tự động cho 4 AC trên; kiểm tra trực tiếp trong CSDL rằng không tồn tại cột lưu mật khẩu bản rõ.

---

### ACC-02 — Xác minh email

| Trường | Nội dung |
|---|---|
| Actor chính | Người chơi vừa đăng ký |
| Mục tiêu nghiệp vụ | Chứng minh người dùng kiểm soát được email đã khai, để email đó dùng được cho ACC-05 và thông báo giao dịch |
| User Story | Là người vừa đăng ký, tôi muốn xác minh email bằng mã được gửi tới, để kích hoạt tài khoản |
| Điều kiện trước | Tài khoản tồn tại với `verified=false`; có `VERIFICATION` chưa hết hạn |
| Sự kiện kích hoạt | Người dùng nhập mã, hoặc bấm gửi lại mã |
| Workflow chính | 1. Nhập mã 6 chữ số → 2. Hệ thống đối chiếu mã còn hiệu lực và chưa dùng → 3. Đặt `verified=true`, đánh dấu `VERIFICATION.consumedAt` → 4. Phát sự kiện `UserRegistered` → finance tạo ví cá nhân → 5. Chuyển sang đăng nhập |
| Luồng thay thế | Gửi lại mã: vô hiệu mã cũ, sinh mã mới, tính vào hạn mức 3 lần/giờ |
| Luồng lỗi | Mã sai → báo sai, không đổi trạng thái; Mã hết hạn → yêu cầu gửi lại; Quá 3 lần gửi lại trong 1 giờ → từ chối kèm thời điểm được gửi tiếp |
| Business Rules | BR-ACC-03, BR-ACC-05 |
| Trạng thái liên quan | `USER.verified: false → true`; `VERIFICATION: pending → consumed\|expired` |
| Quyền hạn | Chỉ chủ tài khoản, qua mã gửi tới chính email đó |
| Dữ liệu vào | Mã 6 chữ số |
| Dữ liệu ra | Kết quả xác minh; ví cá nhân được tạo ở finance |
| Phụ thuộc | ACC-01 |
| Trong phạm vi | Xác minh qua email |
| Ngoài phạm vi | Xác minh qua SMS, xác minh lại khi đổi email (email không đổi được — BR-ACC-01) |
| Sơ đồ cần vẽ | Sequence đăng ký + xác minh; nguồn: [flows.md §1](../../architecture/flows.md) |

**Acceptance Criteria**

- `AC-ACC-02-1` — **Given** mã còn hiệu lực và chưa dùng, **When** người dùng nhập đúng mã, **Then** `verified` chuyển sang `true` và sự kiện `UserRegistered` được phát đúng một lần.
- `AC-ACC-02-2` — **Given** mã đã quá 15 phút, **When** người dùng nhập mã đó, **Then** hệ thống từ chối và `verified` giữ nguyên `false`.
- `AC-ACC-02-3` — **Given** mã đã dùng một lần thành công, **When** nhập lại đúng mã đó, **Then** hệ thống từ chối.
- `AC-ACC-02-4` — **Given** đã gửi lại mã 3 lần trong 1 giờ, **When** yêu cầu gửi lại lần thứ tư, **Then** hệ thống từ chối và cho biết thời điểm được gửi tiếp.
- `AC-ACC-02-5` — **Given** xác minh thành công, **When** kiểm tra finance, **Then** tồn tại đúng một ví `personal` với số dư 0 cho người dùng đó.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC; kiểm thử tích hợp cho việc tiêu thụ `UserRegistered` đúng một lần khi phát lại sự kiện.

---

### ACC-03 — Đăng nhập

| Trường | Nội dung |
|---|---|
| Actor chính | Tất cả người dùng đã xác minh |
| Mục tiêu nghiệp vụ | Cấp phiên làm việc để thực hiện các hành động cần danh tính |
| User Story | Là người dùng đã có tài khoản, tôi muốn đăng nhập bằng email và mật khẩu, để dùng các chức năng cá nhân |
| Điều kiện trước | Tài khoản tồn tại, `verified=true`, `status=active` |
| Sự kiện kích hoạt | Gửi form đăng nhập |
| Workflow chính | 1. Nhập email và mật khẩu → 2. Đối chiếu băm mật khẩu → 3. Kiểm tra `verified` và `status` → 4. Cấp access token và refresh token kèm tập vai trò → 5. Vào trang chính theo vai trò |
| Luồng thay thế | Người dùng có vai `provider`: giao diện hiển thị thêm khu vực quản lý sân; vai `player` vẫn giữ nguyên |
| Luồng lỗi | Sai mật khẩu → thông báo chung theo BR-ACC-10; Chưa xác minh → chuyển sang ACC-02; `status=locked` → báo tài khoản bị khóa kèm hướng dẫn liên hệ hỗ trợ; Quá 5 lần sai → khóa tạm 15 phút |
| Business Rules | BR-ACC-03, BR-ACC-08, BR-ACC-09, BR-ACC-10 |
| Trạng thái liên quan | Đọc `USER.status`, `USER.verified` |
| Quyền hạn | Công khai |
| Dữ liệu vào | email, mật khẩu |
| Dữ liệu ra | Access token, refresh token, tập vai trò, hồ sơ rút gọn |
| Phụ thuộc | ACC-02 |
| Trong phạm vi | Đăng nhập bằng email và mật khẩu |
| Ngoài phạm vi | Ghi nhớ thiết bị, xác thực hai lớp, xem và thu hồi phiên (đã loại ở `SCOPE_BASELINE` §3) |
| Sơ đồ cần vẽ | Không cần sơ đồ riêng |

**Acceptance Criteria**

- `AC-ACC-03-1` — **Given** tài khoản đã xác minh và đang hoạt động, **When** đăng nhập đúng mật khẩu, **Then** hệ thống cấp access token và refresh token, trong đó có đầy đủ tập vai trò của người dùng.
- `AC-ACC-03-2` — **Given** tài khoản `verified=false`, **When** đăng nhập đúng mật khẩu, **Then** hệ thống từ chối cấp token và điều hướng sang xác minh.
- `AC-ACC-03-3` — **Given** tài khoản `status=locked`, **When** đăng nhập đúng mật khẩu, **Then** hệ thống từ chối cấp token.
- `AC-ACC-03-4` — **Given** email không tồn tại, **When** đăng nhập, **Then** thông báo lỗi giống hệt trường hợp sai mật khẩu.
- `AC-ACC-03-5` — **Given** đã sai mật khẩu 5 lần trong 15 phút, **When** thử lần thứ sáu kể cả với mật khẩu đúng, **Then** hệ thống từ chối và cho biết thời điểm được thử lại.
- `AC-ACC-03-6` — **Given** người dùng có cả hai vai `player` và `provider`, **When** đăng nhập, **Then** token chứa cả hai vai và giao diện cho phép cả đặt sân lẫn quản lý sân.

**Tiêu chí kiểm chứng:** kiểm thử tự động 6 AC; kiểm tra thủ công rằng thông báo lỗi ở AC-ACC-03-4 trùng khớp từng ký tự.

---

### ACC-04 — Đăng xuất

| Trường | Nội dung |
|---|---|
| Actor chính | Người dùng đã đăng nhập |
| Mục tiêu nghiệp vụ | Kết thúc phiên trên thiết bị hiện tại |
| User Story | Là người dùng đang đăng nhập, tôi muốn đăng xuất, để người khác dùng chung thiết bị không truy cập được tài khoản của tôi |
| Điều kiện trước | Đang có phiên hợp lệ |
| Sự kiện kích hoạt | Bấm đăng xuất |
| Workflow chính | 1. Gửi yêu cầu đăng xuất kèm refresh token → 2. Đưa refresh token vào danh sách thu hồi ở Redis → 3. Xóa token phía client → 4. Về trang công khai |
| Luồng thay thế | — |
| Luồng lỗi | Token đã hết hạn hoặc đã thu hồi → vẫn coi là đăng xuất thành công, không báo lỗi |
| Business Rules | — |
| Trạng thái liên quan | — |
| Quyền hạn | Chỉ chủ phiên |
| Dữ liệu vào | Refresh token |
| Dữ liệu ra | Xác nhận |
| Phụ thuộc | ACC-03 |
| Trong phạm vi | Đăng xuất thiết bị hiện tại |
| Ngoài phạm vi | Đăng xuất toàn bộ thiết bị theo yêu cầu chủ động (chỉ xảy ra gián tiếp qua BR-ACC-07) |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-ACC-04-1` — **Given** người dùng đang đăng nhập, **When** đăng xuất, **Then** refresh token đó không còn dùng để lấy access token mới được.
- `AC-ACC-04-2` — **Given** refresh token đã bị thu hồi, **When** gọi đăng xuất lần nữa với chính token đó, **Then** hệ thống trả về thành công chứ không trả lỗi.

**Tiêu chí kiểm chứng:** kiểm thử tự động 2 AC.

---

### ACC-05 — Đặt lại mật khẩu

| Trường | Nội dung |
|---|---|
| Actor chính | Người dùng quên mật khẩu |
| Mục tiêu nghiệp vụ | Khôi phục quyền truy cập mà không cần biết mật khẩu cũ |
| User Story | Là người dùng quên mật khẩu, tôi muốn đặt lại qua email, để lấy lại tài khoản |
| Điều kiện trước | Chưa đăng nhập |
| Sự kiện kích hoạt | Gửi yêu cầu quên mật khẩu |
| Workflow chính | 1. Nhập email → 2. Nếu tài khoản tồn tại, sinh `PASSWORD_RESET` và gửi liên kết chứa token → 3. Người dùng mở liên kết, nhập mật khẩu mới → 4. Kiểm tra token còn hiệu lực và mật khẩu đạt BR-ACC-04 → 5. Cập nhật băm mật khẩu, đánh dấu token đã dùng → 6. Thu hồi toàn bộ refresh token → 7. Yêu cầu đăng nhập lại |
| Luồng thay thế | Yêu cầu lần hai khi token cũ chưa dùng: token cũ bị vô hiệu ngay, chỉ token mới dùng được |
| Luồng lỗi | Email không tồn tại → vẫn hiển thị cùng thông báo theo BR-ACC-10, không gửi email; Token hết hạn hoặc đã dùng → yêu cầu tạo lại; Mật khẩu mới không đạt → báo lỗi cụ thể |
| Business Rules | BR-ACC-04, BR-ACC-06, BR-ACC-07, BR-ACC-10 |
| Trạng thái liên quan | `PASSWORD_RESET: pending → consumed\|expired` |
| Quyền hạn | Công khai; quyền thật nằm ở việc kiểm soát hòm thư |
| Dữ liệu vào | email; sau đó token và mật khẩu mới |
| Dữ liệu ra | Thông báo trung tính; kết quả đặt lại |
| Phụ thuộc | ACC-01 |
| Trong phạm vi | Đặt lại qua email |
| Ngoài phạm vi | Đặt lại qua SMS, câu hỏi bảo mật, hỗ trợ đặt lại thủ công bởi Admin |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-ACC-05-1` — **Given** email tồn tại, **When** yêu cầu đặt lại mật khẩu, **Then** hệ thống gửi một liên kết chứa token hiệu lực 30 phút.
- `AC-ACC-05-2` — **Given** email không tồn tại, **When** yêu cầu đặt lại, **Then** thông báo hiển thị giống hệt trường hợp email tồn tại và không email nào được gửi.
- `AC-ACC-05-3` — **Given** token còn hiệu lực, **When** đặt mật khẩu mới hợp lệ, **Then** mật khẩu được cập nhật và **toàn bộ** refresh token bị thu hồi, kể cả phiên vừa thực hiện thao tác đặt lại; người dùng phải đăng nhập lại.
- `AC-ACC-05-4` — **Given** token đã dùng một lần, **When** dùng lại token đó, **Then** hệ thống từ chối.
- `AC-ACC-05-5` — **Given** đã yêu cầu đặt lại lần thứ hai, **When** dùng token của lần thứ nhất, **Then** hệ thống từ chối.

**Tiêu chí kiểm chứng:** kiểm thử tự động 5 AC; kiểm thử thủ công rằng phản hồi ở AC-ACC-05-2 không khác biệt về nội dung lẫn thời gian phản hồi ở mức nhận biết được.

---

### ACC-06 — Đổi mật khẩu

| Trường | Nội dung |
|---|---|
| Actor chính | Người dùng đã đăng nhập |
| Mục tiêu nghiệp vụ | Thay mật khẩu chủ động khi vẫn còn quyền truy cập |
| User Story | Là người dùng đang đăng nhập, tôi muốn đổi mật khẩu, để giữ tài khoản an toàn |
| Điều kiện trước | Đang đăng nhập |
| Sự kiện kích hoạt | Gửi form đổi mật khẩu |
| Workflow chính | 1. Nhập mật khẩu hiện tại và mật khẩu mới → 2. Đối chiếu mật khẩu hiện tại → 3. Kiểm tra mật khẩu mới đạt BR-ACC-04 và khác mật khẩu cũ → 4. Cập nhật băm → 5. Thu hồi toàn bộ refresh token trừ phiên hiện tại |
| Luồng thay thế | — |
| Luồng lỗi | Sai mật khẩu hiện tại → từ chối; Mật khẩu mới trùng mật khẩu cũ → từ chối |
| Business Rules | BR-ACC-04, BR-ACC-13 |
| Trạng thái liên quan | — |
| Quyền hạn | Chỉ chủ tài khoản |
| Dữ liệu vào | Mật khẩu hiện tại, mật khẩu mới |
| Dữ liệu ra | Xác nhận |
| Phụ thuộc | ACC-03 |
| Trong phạm vi | Đổi mật khẩu khi biết mật khẩu cũ |
| Ngoài phạm vi | Bắt buộc đổi định kỳ, lịch sử mật khẩu cũ |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-ACC-06-1` — **Given** người dùng nhập đúng mật khẩu hiện tại và mật khẩu mới hợp lệ, **When** gửi form, **Then** mật khẩu được cập nhật và lần đăng nhập sau chỉ chấp nhận mật khẩu mới.
- `AC-ACC-06-2` — **Given** người dùng nhập sai mật khẩu hiện tại, **When** gửi form, **Then** hệ thống từ chối và mật khẩu không đổi.
- `AC-ACC-06-3` — **Given** đổi mật khẩu thành công, **When** dùng refresh token từ một thiết bị khác, **Then** token đó bị từ chối, còn phiên hiện tại vẫn hoạt động.

**Tiêu chí kiểm chứng:** kiểm thử tự động 3 AC.

---

### ACC-07 — Quản lý hồ sơ cá nhân

| Trường | Nội dung |
|---|---|
| Actor chính | Người chơi |
| Mục tiêu nghiệp vụ | Giữ thông tin hiển thị và liên hệ đúng, để người khác nhận ra và liên lạc được |
| User Story | Là người chơi, tôi muốn cập nhật tên hiển thị, ảnh đại diện và số liên hệ, để hồ sơ của tôi phản ánh đúng con người tôi |
| Điều kiện trước | Đang đăng nhập |
| Sự kiện kích hoạt | Lưu thay đổi hồ sơ |
| Workflow chính | 1. Mở trang hồ sơ → 2. Sửa tên hiển thị, ảnh đại diện, SĐT, tùy chọn hiển thị → 3. Lưu → 4. Hệ thống cập nhật `PLAYER_PROFILE` |
| Luồng thay thế | Người dùng có vai `provider`: trang hồ sơ cá nhân và hồ sơ cơ sở sân (VEN-03) là hai nơi tách biệt, không trộn lẫn |
| Luồng lỗi | Ảnh vượt dung lượng cho phép → từ chối kèm giới hạn; Tên hiển thị rỗng → từ chối |
| Business Rules | BR-ACC-01 (email không đổi được), BR-ACC-02 |
| Trạng thái liên quan | — |
| Quyền hạn | Chỉ chủ hồ sơ được sửa. Admin xem được nhưng không sửa hộ. |
| Dữ liệu vào | Tên hiển thị, ảnh đại diện, SĐT, tùy chọn hiển thị |
| Dữ liệu ra | Hồ sơ đã cập nhật |
| Phụ thuộc | ACC-03 |
| Trong phạm vi | Sửa thông tin hiển thị và liên hệ |
| Ngoài phạm vi | Đổi email, xóa tài khoản, xuất dữ liệu cá nhân (đã loại ở `SCOPE_BASELINE` §3), khai báo trình độ (thuộc MMP-09, GĐ2) |
| Sơ đồ cần vẽ | Không cần |

**Acceptance Criteria**

- `AC-ACC-07-1` — **Given** người dùng đang đăng nhập, **When** cập nhật tên hiển thị và lưu, **Then** tên mới hiển thị ở mọi nơi tham chiếu hồ sơ đó.
- `AC-ACC-07-2` — **Given** người dùng đang xem trang hồ sơ, **When** thử sửa email, **Then** giao diện không cho phép và API từ chối nếu bị gọi trực tiếp.
- `AC-ACC-07-3` — **Given** người dùng A đang đăng nhập, **When** gọi API cập nhật hồ sơ của người dùng B, **Then** hệ thống từ chối.

**Tiêu chí kiểm chứng:** kiểm thử tự động 3 AC, trong đó AC-ACC-07-3 gọi thẳng API không qua giao diện.

---

### ACC-08 — Quản lý quyền truy cập tài khoản (khóa / khôi phục)

| Trường | Nội dung |
|---|---|
| Actor chính / liên quan | Admin / người bị khóa, nhà cung cấp sân bị ảnh hưởng |
| Mục tiêu nghiệp vụ | Ngăn một tài khoản tiếp tục hành vi gây hại, và đảo ngược được khi cần |
| User Story | Là Admin, tôi muốn khóa hoặc khôi phục một tài khoản kèm lý do, để bảo vệ nền tảng mà vẫn truy được trách nhiệm |
| Điều kiện trước | Admin đang đăng nhập; tài khoản đích tồn tại |
| Sự kiện kích hoạt | Admin thực hiện khóa hoặc khôi phục |
| Workflow chính | 1. Admin tìm tài khoản → 2. Chọn khóa, nhập lý do bắt buộc → 3. Hệ thống đặt `status=locked`, thu hồi toàn bộ refresh token, ghi `ACCOUNT_AUDIT` → 4. Phát `AccountLocked` → 5. Nếu tài khoản có vai `provider`: mọi cơ sở của họ bị ẩn khỏi tìm kiếm và không nhận booking mới; **booking đã xác nhận giữ nguyên** |
| Luồng thay thế | Khôi phục: đặt `status=active`, ghi audit kèm lý do; cơ sở hiện lại trong tìm kiếm. Hủy dứt điểm các booking tương lai: Admin đi qua BOK-10 cho từng booking, kích FIN-08 hoàn 100% |
| Luồng lỗi | Không nhập lý do → từ chối; Khóa chính tài khoản Admin đang đăng nhập → từ chối |
| Business Rules | BR-ACC-09, BR-ACC-11, BR-ACC-12 |
| Trạng thái liên quan | `USER.status: active ↔ locked` |
| Quyền hạn | Chỉ vai `admin`. Ràng buộc bất biến #7: chỉ một quyền vận hành Admin, không phân nhỏ. |
| Dữ liệu vào | Tài khoản đích, hành động, lý do |
| Dữ liệu ra | Trạng thái mới; bản ghi audit; sự kiện `AccountLocked` |
| Phụ thuộc | ACC-01; ảnh hưởng tới VEN-03, VEN-08, BOK-01, BOK-04 |
| Trong phạm vi | Khóa và khôi phục tài khoản, ghi vết |
| Ngoài phạm vi | Khóa có thời hạn, cảnh cáo, hạ vai trò, xóa tài khoản |
| Sơ đồ cần vẽ | Sơ đồ trạng thái `USER.status`; sơ đồ hoạt động cho hệ quả lên cơ sở sân và booking |

**Acceptance Criteria**

- `AC-ACC-08-1` — **Given** Admin nhập lý do, **When** khóa một tài khoản, **Then** `status` chuyển `locked`, mọi refresh token của tài khoản đó bị thu hồi, và một bản ghi `ACCOUNT_AUDIT` được tạo với đúng lý do đó.
- `AC-ACC-08-2` — **Given** Admin không nhập lý do, **When** bấm khóa, **Then** hệ thống từ chối và trạng thái không đổi.
- `AC-ACC-08-3` — **Given** một nhà cung cấp có 3 booking đã xác nhận trong tương lai, **When** tài khoản đó bị khóa, **Then** cả 3 booking giữ nguyên trạng thái `confirmed`, còn các cơ sở của họ không còn xuất hiện trong kết quả tìm sân.
- `AC-ACC-08-4` — **Given** một nhà cung cấp đang bị khóa, **When** một người chơi thử tạo booking mới ở cơ sở của họ bằng cách gọi thẳng API, **Then** hệ thống từ chối.
- `AC-ACC-08-5` — **Given** tài khoản đang `locked`, **When** Admin khôi phục, **Then** `status` trở về `active`, các cơ sở hiện lại trong tìm kiếm, và một bản ghi audit thứ hai được tạo.
- `AC-ACC-08-6` — **Given** người dùng không có vai `admin`, **When** gọi API khóa tài khoản, **Then** hệ thống từ chối.

**Tiêu chí kiểm chứng:** kiểm thử tự động 6 AC; AC-ACC-08-3 và AC-ACC-08-4 là kiểm thử tích hợp chạm cả `account-service` lẫn `venue-booking-service`.

---

## 5. Ma trận truy vết

| Mã | User Story | AC | Workflow / sơ đồ |
|---|---|---|---|
| ACC-01 | Tạo tài khoản bằng email | AC-ACC-01-1…4 | Sequence đăng ký + xác minh |
| ACC-02 | Xác minh email bằng mã | AC-ACC-02-1…5 | Sequence đăng ký + xác minh |
| ACC-03 | Đăng nhập bằng email | AC-ACC-03-1…6 | — |
| ACC-04 | Đăng xuất thiết bị hiện tại | AC-ACC-04-1…2 | — |
| ACC-05 | Đặt lại mật khẩu qua email | AC-ACC-05-1…5 | — |
| ACC-06 | Đổi mật khẩu khi biết mật khẩu cũ | AC-ACC-06-1…3 | — |
| ACC-07 | Cập nhật hồ sơ hiển thị | AC-ACC-07-1…3 | — |
| ACC-08 | Khóa và khôi phục tài khoản | AC-ACC-08-1…6 | State `USER.status` + activity hệ quả |

## 6. Giả định cần duyệt

| # | Giả định | Rủi ro nếu sai |
|---|---|---|
| A-ACC-01 | Tài khoản Admin được seed sẵn khi triển khai; không có luồng tự đăng ký hay thăng cấp Admin | Thấp — thêm sau được |
| A-ACC-02 | Mã xác minh 6 chữ số, hạn 15 phút, tối đa 3 lần gửi lại mỗi giờ | Thấp — chỉ là tham số |
| A-ACC-03 | Token đặt lại mật khẩu hạn 30 phút, dùng một lần | Thấp |
| A-ACC-04 | Mật khẩu tối thiểu 8 ký tự, có chữ và số | Thấp |
| A-ACC-05 | Sai mật khẩu 5 lần trong 15 phút thì khóa tạm 15 phút | Thấp |
| A-ACC-06 | Đặt lại mật khẩu thu hồi mọi phiên kể cả phiên hiện tại (BR-ACC-07); đổi mật khẩu chỉ thu hồi các thiết bị khác (BR-ACC-13) | Trung bình — chạm chính sách phiên đăng nhập |
| A-ACC-07 | `PLAYER_PROFILE.visibility` để mặc định công khai ở GĐ1; chỉ có ý nghĩa thật khi có Player Passport ở GĐ2 | Thấp |
| A-ACC-08 | Admin xem được hồ sơ người dùng nhưng không sửa hộ | Trung bình — chạm quyền hạn |

## 7. Câu hỏi còn mở

Không có. Toàn bộ 8 chức năng đủ context để triển khai.
