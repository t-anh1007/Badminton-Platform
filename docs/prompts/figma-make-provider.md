---
type: design-prompt
target: Figma Make (create-design)
role: Nhà cung cấp sân (Provider)
source-style: Badminton.fig (COURTIN) — rebrand thành Netmigo
updated: 2026-08-11
---

# Prompt Figma Make — Netmigo · Role Nhà cung cấp sân

> Cùng hệ token với 2 prompt trước (`figma-make-guest.md`, `figma-make-player.md`).
> Dựng **sau khi** đã có 2 role kia trong cùng file Figma để tái dùng component.

---

## PROMPT

Bạn là designer dựng **prototype UI độ trung thực cao** trên Figma cho **Netmigo** —
nền tảng đặt sân cầu lông + ghép kèo + cộng đồng tại Việt Nam. Toàn bộ nội dung
**tiếng Việt**. Lần này dựng **role Nhà cung cấp sân (Provider)** — chủ sân/quản lý
cơ sở cầu lông, đăng ký qua trang "Hợp tác chủ sân" rồi vận hành một **dashboard
quản trị cơ sở** riêng, tách khỏi giao diện công khai của Netmigo.

### 0. RÀNG BUỘC STYLE (giữ nguyên từ 2 prototype trước)

**Màu**: `navy-900 #0F3352` · `navy-700 #15446C` (chủ đạo) · `navy-300 #8AA1B5` ·
`navy-100 #C4D0DA` · `accent-500 #F5E663` (vàng nhấn) · `accent-200 #FAF2B1` ·
`accent-50 #FEFDEA` · `ink-900 #0B0B0B` · `ink-600 #4A4A47` · `ink-400 #8A8A85` ·
`line #E2E2DF` · `surface #FFFFFF` · `canvas #F7F7F5` · `canvas-alt #ECECEA` ·
`success #2E7D5B` · `danger #C6362F` · `warning #D98B0A`.

**Chữ**: tiêu đề section **Archivo ExtraBold/Black IN HOA**; UI/body **Inter**; mọi
con số (tiền, giờ, đếm ngược, %, mã đơn) → **Geist Mono**. Scale: Display 44/700 ·
H1 30/800 hoa · H2 22/700 hoa · H3 17/600 · Body 15/400 · Small 13/400 · Caption
11/600 hoa tracking `.06em`.

**Hình khối**: card `12px`, input `10px`, nút/filter pill `999px`, badge `6px`, ô
lịch `8px`, avatar tròn. Viền `1px line`, bóng rest nhẹ, hover nhấc nhẹ. Không
gradient nặng/glass/3D.

**Khác biệt so với 2 role trước — đây là dashboard, không phải trang công khai:**
- Layout chuẩn **sidebar trái cố định + content phải**, không phải navbar-top +
  container giữa như site công khai.
- Sidebar nền `navy-900` (đậm hơn navbar site 1 bậc để phân biệt "đang ở khu vực
  quản trị"), rộng `260px` desktop, thu gọn icon-only `72px` khi bấm collapse.
- Bảng dữ liệu (table) là thành phần chính ở nhiều màn — dùng đúng phong cách bảng
  đã thấy ở Admin trong file gốc: header `canvas-alt`, hàng zebra nhẹ, hover
  `accent-50`, action ở cột cuối.
- Vẫn Auto Layout mọi frame, layer kebab-case, frame đặt tên
  `provider-desktop-<page>` / `provider-mobile-<page>`.

### 1. NGUYÊN TẮC RIÊNG CỦA ROLE NHÀ CUNG CẤP SÂN

- Một tài khoản **Người chơi** có thể đồng thời là **Provider** sau khi đăng ký +
  được Admin duyệt. Trong dropdown avatar (dùng lại từ role Người chơi), thêm mục
  **"Chuyển sang Kênh chủ sân"** → vào dashboard provider; trong dashboard provider,
  luôn có nút **"Về chế độ Người chơi"** ở góc trên sidebar để quay lại site công
  khai. Đây là 2 "chế độ" của cùng một người dùng, không phải 2 tài khoản khác nhau.
- **Trạng thái hồ sơ provider** (`pending / approved / suspended / rejected`) chi
  phối toàn bộ dashboard: `pending`/`rejected` → chỉ thấy màn theo dõi trạng thái
  đăng ký, khoá hết các mục quản lý; `suspended` → banner đỏ toàn dashboard + khoá
  thao tác tạo mới, vẫn xem được dữ liệu cũ; `approved` → mở đầy đủ.
- **Nền tảng là nguồn lịch chính thức duy nhất** — mọi booking (kể cả ghi tại quầy)
  đều khoá vào cùng một lịch hợp nhất; UI phải nhấn mạnh điều này ở màn lịch (nhãn
  "Đây là lịch duy nhất, đồng bộ real-time với khách đặt online").
- **Hoa hồng cố định 10%, không cấu hình được** — mọi màn doanh thu hiển thị hoa
  hồng như một dòng trừ cố định, không có ô chỉnh sửa %.
- **Doanh thu khả dụng** chỉ mở khoá **sau khi ca kết thúc + qua 24 giờ cửa sổ
  khiếu nại** — dashboard phải phân biệt rõ 3 trạng thái tiền: `Đang chờ` (`pending`,
  ca chưa kết thúc/còn trong 24h) · `Đã giữ` (`reserved`, bị giữ do tranh chấp) ·
  `Khả dụng` (`available`, rút được).
- **Rút tiền = chuyển khoản tay + đối soát qua webhook SePay** — không có nút "rút
  tự động tức thì"; luôn có trạng thái chờ xử lý thủ công.
- **Chính sách hủy hiển thị lại cho provider để tham chiếu** (không chỉnh sửa được,
  vì đây là hằng số nền tảng): ≥24h trước giờ chơi hoàn 100% cho khách, 6–24h hoàn
  50%, <6h không hoàn — provider chỉ xem, không đổi.

### 2. DANH SÁCH MÀN HÌNH CẦN DỰNG

Mỗi mục: 1 frame desktop 1440 + 1 frame mobile 390, trừ khi ghi khác. Nhóm A→F.

**A. Đăng ký & vào dashboard**
1. `partner-landing` *(đã có ở prototype Khách vãng lai — chỉ cần link tới, không
   dựng lại)*. Nút chính trên đó dẫn sang màn 2.
2. `provider-register-form` — form đăng ký nhà cung cấp: Tên cơ sở, Địa chỉ (autocomplete
   bản đồ), Số điện thoại liên hệ, Email, Mô tả ngắn cơ sở, upload ảnh đại diện cơ
   sở (kéo-thả), checkbox đồng ý điều khoản đối tác → nút `GỬI HỒ SƠ ĐĂNG KÝ`.
3. `provider-status-pending` — sau khi gửi: card lớn giữa trang, icon đồng hồ cát,
   "HỒ SƠ ĐANG CHỜ XÉT DUYỆT" + mô tả thời gian xử lý dự kiến + nút "Về trang chủ".
4. `provider-status-rejected` — biến thể: icon dấu X, "HỒ SƠ CHƯA ĐƯỢC DUYỆT" + lý do
   Admin ghi (banner `danger-bg`) + nút `GỬI LẠI HỒ SƠ`.
5. `provider-suspended-banner` (component, không cần frame riêng) — dải đỏ toàn
   chiều ngang trên mọi trang dashboard khi status=`suspended`: "Tài khoản chủ sân
   đang bị tạm khoá — Liên hệ hỗ trợ" + link `support-tickets`.

**B. Khung dashboard**
6. `provider-sidebar` (component) — logo Netmigo thu nhỏ trên cùng, nút collapse;
   menu: **Tổng quan** · **Cơ sở & sân** · **Lịch hợp nhất** · **Đặt tại quầy** ·
   **Doanh thu & Rút tiền** · **Cài đặt cơ sở**; dưới cùng: tên cơ sở + trạng thái
   (chip `Đã duyệt` xanh) + nút `Về chế độ Người chơi`.
7. `provider-topbar` (component) — bên phải sidebar: breadcrumb trang hiện tại +
   chuông thông báo + avatar. Nếu provider có **nhiều cơ sở**: dropdown chọn cơ sở
   đang quản lý ở đầu topbar.
8. `provider-dashboard-overview` — Tổng quan: 4 stat card đầu trang (Geist Mono):
   **Booking hôm nay**, **Doanh thu tuần này**, **Số dư khả dụng**, **Tỷ lệ lấp
   đầy (%)**; bên dưới: biểu đồ cột đơn giản doanh thu 7 ngày gần nhất; danh sách
   **booking sắp tới** (bảng rút gọn); khối cảnh báo nếu có tranh chấp đang mở
   ảnh hưởng doanh thu.

**C. Quản lý cơ sở & sân**
9. `venue-profile-settings` — form chỉnh hồ sơ cơ sở: tên, địa chỉ + vị trí bản đồ,
   mô tả, tiện ích (checkbox: bãi xe, nước uống, phòng thay đồ, wifi, đèn chiếu
   sáng…), thư viện ảnh (upload/xoá/sắp xếp thứ tự), nút `LƯU THAY ĐỔI`.
10. `courts-list` — bảng danh sách sân con: cột Tên sân, Loại mặt sân, Trạng thái
    (`Hoạt động`/`Ngừng hoạt động` — toggle switch), nút `Sửa` / `Ngừng hoạt động`
    mỗi hàng; nút `+ THÊM SÂN CON` trên đầu → mở `court-edit-modal`.
11. `court-edit-modal` — form thêm/sửa sân con: Tên sân, Loại mặt sân (thảm Yonex/
    thảm thường/khác), toggle Hoạt động.
12. `operating-hours-settings` — bảng giờ hoạt động theo 7 ngày trong tuần (mỗi
    dòng: Thứ, giờ mở, giờ đóng, toggle "Đóng cửa cả ngày"); bên dưới: lịch **ngày
    đóng cửa đặc biệt** (date picker chọn nhiều ngày, vd nghỉ lễ, sửa chữa) + list
    các ngày đã thêm có nút xoá.
13. `pricing-rules-editor` — bảng **biểu giá theo khung giờ**: mỗi dòng = khung giờ
    (vd 06:00–17:00 / 17:00–22:00) × ngày trong tuần × sân con (hoặc áp dụng chung)
    × giá (Geist Mono, `đ/giờ`); nút `+ THÊM MỨC GIÁ`; ghi chú nhỏ "Thay đổi giá áp
    dụng cho slot đặt mới, không ảnh hưởng booking đã xác nhận" (khớp `PRICING_RULE.
    effectiveFrom`/`version`).
14. `booking-rules-settings` — form quy tắc đặt sân: **Bước thời gian slot** (chọn
    15/30/60 phút), **Thời lượng tối thiểu**, **Thời lượng tối đa** (số giờ), preview
    trực quan nhỏ minh hoạ cách lưới slot sẽ chia theo cấu hình này.

**D. Lịch hợp nhất & đặt tại quầy**
15. `unified-calendar` — màn hình chính, quan trọng nhất: lưới lịch dạng **tuần**
    (7 cột ngày × trục giờ dọc, hoặc trục giờ ngang × hàng sân con tuỳ court được
    chọn) hiển thị **tất cả booking gộp chung** — phân biệt bằng màu/icon nhỏ:
    nguồn `marketplace` (online, icon điện thoại) vs `internal` (tại quầy, icon
    người); slot `held` (viền vàng gạch), `confirmed` (nền `success` nhạt), trống
    (trắng). Click 1 ô đã đặt → popover chi tiết booking (khách, giờ, giá, nguồn,
    trạng thái, nút Hủy nếu là phía sân). Có bộ lọc theo sân con (tab ngang) và
    chuyển tuần (‹ Tuần này ›). Nhãn nhỏ "LỊCH DUY NHẤT — ĐỒNG BỘ THỜI GIAN THỰC".
16. `booking-detail-popover` (component) — chi tiết 1 booking khi click từ lịch:
    tên khách (hoặc "Khách tại quầy" nếu internal), giờ, giá, trạng thái, nguồn,
    nút `Đổi sân con` (BOK-10-6) / `Hủy booking` (mở modal lý do + xem trước %
    hoàn theo mốc 24h/6h).
17. `counter-booking-form` — "Ghi nhận booking tại quầy": chọn ngày, sân con, khung
    giờ (tái dùng lưới slot), tên khách vãng lai + số điện thoại liên hệ (map field
    `guestName`/`guestContact`), giá hiển thị tự động theo biểu giá, nút `XÁC NHẬN
    ĐẶT SÂN TẠI QUẦY` → toast + cập nhật ngay trên `unified-calendar`.
18. `provider-cancel-booking-modal` — hủy booking phía sân (BR khác khách tự hủy):
    chọn lý do (sự cố sân, bảo trì đột xuất, khác) → cảnh báo "Khách sẽ được hoàn
    100% do lỗi từ phía sân" → xác nhận.

**E. Doanh thu & tài chính**
19. `revenue-overview` — 3 card lớn Geist Mono: **Đang chờ** (`pending`, màu
    `warning`) · **Đã giữ do tranh chấp** (`reserved`, màu `danger` nếu >0, ẩn/0 nếu
    không có) · **Khả dụng** (`available`, màu `success`, số to nhất) + nút
    `YÊU CẦU RÚT TIỀN` (disable nếu khả dụng = 0). Bên dưới: bảng **doanh thu theo
    booking** (mã booking, ngày, giá gốc, hoa hồng 10% Geist Mono màu đỏ nhạt (trừ),
    thực nhận, trạng thái tiền). Dòng chú thích cố định: "Hoa hồng nền tảng 10% —
    cố định, không thay đổi."
20. `withdrawal-request-modal` — form yêu cầu rút tiền: số tiền (không vượt số dư
    khả dụng, có nút "Rút toàn bộ"), thông tin tài khoản ngân hàng nhận tiền (số
    TK, tên NH, chủ TK) → gửi → toast "Đã gửi yêu cầu, xử lý trong vòng 1–3 ngày
    làm việc".
21. `withdrawal-history` — bảng lịch sử yêu cầu rút: mã yêu cầu, số tiền, ngày gửi,
    trạng thái (`Chờ xử lý`/`Đã chuyển`/`Từ chối`/`Chuyển một phần` — badge màu
    tương ứng warning/success/danger/warning), số tiền đã chuyển nếu `Chuyển một
    phần`.
22. `dispute-impact-view` — danh sách tranh chấp đang ảnh hưởng tới booking của
    cơ sở (chỉ xem, xử lý thuộc Admin): mã giao dịch, lý do khách gửi, trạng thái,
    số tiền đang bị `reserved` do tranh chấp này.
23. `cancellation-policy-reference` (card tĩnh, đặt trong `revenue-overview` hoặc
    `Cài đặt cơ sở`) — bảng tham chiếu chính sách hủy cố định của nền tảng (≥24h:
    hoàn 100% · 6–24h: hoàn 50% · <6h: không hoàn) với dòng chú "Chính sách chung
    toàn nền tảng — chủ sân không chỉnh được".

**F. Bộ trạng thái & thư viện**
24. `provider-ui-states` — cạnh nhau, nhãn IN HOA: Skeleton bảng dữ liệu · Empty
    "Chưa có sân con nào" / "Chưa có booking nào hôm nay" / "Chưa có yêu cầu rút
    tiền" · Error banner "Không tải được dữ liệu" + Thử lại · Toast success/error ·
    banner `suspended` · trạng thái pending/rejected của hồ sơ đăng ký.
25. `provider-components` — thư viện: Sidebar nav item (default/active/hover) ·
    Stat card · DataTable (header/row/hover/empty) · Badge trạng thái tiền
    (pending/reserved/available) · Badge trạng thái booking (held/confirmed/
    cancelled) · Badge nguồn (marketplace/internal) · Toggle switch · Calendar
    cell (4 trạng thái) · Modal shell · Button (đã có, tái dùng) · Chart bar đơn
    giản.
26. `provider-flow-map` — sơ đồ luồng: `partner-landing` → `provider-register-form`
    → `provider-status-pending` → (Admin duyệt, ngoài phạm vi role này) →
    `provider-dashboard-overview` → các mục sidebar; `unified-calendar` ⇄
    `counter-booking-form` ⇄ `booking-detail-popover`; `revenue-overview` →
    `withdrawal-request-modal` → `withdrawal-history`.

### 3. NỘI DUNG MẪU

- Cơ sở mẫu: **Sân Cầu Lông Thống Nhất — Quận 10**, chủ sở hữu tài khoản
  **Nguyễn Minh Anh** (đồng bộ với người chơi ở prompt trước — thể hiện đúng "1 tài
  khoản, 2 chế độ"). 4 sân con: Sân 1 (thảm Yonex) · Sân 2 (thảm Yonex) · Sân 3
  (thảm thường) · Sân 4 (thảm thường, đang ngừng hoạt động).
- Giá mẫu: 06:00–17:00 → `80.000đ/giờ`; 17:00–22:00 → `140.000đ/giờ` (giờ cao điểm).
- Doanh thu tuần mẫu: tổng gộp `18.400.000đ`, hoa hồng 10% = `1.840.000đ`, thực
  nhận `16.560.000đ`.
- Số dư mẫu: Đang chờ `2.100.000đ` · Đã giữ `240.000đ` (1 tranh chấp) · Khả dụng
  `12.300.000đ`.
- Mã yêu cầu rút: `WD-2026-0034` (Geist Mono).
- Khách tại quầy mẫu: "Anh Tuấn — 090xxxxxxx".

### 4. YÊU CẦU KỸ THUẬT

- Dùng lại **Local variables** và **component** đã tạo ở 2 role trước; component
  mới (Sidebar, DataTable, StatCard, CalendarCell…) đặt trong page `Components`.
  Màn hình mới đặt trong page `Provider — Desktop` và `Provider — Mobile`.
- Vì đây là dashboard dữ liệu dày, **ưu tiên rõ ràng hơn thẩm mỹ** ở các bảng: đủ
  contrast, đủ khoảng trắng giữa hàng, số tiền luôn căn phải + Geist Mono.
- Nối prototype theo `provider-flow-map`; nút "Về chế độ Người chơi" ở sidebar
  Navigate to `home-player`; mục "Chuyển sang Kênh chủ sân" ở dropdown avatar
  player Navigate to `provider-dashboard-overview`.
- Mobile: sidebar thành bottom nav 5 icon (Tổng quan/Cơ sở/Lịch/Doanh thu/Thêm) +
  các bảng dữ liệu chuyển thành list card xếp dọc thay vì cuộn ngang bảng.

Bắt đầu bằng nhóm A, dựng lần lượt A → F.

---

## Ghi chú cho PO

- Role Provider **chưa có page spec** trong `docs/design/pages/` (01–11 hiện chỉ
  phủ Guest/Player) và **chưa có trang FE tương ứng** trong `apps/web/src/pages/`
  (chỉ có `AdminPage.tsx` xử lý duyệt provider từ phía Admin). Prototype này đi
  trước code — cần PO/Codex tạo page spec `12-provider-dashboard.md` nếu chốt dựng
  thật ở GĐ sau.
- `OPERATING_HOURS`, `CLOSURE`, `BOOKING_RULE` trong `data-model.md` **chưa có định
  nghĩa cột cụ thể** (ghi rõ là khoảng trống chờ G2 định nghĩa) — các trường trong
  màn `operating-hours-settings` / `booking-rules-settings` ở prompt này là **suy
  đoán hợp lý cho mục đích dựng UI**, không phải đặc tả đã chốt; khi code thật cần
  đối chiếu lại field tên chính thức.
- Cùng lưu ý màu sắc như 2 prompt trước: token ở đây theo `.fig` gốc (navy/vàng),
  lệch với `docs/design/design-system.md` hệ Playo xanh lá — cần PO chốt một nguồn.
