---
type: product-design
topic: operational-shutdown
status: approved
approved: 2026-09-21
implementation: not-started
---

# Thiết kế nghiệp vụ — Ngừng hoạt động sân hoặc cơ sở

## 1. Kết quả đã chốt

Khi chủ sân chọn **Ngừng hoạt động** cho một sân hoặc toàn bộ cơ sở, hệ thống
không còn chặn tuyệt đối chỉ vì đang có booking hoặc lượt giữ chỗ. Thay vào đó,
chủ sân chọn một trong ba cách xử lý:

1. **Ngừng nhận lịch đặt mới** — không nhận thêm cam kết mới, vẫn phục vụ hết
   các cam kết hợp lệ đã tồn tại.
2. **Đóng cửa từ ngày đã chọn** — vẫn phục vụ các ca kết thúc trước thời điểm
   đóng; các booking bị ảnh hưởng được hủy ngay khi xác nhận lịch đóng và được
   hoàn 100%.
3. **Ngừng hoạt động ngay do sự cố** — ngừng phục vụ ngay; mọi booking chưa kết
   thúc, kể cả ca đang diễn ra, được hủy và hoàn 100%.

Không có lựa chọn đổi sang sân thay thế. Hệ thống không cung cấp số điện thoại
người chơi cho chủ sân trong quy trình này.

## 2. Ngôn ngữ nghiệp vụ thống nhất

| Thuật ngữ | Nghĩa dùng trong sản phẩm |
|---|---|
| Ngừng hoạt động sân/cơ sở | Dừng nhận hoặc dừng phục vụ tại một sân/cơ sở; không xóa dữ liệu lịch sử |
| Lịch đặt mới | Một cam kết sân mới được tạo sau thời điểm chủ sân xác nhận ngừng hoạt động |
| Cam kết hiện hữu | Checkout đang thanh toán, kèo đang giữ sân hoặc booking đã xác nhận trước thời điểm ngừng nhận mới |
| Booking bị ảnh hưởng | Booking có thời gian phục vụ giao với khoảng sân/cơ sở không còn hoạt động |
| Đang hoàn tiền | Booking đã hủy và yêu cầu hoàn 100% đã được ghi nhận, nhưng ví người chơi chưa được finance xác nhận ghi có |
| Đã hoàn tiền | Ví số dư COURTIN của người chơi đã được ghi có thành công |

Trên client không dùng các từ kỹ thuật như `pending`, `outbox`, `consumer`,
`saga`, `D39`, `provider_fault`, `quarantine`, `ledger` hoặc tên event. Những
khái niệm này chỉ xuất hiện trong tài liệu kỹ thuật, log và công cụ Admin.

## 3. Phạm vi và ngoài phạm vi

### Trong phạm vi

- Ngừng một sân con hoặc toàn bộ cơ sở.
- Ba chế độ ngừng hoạt động nêu trên.
- Khóa nhận cam kết mới tại đúng thời điểm xác nhận.
- Xử lý checkout hold, match hold, marketplace booking, match booking và booking
  nội bộ.
- Hủy và hoàn 100% các booking bị ảnh hưởng.
- Thông báo bắt buộc tới đúng người chơi bị ảnh hưởng.
- Theo dõi riêng trạng thái vận hành và trạng thái hoàn tiền.
- Retry, audit và can thiệp Admin khi xử lý bất đồng bộ gặp lỗi.

### Ngoài phạm vi

- Đổi booking sang sân thay thế.
- Cho người chơi chọn đồng ý hoặc từ chối đổi sân.
- Chia sẻ số điện thoại người chơi cho chủ sân.
- Khôi phục tự động booking đã hủy khi chủ sân đổi ý.
- Hoàn một phần cho booking bị ngừng do phía sân.
- Xóa cứng sân, cơ sở, booking hoặc bút toán tài chính.
- Đóng băng toàn bộ ví kinh doanh hoặc yêu cầu rút tiền không liên quan.

## 4. Hai lớp trạng thái

Không dùng một cờ duy nhất để biểu diễn cả khả năng nhận booking và tiến độ xử
lý nghĩa vụ. Hai lớp trạng thái phải tách biệt.

### 4.1. Trạng thái vận hành

```text
active
  ├─> winding_down
  ├─> scheduled_close
  └─> inactive

winding_down ──> scheduled_close ──> inactive
       │                 │
       └──────────────> emergency ──> inactive
                         ▲
scheduled_close ─────────┘
```

- `active`: nhận booking bình thường.
- `winding_down`: không nhận cam kết mới, vẫn phục vụ cam kết hiện hữu.
- `scheduled_close`: chỉ nhận booking kết thúc trước thời điểm đóng.
- `inactive`: không nhận và không phục vụ booking mới.

Chủ sân được chuyển chế độ sau khi đã xác nhận theo các chuyển đổi an toàn ở
mục 6.4. `emergency` có hiệu lực ngay và là chế độ kết thúc: sau khi đã hủy các
cam kết chưa hoàn thành, không được hạ về chế độ nhẹ hơn. Muốn kinh doanh lại
sau đó phải dùng một thao tác kích hoạt lại riêng.

### 4.2. Trạng thái xử lý nghĩa vụ

```text
not_required | processing | completed | needs_attention
```

- `not_required`: không có booking phải hủy hoặc hoàn.
- `processing`: đang hủy booking hoặc đang hoàn tiền.
- `completed`: mọi booking bị ảnh hưởng đã đạt trạng thái cuối hợp lệ.
- `needs_attention`: có tác vụ đã retry nhưng vẫn cần Admin xử lý.

Một sân có thể đã `inactive` trong khi trạng thái nghĩa vụ vẫn là `processing`
hoặc `needs_attention`. Lỗi hoàn tiền không được làm sân mở lại.

## 5. Đối tượng nghiệp vụ mới

Thiết kế dùng aggregate `OperationalShutdown` thay vì dùng lại `Closure`.
`Closure` hiện có tiếp tục chỉ mang nghĩa ngày nghỉ ngoại lệ của một sân.

`OperationalShutdown` cần biểu diễn tối thiểu:

- Phạm vi: một sân hoặc toàn bộ cơ sở.
- Chế độ: `winding_down`, `scheduled`, `emergency`.
- Thời điểm có hiệu lực.
- Thời điểm dự kiến hoàn tất cam kết cuối cùng (`expectedInactiveAt`).
- Lý do do chủ sân nhập.
- Người tạo và thời điểm tạo.
- Trạng thái vận hành.
- Trạng thái xử lý nghĩa vụ.
- Thống kê tổng số booking, số đã hủy, số đang hoàn, số đã hoàn và số cần hỗ trợ.

Mỗi booking bị ảnh hưởng có một bản ghi xử lý idempotent, có trạng thái:

```text
identified
  -> cancellation_processing
  -> cancelled_refund_processing
  -> refunded

identified -> cancelled_no_platform_refund
any non-terminal state -> needs_attention
```

`cancelled_no_platform_refund` chỉ áp dụng cho booking nội bộ.

## 6. Luồng 1 — Ngừng nhận lịch đặt mới

### 6.1. Xác nhận

Trước khi xác nhận, chủ sân thấy:

- Số booking đã xác nhận còn lại.
- Checkout đang trong thời gian thanh toán.
- Kèo đang giữ sân và thời điểm chốt kèo.
- Thời điểm dự kiến hoàn thành cam kết cuối cùng.

Sau khi xác nhận, hệ thống chuyển phạm vi sang `winding_down` và chặn mọi cam
kết sân mới.

Hệ thống chụp `expectedInactiveAt` bằng thời điểm kết thúc muộn nhất của mọi
cam kết hiện hữu. Client phải hiển thị ngày phục vụ cuối cùng trước khi chủ sân
xác nhận. Nếu khoảng chờ quá dài, client đề xuất chuyển sang **Đóng cửa từ ngày
đã chọn** thay vì để chủ sân hiểu nhầm rằng cơ sở sẽ đóng ngay.

### 6.2. Cam kết được tiếp tục

- Checkout hold có trước thời điểm xác nhận được hoàn tất trong thời hạn tối đa
  10 phút hiện hành.
- Match hold có trước thời điểm xác nhận được tiếp tục tới `cutoffAt`; nếu kèo
  đủ điều kiện thì booking có thể được xác nhận sau lúc sân đã bắt đầu
  `winding_down`.
- Booking confirmed tiếp tục được phục vụ.
- Không tạo checkout hold, match hold hoặc booking nội bộ mới.

Các hold được giữ lại ở đây là cam kết hiện hữu, không được coi là booking mới.
Client chủ sân phải giải thích rằng tổng booking cuối cùng có thể tăng thêm từ
những lượt đang thanh toán hoặc kèo đang chờ chốt.

Không cam kết hiện hữu nào được gia hạn làm `expectedInactiveAt` trôi muộn hơn:

- Checkout chỉ dùng phần thời gian còn lại của cửa sổ hiện tại, không được cấp
  lại 10 phút mới.
- Match giữ nguyên slot và `cutoffAt` đã có khi xác nhận winding down.
- Không được đổi match sang một slot xa hơn hoặc gia hạn match hold vượt cutoff
  đã chụp.

### 6.3. Hoàn tất

Sau khi không còn hold/kèo có thể sinh booking và booking cuối cùng đã kết thúc,
phạm vi tự chuyển sang `inactive`. Chế độ này không tạo hoàn tiền.

Nếu đã qua `expectedInactiveAt` mà phạm vi chưa thể chuyển `inactive`, hệ thống
tự rà các hold/kèo quá hạn. Trạng thái còn treo sau retry chuyển sang
`needs_attention` để Admin hỗ trợ; client chủ sân hiển thị **Một số lịch đặt cần
được hệ thống hỗ trợ xử lý**.

### 6.4. Chuyển chế độ sau khi đã xác nhận

Chủ sân không bị khóa vĩnh viễn vào lựa chọn ban đầu:

- `winding_down -> scheduled_close`: chọn ngày đóng; mọi cam kết giao với hoặc
  sau ngày đó được hủy và hoàn theo mục 7.
- `winding_down -> emergency`: hủy ngay mọi cam kết chưa kết thúc theo mục 8.
- `scheduled_close -> emergency`: thời điểm đóng chuyển thành ngay lập tức; xử
  lý bổ sung các cam kết chưa bị ảnh hưởng bởi lịch cũ.
- `scheduled_close -> winding_down`: bỏ ngày đóng cố định và phục vụ hết những
  cam kết còn lại; booking đã hủy hoặc đã hoàn theo lịch cũ không được phục hồi.
- `scheduled_close -> scheduled_close`: được đổi ngày; nếu chuyển sớm hơn thì
  xử lý thêm booking mới bị ảnh hưởng, nếu chuyển muộn hơn thì không phục hồi
  booking đã hủy trước đó.

Mọi chuyển chế độ phải hiển thị lại số booking bị ảnh hưởng, tổng tiền phải
hoàn và hậu quả không thể đảo ngược trước khi xác nhận. Chỉ các booking mới bị
ảnh hưởng bởi lần chuyển chế độ được tạo cancellation/refund/notification;
booking đã xử lý giữ nguyên kết quả và không được xử lý lần hai.

Sau khi `emergency` đã có hiệu lực, không cho chuyển về `winding_down` hoặc
`scheduled_close`. Khi sự cố kết thúc, kích hoạt lại là một hành động mới và
không phục hồi booking, match, JOIN hoặc bút toán cũ.

## 7. Luồng 2 — Đóng cửa từ ngày đã chọn

### 7.1. Ý nghĩa thời điểm đóng

Client cho chọn ngày đóng; `effectiveAt` là 00:00 đầu ngày đó theo múi giờ Việt
Nam. Booking bị ảnh hưởng khi:

```text
booking.endAt > effectiveAt
```

Quy tắc này bao gồm booking bắt đầu trước ngày đóng nhưng kéo dài qua thời điểm
đóng.

### 7.2. Màn hình xác nhận

Trước khi chủ sân xác nhận, hệ thống phải hiển thị:

- Ngày bắt đầu ngừng hoạt động.
- Số marketplace booking bị ảnh hưởng.
- Số booking gắn với kèo bị ảnh hưởng.
- Số booking nội bộ bị ảnh hưởng.
- Tổng số tiền dự kiến hoàn.
- Cảnh báo rằng booking đã hủy sẽ không tự khôi phục nếu đổi hoặc hủy lịch đóng.

### 7.3. Xử lý khi xác nhận

Trong cùng ranh giới ghi bền vững với yêu cầu đóng, hệ thống thiết lập cutoff để
mọi command mới không thể tạo cam kết giao với `effectiveAt` trở đi. Sau đó từng
booking bị ảnh hưởng được xử lý idempotent:

- Marketplace booking confirmed: hủy do lỗi phía sân và hoàn 100%.
- Match booking confirmed: hủy booking, hủy match, hoàn 100% theo đúng phần mỗi
  organizer/participant đã góp.
- Match còn held: hủy qua cơ chế phân xử nguyên tử hiện hành, nhả sân và hoàn
  toàn bộ contribution đã thu.
- Checkout hold hoặc booking held: revoke; nếu tiền đến sau thì chuyển toàn bộ
  vào Số dư COURTIN, không phục hồi booking.
- Booking nội bộ: hủy và giải phóng lịch; không phát sinh hoàn tiền nền tảng.

Các booking bị ảnh hưởng được hủy ngay khi lịch đóng được xác nhận, không chờ
đến `effectiveAt`. Điều này bảo đảm người chơi biết sớm và có thời gian đặt sân
khác.

### 7.4. Thông báo người chơi

Mỗi marketplace booking bị hủy tạo một thông báo bắt buộc cho chủ booking.
Booking gắn với kèo tạo thông báo bắt buộc cho organizer và mọi JOIN
`approved` hoặc `confirmed` tại thời điểm hủy.

Nội dung client đề xuất:

**Tiêu đề:** `Lịch đặt đã được hủy`

**Nội dung:**

> Cơ sở [Tên cơ sở] sẽ ngừng hoạt động từ [ngày]. Lịch đặt [ngày, giờ, sân]
> có mã [Mã booking] của bạn đã được hủy. Bạn được hoàn 100% giá trị đã thanh
> toán.

**Trạng thái tiền:**

> Khoản hoàn [số tiền] đang được chuyển vào Số dư COURTIN của bạn.

Khi finance xác nhận hoàn tất, gửi thông báo thứ hai:

**Tiêu đề:** `Bạn đã nhận được tiền hoàn`

**Nội dung:**

> [Số tiền] đã được hoàn vào Số dư COURTIN cho lịch đặt [ngày, giờ].

Thông báo và màn booking đã hủy phải giúp người chơi nhận ra đúng lịch bằng
`Booking.businessCode`, tên cơ sở, tên sân, địa chỉ cơ sở, ngày và khung giờ
chơi. Mã hiển thị dùng đúng mã nghiệp vụ `BK-` + 8 chữ số đã được Venue cấp và
cũng xuất hiện trong danh sách/chi tiết booking phía chủ sân; không tạo mã mới
ở client và không hiển thị UUID nội bộ.

Notification dùng khóa idempotency gồm shutdown, booking, người nhận và loại
thông báo để redelivery không tạo thông báo trùng.

### 7.5. Thay đổi hoặc hủy lịch đóng

Booking đã hủy và tiền đã hoàn không được phục hồi. Nếu chủ sân đổi ý:

- Có thể mở lại khả năng nhận lịch phù hợp trong tương lai.
- Người chơi phải chủ động đặt lại.
- Ledger, match, JOIN và notification cũ giữ nguyên để bảo toàn audit.

## 8. Luồng 3 — Ngừng hoạt động ngay do sự cố

### 8.1. Booking bị ảnh hưởng

Mọi booking chưa kết thúc đều bị ảnh hưởng:

```text
booking.endAt > now
```

Quy tắc này bao gồm booking chưa bắt đầu và booking đang diễn ra.

### 8.2. Ngoại lệ mới của BOK-10

Booking đang diễn ra nhưng bị buộc dừng do sự cố được hủy và hoàn 100%. Đây là
ngoại lệ có chủ đích đối với quy tắc BOK-10 hiện hành vốn từ chối hủy sau giờ
bắt đầu.

Ngoại lệ chỉ hợp lệ khi:

- Có `OperationalShutdown(mode=emergency)` hợp lệ cho đúng sân/cơ sở.
- Booking chưa kết thúc.
- Thao tác được thực hiện bởi chủ sở hữu hợp lệ hoặc Admin.
- Lý do sự cố là bắt buộc và được audit.

Không mở API hủy sau giờ bắt đầu như một quyền chung của chủ sân.

### 8.3. Xử lý

- Chặn cam kết mới ngay khi xác nhận.
- Hủy/revoke checkout đang thanh toán; tiền đến muộn vào Số dư COURTIN.
- Hủy match held qua cơ chế phân xử nguyên tử và hoàn contribution.
- Hủy marketplace/match booking confirmed, kể cả ca đang diễn ra, hoàn 100%.
- Hủy booking nội bộ, không tạo refund nền tảng.
- Gửi thông báo bắt buộc ngay sau khi cancellation đã được ghi nhận bền vững.

Nội dung client đề xuất:

**Tiêu đề:** `Lịch đặt đã bị hủy do sự cố`

**Nội dung:**

> Sân/cơ sở không thể tiếp tục phục vụ do sự cố. Lịch đặt [ngày, giờ, sân] của
> bạn, mã [Mã booking], đã được hủy và được hoàn 100% giá trị đã thanh toán.

Không hiển thị mã lỗi, tên event hoặc tên service cho người chơi.

## 9. Quy tắc tài chính

- Mọi cancellation trong luồng 2 và 3 dùng nguyên nhân tài chính lỗi phía sân
  và tỷ lệ hoàn 100%.
- Marketplace booking hoàn bằng cách đảo đúng doanh thu pending của chủ sân và
  hoa hồng platform, rồi ghi có ví personal của người chơi.
- Match booking hoàn theo đúng nguồn contribution của từng người; tổng hoàn
  bằng đúng giá booking và không có P2P.
- Booking nội bộ không có payment, commission hoặc refund nền tảng.
- Không sửa hoặc xóa ledger entry cũ; mọi điều chỉnh là bút toán mới.
- Booking bị hủy và tiền đã hoàn không được phục hồi.
- Ngừng hoạt động không tự động đóng băng `available`, `reserved`, yêu cầu rút
  tiền hoặc doanh thu của booking khác.

Booking chưa kết thúc chưa thể qua mốc giải phóng doanh thu `endAt + 24h`, nên
khoản cần đảo vẫn nằm trong `business.pending`. Ngoại lệ emergency cho ca đang
diễn ra vẫn giữ bất biến này.

## 10. Matchmaking và tính nhất quán liên service

Venue là nguồn quyết định tình trạng vật lý của booking; Matchmaking là nguồn
trạng thái match/JOIN; Finance là nguồn dòng tiền. Không service nào được ghi
thẳng schema của service khác.

Khi booking gắn với match bị hủy do shutdown:

1. Venue ghi cancellation và event bền vững.
2. Matchmaking tra match bằng `bookingId`, chuyển match/JOIN sang trạng thái hủy
   phù hợp và phát thông báo cho organizer cùng JOIN `approved|confirmed`.
3. Finance hoàn theo trạng thái funding/contribution hiện hành.
4. Finance phát kết quả hoàn tiền sau khi ledger commit.
5. Projection của shutdown cập nhật `refunded` theo kết quả đó.

Matchmaking hiện phải được mở rộng để consume cancellation theo `bookingId`;
nếu thiếu bước này, booking có thể `cancelled` trong khi match vẫn `confirmed`.

## 11. Notification bắt buộc

Thông báo ngừng hoạt động không phụ thuộc cài đặt bật/tắt category thông thường.
Contract notification cần phân biệt:

```text
deliveryPolicy = preference_based | required
```

Account-service chỉ cho phép một tập `kind` có thẩm quyền dùng `required`, tối
thiểu gồm:

- Booking bị hủy do đóng theo ngày.
- Booking/match bị hủy do sự cố.
- Hoàn tiền hoàn tất.
- Hoàn tiền cần Admin hỗ trợ.

Không dùng category `security` cho sự kiện vận hành. Notification hủy và
notification hoàn tiền là hai kết quả khác nhau; client không được tuyên bố đã
nhận tiền chỉ vì booking đã hủy.

Payload notification hủy và hoàn tiền phải mang `bookingId` để điều hướng cùng
`bookingBusinessCode` để hiển thị. `bookingBusinessCode` chỉ là mã đối chiếu,
không thay UUID trong route, authorization, idempotency hoặc liên kết liên
service.

## 12. Booking nội bộ

Booking nội bộ không có tài khoản người chơi, nên không thể nhận notification
trong ứng dụng. Khi bị hủy:

- Slot được giải phóng.
- Không tạo refund.
- Chủ sân thấy tên và liên hệ khách mà chính họ đã nhập.
- Client chủ sân hiển thị nhãn `Bạn cần tự thông báo cho khách`.

Booking nội bộ không được tính vào tổng tiền hoàn.

## 13. Quyền, audit và khả năng phục hồi

- Chỉ chủ sở hữu phạm vi hoặc Admin được tạo shutdown.
- Lý do bắt buộc đối với emergency; scheduled cần ngày và xác nhận hậu quả.
- Ghi audit actor, scope, mode, effectiveAt, reason và thống kê trước/sau.
- Mỗi lần chuyển chế độ ghi mode cũ, mode mới, cutoff cũ/mới, số booking mới bị
  ảnh hưởng và tổng nghĩa vụ hoàn tăng thêm.
- Nếu tài khoản chủ sân bị khóa trong lúc xử lý, tác vụ hệ thống vẫn tiếp tục;
  chủ sân mất quyền thao tác và Admin có thể tiếp quản.
- Bulk cancellation không dùng một distributed transaction dài. Từng booking
  có idempotency key và có thể retry độc lập.
- Retry không được hủy, hoàn tiền hoặc thông báo hai lần.
- Sau ngưỡng retry, chuyển item sang `needs_attention` và cảnh báo Admin.
- Lỗi refund không mở lại sân và không phục hồi booking.

## 14. Chặn race và đường gọi trực tiếp

Không chỉ ẩn sân khỏi tìm kiếm. Mọi command tạo hoặc xác nhận cam kết phải kiểm
tra shutdown/cutoff dưới khóa phù hợp:

- Tạo checkout hold.
- Chuyển hold thành booking.
- Tạo booking nội bộ.
- Promote match hold.
- Match settlement tại cutoff.
- Xử lý payment completion.

Emergency cancellation phải cạnh tranh nguyên tử với payment/settlement. Nếu
cancellation thắng, event đến muộn không được phục hồi booking; tiền được hoàn
hoặc chuyển vào Số dư COURTIN theo nguồn thanh toán. Nếu settlement đã thắng
trước, booking confirmed vẫn bị hủy 100% theo shutdown.

## 15. Ngôn ngữ trên client

### 15.1. Nhãn cho chủ sân

| Ý nghĩa | Nội dung hiển thị |
|---|---|
| Winding down | Ngừng nhận lịch đặt mới |
| Scheduled | Đóng cửa từ ngày đã chọn |
| Emergency | Ngừng hoạt động ngay do sự cố |
| Expected inactive time | Dự kiến ngừng hoạt động hoàn toàn vào [ngày, giờ] |
| Mode transition | Thay đổi cách ngừng hoạt động |
| Resolution processing | Đang xử lý các lịch đặt bị ảnh hưởng |
| Refund processing | Đang hoàn tiền cho khách |
| Needs attention | Một số khoản hoàn cần được hỗ trợ |
| Completed | Đã xử lý xong tất cả lịch đặt |

### 15.2. Không hiển thị cho người dùng

- Mã HTTP hoặc mã lỗi nội bộ.
- `provider_fault`, `refund_pending`, `needs_attention` dạng raw enum.
- RabbitMQ, event, outbox, consumer, saga, retry count hoặc tên service.
- Số dư phân vùng `pending/available/reserved` trong thông báo khách hàng.

### 15.3. Thông báo lỗi thân thiện

| Tình huống | Nội dung client |
|---|---|
| Không thể tạo shutdown | Chưa thể ngừng hoạt động lúc này. Vui lòng thử lại. |
| Một số booking chưa xử lý xong | Một số lịch đặt đang được hệ thống tiếp tục xử lý. |
| Refund cần Admin | Khoản hoàn đang được hỗ trợ xử lý. Quyền lợi của khách vẫn được giữ nguyên. |
| Thao tác lặp | Yêu cầu này đã được ghi nhận trước đó. |
| Chuyển sang đóng theo ngày | Các lịch từ ngày đã chọn sẽ bị hủy và được hoàn 100%. |
| Chuyển sang đóng ngay | Mọi lịch chưa kết thúc sẽ bị hủy và được hoàn 100%. |
| Đổi sang ngày muộn hơn | Các lịch đã hủy trước đó sẽ không được khôi phục. |

### 15.4. Giao diện đã duyệt

Phía chủ sân giữ nguyên trang chi tiết cơ sở hiện hành. Nút ngừng hoạt động mở
modal ba bước theo đúng component và token COURTIN:

1. Chọn một trong ba cách ngừng hoạt động.
2. Xem số lịch bị ảnh hưởng, tổng tiền dự kiến hoàn, lịch tiếp tục phục vụ và
   thời điểm phục vụ cuối.
3. Xác nhận hậu quả không thể đảo ngược.

Sau khi xác nhận, trang chi tiết hiển thị banner trạng thái và nút **Thay đổi
cách ngừng** khi chuyển chế độ còn hợp lệ. Cùng modal được dùng cho cả cơ sở và
từng sân, nhưng phạm vi phải được ghi rõ trong tiêu đề và phần tóm tắt.

Phía người chơi, notification hủy dẫn tới booking tương ứng trong mục **Đã
hủy**. Notification chỉ hiển thị tóm tắt đủ nhận biết: mã booking nghiệp vụ,
tên cơ sở/sân và ngày giờ chơi.

Thẻ booking mặc định ở trạng thái thu gọn, chỉ hiển thị tên cơ sở/sân, ngày giờ
chơi, giá trị đã thanh toán, lý do trạng thái hủy và trạng thái **Đang hoàn
tiền** hoặc **Đã hoàn tiền**. Khi người chơi bấm **Xem chi tiết booking**, thẻ
mới xổ xuống các trường:

- Địa chỉ cơ sở.
- Ngày và khung giờ chơi.
- **Ngày đặt**: thời điểm booking được tạo (`Booking.createdAt`), tách biệt với
  ngày giờ chơi.
- Mã booking nghiệp vụ, cho phép chọn/copy.
- Mức hoàn và lý do hủy.

Nút mở chi tiết phải đổi thành **Ẩn chi tiết booking** khi đang mở, công bố
trạng thái mở/đóng cho công nghệ hỗ trợ và không làm lộ vùng chi tiết khi thẻ
đang thu gọn.

Notification hủy và notification hoàn tất là hai dòng riêng. Cả hai dùng cùng
`Booking.businessCode` đang hiển thị trong drawer booking phía chủ sân để người
chơi, chủ sân và đội hỗ trợ đối chiếu một bản ghi duy nhất.

## 16. Xung đột nghiệp vụ và cách giải quyết

| Nguồn hiện hành | Xung đột | Quyết định thiết kế |
|---|---|---|
| D5 / BR-VEN-05 | Chặn cứng khi còn booking/hold | Quyết định mới supersede D5; chuyển sang khóa cam kết mới và xử lý nghĩa vụ |
| BOK-10 | Không hủy sau giờ bắt đầu | Emergency shutdown là ngoại lệ hẹp, hoàn 100% cho booking chưa kết thúc |
| D12 | Cho phép đổi sân con | Không xung đột; shutdown không dùng đổi sân, D12 giữ cho incident thông thường |
| Notification preferences | Người chơi có thể tắt booking/match | Shutdown và refund dùng delivery `required` có whitelist kind |
| Match lifecycle | Booking có thể hủy nhưng match còn confirmed | Matchmaking consume cancellation theo bookingId và hủy match/JOIN idempotent |
| Match notification | Chỉ fan-out JOIN confirmed | Shutdown fan-out organizer và JOIN approved/confirmed |
| Booking nội bộ | Không có user để notification/refund | Hủy không refund; chủ sân tự liên hệ khách |
| Refund bất đồng bộ | Booking cancelled chưa chứng minh tiền đã vào ví | Tách thông báo hủy và thông báo đã nhận tiền |
| Lịch đóng thay đổi | Booking đã hủy không thể phục hồi an toàn | Không phục hồi; người chơi đặt lại |
| Winding down kéo dài | Cam kết hiện hữu có thể dàn trải nhiều ngày | Hiển thị `expectedInactiveAt`, không cho cam kết cũ gia hạn vượt mốc, cho phép chuyển chế độ |
| API trực tiếp | Ẩn search không đủ chặn booking | Kiểm shutdown/cutoff tại mọi command boundary |

## 17. Acceptance criteria cấp thiết kế

1. Khi xác nhận winding down, mọi cam kết mới bị chặn nhưng checkout/match hold
   hợp lệ đã tồn tại vẫn được quyết định theo thời hạn hiện hành.
2. Khi xác nhận scheduled close, mọi booking có `endAt > effectiveAt` được đưa
   vào xử lý ngay và không booking mới nào giao với cutoff được tạo.
3. Mỗi marketplace booking bị scheduled close hủy tạo đúng một notification
   bắt buộc cho người sở hữu booking, kể cả khi họ đã tắt notification booking.
4. Booking match bị hủy làm match và JOIN liên quan đạt trạng thái terminal;
   organizer và JOIN approved/confirmed đều nhận thông báo.
5. Emergency shutdown hủy và hoàn 100% booking đang diễn ra nhưng chưa kết
   thúc; API hủy thông thường ngoài shutdown vẫn từ chối sau giờ bắt đầu.
6. Marketplace booking hoàn đúng 100%, đảo đủ doanh thu chủ sân và hoa hồng;
   ledger gốc không bị sửa.
7. Match booking hoàn đúng tổng contribution về đúng người góp.
8. Booking nội bộ bị hủy, slot được giải phóng và finance không có bút toán.
9. Booking cancelled hiển thị `Đang hoàn tiền` cho tới khi finance xác nhận;
   chỉ sau đó mới hiển thị `Đã hoàn tiền`.
10. Redelivery hoặc retry không tạo cancellation, refund hay notification thứ
    hai.
11. Thay đổi/hủy lịch đóng không phục hồi booking, match, JOIN hoặc ledger đã
    kết thúc.
12. Gọi trực tiếp API bằng courtId không thể bỏ qua trạng thái shutdown hoặc
    cutoff.
13. Lỗi một booking không ngăn các booking khác được xử lý; item lỗi chuyển
    trạng thái cần Admin hỗ trợ.
14. Toàn bộ thông điệp client dùng ngôn ngữ nghiệp vụ trong mục 15 và không lộ
    thuật ngữ kỹ thuật.
15. Trước khi xác nhận winding down, client hiển thị thời điểm phục vụ cuối cùng;
    không hold hoặc match hiện hữu nào được gia hạn làm mốc này trôi muộn hơn.
16. Chuyển từ winding down sang scheduled close chỉ hủy/hoàn các booking bị
    cutoff mới ảnh hưởng; các booking đã xử lý không bị xử lý lần hai.
17. Chuyển scheduled close sang ngày muộn hơn hoặc winding down không phục hồi
    booking, match, JOIN, notification hay bút toán đã kết thúc.
18. Chuyển sang emergency xử lý ngay mọi booking chưa kết thúc; emergency đã có
    hiệu lực không được hạ về chế độ nhẹ hơn.
19. Notification và thẻ booking đã hủy phía người chơi hiển thị đúng
    `Booking.businessCode`, địa chỉ, ngày và khung giờ; drawer phía chủ sân hiển
    thị cùng mã đó, còn UUID không xuất hiện trên client.
20. Thẻ booking đã hủy mặc định thu gọn; chỉ sau khi bấm **Xem chi tiết
    booking** mới hiển thị địa chỉ, `Booking.createdAt` dưới nhãn **Ngày đặt**,
    mã booking, lịch chơi, mức hoàn và lý do hủy. Nút phản ánh đúng trạng thái
    mở/đóng cho công nghệ hỗ trợ.

## 18. Bằng chứng cần có trước khi tuyên bố hoàn thành

- Test transaction/race cho shutdown đối đầu checkout payment completion.
- Test D39 cho shutdown đối đầu match settlement tại cutoff.
- Test marketplace refund 100% và append-only ledger.
- Test match contribution refund cho organizer và nhiều participant.
- Test notification bắt buộc khi user đã tắt category booking/match.
- Test fan-out tới JOIN approved và confirmed, không gửi trùng.
- Test booking nội bộ không tạo refund.
- Test emergency booking đang diễn ra.
- Test scheduled cutoff tại đúng 00:00 múi giờ Việt Nam và booking giao ranh
  giới.
- Test retry/idempotency và item `needs_attention`.
- Test `expectedInactiveAt` không trôi muộn khi checkout/match hiện hữu hoàn tất.
- Test mọi chuyển chế độ hợp lệ, cancellation/refund tăng thêm và không xử lý
  trùng booking đã hoàn thành.
- Test từ chối hạ `emergency` đã có hiệu lực về chế độ nhẹ hơn.
- Test API trực tiếp không vượt qua shutdown.
- Test client copy không hiển thị raw enum/mã kỹ thuật.
- Test notification, booking card và provider booking detail cùng hiển thị một
  `Booking.businessCode`; route và quyền vẫn dùng UUID nội bộ.
- Test thẻ booking đã hủy không hiển thị vùng chi tiết trước thao tác mở; sau
  thao tác hiển thị đúng `Booking.createdAt`, `businessCode`, địa chỉ, lịch
  chơi, mức hoàn và lý do hủy; thao tác đóng ẩn lại vùng chi tiết.

## 19. Cập nhật có thẩm quyền cần thực hiện trước code

Sau khi bản viết này được người dùng xem lại, kế hoạch triển khai phải cập nhật
trước các nguồn có thẩm quyền sau:

1. `docs/product/decision-log.md`: quyết định mới supersede D5, ngoại lệ BOK-10,
   notification bắt buộc và xử lý match theo booking cancellation.
2. `docs/product/specs/venue-scheduling.md`: ba chế độ shutdown, state và AC.
3. `docs/product/specs/court-booking.md`: cutoff, cancellation hàng loạt và ngoại
   lệ emergency cho ca đang diễn ra.
4. `docs/product/specs/finance-disputes.md`: kết quả hoàn tiền và event xác nhận
   refund hoàn tất.
5. `docs/product/specs/matchmaking-passport.md` và `finance-match-fee.md`: hủy do
   shutdown và fan-out thông báo.
6. Shared notification contract và tài liệu kiến trúc event/service boundary.

Không bắt đầu thay đổi hành vi runtime chỉ dựa trên frontmatter `approved` của
tài liệu này; các nguồn có thẩm quyền trên phải được cập nhật nhất quán trước.
