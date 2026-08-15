---
type: decision-log
status: living
updated: 2026-08-14
purpose: Nhật ký quyết định, giả định và mâu thuẫn xuyên các giai đoạn sản phẩm.
---

# Decision Log — Sản phẩm

## 1. Quyết định đã xác nhận

| # | Ngày | Quyết định | Chức năng bị ảnh hưởng |
|---|---|---|---|
| D1 | 2026-08-05 | Đơn vị phân giai đoạn là **module trọn vẹn**, không cắt lát dọc. | Toàn bộ 61 chức năng |
| D2 | 2026-08-05 | `FIN-05 Thanh toán phí tham gia kèo` chuyển sang GĐ2 — ngoại lệ duy nhất của D1, do phụ thuộc ngược vào `matchmaking-passport`. | FIN-05, MMP-06 |
| D3 | 2026-08-05 | **Vai trò là tập hợp, ví tách đôi.** Người dùng luôn giữ vai `player`; vai `provider` được cộng thêm khi VEN-02 duyệt. Ví cá nhân và ví kinh doanh là hai bản ghi riêng. Không chuyển tiền giữa hai ví của cùng một người ở GĐ1. | ACC-01, ACC-03, ACC-07, VEN-01, VEN-02, BOK-01…10, FIN-01, FIN-02, FIN-03, FIN-10 |
| D4 | 2026-08-05 | Khóa tài khoản chủ sân thì **ẩn cơ sở khỏi tìm kiếm và chặn booking mới, nhưng giữ nguyên booking đã xác nhận**. Muốn hủy dứt điểm thì đi qua BOK-10 kích FIN-08 hoàn 100%. | ACC-08, VEN-02, VEN-03, VEN-08, BOK-04, BOK-07, BOK-10, FIN-08, FIN-09 |
| D5 | 2026-08-05 | **Chặn cứng**: không lưu được thay đổi giờ hoạt động, ngày đóng cửa hay vô hiệu hóa sân nếu khoảng bị ảnh hưởng còn booking `confirmed` trong tương lai **hoặc còn `HOLD` chưa hết hạn**. Hệ thống liệt kê cả hai loại đang vướng. | VEN-04, VEN-05, VEN-08, BOK-04, BOK-06, BOK-10, FIN-08 |
| D6 | 2026-08-05 | **Email là định danh duy nhất.** Đăng ký, đăng nhập, xác minh, đặt lại mật khẩu đều qua email. Số điện thoại chỉ là thông tin liên hệ tùy chọn, không xác minh, không cần duy nhất. Không dùng SMS ở GĐ1. | ACC-01, ACC-02, ACC-03, ACC-05, ACC-07 |
| D7 | 2026-08-05 | **Không có chức năng đánh giá booking sân ở GĐ1.** Thực thể `BOOKING_REVIEW` trong `data-model.md` không có use case được phê duyệt nào tương ứng, nên bị đánh dấu hoãn chứ không được coi là phạm vi ngầm. Đánh giá chỉ tồn tại cho kèo (`MMP-10`, GĐ2). | BOK-08, BOK-09, toàn bộ `court-booking` |
| D8 | 2026-08-05 | **Tách chính sách thu hồi phiên**: đặt lại mật khẩu (ACC-05) thu hồi toàn bộ phiên kể cả phiên hiện tại; đổi mật khẩu (ACC-06) chỉ thu hồi các thiết bị khác. | ACC-05, ACC-06 |
| D9 | 2026-08-05 | **Chính sách hủy là thống nhất toàn nền tảng**, chủ sân không cấu hình được. Thực thể `CANCELLATION_POLICY` gắn với `PROVIDER` trong data model bị bác — không có use case nào cho phép chủ sân định nghĩa chính sách. | BOK-07, BOK-09, BOK-10, FIN-07, FIN-08 |
| D10 | 2026-08-05 | **Bậc thang hoàn tiền ba mức** tính theo khoảng cách tới giờ bắt đầu ca: ≥24 giờ hoàn 100%, 6–24 giờ hoàn 50%, <6 giờ không hoàn. **Phần không hoàn ghi vào doanh thu chủ sân**, có trừ hoa hồng, không phải nền tảng giữ. | BOK-08, BOK-09, FIN-07, FIN-09 |
| D11 | 2026-08-05 | **Hạn gửi tranh chấp trùng đúng cửa sổ 24 giờ** của ràng buộc bất biến #5. Hết hạn thì tiền chuyển sang `available` và miễn tranh chấp. | FIN-09, FIN-10, FIN-11, FIN-12, FIN-13 |
| D12 | 2026-08-05 | **"Điều chỉnh booking do phía sân" chỉ là đổi sân con** trong cùng cơ sở, giữ nguyên khung giờ và giá. Không đổi giờ, không cần người chơi đồng ý, chỉ thông báo. | BOK-08, BOK-10, FIN-08 |
| D13 | 2026-08-05 | **Admin là actor liên quan của BOK-10.** `phasing.md` được sửa cho khớp. Đây là hệ quả của D4: khóa chủ sân vì lý do nghiêm trọng thì Admin phải hủy được từng booking để người chơi nhận hoàn 100%. | ACC-08, BOK-10, FIN-08 |
| D14 | 2026-08-05 | **Chủ sân giữ cả khoản không hoàn lẫn doanh thu từ việc bán lại chính slot đó.** Khoản không hoàn là bù rủi ro slot ế, không phải thanh toán cho dịch vụ đã cung cấp. Hệ thống không theo dõi quan hệ giữa booking bị hủy và booking mới trên cùng slot. | BOK-09, FIN-07, FIN-09 |
| D15 | 2026-08-05 | **Thêm `FIN-14 Đối soát giao dịch chưa khớp` vào GĐ1.** Chức năng đầu tiên không có trong `SCOPE_BASELINE`. GĐ1 tăng từ 39 lên 40 chức năng. **PO phê duyệt tường minh 2026-08-05.** | FIN-02, FIN-11, FIN-14 |
| D16 | 2026-08-05 | **Ví hệ thống `platform`.** Một bản ghi ví duy nhất không thuộc người dùng nào, nhận `commission` và chịu bút toán đảo khi hoàn tiền. Không có nó thì hoa hồng không có nơi lưu trú và bất biến bảo toàn giá trị không kiểm chứng được. | FIN-07, FIN-08, FIN-09, FIN-13, FIN-14 |
| D17 | 2026-08-05 | **DB: một PostgreSQL, schema-per-service.** Mỗi service có migration, tài khoản truy cập và quyền sở hữu schema riêng; cấm FK và truy vấn xuyên schema; giao tiếp chỉ qua API hoặc event. Xem [ADR 0004](../decisions/0004-db-strategy-and-repo-boundary.md). | Gboot |
| D18 | 2026-08-05 | **Repo: một monorepo dùng workspaces.** Mỗi service build/test/deploy độc lập; chỉ chia sẻ contract/DTO/event schema và thư viện hạ tầng, không chia sẻ entity hay business logic. Xem [ADR 0004](../decisions/0004-db-strategy-and-repo-boundary.md). | Gboot |
| D19 | 2026-08-06 | **Tỷ lệ hoa hồng `r` = 10% (0.10).** PO chốt giá trị cho `A-FIN-01` (trước đó là giả định). Mọi AC tài chính tham số hóa theo `r` nên đổi số sau không phải sửa spec. Áp dụng từ G4. | FIN-03, FIN-04, FIN-07, FIN-08, FIN-09, FIN-13 |
| ~~D20~~ | 2026-08-06 | ~~**Ngoại lệ vai trò cho GĐ1 (mô hình Hybrid).** Claude thực thi Gboot/G0/Gdesign, Codex execute G1…G7.~~ ⚠️ **Bị thay thế bởi D21** cùng ngày. | — |
| D21 | 2026-08-06 | **Goal triển khai GĐ1 do Claude Code thực thi trọn vẹn** — toàn bộ 10 milestone Gboot→G7. Không giao task, không dispatch, không phụ thuộc Codex. Claude chịu trách nhiệm: implementation backend/frontend; unit/integration/contract/Playwright E2E; review diff + kiểm scope; kiểm thử độc lập cuối phase; ghi evidence vào `phase-1-progress.md`. **[CODEX_ORCHESTRATION.md](../CODEX_ORCHESTRATION.md) không áp dụng cho goal này.** PO chỉ nghiệm thu cuối phase. **Thay thế D20 (bỏ Hybrid).** | Toàn bộ GĐ1 (Gboot..G7) |
| D22 | 2026-08-06 | **Mỗi milestone G phải qua một vòng Codex review code trước khi commit.** Review độc lập ngoài self-verification của Claude; nếu Codex phát hiện lỗi thật thì sửa trước khi commit. Áp dụng lần đầu ở G4 và đã bắt được 6 lỗi P1 tài chính/đúng-đắn mà test xanh không phủ (webhook giả mạo, BigInt 500, xóa hold sớm gây race, race trừ ví, outbox replay ghi tiền 2 lần, ví platform không duy nhất). Model Codex cụ thể do PO chỉ định. | Toàn bộ GĐ1 từ G4 |
| D23 | 2026-08-06 | **Xác thực webhook SePay ở GĐ1 bằng shared secret qua biến môi trường** (`SEPAY_WEBHOOK_SECRET`), cộng chặn `amount<=0`. Không nhập credential SePay production vào code; xác thực chữ ký/HMAC thật để lại khi tích hợp SePay production sau GĐ1. Sửa lỗi P1 "ai biết matchCode cũng tự tạo được tiền". | FIN-02, FIN-04, FIN-06 |
| D24 | 2026-08-06 | **Tiền SePay chuyển THỪA: phần đúng giá booking xác nhận booking, phần thừa ghi có vào ví `personal`** người chơi (bảo toàn tiền, nhất quán với xử lý chuyển THIẾU ở AC-FIN-04-2). Ví dụ chuyển 250k cho booking 200k → booking confirmed + 50k vào ví personal. Làm rõ khoảng trống spec AC-FIN-04. | FIN-04, FIN-06 |
| D25 | 2026-08-06 | **Ví `business` tạo qua sự kiện `ProviderApproved`**, không lazy. venue-booking-service phát `ProviderApproved{providerId, userId}` khi Admin duyệt NCC (VEN-02) → finance-service tạo ví business rỗng + account-service cấp thêm vai `provider` cho user. Đóng dứt điểm `AC-VEN-02-1`/`AC-VEN-02-4` (treo từ G2) và `AC-FIN-01-2`. Mở rộng phạm vi chạm account-service (thêm consumer đầu tiên ở account-service). Nhất quán D3 (vai trò là tập hợp, cộng thêm `provider` khi duyệt). | VEN-02, FIN-01, ACC-07 |
| D26 | 2026-08-08 | **Tham số F-01/MMP-09:** Glicko-2 dùng tâm bậc `1100/1300/1500/1700/1900`, ngưỡng `<1200/<1400/<1600/<1800/≥1800`, cold-start `RD=350`, `σ=0.06`, `τ=0.5`; `RD≥200` là độ bất định cao. Khai lại tối đa mỗi 30 ngày; khi đã có lịch sử chỉ dịch rating về tâm bậc mới theo `25% × min(RD/350,1)`, chặn `±50`, không ghi đè RD/σ. **PO duyệt bundle 2026-08-08.** | MMP-09, MMP-11, F-01 |
| D27 | 2026-08-08 | **Runtime F-01/MMP-11:** M4 phát `RatingPeriodReady` nội bộ qua RabbitMQ khi đánh giá đã hợp lệ, payload mang `matchId`, `userId` và Glicko results đã xác thực; M1 consume idempotent theo message ID và cập nhật Passport đúng một lần. Điểm đánh giá tổng hợp của Passport riêng là trung bình tâm bậc của EVALUATION có `countedAt != null`, `flagged=false`; bản công khai không lộ điểm này. **PO duyệt 2026-08-08.** | MMP-11, F-01 |
| D28 | 2026-08-08 | **Hạn chốt kèo:** `cutoffAt = giờ bắt đầu ca − 60 phút`. Sau cutoff, kèo không còn xuất hiện trong tìm kiếm; nếu chưa đủ người/tiền thì tự hủy theo BR-MMP-07. **PO duyệt 2026-08-08.** | MMP-01, MMP-02, MMP-07, MMP-08 |
| D29 | 2026-08-08 | **Chia phí kèo:** không cho organizer đặt phí tùy ý. Kèo chia phí dùng `feePerSlot = floor(giá booking / capacity)`; participant trả đúng mức này, organizer thanh toán phần còn thiếu `giá booking − tổng participant đã trả` (bao gồm số lẻ phép chia). Vì vậy không có gom dư, ba vế bảo toàn và không P2P. **PO duyệt 2026-08-08.** | MMP-02, MMP-06, FIN-05 |
| D30 | 2026-08-08 | **Phá vòng phụ thuộc P2-M2↔M3:** M2 nghiệm thu MMP-01..05, `AC-MMP-06-3` và contract event phía match. Chuyển `AC-MMP-06-1/2/4`, `AC-MMP-07-1/2/3`, `AC-MMP-08-1/2/3` sang M3; chỉ đánh `pass` sau E2E ledger/venue thật. Không miễn trừ AC, tổng vẫn 94; giữ commit M2 và M3 riêng. **PO duyệt 2026-08-08.** | P2-M2, P2-M3, MMP-06..08, FIN-05 |
| D31 | 2026-08-08 | **Danh tính organizer trên kèo công khai:** nếu hồ sơ người chơi `visibility=public`, trả tên hiển thị thật; nếu `visibility=private`, trả nhãn cố định **“Người tổ chức”** và `identityVisibility=hidden`. Bậc trình độ và dữ liệu kèo vẫn hiển thị vì là thông tin cần cho MMP-03. **PO duyệt 2026-08-08.** | MMP-03, account-service, matchmaking-service |
| D32 | 2026-08-08 | **Hoàn phí khi participant rút khỏi kèo:** chính sách nhị phân theo `cutoffAt`; trước cutoff hoàn 100% về ví cá nhân, từ cutoff trở đi không hoàn. Không áp bậc thang hủy booking cho phí JOIN. **PO duyệt 2026-08-08.** | BR-MMP-09, MMP-07, FIN-05 |
| D33 | 2026-08-08 | **Organizer hủy kèo sau khi booking đã confirmed:** áp đúng `policySnapshot` bậc thang GĐ1 của booking (≥24h: 100%; 6–<24h: 50%; <6h: 0%). Mỗi participant và organizer nhận cùng tỷ lệ hoàn trên **đúng phần mình đã góp**; phần không hoàn đi theo luồng hủy booking GĐ1. Không P2P, tổng hoàn không vượt tổng góp và bảo toàn giá trị. **PO duyệt 2026-08-08.** | AC-MMP-08-3, BR-BOK-05/06, FIN-05 |
| D34 | 2026-08-08 | **Không thu thêm phí phạt no-show/rút trễ ở GĐ2.** Chế tài tiền duy nhất là phí JOIN đã thu không được hoàn từ `cutoffAt` theo D32. Không mở loại ledger, nguồn thu hay AC phạt riêng. **PO duyệt 2026-08-08.** | FIN-05, MMP-07 |
| D35 | 2026-08-08 | **Hủy toàn kèo ghi đè non-refund của lượt rút trễ:** D32 chỉ giữ phí rút từ cutoff nếu kèo vẫn diễn ra. Nếu kèo cuối cùng `cancelled` và booking/hold được nhả, mọi contribution đã thu — kể cả của người rút trễ — được hoàn về đúng ví góp. Platform không giữ tiền khi dịch vụ sân không được sử dụng. **PO duyệt 2026-08-08.** | AC-MMP-07-2, AC-MMP-08-2, AC-FIN-05-4/5 |
| D36 | 2026-08-08 | **Rút trước cutoff sau khi booking sân đã confirmed:** chỉ hoàn 100% khi booking còn `held`. Nếu booking đã `confirmed`, participant được đánh dấu `withdrawn` nhưng không hoàn riêng; chỉ nhận phần hoàn nếu cả kèo bị hủy theo D33. Không bắt organizer bù và platform không tạm ứng. **PO duyệt 2026-08-08.** | AC-MMP-07-1/3, FIN-05 conservation |
| D37 | 2026-08-08 | **Làm tròn hoàn tiền D33:** với tỷ lệ hoàn booking, mỗi participant nhận `floor(contribution × percent / 100)`; organizer nhận phần còn lại `refundGross − tổng hoàn participant`. Vì vậy tổng hoàn contributor bằng đúng hoàn booking, participant không nhận vượt phần góp và organizer hấp thụ phần lẻ như D29. **PO duyệt 2026-08-08.** | AC-MMP-08-3, AC-FIN-05-8 |
| D38 | 2026-08-09 | **Receipt SePay phí kèo đến khi contribution không còn payable:** không bỏ qua hoặc treo vô hạn receipt đã nhận. Finance ghi nhận idempotent đúng một lần và ghi có toàn bộ vào ví cá nhân của payer; khoản đó không được reserve, không tính vào funding/settlement của kèo và không P2P. Tạo intent organizer chỉ được phép khi match đã đủ điều kiện funding; race còn lại dùng cùng đường credit này. **PO duyệt 2026-08-09.** | AC-FIN-05-1/3/8, FIN-05 conservation |
| D39 | 2026-08-09 | **Race settlement–withdraw/cancel:** `venue-booking-service` là nguồn quyết định nguyên tử. Mỗi settlement mang `attemptId` và revision fencing của booking; khi booking còn `held`, venue atomically chấp nhận revoke attempt trước xác nhận thì withdrawal/cancel thắng, hoàn theo D36 và stale settlement bị triệt tiêu/đảo trong finance. Nếu venue đã atomically xác nhận booking trước, confirmation thắng và không hoàn riêng theo D36. Withdrawal một người giữ booking `held` và mở lại chỗ; hủy toàn kèo mới nhả hold. Không query/FK chéo schema. **PO duyệt 2026-08-09.** | AC-MMP-07-1/3, AC-MMP-08-1/2, AC-FIN-05-5/8 |
| D40 | 2026-08-09 | **Xác thực lệnh ghi D39:** `POST /internal/bookings/:id/match-resolution` phải dùng shared service secret bắt buộc qua header `x-internal-service-token`. Finance và Matchmaking gửi secret; Venue fail-closed khi thiếu/sai hoặc chưa cấu hình. Không coi private network là quyền ghi đủ cho thao tác xác nhận/hủy sân. **PO duyệt 2026-08-09.** | D39, AC-MMP-07/08, AC-FIN-05-5/8 |
| D41 | 2026-08-09 | **Cửa sổ MMP-10:** player có đúng 72 giờ kể từ `BookingCompleted` để gửi đánh giá cho người cùng kèo; hết hạn từ chối. **PO duyệt 2026-08-09.** | BR-MMP-13, AC-MMP-10-1/3 |
| D42 | 2026-08-09 | **F-07 phát hiện bất thường:** một EVALUATION là outlier khi lệch ít nhất 2 bậc so với median của tối thiểu 3 đánh giá cùng kèo cho cùng ratee; thông đồng là một cặp hai chiều cùng cho bậc cao nhất ở ít nhất 3 kèo completed trong rolling 30 ngày. Cờ chỉ chặn record mới khỏi rating và đưa Admin xét, không tự phạt hay tự đổi rating. **PO duyệt 2026-08-09.** | F-07, AC-F07-1..4 |
| D43 | 2026-08-09 | **D27 làm rõ nguồn Glicko:** `perceivedTier` của MMP-10 chỉ nuôi điểm tổng hợp Passport sau khi hợp lệ, không được suy diễn thành thắng/thua hay tự thay đổi Glicko. `RatingPeriodReady` chỉ phát khi có nguồn kết quả trận với `score` đã xác thực; M4 không bịa score từ nhận xét chủ quan. **PO duyệt 2026-08-09.** | D27, MMP-10, F-01, F-07 |

| D44 | 2026-08-09 | **Quick Match không tự duyệt; capacity áp dụng toàn bộ JOIN:** chấp nhận đề xuất F-03 luôn tạo `JOIN pending`; chỉ organizer được duyệt mới chuyển sang `approved` và mở hold thanh toán 10 phút. Suất tạm giữ là mọi JOIN `approved` hoặc `confirmed`; `pending` không chiếm chỗ. Khóa transaction trên `matchId` bảo đảm chỉ một suất cuối được giữ cho mọi luồng JOIN; candidate còn lại nhận `MATCH_FULL` trước contribution, debit, platform reserve hay ledger. Finance vẫn fail-safe/idempotent với payment receipt stale hoặc đến muộn. **PO duyệt và làm rõ tại P2-final 2026-08-09.** | F-03, BR-MMP-05/06, AC-FIN-05-7 |
| D45 | 2026-08-13 | **Figma COURTIN là visual authority.** PO chọn file `FHuhhmlhPSl8gOUuUx7az2` làm nguồn quyết định duy nhất cho màu sắc, typography, radius, shadow, layout và component anatomy của `apps/web`. Quyết định này supersede visual identity Playo/ACTL lịch sử, nhưng không thay đổi phạm vi chức năng, HTTP/Socket.IO contract, auth, role, chính sách tài chính hoặc yêu cầu accessibility/performance hiện hành. | Toàn bộ `apps/web`, tài liệu thiết kế và Phase 2.5 |
| D46 | 2026-08-14 | Shell dùng context vai trò đã có trong session; chuyển context chỉ đổi điều hướng và không cấp quyền. Booking chuyển sang payment terminal sau một CTA xác nhận, dùng `holdExpiresAt` từ backend. | `apps/web`, ACC-03, BOK-06, BOK-07 |
| D47 | 2026-08-14 | Người chơi chỉ được khai hoặc đổi bậc trình độ tối đa một lần mỗi 7 ngày; backend trả `nextDeclarationAt` để UI hiển thị thời điểm thử lại. | MMP-09, Passport |
| D48 | 2026-08-14 | Community lưu tối đa bốn metadata ảnh mỗi bài; Community và Venue xác thực object key theo namespace và chủ sở hữu trước khi lưu command. | COM-02..04, VEN-03 |

### Lý do đáng ghi nhớ

**D3** — Phương án một ví buộc phải suy ra số tiền rút được từ `LEDGER_ENTRY` theo loại
bút toán, rồi chồng thêm luật chặn `min(số dư thật, doanh thu ròng)` cho trường hợp chủ sân
tiêu doanh thu để đặt sân. Đó là logic dẫn xuất chạy trên đường đi của tiền. Hai ví xoá
hẳn lớp suy diễn: mọi câu hỏi tiền trở thành tra một trường. Chi tiết ở [ADR 0003](../decisions/0003-multi-role-dual-wallet.md).

**D4 và D5 không mâu thuẫn nhau** dù cùng nói về booking đã xác nhận. D4 là Admin trừng
phạt chủ sân, nên không để người chơi vô can chịu thiệt. D5 là chính chủ sân chủ động muốn
đóng cửa, nên họ phải trả giá cho quyết định đó một cách tường minh. Khác actor, khác ý định.

**D6** — Chọn email vì không phụ thuộc nhà cung cấp ngoài và không tốn phí mỗi lần kiểm thử.
Nếu bị hỏi khi bảo vệ vì sao không dùng OTP SMS, lý do chi phí là câu trả lời đứng vững.

**D5 mở rộng sang `HOLD`** — Phát hiện khi review: nếu chỉ chặn theo booking `confirmed`, một
khoảng vừa bị đóng cửa vẫn có thể sinh booking hợp lệ ngay sau đó, vì `HOLD` sống 10 phút và
chuyển thành `confirmed` khi `PaymentCompleted` về. Kết quả là booking nằm trên sân đã đóng.
Chặn cả hold khép khe hở này; chủ sân bị chặn chỉ cần chờ tối đa 10 phút.

**D8** — Hai thao tác có mức tin cậy khác nhau. Người dùng đến ACC-05 khi đã mất kiểm soát
mật khẩu nên không phiên nào đáng tin, kể cả phiên đang thao tác. Người dùng ở ACC-06 vừa
chứng minh biết mật khẩu cũ nên phiên hiện tại đáng tin và giữ lại được.

**D9** — `data-model.md` khai `PROVIDER ||--o{ CANCELLATION_POLICY : defines`, nhưng
`venue-scheduling` không có use case nào để chủ sân định nghĩa chính sách đó. Đây là lần thứ
hai kiến trúc tự mở rộng phạm vi sản phẩm, sau `BOOKING_REVIEW` ở D7. Cùng một nguyên tắc
được áp dụng: phạm vi là nguồn có thẩm quyền, kiến trúc phải theo.

**D10** — Chính sách hủy sinh ra để bù đắp cho bên mất cơ hội bán hàng, mà bên đó là chủ sân
chứ không phải nền tảng. Nếu nền tảng giữ phần không hoàn thì nền tảng hưởng lợi mỗi lần
khách hủy — một câu rất khó trả lời khi bảo vệ.

**Ba lỗi tài chính do Codex phát hiện, sửa 2026-08-05** — bản nháp đầu của `finance-disputes`
có ba lỗi nghiêm trọng đã được sửa trước khi duyệt:

1. **Doanh thu cộng hai lần.** `BR-FIN-06` ghi doanh thu vào `pending` khi booking `confirmed`,
   nhưng `FIN-07` lại cộng thêm phần không hoàn khi hủy. Booking 200k hủy mức 50% cho ra
   270k, nhiều hơn cả giá trị booking. Sửa bằng `BR-FIN-14`: hủy chỉ **đảo** phần được hoàn,
   không bao giờ cộng thêm. Bổ sung `BR-FIN-15` bảo toàn giá trị và `AC-FIN-07-5` làm chốt chặn.
2. **Rút tiền thiếu phân vùng `reserved`.** `FIN-10` trừ `available` khi tạo yêu cầu, `FIN-11`
   lại ghi `payout` — spec không nói lần trừ đầu có sinh bút toán không, nên hai cách hiện
   thực đều "đúng spec" mà một cách trừ tiền hai lần. Sửa bằng `BR-FIN-16`: ví `business` có
   ba phân vùng, chuyển giữa chúng không sinh bút toán.
3. **Bất biến tranh chấp chưa được chứng minh.** AC cũ test giờ thứ 5 và giờ thứ 30, tức hai
   phía của mốc 24 giờ chứ không phải chính cuộc đua tại mốc đó. Bổ sung `AC-FIN-12-6` kiểm
   thử đồng thời.

**Ba lỗi tài chính vòng review thứ hai, sửa 2026-08-05** — sau khi sửa ba lỗi trên, Codex
soát lại và tìm thêm ba lỗi nữa, trong đó có một lỗi làm nền tảng mất tiền thật:

4. **FIN-08 và FIN-13 đảo thiếu vế hoa hồng.** Chỉ FIN-07 được sửa ở vòng một; hai luồng hoàn
   còn lại vẫn chỉ đảo doanh thu chủ sân, để nền tảng giữ hoa hồng của một booking không diễn
   ra. Lỗi gốc sâu hơn: spec nhắc tới "hoa hồng nền tảng" nhưng mục actor lại ghi Admin
   **không có ví**, nên không tài khoản nào giữ khoản đó và `AC-FIN-07-5` không hiện thực được.
   Sửa bằng **ví hệ thống `platform`** (D16) và viết lại `BR-FIN-14` thành quy tắc **đảo ba
   vế** áp cho cả ba luồng hoàn.
5. **`AC-FIN-14-7` đối soát sai công thức.** Cộng `topup` và `payout` cùng chiều, và bỏ sót
   đường thanh toán booking trực tiếp qua SePay — FIN-04 xác nhận booking mà không tạo `topup`.
   Thay bằng `BR-FIN-17` ánh xạ một-một theo từng sự kiện và `BR-FIN-18` bảo toàn ở mức hệ thống.
6. **Nhánh chi thiếu làm nền tảng mất tiền.** FIN-14 cũ hướng dẫn: chuyển nhầm 500k cho yêu
   cầu 600k thì Admin từ chối yêu cầu và trả **toàn bộ 600k** về `available`. Chủ sân giữ 500k
   ngoài ngân hàng và lấy lại 600k trong hệ thống — nền tảng mất 500k. Sửa bằng trạng thái
   `partially_paid` và `BR-FIN-19`: yêu cầu đã có bút toán `payout` **không bao giờ** được
   chuyển sang `rejected`.

**D11** — Lỗ hổng được phát hiện khi rà FIN-12: ca xong thứ Hai, thứ Ba tiền sang
`available`, thứ Tư chủ sân rút sạch, thứ Năm người chơi tranh chấp và thắng. Không còn
nguồn nào để hoàn. Gắn hạn tranh chấp vào đúng cửa sổ 24 giờ tạo ra bất biến: **tiền chỉ
rời diện tranh chấp khi không còn ai được quyền tranh chấp**. Nền tảng không bao giờ phải
chi khoản mình không giữ, nên không cần quỹ dự phòng hay cơ chế ghi nợ ví âm.

## 2. Giả định chưa xác nhận

Chi tiết nằm ở mục 6 của từng file spec. Tổng hợp những giả định rủi ro từ trung bình trở lên:

### Đã được PO duyệt cùng module (2026-08-05)

`A-VEN-06` · `A-VEN-01` · `A-VEN-02` · `A-VEN-08` · `A-ACC-06` · `A-ACC-08`, cùng 11 giả
định tham số của hai module `account-access` và `venue-scheduling`.

### Chờ duyệt — `court-booking` và `finance-disputes`

| # | Giả định | Rủi ro | Nguồn |
|---|---|---|---|
| ~~A-FIN-01~~ | ~~Tỷ lệ hoa hồng đặt lúc triển khai, giá trị khởi đầu đề xuất 10%~~ | ✅ **Đã duyệt — D19 chốt `r=10%` (2026-08-06)**, không còn là giả định | [finance-disputes.md](specs/finance-disputes.md) |
| ~~A-FIN-05~~ | ~~Webhook SePay không khớp thì vào hàng chờ đối soát tay~~ | ✅ Đã thành chức năng `FIN-14` theo D15, không còn là giả định | — |
| A-FIN-06 | Tranh chấp mở chỉ hoãn giải phóng doanh thu của đúng booking đó, không phong tỏa cả ví kinh doanh | Trung bình | như trên |
| A-FIN-08 | Yêu cầu rút bị trừ khỏi `available` ngay khi tạo, không đợi Admin duyệt | Trung bình | như trên |
| A-FIN-04 | Mỗi nhà cung cấp chỉ có một yêu cầu rút `pending` tại một thời điểm | Trung bình | như trên |
| A-FIN-07 | FIN-13 có đúng ba kết quả: hoàn toàn bộ, hoàn một phần, bác | Trung bình | như trên |
| A-BOK-01 | Một người chơi chỉ có tối đa một hold đang hoạt động | Trung bình | [court-booking.md](specs/court-booking.md) |
| A-BOK-02 | Mốc tính bậc thang hoàn tiền là giờ bắt đầu ca, không phải giờ kết thúc | Trung bình | như trên |

Ngoài ra còn 8 giả định tham số rủi ro thấp: ngưỡng rút, số nạp tối thiểu, giới hạn đặt trước
30 ngày, bán kính tìm kiếm mặc định, và tương tự.

## 3. Câu hỏi còn mở

| # | Câu hỏi | Chặn cái gì | Thời điểm cần chốt |
|---|---|---|---|
| Q1 | Ngưỡng "đánh giá bất thường" của F-07 | Spec GĐ2 | Trước khi spec `matchmaking-passport` |
| Q2 | Bộ seed mô phỏng gồm bao nhiêu user, booking, kèo | Điều kiện tái kích hoạt F-05 | Sau kỳ báo cáo tiến độ |
| Q3 | 4 quyết định kỹ thuật ở [system-architecture.md §10](../architecture/system-architecture.md) | Không chặn spec | Trước khi tạo goal triển khai |
| ~~Q4~~ | ~~Có chức năng đánh giá booking sân ở GĐ1 hay không~~ | — | ✅ Đóng bằng D7 |

## 4. Mâu thuẫn giữa các tài liệu

| # | Mâu thuẫn | Trạng thái |
|---|---|---|
| M1 | `SCOPE_BASELINE` cho VEN-01 actor là Người chơi, nhưng `data-model.md` để `USER.role` là enum đơn giá trị | ✅ Giải bằng D3 |
| M2 | `PROVIDER.status` không có giá trị `rejected`, trong khi VEN-02 phải từ chối được | ✅ Giải bằng A-VEN-01, chờ duyệt |
| M3 | `data-model.md` có thực thể `BOOKING_REVIEW`, nhưng `SCOPE_BASELINE` không có use case nào cho đánh giá booking sân | ✅ Giải bằng D7 — kiến trúc không được tự mở rộng phạm vi sản phẩm; `BOOKING_REVIEW` đánh dấu hoãn |
| M4 | `system-architecture.md` mô tả build order theo lát cắt dọc, `phasing.md` chốt module trọn vẹn | ✅ Giải bằng D1; `phasing.md` là bản mới hơn |
| M5 | `data-model.md` gắn `CANCELLATION_POLICY` vào `PROVIDER`, hàm ý chủ sân tự định nghĩa chính sách hủy, nhưng `venue-scheduling` không có use case nào để làm việc đó | ✅ Giải bằng D9 — chính sách hủy thống nhất, thực thể này bị bỏ |
| M6 | `SCOPE_BASELINE` gọi BOK-10 là "điều chỉnh hoặc hủy" nhưng không định nghĩa "điều chỉnh" gồm những gì | ✅ Giải bằng D12 — chỉ đổi sân con |

## 5. Thay đổi kéo theo lên tài liệu kiến trúc

Các tài liệu sau đang ở `status: draft` và cần cập nhật khi spec GĐ1 được duyệt hết:

| Tài liệu | Thay đổi cần làm | Nguồn |
|---|---|---|
| `data-model.md` | `USER.role` từ enum đơn sang tập vai trò | D3 |
| `data-model.md` | `WALLET` bỏ `UK` trên `userId`, thêm `walletType "personal\|business"` | D3 |
| `data-model.md` | `PROVIDER.status` thêm `rejected` | A-VEN-01 |
| `data-model.md` | `BOOKING.userId` cho phép rỗng; thêm trường thông tin khách nội bộ (tên, số liên hệ) cho `source=internal` | A-VEN-06, BR-VEN-08a |
| `data-model.md` | `BOOKING_REVIEW` đánh dấu hoãn, không triển khai ở GĐ1 | D7 |
| `data-model.md` | Bỏ `CANCELLATION_POLICY` gắn với `PROVIDER`; chính sách hủy là hằng số của nền tảng, chỉ còn `policySnapshot` trên booking | D9 |
| `data-model.md` | `BOOKING` thêm trường ghi **nguyên nhân hủy** để phân biệt người chơi tự hủy (FIN-07, theo bậc thang) với lỗi phía sân hoặc nền tảng (FIN-08, hoàn 100%) | D10, BR-BOK-08 |
| `data-model.md` | `WALLET` cần **ba** phân vùng cho ví `business`: `pending`, `available`, `reserved`; ví `personal` chỉ dùng `available` | ADR 0003, BR-FIN-16 |
| `data-model.md` | `WALLET.walletType` thêm giá trị `platform`; ví này không có `userId` | D16 |
| `data-model.md` | `WITHDRAWAL_REQUEST` thêm trạng thái `partially_paid` và trường `paidAmount` | BR-FIN-19 |
| `data-model.md` | `SEPAY_EVENT` thêm trạng thái `unmatched \| matched_auto \| matched_manual \| out_of_scope` | BR-FIN-17 |
| `data-model.md` | `DISPUTE` cần mốc hạn 24 giờ tính từ lúc ca kết thúc và liên kết tới booking để hoãn giải phóng doanh thu | D11 |
| `system-architecture.md` §11 | Ghi chú build order trỏ sang `phasing.md` | D1 |
| `system-architecture.md` §4.6 | Bỏ câu "đánh giá booking ở venue-booking-service" hoặc ghi rõ là ngoài phạm vi GĐ1 | D7 |

12 dòng `data-model.md` trên là con số G0 phải áp đủ.

## 6. Bootstrap chưa tồn tại

Repo hiện **chưa có `package.json` hay file `.prisma` nào** — chỉ có tài liệu. Vì vậy khâu
"migration chạy sạch" không có runtime để thực thi. Gói **Gboot** trong
[phase-1-handoff.md](phase-1-handoff.md) dựng khung monorepo và Prisma trước, chạy trước G0.
Chiến lược DB và ranh giới monorepo phải được PO chốt trước khi Gboot bắt đầu.

## 7. Vòng review thứ ba, sửa 2026-08-05

Sau khi PO duyệt BOK và FIN, một vòng review nữa tìm thêm các vấn đề. Kết quả kiểm chứng và xử lý:

| # | Phát hiện | Đúng/sai | Xử lý |
|---|---|---|---|
| 1 | BR-FIN-17 ép "một sự kiện — một đối ứng", không xử lý được chi vượt (chuyển 700k cho yêu cầu 600k) | Đúng | Viết lại BR-FIN-17 thành "một sự kiện ánh xạ tới **tập** đối ứng cùng hướng, tổng bằng số tiền sự kiện". Thêm `AC-FIN-14-11` phủ nhánh chi vượt |
| 2 | FIN-03/FIN-04 chưa có AC kiểm chứng ghi `release + commission` khi booking xác nhận | Đúng | FIN-09 bổ sung mục "ghi doanh thu" và `AC-FIN-09-1`, `AC-FIN-09-2` (cân bằng ba vế tại xác nhận), `AC-FIN-09-3` (idempotent). BR-FIN-06 nêu rõ ghi cả hoa hồng vào ví `platform` |
| 3 | FIN-14 thiếu cách gán tiền vào cho booking trực tiếp | **Phản biện** | Không phải lỗi. Webhook khớp mã thì FIN-04 tự xác nhận; chỉ khi không khớp mới vào FIN-14, và ghi `topup` là catch-all an toàn. Cho Admin xác nhận booking từ FIN-14 sẽ bỏ qua logic hold. Đã ghi rõ trong FIN-14 |
| 4 | Số AC của gói G4 và G5 sai (28→29, 19→24) | Đúng | Đếm lại toàn bộ; sửa handoff. Tổng dự án 195 → 198 AC sau khi thêm AC ở mục 1, 2 |
| 5 | G0 ghi 10 thay đổi data model, thực tế 12; repo chưa có project Prisma | Đúng | G0 sửa thành 12; tách gói **Gboot** dựng khung trước |
| 6 | Đồ thị phụ thuộc tự mâu thuẫn (G7 cần G6 nhưng nói G5-G7 song song; G8 sau G2 nhưng cần G6/G7) | Đúng | Sửa thành `Gboot → G0 → G1 → G2 → G3 → G4 → (G5 ‖ G6) → G7`. Chuyển phần ghi doanh thu của FIN-09 sang G4 để G5 chỉ phụ thuộc G4 |
| 7 | G8 "khu vực quản trị thống nhất" chưa có AC, có nguy cơ mở rộng phạm vi | Đúng | Bỏ G8. Mỗi màn hình Admin nằm trong gói sở hữu nghiệp vụ của nó |
| 8 | Danh sách quyết định chặn quá rộng | Đúng | Chỉ DB + monorepo chặn Gboot; hoa hồng chặn G4; WebSocket thuộc GĐ2; thời điểm tạo ví đã được spec chốt |

**Ba lỗi 1, 2 chạm spec `finance-disputes` đã duyệt.** Đây là tinh chỉnh, không phải thiết kế
lại: lỗi 1 là một nhánh biên (chi vượt), lỗi 2 là AC kiểm chứng còn thiếu cho hành vi vốn đã
mô tả ở BR-FIN-06/14. Spec giữ trạng thái `approved` với ghi chú sửa đổi này. FIN nay có 73 AC.
