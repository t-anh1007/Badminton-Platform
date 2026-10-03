# Tóm tắt luồng nghiệp vụ chính — ai làm gì, hệ thống xử lý ra sao

> Bản nhớ nhanh. Nguồn chi tiết: `docs/product/specs/*`, `docs/product/decision-log.md`.
> Bỏ qua đăng ký/đăng nhập/hồ sơ.
>
> Nhãn bước: 🧑 **Người chơi** · 🏟️ **Chủ sân** · 🛡️ **Admin** · ⚙️ **Hệ thống** · 🏦 **SePay (ngân hàng)**
> `🔗` = điểm nối sang luồng khác.

---

## 0. Nền tảng tiền — phải hiểu trước

**Mỗi người có ví trong hệ thống:**

| Ví | Của ai | Tiền vào từ | Ngăn bên trong |
|---|---|---|---|
| Cá nhân | Mọi người chơi | Nạp, hoàn tiền, tiền thắng kèo | `khả dụng` · trong đó phần `rút được` · `đang chờ rút` |
| Kinh doanh | Chủ sân | Doanh thu booking (đã trừ 10%) | `chờ` → `khả dụng` → `đang chờ rút` |
| Nền tảng | Hệ thống | Hoa hồng 10% | — |

**Quy tắc hệ thống luôn giữ:**
- Sổ cái **chỉ ghi thêm**, không sửa/xóa. Sai thì ghi bút toán bù.
- Số dư **không bao giờ âm**. Không chuyển tiền trực tiếp giữa người dùng.
- **Hoàn tiền luôn vào ví cá nhân**, không trả ngược ra ngân hàng (SePay không có API hoàn).
- **Hoàn = đảo 3 vế cùng lúc**: ví cá nhân người chơi **+**, ví kinh doanh chủ sân **−** (90%), ví nền tảng **−** (10%).
- **Tiền nạp chủ động không rút được.** Chỉ tiền hoàn / tiền thắng kèo / tiền dư mới vào phần `rút được`.
  Khi thanh toán, hệ thống trừ phần **không rút được trước**.
- Mọi thao tác tiền của Admin **bắt buộc lý do** và được ghi vết.

**Con số cần nhớ:** giữ chỗ **10 phút** · hoa hồng **10%** · hủy sân **≥24h: 100% / 6–24h: 50% / <6h: 0%** ·
tiền chủ sân về khả dụng sau **24h** kể từ khi ca kết thúc · rút tối thiểu **10.000đ** · khai kết quả kèo **12h + 12h**.

---

## 1. Chuỗi ĐẶT SÂN (🧑 ↔ ⚙️ ↔ 🏟️)

1. 🏟️ Sân phải **đủ điều kiện hiển thị**: chủ sân đã được duyệt (🔗 chuỗi 8) + có sân con hoạt động + có giờ mở + có giá.
2. 🧑 Tìm sân (danh sách/bản đồ) → xem lịch trống, giá, **bản đồ nhiệt giờ đông/vắng** → chọn sân con + giờ.
3. ⚙️ Kiểm tra trùng lịch cá nhân → nếu trùng thì **cảnh báo, hỏi xác nhận** (không chặn, vì có thể đặt hộ).
4. ⚙️ Tạo **giữ chỗ 10 phút**, khóa slot (CSDL chặn hai booking trùng giờ). Chụp lại **giá + chính sách hủy** tại thời điểm này.
5. 🧑 Thanh toán:
   - **Bằng ví** → ⚙️ trừ ví ngay.
   - **Chuyển khoản VietQR** → 🏦 gửi webhook "tiền vào" → ⚙️ khớp mã nội dung.
6. ⚙️ Tiền về **trong 10 phút** → booking `Đã xác nhận`, đồng thời:
   - ghi **90% vào ngăn `chờ`** ví kinh doanh 🏟️,
   - ghi **10% vào ví nền tảng**,
   - 🏟️ thấy booking trên lịch sân.
7. ⚙️ **Tiền về sau 10 phút** → booking **không được khôi phục**, toàn bộ tiền **cộng vào ví cá nhân** 🧑 (tự đặt lại).
8. ⚙️ Hết 10 phút không trả → tự nhả slot, slot bán lại được.
9. Ca kết thúc → booking `Hoàn thành` → 🔗 chuỗi 4 (24h tranh chấp rồi tiền về chủ sân).

---

## 2. Chuỗi HỦY SÂN & HOÀN TIỀN (🧑 / 🏟️ → ⚙️ → 🧑)

| Ai hủy | Hệ thống hoàn bao nhiêu |
|---|---|
| 🧑 Người chơi tự hủy | Theo chính sách **đã chụp lúc đặt**: ≥24h → 100% · 6–24h → 50% · <6h → 0% |
| 🏟️ Chủ sân hủy / lỗi nền tảng | **Luôn 100%**, bất kể thời điểm |
| 🏟️ Chủ sân **ngừng hoạt động** (ngừng dần / đóng từ ngày X / khẩn cấp) | ⚙️ Tự hủy **từng booking bị ảnh hưởng** + hoàn 100%, chủ sân không phải hủy tay |

**Hệ thống xử lý một khoản hoàn:**
1. ⚙️ Booking → `Đã hủy`, slot được nhả để bán lại.
2. ⚙️ Đảo 3 vế: ví cá nhân 🧑 **+ phần hoàn**; ngăn `chờ` của 🏟️ **− 90% phần hoàn**; ví nền tảng **− 10% phần hoàn**.
3. ⚙️ Tiền hoàn vào **phần `rút được`** của ví cá nhân → 🧑 dùng tiếp hoặc 🔗 rút (chuỗi 5).
4. ⚙️ Phần **không được hoàn** (ví dụ 50%) **thuộc về chủ sân** (đã trừ hoa hồng) — không phải bút toán mới, chỉ là phần còn lại sau khi đảo.
5. ⚙️ Thông báo cho người bị ảnh hưởng. Trong lúc ledger chưa ghi xong, giao diện hiện **"Đang hoàn tiền"**, xong mới hiện **"Đã hoàn tiền"**.

🏟️ **Đổi sân con** cho khách (cùng giờ, cùng giá) → không đụng tiền, chỉ thông báo cho 🧑.

---

## 3. Chuỗi TRANH CHẤP GIAO DỊCH (🧑 → 🛡️ → 🧑 + 🏟️)

1. 🧑 Ca đã kết thúc và **chưa quá 24h** → chọn booking → chọn vấn đề, mô tả, SĐT, tối đa 5 ảnh → gửi.
2. ⚙️ Tạo tranh chấp `Đang mở` → **giữ lại doanh thu của đúng booking đó** ở ngăn `chờ` của 🏟️ (không cho chuyển sang khả dụng).
3. 🛡️ Mở hàng chờ tranh chấp → xem bằng chứng, booking, lịch sử tiền (AI chỉ tóm tắt hỗ trợ) → chọn:
   - **Hoàn toàn bộ** / **Hoàn một phần** (nhập số tiền) → ⚙️ đảo 3 vế như chuỗi 2 → tiền vào ví 🧑.
   - **Bác** → ⚙️ không có bút toán tiền.
4. ⚙️ Tranh chấp `Đã giải quyết` → **gỡ giữ** phần doanh thu còn lại cho 🏟️ → thông báo cả 🧑 và 🏟️.
5. Quyết định Admin là **cuối cùng**, không khiếu nại lại.

---

## 4. Chuỗi DOANH THU CHỦ SÂN (⚙️ → 🏟️)

1. Booking xác nhận → ⚙️ 90% vào ngăn `chờ` (chuỗi 1, bước 6).
2. Ca kết thúc + **24h** trôi qua **mà không có tranh chấp** → ⚙️ chuyển sang ngăn `khả dụng`.
   (24h này trùng đúng hạn gửi tranh chấp → tiền chỉ ra khỏi diện tranh chấp khi không còn ai được khiếu nại.)
3. Có tranh chấp → chỉ giữ **đúng booking đó**, không khóa cả ví → chờ 🛡️ xử (chuỗi 3).
4. 🏟️ Xem báo cáo doanh thu + **gợi ý khung giờ ế** để điều chỉnh giá.
5. Tiền `khả dụng` → 🔗 rút (chuỗi 5).

---

## 5. Chuỗi RÚT TIỀN (🏟️ / 🧑 → ⚙️ → 🛡️ → 🏦 → ⚙️)

Dùng **chung một hàng chờ Admin**, tách theo loại ví:
- 🏟️ rút từ ví **kinh doanh** (phần `khả dụng`).
- 🧑 rút từ ví **cá nhân** (chỉ phần `rút được`: tiền hoàn, tiền thắng kèo, tiền dư).

**Bước 1 — Người dùng gửi yêu cầu**
1. 🏟️/🧑 Nhập số tiền + tài khoản ngân hàng nhận.
2. ⚙️ Khóa ví, kiểm tra: không vượt số được rút · **≥ 10.000đ** · **chưa có yêu cầu nào đang chờ**.
3. ⚙️ Tạo yêu cầu `Chờ xử lý` + **chuyển số tiền sang ngăn `đang chờ rút`** (tiền vẫn của họ nhưng không tiêu được nữa, chưa ghi sổ cái).
4. ⚙️ Yêu cầu vào **hàng chờ Rút tiền của Admin**, kèm **nội dung chuyển khoản sinh sẵn**.
5. Còn `Chờ xử lý` thì người dùng **tự hủy được** → tiền trả về `khả dụng`.

**Bước 2 — Admin xử lý**
6. 🛡️ Mở hàng chờ → xem số tiền, tài khoản nhận, nội dung chuyển khoản.
7. 🛡️ **Chuyển khoản tay** từ tài khoản nền tảng, ghi đúng nội dung hệ thống sinh.
8. 🏦 SePay gửi webhook **"tiền ra"**.
9. ⚙️ Khớp **số tiền + nội dung**:
   - **Khớp đủ** → yêu cầu `Đã chi`, trừ ngăn `đang chờ rút`, ghi bút toán **payout** (lần duy nhất tiền rời hệ thống) → **thông báo người rút**.
   - **Không khớp** (sai số tiền/nội dung) → **không tự đổi trạng thái**, giao dịch rơi vào 🔗 hàng chờ đối soát (chuỗi 6).
   - Webhook gửi trùng → bỏ qua.

**Nhánh khác của Admin**
- **Từ chối** (bắt buộc lý do) → chỉ được khi **chưa chi đồng nào** → tiền về lại `khả dụng` → thông báo.
- **Chi từ tài khoản ngoài SePay** (không có webhook) → 🛡️ nhập mã tham chiếu + lý do + xác nhận 2 lần → ⚙️ ghi payout, `Đã chi`.
- **Đã chi một phần** → yêu cầu `Chi một phần` → 🛡️ chuyển bù phần thiếu, **hoặc** chốt ở mức đã chi (phần dư trả về `khả dụng`). **Không bao giờ từ chối** yêu cầu đã chi một phần.

---

## 6. Chuỗi ĐỐI SOÁT SEPAY (🏦 → ⚙️ → 🛡️)

Mọi giao dịch ngân hàng phải được giải trình. Cái nào hệ thống không tự khớp → vào **hàng chờ đối soát** của 🛡️.

| Trường hợp | 🛡️ xử lý | ⚙️ kết quả |
|---|---|---|
| **Tiền vào** không khớp mã (người chơi ghi sai nội dung) | Gán cho đúng người dùng | Cộng **nạp** vào ví cá nhân. **Không** xác nhận booking hộ — người chơi tự đặt lại |
| **Tiền ra** không khớp yêu cầu rút | Gán cho yêu cầu rút | Đủ → `Đã chi` · Thiếu → `Chi một phần` · Thừa → phần thừa ghi **lỗ vận hành** |
| Giao dịch không liên quan nền tảng | Đánh dấu **ngoài phạm vi** | Không ghi sổ cái |

Mỗi thao tác bắt buộc lý do. Đối soát xong hết thì: **tổng tiền vào − tổng tiền ra = tổng số dư mọi ví**.

---

## 7. Chuỗi KÈO (🧑 chủ kèo ↔ 🧑 người tham gia ↔ ⚙️ ↔ 🏟️ ↔ 🛡️)

### 7.1 Tạo kèo
1. 🧑 Chủ kèo chọn **slot đang giữ** hoặc **booking đã trả** của mình, **cách giờ chơi ≥ 24h**.
2. 🧑 Chọn: giao lưu / xếp hạng · đơn / đôi · tỷ lệ ký quỹ **5:5 · 6:4 · 7:3** (thua : thắng) · trình độ · BO3/BO5 → công bố.
3. ⚙️ **Khóa cấu hình**, tính **hạn chốt** theo thời gian còn lại đến giờ chơi
   (<48h → +6h · 48–72h → +12h · 72–120h → +18h · ≥120h → +24h, tính từ lúc tạo).

### 7.2 Tham gia & ký quỹ
4. 🧑 Người tham gia tìm kèo hoặc nhận **gợi ý AI** (có giải thích, AI không tự tham gia hộ) → chọn đội.
5. ⚙️ Giữ chỗ **10 phút** (chống tranh chỗ cuối: ai giữ trước được, người sau nhận "kèo đã đầy").
6. 🧑 Nộp ký quỹ (ví/VietQR) → ⚙️ tiền vào **ví nền tảng, ngăn tạm giữ**, gắn với kèo + đội + chỗ — **không vào ví chủ kèo**.
7. Hết 10 phút chưa trả → ⚙️ nhả chỗ. Tiền chuyển khoản tới muộn → ⚙️ cộng vào **ví cá nhân, phần rút được**.
8. Kèo đôi: chủ kèo **mời đồng đội đích danh** — đồng đội tự trả, hoặc chủ kèo trả thay (mọi khoản hoàn của chỗ trả thay về ví chủ kèo; tiền thắng về đồng đội).

**Công thức ký quỹ** (P = giá sân). Ví dụ đơn 7:3, P = 200k: mỗi bên nộp **140k** → 200k trả sân → **80k tạm giữ** chờ kết quả.

### 7.3 Rút khỏi kèo
- **Trước hạn chốt** → ⚙️ hoàn **100%** ký quỹ vào **ví cá nhân (phần rút được)** → mở lại chỗ.
- **Sau hạn chốt** → không rút tự do; vấn đề đi qua luồng sự cố (7.5).

### 7.4 Tại hạn chốt — ⚙️ tự xử lý
- **Đủ người + đủ tiền** →
  - Nguồn slot giữ chỗ: trả sân **đúng P một lần** → booking xác nhận → 🔗 chuỗi 1 bước 6 (90% cho 🏟️, 10% nền tảng).
  - Nguồn booking đã trả: **dùng lại** thanh toán cũ (không thu P, không thu hoa hồng lần 2); phần chủ kèo đã trả dư được **cân lại về ví cá nhân (rút được)**.
  - Phần dư sau khi trả sân = **tiền tạm giữ chờ kết quả**.
- **Thiếu** →
  - Nguồn giữ chỗ: **hủy kèo, hoàn toàn bộ ký quỹ vào ví cá nhân, nhả slot**.
  - Nguồn booking đã trả: đóng kèo, hoàn người tham gia, **booking giữ nguyên cho chủ kèo** như booking thường.
- Sân bị hủy trước khi có kết quả (ví dụ 🏟️ ngừng hoạt động) → hoàn đủ tiền tạm giữ; phần tiền sân hoàn theo chính sách booking, **chia 50:50 hai đội**.

### 7.5 Khai kết quả → chia tiền
1. Hết giờ chơi → **chỉ 🧑 chủ kèo** nhập tỷ số từng set + 1–3 ảnh, trong **12h**.
2. ⚙️ Tự suy ra đội thắng → mở **12h** cho người còn lại: **đồng ý / khiếu nại / báo sự cố**.
3. Không ai phản đối (hoặc đối thủ xác nhận sớm) → ⚙️ **chốt kết quả**:
   - Tiền tạm giữ trả cho **đội thắng** → vào **ví cá nhân, phần rút được** → 🔗 rút (chuỗi 5).
   - Kèo xếp hạng → cập nhật **điểm xếp hạng** (🔗 chuỗi 9).
4. Không ai khai trong 12h → ⚙️ tạm `Không có kết quả`, mở thêm 12h báo sự cố → vẫn không có → **chia chi phí 50:50**, không tính điểm.
5. Báo vắng mặt chỉ được sau **giờ bắt đầu + 15 phút**. **Không có check-in.**

### 7.6 Khiếu nại kết quả (🧑 → 🏟️ → 🛡️)
1. 🧑 Khiếu nại → ⚙️ **khóa tiền tạm giữ + điểm** (tiền sân của 🏟️ **vẫn chạy bình thường**).
2. 🏟️ Chủ sân có **24h** xem bằng chứng → **đề xuất** Đội A thắng / Đội B thắng / Không có kết quả + lý do.
   Đề xuất **chỉ để tham khảo**, không chia tiền. Chủ sân không trả lời, hoặc là người trong kèo → chuyển thẳng 🛡️.
3. 🛡️ Admin có **SLA 48h** (⚙️ nhắc ở 24h, cảnh báo quá hạn ở 48h, nhắc tiếp mỗi 24h) → chọn 1 trong 3 kết quả + lý do + **xem trước tác động** + **xác nhận 2 bước**.
4. ⚙️ Chia tiền + cập nhật điểm theo quyết định. **Quá SLA cũng không tự chia** theo đề xuất chủ sân.
5. Quyết định Admin là **cuối**. Sai sót kỹ thuật → 🔗 ticket hỗ trợ + bút toán bù.

---

## 8. Chuỗi TRỞ THÀNH CHỦ SÂN (🧑 → 🛡️ → 🏟️)

1. 🧑 Nộp hồ sơ chủ sân → `Chờ duyệt` → vào hàng chờ của 🛡️.
2. 🛡️ Duyệt → ⚙️ cấp quyền chủ sân + **tạo ví kinh doanh** · Từ chối (có lý do) → người dùng sửa, nộp lại.
3. 🏟️ Tạo cơ sở → sân con (**1–5 ảnh/sân**) → giờ hoạt động → biểu giá → quy tắc đặt → 🔗 sân xuất hiện ở chuỗi 1.
4. ⚙️ Chặn đổi giờ/đóng sân nếu khoảng đó còn booking hoặc slot đang giữ (muốn đóng hẳn → dùng **ngừng hoạt động**, chuỗi 2).
5. 🏟️ Ghi **booking tại quầy** → chỉ khóa lịch, nền tảng **không thu tiền, không hoa hồng**.
6. 🛡️ **Khóa tài khoản** chủ sân → ⚙️ ngắt mọi phiên ngay, hồ sơ chủ sân tạm ngưng, sân **biến khỏi tìm kiếm**.

---

## 9. Chuỗi ĐIỂM XẾP HẠNG & GIẢI THƯỞNG (⚙️ ↔ 🧑 ↔ 🛡️)

1. 🧑 Tự khai trình độ **1 lần** (5 bậc: Mới chơi / Yếu / TB / TB+ / Bán chuyên), tách đơn/đôi.
   Muốn sửa → gửi **ticket** → 🛡️ duyệt → ⚙️ chỉnh điểm (chưa có trận: về mức bậc mới; đã có trận: tối đa ±50), có ghi vết.
2. ⚙️ Chỉ **kèo xếp hạng đã chốt, có đội thắng** mới đổi điểm (Glicko-2). Tiền/tỷ lệ ký quỹ **không ảnh hưởng** điểm.
   Cùng đối thủ: chỉ **1 trận/7 ngày** được tính (vẫn chia tiền bình thường).
3. 🛡️ Tạo **kỳ xếp hạng** (không chồng nhau). Sang kỳ mới ⚙️ giữ điểm, reset số trận/chuỗi thắng.
4. ⚙️ Lên bảng xếp hạng khi **≥5 trận xếp hạng trong kỳ** + điểm đủ ổn định. Bảng tách đơn/đôi, toàn quốc/tỉnh, dưới/trên 1600.
5. 🛡️ Tạo **chương trình thưởng** (thuộc 1 kỳ, chọn tiêu chí) → công bố (sau đó **không giảm tiền, không đổi tiêu chí**).
6. Hết chương trình → ⚙️ chờ các kèo còn tranh chấp chốt xong ("Đang đối soát kết quả") → tự tính bảng → 🛡️ **duyệt danh sách** (không sửa điểm).
7. 🧑 Người đạt giải có **7 ngày** bổ sung thông tin nhận thưởng (quá hạn → mất giải, không chuyển xuống hạng sau).
8. 🛡️ Có **7 ngày** chuyển khoản tay → đánh dấu đã trả (bắt buộc **mã giao dịch + ảnh chứng từ**).
   Tiền thưởng là **ngân sách riêng**, không lấy từ ví người chơi hay tiền kèo.
9. ⚙️ Tự cấp **huy hiệu**: chuỗi thắng 5/10/15…, Top 10, King of Court.

---

## 10. Chuỗi CỘNG ĐỒNG & HỖ TRỢ (🧑 ↔ 🛡️)

**Kiểm duyệt nội dung**
1. 🧑 Đăng bài / bình luận (công khai) → 🧑 khác thấy vi phạm → **báo cáo** (mỗi người báo 1 lần/nội dung).
2. ⚙️ Tạo báo cáo `Đang mở` → **không tự gỡ bài** → vào hàng chờ kiểm duyệt của 🛡️.
3. 🛡️ Xem → **ẩn / gỡ / bỏ qua** → ⚙️ nội dung bị gỡ không hiện công khai nhưng vẫn giữ bản ghi. Không AI tự gỡ.

**Ticket hỗ trợ**
1. 🧑 Gửi ticket (chủ đề + nội dung + tối đa 5 ảnh) → `Mở` → chỉ người gửi + 🛡️ thấy.
2. 🛡️ Phản hồi → `Đang xử lý` → trao đổi qua lại → đóng `Đã giải quyết`.
3. Ticket dùng cho: sửa trình độ (🔗 chuỗi 9), sai sót sau quyết định kèo (🔗 chuỗi 7.6), mọi vấn đề khác.

**Bong bóng chat AI (CSKH)**
- 🧑 Hỏi → ⚙️ AI trả lời dựa trên **chính sách + dữ liệu của chính người hỏi**, có dẫn nguồn.
- AI **không tự thao tác** (hủy, hoàn, khiếu nại) — chỉ hướng dẫn và dẫn tới đúng nút.
- AI lỗi/hết quota → báo tạm bận, các chức năng khác vẫn chạy.

---

## Bản đồ liên kết giữa các vai trò

| Người chơi làm | → Hệ thống | → Ai tiếp nhận |
|---|---|---|
| Đặt sân, thanh toán | 90% vào ví kinh doanh (chờ), 10% nền tảng | 🏟️ thấy booking trên lịch + doanh thu chờ |
| Hủy sân | Đảo 3 vế, hoàn vào ví cá nhân | 🏟️ doanh thu chờ giảm tương ứng |
| Gửi tranh chấp (≤24h) | Giữ doanh thu booking đó | 🛡️ hàng chờ tranh chấp → quyết định → 🏟️ nhận phần còn lại |
| Rút tiền ví cá nhân | Chuyển sang `đang chờ rút` | 🛡️ hàng chờ rút tiền → chuyển khoản → 🏦 webhook → `Đã chi` |
| Chuyển khoản sai nội dung | Không tự khớp | 🛡️ hàng chờ đối soát → gán vào ví |
| Khiếu nại kết quả kèo | Khóa tiền tạm giữ + điểm | 🏟️ đề xuất (24h) → 🛡️ quyết định (SLA 48h) |
| Báo cáo nội dung | Tạo báo cáo, không gỡ | 🛡️ hàng chờ kiểm duyệt |
| Gửi ticket / xin sửa trình độ | Tạo ticket | 🛡️ phản hồi / chỉnh điểm |
| Nộp hồ sơ chủ sân | Hồ sơ chờ duyệt | 🛡️ duyệt → thành 🏟️ |

| Chủ sân làm | → Hệ thống | → Ai bị ảnh hưởng |
|---|---|---|
| Hủy booking / ngừng hoạt động | Hoàn 100%, nhả slot, hủy kèo gắn sân | 🧑 nhận tiền + thông báo |
| Đổi sân con | Đổi sân, giữ giờ + giá | 🧑 nhận thông báo |
| Rút doanh thu | Chuyển sang `đang chờ rút` | 🛡️ hàng chờ rút tiền |
| Đề xuất kết quả kèo | Lưu đề xuất, không chia tiền | 🛡️ tham khảo khi quyết định |
