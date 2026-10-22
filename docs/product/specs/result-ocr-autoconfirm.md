---
type: functional-spec
status: approved
updated: 2026-10-22
owner: Tuan Anh (PO)
author: Claude Code
scope: MMP (kết quả kèo), AI (NCKH — AI agent + RAG)
extends:
  - docs/product/specs/competitive-matches.md
  - docs/product/specs/ai-assist.md
authority: docs/product/decision-log.md D60
---

# Functional Spec — Quét ảnh tỉ số, tự chốt kết quả và xử lý tranh chấp tự động

## 0. Thẩm quyền và phạm vi thay thế

Spec này là đề tài NCKH "AI agent + RAG tự động hóa một quy trình nghiệp vụ" của đồ
án: AI đọc ảnh bảng tỉ số để người chơi không phải gõ tay, hệ thống tự chốt kết quả
khi bằng chứng đủ mạnh, và tranh chấp được xử lý tự động hai tầng thay cho chủ sân +
Admin. Khi mâu thuẫn, spec này thay thế phần tương ứng của `competitive-matches.md`.

**Thay thế:**

| Nguồn cũ | Thay bằng |
|---|---|
| BR-CM-24 (chỉ chủ kèo khai) | BR-RA-01..04: mọi người trong roster được khai, xét theo đội |
| BR-CM-25 phần số lượng và dung lượng ảnh (1–3 ảnh/bản khai, 5 ảnh/người/hồ sơ, 5 MB/ảnh) | BR-RA-02: 1–5 ảnh/bản khai, 7 ảnh/người/hồ sơ (+2 khi kháng nghị), tối đa 15 MB/ảnh; định dạng giữ nguyên |
| BR-CM-28 (cửa sổ phản hồi cố định 12h) | BR-RA-20, 20a: cửa sổ theo mức tin cậy, giãn qua đêm |
| BR-CM-29 (đã hết hiệu lực) | BR-RA-03, 29: nhiều bản khai, gộp theo đội |
| BR-CM-31 (grace 1h kèo đôi khi một người đội thua xác nhận) | BR-RA-22, 23: mở rộng thành luật chung "đội thua chấp nhận" cho Đồng ý, ảnh khớp và tự khai thua |
| BR-CM-33 phần "không ai khai" | Giữ, nhưng hạn được giãn qua đêm (BR-RA-20a) và được khai `NO_RESULT` hợp luật (BR-RA-07) |
| BR-CM-37..39 (chủ sân đề xuất 24h) | Bỏ bước chủ sân. Tranh chấp tỉ số đi BR-RA-30..41; sự cố đi thẳng Admin (BR-RA-42) |
| Bất biến 1.3 #3, #4 | Bất biến mới §1.4: kết quả tạm của tầng 1 và phán quyết tạm của AI tự hiệu lực nếu không có kháng nghị hợp lệ; Admin là cấp phúc thẩm và quyết định cuối |
| `ai-assist.md` bất biến #8 (AI không tự hành động nhạy cảm) | Nới đúng một điểm: phán quyết tạm của AI ở tầng 2 (BR-RA-36) có thể dẫn tới chia tiền tạm giữ nếu hết hạn kháng nghị. Mọi phép tính tiền vẫn do code thường |

**Giữ nguyên:** luật tỉ số §5.1; cửa sổ khai 12h từ `endAt` (BR-CM-23, có giãn qua
đêm); định dạng và dung lượng ảnh (BR-CM-25); ảnh bất biến và lưu trữ (BR-CM-26, 27);
toàn bộ tài chính §4 (kể cả slot trả thay BR-CM-71..78), rating §7 (kể cả luật 7 ngày
BR-CM-47), BXH §8, thưởng §9; sự cố/no-show BR-CM-34..36; Admin BR-CM-40..42.

**Phạm vi áp dụng** *(quyết định của Claude)*:
- Luồng mới **thay** luồng khai kết quả cũ cho mọi kèo, cả xếp hạng lẫn giao hữu; không
  chạy song song hai luồng. Nền tảng là đồ án, không có người dùng thật (BR-RA-61).
- Hồ sơ đang mở tại thời điểm chuyển luồng chạy tiếp theo luật cũ (kể cả bước chủ sân)
  tới khi đóng; hồ sơ mở sau thời điểm chuyển đi luồng mới.
- Có một cờ cấu hình tắt riêng phần AI: khi tắt, người chơi gõ tay (tối đa Vàng), tầng 1
  vẫn chạy với bản gõ tay, tầng 2 không chạy mà chuyển Admin.

## 1. Mục tiêu, phi mục tiêu, phản mục tiêu

### 1.1. Mục tiêu

- Người chơi chụp hoặc tải ảnh bảng tỉ số, AI điền sẵn tỉ số; không phải gõ tay.
- Ca bình thường (đội thua chấp nhận) chốt trong vài phút tới 1h thay vì tới 24h.
- Tranh chấp rõ ràng được luật bằng chứng xử trong khoảng 8h (2h bằng chứng + 6h
  kháng nghị); ca khó có phán quyết tạm của AI cùng mốc; Admin chỉ nhận ca có kháng
  nghị hợp lệ, AI không đủ tin cậy, ảnh lạ (Đỏ) hoặc sự cố.
- Có số liệu định lượng cho chương thực nghiệm (§10).

### 1.2. Phi mục tiêu

- Không phát hiện ảnh chỉnh sửa tinh vi bằng pháp y số (chỉ có tín hiệu đơn giản ở
  BR-RA-13).
- Không đọc video, không đọc bảng điểm điện tử theo thời gian thực.
- Không tự xử sự cố no-show / không đánh / bỏ dở (vẫn do Admin).
- Không thu phí khiếu nại bằng tiền.

### 1.3. Phản mục tiêu (làm được nhưng vẫn là thất bại)

- Người chơi trung thực phải chờ lâu hơn luồng hiện tại.
- Người sửa đúng chỗ AI đọc sai bị bất lợi.
- Một thành viên (kể cả partner được trả thay) chốt được thua thay cho đồng đội mà
  đồng đội không kịp phản ứng.
- AI chốt sai mà không còn đường kháng nghị.
- AI tự tính số tiền hoặc tự quyết ngoài đúng 3 kết quả `TEAM_A_WIN`, `TEAM_B_WIN`,
  `NO_RESULT`.
- Phát sinh chi phí API (đồ án chạy free tier, chỉ dữ liệu giả của team).

### 1.4. Bất biến kết quả (mới)

1. Tiền tạm giữ và điểm (rating, điểm BXH) bị khóa tới khi kết quả **final**; mọi
   trạng thái trung gian sửa được mà không phải thu hồi tiền.
2. AI chỉ làm hai việc: **đọc ảnh ra tỉ số** (BR-RA-10) và **soạn phán quyết tạm**
   (BR-RA-35). Ai thắng được suy ra bằng code từ tỉ số theo §5.1; tiền tính bằng code.
3. Kết quả tạm (tầng 1) và phán quyết tạm (tầng 2) chỉ thành final khi hết hạn kháng
   nghị mà không có kháng nghị hợp lệ, hoặc khi bên bị xử thua chấp nhận. Có kháng nghị
   hợp lệ thì Admin quyết; quyết định Admin là cuối (BR-CM-42).
4. Bản khai có ảnh lạ (mức Đỏ) không bao giờ tự final bằng bất kỳ đường nào.
5. AI lỗi / hết quota không bao giờ chặn luồng: luôn có đường gõ tay hoặc chuyển Admin.

## 2. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| bản khai | Một lần gửi kết quả của một người trong roster, kèm 1–5 ảnh. |
| bản của đội | Bản khai có hiệu lực đại diện cho một đội (BR-RA-03). |
| kết quả đề xuất | Bản của đội gửi trước, đang chờ đội kia phản hồi. |
| mức tin cậy | Xanh / Vàng / Đỏ; xếp cho **từng ảnh** và cho **bản khai** (mức thấp nhất của các ảnh và các điều kiện khác) — BR-RA-15..17. |
| ảnh lạ | Ảnh có dấu hiệu không thuộc trận này: trùng chính xác ảnh của hồ sơ khác, hoặc chụp trước giờ đánh. Là nguồn duy nhất của mức Đỏ. |
| đội thua chấp nhận | Một thành viên đội bị xử thua bấm Đồng ý, gửi bản cùng bên thắng, hoặc tự khai đội mình thua (BR-RA-22). |
| người trả / partner được trả thay | Theo BR-CM-72/77: chủ kèo trả tiền slot Team A cho partner. |
| bằng chứng hợp lệ | Ảnh ở mức Xanh hoặc Vàng đã có tỉ số (AI đọc hoặc gõ tay theo BR-RA-14), xét theo bên thắng mà ảnh ủng hộ (BR-RA-30). |
| tầng 1 / tầng 2 | Xử tranh chấp bằng luật bằng chứng (code) / bằng phán quyết tạm của AI. |
| kháng nghị | Phản đối kết quả tạm tầng 1 hoặc phán quyết tạm tầng 2, đưa hồ sơ lên Admin (BR-RA-38). |
| uy tín | Mức tin cậy của **một người chơi** theo số vi phạm (§6). |

Không có đội cố định (D58): "đội" là Team A / Team B của một kèo cụ thể.

## 3. Luồng nghiệp vụ chính (BPM)

| # | Bước | Ngoại lệ chính | Tiêu chí kết thúc |
|---|---|---|---|
| FR1 | Tới `endAt`, mở cửa sổ khai 12h; nhắc cả roster "Chụp/tải ảnh bảng tỉ số". | Hạn rơi ban đêm → giãn tới 08:00 | Mọi người trong roster thấy nút tải ảnh |
| FR2 | Bất kỳ ai trong roster tải 1–5 ảnh (thư viện hoặc camera); mỗi ảnh chứa một hoặc nhiều set. | Ảnh sai định dạng/quá cỡ → từ chối như BR-CM-25 | Ảnh lưu ở object storage private |
| FR3 | AI đọc từng ảnh → tỉ số từng set, cột nào là đội nào, độ chắc từng ô. | AI lỗi → gõ tay (BR-RA-14) | Có bản nháp tỉ số |
| FR4 | Code kiểm tra từng ảnh và cả bản (luật, thể thức, đội, thời gian chụp, trùng ảnh) → gán mức. | Không xác định được cột → người khai chọn (tối đa Vàng) | Có mức Xanh/Vàng/Đỏ |
| FR5 | Người khai xem bản điền sẵn, sửa nếu cần, bấm **Gửi**. | Tỉ số sai luật → không gửi được | Bản khai được ghi, bất biến |
| FR6 | Bản của đội đầu tiên thành kết quả đề xuất; nếu tự khai thua thì xử như đội thua chấp nhận. | Đỏ → không tự final | Chờ phản hồi / grace / chốt |
| FR7 | Đội thua chấp nhận, hoặc im lặng hết cửa sổ → final. Có bất đồng (đội kia hoặc ngay trong đội) → tranh chấp. | Phản đối lý do "không có trận" → sự cố | Final, tranh chấp hoặc Admin |
| FR8 | Tầng 1: 2h nộp bằng chứng kín, luật bằng chứng ra kết quả tạm. | Bằng chứng hợp lệ cho cả hai bên thắng → FR9 | Kết quả tạm hoặc tầng 2 |
| FR9 | Tầng 2: AI soạn phán quyết tạm. | Tin cậy thấp / AI lỗi → Admin | Phán quyết tạm hoặc Admin |
| FR10 | 6h kháng nghị (chỉ bên bị xử thua, có căn cứ); hết hạn hoặc bên thua chấp nhận → final. Kháng nghị hợp lệ → Admin. | Admin quá SLA chỉ cảnh báo | Final |
| FR11 | Chốt: chia tiền tạm giữ, rating, điểm BXH, ghi vi phạm tự động (nếu có), lưu án lệ. | Retry không chia hai lần | Ledger cân, mỗi người một rating update |

## 4. Khai kết quả bằng ảnh

### 4.1. Ai được khai và gộp theo đội

| Mã | Quy tắc |
|---|---|
| BR-RA-01 | Mọi người trong roster của kèo (đơn 2, đôi 4) được tải ảnh và gửi bản khai trong cửa sổ khai 12h (BR-CM-23, giãn qua đêm theo BR-RA-20a). |
| BR-RA-02 | Mỗi bản khai bắt buộc 1–5 ảnh; giới hạn 7 ảnh/người/hồ sơ (kể cả ảnh bổ sung và ảnh tranh chấp), cộng thêm tối đa 2 ảnh khi kháng nghị; định dạng theo BR-CM-25; **tối đa 15 MB/ảnh** và phải là file gốc (không nén ở trình duyệt) để giữ thời gian chụp (PO 21/10/2026). Ảnh lấy từ **thư viện máy hoặc camera**; không bắt buộc chụp trong app (PO 21/10/2026; +2 ảnh kháng nghị là quyết định của Claude). |
| BR-RA-03 | **Bản của đội** = bản khai đầu tiên (theo giờ server) của một thành viên đội đó. Bản sau của đồng đội cùng bên thắng bổ sung bằng chứng (và có thể rút ngắn cửa sổ, BR-RA-29); khác bên thắng là bất đồng trong đội → tranh chấp (BR-RA-24). |
| BR-RA-04 | Hệ thống **không chờ** mọi người gửi. Bản của đội đầu tiên là kết quả đề xuất và mở cửa sổ phản hồi ngay (BR-RA-20). Nếu bản đó **tự khai đội mình thua** thì xử như đội thua chấp nhận (BR-RA-22, 23) (PO 21/10/2026). |
| BR-RA-05 | Bản khai đã gửi là bất biến (BR-CM-26). Người khai được gửi bản mới thay bản của chính mình chỉ khi: còn trong cửa sổ khai 12h, đội kia chưa có phản hồi nào, và đồng đội chưa có bản khác. Khi thay, cửa sổ phản hồi tính lại từ lúc thay theo mức của bản mới; ảnh của bản cũ vẫn tính vào giới hạn. *(quyết định của Claude)* |
| BR-RA-06 | Cả roster xem được ảnh và kết quả AI đọc của các bản khai (không công khai ra ngoài roster, BR-CM-61). Với ô người khai đã sửa, hệ thống hiện cả số AI đọc ban đầu và số đã sửa. Ngoại lệ: ảnh nộp thêm trong 2h tranh chấp được giữ kín tới khi hết 2h (BR-RA-30). *(quyết định của Claude)* |
| BR-RA-07 | Được khai kết quả `NO_RESULT` khi tỉ số hợp luật cho thấy hết giờ sân mà hòa số set và set dở cũng hòa (§5.1); bản này đi chung luồng phản hồi như mọi bản khai. *(quyết định của Claude, thay cho việc buộc báo sự cố)* |

### 4.2. AI đọc ảnh

| Mã | Quy tắc |
|---|---|
| BR-RA-10 | AI đọc mỗi ảnh và trả về JSON theo khuôn cố định: các set có trong ảnh (điểm hai cột), nhãn chữ của từng cột, độ chắc 0–1 cho từng ô, cờ "ảnh chụp màn hình" và "ảnh có nhiều bảng". AI **không** kết luận ai thắng. |
| BR-RA-11 | Ánh xạ cột → đội bằng so gần đúng nhãn cột với tên thành viên. Không khớp được (bảng lật điểm không ghi tên) thì người khai tự chọn "Cột trái là đội nào?"; khi đó bản khai **tối đa mức Vàng** (PO 21/10/2026). |
| BR-RA-12 | Mỗi ảnh có thể chứa **một hoặc nhiều set**. AI báo ảnh chứa bao nhiêu set; người khai gán ảnh vào set nếu AI không xác định được thứ tự. Hệ thống gộp các set theo thứ tự thành tỉ số trận (PO 21/10/2026). Một set có nhiều ảnh thì lấy ảnh **chụp muộn nhất** (ảnh giữa set không phải điểm cuối); không có thời gian chụp thì lấy ảnh có độ chắc cao nhất; các ảnh cùng set lệch bên thắng set → bản khai tối đa Vàng và người khai phải xác nhận số dùng. Set không có ảnh thì gõ tay set đó, bản khai tối đa Vàng. *(chọn ảnh chụp muộn nhất và mức Vàng khi lệch: quyết định của Claude)* |
| BR-RA-13 | Kiểm tra bằng code: (a) luật §5.1 và BR-CM-08 (BO3/BO5), kể cả set đánh dở khi hết giờ; tỉ số sai luật **không gửi được** (`RESULT_SCORE_INVALID`); nếu chính kết quả AI đọc đã sai luật thì mọi ô bị coi là độ chắc < 0,9; (b) thời gian chụp đọc từ thông tin file ảnh, coi là giờ Việt Nam (UTC+7) khi file không ghi múi giờ, sai số ±30 phút; (c) trùng ảnh: **trùng chính xác** (cùng checksum) với ảnh của hồ sơ khác, hoặc **gần trùng** (dấu vân tay ảnh) với ảnh của hồ sơ khác; ảnh trùng giữa các thành viên trong cùng hồ sơ không tính; checksum và dấu vân tay giữ vĩnh viễn kể cả khi file bị xóa sau 90 ngày; (d) cờ ảnh chụp màn hình; (e) cờ ảnh có nhiều bảng điểm. *(quyết định của Claude)* |
| BR-RA-14 | AI lỗi/hết quota sau khi thử hết các nguồn dự phòng: người khai gõ tay tỉ số (vẫn kèm ảnh), bản khai tối đa Vàng. Khi AI hoạt động lại, hệ thống đọc lại các ảnh chưa được đọc của hồ sơ còn mở để bổ sung thông tin, không đổi bản khai đã gửi. |

### 4.3. Mức tin cậy

| Mã | Quy tắc |
|---|---|
| BR-RA-15 | **Xanh** khi đồng thời: mọi set đều có ảnh do AI đọc; mọi ô có độ chắc ≥ 0,9; thời gian chụp của mọi ảnh nằm trong `[startAt − 30 phút, endAt + 2h]`; không ảnh nào trùng hay gần trùng; không cờ nhiều bảng; cột → đội do AI tự khớp tên; người khai không sửa ô nào; uy tín người khai không ở mức Thấp. |
| BR-RA-16 | **Vàng** khi không có ảnh lạ nhưng có ít nhất một: ô độ chắc < 0,9; người khai **sửa bất kỳ ô nào** (kể cả ô AI đọc chắc chắn — số gốc vẫn hiện cho roster, BR-RA-06); set gõ tay; ảnh không có thời gian chụp (qua Zalo/Messenger, chụp màn hình); ảnh chụp sau `endAt + 2h`; **ảnh gần trùng** hồ sơ khác (gắn cờ "nghi trùng" cho roster và AI thấy); cờ nhiều bảng; các ảnh cùng set lệch nhau; người khai tự chọn cột; gõ tay do AI lỗi; người khai uy tín Thấp. Lý do Vàng hiển thị cho roster **không bao giờ nêu uy tín**. |
| BR-RA-17 | **Đỏ** chỉ khi bản khai có **ảnh lạ**: trùng chính xác ảnh của hồ sơ khác, hoặc chụp trước `startAt − 30 phút` (PO 21/10/2026). Bản Đỏ vẫn được ghi, hiển thị cho roster kèm lý do, và **không bao giờ tự final** — kể cả khi đội thua chấp nhận hay tự khai thua: hết cửa sổ (12h) hoặc ngay khi có chấp nhận thì chuyển Admin. Trong tranh chấp, ảnh lạ chỉ bị loại riêng ảnh đó (BR-RA-30). |

### 4.4. Phản hồi và tự chốt

| Mã | Quy tắc |
|---|---|
| BR-RA-20 | Cửa sổ phản hồi tính từ lúc có kết quả đề xuất: Xanh **2h**, Vàng **6h**, Đỏ **12h**. Các con số là cấu hình, chỉnh được sau thực nghiệm. |
| BR-RA-20a | **Giãn qua đêm** (PO 21/10/2026): mọi hạn mà người chơi phải hành động — cửa sổ khai, cửa sổ phản hồi, grace, 2h nộp bằng chứng, 6h kháng nghị — được tính từ hạn gốc; nếu hạn cuối cùng rơi vào 23:00–07:00 giờ Việt Nam thì dời tới **08:00 sáng kế tiếp**. Giãn đúng một lần cho mỗi hạn, sau khi đã tính xong. Không áp cho SLA Admin. Đội thua chấp nhận ban đêm vẫn chốt ngay. *(phạm vi áp cho cửa sổ khai và cách tính một lần: quyết định của Claude)* |
| BR-RA-21 | Hết cửa sổ mà không có bất đồng → final theo kết quả đề xuất (tác vụ idempotent như BR-CM-32). Ngoại lệ: kết quả đề xuất Đỏ → Admin (BR-RA-17). |
| BR-RA-22 | **Đội thua chấp nhận** = một thành viên của đội bị xử thua theo kết quả đề xuất (với `NO_RESULT`: thành viên đội kia) làm một trong: bấm **Đồng ý**; gửi bản khai **cùng bên thắng** (điểm set có thể lệch); hoặc chính bản đề xuất là bản **tự khai đội mình thua** (BR-RA-04). Hệ quả: kèo đơn → final ngay; kèo đôi → final khi người còn lại của đội đó cũng chấp nhận, hoặc hết **grace 1h** mà người đó không phản đối (BR-CM-31, PO 21/10/2026). Áp chung cho cả ba cách, không có cách nào bỏ qua grace. *(thống nhất ba cách: quyết định của Claude)* |
| BR-RA-23 | **Slot trả thay:** chấp nhận do **partner được trả thay** thực hiện (Đồng ý, gửi bản cùng bên thắng, hay tự khai thua) **không** tính là đội thua chấp nhận: kết quả đề xuất chạy cửa sổ thường theo mức, và chỉ chốt sớm khi người trả (chủ kèo) cũng chấp nhận (PO 21/10/2026). Chấp nhận do người trả thực hiện áp BR-RA-22 bình thường. |
| BR-RA-24 | **Bất đồng → tranh chấp** (§5): một thành viên đội kia bấm **Phản đối** hoặc gửi bản **khác bên thắng**; hoặc đồng đội của người khai gửi bản khác bên thắng; hoặc người còn lại phản đối trong grace. Không có bước "chọn bản trong đội". Khi bấm Phản đối, người dùng chọn lý do: **"tỉ số sai"** → tranh chấp tỉ số; **"không có trận / vắng mặt / bỏ dở"** → sự cố (BR-RA-42). Phản đối không bắt buộc kèm ảnh lúc bấm, trừ người uy tín Thấp. Hành động nào tới server trước khi hồ sơ final thì có hiệu lực; một khi đã thành tranh chấp, chấp nhận đến sau không đóng tranh chấp mà chỉ là bằng chứng. *(bỏ bước chọn bản và thêm lý do phản đối: quyết định của Claude)* |
| BR-RA-26 | Ảnh/bản khai gửi sau khi đã final chỉ được lưu, không đổi kết quả. |
| BR-RA-27 | Cửa sổ khai chỉ giới hạn việc tạo **kết quả đề xuất đầu tiên**. Khi đã có kết quả đề xuất, mọi hành động phản hồi được phép tới hết cửa sổ phản hồi, kể cả khi vượt cửa sổ khai. *(quyết định của Claude)* |
| BR-RA-28 | Đồng ý và Chấp nhận phán quyết gắn với **đúng phiên bản** bản đề xuất/phán quyết người dùng đang xem; nếu bản đã bị thay (BR-RA-05) thì hành động bị từ chối và người dùng phải xem lại. *(quyết định của Claude)* |
| BR-RA-29 | Đồng đội gửi bản cùng bên thắng ở mức cao hơn thì cửa sổ phản hồi đang chạy được **rút ngắn** theo mức mới (tính từ lúc mở cửa sổ ban đầu), không bao giờ bị kéo dài. *(quyết định của Claude)* |

## 5. Tranh chấp tỉ số tự động hai tầng

### 5.1. Tầng 1 — luật bằng chứng (code thường)

| Mã | Quy tắc |
|---|---|
| BR-RA-30 | Mở tranh chấp → mở **2h nộp bằng chứng** cho cả roster (trong giới hạn ảnh). Ảnh nộp trong 2h được **giữ kín** với roster tới khi hết 2h hoặc cả hai đội bấm "Đã nộp đủ". Mỗi ảnh được đọc và xếp mức **riêng** (§4.2–4.3). Bằng chứng được gom theo **bên thắng mà ảnh ủng hộ** (A thắng / B thắng / không có kết quả), không theo người nộp hay đội. **Bằng chứng hợp lệ** = ảnh Xanh hoặc Vàng có tỉ số; ảnh lạ (Đỏ) chỉ bị loại riêng ảnh đó. Ảnh nộp trong 2h mà AI chưa đọc được thì thử lại tối đa 30 phút sau khi hết 2h; vẫn chưa đọc được thì tầng 1 không tự xử mà chuyển Admin. *(quyết định của Claude, trừ "Vàng là hợp lệ" — PO 21/10/2026)* |
| BR-RA-31 | Chỉ một bên thắng có bằng chứng hợp lệ → kết quả tạm theo bên đó. |
| BR-RA-32 | (gộp vào BR-RA-31: mọi bằng chứng hợp lệ cùng ủng hộ một bên thì là "chỉ một bên"). |
| BR-RA-33 | Không có bằng chứng hợp lệ nào → kết quả tạm `NO_RESULT` (khi final: chi phí 50:50, không rating). |
| BR-RA-34 | Có bằng chứng hợp lệ ủng hộ từ hai bên thắng trở lên (kể cả Xanh ngược Vàng) → tầng 2 (PO 21/10/2026). |
| BR-RA-34a | Kết quả tầng 1 là **kết quả tạm**: công bố kèm lý do theo luật, mở **6h kháng nghị** (BR-RA-38) (PO 21/10/2026). |

### 5.2. Tầng 2 — AI phán quyết tạm, Admin phúc thẩm

| Mã | Quy tắc |
|---|---|
| BR-RA-35 | AI nhận **chỉ văn bản, không nhận ảnh** (PO 21/10/2026): tỉ số AI đã đọc từ từng ảnh, kết quả kiểm tra BR-RA-13 (thời gian chụp, nghi trùng, chụp màn hình…), mức từng ảnh, thời điểm gửi; truy hồi (RAG) luật trong spec này + `competitive-matches.md` §5 và án lệ (BR-RA-63). AI **không** nhận uy tín của ai (khớp D60). AI trả về: một trong `TEAM_A_WIN`, `TEAM_B_WIN`, `NO_RESULT`; lý do; trích dẫn luật/án lệ; độ tin cậy 0–1. *(bỏ uy tín khỏi đầu vào: quyết định của Claude)* |
| BR-RA-36 | Độ tin cậy ≥ ngưỡng (mặc định 0,85, cấu hình) → công bố **phán quyết tạm** cho roster kèm lý do và trích dẫn, mở **6h kháng nghị**. |
| BR-RA-37 | Độ tin cậy < ngưỡng, AI lỗi, hoặc kết quả sai khuôn → chuyển Admin kèm bản phân tích nếu có. AI bị giới hạn lượt gọi thì thử lại tối đa 30 phút rồi mới chuyển Admin. *(quyết định của Claude)* |
| BR-RA-38 | **Kháng nghị** (áp cho kết quả tạm tầng 1 và phán quyết tạm tầng 2) (PO 21/10/2026): chỉ thành viên của **bên bị xử thua** được kháng nghị (với `NO_RESULT`: thành viên cả hai đội); trong 6h; bắt buộc kèm **ảnh mới** (tối đa 2, ngoài giới hạn 7) **hoặc** chỉ ra điểm sai cụ thể trong lý do của kết quả tạm/phán quyết tạm. Thiếu cả hai → bị từ chối, không lên Admin. Kháng nghị hợp lệ → Admin. |
| BR-RA-38a | Bên bị xử thua được bấm **Chấp nhận** để chốt sớm: kèo đơn → final ngay; kèo đôi → khi người còn lại cũng Chấp nhận (không có grace riêng — cửa sổ 6h vẫn là hạn chót). Chấp nhận của partner được trả thay áp BR-RA-23. *(quyết định của Claude)* |
| BR-RA-39 | Admin xử theo BR-CM-40..42 (SLA 48h, 3 kết quả, lý do, xem trước tác động, xác nhận hai bước, final). Admin thấy phân tích và phán quyết tạm của AI nhưng không bị ràng buộc. Khi giữ nguyên kết quả bị kháng nghị, Admin chọn "có căn cứ" hoặc "không có căn cứ" cho kháng nghị (dùng cho BR-RA-51). |
| BR-RA-40 | Mọi phán quyết tạm của AI, kể cả bị kháng nghị, được lưu cùng đầu vào, trích dẫn, độ tin cậy và kết quả cuối để đo đạc. |
| BR-RA-41 | Phán quyết của AI không bao giờ chứa số tiền. Code tính tiền từ kết quả cuối theo §4 của `competitive-matches.md`. |

### 5.3. Sự cố không phải tỉ số

| Mã | Quy tắc |
|---|---|
| BR-RA-42 | Báo sự cố (no-show, không đánh, bỏ dở, khác) giữ BR-CM-34..36 nhưng chuyển **thẳng Admin**, không qua chủ sân và tầng 1/2. Được báo trong cửa sổ khai, cửa sổ phản hồi hoặc 2h nộp bằng chứng; **mỗi người một lần cho mỗi hồ sơ**. Báo sự cố dừng mọi bộ đếm của hồ sơ. Admin xử sự cố thì **luôn ra luôn kết quả cuối** (một trong 3 kết quả theo BR-CM-41), dựa trên mọi bằng chứng đã có; hồ sơ không quay lại bước cũ. *(quyết định của Claude)* |

## 6. Uy tín người chơi

| Mã | Quy tắc |
|---|---|
| BR-RA-50 | Uy tín tính theo **người**, đếm vi phạm trong 90 ngày gần nhất: 0 → **Tốt**, 1 → **Cần chú ý**, ≥2 → **Thấp**. Tự hồi khi vi phạm cũ quá 90 ngày. |
| BR-RA-51 | Ghi vi phạm (PO 21/10/2026), **tối đa 1 vi phạm cho mỗi người trên mỗi hồ sơ**: **tự động** chỉ khi người đó nộp ảnh **trùng chính xác** (cùng checksum) ảnh của hồ sơ khác; **mọi trường hợp khác chỉ khi hồ sơ qua Admin và Admin xác nhận**: cố ý khai sai (kể cả sửa tay/gõ tay/chọn cột sai), ảnh gần trùng là gian lận, kháng nghị bị đánh dấu "không có căn cứ" (BR-RA-39), báo sự cố sai. Hồ sơ final tự động (không qua Admin) không sinh vi phạm nào ngoài trường hợp trùng chính xác. |
| BR-RA-52 | Tác động duy nhất (D60): người uy tín Thấp không được mức Xanh (tối đa Vàng) và phải kèm ảnh khi Phản đối. Không chặn tham gia kèo, không ảnh hưởng tiền/rating, không là đầu vào của AI. |
| BR-RA-53 | Uy tín chỉ hiển thị cho chính người chơi và Admin; không công khai (D31), không lộ qua lý do mức tin cậy (BR-RA-16). |

## 7. AI, nguồn mô hình và dữ liệu

| Mã | Quy tắc |
|---|---|
| BR-RA-60 | Chỉ dùng nguồn AI **miễn phí, đăng ký đơn giản** (không xác minh số điện thoại, không thẻ), theo thứ tự dự phòng chọn bằng biến môi trường. Đọc ảnh: Gemini (2 model) → Groq → OpenRouter `:free` → gõ tay. Tầng 2: Gemini → Groq → OpenRouter `:free` → chuyển Admin. Bỏ NVIDIA. Tên model không viết cứng; chi tiết ở `docs/architecture/result-ocr-tech-design.md` (PO 21/10/2026). |
| BR-RA-61 | Đồ án chỉ dùng dữ liệu giả của team. Free tier có thể dùng dữ liệu gửi lên để cải thiện sản phẩm; không đưa ảnh/người dùng thật lên free tier. |
| BR-RA-62 | RAG chỉ cho văn bản: luật (spec) và án lệ, ẩn danh. Tiền, trạng thái, roster lấy qua tool/API chỉ đọc, không vector hóa. |
| BR-RA-63 | Án lệ được **truy hồi** cho AI chỉ gồm: hồ sơ có quyết định Admin, và 30–50 ca mẫu team tự tạo (nhãn "mẫu"). Hồ sơ AI tự chốt không bị kháng nghị được lưu để đo đạc nhưng **không** đưa vào truy hồi, tránh AI tự củng cố lỗi. *(quyết định của Claude)* |

## 8. Trạng thái logic

```text
played -> declaration_open
  declaration_open -> proposed(xanh|vàng|đỏ)             (bản của đội đầu tiên)
  declaration_open -> provisional_no_result -> ...         (BR-CM-33, hạn giãn qua đêm)
  proposed -> acceptance_grace                             (đôi: một người đội thua chấp nhận)
  proposed | acceptance_grace -> final_result              (đơn chấp nhận / đôi đủ chấp nhận / hết grace / hết cửa sổ)
  proposed(đỏ) -> admin_review                             (hết cửa sổ hoặc có chấp nhận)
  proposed | acceptance_grace -> evidence_window           (bất đồng, lý do "tỉ số sai")
  evidence_window -> rule_ruling -> appeal_window          (tầng 1)
  evidence_window -> ai_ruling -> appeal_window            (tầng 2)
  evidence_window -> admin_review                          (AI không đọc được ảnh mới / AI tin cậy thấp / lỗi)
  appeal_window -> final_result | final_no_result          (hết 6h không kháng nghị hợp lệ / bên thua chấp nhận)
  appeal_window -> admin_review                            (kháng nghị hợp lệ)
  declaration_open | proposed | acceptance_grace | evidence_window -> admin_review   (sự cố)
  admin_review -> final_result | final_no_result
```

Chỉ `final_result`, `final_no_result`, `cancelled` giải phóng tiền tạm giữ. Mỗi
chuyển trạng thái có idempotency key. Không trạng thái nào dừng bộ đếm mà không có
đường ra: trạng thái duy nhất không có hạn tự động là `admin_review` (SLA 48h).

## 9. Thông báo

In-app + email, như §11 của `competitive-matches.md`, thêm:

- Có kết quả đề xuất (kèm mức tin cậy, lý do Vàng/Đỏ không nêu uy tín, hạn phản hồi).
- Grace kèo đôi: báo người còn lại "đồng đội đã chấp nhận, còn tới HH:MM để phản đối".
- Slot trả thay: báo chủ kèo khi partner được trả thay chấp nhận thua.
- Mở tranh chấp; nhắc trước khi hết 2h nộp bằng chứng.
- Kết quả tạm tầng 1 / phán quyết tạm tầng 2 (lý do, hạn kháng nghị, ai được kháng nghị).
- Kháng nghị bị từ chối vì thiếu căn cứ; chuyển Admin.
- Mọi hạn đã bị giãn qua đêm hiển thị giờ mới.
- Uy tín đổi mức (chỉ gửi chính người đó).

## 10. Đo lường cho NCKH

| Chỉ số | Cách đo |
|---|---|
| Độ chính xác đọc ảnh | Trên bộ ảnh mẫu có nhãn (giấy viết tay, bảng lật điểm, bảng điện tử, ảnh mờ): đúng từng ô; đúng bên thắng |
| Tỷ lệ mức Xanh/Vàng/Đỏ | Theo bản khai và theo ảnh |
| Thời gian từ `endAt` tới final | So với luồng cũ trên cùng bộ kịch bản mô phỏng |
| Tỷ lệ tranh chấp xử ở tầng 1 / tầng 2 / Admin | Theo hồ sơ tranh chấp |
| Tỷ lệ kháng nghị, kháng nghị bị từ chối vì thiếu căn cứ, phán quyết bị Admin lật | BR-RA-38..40 |
| Độ trung thực của lý do AI | Mỗi lý do có trích dẫn hợp lệ (kiểu RAGAS Faithfulness) |
| Token, độ trễ, số lần rơi xuống nguồn dự phòng | Log mỗi lần gọi AI |

## 11. Acceptance criteria

**Khai và mức tin cậy**
- `AC-RA-01` — Mọi người trong roster gửi được bản khai với ảnh từ thư viện; người ngoài roster bị từ chối.
- `AC-RA-02` — Bản khai đầu tiên của một đội mở cửa sổ phản hồi ngay, không chờ người khác gửi.
- `AC-RA-03` — AI lỗi hoặc trả JSON sai khuôn → gõ tay, bản khai tối đa Vàng; luồng không bị chặn.
- `AC-RA-04` — Gán mức đúng cho từng điều kiện BR-RA-15..17 (ít nhất 1 ca test mỗi điều kiện); lý do Vàng không bao giờ nêu uy tín.
- `AC-RA-05` — Sửa ô AI đọc chắc chắn → Vàng (không Đỏ), roster thấy số gốc và số đã sửa.
- `AC-RA-06` — Cột do người khai tự chọn → không bao giờ Xanh.
- `AC-RA-07` — BO3/BO5 mỗi set một ảnh gộp đúng; set nhiều ảnh lấy ảnh chụp muộn nhất; set không ảnh gõ tay → tối đa Vàng; bản 6 ảnh hoặc ảnh thứ 8/người (ngoài 2 ảnh kháng nghị) bị từ chối.
- `AC-RA-08` — Khai `NO_RESULT` hợp luật (hết giờ, hòa) gửi được và đi luồng phản hồi.

**Phản hồi và tự chốt**
- `AC-RA-09` — Cửa sổ 2h/6h/12h đúng theo mức; hết hạn không bất đồng → final đúng một lần.
- `AC-RA-10` — Hạn cuối rơi vào 23:00–07:00 dời tới 08:00 sáng kế tiếp, đúng một lần, cho mọi loại hạn ở BR-RA-20a; SLA Admin không bị giãn.
- `AC-RA-11` — Đội thua chấp nhận bằng Đồng ý, bản cùng bên thắng hoặc tự khai thua: đơn → final ngay; đôi → final khi người còn lại chấp nhận hoặc hết grace 1h; người còn lại phản đối trong grace → tranh chấp.
- `AC-RA-12` — Partner được trả thay chấp nhận/tự khai thua không mở grace và không chốt sớm; chủ kèo (người trả) chấp nhận thì áp luật chung.
- `AC-RA-13` — Bản Đỏ (trùng chính xác hoặc chụp trước giờ) không final bằng bất kỳ đường nào; hết cửa sổ hoặc có chấp nhận → Admin.
- `AC-RA-14` — Đồng đội của người khai gửi bản khác bên thắng → tranh chấp, không có bước chọn bản.
- `AC-RA-15` — Phản đối lý do "không có trận" → sự cố tới Admin; lý do "tỉ số sai" → tranh chấp.
- `AC-RA-16` — Đồng ý gắn phiên bản: bản đã bị thay thì Đồng ý cũ bị từ chối.

**Tranh chấp**
- `AC-RA-17` — Ảnh nộp trong 2h bị giữ kín tới khi hết 2h hoặc cả hai đội bấm "Đã nộp đủ".
- `AC-RA-18` — Tầng 1 gom theo bên thắng; một ảnh Đỏ chỉ bị loại riêng; xử đúng ba nhánh BR-RA-31, 33, 34; Xanh ngược Vàng → tầng 2.
- `AC-RA-19` — Tầng 2: tin cậy ≥ ngưỡng → phán quyết tạm + 6h; < ngưỡng, lỗi, AI không đọc được ảnh mới sau 30 phút → Admin; đầu vào AI không chứa uy tín.
- `AC-RA-20` — Kháng nghị: người thuộc bên thắng, kháng nghị không ảnh mới và không chỉ ra điểm sai, hoặc quá 6h → bị từ chối; kháng nghị hợp lệ → Admin; phán quyết tạm không có hiệu lực tiền khi đang ở Admin.
- `AC-RA-21` — Bên bị xử thua Chấp nhận → final sớm đúng quy tắc đơn/đôi.
- `AC-RA-22` — Sự cố: mỗi người một lần/hồ sơ; Admin xử ra luôn kết quả cuối.

**Tiền, uy tín, AI**
- `AC-RA-23` — Không đường code nào cho AI ghi số tiền hoặc kết quả ngoài 3 giá trị; tiền tính lại từ kết quả cuối khớp tuyệt đối.
- `AC-RA-24` — Tiền tạm giữ và rating khóa suốt mọi trạng thái trước final; retry/hai scheduler không chia hai lần.
- `AC-RA-25` — Vi phạm tự động chỉ khi ảnh trùng chính xác; các loại khác chỉ khi Admin xác nhận; tối đa 1 vi phạm/người/hồ sơ; hồ sơ tự final không sinh vi phạm khác.
- `AC-RA-26` — Uy tín Thấp → không có Xanh, Phản đối phải kèm ảnh; không ảnh hưởng tiền/rating; API công khai không trả uy tín.
- `AC-RA-27` — Hết mọi nguồn AI (hoặc cờ AI tắt) → luồng vẫn final được qua gõ tay, tầng 1 hoặc Admin.
- `AC-RA-28` — Kho án lệ truy hồi chỉ trả hồ sơ có quyết định Admin và ca mẫu.

## 12. Để lại cho người triển khai

- Thuật toán dấu vân tay ảnh và ngưỡng "gần trùng".
- Prompt, khuôn JSON chi tiết và model cụ thể mỗi nguồn; thứ tự thử lại khi lỗi 429.
- Chuyển ảnh HEIC (mặc định iPhone) sang định dạng được phép ở phía FE hay báo lỗi.
- Data model: mở rộng `ResultClaim` / `ResultEvidence` / `MatchResultCase` hiện có hay
  thêm bảng; trạng thái mới so với `ResultCaseStatus` hiện có; giữ sweeper `provider_review`
  cho tới khi hồ sơ cũ đóng hết.
- Chỗ chạy AI: trong `matchmaking-service` qua `packages/ai`, không tạo service mới.
- Mockup desktop phải được PO duyệt trước khi làm UI.

## 13. Câu hỏi còn mở cho PO

Không còn câu hỏi mở. Các điểm đánh dấu *(quyết định của Claude)* chờ PO soát khi duyệt spec.
