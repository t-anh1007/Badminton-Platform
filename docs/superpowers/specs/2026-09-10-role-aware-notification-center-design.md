# Trung tâm thông báo đa vai trò — thiết kế đã duyệt

Ngày: 2026-09-10  
Trạng thái: Đã duyệt mockup phương án B — ưu tiên hành động  
Phạm vi: thông báo trong ứng dụng cho người chơi, chủ sân và quản trị viên

## 1. Kết quả cần đạt

Mọi tài khoản đã đăng nhập có một biểu tượng chuông tiêu chuẩn trên thanh điều
hướng. Badge trên chuông hiển thị số thông báo chưa đọc. Nhấn chuông mở một cửa
sổ nhỏ gồm các thông báo gần nhất của tất cả vai trò, trong đó việc cần xử lý được
đưa lên trước. Người dùng có thể mở trang lịch sử, lọc theo vai trò và trạng thái
đọc, chuyển trang, điều chỉnh nhóm thông báo, đồng thời nhận cập nhật mới trong
1–3 giây khi kết nối mạng bình thường.

Thông báo có đối tượng nghiệp vụ sẽ điều hướng tới đúng booking, kèo, tranh chấp,
yêu cầu hỗ trợ hoặc màn hình quản trị tương ứng. Việc mở một thông báo đánh dấu nó
đã đọc và cập nhật badge. Tính năng chỉ gửi thông báo trong ứng dụng; email, SMS,
web push và ứng dụng di động nằm ngoài phạm vi.

## 2. Quyết định sản phẩm đã chốt

- Dùng bố cục **B — ưu tiên hành động**.
- Dùng biểu tượng chuông nét tiêu chuẩn, có tên truy cập `Thông báo` và badge đỏ.
- Dropdown gộp thông báo của tất cả vai trò trên cùng một tài khoản. Mỗi mục có
  nhãn vai trò khi ngữ cảnh có thể gây nhầm lẫn.
- Trang `Tất cả thông báo` có bộ lọc `Tất cả`, `Chưa đọc`, `Người chơi`, `Chủ sân`
  và `Quản trị viên`; chỉ hiện các vai trò tài khoản thực sự sở hữu.
- Mặc định chỉ bật các nhóm quan trọng. Người dùng có thể bật hoặc tắt từng nhóm
  không bắt buộc trong cài đặt.
- Mở dropdown không tự đánh dấu đã đọc. Chỉ hành động vào từng mục hoặc
  `Đã đọc tất cả` mới thay đổi trạng thái đọc.
- Badge đếm toàn bộ thông báo chưa đọc của tài khoản, không phụ thuộc vai trò đang
  hoạt động hoặc bộ lọc đang chọn.

## 3. Nhóm thông báo và mức ưu tiên

| Nhóm | Ví dụ | Mặc định | Có thể tắt |
|---|---|---:|---:|
| Booking | giữ chỗ sắp hết hạn, xác nhận, hủy, đổi sân, booking mới cho chủ sân | Bật | Có |
| Thanh toán và tài chính | thanh toán thành công/thất bại, hoàn tiền, doanh thu khả dụng, rút tiền | Bật | Có |
| Kèo | có lời mời hoặc đề xuất, giữ chỗ sắp hết hạn, đủ người, hủy kèo | Bật | Có |
| Tranh chấp | tiếp nhận, cần bổ sung, có quyết định | Bật | Có |
| Hỗ trợ và kiểm duyệt | ticket có phản hồi, báo cáo hoặc nội dung cần admin xử lý | Bật | Có |
| Tài khoản và bảo mật | tài khoản bị khóa/khôi phục, thay đổi bảo mật quan trọng | Bật | Không |
| Cộng đồng | bình luận hoặc tương tác mới | Tắt | Có |

`Cần bạn xử lý` không phải một nhóm cài đặt. Đây là mức hiển thị được suy ra từ
thông báo có hành động còn hiệu lực, ví dụ thanh toán trước khi giữ chỗ hết hạn,
bổ sung bằng chứng hoặc xử lý một tranh chấp. Khi hành động hết hiệu lực, mục vẫn
ở lịch sử nhưng không còn nằm trong phần ưu tiên và CTA được thay bằng liên kết
xem chi tiết nếu còn đích đến hợp lệ.

Tắt một nhóm chỉ ảnh hưởng thông báo mới được tạo sau khi lưu cài đặt. Lịch sử đã
có không bị xóa hoặc ẩn. Phiên bản đầu không có chức năng xóa lịch sử.

## 4. Trải nghiệm giao diện

### 4.1 Thanh điều hướng và dropdown

Chuông nằm ngay trước avatar trên desktop. Trên mobile, chuông vẫn hiển thị trực
tiếp trên thanh trên cùng; danh sách mở thành sheet chiếm chiều ngang màn hình.
Badge hiển thị `1`–`99`; từ 100 thông báo trở lên hiển thị `99+`.

Dropdown rộng khoảng 360–400 px và tối đa năm mục gần nhất:

1. Header: `Thông báo`, số mục mới và `Đã đọc tất cả`.
2. `Cần bạn xử lý`: chỉ xuất hiện khi có hành động còn hiệu lực.
3. `Mới cập nhật`: các thông báo còn lại theo thời gian mới nhất.
4. Footer: `Xem toàn bộ lịch sử` dẫn tới `/notifications`.

Mỗi mục gồm icon theo nhóm, tiêu đề ngắn, mô tả, thời gian tương đối, nhãn vai trò
khi cần và chấm chưa đọc. Mục ưu tiên được phép có tối đa hai CTA; các mục thường
toàn bộ hàng là vùng nhấn. Nhấn mục có đích đến sẽ gửi yêu cầu đánh dấu đã đọc rồi
điều hướng ngay; lỗi ghi trạng thái không được chặn điều hướng và lần đồng bộ tiếp
theo sẽ khôi phục trạng thái đúng từ máy chủ.

Chuông hỗ trợ bàn phím, `aria-expanded`, `aria-controls`, đóng bằng Escape, đóng khi
nhấn ngoài và trả focus về nút chuông. Dropdown không tranh chấp vùng mở với menu
avatar; mở một menu sẽ đóng menu còn lại.

### 4.2 Trang lịch sử

Trang `/notifications` hiển thị tiêu đề, mô tả ngắn, nút `Cài đặt thông báo`, các
bộ lọc và danh sách nhóm theo ngày. Mỗi trang có 20 mục, sắp xếp
`createdAt DESC, id DESC` để ổn định khi có mục mới. Phân trang có nút trước/sau,
số trang hiện tại và giữ lại bộ lọc trong URL.

Lọc vai trò dùng `targetRole`; lọc `Chưa đọc` dùng `readAt IS NULL`. Dropdown luôn
gộp mọi vai trò và không bị ảnh hưởng bởi bộ lọc trên trang lịch sử. Khi tài khoản
chỉ có một vai trò, bộ lọc vai trò tương ứng được ẩn để giảm nhiễu.

Trạng thái giao diện:

- Đang tải: skeleton ngắn đúng số vùng chính.
- Rỗng: giải thích chưa có thông báo phù hợp với bộ lọc, có nút xóa bộ lọc.
- Lỗi tải: giữ dữ liệu cũ nếu có và cung cấp nút thử lại.
- Mất realtime: vẫn đọc và thao tác bằng API bình thường; kết nối tự khôi phục.
- Đích đã mất hoặc không còn quyền: vẫn đánh dấu đã đọc, hiển thị giải thích ngắn
  và ở lại trang lịch sử thay vì chuyển tới lỗi kỹ thuật.

### 4.3 Cài đặt

Cài đặt là modal hoặc panel nhỏ trên trang lịch sử, nhóm công tắc theo vai trò và
loại thông báo. Tài khoản đa vai trò có thể đặt khác nhau cho từng vai trò. Nhóm
`Tài khoản và bảo mật` hiển thị trạng thái bắt buộc và không có công tắc tắt.

## 5. Kiến trúc và quyền sở hữu

Không tạo notification-service mới. Theo kiến trúc hiện hành, thông báo là năng
lực cross-cutting; module hộp thư thông báo được đặt trong `account-service` vì
service này đã sở hữu danh tính, vai trò và xác thực người nhận.

Mỗi service nghiệp vụ vẫn là nguồn sự thật cho trạng thái của chính nó. Khi một
thay đổi đủ điều kiện thông báo xảy ra, service sở hữu nghiệp vụ ghi domain event
vào outbox trong cùng transaction. RabbitMQ chuyển event tới notification
projector trong `account-service`. Projector chỉ xử lý danh sách event được hỗ trợ,
áp dụng cài đặt của người nhận và ghi một notification idempotent.

Không sao chép toàn bộ booking, giao dịch hay tranh chấp vào hộp thư. Notification
chỉ giữ snapshot chữ tối thiểu để đọc được lịch sử và một tham chiếu có cấu trúc
tới đối tượng gốc. API chi tiết nghiệp vụ vẫn quyết định quyền xem và trạng thái
hiện tại khi người dùng điều hướng.

### 5.1 Mô hình dữ liệu

`Notification`:

- `id`
- `userId`
- `targetRole`: `player | provider | admin`
- `category`: một trong các nhóm ở mục 3
- `kind`: mã loại ổn định, ví dụ `booking.confirmed`
- `title`, `body`: snapshot nội dung tiếng Việt, không chứa bí mật
- `priority`: `action_required | update`
- `entityType`, `entityId`: tham chiếu có cấu trúc; có thể null
- `actionKind`: mã điều hướng cho phép; có thể null
- `actionExpiresAt`: thời điểm CTA không còn hiệu lực; có thể null
- `sourceEventId`: khóa idempotency duy nhất theo nguồn event
- `readAt`: null khi chưa đọc
- `createdAt`

Chỉ mục cần có: `(userId, createdAt DESC, id DESC)`,
`(userId, readAt, createdAt DESC)` và unique `(sourceEventId, userId, targetRole)`.

`NotificationPreference` dùng khóa `(userId, targetRole, category)`, lưu `enabled`
và `updatedAt`. Thiếu bản ghi nghĩa là dùng giá trị mặc định ở mục 3.

### 5.2 Điều hướng an toàn

Backend không lưu URL tùy ý. Frontend ánh xạ `actionKind` cùng `entityId` sang các
route đã cho phép, ví dụ:

- `booking.view` → trang chi tiết booking phù hợp vai trò;
- `booking.pay` → bước thanh toán của booking;
- `match.view` → chi tiết kèo;
- `dispute.view` → tab tranh chấp và mục tương ứng;
- `support.view` → ticket tương ứng;
- `admin.dispute.review` → chi tiết tranh chấp quản trị.

Route đích vẫn kiểm tra quyền bằng API nghiệp vụ. Payload thông báo không được dùng
để cấp quyền hoặc tin tưởng dữ liệu tài chính.

## 6. API đề xuất

Các endpoint thuộc `account-service` và yêu cầu JWT:

- `GET /users/me/notifications?page=1&pageSize=20&role=&unread=` trả danh sách,
  tổng số mục theo bộ lọc, tổng số trang và `unreadCount` toàn tài khoản.
- `GET /users/me/notifications/recent?limit=5` trả các mục cho dropdown, ưu tiên
  `action_required` còn hiệu lực rồi đến thời gian mới nhất, kèm `unreadCount`.
- `POST /users/me/notifications/:id/read` chỉ cập nhật notification của chính user,
  idempotent nếu đã đọc.
- `POST /users/me/notifications/read-all` đánh dấu toàn bộ thông báo hiện có của
  user là đã đọc, không phụ thuộc vai trò đang hoạt động.
- `GET /users/me/notification-preferences` trả cài đặt đã hợp nhất với mặc định.
- `PUT /users/me/notification-preferences` cập nhật các nhóm có thể thay đổi.
- `GET /users/me/notifications/stream` mở SSE đã xác thực.

`pageSize` mặc định 20, tối đa 50. Tham số role chỉ được nhận nếu user sở hữu role
đó; role không hợp lệ trả lỗi nghiệp vụ rõ ràng. API không cho phép đọc hoặc đánh
dấu notification của user khác.

## 7. Realtime và nhất quán

SSE được chọn cho hộp thư vì luồng chỉ đi từ server tới trình duyệt và tần suất
thấp. Frontend mở stream bằng `fetch` với Authorization header, không đặt JWT trong
query string.

Luồng cập nhật:

1. Domain transaction và outbox event được ghi nguyên tử tại service nguồn.
2. Notification projector tạo bản ghi idempotent trong `account-service`.
3. Sau khi bản ghi tồn tại, event nội bộ báo thay đổi được phát qua RabbitMQ.
4. Mỗi replica account-service có queue fan-out riêng và gửi tín hiệu SSE tới các
   kết nối cục bộ thuộc đúng `userId`.
5. Client nhận tín hiệu chỉ chứa `notificationId`, `eventId` và `occurredAt`, sau
   đó debounce rồi tải lại recent list và unread count từ API chuẩn.

SSE là lớp giao nhận tạm thời, không phải nguồn dữ liệu. Client bỏ trùng theo
`eventId`, reconnect với exponential backoff có jitter, refetch ngay khi nối lại,
refetch khi tab trở lại visible và có safety refresh thưa. Mỗi replica gửi heartbeat
định kỳ và giải phóng listener khi client đóng tab. Mục tiêu quan sát được là badge
và danh sách cập nhật trong 1–3 giây ở điều kiện mạng bình thường.

Khi người dùng đọc thông báo ở tab khác, thao tác `read` cũng phát tín hiệu cập nhật
để mọi tab đồng bộ badge. Client có thể giảm badge ngay để phản hồi nhanh nhưng lần
refetch kế tiếp luôn thay thế snapshot cục bộ.

## 8. Nội dung và bảo mật

- Nội dung dùng ngôn ngữ đời thường: `Bạn vừa nhận một lịch đặt sân`, không lộ tên
  event, queue, audit hay trạng thái kỹ thuật.
- Không đưa số tài khoản ngân hàng, token, bằng chứng tranh chấp riêng tư hoặc dữ
  liệu của người khác vào event realtime.
- Event nguồn phải cung cấp rõ `recipientUserId`, `targetRole`, `kind`, tham chiếu
  nghiệp vụ và dữ liệu snapshot tối thiểu; notification projector không suy đoán
  người nhận từ dữ liệu thiếu.
- Event redelivery không tạo notification trùng nhờ `sourceEventId`.
- Admin chỉ nhận sự kiện thuộc hàng đợi được phép xử lý; notification không mở rộng
  quyền admin hiện có.
- Số badge và nội dung không được cache dùng chung giữa người dùng.

## 9. Ranh giới component frontend

- `NotificationBell`: trigger, badge, focus và phối hợp đóng/mở với menu avatar.
- `NotificationPopover`: recent list, nhóm ưu tiên, hành động đọc tất cả.
- `NotificationItem`: hiển thị nhất quán icon, nội dung, vai trò, trạng thái đọc và
  hành động điều hướng.
- `NotificationsPage`: bộ lọc URL, danh sách theo ngày và phân trang.
- `NotificationPreferences`: tải/lưu công tắc theo role và category.
- `NotificationProvider`: cache recent/unread count, stream SSE, debounce/refetch
  và đồng bộ nhiều tab.
- `notificationRoutes`: ánh xạ allowlist từ `actionKind` sang route nội bộ.

Các component không tự diễn giải domain event và không tự tính trạng thái nghiệp
vụ. Chúng chỉ render read model do API trả về.

## 10. Kiểm chứng

### Backend tập trung

- Projector tạo đúng người nhận, role, nội dung và chỉ một bản ghi khi event được
  phát lại.
- Preferences chặn nhóm đã tắt nhưng không chặn thông báo bảo mật bắt buộc.
- Phân trang và thứ tự ổn định khi notification mới đến giữa hai request.
- User không đọc hoặc đánh dấu notification của user khác.
- `read` và `read-all` idempotent, unread count chính xác.
- SSE chỉ phát tới user đã xác thực đúng; reconnect/refetch không tạo dữ liệu trùng.

### Frontend tập trung

- Badge hiển thị đúng `0`, `1–99`, `99+`; không hiện khi bằng 0.
- Mở dropdown không đổi trạng thái đọc; nhấn item và `Đã đọc tất cả` có đổi.
- Item điều hướng đúng theo allowlist; đích không hợp lệ không mở URL tùy ý.
- Dropdown gộp role, trang lịch sử lọc role/chưa đọc và giữ filter khi phân trang.
- Chuông, dropdown và sheet mobile dùng được bằng bàn phím và trình đọc màn hình.
- Tín hiệu realtime refetch recent/unread count và đồng bộ nhiều tab.

### Kiểm chứng tích hợp tối thiểu

Một event booking thật đi qua outbox/RabbitMQ, tạo notification đúng chủ sân, xuất
hiện trên browser đang mở trong mục tiêu 1–3 giây, nhấn vào mở đúng booking và làm
badge giảm. Thêm một luồng player và một luồng admin để chứng minh phân tách role;
không cần kiểm thử trình duyệt cho mọi loại event nếu contract projector đã được
kiểm bằng test tham số hóa.

## 11. Ngoài phạm vi

- Email, SMS, web push, mobile push hoặc digest định kỳ.
- Xóa, lưu trữ lạnh hoặc export lịch sử thông báo.
- Thông báo marketing và hệ thống gợi ý quảng cáo.
- Cho người dùng viết mẫu nội dung thông báo.
- Một notification-service độc lập.
- Dùng WebSocket hai chiều chỉ cho hộp thư thông báo.

## 12. Tiêu chí duyệt triển khai

1. Mọi role thấy chuông chuẩn và badge chưa đọc trên navbar sau khi đăng nhập.
2. Dropdown dùng bố cục ưu tiên hành động, gộp tất cả role và hiển thị tối đa năm
   thông báo gần nhất.
3. Trang lịch sử lọc được trạng thái/role và phân trang 20 mục.
4. Nhấn mục đánh dấu đã đọc và điều hướng an toàn khi có đích.
5. `Đã đọc tất cả` cập nhật chính xác badge trên mọi tab.
6. Người dùng cấu hình được các nhóm không bắt buộc; mặc định ưu tiên thông báo
   quan trọng.
7. Realtime cập nhật trong 1–3 giây ở mạng bình thường và tự phục hồi sau mất kết
   nối mà không dùng delta làm nguồn dữ liệu.
8. Event phát lại không tạo trùng, dữ liệu không rò giữa user hoặc role.
