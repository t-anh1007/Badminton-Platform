# SESSION HANDOFF — Badminton Community Booking Platform

> File này đóng gói toàn bộ context, quyết định thiết kế và việc cần làm tiếp từ phiên chat
> Claude.ai trước đó, để tiếp tục làm việc trong Claude Code.

---

## 1. Bối cảnh dự án

- **Tên đồ án:** Badminton Community Booking Microservices Platform (đồ án tốt nghiệp, nhóm 2 người)
- **Trường:** IUH
- **Repo local:** `D:\Khoaluantn`
- **Loại sản phẩm:** Web application (KHÔNG có app mobile native)
- **Kiến trúc:** Microservices — 7 services + API Gateway
  - PostgreSQL — schema-per-service
  - RabbitMQ — Outbox Pattern
  - Redis — slot-holding (giữ chỗ sân tạm thời)
  - Frontend: React 19
- **Mô hình sản phẩm:** Nền tảng đặt sân cầu lông (giống sàn TMĐT đặt dịch vụ) + cộng đồng
  người chơi (diễn đàn, tìm đối, xếp hạng)
- **Định hướng mở rộng tương lai (đã brainstorm, chưa làm ngay):** multi-tenant, matchmaking,
  escrow payment, AI service (Harness Engineering / Loop Engineering concepts)
- **Ràng buộc hạ tầng:** deploy trên hosting free-tier hoặc chi phí thấp → mọi quyết định UI/UX
  phải tính đến hiệu năng, tránh animation nặng.

---

## 2. Nghiên cứu tham khảo UI/UX (đã thực hiện trong phiên trước)

### 2.1 Tìm kiếm trên Awwwards
Đã khảo sát Awwwards để tìm mẫu UI social-community + booking + sports gần nhất.
**Kết quả tốt nhất tìm được:**

- **ACTL (actl.me)** — "Dubai's Private Tennis League"
  - Awwwards page: https://www.awwwards.com/sites/actl
  - Website thật: https://actl.me/
  - Lý do chọn: mô hình gần giống nhất — giải đấu thể thao tư nhân, có ranking, cộng đồng
    người chơi, quản lý trận đấu qua app/web. Tagline: "Play. Compete. Climb the Rankings."
  - **Đây là mẫu tham khảo chính thức được người dùng chốt chọn.**

- Các ứng viên khác đã xem qua nhưng KHÔNG chọn (không đủ khớp tiêu chí):
  - Farewell (Oregon Outdoor Alliance) — hoá ra là trang portfolio agency, không phải sản phẩm thật
  - JUAW ("Where Elite Performance Begins") — nền tảng huấn luyện thể thao, chưa xác minh kỹ,
    có thể xem lại nếu cần thêm 1 mẫu tham khảo nữa
  - The Immortals (Jason Jerez) — chủ đề World Cup/esports trophy, không liên quan booking/forum
  - heyclicky (Outpace Studios) — app AI buddy, không liên quan

### 2.2 Crawl chi tiết actl.me (đã thực hiện bằng browser tool)

**QUAN TRỌNG:** Toàn bộ phần hero của actl.me là cảnh **3D WebGL/Three.js** dựng sân tennis
thật với scroll-jacking animation (cuộn = camera xoay quanh sân 3D). Đây là phần **KHÔNG nên
copy** vì sẽ gây lag / tốn chi phí hosting cho dự án sinh viên free-tier.

**Dữ liệu thiết kế thật lấy được (từ CSS thực tế của site, KHÔNG phải đoán):**

| Token | Hex | Ghi chú |
|---|---|---|
| Navy | `#15446C` | Nền header/nav |
| Blue | `#105482` | Bề mặt phụ |
| Slate blue-grey | `#274162` | Card/block phụ |
| Court green (dark) | `#16301f` | Nền section tối |
| Lime accent | `#DCFF40` / `#E7FF4B` | Nút CTA, điểm nhấn |
| Text dark | `#171717` / `#0a0a0a` | Chữ trên nền sáng |
| Light bg | `#ededed` | Nền sáng |

- **Font:** Geist (sans-serif, heading đậm/uppercase) + Geist Mono (dành cho số liệu/ranking/tỉ số)
- **Sitemap thật của ACTL:** Home, About, Ranking, Tournaments, App, Gallery, Testimonials, Contact
- **Component pattern quan sát được:**
  - Nav bar: logo trái, nút CTA dạng pill màu lime ("Download App"), hamburger tròn có avatar nhỏ
  - Menu overlay full-screen: nền navy đặc, link chữ trắng cực lớn (40-48px), label phụ màu
    accent ("STAY CONNECTED", "DOWNLOAD OUR APP"), social icon viền tròn outline, app store badges

---

## 3. Quyết định thiết kế đã chốt (đã điều chỉnh cho phù hợp dự án)

- **Bỏ hoàn toàn:** animation 3D/WebGL/canvas, mọi thứ liên quan "Download App" / app store badge
  (vì dự án không có app mobile)
- **Đổi màu:** thay tông tennis (xanh sân + lime vàng-chanh) → tông **cầu lông**:
  - Nền tối chủ đạo: xanh lá đậm sân cầu lông `#1B4D2E` (thay cho `#16301f`)
  - Accent chính: vàng ngà/trắng lông vũ `#F5E663` (thay cho `#DCFF40`)
  - Accent phụ: trắng + viền đỏ nhẹ `#E63946` (mô phỏng đế quả cầu) — dùng cho badge "Live/Hot"
  - Giữ nguyên navy/blue/slate làm màu nền phụ/card
- **Giữ tinh thần:** thể thao cạnh tranh, bảng xếp hạng, typography đậm/uppercase — nhưng thể
  hiện qua MÀU SẮC + TYPOGRAPHY + BỐ CỤC, không qua animation nặng.
- **Ràng buộc kỹ thuật UI:** chỉ CSS transition/transform cơ bản, SVG icon, ảnh WebP nén,
  skeleton loading — không WebGL/video nền/scroll-jacking.

---

## 4. File DESIGN.md đã tạo (đã gửi cho người dùng)

Đã tạo và gửi 1 file `DESIGN.md` hoàn chỉnh gồm:
1. Product context
2. Bảng màu đầy đủ (token → hex → usage)
3. Typography scale (H1/H2/Body/Caption)
4. Component style cues (nav, menu overlay, hero, ranking/leaderboard, card)
5. Sitemap mapping từ ACTL → dự án (Home, Giới thiệu, Bảng xếp hạng, Sự kiện, Cộng đồng/Diễn đàn,
   Đánh giá, Liên hệ, **+ mới:** Đặt sân, Thông báo, Admin)
6. Danh sách 6 trang cần thiết kế: Trang chủ, Đặt sân, Cộng đồng/Diễn đàn, Hồ sơ & Xếp hạng,
   Thông báo, Quản trị
7. Ràng buộc hiệu năng (checklist ❌/✅)

**→ Nếu chưa có file này trong repo, cần lấy lại nội dung đầy đủ và lưu vào
`D:\Khoaluantn\docs\DESIGN.md` (hoặc đường dẫn tương đương).**

---

## 5. Cách dùng DESIGN.md với Google Stitch (công cụ AI thiết kế)

- Stitch (stitch.withgoogle.com) có 2 cách nhận DESIGN.md — **chỉ cần chọn 1 trong 2**,
  không cần làm cả hai:
  1. Copy nội dung text → paste vào ô "Dán tệp DESIGN.md hiện có"
  2. Hoặc kéo-thả file `.md` vào ô "Tải tệp DESIGN.md lên"
- Prompt bổ sung khi dùng Stitch: nhấn lại rằng đây là web app (không mobile app), cấm
  animation 3D/WebGL, ưu tiên tạo từng trang một (không dồn hết 1 lần).

---

## 6. VIỆC CHƯA HOÀN THÀNH — cần làm tiếp

### 6.1 Chưa xác định rõ: phạm vi "Giai đoạn 1" (MVP)
Người dùng được hỏi các luồng chính nào thuộc giai đoạn 1 (câu hỏi multi-select đã gửi:
Trang chủ+Đăng nhập / Đặt sân+giữ chỗ Redis+thanh toán / Hồ sơ+Lịch sử / Cộng đồng-Diễn đàn
cơ bản) nhưng **NGƯỜI DÙNG CHƯA TRẢ LỜI** — thay vào đó yêu cầu đọc trực tiếp repo
`D:\Khoaluantn` để tự xác định phạm vi.

**→ Việc cần làm khi tiếp tục trong Claude Code:**
1. Đọc trực tiếp repo tại `D:\Khoaluantn` (README, docs, task board, source code hiện có)
   để xác định chính xác phạm vi/tính năng của "Giai đoạn 1".
2. Đối chiếu với DESIGN.md ở trên để viết **prompt chi tiết cho Google Stitch** nhằm tạo
   trước các màn hình UI phục vụ giai đoạn 1 (theo đúng yêu cầu gốc của người dùng: "cho tôi
   câu prompt để tạo trước các màn hình phục vụ cho giai đoạn 1 của dự án").
3. Sau khi có DESIGN.md + phạm vi Giai đoạn 1 rõ ràng, có thể chuyển thiết kế Stitch trả về
   thành component React 19 thực tế trong repo.

### 6.2 Việc phụ (đã làm ở phiên trước, không liên quan trực tiếp UI)
- JS snippet autofill form BB15/QĐ20/QĐ24/BB17 trong Chrome DevTools Snippets (công việc hành
  chính riêng, không thuộc đồ án) — không cần mang sang context Claude Code trừ khi được hỏi lại.

---



---

*File này được tạo tự động từ phiên chat Claude.ai để chuyển tiếp context sang Claude Code.
Ngày tạo: 05/08/2026.*
