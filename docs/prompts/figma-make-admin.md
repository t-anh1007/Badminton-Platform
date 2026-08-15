---
type: design-prompt
target: Figma Make (create-design)
role: Admin (vận hành + kiểm duyệt + hỗ trợ, gộp 1 quyền duy nhất)
source-style: Badminton.fig (COURTIN) — rebrand thành Netmigo
grounded-in: apps/web/src/pages/AdminPage.tsx + FinanceAdminPanel/DisputeAdminPanel/CommunityAdminPanel (mã thật đã có)
updated: 2026-08-11
---

# Prompt Figma Make — Netmigo · Role Admin

> Cùng hệ token với 3 prompt trước (guest/player/provider). Dựng **sau cùng**, sau
> khi đã có 3 role kia trong cùng file Figma để tái dùng component. Khác các role
> trước: role này **có sẵn code thật** (`apps/web/src/pages/AdminPage.tsx` và các
> panel con) — prompt dưới bám sát đúng field/hành vi đã code, không suy đoán.

---

## PROMPT

Bạn là designer dựng **prototype UI độ trung thực cao** trên Figma cho **Netmigo** —
nền tảng đặt sân cầu lông + ghép kèo + cộng đồng tại Việt Nam. Toàn bộ nội dung
**tiếng Việt**. Lần này dựng **role Admin** — quyền vận hành duy nhất của nền tảng
(gộp quản trị + kiểm duyệt + hỗ trợ tài chính vào **1 tài khoản, không phân quyền
phụ**), dạng dashboard nội bộ.

### 0. RÀNG BUỘC STYLE (giữ nguyên từ 3 prototype trước)

**Màu**: `navy-900 #0F3352` · `navy-700 #15446C` (chủ đạo) · `navy-300 #8AA1B5` ·
`navy-100 #C4D0DA` · `accent-500 #F5E663` (vàng nhấn) · `accent-200 #FAF2B1` ·
`accent-50 #FEFDEA` · `ink-900 #0B0B0B` · `ink-600 #4A4A47` · `ink-400 #8A8A85` ·
`line #E2E2DF` · `surface #FFFFFF` · `canvas #F7F7F5` · `canvas-alt #ECECEA` ·
`success #2E7D5B` · `danger #C6362F` · `warning #D98B0A`.

**Chữ**: tiêu đề section **Archivo ExtraBold/Black IN HOA**; UI/body **Inter**; mọi
con số (tiền, %, mã, thời hạn) → **Geist Mono**. Scale: Display 44/700 · H1 30/800
hoa · H2 22/700 hoa · H3 17/600 · Body 15/400 · Small 13/400 · Caption 11/600 hoa
tracking `.06em`.

**Hình khối**: card `12px`, input `10px`, nút/filter pill `999px`, badge `6px`.
Viền `1px line`, bóng rest nhẹ. Không gradient nặng/glass/3D.

**Layout dashboard** (giống Provider — sidebar trái + content phải, KHÔNG phải
navbar-top công khai): sidebar nền `navy-900`, rộng `260px`, thu gọn `72px`. Bảng
dữ liệu là thành phần chính — header `canvas-alt`, hover `accent-50`, action cột
cuối. Auto Layout mọi frame; layer kebab-case; frame `admin-desktop-<page>` /
`admin-mobile-<page>`.

### 1. NGUYÊN TẮC RIÊNG CỦA ROLE ADMIN (bám sát mã thật, không suy đoán)

- **Chỉ 1 quyền Admin duy nhất** (bất biến hệ thống #7) — dashboard **không có**
  màn quản lý role/phân quyền, không có "mời thêm admin", không có cấp bậc admin.
- **Mọi hành động có hệ quả đều theo đúng 1 khuôn UX 2 lớp**, lặp lại y hệt ở tất
  cả các mục (Duyệt NCC, Rút tiền, Đối soát, Tranh chấp, Kiểm duyệt, Khóa tài
  khoản) — **dựng đúng khuôn này ở mọi màn, không tự sáng tạo pattern khác**:
  1. **Ô nhập "Lý do"** (bắt buộc) nằm ngay trong màn/card của hàng cần xử lý —
     nút hành động **không submit trực tiếp**; nếu lý do trống, hiện dòng cảnh báo
     nhỏ màu `warning` "Nhập lý do trước khi xác nhận" và dừng lại.
  2. **Modal xác nhận riêng** bật lên sau khi có lý do hợp lệ — tiêu đề "Xác nhận
     thao tác không thể đảo ngược" (tài chính) hoặc "Xác nhận quyết định..." (kiểm
     duyệt/tranh chấp), nhắc lại tên hành động + lý do đã nhập (in đậm), 1 nút
     `Xác nhận` màu `danger`.
  3. Sau xác nhận → toast xanh "Đã xử lý và ghi audit." (đúng nguyên văn) + danh
     sách tự tải lại, dòng vừa xử lý biến mất khỏi hàng chờ hoặc đổi badge trạng
     thái.
- **Rỗng hàng chờ** luôn dùng đúng câu đã có trong code: EmptyState tiêu đề
  "Không có mục chờ xử lý" + mô tả theo ngữ cảnh từng mục (vd "Nhà cung cấp gửi
  yêu cầu sẽ xuất hiện tại đây.", "Báo cáo mới sẽ xuất hiện tại hàng chờ này.").
- **Tiền luôn định dạng** `X.XXX.XXXđ` Geist Mono, không khoảng trắng trước `đ`.

### 2. DANH SÁCH MÀN HÌNH CẦN DỰNG

Mỗi mục: 1 frame desktop 1440 + 1 frame mobile 390, trừ khi ghi khác. Nhóm A→H.

**A. Khung dashboard**
1. `admin-sidebar` (component) — logo Netmigo thu nhỏ; menu 6 mục đúng thứ tự tab
   thật: **Tổng quan** · **Duyệt NCC** · **Rút tiền** · **Đối soát** · **Tranh
   chấp** · **Kiểm duyệt** · **Tài khoản người dùng**; dưới cùng chip "Khu vực vận
   hành" (đúng nguyên văn caption trong code) + tên admin đang đăng nhập.
2. `admin-topbar` (component) — breadcrumb trang hiện tại + chuông thông báo +
   avatar (không có dropdown "chuyển chế độ" như Player/Provider — Admin là tài
   khoản riêng biệt, không kiêm vai người chơi).
3. `admin-dashboard-overview` — H1 "Quản trị" + dòng mô tả (đúng nguyên văn) "Các
   hàng chờ tác nghiệp được lấy từ service nghiệp vụ hiện có."; 5 stat card Geist
   Mono: **NCC chờ duyệt** · **Rút tiền chờ xử lý** · **Sự kiện chưa đối soát** ·
   **Tranh chấp đang mở** · **Báo cáo chờ kiểm duyệt** — mỗi card click dẫn sang
   đúng tab tương ứng.

**B. Duyệt nhà cung cấp**
4. `provider-approval-queue` — bảng cột: **ID** (Geist Mono, rút gọn), **Nhà cung
   cấp** (orgName), **Trạng thái** (Badge: `approved` xanh · `pending` vàng ·
   `rejected` đỏ · khác xám), **Hành động** (2 nút cùng hàng: `Duyệt` primary nhỏ,
   `Từ chối` viền đỏ nhỏ). Duyệt → xác nhận nhanh (không cần lý do, đúng code hiện
   tại chỉ gọi thẳng API); Từ chối → mở modal **"Từ chối nhà cung cấp"** với dòng
   "Nêu lý do để lưu cùng quyết định cho {tên NCC}." + textarea Lý do (bắt buộc) +
   nút `Xác nhận từ chối` màu đỏ.
5. `provider-reject-modal` (component, biến thể của modal chuẩn) — đúng như trên.

**C. Rút tiền**
6. `withdrawals-queue` — dòng mô tả "Từ chối bắt buộc có lý do; yêu cầu đã payout
   không thể hoàn tác."; 1 ô Lý do xử lý tiền dùng chung phía trên danh sách; mỗi
   card yêu cầu rút: **mã chuyển** `transferCode` (Geist Mono) · số tiền · badge
   trạng thái (`pending` vàng/`paid` xanh/`rejected` đỏ/`partially_paid` cam) +
   dòng ngân hàng (`bankCode` · `bankAccountNumber` · `bankAccountName`). Card
   `pending` → nút `Từ chối` (đỏ). Card `partially_paid` → nút `Chốt mức đã chi`
   (đỏ) + hiện `paidAmount` đã chuyển.
7. `withdrawal-confirm-modal` — tiêu đề "Xác nhận thao tác không thể đảo ngược" +
   tên hành động + lý do in đậm + nút `Xác nhận`.

**D. Đối soát (SePay reconciliation)**
8. `reconciliation-queue` — dòng mô tả "Hàng chờ đối soát — mọi đồng tiền phải có
   đối ứng."; 2 ô input dùng chung: **Đối tượng gán** (placeholder "User ID hoặc
   Withdrawal ID") + **Lý do đối soát**; mỗi card sự kiện SePay: badge hướng
   (`Tiền vào` xanh / `Tiền ra` xanh dương) + số tiền Geist Mono + `rawRef` (mã
   tham chiếu thô ngân hàng). Card **Tiền vào** → nút `Gán ví cá nhân`. Card
   **Tiền ra** → nút `Gán yêu cầu rút`. Mọi card đều có thêm nút đỏ
   `Ngoài phạm vi`.
9. `reconciliation-confirm-modal` — cùng khuôn xác nhận.

**E. Tranh chấp**
10. `disputes-queue` — dòng mô tả "Mọi quyết định cần lý do và xác nhận; hoàn tiền
    luôn đảo đủ ba vế."; mỗi dòng tranh chấp là 1 card lớn: mã `bookingId` +
    trạng thái + **hạn xử lý** `deadlineAt` (Geist Mono, đổi màu `danger` khi gần
    hạn — liên hệ cửa sổ khiếu nại 24h); lý do khách gửi; nếu có, dòng doanh thu
    booking ("Booking: gộp X · ròng Y · hoa hồng Z" — 3 số Geist Mono); danh sách
    **bằng chứng** (evidence, list link/ảnh thu nhỏ); khối gập **"Lịch sử bút
    toán"** (`<details>`) liệt kê từng ledger entry (loại, ví, số tiền, before →
    after). Nếu `status = open`: 2 ô input (**Số tiền hoàn một phần**, **Lý do
    bắt buộc**) + 3 nút cùng hàng: `Hoàn toàn bộ` (primary) · `Hoàn một phần`
    (secondary) · `Bác tranh chấp` (đỏ). Nếu đã xử lý: dòng "Đã hoàn {số tiền}".
11. `dispute-confirm-modal` — modal "Xác nhận quyết định tranh chấp" + tên quyết
    định (Hoàn toàn bộ/Hoàn một phần/Bác tranh chấp) + lý do in đậm + `Xác nhận`.

**F. Kiểm duyệt cộng đồng** *(giữ đúng phong cách màn Admin trong file `.fig` gốc,
chỉ đổi màu/chữ sang token Netmigo — nội dung mẫu bên dưới lấy lại gần nguyên văn)*
12. `moderation-reports-table` — H2 "Báo cáo nội dung" + mô tả "Ẩn, gỡ hoặc bác
    báo cáo đều cần lý do và xác nhận."; 1 ô Lý do quyết định dùng chung; bảng/list
    card mỗi báo cáo: badge trạng thái (`open` vàng) + badge loại đối tượng
    (`targetType`: bài viết/bình luận); nội dung vi phạm trích dẫn; dòng
    "Target {targetId} · {thời gian}"; 3 nút: `Bác báo cáo` (secondary) ·
    `Ẩn tạm` (primary) · `Gỡ nội dung` (đỏ).
13. `moderation-confirm-modal` — "Xác nhận quyết định kiểm duyệt" + "Hành động
    **{hide/remove/dismiss}** sẽ áp dụng cho {targetType} {targetId}. Lý do:
    **{lý do}**" + `Xác nhận`.
14. `moderation-audit-log` — bảng **"NHẬT KÝ HOẠT ĐỘNG KIỂM DUYỆT"** (nhãn IN HOA
    như bản gốc): cột Admin thực hiện · Hành động (Gỡ bài viết/Bác báo cáo) · Mô
    tả ngắn · Thời gian. Chỉ xem, không thao tác.

**G. Quản lý tài khoản người dùng** *(ACC-08 — có sẵn API `lockAccount`/
`unlockAccount`, chưa có tab trong `AdminPage.tsx` — dựng để hoàn thiện UI, đánh
dấu rõ đây là phần UI đi trước code)*
15. `accounts-management` — ô tìm kiếm user (email/tên); bảng: tên hiển thị,
    email, trạng thái (badge `active` xanh / `locked` đỏ), nút `Khóa tài khoản`
    (đỏ, chỉ hiện nếu active) / `Khôi phục` (xanh, chỉ hiện nếu locked).
16. `account-lock-modal` — textarea Lý do (bắt buộc) + 2 dòng cảnh báo tĩnh màu
    `warning`: "Không thể khóa chính tài khoản đang đăng nhập." và "Sẽ thu hồi
    toàn bộ phiên đăng nhập của tài khoản này ngay lập tức." + nút
    `Xác nhận khóa` đỏ.
17. `account-unlock-modal` — cùng khuôn, textarea Lý do + nút `Xác nhận khôi
    phục` xanh.

**H. Bộ trạng thái & thư viện**
18. `admin-ui-states` — cạnh nhau, nhãn IN HOA: EmptyState đúng 5 câu theo từng
    tab ("Không có mục chờ xử lý" + mô tả riêng mỗi mục) · Skeleton bảng · Toast
    "Đã xử lý và ghi audit." (success) và toast lỗi (đỏ) · trạng thái nút disabled
    khi lý do trống.
19. `admin-components` — Sidebar nav item · StatCard (clickable) · DataTable/Card
    list (header/row/hover/empty) · Badge trạng thái (provider/withdrawal/report/
    dispute — mỗi bộ badge màu riêng theo enum thật) · Reason input (kèm trạng
    thái lỗi "chưa nhập") · Confirm modal (2 biến thể: đỏ cho tài chính/khóa, cho
    kiểm duyệt) · Toast.
20. `admin-flow-map` — sơ đồ: `admin-dashboard-overview` → 6 tab; mỗi tab →
    (nhập lý do) → confirm modal → toast → quay lại queue đã cập nhật.

### 3. NỘI DUNG MẪU (khớp field thật trong code, không bịa field mới)

- Admin đăng nhập mẫu: **Admin_01**.
- Provider chờ duyệt mẫu: `PRV-7f2a` — **Sân Cầu Lông Kỳ Hòa**, trạng thái
  `pending`.
- Yêu cầu rút mẫu: mã chuyển `WD-2026-0034`, `12.300.000đ`, ngân hàng
  Vietcombank · STK `0071000123456` · chủ TK NGUYEN MINH ANH.
- Sự kiện đối soát mẫu: Tiền vào `500.000đ`, rawRef
  `FT26081112345678 NAPTIEN MINHANH`.
- Tranh chấp mẫu: booking `NM-2026-0891`, hạn xử lý còn `06:14:22` (Geist Mono,
  màu `danger` vì <24h), lý do "Sân bị đóng đột xuất nhưng không báo trước", gộp
  `120.000đ` · ròng `108.000đ` · hoa hồng `12.000đ`.
- Báo cáo kiểm duyệt mẫu (gần với nội dung gốc `.fig`): "Bán bớt vợt cũ, giày cũ
  rác rưởi giá rẻ bèo..." — người báo Hoàng Kiên — lý do "Từ ngữ tục tĩu" —
  `10:15 - 20/03/2026`.
- Audit log mẫu: **Admin_Pro** — Gỡ bài viết — "Gỡ bài của Minh_Heo vi phạm spam
  đường dẫn ngoài hệ thống" — `20/03 - 10:30`; **Admin_Coaches** — Bác báo cáo —
  "Bác báo cáo bài viết của 'Lông Thủ Q1' vì không vi phạm từ ngữ" — `20/03 - 09:15`.

### 4. YÊU CẦU KỸ THUẬT

- Dùng lại **Local variables** và component đã tạo ở 3 role trước; component mới
  (StatCard clickable, Reason input, Confirm modal 2 tông) đặt trong page
  `Components`. Màn hình mới đặt trong page `Admin — Desktop` và `Admin — Mobile`.
- Vì đây là dashboard nội bộ dữ liệu dày và có hệ quả tài chính thật, **rõ ràng
  luôn ưu tiên hơn thẩm mỹ**: mọi nút xoá/từ chối/khóa dùng `danger`, không dùng
  màu trung tính cho hành động phá huỷ.
- Nối prototype theo `admin-flow-map`. Không nối gì sang site công khai/player/
  provider — Admin là khu vực cô lập, chỉ có 1 cách vào (đăng nhập trực tiếp bằng
  tài khoản có role admin, ngoài phạm vi prototype vì không có UI đăng nhập admin
  riêng — dùng chung `auth-modal` đã dựng ở role Khách vãng lai làm điểm giả lập).
- Mobile: sidebar → bottom nav rút gọn 4 icon (Tổng quan/Duyệt & Kiểm duyệt/Tài
  chính/Tài khoản, gộp các mục ít dùng vào "Thêm"); mọi bảng → list card xếp dọc.

Bắt đầu bằng nhóm A, dựng lần lượt A → H.

---

## Ghi chú cho PO

- Khác 3 prompt trước, role này **có mã thật đã chạy** (`apps/web/src/pages/
  AdminPage.tsx`, `FinanceAdminPanel.tsx`, `DisputeAdminPanel.tsx`,
  `CommunityAdminPanel.tsx`) — prompt bám sát field, enum, câu chữ tiếng Việt
  (toast, EmptyState) đã có trong code thật, không phải suy đoán như Provider.
- Riêng nhóm **G. Quản lý tài khoản người dùng**: API `lockAccount`/
  `unlockAccount` đã có ở `services/account-service` nhưng **chưa có tab tương
  ứng** trong `AdminPage.tsx` hiện tại (`AdminPage.tsx` mới có 5 tab: Duyệt NCC,
  Rút tiền, Đối soát, Tranh chấp, Kiểm duyệt). Prototype đi trước ở đây — nếu chốt
  dựng thật, cần thêm tab thứ 6 vào `AdminPage.tsx` khi code.
- Cùng lưu ý màu sắc như 3 prompt trước: token theo `.fig` gốc (navy/vàng), lệch
  `docs/design/design-system.md` — cần PO chốt một nguồn trước khi code UI thật
  (ở đây ít áp lực hơn vì Admin là dashboard nội bộ, ít nhạy cảm thương hiệu hơn
  trang công khai).
