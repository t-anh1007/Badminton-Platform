# Thiết kế UI tài chính chủ sân — Clean V2

Ngày: 2026-09-10

Trạng thái: Đã duyệt hướng trực quan, chờ duyệt spec

Phạm vi: `apps/web/src/pages/manage/ManageFinancePage.tsx` và test trực tiếp liên quan

## Mục tiêu

Chủ sân mở trang Tài chính để biết ngay số tiền có thể rút và tình hình doanh thu hôm nay. Giao diện phải giảm tải nhận thức, chỉ có một hành động chính trên màn hình đầu và không buộc người dùng chuyển qua nhiều tab cho nhu cầu thường ngày.

Thiết kế không thay đổi quy tắc tài chính, API, service, schema hoặc dữ liệu. Số dư ví kinh doanh vẫn là nguồn sự thật; không suy ra số dư bằng cách cộng các dòng doanh thu đang lọc.

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

## Trạng thái và lỗi

- Loading: skeleton theo đúng hai khối chính, không dựng nhiều thẻ giả.
- Chưa có ví kinh doanh: giữ empty state hiện hành và giải thích điều kiện tạo ví.
- Không có giao dịch: empty state nhỏ trong danh sách, không thay toàn bộ trang.
- Lỗi tải tổng thể: alert có nút thử lại.
- Lỗi lọc hoặc rút tiền: giữ dữ liệu đã tải, không làm trắng trang.
- Trạng thái không chỉ dựa vào màu; luôn có nhãn chữ và tên truy cập phù hợp.

## Responsive và hình thức

- Tuân theo visual authority COURTIN: navy `#15446C`, yellow `#F5E663`, canvas `#F7F7F5`, surface trắng và line `#E5E5E0`.
- Heading dùng Archivo; nội dung và control dùng Inter; tiền và mã tham chiếu dùng Geist Mono theo token sẵn có.
- Desktop: khối tổng quan hai vùng; mobile: xếp dọc, CTA rộng toàn hàng.
- Danh sách giao dịch giữ số tiền thẳng hàng; nội dung dài được xuống dòng an toàn.
- Pill chỉ dùng cho CTA, filter và status; tránh biến mọi phần tử thành card.

## Ranh giới component

Giữ `ManageFinancePage` làm nơi điều phối tải dữ liệu. Tách các đơn vị chỉ khi giúp code dễ hiểu:

- `FinanceOverview`: hiển thị ví, doanh thu hôm nay và trạng thái rút.
- `FinanceActivityList`: chuẩn hóa và hiển thị hoạt động gần đây.
- `WithdrawalSheet`: form và trạng thái yêu cầu rút.
- `FinanceFilters`: lọc nhanh và bộ lọc nâng cao.

Các component nhận dữ liệu và callback qua props; không tự gọi API. Không refactor `FinancePanel` mồ côi hoặc các trang tài chính Admin trong task này.

## Dữ liệu và hành vi

1. Trang tải ví, cơ sở, withdrawal, ledger và doanh thu hôm nay từ API hiện có.
2. Ví business cung cấp `available`, `pending`, `reserved`.
3. Doanh thu hôm nay dùng biên ngày Việt Nam; thay đổi bộ lọc chỉ thay tập doanh thu/hoạt động hiển thị, không thay số dư ví.
4. Tạo hoặc hủy withdrawal gọi API hiện hành rồi tải lại dữ liệu tài chính.
5. Không lưu thông tin ngân hàng mới ở frontend ngoài state của form.

## Kiểm chứng

- Component test: tải và hiển thị đúng số dư từ ví; doanh thu hôm nay dùng biên `+07:00`; mở/đóng sheet rút tiền; “Rút toàn bộ”; khóa tạo mới khi có yêu cầu đang xử lý; lọc nhanh và lọc nâng cao; lỗi không xóa dữ liệu cũ.
- Focused test: `manageOperations.test.tsx` và các test component mới nếu được tách file.
- Typecheck/build frontend sau khi người dùng cho phép bước kiểm chứng.
- Browser QA tại `/manage/finance` ở desktop và mobile với role chủ sân; xác nhận luồng xem tổng quan, mở form, validation, tạo/hủy yêu cầu bằng dữ liệu phù hợp. Không thực hiện mutation tài chính thật nếu chưa được cho phép riêng.

## Ngoài phạm vi

- Thay đổi commission, thời gian giữ doanh thu, mức rút tối thiểu hoặc vòng đời withdrawal.
- Thay đổi backend, API, schema hoặc ledger.
- Trang tài chính Admin, tranh chấp người chơi/Admin và đối soát SePay.
- Biểu đồ, xuất báo cáo, lưu tài khoản ngân hàng hoặc thêm route mới.
