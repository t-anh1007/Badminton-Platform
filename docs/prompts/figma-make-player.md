---
type: design-prompt
target: Figma Make (create-design)
role: Người chơi (đã đăng nhập)
source-style: Badminton.fig (COURTIN) — rebrand thành Netmigo
updated: 2026-08-11
---

# Prompt Figma Make — Netmigo · Role Người chơi (đã đăng nhập)

> Cùng hệ token với prompt Khách vãng lai (`figma-make-guest.md`). Dán khối dưới
> vào Figma Make **sau khi** đã dựng xong role Khách vãng lai, để tái dùng
> component/variable đã tạo.

---

## PROMPT

Bạn là designer dựng **prototype UI độ trung thực cao** trên Figma cho **Netmigo** —
nền tảng đặt sân cầu lông + ghép kèo + cộng đồng tại Việt Nam. Toàn bộ nội dung
**tiếng Việt**. Lần này dựng **role Người chơi (đã đăng nhập)** — actor chính,
kiêm 3 vai trò theo ngữ cảnh: người đặt sân, người tham gia kèo, người tổ chức
(host) kèo.

### 0. RÀNG BUỘC STYLE (giữ nguyên từ prototype Khách vãng lai)

Dùng lại đúng token màu, chữ, hình khối, bố cục đã định nghĩa trước đó. Nhắc lại
để không lệch:

**Màu**: `navy-900 #0F3352` (footer, pressed) · `navy-700 #15446C` (chủ đạo, navbar,
primary) · `navy-300 #8AA1B5` · `navy-100 #C4D0DA` · `accent-500 #F5E663` (nhấn
vàng — slot giữ, badge, CTA phụ) · `accent-200 #FAF2B1` · `accent-50 #FEFDEA` ·
`ink-900 #0B0B0B` · `ink-600 #4A4A47` · `ink-400 #8A8A85` · `line #E2E2DF` ·
`surface #FFFFFF` · `canvas #F7F7F5` · `canvas-alt #ECECEA` · `success #2E7D5B` ·
`danger #C6362F` · `warning #D98B0A`.

**Chữ**: tiêu đề section **Archivo ExtraBold/Black IN HOA**; UI/body **Inter**;
**mọi con số** (giá, giờ, đếm ngược, mã đơn, rating/RD, số dư, độ hợp %) →
**Geist Mono**. Scale: Display 44/700 · H1 30/800 hoa · H2 22/700 hoa · H3 17/600 ·
Body 15/400 · Small 13/400 · Caption 11/600 hoa tracking `.06em`.

**Hình khối**: card `12px`, input `10px`, nút/filter pill `999px`, badge `6px`,
ô slot `8px`, avatar tròn. Viền `1px line`, bóng rest `0 1px 2px rgba(11,11,11,.05)`,
hover `0 6px 18px rgba(11,11,11,.08)`. Không gradient nặng/glass/3D.

**Bố cục**: desktop `1440`, container `1200`; mobile `390`. Spacing 4/8/12/16/24/32/48/64.
Auto Layout mọi frame; component + variant cho phần lặp; layer kebab-case; frame
đặt tên `player-desktop-<page>` / `player-mobile-<page>`.

### 1. NGUYÊN TẮC RIÊNG CỦA ROLE NGƯỜI CHƠI

- **Navbar đã đăng nhập**: bỏ nút Đăng nhập/Đăng ký, thay bằng **chuông thông báo**
  (badge số đỏ) + **avatar tròn** mở dropdown: Hồ sơ · Player Passport · Trợ lý AI ·
  Đăng xuất. Không có mục Quản trị (chỉ Admin mới thấy).
- **Không còn login gate nào** — mọi hành động thực thi thật: giữ slot, thanh toán,
  tham gia/tạo kèo, đăng bài, bình luận, báo cáo, gửi ticket, dùng AI. Thay login
  gate bằng **luồng xác nhận có hệ quả thật**: countdown giữ chỗ, bước thanh toán,
  toast kết quả, badge trạng thái cập nhật realtime.
- **Countdown giữ chỗ 10 phút** là chi tiết xuyên suốt — bất cứ đâu có hold (booking
  hoặc kèo cần thanh toán phí) đều hiện đồng hồ đếm ngược Geist Mono, đổi màu đỏ
  đậm dần khi còn <2:00.
- **Tiền luôn hiển thị 2 nguồn**: **Số dư nội bộ** (ví Netmigo) và **SePay** (cổng
  thanh toán ngoài) — luôn cho chọn 1 trong 2 ở mọi bước thanh toán, không có
  "thanh toán tại sân".
- **AI chỉ gợi ý/giải thích, không tự hành động** — mọi CTA từ AI chỉ dẫn sang luồng
  chuẩn (đặt sân/tham gia kèo), không có nút "để AI tự làm".

### 2. DANH SÁCH MÀN HÌNH CẦN DỰNG

Mỗi mục: 1 frame desktop 1440 + 1 frame mobile 390, trừ khi ghi khác. Nhóm A→G.

**A. Khung đã đăng nhập**
1. `navbar-logged-in` (component) — nền `navy-700`, logo trái, menu giữa (Đặt sân ·
   Kèo · Cộng đồng), phải: icon chuông (badge đỏ số) + avatar → dropdown (Hồ sơ ·
   Player Passport · Trợ lý AI · Đăng xuất). Mobile: menu gộp sheet trượt từ phải.
2. `notifications-panel` — dropdown/trang: list thông báo (icon theo loại: booking
   xác nhận, slot sắp hết hạn, yêu cầu tham gia được duyệt, bình luận mới, ticket
   phản hồi), chưa đọc có chấm vàng `accent-500`, nút "Đánh dấu đã đọc tất cả".
3. `home-player` — như Home guest nhưng: hero đổi lời chào "Chào {Tên}, hôm nay chơi
   không?"; thêm dải **"Booking sắp tới của bạn"** (card rút gọn, nếu có) ngay dưới
   hero; carousel Sân nổi bật/Kèo đang mở như cũ nhưng bấm vào đi thẳng vào luồng
   thật (không qua gate); vẫn giữ carousel "Bài viết nổi bật từ cộng đồng".

**B. Đặt sân — luồng đầy đủ**
4. `venue-list-player` / `venue-detail-player` — giống bản guest, chỉ khác nút CTA
   "Đặt sân ngay" dẫn thẳng vào `booking-flow` (không qua auth-modal).
5. `booking-flow` — trang `/booking?venueId=`, **stepper 3 bước** pill (Chọn slot ·
   Xác nhận · Thanh toán) trên header, countdown giữ chỗ hiện bên phải khi có hold.
   2 cột:
   - Trái: date picker, dropdown sân con, **lưới slot** (trục giờ ngang, hàng theo
     sân con) 3 trạng thái (`trống` viền `success` + giá + nút Chọn, `đang giữ`
     nền `accent-500` mờ khoá, `đã đặt` nền `canvas-alt` xám).
   - Phải (sticky): **Bước Chọn** → EmptyState "Chưa chọn slot" hoặc card tóm tắt
     slot đã chọn + nút `GIỮ CHỖ (10:00)`. **Bước Xác nhận** → tóm tắt đầy đủ (sân,
     ngày giờ, thời lượng, tổng tiền Geist Mono) + nút `TẠO BOOKING`. **Bước Thanh
     toán** → radio card `Số dư` (hiện số dư hiện có) / `SePay` (QR/redirect) + nút
     `XÁC NHẬN THANH TOÁN`.
   Dựng thêm biến thể: **hết hạn giữ chỗ** (banner đỏ nhạt "Hết thời gian giữ chỗ,
   vui lòng chọn lại"), **thành công** (card tick xanh + mã booking Geist Mono +
   link "Xem trong Hồ sơ"). Mobile: giỏ/tóm tắt thành sticky bar đáy.
6. `booking-cancel-flow` — từ Hồ sơ: card booking → nút "Hủy booking" → modal xác
   nhận (nêu rõ % hoàn tiền theo thời điểm hủy, BR liên quan) → toast kết quả +
   badge trạng thái đổi "Đã hủy" + dòng "Đã hoàn vào số dư".

**C. Hồ sơ, Ví, Tranh chấp**
7. `profile-overview` — `/profile`, 2 cột: trái **user card** sticky (avatar, tên,
   email, số booking, (nếu có) bậc trình độ + link Passport, nút "Cập nhật thông
   tin" + "Đổi mật khẩu"); phải **tabs** (Đặt sân của tôi · Ví · Tranh chấp).
8. `profile-bookings-tab` — segmented **Sắp tới / Đã qua / Đã hủy**; list booking
   card (tên sân, ngày giờ, giá Geist Mono, badge trạng thái màu theo state); rỗng
   → EmptyState theo từng segment.
9. `profile-wallet-tab` — segmented **Cá nhân / Kinh doanh** (ẩn Kinh doanh nếu
   không phải nhà cung cấp); card **Số dư khả dụng** (số lớn Geist Mono) + nút
   `NẠP TIỀN (SePay)`; danh sách **lịch sử giao dịch** (loại, +/− số tiền Geist
   Mono màu theo dấu, thời gian, trạng thái).
10. `profile-wallet-topup-modal` — modal nạp tiền: nhập số tiền (gợi ý nhanh
    50k/100k/200k/500k) → nút "Tiếp tục với SePay" → màn hình chờ QR/redirect →
    biến thể thành công/thất bại.
11. `profile-disputes-tab` — list tranh chấp đã gửi (mã giao dịch, lý do, trạng
    thái open/resolved, phản hồi Admin nếu có); nút `GỬI TRANH CHẤP MỚI` → form
    modal (chọn giao dịch liên quan, lý do, mô tả, đính kèm ảnh).
12. `profile-edit-modal` — form Cập nhật thông tin (Tên hiển thị, SĐT, hiển thị
    Công khai/Riêng tư) + form Đổi mật khẩu (mật khẩu hiện tại + mới + xác nhận),
    2 modal riêng hoặc 2 tab trong 1 modal.
13. `provider-cta-card` (component, hiện trong `profile-wallet-tab` nếu chưa là
    provider) — card nhỏ nền `accent-50`: "Bạn có sân cho thuê? Đăng ký làm nhà
    cung cấp để quản lý lịch & nhận doanh thu" + nút ghost dẫn sang landing đối tác.

**D. Kèo — toàn bộ vòng đời**
14. `match-list-player` — giống bản guest về bố cục (sidebar lọc + list + panel
    Tìm nhanh realtime) nhưng nút `Tạo kèo mới` hoạt động thật; MatchCard bấm vào
    dẫn thẳng `match-detail-player`.
15. `match-create-flow` — modal/trang nhiều bước: **Bước 1** chọn sân & slot (tái
    dùng lưới slot từ booking, bắt buộc có hold hợp lệ trước khi tạo được kèo —
    banner nhắc "Cần giữ chỗ trước khi tạo kèo"); **Bước 2** đặt tiêu chí (loại
    Đơn/Đôi, khoảng trình độ min–max bằng slider 5 bậc, số người cần, phí/người,
    ghi chú host); **Bước 3** xem lại & công bố → toast "Đã tạo kèo" + chuyển tới
    `match-detail-player` với badge "Bạn là host".
16. `match-detail-player` — 2 cột: trái card thông tin trận (tên sân/sân con, host
    + bậc, ngày giờ, sân + link bản đồ, phí, skill range, mô tả, ghi chú host nền
    `accent-50`); phải **danh sách người chơi** đầy đủ họ tên + badge vai trò/trạng
    thái (Đã xác nhận/Đã duyệt/Chờ duyệt) + carousel "Sân gần đây". **Sticky CTA
    bar đáy đổi theo trạng thái tham gia của chính user**:
    - Chưa tham gia, còn chỗ → `GỬI YÊU CẦU THAM GIA`.
    - `pending` → nhãn "Chờ tổ chức duyệt" + nút `RÚT YÊU CẦU`.
    - `approved` chưa trả phí (kèo có phí) → `TRẢ PHÍ THAM GIA` + countdown hold
      10 phút, radio Số dư/SePay.
    - `confirmed` → "Đã tham gia" + nút `RÚT KHỎI KÈO` (kèm điều kiện hoàn tiền
      theo cutoff).
    - Là **host** → thanh CTA đổi thành `QUẢN LÝ KÈO` (mở `match-manage-panel`).
17. `match-manage-panel` (chỉ host, mở từ nút Quản lý kèo) — danh sách **yêu cầu
    tham gia đang chờ duyệt**: mỗi dòng có avatar, tên, **bậc trình độ + điểm độ
    hợp %** (Geist Mono) + giải thích ngắn, 2 nút `Duyệt` / `Từ chối`; cuối trang
    nút `HỦY KÈO NÀY` (mở modal xác nhận, cảnh báo hệ quả hoàn phí cho thành viên).
18. `match-join-payment` — bước trả phí tham gia (khi được duyệt, kèo có phí): card
    tóm tắt kèo + phí + countdown hold + radio Số dư/SePay + nút xác nhận; biến thể
    thành công (badge "Đã xác nhận tham gia").
19. `match-review-modal` — sau khi trận kết thúc: modal đánh giá đối thủ/thành viên
    cùng kèo (chọn người, thang đánh giá đơn giản, ghi chú tuỳ chọn) → toast cảm ơn.

**E. Player Passport**
20. `passport-own` — `/passport`: header avatar lớn + tên + **badge bậc** (chip màu
    theo 5 bậc) + "Đã chơi N trận"; nút `KHAI BÁO TRÌNH ĐỘ` + `XEM ĐÁNH GIÁ GẦN ĐÂY`;
    khối **Rating**: số rating lớn Geist Mono + RD nhỏ + nhãn độ chắc chắn ("Đang
    xác định trình độ" `warning` khi RD cao / "Ổn định" `success` khi RD thấp);
    **lịch sử trận** (list: đối thủ/kèo, kết quả, thời điểm, thay đổi rating ± Geist
    Mono); **đánh giá đã nhận** (tổng hợp/ẩn danh, có nhãn "chờ Admin duyệt" nếu bị
    flag).
21. `passport-declare-skill-modal` — form khai báo trình độ ban đầu: chọn 1 trong 5
    bậc + mô tả ngắn kinh nghiệm → submit → toast + cập nhật badge.
22. `passport-cold-start` — biến thể khi chưa đủ trận: khối rating hiện trạng thái
    khởi tạo (icon + "Chưa đủ dữ liệu để xác định trình độ chính xác" + thanh tiến
    độ số trận tối thiểu) + CTA khai báo trình độ.
23. `passport-public-view` — bản xem người khác: chỉ avatar + tên + badge bậc + số
    trận, không rating/RD/lịch sử chi tiết.

**F. Cộng đồng — đầy đủ quyền**
24. `community-feed-player` — như bản guest nhưng **composer hoạt động thật**: ô
    nhập mở rộng thành form (textarea + nút Đăng), PostCard có nút **Bình luận**
    và **Báo cáo** hoạt động (không mờ); rail phải là **"Báo cáo của tôi"** (list
    trạng thái Đang xử lý/Đã xử lý/Từ chối) + **"Yêu cầu hỗ trợ"** (list ticket rút
    gọn) thay cho `guest-prompt-card`.
25. `community-post-detail-player` — bài đầy đủ + composer bình luận hoạt động +
    thread bình luận (bong bóng, có thể trả lời); menu 3 chấm trên bài **của chính
    mình** → Sửa / Xóa (modal xác nhận xóa).
26. `community-report-modal` — modal báo cáo bài viết: chọn lý do (dropdown: từ ngữ
    tục tĩu, quảng cáo/spam, công kích cá nhân, khác) + mô tả thêm → gửi → toast.
27. `support-tickets` — `/support`: list ticket của tôi (mã `TK-2026-xxxx` Geist
    Mono, tiêu đề, trạng thái, cập nhật gần nhất) + nút `GỬI YÊU CẦU HỖ TRỢ MỚI`
    (mở sheet: tiêu đề, mô tả, đính kèm ảnh bằng chứng).
28. `support-ticket-thread` — chi tiết 1 ticket: hội thoại dạng bong bóng
    user↔Admin, trạng thái ở header (Mở/Đang xử lý/Đã giải quyết/Đã đóng), ô trả
    lời dưới cùng nếu ticket còn mở.

**G. Trợ lý AI**
29. `ai-assistant-player` — `/assistant`, header + **segmented 2 tab**: **Gợi ý
    kèo** | **Chat hỗ trợ**.
    - Tab Gợi ý kèo: danh sách **suggestion-card** (MatchCard rút gọn + điểm độ hợp
      % Geist Mono + dòng giải thích "Hợp vì trình độ gần bạn, cùng khu vực, còn
      chỗ") + nút `Xem kèo` → `match-detail-player`. Biến thể **chưa khai báo trình
      độ** (EmptyState dẫn `passport-declare-skill-modal`). Biến thể **fallback**
      khi AI lỗi/hết quota: vẫn hiện list (nhãn nhỏ "giải thích rút gọn"), không
      màn trắng.
    - Tab Chat hỗ trợ: khung chat full-height, bong bóng user/assistant, câu trả
      lời AI có **source chips** cuộn ngang (Điều khoản · Booking của bạn · Kèo của
      bạn), input dưới + gợi ý câu hỏi nhanh (chip). Biến thể AI trả lời có ý định
      hành động → kèm CTA nút dẫn luồng thật (vd "Hủy booking này" → mở
      `booking-cancel-flow`), không tự thực hiện. Biến thể fallback "Trợ lý tạm
      bận, thử lại sau" (giữ lịch sử hội thoại).

### 3. NỘI DUNG MẪU (đồng bộ với prompt Khách vãng lai)

- Người dùng hiện tại (owner của các màn): **Nguyễn Minh Anh**, email
  `minhanh@gmail.com`, đã chơi **14 trận**, bậc **Trung Bình+**, rating `1487` /
  RD `62` (Geist Mono).
- Sân/giá/ngày/mã đơn: dùng lại bộ dữ liệu đã dùng ở prompt Khách vãng lai (Sân
  Thống Nhất Q10, Sân Kỳ Hòa, Sân Viettel Q10; `80.000đ`–`140.000đ`/giờ; mã
  `NM-2026-0891`).
- Số dư ví mẫu: `450.000đ`. Giao dịch mẫu: `+500.000đ Nạp tiền qua SePay`,
  `-120.000đ Thanh toán booking NM-2026-0891`, `+120.000đ Hoàn tiền hủy booking`.
- Ticket mẫu: `TK-2026-0142 — Lỗi không thanh toán được qua ví MoMo`.
- Trình độ 5 bậc: Mới chơi · Yếu · Trung Bình · Trung Bình+ · Bán Chuyên.

### 4. YÊU CẦU KỸ THUẬT

- Dùng lại toàn bộ **Local variables** và **Components** đã tạo ở prototype Khách
  vãng lai — không tạo trùng token/component mới cho cùng một khái niệm.
  Component mới (notifications, suggestion-card, source-chips, tier-badge,
  rating-block…) đặt cùng page `Components`.
  Các màn hình mới đặt trong page `Player — Desktop` và `Player — Mobile`.
- Nối **prototype links** thể hiện toàn bộ vòng đời: Home → Venue detail →
  Booking flow (Chọn slot → Giữ chỗ → Xác nhận → Thanh toán → Thành công) → Hồ
  sơ; Match list → Match detail → (Gửi yêu cầu → chờ duyệt → trả phí → đã tham
  gia) hoặc (host → Quản lý kèo → duyệt/từ chối → hủy kèo).
- Mọi màn có dữ liệu tiền phải dùng **Geist Mono**, có dấu phân cách nghìn, đơn vị
  `đ` liền sau số (`120.000đ`), không khoảng trắng trước `đ`.
- Đồng hồ đếm ngược giữ chỗ: định dạng `mm:ss` Geist Mono, đổi màu chữ/nền dần
  sang `danger` khi còn dưới 2 phút.

Bắt đầu bằng nhóm A, dựng lần lượt A → G.

---

## Ghi chú cho PO

- Role này giả định role Khách vãng lai đã dựng xong trong cùng file Figma để tái
  dùng biến/component — nếu dựng độc lập, cần copy lại bảng token ở mục 0.
- Cũng như prompt Khách vãng lai: token màu ở đây theo `.fig` gốc (navy/vàng), lệch
  với `docs/design/design-system.md` (hệ Playo xanh lá). Cần PO chốt một nguồn duy
  nhất trước khi code `apps/web`.

---

## Checklist nối prototype thủ công (guest ⇄ player)

> **Không** dán phần này vào Figma Make — đây là việc làm tay trong Figma sau khi
> AI đã dựng xong frame (tab **Prototype** → kéo connection handle → `Navigate to`
> / `Open overlay`). Mục đích: khi bấm nút "Đăng nhập" trong gate, luồng phải đi
> **thẳng tới đúng bước đang dang dở** ở bản player, không phải luôn nhảy về
> `home-player`.

### 1. Hai điểm vào (flow starting point)
Chọn frame → panel Prototype → bật cờ 🚩 **New flow starting point** cho:
- `home` (guest)
- `home-player`

### 2. Bảng nối gate → player tương ứng

| Từ (guest) | Trigger | Action | Đến (player) |
|---|---|---|---|
| `home` → nút `Đăng nhập` / `Đăng ký` (navbar) | On click | Open overlay | `auth-modal` |
| `auth-modal` → nút `ĐĂNG NHẬP` / `TẠO TÀI KHOẢN` (không gắn với thao tác dở dang) | On click | Navigate to | `home-player` |
| `booking-grid-guest` → nút "Chọn" bất kỳ ô slot | On click | Open overlay | `booking-login-gate-modal` |
| `booking-login-gate-modal` → nút `Đăng nhập` | On click | Navigate to | `booking-flow` (đúng bước **Xác nhận**, đã có slot tương ứng chọn sẵn — dựng sẵn biến thể này thay vì bước Chọn trống) |
| `venue-detail` → nút `ĐẶT SÂN NGAY` | On click | Navigate to | `booking-flow` (bước **Chọn slot**, venueId tương ứng) |
| `match-detail` → nút `ĐĂNG NHẬP ĐỂ THAM GIA KÈO` | On click | Navigate to | `match-detail-player` (cùng kèo, trạng thái **chưa tham gia** — để bấm tiếp `GỬI YÊU CẦU THAM GIA`) |
| `match-list` → nút `Tạo kèo mới` (gate) | On click | Navigate to | `match-create-flow` — Bước 1 |
| `community-feed-guest` → composer bị phủ mờ | On click | Open overlay | `auth-modal` |
| `auth-modal` (mở từ community) → nút Đăng nhập | On click | Navigate to | `community-feed-player` (không phải `home-player`) |
| `community-feed-guest` → nút Bình luận/Báo cáo trên post-card | On click | Open overlay | `auth-modal` |
| `ai-assistant-guest` → ô chat bị khoá | On click | Open overlay | `auth-modal` |
| `auth-modal` (mở từ AI) → nút Đăng nhập | On click | Navigate to | `ai-assistant-player` |
| `guest-prompt-card` (rail "Báo cáo của tôi/Yêu cầu hỗ trợ") | On click | Navigate to | `support-tickets` |

**Nguyên tắc chung khi tự nối thêm case khác:** xác định guest đang ở "ngữ cảnh"
nào (đang xem sân nào, kèo nào, đang ở tab nào) → nối gate sang **đúng frame
player giữ nguyên ngữ cảnh đó**, không nối đại khái về `home-player`. Nếu bản
player chưa có frame giữ đúng ngữ cảnh (vd "slot đã chọn sẵn"), dựng thêm 1 biến
thể nhỏ của frame đó thay vì nối sai.

### 3. Nối trong nội bộ player (không qua gate)
- Navbar `player`: avatar → dropdown → `Hồ sơ` / `Player Passport` / `Trợ lý AI` /
  `Đăng xuất` (Đăng xuất → Navigate to `home` guest, coi như kết thúc phiên).
- `home-player` → card "Booking sắp tới" → `profile-bookings-tab`.
- `match-detail-player` (vai host) → nút `QUẢN LÝ KÈO` → Open overlay
  `match-manage-panel`.
- `match-manage-panel` → nút `Duyệt` → cập nhật badge trạng thái thành viên tương
  ứng trên `match-detail-player` (dùng **Smart animate** nếu muốn thấy chuyển động,
  hoặc chỉ cần Navigate to biến thể "đã duyệt" nếu không cần animate).
- `profile-wallet-tab` → nút `NẠP TIỀN (SePay)` → Open overlay
  `profile-wallet-topup-modal`.
- `ai-assistant-player` (tab Chat) → CTA trong câu trả lời AI (vd "Hủy booking
  này") → Navigate to `booking-cancel-flow` đúng booking được nhắc tới.

### 4. Kiểm tra cuối
Bấm ▶ Present, chọn flow bắt đầu là `home` guest, đi hết 1 vòng qua gate tới khi
vào được `home-player`; chạy lại từ `home-player`, xong hết vòng đời booking +
match + community + AI. Nếu chỗ nào bấm không phản ứng → thiếu connection, quay
lại tab Prototype gắn tiếp.
