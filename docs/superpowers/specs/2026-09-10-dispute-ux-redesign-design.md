# Thiết kế lại UI/UX tranh chấp

## Kết quả cần đạt

Làm lại luồng tranh chấp cho người chơi và Admin theo hướng booking-first: người chơi nhận diện đúng ca chơi mà không cần đọc mã booking, gửi yêu cầu trong một vùng thao tác duy nhất, và Admin xử lý từng hồ sơ trong một hàng đợi rõ ràng. Thay đổi giữ nguyên ba kết quả tài chính đã duyệt: hoàn toàn bộ, hoàn một phần hoặc bác tranh chấp.

## Phạm vi đã duyệt

- Áp dụng cho tab **Tranh chấp** trong hồ sơ người chơi và trang **Tranh chấp** của Admin.
- Người chơi chọn lý do có sẵn, nhập mô tả ngắn, nhập số điện thoại liên hệ bắt buộc và tải tối đa 5 ảnh bằng chứng.
- Số điện thoại được tự điền từ hồ sơ khi có, nhưng người chơi được sửa và phải xác nhận một giá trị hợp lệ trước khi gửi.
- Ảnh hỗ trợ JPEG, PNG và WebP qua cơ chế upload có cấp quyền hiện có; không còn yêu cầu người chơi tự nhập URL.
- Không thay đổi cửa sổ tranh chấp 24 giờ, quyền truy cập, công thức hoàn tiền, ledger append-only hoặc thẩm quyền quyết định của Admin.

## Luồng người chơi

### Chọn booking

Tab mở bằng danh sách card của các booking đủ điều kiện. Mỗi card hiển thị tên sân nếu API có dữ liệu, thời gian chơi, số tiền đã thanh toán và thời gian còn lại để gửi tranh chấp. Mã UUID không xuất hiện trên giao diện. Nếu chỉ có một booking đủ điều kiện, card đó vẫn hiển thị nhưng không cần thêm bước chọn dropdown.

Nút **Báo vấn đề** mở form ngay dưới card được chọn. Chọn card khác sẽ chuyển form sang booking đó sau khi cảnh báo nếu người chơi đã nhập dữ liệu chưa gửi.

### Form gửi yêu cầu

Form gồm đúng bốn nhóm thông tin theo thứ tự:

1. Lý do phổ biến dạng lựa chọn một chạm: `Sân đóng cửa / không thể chơi`, `Dịch vụ không đúng mô tả`, `Sai thời lượng hoặc sân đã đặt`, `Vấn đề thanh toán`, `Vấn đề khác`.
2. Mô tả ngắn bắt buộc để bổ sung ngữ cảnh. Lý do gửi tới API là nhãn đã chọn kết hợp với mô tả, do API hiện dùng một trường `reason`.
3. **Số điện thoại liên hệ** bắt buộc. Giá trị được tự điền từ hồ sơ nếu có, vẫn cho phép sửa và được lưu theo snapshot của tranh chấp; sửa ở form không âm thầm thay đổi hồ sơ tài khoản.
4. Khu vực kéo-thả hoặc chọn tối đa 5 ảnh JPEG/PNG/WebP. Mỗi ảnh có preview, tiến trình, thao tác thử lại và gỡ.

Nút **Gửi yêu cầu** bị vô hiệu hóa khi thiếu lý do, mô tả hoặc số điện thoại; khi còn ảnh đang tải; hoặc khi có ảnh tải lỗi chưa được gỡ/thử lại. Một lần bấm gửi tạo tranh chấp. Sau thành công, giao diện chuyển trọng tâm tới card trạng thái vừa tạo.

### Theo dõi yêu cầu

Danh sách dùng nhãn dành cho người dùng thay vì enum nội bộ:

- `open` → **Đang xem xét**.
- `full_refund` → **Đã hoàn toàn bộ**.
- `partial_refund` → **Đã hoàn một phần**, kèm số tiền.
- `rejected` → **Không được chấp nhận**.

Mỗi item hiển thị ngày gửi, lý do, số điện thoại đã cung cấp và kết quả. Nội dung kỹ thuật như bút toán không xuất hiện ở phía người chơi.

## Luồng Admin

Trang desktop dùng bố cục hai vùng: hàng đợi bên trái và chi tiết hồ sơ đang chọn bên phải. Trên màn hình nhỏ, danh sách nằm trên chi tiết nhưng vẫn dùng cùng mô hình chọn một hồ sơ.

### Hàng đợi

- Ưu tiên tranh chấp đang mở, gần hạn trước; hồ sơ đã giải quyết nằm sau.
- Mỗi item hiển thị trạng thái, lý do ngắn, số tiền và hạn xử lý.
- Chọn item không điều hướng sang trang khác.

### Chi tiết và quyết định

Chi tiết hiển thị thông tin booking, lý do/mô tả, số điện thoại liên hệ dạng liên kết `tel:`, gallery ảnh có thể phóng to và lịch sử bút toán trong vùng mở rộng dành cho kiểm tra chuyên sâu.

Admin chọn một trong ba card quyết định. Chỉ khi chọn **Hoàn một phần** mới xuất hiện trường số tiền. Trường lý do quyết định luôn bắt buộc. Nút duy nhất **Xem lại & xác nhận** mở modal tóm tắt quyết định, số tiền và lý do; nút xác nhận cuối cùng mới gọi API. Sau thành công, hàng đợi và chi tiết được cập nhật, tránh thao tác lặp.

## Dữ liệu và API

### Snapshot số điện thoại

Thêm `contactPhone` bắt buộc vào dữ liệu tạo tranh chấp và bản ghi `Dispute`. Backend chuẩn hóa khoảng trắng, dấu chấm và dấu gạch ngang trước khi kiểm tra; chấp nhận số Việt Nam bắt đầu bằng `0` gồm 10 chữ số hoặc dạng `+84` tương đương. API Admin và API tranh chấp của người chơi trả lại snapshot này.

### Ảnh bằng chứng

Finance service thêm endpoint cấp quyền upload trong namespace `finance/disputes/{userId}/...` thuộc người chơi. Endpoint chỉ chấp nhận JPEG/PNG/WebP và dùng cơ chế presigned upload của `packages/object-storage`.

Client tải ảnh trước, sau đó gửi tối đa 5 object key trong `evidence`. Finance service xác minh namespace, quyền sở hữu và sự tồn tại của từng object trước khi tạo tranh chấp. API đọc chuyển object key thành URL đọc được để Admin hiển thị. Dữ liệu cũ chứa URL vẫn tiếp tục được hiển thị như liên kết, bảo đảm tương thích.

## Trạng thái và lỗi

- Không có booking đủ điều kiện: giải thích điều kiện 24 giờ và đưa người dùng về danh sách booking, không hiển thị form trống.
- Tải dữ liệu lỗi: thông báo ngay trong vùng nội dung và có nút thử lại.
- Ảnh lỗi: lỗi nằm trên đúng thumbnail; người dùng có thể thử lại hoặc gỡ mà không mất dữ liệu form.
- Gửi quá hạn hoặc có tranh chấp đồng thời: giữ nội dung form, hiển thị thông báo nghiệp vụ từ backend và tải lại danh sách đủ điều kiện.
- Admin nhập số tiền vượt tổng booking hoặc thiếu lý do: chặn trước modal và vẫn giữ dữ liệu đã nhập.
- API giải quyết thất bại: đóng trạng thái đang gửi nhưng giữ modal/giá trị để Admin sửa hoặc thử lại.

## Khả năng truy cập và responsive

- Card booking và card quyết định là radio group có nhãn, trạng thái focus và điều khiển bàn phím.
- Input điện thoại dùng `type="tel"`, `autocomplete="tel"` và thông báo lỗi liên kết bằng `aria-describedby`.
- Khu upload hoạt động với bàn phím, không phụ thuộc kéo-thả; preview có tên file và nút gỡ có nhãn rõ.
- Trạng thái tải/gửi dùng `aria-live`; modal xác nhận giữ focus đúng quy tắc hiện có.
- Mobile là một cột, nút hành động chính đủ chiều cao chạm; desktop mới chuyển thành hàng đợi hai vùng.

## Kiểm chứng

- Unit/component test cho tự điền và chỉnh sửa số điện thoại, validation bắt buộc, lựa chọn lý do, card booking và trạng thái nút gửi.
- Test upload cho tối đa 5 ảnh, loại MIME, retry/gỡ ảnh, và chỉ gửi object key đã upload thành công.
- Finance service test cho authorization upload, namespace ownership, snapshot `contactPhone`, dữ liệu cũ và giới hạn evidence.
- Admin component test cho chọn hồ sơ, hiển thị `tel:`, ba nhánh quyết định, trường tiền có điều kiện và modal xác nhận.
- Chạy test tập trung cho web và finance service; sau đó impact scan và xin lựa chọn kiểm chứng rộng theo quy trình repository.

## Ngoài phạm vi

- Không thêm chat trực tiếp giữa Admin và người chơi.
- Không cho chủ sân tự mở tranh chấp hoặc khiếu nại lại quyết định Admin.
- Không thay đổi chính sách tài chính, thời hạn 24 giờ hoặc lịch sử ledger.
- Không tự động cập nhật số điện thoại hồ sơ từ snapshot của tranh chấp.
