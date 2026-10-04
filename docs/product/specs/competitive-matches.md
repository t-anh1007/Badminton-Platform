---
type: functional-spec
status: approved
updated: 2026-10-01
approved: 2026-09-25
owner: Tuan Anh (PO)
scope: MMP-02, MMP-06..11, FIN-05, F-09, F-10, F-11
extends:
  - docs/product/specs/matchmaking-passport.md
  - docs/product/specs/finance-match-fee.md
  - docs/product/specs/court-booking.md
authority: docs/product/decision-log.md D56-D58
---

# Functional Spec — Kèo cạnh tranh, kết quả, BXH và thưởng

## 0. Thẩm quyền và phạm vi thay thế

Đây là nguồn có thẩm quyền cho kèo giao lưu/xếp hạng có tiền thật, kết quả trận,
Glicko-2 đơn/đôi, bảng xếp hạng theo kỳ, badge và chương trình thưởng do Admin
treo. Khi có mâu thuẫn, spec này thay thế các phần tương ứng trong
`matchmaking-passport.md` và `finance-match-fee.md`.

Các quyết định cũ bị thay thế trong phạm vi sau:

- D28: thay cutoff cố định `startAt - 60 phút` bằng cutoff theo thời gian dẫn tại
  BR-CM-04.
- D29: thay chia đều bắt buộc bằng ký quỹ 5:5/6:4/7:3 tại BR-CM-10..15. Nền
  tảng vẫn là trung gian; không tồn tại chuyển tiền trực tiếp user-to-user.
- D33 và D37: thay cách phân bổ hoàn khi booking gắn kèo bị hủy bằng
  BR-CM-19..21; chủ kèo vẫn hấp thụ phần lẻ.
- Phần tự khai lại trình độ của D26/D47: thay bằng khai một lần và ticket Admin
  tại BR-CM-52..54. Các hằng số Glicko-2 khác của D26 giữ nguyên.

Không thay thế:

- D39/D40 về fencing, idempotency và quyền ghi giữa service.
- D52 về `withdrawable` là tập con của số dư cá nhân khả dụng.
- D53 về chỉ settlement kèo tại cutoff và giữ contribution ở `reserved` trước
  cutoff.
- MMP-10 về đánh giá cảm nhận sau trận; đánh giá cảm nhận và kết quả thắng/thua
  là hai dữ liệu riêng.

Court Credit, XP riêng và level riêng không còn thuộc phạm vi sản phẩm.

## 1. Mục tiêu và bất biến

### 1.1. Mục tiêu

- Biến booking sân thành một cam kết cạnh tranh minh bạch mà không làm chủ sân
  chịu rủi ro tiền thưởng.
- Cho phép kết quả do người chơi khai, có bằng chứng, cửa sổ phản hồi và quyết
  định cuối của Admin khi phát sinh tranh chấp.
- Duy trì một điểm xếp hạng Glicko-2 rõ ràng, tách đơn/đôi, cùng BXH theo kỳ và
  chương trình thưởng có thể kiểm chứng.

### 1.2. Bất biến tài chính

1. Mọi số tiền dùng đơn vị VND nguyên; không dùng số thực trong ledger.
2. Tổng contribution, settlement booking, reserve kết quả và refund phải bảo
   toàn từng đồng.
3. Chủ sân nhận settlement theo giá booking `P`; chủ sân không tài trợ phần
   chênh lệch kèo.
4. Platform Fee 10% chỉ tính trên `P`, không tính trên reserve kết quả.
5. Reserve kết quả là tiền giữ hộ, không phải doanh thu platform.
6. Refund chênh lệch cho bên thắng, refund tiền trả dư của chủ booking và tiền
   kèo đến muộn đều tăng `available` và `withdrawable` của ví cá nhân.
7. Ledger append-only; retry, redelivery hoặc hai scheduler chạy đồng thời không
   được thu, hoàn, settlement hay cập nhật rating hai lần.
8. Không tạo số dư âm và không thu hồi tiền đã mở rút để sửa kết quả.

### 1.3. Bất biến kết quả

1. Một booking có tối đa một loạt trận chính thức và một kết quả cuối.
2. Kết quả tạm thời không được chia reserve hoặc cập nhật rating.
3. Đề xuất của chủ sân không phải quyết định và không bao giờ tự có hiệu lực,
   kể cả khi Admin quá SLA.
4. Admin là actor duy nhất được quyết định hồ sơ tranh chấp.
5. Quyết định Admin đã xác nhận hai bước là cuối cùng trong hồ sơ đó.

## 2. Thuật ngữ và vai trò

| Thuật ngữ | Nghĩa |
|---|---|
| `P` | Giá booking gốc, trước Platform Fee. |
| `ratio` | Một trong `5:5`, `6:4`, `7:3`, đọc theo **bên thua : bên thắng**. |
| contribution | Tiền thật mỗi người nộp trước cutoff. |
| result reserve | Phần tổng contribution vượt `P`, giữ để xử lý kết quả. |
| booking owner | Người sở hữu hold/booking được chuyển thành kèo; mặc định là chủ kèo. |
| provider reviewer | Chủ sân/cơ sở xem bằng chứng và đưa đề xuất không ràng buộc. |
| ranked match | Kèo có thể cập nhật rating/BXH sau khi qua mọi điều kiện hợp lệ. |
| friendly match | Kèo dùng cùng tiền/kết quả/tranh chấp nhưng không cập nhật rating/BXH. |

## 3. Tạo kèo, đội hình và cutoff

| Mã | Quy tắc |
|---|---|
| BR-CM-01 | Chỉ booking owner được chuyển hold/booking của mình thành kèo. Nguồn hợp lệ là hold còn hiệu lực hoặc booking đã thanh toán/chưa hủy. |
| BR-CM-02 | Tại lúc tạo, `startAt - now >= 24 giờ`; nếu không thì giữ nguyên booking thường. |
| BR-CM-03 | Chủ kèo chọn giao lưu/ranked, đơn/đôi, ratio, phạm vi trình độ và thể thức trước khi công bố. Cấu hình bị khóa khi công bố. |
| BR-CM-04 | Cutoff: thời gian dẫn `<48h` thì `createdAt+6h`; `48..<72h` thì `+12h`; `72..<120h` thì `+18h`; `>=120h` thì `+24h`. |
| BR-CM-05 | Đơn có hai bên, mỗi bên một người. Đôi có Team A = chủ kèo + một slot và Team B = hai slot; người tham gia tự chọn slot đội trước khi trả tiền. Slot Team A có thể được giữ cho partner theo BR-CM-71..78. |
| BR-CM-06 | Hold thanh toán một slot kéo dài 10 phút. Hết hạn chưa trả thì slot tự mở lại. |
| BR-CM-07 | Trước cutoff người tham gia được rút và nhận lại 100% contribution; sau cutoff không rút tự do, hủy kèo hoặc thay người. |
| BR-CM-08 | Booking `<=90` phút bắt buộc BO3; booking `>90` phút cho chọn BO3 hoặc BO5. BO3 thắng trước 2 set; BO5 thắng trước 3 set. |
| BR-CM-09 | Chỉ loạt chính thức ảnh hưởng tiền/rating; các game chơi thêm không thuộc kết quả kèo. |
| BR-CM-71 | Kèo đôi, cả giao lưu lẫn ranked, cho chủ kèo gửi lời mời đích danh tới một người chơi đã có tài khoản vào slot Team A, trước cutoff và khi slot Team A còn trống. Không áp dụng cho kèo đơn. Partner phải khác chủ kèo; với kèo ranked, partner phải đủ điều kiện ranked như mọi người tham gia khác. |
| BR-CM-72 | Khi gửi lời mời, chủ kèo chọn "partner tự trả" hoặc "chủ kèo trả thay". Trả thay: chủ kèo thanh toán `feePerSlot` của slot Team A qua luồng giữ slot 10 phút và thanh toán hiện có; chỉ khi thanh toán thành công lời mời mới được gửi. Khoản trả thay gắn với slot, không gắn với người được mời. |
| BR-CM-73 | Khi có lời mời còn hiệu lực hoặc khoản trả thay đang giữ, slot Team A chỉ dành cho chủ kèo điều phối: người khác không chọn được Team A và hệ thống không tự xếp ai vào Team A. Team B vẫn nhận người bình thường. |
| BR-CM-74 | Lời mời hiệu lực đến `cutoffAt`. Partner tự trả: chấp nhận thì vào luồng giữ slot 10 phút và thanh toán của D50/BR-CM-06; hết hold chưa trả thì slot quay lại chỉ dành cho partner và partner được nhận lời lại để mở hold mới, trong tối đa 30 phút kể từ lần nhận lời đầu; quá 30 phút chưa thanh toán thì coi như partner từ chối (không nhận lời lại được), slot Team A mở cho mọi người và chủ kèo nhận thông báo. Hold đang chạy tại mốc 30 phút được chạy hết. Trả thay: chấp nhận thì partner vào Team A ngay, không phải trả. |
| BR-CM-75 | Trước khi partner vào Team A, chủ kèo được hủy lời mời hoặc đổi sang partner khác (đổi = hủy lời mời cũ và gửi lời mời mới); partner được từ chối. Khi đó, nếu có khoản trả thay thì khoản đó giữ nguyên cho lời mời tiếp theo; nếu chủ kèo hủy mời mà không mời người khác thì khoản trả thay hoàn 100% về ví chủ kèo và slot Team A mở cho mọi người. Không hủy/đổi được khi partner đang trong hold 10 phút. Mọi thay đổi đều gửi thông báo cho người bị ảnh hưởng. |
| BR-CM-76 | Partner đã vào Team A là participant bình thường về kết quả và rating. Partner tự trả: rút, hoàn tiền, chia tiền theo quy tắc hiện có; rút trước cutoff thì slot mở cho mọi người. Trả thay: rút trước cutoff thì slot quay về chủ kèo điều phối như BR-CM-75, khoản trả thay vẫn giữ. |
| BR-CM-77 | Tiền của slot trả thay: mọi khoản hoàn (chủ kèo hủy mời, partner rút rồi chủ kèo hủy mời, kèo underfilled/hủy, booking bị hủy) về ví chủ kèo; khoản nhận theo kết quả trận (result reserve khi thắng hoặc chia 50:50 khi không có kết quả) về partner. Tổng phân bổ vẫn khớp tuyệt đối như BR tài chính hiện có. |
| BR-CM-78 | Đến `cutoffAt` mà slot Team A chưa có partner vào: lời mời hết hạn, khoản trả thay (nếu có) hoàn 100% về ví chủ kèo, và kèo xử lý theo quy tắc thiếu người hiện có. |
| BR-CM-79 | Chủ kèo mời đồng đội bằng một trong ba cách: email, số điện thoại, hoặc chọn từ danh sách "từng chơi cùng". Số điện thoại chỉ khớp khi đúng một người chơi đang hoạt động dùng số đó; không có hoặc nhiều hơn một thì báo lỗi (`PLAYER_NOT_FOUND` / `PLAYER_PHONE_AMBIGUOUS`) và gợi ý mời bằng email. |
| BR-CM-80 | Danh sách "từng chơi cùng" gồm tối đa 20 người gần nhất (đồng đội lẫn đối thủ) đã cùng vào chính thức các kèo đã diễn ra (`completed`, hoặc `confirmed` đã qua giờ kết thúc); nhãn đồng đội/đối thủ theo trận gần nhất; hiển thị 5 người mỗi trang. Chỉ được mời người có trong danh sách của chính chủ kèo. |
| BR-CM-81 | Lời mời đánh cặp luôn kèm email (bỏ qua tùy chọn tắt nhóm Kèo) có link `/auth?next=/matches/:id`: chưa đăng nhập thì đăng nhập xong quay về kèo, đã đăng nhập thì mở thẳng kèo. |

## 4. Ký quỹ, settlement và hoàn tiền

### 4.1. Công thức chuẩn

| Ratio | Contribution mỗi đội | Reserve toàn kèo | Chi phí đội thắng | Chi phí đội thua |
|---|---:|---:|---:|---:|
| 5:5 | `0.5P` | `0` | `0.5P` | `0.5P` |
| 6:4 | `0.6P` | `0.2P` | `0.4P` | `0.6P` |
| 7:3 | `0.7P` | `0.4P` | `0.3P` | `0.7P` |

Đôi chia contribution/refund của mỗi đội cho hai người. Các phép chia dùng
`floor` cho người không phải chủ kèo; chủ kèo nhận/trả phần còn lại để mọi tổng
khớp tuyệt đối.

Ví dụ `P=200.000`, đơn 7:3: hai bên nộp 140.000, 200.000 settlement booking,
80.000 nằm ở result reserve. Bên thắng nhận 80.000 nên chịu ròng 60.000; bên
thua chịu 140.000.

### 4.2. Business rules tài chính

| Mã | Quy tắc |
|---|---|
| BR-CM-10 | Mọi bên ký quỹ theo mức tối đa bên thua có thể chịu; không thu thêm từ bên thua sau trận. |
| BR-CM-11 | Contribution vào platform `reserved`, gắn match, payer, team và slot; không vào ví chủ kèo. |
| BR-CM-12 | Tại cutoff đủ roster và contribution: nguồn hold mới settlement booking đúng `P` một lần; nguồn booking đã thanh toán phải reuse payment, provider revenue và booking settlement hiện hữu, không settlement `P` lần hai. Với cả hai nguồn, result reserve còn lại tiếp tục khóa đến kết quả cuối. |
| BR-CM-13 | Platform Fee là 10% của `P` và chỉ được ghi một lần theo booking settlement gốc. Chuyển booking đã thanh toán thành kèo hoặc xử lý cutoff không tạo commission lần hai; result reserve không sinh commission. |
| BR-CM-14 | Booking đã thanh toán: không hoàn phần booking owner trả dư trước cutoff. Tại cutoff hợp lệ mới cân contribution của owner về phần phải ký quỹ; chênh lệch vào ví cá nhân rút được. |
| BR-CM-15 | Đôi chia đều theo đội đối với contribution, refund và khoản result reserve trả cho đội nhận tiền. Chủ kèo hấp thụ phần lẻ VND khi thuộc đội nhận; nếu đội nhận không có chủ kèo thì phần lẻ giao cho thành viên gia nhập đội đó sớm nhất theo thứ tự JOIN hiện có. Không tạo cơ chế chia phần lẻ riêng. |
| BR-CM-16 | Tiền SePay đến khi contribution không còn payable được ghi có toàn bộ vào ví cá nhân rút được, không quay lại funding của kèo. |
| BR-CM-17 | Thiếu roster/tiền tại cutoff từ nguồn hold: hủy kèo, hoàn contribution và nhả hold. |
| BR-CM-18 | Thiếu roster/tiền tại cutoff từ booking đã trả: đóng lớp kèo, hoàn người tham gia, giữ booking thường cho booking owner và không cân lại khoản owner đã trả. |
| BR-CM-19 | Booking bị hủy trước kết quả: hoàn đủ result reserve; phần `P` áp chính sách booking hiện hành. |
| BR-CM-20 | Refund thực nhận từ phần booking được chia 50:50 giữa hai đội; phần booking không được hoàn cũng do hai đội chịu 50:50. Không áp ratio khi chưa có kết quả hợp lệ. |
| BR-CM-21 | Chủ kèo hủy trước cutoff: nguồn hold bị nhả; nguồn booking đã trả trở lại booking thường. Sau cutoff mọi vấn đề đi qua luồng sự cố. |
| BR-CM-22 | Tranh chấp thắng/thua chỉ khóa result reserve và rating; settlement/doanh thu sân tiếp tục bình thường. Tranh chấp dịch vụ sân là luồng FIN-12/13 riêng. |

## 5. Tỷ số, khai báo và bằng chứng

### 5.1. Luật tỷ số

- Mỗi set 21 điểm, phải hơn 2 điểm và cap 30.
- Nếu hết `endAt` mà loạt chưa đủ số set thắng: bên dẫn số set thắng.
- Nếu hòa số set: xét điểm của set đang đánh dở.
- Nếu chưa có set quyết định hoặc điểm set dở hòa: `NO_RESULT`.

### 5.2. Khai báo

| Mã | Quy tắc |
|---|---|
| BR-CM-23 | Cửa sổ khai báo bắt đầu tại `booking.endAt` và kéo dài 12 giờ. |
| BR-CM-24 | Chỉ chủ kèo được nhập điểm từng set (PO 01/10/2026), mỗi hồ sơ một bản khai. Người còn lại trong roster đồng ý, khiếu nại hoặc báo sự cố. Hệ thống tự suy ra bên thắng từ dữ liệu hợp lệ. |
| BR-CM-25 | Bản khai đầu bắt buộc 1–3 ảnh JPG/PNG/WebP, tối đa 5 MB/ảnh. Mỗi người tối đa 5 ảnh cho một hồ sơ, kể cả bổ sung. |
| BR-CM-26 | Ảnh đã commit là bất biến; chỉ được bổ sung khi hồ sơ còn mở. File nằm trong object storage production private, không nằm trên filesystem tạm của container. |
| BR-CM-27 | Binary evidence được giữ 90 ngày sau khi hồ sơ đóng; hồ sơ đang mở không chạy retention. Sau xóa vẫn giữ metadata, hash, actor và timestamp. |
| BR-CM-28 | Bản khai hợp lệ đầu tiên mở cửa sổ phản hồi/khiếu nại 12 giờ. |
| BR-CM-29 | ~~Nhiều bản khai cùng bên thắng…~~ Hết hiệu lực từ 01/10/2026 vì chỉ chủ kèo khai (BR-CM-24); bản của chủ kèo là bản hiển thị. |
| BR-CM-30 | Khác bên thắng hoặc có phản đối hợp lệ thì đóng băng result reserve/rating và mở tranh chấp. |
| BR-CM-31 | Đơn: đối thủ xác nhận thì được chốt sớm. Đôi: một người đội thua xác nhận mở grace 1 giờ cho người còn lại; grace luôn đủ 60 phút và có thể vượt hạn 12 giờ. |
| BR-CM-32 | Hết hạn không phản đối thì kết quả final ngay; tác vụ kỹ thuật phải idempotent và có mục tiêu hoàn tất trong 5 phút, không tạo cửa sổ chờ nghiệp vụ mới. |
| BR-CM-33 | Hết 12 giờ khai báo mà không có bản nào: mở `NO_RESULT` tạm và thêm 12 giờ báo sự cố; tiền tiếp tục khóa. Hết hạn bổ sung không có sự cố thì final `NO_RESULT`, chi phí 50:50, không rating. |

## 6. Sự cố, provider review và quyết định Admin

| Mã | Quy tắc |
|---|---|
| BR-CM-34 | Không có check-in bắt buộc. Sự cố trước/trong/sau trận do người trong roster tự khai kèm bằng chứng. |
| BR-CM-35 | No-show chỉ được khai sau `startAt + 15 phút`. Khai báo không tự tạo người thắng. |
| BR-CM-36 | Đôi: nếu Admin xác nhận một thành viên no-show thì cả đội đó thua; tiền và rating áp dụng cho cả đội. |
| BR-CM-37 | Provider reviewer có 24 giờ để xem bằng chứng và chọn đề xuất `TEAM_A_WIN`, `TEAM_B_WIN` hoặc `NO_RESULT`, kèm lý do. |
| BR-CM-38 | Đề xuất provider là non-binding: không đổi trạng thái kết quả, không chia tiền, không cập nhật rating và không bao giờ auto-settle, kể cả khi Admin quá SLA. |
| BR-CM-39 | Provider hết 24 giờ không phản hồi thì hồ sơ chuyển Admin. Nếu provider/tài khoản quản lý liên quan là người trong kèo, bỏ qua provider và chuyển thẳng Admin. |
| BR-CM-40 | Admin có SLA 48 giờ từ lúc nhận hồ sơ; nhắc ở 24 giờ, cảnh báo quá hạn ở 48 giờ và nhắc mỗi 24 giờ sau đó qua in-app + email. Quá SLA chỉ thay đổi mức cảnh báo, không thay đổi tiền/kết quả. |
| BR-CM-41 | Admin chỉ quyết định `TEAM_A_WIN`, `TEAM_B_WIN`, `NO_RESULT`; không nhập tỷ lệ tùy ý. Quyết định bắt buộc lý do, preview tác động và xác nhận hai bước. |
| BR-CM-42 | Quyết định Admin là final. Lỗi kỹ thuật/thao tác đi qua support ticket và bút toán bù append-only; không mở lại hồ sơ để thu hồi tiền đã rút. |

## 7. Rating Glicko-2 đơn và đôi

| Mã | Quy tắc |
|---|---|
| BR-CM-43 | Chỉ ranked match final có bên thắng và còn đủ điều kiện chống lặp mới phát rating result. Friendly và `NO_RESULT` không cập nhật rating. |
| BR-CM-44 | Mỗi user có hai rating state độc lập: singles và doubles; mỗi state gồm rating, RD, sigma, matches played. |
| BR-CM-45 | Đôi: mỗi người nhận đúng một Glicko result; opponent rating/RD là giá trị tổng hợp từ hai thành viên đội đối phương. |
| BR-CM-46 | Tiền/ratio không ảnh hưởng delta rating. |
| BR-CM-47 | Cùng đối thủ chỉ một trận được tính trong rolling 7 ngày. Đơn xét cùng một opponent; đôi xét cùng cặp hai người đội đối phương, không xét đồng đội của user. Cửa sổ và quyền ưu tiên dùng `finalizedAt`: kết quả được chốt chính thức trước chiếm suất rating trước; chênh đúng 7 ngày vẫn đủ điều kiện. |
| BR-CM-48 | Trận vượt giới hạn vẫn xử lý tiền/kết quả nhưng không rating, BXH, streak hoặc badge. Hệ thống phải cảnh báo trước khi roster bị khóa. |
| BR-CM-49 | RD tăng theo rating period hàng tuần khi không hoạt động, cap 350. RD `>=200` là bất định cao và tạm ẩn khỏi BXH. |
| BR-CM-50 | Tâm bậc, ngưỡng rating, sigma và tau giữ theo D26. |
| BR-CM-51 | Không có XP hoặc level riêng; tên sản phẩm duy nhất là “Điểm xếp hạng”. |
| BR-CM-52 | Người chơi tự khai bậc singles một lần và doubles một lần. |
| BR-CM-53 | Muốn sửa khai báo phải tạo support ticket cho đúng loại hình. |
| BR-CM-54 | Admin duyệt ticket: chưa có trận thì đặt rating về tâm bậc mới; đã có trận thì dịch tối đa ±50 theo công thức D26 và giữ RD/sigma. Mọi thay đổi có audit. |

## 8. BXH theo kỳ

| Mã | Quy tắc |
|---|---|
| BR-CM-55 | Admin tạo một lịch kỳ chung toàn nền tảng; hai kỳ không chồng thời gian. |
| BR-CM-56 | Sang kỳ mới giữ rating/RD/sigma nhưng reset số trận, số thắng, streak và eligibility của kỳ. |
| BR-CM-57 | Eligibility: ít nhất 5 ranked result hợp lệ trong kỳ và RD `<200`. Bảng khu vực còn yêu cầu 5 trận thuộc khu vực chính trong kỳ. |
| BR-CM-58 | Bảng tách singles/doubles, toàn nền tảng/tỉnh-thành và hai nhóm rating `<1600`/`>=1600`. Vượt 1600 thì chuyển bảng ngay. |
| BR-CM-59 | User chọn một tỉnh/thành chính trước khi tham gia kỳ; khóa đến hết kỳ và chỉ đổi cho kỳ sau. User vẫn có thể đứng bảng toàn nền tảng. |
| BR-CM-60 | Xếp hạng công khai dùng rating hiện tại sau khi đạt eligibility; thông tin công khai tuân D31. |
| BR-CM-61 | Công khai kết quả thể thao, tỷ số, loại hình và rating change; không công khai contribution, refund, bank info hoặc evidence. |

## 9. Chương trình thưởng Admin và badge

### 9.1. Chương trình thưởng

| Mã | Quy tắc |
|---|---|
| BR-CM-62 | Một chương trình thuộc đúng một kỳ và chọn một tiêu chí hệ thống: top rating tại `endAt` của chương trình, nhiều ranked win nhất, rating gain lớn nhất hoặc win streak dài nhất. |
| BR-CM-63 | Admin chọn singles/doubles, nhóm rating, phạm vi platform hoặc một tỉnh/thành, ngày bắt đầu/kết thúc nằm trong kỳ và nhiều mức giải. |
| BR-CM-64 | Tiền thưởng và countdown công khai. Chương trình đã công bố không được giảm tiền, đổi tiêu chí hoặc rút ngắn thời gian. Chỉ hủy tự do trước khi bắt đầu; hủy khi đang chạy bắt buộc lý do và thông báo toàn bộ người tham gia. |
| BR-CM-65 | Trận có `endAt` trong thời gian chương trình vẫn được chờ result/dispute final rồi mới khóa BXH giải. Trong thời gian này hiển thị “Đang đối soát kết quả”. |
| BR-CM-66 | Đồng hạng chiếm các vị trí liên tiếp: cộng tiền các vị trí đó rồi chia đều, chủ kèo không liên quan tới rounding giải thưởng. |
| BR-CM-67 | Hệ thống tính tự động; Admin duyệt danh sách cuối, không tự sửa điểm/hạng. |
| BR-CM-68 | Người đạt giải có 7 ngày từ thông báo final để bổ sung tên, email, số điện thoại, địa chỉ và tài khoản ngân hàng. Quá hạn thì mất quyền, giải bị hủy và không chuyển xuống hạng sau. |
| BR-CM-69 | Sau khi đủ thông tin, Admin có 7 ngày lịch để chuyển thủ công. Đánh dấu `paid` bắt buộc mã giao dịch và ảnh chứng từ; người nhận không phải xác nhận lại. |
| BR-CM-70 | Tiền thưởng là ngân sách Admin/marketing/tài trợ riêng, không lấy từ booking, result reserve hoặc ví người chơi. |

### 9.2. Badge

- Win streak 5, 10, 15… ranked win liên tiếp trong cùng kỳ.
- Top 10 theo khu vực hoặc toàn nền tảng khi kỳ khóa.
- King of Court cho hạng 1 kỳ.
- Badge tách singles/doubles, giữ vĩnh viễn và ghi rõ phạm vi/kỳ.
- Badge không thay đổi tiền hoặc rating; `NO_RESULT` không tăng và không cắt streak.

## 10. Trạng thái logic

### 10.1. Match/funding

```text
awaiting_deposit -> open -> filled -> locked_at_cutoff -> played
       |             |        |               |
       +-------------+--------+---------------+-> cancelled

played -> declaration_open -> provisional_result -> final_result
                    |                 |
                    |                 +-> disputed -> provider_review -> admin_review -> final_result
                    +-> provisional_no_result -> incident_window -> final_no_result | disputed
```

`provider_review` không phải terminal. Chỉ `final_result`, `final_no_result` hoặc
`cancelled` được giải phóng result reserve.

### 10.2. Result reserve

```text
collecting -> reserved_at_cutoff -> released_to_winner
                               \-> split_50_50_no_result
                               \-> refunded_on_booking_cancel
```

Mỗi chuyển trạng thái tiền phải có idempotency key và ledger entry append-only.

## 11. Thông báo bắt buộc

Kênh: in-app + email; chưa dùng SMS.

- Slot sắp/hết hạn thanh toán, cutoff thành công/thất bại.
- Booking chuyển thành kèo hoặc trở lại booking thường.
- Mở cửa sổ khai báo, có bản khai đầu, xác nhận/ phản đối, sắp hết hạn.
- Sự cố/no-show, provider recommendation, chuyển Admin.
- Nhắc Admin 24h, quá SLA 48h và mỗi 24h tiếp theo.
- Kết quả final, refund/reserve release, rating change.
- Kỳ/BXH, chương trình thưởng, hạn 7 ngày bổ sung bank info, hạn trả thưởng và chứng từ đã trả.

## 12. Acceptance criteria cấp hệ thống

### Tạo kèo và funding

- `AC-CM-01` — Hold hợp lệ hoặc booking đã trả, còn >=24h, tạo được đúng một match; nguồn không thuộc user hoặc quá hạn bị từ chối.
- `AC-CM-02` — Singles/doubles, ratio, mode và format bị khóa khi công bố; retry tạo không sinh match thứ hai cho cùng booking.
- `AC-CM-03` — Cutoff tính đúng bốn nhánh BR-CM-04.
- `AC-CM-04` — Với nguồn hold, 6:4 và `P=200.000` thu 120.000 mỗi đội, settlement booking 200.000 đúng một lần, reserve 40.000; 7:3 tương tự thu 140.000/reserve 80.000.
- `AC-CM-05` — Doubles chia contribution/refund/result-reserve payout đều; tổng sau rounding khớp tuyệt đối. Chủ kèo nhận phần lẻ khi thuộc đội nhận; nếu không, thành viên gia nhập đội nhận sớm nhất theo thứ tự JOIN hiện có nhận phần lẻ.
- `AC-CM-06` — Với booking đã thanh toán, tạo kèo và cutoff không sinh thêm booking settlement, provider revenue hoặc Platform Fee; hệ thống reuse các bút toán hiện hữu, chỉ rebalance phần owner trả dư và giữ result reserve. Retry không được double-settlement/double-commission; participant rút trước cutoff không tạo clawback owner.
- `AC-CM-07` — Underfilled hold hủy/nhả; underfilled paid booking giữ booking thường và hoàn participant.
- `AC-CM-08` — Late receipt không fund match và tăng đúng `available+withdrawable` payer một lần.
- `AC-CM-09` — Commission luôn bằng 10% `P`, không đổi theo ratio.
- `AC-CM-10` — Booking cancel trước result hoàn reserve đủ và chia phần booking theo 50:50 sau policy.
- `AC-CM-36` — Kèo đôi có lời mời: người khác chọn Team A bị từ chối, tham gia không chọn đội chỉ vào Team B; partner tự trả chấp nhận, trả đúng `feePerSlot` và vào Team A; hold 10 phút hết hạn thì slot vẫn chỉ dành cho partner.
- `AC-CM-37` — Trả thay: lời mời chỉ được gửi sau khi thanh toán của chủ kèo thành công; partner chấp nhận vào Team A không phải trả; đổi partner không thu thêm; chủ kèo hủy mời thì hoàn đúng `feePerSlot` về ví chủ kèo đúng một lần và slot mở cho mọi người.
- `AC-CM-38` — Kèo đơn, partner trùng chủ kèo, partner không đủ điều kiện ranked ở kèo ranked, hoặc hủy/đổi khi partner đang trong hold đều bị từ chối.
- `AC-CM-39` — Slot trả thay: đội thắng thì phần result reserve của slot về partner; hoàn tiền do hủy/rút/underfilled về chủ kèo; partner rút trước cutoff thì slot quay về chủ kèo, khoản trả thay giữ nguyên.
- `AC-CM-40` — Đến cutoff mà slot Team A chưa có partner: lời mời hết hạn, khoản trả thay hoàn 100% về chủ kèo đúng một lần, kèo đi theo quy tắc thiếu người.

### Kết quả và tranh chấp

- `AC-CM-11` — Chỉ roster được khai; khai ngoài 12h hoặc thiếu evidence bị từ chối.
- `AC-CM-12` — Score validator xử lý 21/win-by-2/cap-30, BO3/BO5 và tie-break hết giờ đúng spec.
- `AC-CM-13` — Bản đầu mở đúng 12h phản hồi; no objection final đúng một lần và release reserve/rating idempotent.
- `AC-CM-14` — Các bản cùng winner nhưng lệch điểm không tự dispute; khác winner thì dispute.
- `AC-CM-15` — Doubles representative confirmation tạo grace đủ 60 phút cho teammate.
- `AC-CM-16` — Không declaration tạo 12h incident window; không incident thì final 50:50/no rating.
- `AC-CM-17` — No-show trước `startAt+15m` bị từ chối; confirmed doubles no-show làm cả team thua.
- `AC-CM-18` — Provider recommendation không đổi result/money/rating; hết SLA provider chỉ escalate.
- `AC-CM-19` — Admin overdue chỉ phát notification/cờ quá hạn; không auto-settle theo provider hoặc 50:50.
- `AC-CM-20` — Admin chỉ chọn ba outcome, có reason + two-step confirm; retry không double-settle.
- `AC-CM-21` — Result dispute không giữ provider booking revenue.

### Rating, BXH và thưởng

- `AC-CM-22` — Friendly final không phát rating; ranked final phát đúng một rating update cho mỗi người.
- `AC-CM-23` — Singles/doubles state độc lập; doubles dùng một opponent aggregate.
- `AC-CM-24` — Với cùng opponent/opponent-pair, kết quả có `finalizedAt` sớm hơn chiếm suất rating trong rolling 7 ngày; kết quả được chốt sau trong khoảng nhỏ hơn 7 ngày không tính rating/BXH/badge nhưng vẫn settlement tiền. Chênh đúng 7 ngày vẫn đủ điều kiện.
- `AC-CM-25` — Weekly inactivity tăng RD không vượt 350; RD>=200 ẩn khỏi BXH.
- `AC-CM-26` — User chỉ tự khai một lần mỗi discipline; sửa qua ticket áp đúng nhánh 0 match hoặc bounded ±50.
- `AC-CM-27` — Kỳ mới giữ rating nhưng reset season counters/eligibility; đủ 5 trận và RD<200 mới xuất hiện.
- `AC-CM-28` — Crossing 1600 chuyển group ngay; primary region không đổi giữa kỳ.
- `AC-CM-29` — Reward program tính đúng bốn criterion, pending result cuối kỳ được chờ và tie prizes được cộng/chia đều.
- `AC-CM-30` — Bank-info timeout hủy giải không reallocate; Admin payout cần reference + evidence và không lấy từ match funds.
- `AC-CM-31` — Badge đúng discipline/scope/season, giữ vĩnh viễn và không đổi rating/tiền.

### Evidence và quyền riêng tư

- `AC-CM-32` — Mỗi submission có 1–3 ảnh hợp lệ, mỗi user/case không quá 5; object key sai namespace/owner bị từ chối.
- `AC-CM-33` — Evidence đã commit không sửa/xóa; unresolved case không bị retention job xóa.
- `AC-CM-34` — Sau 90 ngày từ lúc case đóng, binary bị xóa nhưng metadata/hash/audit còn.
- `AC-CM-35` — Public API không trả contribution, refund, bank info hoặc evidence; danh tính tôn trọng D31.

## 13. Bản đồ vào code hiện tại — chưa phải implementation plan

| Miền | Điểm tái sử dụng hiện có | Chênh lệch cần triển khai sau khi có plan |
|---|---|---|
| Match creation | `services/matchmaking-service/src/domain/matches.ts`, `routes/matches.ts` đã có hold source, 24h lead, deadline và outbox. | Domain hiện ép hold, capacity=2, split 50:50; cần paid-booking source, mode, discipline, team slot, ratio và format. |
| Match lifecycle | `matchLifecycle.ts`, `matchSettlement.ts`, `matchLifecycleEventConsumer.ts` đã có cutoff scheduler, fenced settlement, withdraw/cancel và BookingCompleted. | Cần logical result lifecycle, post-cutoff incident rule và không cho organizer cancel trực tiếp. |
| Match data | `services/matchmaking-service/prisma/schema.prisma` có Match/Join/Resolution/Passport/Evaluation. | Chưa có team, discipline, result claim, set score, evidence, objection, provider recommendation, Admin decision, season/rank/reward/badge. |
| Finance escrow | `services/finance-service/src/domain/matchFee.ts` và MatchFunding/Contribution đã reserve, settle, refund idempotent; personal wallet đã có `withdrawable`. | Funding hiện chỉ bảo toàn đúng `P`; cần result reserve, paid-booking rebalance, final-result release và 50:50 cancellation allocation. |
| Booking authority | `services/venue-booking-service/src/domain/booking.ts` đã có match context, create-from-hold và fenced match resolution. | Cần cho phép dùng booking đã trả làm nguồn mà không tạo booking mới; giữ provider revenue tách khỏi result dispute. |
| Shared contracts | `packages/shared/src/index.ts` đã có MatchCreated/Confirmed/Cancelled và notification contract. | Cần mở rộng snapshot funding/team/ratio và thêm result/dispute/rating/season/reward events; giữ schema validation + idempotency. |
| Rating | `rating.ts`, `passport.ts`, `ratingEventConsumer.ts` đã có Glicko-2 và idempotent RatingPeriodReady. | Passport hiện một state; cần hai discipline, result producer, weekly no-result period và eligibility. |
| Notification | `account-service/src/domain/notifications.ts` và `UserNotificationRequested` đã có in-app/realtime. | Cần các kind/deep-link mới và email delivery cho result, SLA, season/reward. |
| Evidence/storage | Community/finance/account/venue đã có authorize-upload -> object storage -> commit ownership pattern. | Tái dùng pattern, thêm namespace/result retention và signed read access; không tạo storage service mới. |
| Support ticket | Community support đã có ticket + evidence + Admin queue. | Tái dùng ticket cho sửa khai báo; không tạo hệ ticket riêng. |
| Web player | `MatchListPage.tsx`, `MatchDetailPage.tsx`, `PassportPage.tsx`, booking/payment components đã có flow kèo cơ bản. | Cần mockup desktop được duyệt trước: creator flow, team slots, money preview, result/evidence, dispute, dual passport, BXH/reward. |
| Web Admin/provider | Admin evaluations/disputes/tickets và provider booking surfaces đã tồn tại. | Tái dùng shell/table/drawer/confirmation; thêm provider recommendation queue, Admin result queue, seasons/rewards/payout proof. |

## 14. Ranh giới triển khai

- Không tạo service mới nếu các owner hiện tại đáp ứng được ranh giới trên.
- Không sửa balance trực tiếp; mọi thay đổi tiền đi qua finance ledger.
- Không dùng client timer làm authority; mọi deadline do backend lưu và scheduler xử lý.
- Không triển khai UI trước khi mockup desktop liên quan được PO duyệt.
- Không coi frontmatter `approved` là bằng chứng runtime; trạng thái triển khai chỉ
  được cập nhật sau migration, test và quan sát tương ứng.
