# Thiết kế UI tài chính chủ sân — Clean V2

Ngày: 2026-09-10

Trạng thái: Đã duyệt hướng trực quan và cơ chế realtime, chờ duyệt spec cập nhật

Phạm vi: UI tài chính chủ sân trong `apps/web`, kênh realtime có xác thực trong
`finance-service`, tín hiệu đồng bộ qua outbox/event bus và test trực tiếp liên quan

## Mục tiêu

Chủ sân mở trang Tài chính để biết ngay số tiền có thể rút và tình hình doanh thu hôm nay. Giao diện phải giảm tải nhận thức, chỉ có một hành động chính trên màn hình đầu và không buộc người dùng chuyển qua nhiều tab cho nhu cầu thường ngày.

Thiết kế không thay đổi quy tắc tài chính, schema hoặc dữ liệu. Số dư ví kinh
doanh vẫn là nguồn sự thật; không suy ra số dư bằng cách cộng các dòng doanh thu
đang lọc. Backend chỉ bổ sung kênh báo thay đổi realtime và không thay đổi contract
của các API đọc/ghi tài chính hiện có.

## Cấu trúc màn hình

### 1. Ngữ cảnh trang

- Tiêu đề ngắn và lời dẫn “Tình hình dòng tiền của các cơ sở hôm nay”.
- Hiển thị ngày hiện tại theo múi giờ Việt Nam.
- Không lặp lại đoạn giải thích dài về quy tắc tài chính ở đầu trang.

### 2. Khối tổng quan duy nhất

Một khối nền navy chứa:

- **Số dư có thể rút** — thông tin nổi bật nhất, lấy từ `wallet.available`.
- **Rút tiền** — CTA chính duy nhất.
- **Doanh thu hôm nay** — tổng `net` và số booking từ truy vấn doanh thu trong biên ngày `+07:00`.
- **Đang chờ 24 giờ** — lấy từ `wallet.pending`.
- **Yêu cầu đang xử lý** — trạng thái của withdrawal `pending` hoặc `partially_paid` nếu có.

Không thêm biểu đồ vì chưa giúp hoàn thành tác vụ chính và làm tăng độ phức tạp thị giác.

### 3. Hoạt động gần đây

Thay hai khu vực “Doanh thu” và “Sổ giao dịch” bằng một danh sách hoạt động dễ quét:

- Các bút toán ví gần nhất lấy từ ledger.
- Nhãn nghiệp vụ bằng tiếng Việt, số tiền có dấu cộng/trừ và màu semantic.
- Dòng doanh thu chờ hiển thị thời điểm khả dụng khi dữ liệu revenue tương ứng có sẵn.
- Tên cơ sở được ánh xạ từ `getMyManagedVenues()`; không hiển thị ID nội bộ cho người dùng.
- Mặc định hiển thị danh sách ngắn; “Xem tất cả” mở rộng nội dung ngay trên trang, không chuyển route.

Các bộ lọc `Tất cả / Doanh thu / Rút tiền` là lọc nhanh. Bộ lọc nâng cao theo cơ sở và khoảng ngày nằm sau nút **Bộ lọc**, chỉ xuất hiện khi người dùng cần.

### 4. Luồng rút tiền

Nhấn **Rút tiền** mở drawer trên desktop và bottom sheet trên mobile. Form chỉ xuất hiện khi có ý định rút, gồm:

- Số tiền, với nút **Rút toàn bộ**.
- Ngân hàng, số tài khoản và tên chủ tài khoản.
- Tóm tắt số tiền sẽ được giữ trước khi xác nhận.

Nếu có yêu cầu đang xử lý, CTA mở trạng thái yêu cầu hiện tại thay vì form mới. Người dùng có thể hủy yêu cầu khi backend cho phép. Thông báo lỗi nằm sát trường hoặc hành động gây lỗi; thông báo thành công xác nhận tiền đã chuyển từ `available` sang `reserved`.

Thiết kế giữ nguyên quy tắc chỉ có một yêu cầu `pending`/`partially_paid` và mức rút tối thiểu hiện hành trong code/backend.

### 5. Trạng thái cập nhật trực tiếp

Một chỉ báo nhỏ, không cạnh tranh với số dư, thể hiện một trong ba trạng thái:

- **Đang cập nhật trực tiếp** khi kết nối SSE hoạt động.
- **Đang kết nối lại** khi kết nối tạm thời gián đoạn; UI giữ số liệu cuối cùng.
- **Cập nhật lần cuối lúc …** nếu chưa thể nối lại; người dùng có thể bấm tải lại.

Không dùng toast cho mỗi giao dịch mới vì sẽ gây nhiễu. Khi số liệu thay đổi, UI cập
nhật tại chỗ và có thể dùng chuyển động nhẹ, tôn trọng `prefers-reduced-motion`.

## Cơ chế realtime

### Nguyên tắc dữ liệu

- API đọc hiện có tiếp tục là nguồn dữ liệu chuẩn duy nhất.
- SSE không gửi số dư hoặc số tiền để frontend tự cộng/trừ. Mỗi message chỉ là tín
  hiệu invalidation cho biết phạm vi nào đã thay đổi: `wallet`, `revenue`, `ledger`
  hoặc `withdrawals`.
- Sau khi nhận tín hiệu, frontend gộp các message đến gần nhau rồi tải lại đúng các
  API bị ảnh hưởng. Phản hồi mới thay thế snapshot cũ theo một lần đồng bộ nguyên vẹn.
- Tín hiệu lặp hoặc đến sai thứ tự không làm sai tiền vì client không áp dụng delta.

### Luồng phát tín hiệu

1. Mỗi transaction làm thay đổi dữ liệu tài chính của chủ sân ghi thêm một finance
   UI invalidation vào outbox trong cùng transaction.
2. Outbox relay hiện có publish tín hiệu qua RabbitMQ sau khi transaction commit.
3. Mỗi instance finance-service nhận tín hiệu và chuyển tới các kết nối SSE cục bộ
   của đúng `sellerUserId`.
4. Browser nhận message, debounce trong một cửa sổ ngắn rồi refetch dữ liệu chuẩn.

Payload không chứa số tiền, thông tin ngân hàng hoặc dữ liệu của chủ sân khác. Mỗi
tín hiệu có `eventId`, `sellerUserId`, danh sách `scopes` và `occurredAt`; replay an
toàn và có thể được client bỏ trùng theo `eventId`.

Mỗi replica dùng một queue riêng gắn vào topic realtime để mọi replica đều nhận được
tín hiệu cần broadcast cho các client đang kết nối với nó. Tín hiệu nghiệp vụ vẫn
đi qua outbox bền vững; SSE là lớp giao nhận tạm thời, client luôn có đường refetch.

### Kết nối và xác thực

- Endpoint SSE thuộc finance-service và bắt buộc JWT như các API tài chính khác.
- Do ứng dụng đang dùng Authorization header, frontend mở stream bằng `fetch` và
  đọc `text/event-stream`; không đặt token trong query string.
- Server chỉ đăng ký kết nối vào channel của user lấy từ JWT và không chấp nhận
  `sellerUserId` do client truyền vào.
- Server gửi heartbeat định kỳ để phát hiện kết nối chết và giải phóng listener khi
  client đóng tab.
- Client reconnect với exponential backoff có jitter, refetch ngay sau khi nối lại,
  refetch khi tab trở lại trạng thái visible và chạy một nhịp safety refresh thưa để
  tự phục hồi nếu tín hiệu từng bị bỏ lỡ.
- Mục tiêu quan sát được: dữ liệu mới xuất hiện trong UI trong 1–3 giây ở điều kiện
  mạng bình thường; khi offline, UI không tuyên bố đang realtime.

## Trạng thái và lỗi

- Loading: skeleton theo đúng hai khối chính, không dựng nhiều thẻ giả.
- Chưa có ví kinh doanh: giữ empty state hiện hành và giải thích điều kiện tạo ví.
- Không có giao dịch: empty state nhỏ trong danh sách, không thay toàn bộ trang.
- Lỗi tải tổng thể: alert có nút thử lại.
- Lỗi lọc hoặc rút tiền: giữ dữ liệu đã tải, không làm trắng trang.
- Mất SSE: giữ snapshot cuối, hiển thị trạng thái kết nối và tự đồng bộ sau reconnect.
- Trạng thái không chỉ dựa vào màu; luôn có nhãn chữ và tên truy cập phù hợp.

## Responsive và hình thức

- Tuân theo visual authority COURTIN: navy `#15446C`, yellow `#F5E663`, canvas `#F7F7F5`, surface trắng và line `#E5E5E0`.
- Heading dùng Archivo; nội dung và control dùng Inter; tiền và mã tham chiếu dùng Geist Mono theo token sẵn có.
- Desktop: khối tổng quan hai vùng; mobile: xếp dọc, CTA rộng toàn hàng.
- Danh sách giao dịch giữ số tiền thẳng hàng; nội dung dài được xuống dòng an toàn.
- Pill chỉ dùng cho CTA, filter và status; tránh biến mọi phần tử thành card.

## Ranh giới component

Giữ `ManageFinancePage` làm nơi điều phối snapshot dữ liệu. Tách các đơn vị chỉ khi giúp code dễ hiểu:

- `FinanceOverview`: hiển thị ví, doanh thu hôm nay và trạng thái rút.
- `FinanceActivityList`: chuẩn hóa và hiển thị hoạt động gần đây.
- `WithdrawalSheet`: form và trạng thái yêu cầu rút.
- `FinanceFilters`: lọc nhanh và bộ lọc nâng cao.
- `useFinanceRealtime`: quản lý stream, reconnect, debounce và refetch theo scope.

Các component trình bày nhận dữ liệu và callback qua props; không tự gọi API. Hook
realtime chỉ phát yêu cầu đồng bộ cho page, không tự tính số dư. Không refactor
`FinancePanel` mồ côi hoặc các trang tài chính Admin trong task này.

## Dữ liệu và hành vi

1. Trang tải ví, cơ sở, withdrawal, ledger và doanh thu hôm nay từ API hiện có.
2. Ví business cung cấp `available`, `pending`, `reserved`.
3. Doanh thu hôm nay dùng biên ngày Việt Nam; thay đổi bộ lọc chỉ thay tập doanh thu/hoạt động hiển thị, không thay số dư ví.
4. Tạo hoặc hủy withdrawal gọi API hiện hành rồi tải lại dữ liệu tài chính.
5. Tín hiệu realtime làm mới đúng các tập dữ liệu bị ảnh hưởng; nhiều tín hiệu liên
   tiếp được gộp để tránh request storm.
6. Sau create/cancel withdrawal thành công, UI refetch ngay mà không chờ SSE.
7. Không lưu thông tin ngân hàng mới ở frontend ngoài state của form.

## Kiểm chứng

- Component test: tải và hiển thị đúng số dư từ ví; doanh thu hôm nay dùng biên `+07:00`; mở/đóng sheet rút tiền; “Rút toàn bộ”; khóa tạo mới khi có yêu cầu đang xử lý; lọc nhanh và lọc nâng cao; lỗi không xóa dữ liệu cũ.
- Realtime frontend test: nhận scope và refetch đúng API; debounce burst; bỏ trùng;
  reconnect/backoff; refetch khi visible; trạng thái online/offline; cleanup khi unmount.
- Backend test: từ chối stream thiếu/sai JWT; không cho subscribe user khác; phát
  invalidation chỉ sau commit; rollback không phát; payload không chứa dữ liệu nhạy
  cảm; mỗi replica nhận tín hiệu; heartbeat và cleanup listener.
- Integration test: một thay đổi ledger/revenue/withdrawal thực tạo tín hiệu, client
  nhận rồi đọc được snapshot mới; replay không làm thay đổi số dư lần hai.
- Focused test: `manageOperations.test.tsx` và các test component mới nếu được tách file.
- Typecheck/build frontend sau khi người dùng cho phép bước kiểm chứng.
- Browser QA tại `/manage/finance` ở desktop và mobile với role chủ sân; xác nhận
  số dư và hoạt động tự đổi trong 1–3 giây sau một fixture giao dịch có kiểm soát,
  trạng thái reconnect, luồng xem tổng quan, form và validation. Không thực hiện
  mutation tài chính thật nếu chưa được cho phép riêng.

## Ngoài phạm vi

- Thay đổi commission, thời gian giữ doanh thu, mức rút tối thiểu hoặc vòng đời withdrawal.
- Thay đổi contract nghiệp vụ của API hiện có, schema tài chính hoặc cách ghi ledger.
- Trang tài chính Admin, tranh chấp người chơi/Admin và đối soát SePay.
- Biểu đồ, xuất báo cáo, lưu tài khoản ngân hàng hoặc thêm route mới.
