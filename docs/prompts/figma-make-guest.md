---
type: design-prompt
target: Figma Make (create-design)
role: Khách vãng lai (guest / chưa đăng nhập)
source-style: Badminton.fig (COURTIN) — rebrand thành Netmigo
updated: 2026-08-11
---

# Prompt Figma Make — Netmigo · Role Khách vãng lai

> Dán nguyên khối dưới đây vào Figma Make. Đã khoá style theo file `Badminton.fig`
> hiện có (navy `#15446C` + vàng `#F5E663` + nền giấy `#F7F7F5`, Archivo/Inter/Geist Mono).

---

## PROMPT

Bạn là designer dựng **prototype UI độ trung thực cao** trên Figma cho **Netmigo** —
nền tảng đặt sân cầu lông + ghép kèo + cộng đồng tại Việt Nam. Toàn bộ nội dung
**tiếng Việt**. Lần này chỉ dựng **role Khách vãng lai (chưa đăng nhập)**.

### 0. RÀNG BUỘC STYLE (bắt buộc, không được tự đổi)

Đây là phần mở rộng của một file thiết kế đã có. Bám đúng ngôn ngữ thị giác sau:

**Màu**
| Token | Hex | Dùng |
|---|---|---|
| `navy-900` | `#0F3352` | Hover/pressed của navy, footer |
| `navy-700` | `#15446C` | **Màu chủ đạo** — navbar, nút primary, heading khối, tab active |
| `navy-300` | `#8AA1B5` | Icon mờ, đường trục, text phụ trên nền navy |
| `navy-100` | `#C4D0DA` | Viền nhạt trên nền navy, skeleton trên navy |
| `accent-500` | `#F5E663` | **Vàng nhấn** — slot đang giữ, badge nổi bật, highlight hàng, gạch chân nhấn |
| `accent-200` | `#FAF2B1` | Nền chip vàng nhạt, nền dải cảnh báo mềm |
| `accent-50` | `#FEFDEA` | Nền block nhấn rất nhạt |
| `ink-900` | `#0B0B0B` | Text chính, heading (gần như đen tuyệt đối) |
| `ink-600` | `#4A4A47` | Text phụ |
| `ink-400` | `#8A8A85` | Caption, placeholder, meta |
| `line` | `#E2E2DF` | Viền, divider, khung ô lịch |
| `surface` | `#FFFFFF` | Card, modal, navbar phụ |
| `canvas` | `#F7F7F5` | Nền trang (giấy ngà, KHÔNG phải trắng tinh) |
| `canvas-alt` | `#ECECEA` | Nền section xen kẽ, skeleton |
| `success` | `#2E7D5B` | Slot sẵn sàng, trạng thái đã duyệt |
| `danger` | `#C6362F` | Lỗi, đã hủy, slot đã đặt (viền/nhãn) |
| `warning` | `#D98B0A` | Cảnh báo nhẹ, "sắp hết chỗ" |

**Chữ**
- Display / tiêu đề section: **Archivo ExtraBold hoặc Black**, **VIẾT HOA TOÀN BỘ**,
  letter-spacing `-0.01em` với cỡ lớn, `+0.04em` với nhãn nhỏ. Đây là nét nhận diện
  chính — mọi tiêu đề section đều IN HOA.
- UI / body / nút / form: **Inter** 400/500/600/700, sentence case.
- Mọi **con số** (giá, giờ, đếm ngược, mã đơn, rating, khoảng cách, số chỗ):
  **Geist Mono**.
- Scale: Display 44/700 · H1 30/800 hoa · H2 22/700 hoa · H3 17/600 · Body 15/400 ·
  Small 13/400 · Caption 11/600 hoa tracking `.06em`.

**Hình khối**
- Card `12px`, input `10px`, nút và filter **dạng pill `999px`**, badge `6px`,
  ô slot lịch `8px`, avatar tròn.
- Viền `1px solid line` ở hầu hết bề mặt; bóng rất nhẹ
  `0 1px 2px rgba(11,11,11,.05)`, hover `0 6px 18px rgba(11,11,11,.08)`.
- **Không** gradient nặng, không glassmorphism, không đổ bóng nhiều lớp, không 3D.

**Bố cục**
- Desktop frame `1440 × auto`, container `1200`, padding ngang `24`.
- Mobile frame `390 × auto`, padding ngang `16`.
- Spacing scale 4/8/12/16/24/32/48/64. Khoảng cách section 48 (desktop) / 32 (mobile).
- Navbar **nền `navy-700`**, cao 64, logo Netmigo bên trái (chữ **NETMIGO** Archivo
  Black + biểu tượng quả cầu lông đơn giản, tự vẽ SVG), menu giữa. **Phải, theo thứ
  tự trái→phải**: pill `Hợp tác chủ sân` (viền trắng mờ, chữ trắng, size nhỏ hơn 2
  nút kia — dẫn sang `partner-landing`) → `Đăng nhập` (ghost viền trắng) →
  `Đăng ký` (pill vàng `accent-500`, chữ `ink-900`). Mobile: gộp "Hợp tác chủ sân"
  vào menu sheet, chỉ giữ `Đăng ký` nổi trên thanh chính.
- Auto Layout cho **mọi** frame; dùng component + variant cho phần lặp lại.
- Đặt tên layer **kebab-case** theo chức năng: `navbar`, `hero-section`,
  `filter-bar`, `venue-grid`, `venue-card`, `sidebar`, `login-gate-card`…
  Đặt tên frame theo mẫu `guest-desktop-<page>` / `guest-mobile-<page>`.

**Ảnh**: dùng ảnh cầu lông thật (sân trong nhà, thảm xanh/xanh dương, người chơi
đang đánh, ánh sáng nhà thi đấu sáng rõ, 16:9). Avatar là headshot người Việt trẻ,
nền sân xanh. Không dùng logo/ảnh của thương hiệu khác.

### 1. NGUYÊN TẮC RIÊNG CỦA ROLE KHÁCH VÃNG LAI

Khách vãng lai **xem được mọi nội dung công khai, nhưng không thực hiện được bất kỳ
hành động nào có hệ quả**. Mọi CTA hành động phải dẫn tới **cổng đăng nhập
(login gate)**, thể hiện theo 3 mức:

1. **Gate mềm** — nút vẫn sáng, bấm vào mở `auth-modal`. Dùng cho: Đặt sân, Chọn
   slot, Tham gia kèo, Tạo kèo, Đăng bài, Bình luận, Báo cáo, Gửi ticket, Chat AI.
2. **Gate lớp phủ** — khối bị phủ mờ + khoá + dòng "Bạn phải đăng nhập để…" +
   nút `ĐĂNG NHẬP NGAY`. Dùng cho: composer cộng đồng, ô chat AI, rail "Báo cáo của
   tôi" / "Yêu cầu hỗ trợ".
3. **Gate thay thế khối** — thay hẳn khối cá nhân bằng `guest-prompt-card` (nền
   `accent-50`, viền `accent-500`, icon khoá, tiêu đề IN HOA + mô tả + nút primary).

Ngoài ra: navbar phải hiện **`Đăng nhập`** (ghost trắng viền) + **`Đăng ký`**
(pill vàng `accent-500`, chữ `ink-900`), **không** có avatar/dropdown tài khoản.
Không hiện: số dư, Passport, lịch sử booking, hồ sơ, trang quản trị.

### 2. DANH SÁCH MÀN HÌNH CẦN DỰNG

Mỗi mục dựng **1 frame desktop 1440 + 1 frame mobile 390**, trừ khi ghi rõ khác.
Xếp thành các hàng (section) trên canvas theo nhóm A→F, mỗi nhóm có nhãn tiêu đề lớn.

**A. Khung & vào cửa**
1. `home` — Hero split: trái là H1 IN HOA "ĐẶT SÂN CẦU LÔNG. TÌM KÈO. NÂNG TRÌNH."
   + mô tả + 2 nút (`Đặt sân ngay` navy primary, `Khám phá kèo` ghost viền) + thanh
   tìm nhanh (khu vực · ngày · khung giờ) dạng pill; phải là collage ảnh cầu lông.
   Sau đó: dải số liệu (số sân · số kèo hôm nay · số lông thủ, Geist Mono) →
   carousel **Sân nổi bật** → carousel **Kèo đang mở hôm nay** → carousel
   **"Bài viết nổi bật từ cộng đồng"** (H2 IN HOA + link "Xem cộng đồng" →
   `community-feed-guest`; 3–4 **post-card** rút gọn: avatar + tên tác giả, thời
   gian, nội dung cắt 2–3 dòng, ảnh 16:9 nếu có, hàng meta số bình luận/lượt xem
   dạng Geist Mono; badge nhỏ `HOT` nền `accent-500` chữ `ink-900` ở góc card cho
   bài có tương tác cao; click vào card hoặc nút bình luận/đăng bài → gate) →
   3 card tính năng (Đặt sân / Tìm kèo / Cộng đồng) → dải "Bạn là chủ sân?" nền
   navy + CTA vàng → FAQ accordion (≥5 câu: giữ chỗ 10 phút, thanh toán, hủy &
   hoàn tiền, ghép kèo, trình độ) → footer.
2. `footer` (component) — nền `navy-900`, 4 cột: giới thiệu Netmigo · Sản phẩm
   (Đặt sân, Tìm kèo, Cộng đồng, Trợ lý AI) · Hỗ trợ (Câu hỏi thường gặp, Liên hệ,
   Chính sách hủy & hoàn tiền) · Pháp lý (Điều khoản, Chính sách bảo mật) + icon
   mạng xã hội tròn viền. **Không** có badge tải app.
3. `auth-modal` — modal 2 nửa: nửa trái nền `navy-700` + minh hoạ cầu lông + bong
   bóng thoại tiếng Việt; nửa phải form có **toggle Đăng nhập | Đăng ký**.
   Dựng **3 biến thể**: (a) tab Đăng nhập (Email, Mật khẩu có nút hiện/ẩn, link
   "Quên mật khẩu?", nút `ĐĂNG NHẬP`), (b) tab Đăng ký (Tên hiển thị, Email, Mật
   khẩu + thanh đo độ mạnh, checkbox đồng ý điều khoản, nút `TẠO TÀI KHOẢN`),
   (c) trạng thái lỗi (banner đỏ nhạt + lỗi dưới field). Mobile: 1 cột, bỏ nửa minh hoạ.
4. `forgot-password` — nhập email → nút "Gửi liên kết"; kèm biến thể **đã gửi**
   (icon phong bì + hướng dẫn kiểm tra hộp thư).
5. `reset-password` — mật khẩu mới + xác nhận + đo độ mạnh; biến thể **token hết hạn**.
6. `verify-email` — 3 biến thể trên cùng frame: đang xác minh (spinner) / thành công
   (tick + CTA về trang chủ) / lỗi token + nút "Gửi lại email".

**B. Tìm sân & đặt sân (xem công khai, hành động bị gate)**
7. `venue-list` — thanh lọc sticky dạng pill (khu vực / "Gần tôi" · ô tìm theo tên
   sân · bán kính 5-10-20km · sắp xếp gần nhất/giá/đánh giá); tiêu đề
   "SÂN CẦU LÔNG TẠI {KHU VỰC}" + đếm `(N sân)` Geist Mono; lưới **venue-card**
   3 cột desktop / 1 cột mobile. VenueCard: ảnh 16:9, badge góc (`Nổi bật` vàng /
   `Còn slot` xanh), tên sân, chip đánh giá (nền `accent-200`, số Geist Mono),
   địa chỉ rút gọn + `~2.4 km`, dải giá `80k–140kđ/h`. Có phân trang.
8. `venue-list-map` — biến thể chia đôi: trái danh sách cuộn, phải bản đồ với pin
   giá; pin active bật popup card sân nhỏ. (Chỉ cần desktop + mobile dạng
   "danh sách ⇄ bản đồ" bằng segmented control.)
9. `venue-detail` — breadcrumb (Sân › Khu vực › Tên sân); H1 IN HOA tên sân + địa
   chỉ; carousel ảnh; hai cột: trái = danh sách sân con (tên + loại mặt sân), bảng
   giá theo khung giờ, tiện ích dạng tick, quy tắc đặt sân (bước 30 phút, tối thiểu
   1h), mô tả; phải = **sidebar sticky**: card CTA `ĐẶT SÂN NGAY` (bấm → auth-modal)
   + chia sẻ, card giờ hoạt động, card vị trí + bản đồ tĩnh + nút chỉ đường. Cuối
   trang: carousel "Kèo gần đây tại sân này". Mobile: 1 cột + thanh CTA cố định đáy.
10. `booking-grid-guest` — bảng lịch trống thời gian thực: thanh lọc pill (khu vực ·
    ngày · khung giờ · loại sân) + dải "Giá dao động"; lưới slot với trục giờ ngang
    (17:00→22:00) và các hàng Sân 1–4; ô slot có **3 trạng thái**: `sẵn sàng`
    (trắng viền `success`, hiện giá + nút "Chọn"), `đã đặt` (nền `canvas-alt`, chữ
    mờ "ĐÃ ĐẶT"), `đang có người giữ` (nền `accent-500`, "ĐANG GIỮ"). Có chú giải
    (legend) và nhãn "SƠ ĐỒ TRỰC TUYẾN (REAL-TIME)" + chấm nhấp nháy.
    **Đặc thù guest**: sidebar phải KHÔNG phải là giỏ giữ chỗ mà là
    `guest-prompt-card`: "ĐĂNG NHẬP ĐỂ GIỮ CHỖ — Netmigo giữ slot cho bạn 10 phút
    để thanh toán" + nút `ĐĂNG NHẬP / ĐĂNG KÝ`. Bấm bất kỳ ô "Chọn" → mở auth-modal.
    Mobile: lưới cuộn ngang + thanh đáy cố định "Đăng nhập để giữ chỗ".
11. `booking-login-gate-modal` — modal nhỏ xuất hiện khi guest bấm chọn slot: icon
    khoá + "CẦN ĐĂNG NHẬP ĐỂ GIỮ CHỖ" + tóm tắt slot đã chọn (Sân 1 · 19:00–20:00 ·
    120.000đ) + nút `Đăng nhập` primary / `Tạo tài khoản` ghost + dòng nhỏ
    "Slot sẽ được giữ ngay sau khi bạn đăng nhập".

**C. Kèo (matchmaking) — xem công khai**
12. `match-list` — trái: **sidebar bộ lọc** (Khu vực, Khung giờ, Trình độ theo 5 bậc
    `Mới chơi / Yếu / Trung Bình / Trung Bình+ / Bán Chuyên`, Loại kèo Đơn/Đôi,
    Trạng thái Đang mở/Sắp đủ/Đã đủ); giữa: tiêu đề "DANH SÁCH KÈO GIAO LƯU HÔM NAY"
    + danh sách **match-card** (tên sân + sân con, khung giờ, giá/người Geist Mono,
    chip trình độ, `3/4` chỗ dạng Geist Mono + thanh tiến độ, nút `Tham gia`);
    phải: khối "TÌM NHANH (REAL-TIME)" gợi ý 3 kèo + dòng "Tự động cập nhật 5s trước".
    Nút `Tạo kèo mới` trên đầu → gate. Mobile: bộ lọc thành bottom sheet, danh sách 1 cột.
13. `match-detail` — H1 IN HOA tên sân/sân con, địa chỉ, chip trình độ; lưới 4 ô
    thông tin (NGÀY ĐẤU · THỜI GIAN · CHI PHÍ DỰ KIẾN · SỐ LƯỢNG TRỐNG, số Geist
    Mono); danh sách thành viên (avatar + tên + vai trò Chủ kèo/Thành viên + badge
    Đã xác nhận / Đã duyệt / Chờ duyệt); khối "LƯU Ý TỪ HOST" (trích dẫn nền
    `accent-50`); khối "THÔNG TIN SÂN & QUY ĐỊNH" gạch đầu dòng.
    **Đặc thù guest**: nút chính là `ĐĂNG NHẬP ĐỂ THAM GIA KÈO`; danh sách thành
    viên **ẩn họ tên đầy đủ** (hiện "Nam P.", "Hùng N.") + dòng nhỏ
    "Đăng nhập để xem đầy đủ thông tin thành viên".
14. `match-create-gate` — trang/modal khi guest bấm "Tạo kèo mới": mô tả 3 bước tạo
    kèo (Chọn sân & giờ → Đặt tiêu chí trình độ → Công bố & chia phí) + CTA đăng ký.

**D. Cộng đồng — chỉ đọc**
15. `community-feed-guest` — 3 cột: trái là điều hướng (Bảng tin, Câu hỏi thường gặp,
    Liên hệ); giữa là feed — **composer bị phủ mờ** với dòng "Bạn phải đăng nhập để
    đăng bài và tương tác" + nút `ĐĂNG NHẬP NGAY`; các **post-card** (avatar, tên +
    thời gian, nội dung, ảnh 16:9 nếu có, hàng hành động Bình luận / Báo cáo ở
    trạng thái **mờ disabled**, dòng "Xem tất cả 5 bình luận…"); phải là
    `guest-prompt-card` thay cho rail "Báo cáo của tôi / Yêu cầu hỗ trợ":
    "ĐĂNG NHẬP THÀNH VIÊN — Đăng nhập để theo dõi báo cáo, vé hỗ trợ và tương tác
    cùng cộng đồng lông thủ Netmigo" + nút lớn.
    Kèm 1 post ở trạng thái **đã bị gỡ** (khối xám, chữ nghiêng "Bài viết đã bị gỡ
    theo kiểm duyệt cộng đồng").
16. `community-post-detail-guest` — 1 bài viết đầy đủ + danh sách bình luận dạng
    bong bóng; ô nhập bình luận **bị khoá** + CTA đăng nhập.
17. `community-mobile-guest` — 1 cột, tab trên cùng `Bảng Tin` | `Hỗ Trợ & Báo Cáo`;
    tab thứ hai hiện toàn bộ là `guest-prompt-card`.

**E. AI, trang tĩnh, lỗi**
18. `ai-assistant-guest` — giới thiệu 2 năng lực (Gợi ý kèo phù hợp có giải thích ·
    Hỏi đáp chính sách đặt sân/hủy/hoàn tiền); hiện **1 đoạn hội thoại mẫu đọc-only**
    (bong bóng hỏi của người dùng + trả lời của Netmigo AI có phần "Vì sao gợi ý
    này"); ô nhập chat bị phủ mờ + khoá + CTA đăng nhập; dòng miễn trừ
    "AI chỉ hỗ trợ và giải thích, không tự thực hiện đặt sân hay thanh toán."
19. `partner-landing` — trang "HỢP TÁC CHỦ SÂN": hero navy + CTA vàng, 3 lợi ích,
    bảng 4 bước đăng ký, form đăng ký quan tâm (Tên cơ sở, Khu vực, Số sân, Liên hệ),
    FAQ chủ sân.
20. `static-pages` — **một frame desktop + một frame mobile chứa 5 trang tĩnh dạng
    tab hoặc xếp cạnh nhau**: Về Netmigo · Liên hệ (form + bản đồ + thông tin) ·
    Điều khoản sử dụng · Chính sách hủy & hoàn tiền (có bảng mốc thời gian hoàn) ·
    Chính sách bảo mật. Bố cục nội dung dài: cột trái mục lục sticky, phải nội dung.
21. `faq-page` — accordion nhóm theo chủ đề (Đặt sân · Thanh toán & hoàn tiền · Kèo ·
    Tài khoản · Cộng đồng), có ô tìm kiếm câu hỏi.
22. `search-results` — kết quả tìm kiếm toàn cục gộp: nhóm Sân · nhóm Kèo · nhóm Bài
    viết, mỗi nhóm có nút "Xem tất cả".
23. `error-pages` — **1 frame desktop + 1 mobile chứa 4 trạng thái cạnh nhau**:
    `404` không tìm thấy trang, `403` không có quyền truy cập, `500` lỗi máy chủ,
    `offline` mất kết nối. Mỗi cái: minh hoạ line-art quả cầu/vợt, mã lỗi Geist Mono
    cỡ lớn, tiêu đề IN HOA, mô tả, nút `Về trang chủ` + `Thử lại`.

**F. Bộ trạng thái & thư viện (mỗi mục 1 frame lớn, không cần bản mobile)**
24. `guest-ui-states` — dựng cạnh nhau, mỗi cái có nhãn IN HOA:
    - Skeleton: lưới sân (6 card) · danh sách kèo (3 card) · lưới slot lịch.
    - Empty: "Không có sân trong bán kính này" · "Không có kèo phù hợp" ·
      "Chưa có bài viết nào" · "Không tìm thấy kết quả".
    - Error banner: "Mất kết nối máy chủ — Vui lòng kiểm tra đường truyền" + `Thử lại`.
    - Toast: success / error / info (góc trên phải, viền trái theo ngữ nghĩa).
    - Login gate: bản modal nhỏ · bản lớp phủ mờ · bản `guest-prompt-card`.
    - Banner cookie/quyền vị trí: "Netmigo cần vị trí để tìm sân gần bạn"
      + `Cho phép` / `Nhập khu vực thủ công`.
25. `guest-components` — thư viện component có đủ variant + trạng thái
    `default / hover / active / focus / disabled / loading`:
    Button (primary navy · accent vàng · ghost viền · danger · 3 cỡ) · Input/Select/
    Textarea · Pill filter · Chip trình độ (5 bậc) · Badge trạng thái · Tabs ·
    Segmented control · Card · VenueCard · MatchCard · PostCard · Slot cell (3 trạng
    thái) · Avatar (+ nhóm chồng) · Pagination · Carousel arrows · Accordion row ·
    Breadcrumb · Toast · Modal shell · Skeleton block · EmptyState · Navbar guest
    (desktop + mobile mở menu) · Footer.
26. `guest-flow-map` — sơ đồ luồng đơn giản bằng frame + mũi tên nối, thể hiện:
    Home → Venue list → Venue detail → Booking grid → **login gate** → Auth modal;
    Home → Match list → Match detail → **login gate**; Home → Community → **login gate**.

### 3. NỘI DUNG MẪU (dùng nhất quán khắp các màn)

- Sân: **Sân Cầu Lông Thống Nhất — Quận 10** (138 Đ. Đào Duy Từ, Phường 6, Quận 10),
  **Sân Cầu Lông Kỳ Hòa — Quận 10**, **Sân Viettel — Quận 10**, **Sân Lãnh Binh
  Thăng — Quận 11**. Sân con: Sân 1–4, mặt thảm Yonex / thảm cao cấp.
- Giá: `80.000đ` – `140.000đ`/giờ; phí kèo `60.000đ` – `90.000đ`/người.
- Ngày: `Hôm nay, 20/03/2026`; khung giờ `17:00 – 22:00`.
- Mã đơn: `NM-2026-0891` (Geist Mono).
- Tên người dùng: Phạm Hoàng Nam, Nguyễn Văn Hùng, Trần Minh Tâm, Lê Thanh Thảo.
- Đếm ngược giữ chỗ luôn hiển thị dạng `10:00` Geist Mono.
- Trình độ luôn dùng đúng 5 nhãn: Mới chơi · Yếu · Trung Bình · Trung Bình+ · Bán Chuyên.

### 4. YÊU CẦU KỸ THUẬT KHI DỰNG

- Mọi frame dùng **Auto Layout**, có thể co giãn; không đặt phần tử tuyệt đối trừ
  badge góc và pin bản đồ.
- Tạo **Local variables** cho toàn bộ token màu và cỡ chữ ở mục 0, đặt tên đúng như
  bảng (`navy-700`, `accent-500`, `ink-900`…), và **áp dụng bằng variable**, không
  hardcode hex trong từng layer.
- Tạo **Components** cho mọi phần tử lặp lại, đặt trong page riêng tên `Components`;
  các màn hình đặt trong page `Guest — Desktop` và `Guest — Mobile`.
- Nối **prototype links** theo `guest-flow-map`, mọi CTA hành động trỏ về `auth-modal`.
- Kiểm tra tương phản: chữ trên nền `navy-700` phải trắng; chữ trên `accent-500`
  phải là `ink-900` (không bao giờ dùng chữ trắng trên vàng).
- Không dùng emoji làm icon UI; dùng icon line đồng bộ (lucide-style): calendar,
  clock, map-pin, star, sliders-horizontal, chevron, lock, shield-alert, flag,
  message-circle, user, upload-cloud.

Bắt đầu bằng nhóm A, dựng lần lượt A → F.

---
