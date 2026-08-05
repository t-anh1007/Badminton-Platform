# STITCH — Danh sách màn hình & Prompt cho Giai đoạn 1

> Bổ sung cho `docs/DESIGN.md`. DESIGN.md giữ nguyên phần màu sắc/typography/component style
> (đúng, không đổi). File này thay thế mục "4. Trang cần thiết kế chi tiết trong Stitch" của
> DESIGN.md — vì mục đó chỉ có 6 trang, được viết trước khi biết phạm vi Giai đoạn 1 thật
> (40 chức năng, 198 AC, 3 vai trò: Người chơi / Nhà cung cấp sân / Admin — xem
> `docs/product/phasing.md` và `docs/product/phase-1-handoff.md`).

## Cách dùng với Stitch

1. Vào dự án mới trong Stitch → dán nội dung `docs/DESIGN.md` vào ô "Dán tệp DESIGN.md hiện có"
   (hoặc kéo-thả file).
2. Dán **Prompt khởi tạo** bên dưới vào ô "Hướng dẫn bổ sung" — chỉ làm 1 lần cho cả dự án.
3. Tạo **từng màn hình một**, theo đúng thứ tự G1 → G7 dưới đây (khớp thứ tự build của
   `phase-1-handoff.md`). Không dồn nhiều màn vào 1 prompt — Stitch cho chất lượng tốt hơn khi
   làm từng trang.
4. Sau khi Stitch ra 1 màn, xem lại đúng role/luồng trước khi sang màn kế — nếu sai role hoặc
   thiếu state (rỗng/lỗi/loading) thì yêu cầu Stitch sửa ngay trên màn đó trước khi qua màn khác.

---

## Prompt khởi tạo (dán 1 lần vào "Hướng dẫn bổ sung")

```
Đây là web application (KHÔNG có app mobile, bỏ hoàn toàn mọi thứ liên quan "Download App").
Tuyệt đối không dùng animation 3D/WebGL/canvas — chỉ CSS transition/transform cơ bản, vì deploy
trên hosting free-tier. Ưu tiên tạo từng trang một, không dồn nhiều trang vào 1 lần.

Sản phẩm: nền tảng đặt sân cầu lông, có 3 vai trò riêng biệt dùng chung 1 hệ thống:
- Người chơi (player): tìm sân, đặt sân, thanh toán, ví cá nhân, hồ sơ.
- Nhà cung cấp sân (provider): quản lý cơ sở/sân con/lịch/giá, xem doanh thu, rút tiền.
- Admin: duyệt nhà cung cấp, khóa/khôi phục tài khoản, xử lý rút tiền, đối soát, xử tranh chấp.

Mỗi màn hình phải nêu rõ đang thiết kế cho vai trò nào. Với các bảng/danh sách, luôn thiết kế
đủ 3 trạng thái: có dữ liệu, rỗng (empty state), và đang tải (skeleton loading) — không chỉ vẽ
trạng thái đẹp nhất. Số liệu tiền tệ hiển thị bằng VNĐ, dùng font Geist Mono cho số liệu/ranking.
```

---

## G1 — Danh tính và quyền truy cập (ACC-01…08)

**1. Đăng ký tài khoản** (ACC-01)
```
Thiết kế màn Đăng ký tài khoản cho Người chơi. Form: họ tên, email, mật khẩu, xác nhận mật
khẩu, checkbox đồng ý điều khoản. Nút CTA chính "Đăng ký" theo màu accent. Có link "Đã có tài
khoản? Đăng nhập". Hiển thị rõ trạng thái lỗi validate (email đã tồn tại, mật khẩu yếu) ngay
dưới từng field.
```

**2. Xác minh email** (ACC-02)
```
Thiết kế màn Xác minh email sau khi đăng ký. Thông báo đã gửi link/mã xác minh tới email, có
nút "Gửi lại email xác minh" (kèm đếm ngược cooldown), và trạng thái "Email đã được xác minh
thành công" dẫn sang đăng nhập.
```

**3. Đăng nhập** (ACC-03)
```
Thiết kế màn Đăng nhập dùng chung cho cả 3 vai trò (Người chơi/Nhà cung cấp/Admin đăng nhập
cùng 1 form, hệ thống tự điều hướng theo vai trò sau khi đăng nhập). Form: email, mật khẩu, link
"Quên mật khẩu?", nút CTA "Đăng nhập". Hiển thị trạng thái lỗi "Email hoặc mật khẩu không đúng".
```

**4. Quên / đặt lại mật khẩu** (ACC-05)
```
Thiết kế 2 bước trên cùng 1 luồng: (1) nhập email để nhận link đặt lại; (2) form đặt mật khẩu
mới (mật khẩu mới + xác nhận) sau khi bấm link trong email. Có thông báo thành công dẫn về
đăng nhập.
```

**5. Hồ sơ cá nhân** (ACC-06, ACC-07)
```
Thiết kế màn Hồ sơ cá nhân cho Người chơi: avatar, tên, email (không sửa được), số điện thoại,
nút "Đổi mật khẩu" mở form riêng (mật khẩu cũ + mật khẩu mới), nút "Đăng xuất". Layout dạng
settings page, sidebar trái có các mục Hồ sơ / Ví / Lịch sử booking / Thông báo.
```

**6. Admin — Quản lý tài khoản** (ACC-08)
```
Thiết kế màn Admin quản lý tài khoản người dùng: bảng danh sách user (tên, email, vai trò,
trạng thái hoạt động/đã khóa, ngày tạo), ô tìm kiếm + lọc theo vai trò/trạng thái, nút hành
động "Khóa" / "Khôi phục" trên mỗi hàng kèm modal xác nhận yêu cầu nhập lý do. Có badge trạng
thái màu đỏ cho tài khoản đã khóa.
```

---

## G2 — Nhà cung cấp và lịch sân (VEN-01…09)

**7. Đăng ký nhà cung cấp sân** (VEN-01)
```
Thiết kế màn đăng ký trở thành Nhà cung cấp sân (dành cho user đã đăng nhập với vai trò Người
chơi). Form: tên cơ sở, địa chỉ, số điện thoại liên hệ, giấy tờ/mô tả cơ sở (upload ảnh), nút
"Gửi yêu cầu duyệt". Sau khi gửi hiển thị trạng thái "Đang chờ Admin duyệt".
```

**8. Admin — Xét duyệt nhà cung cấp sân** (VEN-02)
```
Thiết kế màn Admin xét duyệt yêu cầu trở thành nhà cung cấp sân: danh sách yêu cầu đang chờ
(tên cơ sở, người gửi, ngày gửi), khi click vào 1 yêu cầu mở trang chi tiết xem đầy đủ thông
tin + ảnh đã upload, hai nút "Duyệt" / "Từ chối" kèm modal nhập lý do khi từ chối.
```

**9. Quản lý hồ sơ cơ sở sân** (VEN-03)
```
Thiết kế màn cho Nhà cung cấp sân quản lý hồ sơ cơ sở: tên, địa chỉ, mô tả, ảnh cơ sở (gallery
upload nhiều ảnh), thông tin liên hệ. Nút "Lưu thay đổi". Layout dạng dashboard có sidebar trái
(Hồ sơ cơ sở / Sân con / Lịch / Giá / Quy tắc đặt sân / Booking tại quầy / Doanh thu).
```

**10. Quản lý danh sách sân con** (VEN-04)
```
Thiết kế màn quản lý danh sách sân con (courts) của 1 cơ sở: bảng/card list mỗi sân con gồm
tên, loại mặt sân, trạng thái (hoạt động/tạm ngưng), nút "Thêm sân con" mở form (tên, mô tả,
ảnh), nút sửa/xóa trên mỗi sân.
```

**11. Thiết lập giờ hoạt động & ngày đóng cửa** (VEN-05)
```
Thiết kế màn thiết lập giờ hoạt động theo từng ngày trong tuần (giờ mở-đóng cửa dạng time
picker theo hàng ngang T2-CN) và lịch chọn các ngày đóng cửa đặc biệt (date picker dạng
calendar, đánh dấu ngày đã chọn). Cảnh báo nếu cố đóng cửa ngày còn booking đã xác nhận.
```

**12. Thiết lập biểu giá theo lịch** (VEN-06)
```
Thiết kế màn thiết lập biểu giá: bảng khung giờ theo ngày trong tuần (VD giờ vàng/giờ thường/
cuối tuần), mỗi khung có mức giá riêng (VNĐ/giờ), form thêm/sửa 1 khung giá (chọn ngày áp dụng,
giờ bắt đầu-kết thúc, đơn giá).
```

**13. Thiết lập quy tắc đặt sân** (VEN-07)
```
Thiết kế màn thiết lập quy tắc đặt sân cho 1 cơ sở: bước thời gian đặt (slot step, VD 30/60
phút), thời lượng đặt tối thiểu/tối đa, dạng form với input số + dropdown, có preview minh họa
cách slot sẽ hiển thị cho người chơi.
```

**14. Lịch sân hợp nhất** (VEN-08)
```
Thiết kế màn lịch sân hợp nhất dạng grid: cột là các sân con, hàng là khung giờ trong ngày, có
thanh chọn ngày ở trên. Mỗi ô slot có màu theo trạng thái: trống / đang giữ (hold, có icon đồng
hồ đếm ngược) / đã đặt (confirmed) / đóng cửa. Click vào 1 slot đã đặt mở panel chi tiết booking.
```

**15. Ghi nhận booking tại quầy / qua điện thoại** (VEN-09)
```
Thiết kế màn cho Nhà cung cấp ghi nhận booking thủ công (khách đến trực tiếp hoặc gọi điện):
chọn sân con + slot trên lịch, form nhập tên khách (không bắt buộc tài khoản), số điện thoại,
ghi chú, nút "Xác nhận booking nội bộ" — không có bước thanh toán online (thanh toán tại quầy).
```

**16. Điều chỉnh / hủy booking do phía sân** (BOK-10)
```
Thiết kế màn cho Nhà cung cấp (và Admin xem được) điều chỉnh hoặc hủy 1 booking đã xác nhận:
xem chi tiết booking, nút "Đổi sân con" (chọn sân con khác cùng khung giờ, giữ nguyên giờ/giá),
nút "Hủy do lỗi sân" kèm modal xác nhận ghi rõ khách sẽ được hoàn 100%.
```

---

## G3 — Tìm sân và giữ chỗ (BOK-01…06)

**17. Trang chủ** 
```
Thiết kế Trang chủ cho Người chơi: hero tĩnh (ảnh sân cầu lông hoặc illustration SVG phẳng,
KHÔNG dùng 3D), slogan lớn + CTA "Tìm sân ngay", giới thiệu 3 tính năng chính (Đặt sân / Ví &
thanh toán / Hồ sơ), thanh tìm kiếm nhanh (địa điểm + ngày).
```

**18. Tìm sân — danh sách và bản đồ** (BOK-01, BOK-02)
```
Thiết kế màn tìm sân dạng split-view: bên trái danh sách card cơ sở sân (ảnh, tên, địa chỉ,
khoảng giá, đánh giá sao), bên phải bản đồ (placeholder map) đánh dấu vị trí các sân. Thanh lọc
trên cùng: khu vực, khoảng giá, loại mặt sân, sắp xếp theo (gần nhất/giá/đánh giá).
```

**19. Chi tiết cơ sở sân** (BOK-03)
```
Thiết kế màn chi tiết 1 cơ sở sân: gallery ảnh, tên + địa chỉ + bản đồ nhỏ, mô tả, danh sách
sân con, giờ hoạt động, đánh giá/review, nút CTA nổi bật "Xem lịch trống & đặt sân".
```

**20. Lịch trống, chọn slot & giữ chỗ** (BOK-04, BOK-05, BOK-06)
```
Thiết kế màn chọn slot đặt sân: lịch dạng grid theo giờ cho từng sân con (giống style ở màn
"Lịch sân hợp nhất" nhưng góc nhìn Người chơi — chỉ thấy trống/đã đặt, không thấy chi tiết
khách). Chọn slot + thời lượng, giá hiện hành cập nhật realtime. Sau khi bấm "Giữ chỗ", hiển
thị banner/countdown timer đếm ngược 10:00 rõ ràng ở đầu trang, nhắc người chơi hoàn tất thanh
toán trước khi hết giờ.
```

---

## G4 — Thanh toán, xác nhận và ví (BOK-07, BOK-08, FIN-01…04, FIN-06)

**21. Thanh toán booking** (FIN-03, FIN-04)
```
Thiết kế màn thanh toán cho 1 booking đang giữ chỗ: tóm tắt booking (sân, giờ, giá) + countdown
giữ chỗ, chọn phương thức thanh toán dạng radio card ("Thanh toán bằng số dư ví" — hiện số dư
hiện có, disable nếu không đủ — hoặc "Thanh toán qua SePay" — hiện QR code + hướng dẫn), nút
"Xác nhận thanh toán".
```

**22. Xác nhận booking thành công** (BOK-07)
```
Thiết kế màn xác nhận booking thành công: icon check lớn, mã booking, tóm tắt sân/giờ/giá đã
trả, nút "Xem chi tiết booking" và "Về trang chủ".
```

**23. Chi tiết & lịch sử booking** (BOK-08)
```
Thiết kế màn lịch sử booking của Người chơi: danh sách tab (Sắp tới / Đã hoàn thành / Đã hủy),
mỗi booking là 1 card (sân, giờ, trạng thái badge màu, giá). Click vào mở trang chi tiết đầy đủ
với nút "Hủy booking" (nếu còn được hủy) và "Gửi đánh giá" (nếu đã hoàn thành).
```

**24. Ví & lịch sử giao dịch** (FIN-01, FIN-06)
```
Thiết kế màn Ví cá nhân: số dư hiện tại nổi bật trên cùng (font Geist Mono), nút "Nạp tiền",
bên dưới là bảng lịch sử giao dịch (loại: nạp/thanh toán/hoàn tiền/nhận muộn, số tiền +/-, thời
gian, trạng thái), có filter theo loại giao dịch.
```

**25. Nạp tiền qua SePay** (FIN-02)
```
Thiết kế màn nạp tiền: input số tiền muốn nạp (có các mức gợi ý nhanh 100k/200k/500k), sau khi
xác nhận hiển thị QR code SePay + số tiền + nội dung chuyển khoản, trạng thái "Đang chờ thanh
toán" với vòng loading, tự động chuyển sang "Nạp tiền thành công" khi có webhook.
```

---

## G5 — Hủy, hoàn tiền (BOK-09, FIN-07, FIN-08)

**26. Hủy booking** (BOK-09, FIN-07)
```
Thiết kế modal/màn xác nhận hủy booking cho Người chơi: hiển thị rõ chính sách hoàn tiền theo
bậc thang (100%/50%/0% tùy thời điểm hủy so với giờ bắt đầu), số tiền cụ thể sẽ được hoàn, nút
"Xác nhận hủy" (màu cảnh báo) và "Không hủy".
```

---

## G6 — Doanh thu, rút tiền, đối soát (FIN-09, FIN-10, FIN-11, FIN-14)

**27. Doanh thu (Nhà cung cấp)** (FIN-09)
```
Thiết kế màn Doanh thu cho Nhà cung cấp sân: card tổng quan (doanh thu khả dụng để rút / đang
chờ đáo hạn / tổng doanh thu tháng), biểu đồ đơn giản doanh thu theo ngày, bảng chi tiết từng
booking đã ghi doanh thu (mã booking, giờ xác nhận, doanh thu ròng, trạng thái pending/available).
```

**28. Yêu cầu rút tiền** (FIN-10)
```
Thiết kế màn yêu cầu rút số dư khả dụng: hiện số dư khả dụng để rút, form nhập số tiền muốn rút
+ thông tin tài khoản ngân hàng nhận tiền, nút "Gửi yêu cầu rút tiền", bên dưới bảng lịch sử các
yêu cầu rút trước đó kèm trạng thái (chờ xử lý/đã chuyển/từ chối một phần).
```

**29. Admin — Xử lý yêu cầu rút tiền** (FIN-11)
```
Thiết kế màn Admin xử lý yêu cầu rút tiền: bảng danh sách yêu cầu đang chờ (nhà cung cấp, số
tiền, tài khoản nhận, ngày gửi), nút "Đánh dấu đã chuyển khoản" mở modal xác nhận, trạng thái
"partially_paid" hiển thị badge riêng kèm số tiền đã trả một phần.
```

**30. Admin — Đối soát giao dịch chưa khớp** (FIN-14)
```
Thiết kế màn Admin đối soát: bảng các giao dịch ngân hàng/SePay chưa khớp với giao dịch trong
hệ thống (mã tham chiếu, số tiền, ngày, trạng thái webhook), nút "Khớp thủ công" mở modal chọn
giao dịch tương ứng trong hệ thống, badge cảnh báo đỏ cho các giao dịch tồn đọng lâu.
```

---

## G7 — Tranh chấp (FIN-12, FIN-13)

**31. Gửi tranh chấp giao dịch** (FIN-12)
```
Thiết kế màn cho Người chơi gửi tranh chấp về 1 giao dịch: chọn giao dịch từ lịch sử, form mô
tả lý do tranh chấp + upload ảnh bằng chứng, hiển thị rõ hạn xử lý còn lại (đếm ngược trong cửa
sổ 24 giờ kể từ khi ca kết thúc).
```

**32. Admin — Giải quyết tranh chấp** (FIN-13)
```
Thiết kế màn Admin xử lý tranh chấp: danh sách tranh chấp đang mở (người gửi, booking liên
quan, thời gian còn lại), trang chi tiết 1 tranh chấp xem mô tả + bằng chứng + lịch sử giao
dịch liên quan, hai nút quyết định "Chấp nhận tranh chấp" (hoàn tiền) / "Từ chối" kèm modal
nhập lý do quyết định.
```

---

## Ghi chú

- Tổng: **32 màn hình** bao phủ đủ 40 chức năng Giai đoạn 1 (một số chức năng dùng chung 1 màn,
  VD FIN-03+FIN-04 chung màn thanh toán, BOK-04/05/06 chung màn chọn slot).
- Không có màn riêng cho Gboot/G0 vì đó là hạ tầng backend, không có UI.
- Thứ tự trên khớp `docs/product/phase-1-handoff.md` §2 (Gboot→G0→G1→G2→G3→G4→G5‖G6→G7) — dựng
  UI theo đúng thứ tự này để khi chuyển sang code React sẽ khớp với thứ tự backend đã sẵn sàng.
