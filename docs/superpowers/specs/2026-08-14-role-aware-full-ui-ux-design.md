---
title: Role-aware full UI/UX completion
status: approved
owner: Tuan Anh (PO)
date: 2026-08-14
visual_authority: Figma COURTIN FHuhhmlhPSl8gOUuUx7az2
---

# Role-aware full UI/UX completion

## 1. Outcome

Hoàn thiện UI/UX cho toàn bộ backend đã triển khai, sửa toàn bộ vấn đề được PO ghi nhận trong vòng test thủ công, và bổ sung phần backend tối thiểu cần thiết để trải nghiệm mới hoạt động thật. Kết quả phải dùng dữ liệu/API thật, giữ nguyên các bất biến tiền, quyền, booking, matchmaking, AI và ranh giới service hiện hành.

Phạm vi được triển khai theo các lát cắt nghiệp vụ hoàn chỉnh. Mỗi lát cắt gồm UI, API/domain tối thiểu, trạng thái lỗi, test tập trung và E2E liên quan.

## 2. Authority và ranh giới

- Chức năng và nghiệp vụ hiện hành: `docs/product/phasing.md`, `docs/product/decision-log.md` và spec trong `docs/product/specs/`.
- Visual authority: Figma COURTIN `FHuhhmlhPSl8gOUuUx7az2`, gồm các frame đã kiểm chứng trong `docs/plans/active/figma-full-screen-coverage.md`.
- Giữ sáu backend service hiện có; không thêm role ngoài `player`, `provider`, `admin`.
- Không query/FK xuyên schema. Service giao tiếp qua API hoặc event.
- Ledger tiếp tục append-only và bảo toàn giá trị. UI không được làm tắt luồng thanh toán/refund/settlement.
- AI chỉ gợi ý và giải thích; không tự JOIN, hủy booking, mở tranh chấp hoặc thực hiện hành động nhạy cảm.
- `F-05` demand heatmap vẫn là Phase 3 có điều kiện và không thuộc phạm vi này nếu PO chưa kích hoạt.
- Không bỏ sót năng lực backend đã build: mọi route nghiệp vụ public/authenticated phải có FE trực tiếp; route internal, webhook và event-driven outcome phải có trạng thái quan sát được trong FE của luồng sở hữu. Nếu command hiện có thiếu read model để FE chọn thực thể an toàn, được bổ sung query/DTO owner-scoped tối thiểu, không yêu cầu người dùng nhập UUID.

## 3. Quyết định PO mới từ vòng test UI/UX

1. Toàn bộ tài khoản hiển thị badge vai trò; tài khoản đa vai trò có bộ chuyển ngữ cảnh và ghi nhớ ngữ cảnh gần nhất.
2. Trang chủ theo ngữ cảnh: Người chơi giữ homepage hiện tại; Chủ sân vào dashboard Quản lý; Admin vào dashboard Quản trị.
3. Mọi tài khoản Người chơi thấy CTA `Hợp tác chủ sân` cạnh avatar. Khi được duyệt, session/role và giao diện phải cập nhật rõ ràng.
4. Nghiệp vụ Chủ sân và tài chính kinh doanh rời khỏi Hồ sơ, chuyển sang `/manage/*`.
5. Nghiệp vụ Admin có menu/route hiển thị theo role tại `/admin/*`, không yêu cầu nhập URL thủ công.
6. Booking cho phép chọn nhiều slot liên tiếp; selection được tô màu và tóm tắt đúng ngày, giờ bắt đầu–kết thúc, số slot, thời lượng và tổng tiền.
7. Ngày hiển thị/nhập theo `dd/MM/yyyy`, không phụ thuộc locale mặc định của trình duyệt.
8. `Giữ chỗ 10 phút` và `Tạo booking` được gộp thành một CTA `Xác nhận đặt sân`. Backend vẫn thực hiện tuần tự đúng nghiệp vụ.
9. Sau xác nhận, chuyển sang bước thanh toán, bắt đầu countdown 10 phút và khóa ngày/sân/slot.
10. Thanh toán thành công dừng countdown, chuyển sang trang xác nhận và không lộ UUID booking.
11. Booking đã hủy không còn nút hủy. Preview refund và xác nhận hủy nằm trong đúng booking card.
12. Tìm nhanh mở modal realtime có animation, tiêu chí, tiến trình, số ứng viên, dừng tìm và kết quả cập nhật qua Socket.IO.
13. Tạo kèo nhận hold còn hạn hoặc booking `held`/chờ thanh toán của chính organizer.
14. `Player Passport` đổi thành `Hồ sơ trình độ`. Người chơi chỉ khai báo/đổi bậc tối đa một lần mỗi 7 ngày.
15. Trợ lý AI dùng chat hai cột: gợi ý kèo cập nhật bên trái, hội thoại bên phải; có bong bóng chat toàn cục cho user đã đăng nhập.
16. Bài cộng đồng cho phép upload tối đa 4 ảnh qua object storage, preview trước khi đăng và tự fit khi hiển thị.
17. Modal ticket phải giữ focus tại input/textarea đang nhập, không remount/autofocus nút đóng sau mỗi ký tự.
18. Ví dùng nhãn nghiệp vụ và context thực thể; không hiển thị enum hoặc UUID kỹ thuật.

## 4. Information architecture theo vai trò

### 4.1 Application shell

`RoleContext` xác định các ngữ cảnh được phép từ session hiện hành. Bộ chuyển ngữ cảnh nằm cạnh avatar, chỉ hiển thị role user thực sự có và lưu lựa chọn gần nhất trong local storage. Thay đổi ngữ cảnh chỉ đổi navigation/home, không cấp thêm quyền; backend vẫn là nguồn kiểm tra authorization.

### 4.2 Người chơi

Navigation chính: Trang chủ, Đặt sân, Tìm kèo, Cộng đồng. Avatar menu: Hồ sơ, Hồ sơ trình độ, Trợ lý AI, Hợp tác chủ sân hoặc trạng thái hồ sơ hợp tác, Đăng xuất.

Hồ sơ chỉ giữ thông tin cá nhân, booking cá nhân, ví cá nhân, lịch sử giao dịch và tranh chấp của người chơi. Các hành động refund/cancel được đặt trong từng booking card.

### 4.3 Chủ sân

Route `/manage/*` gồm:

- Tổng quan: booking hôm nay, doanh thu chờ, sự cố và thao tác nhanh.
- Sân kinh doanh: tạo/sửa venue, ảnh, địa chỉ, tiện ích và trạng thái.
- Sân con: thêm, cập nhật và vô hiệu hóa court.
- Lịch hoạt động: giờ mở cửa và ngày đóng ngoại lệ.
- Giá và quy tắc: pricing schedule, bước slot, thời lượng tối thiểu/tối đa.
- Lịch và booking: unified calendar, booking marketplace, booking khách vãng lai.
- Sự cố: tìm sân thay thế, đổi sân con, hủy do lỗi phía sân.
- Doanh thu và rút tiền: bộ lọc, số dư pending/available/reserved, lịch sử doanh thu, tạo/hủy yêu cầu rút.

### 4.4 Admin

Route `/admin/*` gồm dashboard hàng chờ và các module:

- Khóa/mở tài khoản.
- Duyệt/từ chối hồ sơ Chủ sân.
- Hủy booking với lý do.
- Xử lý rút tiền và khoản đã chi một phần.
- Đối soát tiền vào/ra/ngoài phạm vi.
- Giải quyết tranh chấp.
- Kiểm duyệt bài viết/bình luận và khôi phục nội dung.
- Xem, trả lời, chuyển trạng thái và đóng ticket hỗ trợ.

## 5. Provider onboarding và đồng bộ role

CTA `Hợp tác chủ sân` mở wizard thu thập tên đơn vị/hộ kinh doanh, thông tin liên hệ và dữ liệu hồ sơ đã được spec cho phép. Sau khi gửi, UI hiển thị trạng thái `pending`, `approved`, `rejected` hoặc `suspended` và lý do khi có.

Khi Admin duyệt, event hiện hành cập nhật role Account. Account service bổ sung refresh-session endpoint. Trang trạng thái hợp tác làm mới provider status định kỳ khi đang mở; khi thấy `approved`, gọi refresh session, cập nhật `RoleContext`, hiện badge `Chủ sân đã xác thực`, menu Quản lý và wizard thêm sân. Nếu refresh thất bại, hiển thị yêu cầu đăng nhập lại thay vì âm thầm giữ UI cũ.

## 6. Booking và payment state machine

### 6.1 Chọn slot

Người chơi chọn một khoảng slot liên tiếp trên cùng court/ngày. Click đầu chọn điểm bắt đầu; click slot liên tiếp mở rộng/thu hẹp khoảng. Slot không liên tiếp hoặc không khả dụng không được đưa vào khoảng. UI dùng màu nền, viền, `aria-pressed` và text để không phụ thuộc màu đơn thuần.

Summary luôn lấy từ selection hiện hành: venue, court, `dd/MM/yyyy`, giờ bắt đầu–kết thúc, số slot, tổng phút và tổng tiền. Không dùng thời gian UTC trực tiếp để render.

### 6.2 Xác nhận và giữ chỗ

CTA duy nhất `Xác nhận đặt sân` gọi tuần tự selection validation → create hold → create booking `held`. Thành công chuyển sang payment state và bắt đầu countdown từ `holdExpiresAt` trả bởi backend. Không dùng timer client tự suy đoán thời hạn.

Ở payment state, ngày, court và grid slot bị disabled. Người dùng chỉ được chọn phương thức thanh toán, thanh toán, tạo kèo từ booking hợp lệ hoặc hủy/quay lại theo chính sách. Hết hạn thì backend là nguồn sự thật; UI refresh status, giải phóng state và yêu cầu chọn lại.

### 6.3 Thanh toán thành công

Thanh toán số dư hoặc SePay hoàn tất phải dừng timer và chuyển sang confirmation route. Trang xác nhận hiển thị thông tin sân, khoảng giờ, số tiền, phương thức và trạng thái. UUID kỹ thuật không hiển thị. CTA dẫn tới booking detail hoặc danh sách booking.

### 6.4 Hủy booking

Danh sách sắp tới chỉ cho thao tác hủy khi `status=confirmed` và ca chưa bắt đầu. Booking `cancelled` được đưa vào tab Đã hủy và không render nút refund/cancel. Preview hoàn tiền mở inline trong đúng card và được reset sau thao tác thành công.

## 7. Matchmaking, AI và Hồ sơ trình độ

### 7.1 Tìm nhanh realtime

Modal Tìm nhanh hiển thị tiêu chí, animation có hỗ trợ `prefers-reduced-motion`, thời gian đã tìm, số kèo đã quét, số ứng viên và nút Dừng. Socket.IO hiện có phát tiến trình/kết quả. Khi có đề xuất, người chơi xem chi tiết và xác nhận; chỉ lúc đó hệ thống mới tạo JOIN theo luồng MMP-04/FIN-05.

### 7.2 Tạo kèo

Danh sách nguồn tạo kèo gồm hold còn hạn và booking `held` của chính organizer. Booking đã `confirmed`, `cancelled`, hết hạn hoặc thuộc user khác không xuất hiện. Handoff từ payment screen truyền booking/hold hợp lệ, không yêu cầu tạo một hold khác.

### 7.3 Trợ lý AI

Trang AI dùng layout hai cột desktop và stacked mobile. Chat trả câu trả lời, tiêu chí được hiểu và danh sách gợi ý F-02 deterministic; Gemini chỉ diễn giải. Danh sách cập nhật sau mỗi phản hồi và khi Socket.IO báo thay đổi kèo. CTA luôn dẫn về luồng xem/tham gia chuẩn.

Bong bóng chat toàn cục mở panel hỗ trợ nhanh; route Trợ lý giữ trải nghiệm đầy đủ. AI không tự thực thi hành động.

### 7.4 Hồ sơ trình độ

Tên hiển thị là `Hồ sơ trình độ`. Matchmaking service enforce cooldown 7 ngày dựa trên `declaredAt`; UI hiển thị ngày/giờ được khai báo lại và disable CTA trong thời gian chờ. Public profile, rating/RD, lịch sử trận và đánh giá sau trận giữ quy tắc hiện hành.

## 8. Community media và hỗ trợ

### 8.1 Object storage

Không thêm service mới. Tạo object-storage client dùng chung trong package phù hợp; Community và Venue sở hữu endpoint upload/presign và namespace object riêng. Local development dùng adapter S3-compatible cô lập; môi trường triển khai dùng object storage cấu hình qua env.

Luồng: client yêu cầu upload authorization → backend kiểm tra quyền, MIME, số lượng và dung lượng → client upload trực tiếp → client gửi object key/metadata trong command tạo/cập nhật domain. Backend chỉ nhận object thuộc namespace/user hợp lệ.

### 8.2 Bài viết có ảnh

Post lưu tối đa 4 image metadata. UI hỗ trợ chọn/kéo-thả, preview, bỏ ảnh, loading/progress và lỗi theo từng ảnh. Card/detail dùng aspect ratio ổn định, `object-fit: cover`, ảnh đầy đủ qua lightbox và lazy loading. Xóa/sửa bài xử lý ownership metadata; cleanup object thực hiện an toàn/idempotent.

### 8.3 Ticket hỗ trợ

Ticket vẫn là kênh bất đồng bộ, riêng tư; không biến thành chat realtime. Modal/form có component identity ổn định, close button không autofocus lại khi state thay đổi, focus trap đúng và trả focus về trigger khi đóng. Admin có đầy đủ ticket list/detail/reply/status UI.

## 9. Presentation layer và ngôn ngữ nghiệp vụ

Frontend có presenter/mapping tập trung cho role, trạng thái, ledger type và nguồn giao dịch. Ví dụ `payment · personal` trở thành `Thanh toán đặt sân — <venue> · <court>`; refund trở thành `Hoàn tiền hủy sân`. Khi API hiện chưa trả đủ context, backend DTO bổ sung field mô tả an toàn hoặc reference summary; không để frontend query chéo service.

Ngày/giờ dùng formatter Việt Nam tập trung. ID kỹ thuật chỉ được dùng nội bộ, không render cho end user; Admin có thể dùng mã tham chiếu rút gọn khi nghiệp vụ cần đối soát.

## 10. Error, loading và accessibility

- Mỗi route có loading, empty, error, unauthorized/forbidden và retry phù hợp.
- Error đặt gần field/action gây lỗi; không chỉ hiển thị banner chung.
- Countdown hết hạn, payment late, slot conflict và role stale có thông báo cùng hành động phục hồi rõ ràng.
- Button async disable chống double-submit và có trạng thái tiến trình.
- Touch target tối thiểu 44×44 px; keyboard navigation, focus visible, focus trap, label và ARIA đầy đủ.
- Motion 150–300 ms, dùng transform/opacity và tôn trọng `prefers-reduced-motion`.
- Responsive được kiểm tra ở 375, 768 và 1280+; không có horizontal overflow.

## 11. Data/API changes tối thiểu

- Account: refresh-session endpoint/adapter để lấy roles mới sau provider approval.
- Matchmaking: enforce declaration cooldown 7 ngày và trả `nextDeclarationAt`.
- Community: Post image metadata + migration; upload authorization/validation endpoints.
- Venue: upload authorization cho ảnh venue; tiếp tục lưu image metadata trong field domain hiện có.
- DTO booking/payment: trả thời hạn hold, trạng thái terminal và confirmation summary cần cho UI.
- DTO wallet ledger: trả reference summary an toàn hoặc đủ key để presenter tạo nhãn nghiệp vụ.
- Assistant: response có answer, normalized criteria và ranked suggestions; vẫn dùng F-02 làm nguồn điểm.

Mọi thay đổi spec/decision ảnh hưởng policy, data hoặc role phải được ghi vào tài liệu authoritative trước code milestone tương ứng.

## 12. Validation strategy

### Focused tests

- Domain/integration: cooldown 7 ngày, role refresh, image ownership/validation, booking list status, hold expiry, payment terminal state và ledger DTO.
- Component: multi-slot selection, summary, payment lock/countdown, inline cancellation, ticket focus, role switcher, presenter labels, media preview.
- Socket.IO: quick-match progress/result/reconnect/cancel và cập nhật suggestions.

### End-to-end

- Người chơi: đăng ký/đăng nhập → đặt nhiều slot → thanh toán → confirmation → hủy/refund.
- Người chơi → Chủ sân: gửi hợp tác → Admin duyệt → refresh role → thêm venue/court/config → booking vận hành → doanh thu/rút.
- Admin: account/provider/booking/withdrawal/reconciliation/dispute/moderation/ticket queues.
- Match: booking held → tạo kèo → quick match/JOIN → duyệt → trả phí → hoàn tất → đánh giá.
- Community: upload ảnh → CRUD bài → bình luận/report → Admin xử lý; ticket giữ focus và phân quyền.
- Desktop/mobile visual regression theo COURTIN frame liên quan.

### Completion gates

- Focused tests xanh trước mỗi milestone review.
- Web lint/typecheck/build và test workspace liên quan xanh.
- Cross-phase Playwright chạy một lần ở final gate; nếu aggregate timeout, chạy các configured specs tương đương riêng và báo coverage.
- Không có lỗi console trong các journey chính.
- Mọi note trong mục 3 có evidence hoặc PO waiver tường minh.
- Capability manifest không còn route, Socket.IO event hoặc cross-service event chưa phân loại; mỗi capability có `surfaceId` và `evidenceId` trỏ tới giao diện và test thực tế.

## 13. Delivery slices

1. Authority/spec updates và nền role-aware shell.
2. Booking, payment, confirmation, cancellation và wallet presentation.
3. Provider onboarding và workspace Quản lý.
4. Admin workspace phủ toàn bộ backend.
5. Matchmaking realtime, AI chat và Hồ sơ trình độ.
6. Community media, support UI và polish dùng chung.
7. Full regression, visual review và acceptance ledger.

Mỗi slice là một nhóm thay đổi độc lập, có test tập trung và commit logic riêng. Không merge `main` hoặc push nếu PO chưa yêu cầu.
