# Thiết kế Quản lý booking cho chủ sân

**Ngày:** 2026-09-22
**Trạng thái:** Đã duyệt mockup
**Phạm vi:** Workspace chủ sân trong `apps/web` và API đọc booking thuộc cơ sở của chủ sân

## 1. Mục tiêu

Thêm chức năng **Quản lý booking** vào workspace chủ sân để một chủ sân có thể:

- xem toàn bộ booking có ý nghĩa nghiệp vụ thuộc các cơ sở của mình;
- phân biệt booking đã qua, đang diễn ra và sắp tới;
- tìm, lọc và phân trang mà không phải duyệt lịch từng ngày;
- mở chi tiết booking trong panel bên phải mà không rời danh sách.

Trang này bổ sung cho `/manage/calendar`, không thay thế lịch. **Lịch** tiếp tục phục vụ quan sát vận hành theo ngày/tuần; **Quản lý booking** phục vụ tra cứu danh sách toàn thời gian.

## 2. Thẩm quyền sản phẩm

PO đã duyệt mockup ngày 2026-09-22 với các quyết định sau:

- tên chức năng là **Quản lý booking**;
- mục điều hướng nằm ngay sau **Lịch** trong sidebar quản lý sân;
- trang bao phủ booking quá khứ, hiện tại và tương lai;
- chi tiết booking mở bằng panel trượt từ bên phải;
- giao diện dùng visual system hiện hành của COURTIN.

Thiết kế không thay đổi chính sách đặt sân, hủy, hoàn tiền, doanh thu hoặc quyền sở hữu booking hiện hành.

## 3. Phạm vi dữ liệu

Danh sách chỉ trả booking thuộc sân con của cơ sở mà `provider.userId` bằng người dùng đang đăng nhập. API phải kiểm tra quyền sở hữu ở phía server; lọc ở frontend không phải ranh giới bảo mật.

Các booking được hiển thị:

- booking `marketplace` ở trạng thái `confirmed` hoặc `completed`;
- booking `cancelled` có lý do hủy, tức đã từng là giao dịch có ý nghĩa nghiệp vụ;
- booking `held` đã có cọc kèo và còn ý nghĩa thanh toán;
- booking `internal` do chủ sân ghi nhận, gồm trạng thái hợp lệ tương ứng.

Không hiển thị booking kỹ thuật bị tự động hủy do hold chưa thanh toán hết hạn và không có lý do hủy. Quy tắc này đồng nhất với lịch sử người chơi và danh sách booking Admin hiện hành.

## 4. Phân loại thời gian và trạng thái

Nhóm thời gian được suy ra tại thời điểm request:

- **Đã qua:** `endAt <= now`;
- **Đang diễn ra:** `startAt <= now < endAt` và booking chưa bị hủy;
- **Sắp tới:** `startAt > now` và booking chưa bị hủy;
- booking đã hủy vẫn có thể được tìm trong **Tất cả** và bằng bộ lọc trạng thái, nhưng không được tính là đang diễn ra hoặc sắp tới.

Trạng thái nghiệp vụ vẫn hiển thị riêng: chờ thanh toán, đã xác nhận, đã hoàn thành, đã hủy. Nhóm thời gian không ghi đè `BOOKING.status`.

Múi giờ trình bày và biên ngày dùng `Asia/Ho_Chi_Minh`, nhất quán với các bộ lọc ngày hiện có.

## 5. Trải nghiệm trang danh sách

### 5.1 Điều hướng

- Route mới: `/manage/bookings`.
- Sidebar `/manage/*` thêm mục **Quản lý booking** ngay sau **Lịch** và trước **Sự cố**.
- Dashboard tổng quan thêm shortcut **Quản lý booking** để truy cập cùng route.
- Route nằm dưới `RoleGuard` dành cho `provider` như các trang quản lý sân khác.

### 5.2 Đầu trang và thống kê

Đầu trang gồm tiêu đề **Quản lý booking** và mô tả ngắn về phạm vi toàn thời gian. Bốn thẻ thống kê hiển thị:

- Tất cả booking;
- Đã hoàn thành;
- Đang diễn ra;
- Sắp tới.

Số liệu thống kê phản ánh các bộ lọc cơ sở, sân con, trạng thái, từ khóa và khoảng ngày đang áp dụng, nhưng không bị thu hẹp bởi chip nhóm thời gian đang chọn. Nhờ vậy người dùng có thể đổi nhóm mà vẫn thấy tổng quan của cùng tập kết quả.

Nút **Xuất danh sách** trong mockup chỉ minh họa hướng mở rộng và không thuộc phạm vi triển khai này.

### 5.3 Bộ lọc

Trang cung cấp:

- từ khóa theo mã booking, tên cơ sở, tên sân hoặc tên khách vãng lai;
- cơ sở;
- sân con, phụ thuộc cơ sở đã chọn;
- trạng thái booking;
- chip thời gian: **Tất cả**, **Đã qua**, **Đang diễn ra**, **Sắp tới**;
- khoảng ngày tùy chọn;
- phân trang, mặc định 20 booking mỗi trang.

Tên hiển thị của người chơi đăng nhập được enrich sau khi lấy booking và không nằm trong tìm kiếm từ khóa phiên bản đầu. Không mở rộng API tài khoản chỉ để tìm theo tên người chơi.

Khi thay đổi bất kỳ bộ lọc nào, trang quay về trang 1. Query string phản ánh bộ lọc để tải lại trang hoặc mở liên kết không làm mất ngữ cảnh.

### 5.4 Bảng kết quả

Mỗi hàng gồm:

- mã booking rút gọn nhưng vẫn cho phép sao chép mã đầy đủ trong panel;
- cơ sở và sân con;
- tên/nhãn khách;
- nguồn booking: COURTIN hoặc nội bộ;
- ngày và khung giờ;
- trạng thái;
- `priceSnapshot`;
- hành động **Chi tiết**.

Thứ tự mặc định là `startAt desc`, ổn định thêm bằng `id desc`. Các chip thời gian giúp chủ sân nhanh chóng chuyển sang danh sách đang diễn ra hoặc sắp tới khi cần vận hành.

## 6. Panel chi tiết booking

Chọn một hàng hoặc **Chi tiết** mở panel trượt từ bên phải. Danh sách vẫn ở nền và giữ nguyên bộ lọc, trang cùng vị trí cuộn.

Panel gồm:

1. **Tóm tắt:** mã booking, trạng thái và nhãn thời gian.
2. **Thông tin ca đặt:** cơ sở, sân con, địa chỉ, ngày, khung giờ, thời lượng và nguồn booking.
3. **Khách hàng:** tên hiển thị của người chơi hoặc tên khách vãng lai.
4. **Thanh toán:** giá đã chốt và trạng thái thanh toán ở mức dữ liệu venue-booking hiện có.
5. **Đối soát:** liên kết người dùng sang trang **Tài chính** để xem doanh thu; panel không tự suy diễn doanh thu từ `priceSnapshot`.

Quy tắc riêng tư:

- booking online chỉ hiển thị tên công khai do account-service trả về; không trả email hoặc số điện thoại;
- booking nội bộ có thể hiển thị `guestContact` vì đây là dữ liệu chủ sân đã nhập;
- hành động liên hệ trực tiếp chỉ xuất hiện khi booking nội bộ có `guestContact`;
- nếu account-service tạm thời không phản hồi, dùng nhãn dự phòng **Người chơi** và vẫn hiển thị phần còn lại của booking.

Panel đóng bằng nút đóng, phím `Escape` hoặc bấm vào lớp nền. Trọng tâm bàn phím được giữ trong panel và trả về hàng booking đã mở khi đóng.

## 7. API và data flow

### 7.1 Danh sách

Thêm endpoint:

`GET /providers/me/bookings`

Query:

```text
query?: string
venueId?: uuid
courtId?: uuid
status?: held | confirmed | completed | cancelled
timeScope?: all | past | current | future
from?: YYYY-MM-DD
to?: YYYY-MM-DD
page?: integer >= 1
pageSize?: integer 1..100, default 20
```

Response:

```ts
{
  items: ProviderBookingRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    all: number;
    completed: number;
    current: number;
    future: number;
  };
}
```

Domain query luôn thêm điều kiện ownership qua quan hệ `court.venue.provider.userId`. Account display names được enrich theo batch giống lịch sân hiện tại; lỗi enrich không làm hỏng request.

### 7.2 Chi tiết

Thêm endpoint:

`GET /providers/me/bookings/:id`

Endpoint trả một `ProviderBookingDetail` sau khi kiểm tra ownership. Booking không tồn tại hoặc không thuộc chủ sân đều không được làm lộ dữ liệu booking của chủ khác; response dùng contract lỗi chuẩn của service.

Chi tiết không gọi finance-service để tổng hợp doanh thu. Thông tin doanh thu/hoa hồng/đáo hạn vẫn thuộc `/manage/finance`, tránh tạo hai nguồn sự thật tài chính.

### 7.3 Frontend

Frontend thêm:

- `ManageBookingsPage` quản lý query string, load danh sách và trạng thái rỗng/lỗi;
- `ProviderBookingFilters` cho bộ lọc;
- `ProviderBookingTable` cho desktop và danh sách card tương đương trên mobile;
- `ProviderBookingDetailDrawer` cho chi tiết;
- kiểu dữ liệu và hàm API tương ứng trong `venueBookingApi.ts`.

Các booking event hiện đã làm mới dữ liệu quản lý thông qua cơ chế invalidation chung; trang mới đăng ký cùng kênh và tải lại danh sách đang hiển thị. Khi panel đang mở, trang tải lại cả hàng tương ứng và chi tiết; nếu booking không còn khả dụng, đóng panel và hiển thị thông báo phục hồi.

## 8. Trạng thái giao diện

- **Đang tải:** skeleton cho thẻ thống kê và bảng; không nhấp nháy về trạng thái rỗng.
- **Không có dữ liệu:** thông báo phù hợp với bộ lọc và nút xóa bộ lọc.
- **Lỗi danh sách:** giữ bộ lọc, hiển thị lỗi cùng nút thử lại.
- **Lỗi chi tiết:** panel hiển thị lỗi cục bộ và cho phép thử lại hoặc đóng; bảng vẫn dùng được.
- **Account enrich lỗi:** hiển thị **Người chơi**, không coi là lỗi toàn trang.
- **Trang vượt phạm vi sau khi lọc:** tự quay về trang cuối hợp lệ hoặc trang 1.

## 9. Responsive và accessibility

- Desktop dùng bảng và panel phải rộng tối đa khoảng 480px.
- Mobile dùng card thay bảng; panel chiếm gần toàn bộ chiều rộng.
- Mọi filter có label truy cập được; badge trạng thái không chỉ phân biệt bằng màu.
- Hàng bảng có hành động rõ ràng, không phụ thuộc hoàn toàn vào click toàn hàng.
- Panel dùng semantics dialog, quản lý focus, hỗ trợ `Escape` và khóa cuộn nền.
- Màu, typography, radius, shadow và spacing dùng token/component hiện có trong `apps/web`.

## 10. Kiểm chứng

### Domain/API

- chủ sân chỉ thấy booking của các cơ sở do mình sở hữu;
- không thể đọc chi tiết booking của chủ sân khác;
- danh sách gồm booking marketplace và internal hợp lệ;
- hold tự hết hạn chưa thanh toán không xuất hiện;
- lọc past/current/future đúng tại hai biên `startAt` và `endAt`;
- booking đã hủy không bị tính vào current/future;
- lọc venue/court/status/khoảng ngày và phân trang trả tổng đúng;
- BigInt được tuần tự hóa thành chuỗi;
- account-service lỗi vẫn trả danh sách với nhãn dự phòng.

### Frontend

- sidebar và shortcut dashboard đi tới `/manage/bookings`;
- bộ lọc được đồng bộ với query string và reset page;
- bảng hiển thị đúng nguồn, thời gian, trạng thái và giá;
- mở/đóng panel giữ nguyên ngữ cảnh danh sách;
- panel chỉ hiện liên hệ cho booking nội bộ có `guestContact`;
- loading, empty, list error và detail error có recovery;
- desktop/mobile và keyboard flow được kiểm tra.

### Browser QA

Với tài khoản chủ sân có dữ liệu mẫu, xác nhận:

1. toàn bộ booking quá khứ, hiện tại và tương lai có thể truy cập;
2. chuyển chip và bộ lọc không mất ngữ cảnh;
3. chi tiết đúng booking đã chọn;
4. dữ liệu của cơ sở khác không xuất hiện;
5. realtime invalidation cập nhật danh sách mà không cần tải lại trang thủ công.

## 11. Ngoài phạm vi

- xuất CSV/PDF hoặc hóa đơn;
- chỉnh sửa booking trực tiếp từ trang danh sách;
- hủy/đổi sân trong panel; các thao tác này tiếp tục thuộc luồng **Sự cố**;
- nhắn tin trong ứng dụng hoặc tiết lộ thông tin liên hệ của người chơi online;
- tính lại hoặc hiển thị chi tiết ledger/doanh thu thay cho trang **Tài chính**;
- thay đổi vòng đời booking hoặc chính sách hủy/hoàn tiền.
