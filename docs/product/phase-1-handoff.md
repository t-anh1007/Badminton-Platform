---
type: handoff
phase: 1
status: ready
updated: 2026-08-05
purpose: Đầu vào trực tiếp cho phiên /goal-griller tạo goal triển khai cho Codex. Viết theo 6 trường Hard Gate của skill.
---

# Gói bàn giao — Giai đoạn 1

Toàn bộ 40 chức năng GĐ1 đã được PO phê duyệt ngày 2026-08-05. Tài liệu này chia chúng thành
**8 gói triển khai độc lập**, mỗi gói viết theo đúng 6 trường Hard Gate của `goal-griller`, để
phiên tạo goal dựng được `/goal` mà không phải phỏng vấn lại.

## 1. Danh sách chức năng

| Module | Mã | Số lượng |
|---|---|---:|
| `account-access` | ACC-01 … ACC-08 | 8 |
| `venue-scheduling` | VEN-01 … VEN-09 | 9 |
| `court-booking` | BOK-01 … BOK-10 | 10 |
| `finance-disputes` | FIN-01…04, FIN-06…14 | 13 |

`FIN-05` thuộc GĐ2. `FIN-14` được bổ sung theo D15.

## 2. Thứ tự triển khai và phụ thuộc

```
G0 (data model)
 └─> G1 (danh tính)
      ├─> G2 (nhà cung cấp, lịch sân)
      │    └─> G3 (tìm sân, giữ chỗ)
      │         └─> G4 (thanh toán, xác nhận)  <── cần G1 để có ví
      │              ├─> G5 (hủy, hoàn tiền)
      │              ├─> G6 (doanh thu, rút tiền)
      │              └─> G7 (tranh chấp)  <── cần G6 để có mốc giải phóng
      └─> G8 (quản trị) — làm song song được sau G2
```

G5, G6, G7 độc lập nhau, làm song song được sau khi G4 xong.

## 3. Quyết định xuyên module mà mọi gói phải tuân

| # | Quyết định |
|---|---|
| D3, ADR 0003 | Vai trò là tập hợp; ví `personal` và `business` tách riêng; không chuyển tiền giữa hai ví của cùng người |
| D16 | Ví hệ thống `platform` giữ hoa hồng |
| D6 | Email là định danh duy nhất; không dùng SMS ở GĐ1 |
| D9, D10 | Chính sách hủy thống nhất toàn nền tảng, ba bậc 100/50/0 theo giờ bắt đầu ca; phần không hoàn thuộc chủ sân |
| D11 | Hạn tranh chấp trùng cửa sổ 24 giờ |
| D5 | Đóng cửa hoặc vô hiệu hóa sân bị chặn cứng nếu còn booking `confirmed` hoặc `HOLD` |
| D12 | Điều chỉnh booking chỉ là đổi sân con, giữ giờ và giá |
| D14 | Chủ sân giữ cả khoản không hoàn lẫn doanh thu bán lại slot |

Chín ràng buộc bất biến tại [`SCOPE_BASELINE.md` §4](../SCOPE_BASELINE.md) vẫn có hiệu lực đầy đủ.

---

## G0 — Áp thay đổi data model

**Outcome.** `docs/architecture/data-model.md` và lược đồ Prisma phản ánh đúng mọi quyết định
đã duyệt, trước khi viết bất kỳ dòng nghiệp vụ nào.

**Success condition.** Mười thay đổi tại [decision-log.md §5](decision-log.md) đã được áp:
`USER.role` thành tập vai trò; `WALLET` bỏ `UK` trên `userId`, thêm `walletType` gồm
`personal|business|platform`, thêm `reserved`; `PROVIDER.status` thêm `rejected`;
`BOOKING.userId` cho phép rỗng và thêm trường khách nội bộ; `BOOKING` thêm nguyên nhân hủy;
`WITHDRAWAL_REQUEST` thêm `partially_paid` và `paidAmount`; `SEPAY_EVENT` thêm bốn trạng thái;
bỏ `CANCELLATION_POLICY`; `BOOKING_REVIEW` đánh dấu hoãn. Migration chạy sạch trên CSDL rỗng.

**Scope boundary.** Chỉ sửa lược đồ và tài liệu kiến trúc. Không viết logic nghiệp vụ.

**Context.** [decision-log.md §5](decision-log.md) · [ADR 0003](../decisions/0003-multi-role-dual-wallet.md) · [data-model.md](../architecture/data-model.md)

**Validation loop.** Trong lúc làm: migration chạy được. Cuối: so từng dòng bảng §5 với lược đồ thực tế.

**Stop / pause.** Dừng nếu một thay đổi mâu thuẫn với thay đổi khác, hoặc nếu phát hiện thực
thể nào trong data model không có chức năng nào dùng tới — đó là dấu hiệu kiến trúc lại tự mở
rộng phạm vi, đã xảy ra hai lần với `BOOKING_REVIEW` và `CANCELLATION_POLICY`.

---

## G1 — Danh tính và quyền truy cập

**Chức năng:** ACC-01 … ACC-08 (8)

**Outcome.** Người dùng đăng ký bằng email, xác minh, đăng nhập và quản lý được hồ sơ; Admin
khóa và khôi phục được tài khoản kèm ghi vết.

**Success condition.** 34 AC của [account-access.md](specs/account-access.md) pass. Đặc biệt:
`AC-ACC-03-6` token chứa đủ tập vai trò; `AC-ACC-08-3` khóa chủ sân thì booking đã xác nhận
giữ nguyên còn cơ sở biến mất khỏi tìm kiếm; `AC-ACC-01-4` không tồn tại mật khẩu bản rõ trong CSDL.

**Scope boundary.** Được đổi: `account-service`, lược đồ của nó, gateway JWT. Không đổi: các
service khác. Ngoài phạm vi: OAuth, 2FA, SMS, quản lý phiên, xóa tài khoản, đổi email.

**Context.** [account-access.md](specs/account-access.md) → [ADR 0003](../decisions/0003-multi-role-dual-wallet.md) → [system-architecture.md §4.2](../architecture/system-architecture.md) → [flows.md §1](../architecture/flows.md)

**Validation loop.** Trong lúc làm: chạy nhóm test của từng chức năng sau khi xong chức năng đó.
Cuối: cả 34 AC, cộng kiểm tra thủ công rằng thông báo lỗi ở `AC-ACC-03-4` trùng khớp từng ký tự.

**Stop / pause.** Dừng nếu việc phân quyền đòi thêm vai trò ngoài `player`, `provider`, `admin`
— ràng buộc bất biến #7 chỉ cho một quyền vận hành Admin.

---

## G2 — Nhà cung cấp và lịch sân

**Chức năng:** VEN-01 … VEN-09 (9)

**Outcome.** Nhà cung cấp được duyệt, khai báo được cơ sở, sân con, giờ hoạt động, biểu giá,
quy tắc đặt sân, xem được lịch hợp nhất và ghi được booking tại quầy.

**Success condition.** 43 AC của [venue-scheduling.md](specs/venue-scheduling.md) pass. Đặc biệt:
`AC-VEN-02-1` duyệt hồ sơ thì cộng vai `provider` mà vẫn giữ `player` và tạo ví `business`;
`AC-VEN-05-6` chặn đóng cửa khi còn `HOLD`, cho phép sau khi hold hết hạn; `AC-VEN-09-4` booking
nội bộ không sinh bút toán nào.

**Scope boundary.** Được đổi: `venue-booking-service` phần cung, `finance-service` chỉ ở điểm
tạo ví `business`. Không đổi: luồng đặt sân của người chơi. Ngoài phạm vi: giấy tờ sở hữu sân,
nhiều tài khoản nhân viên, xóa cứng cơ sở hay sân con.

**Context.** [venue-scheduling.md](specs/venue-scheduling.md) → [account-access.md](specs/account-access.md) (vai trò) → [system-architecture.md §4.3](../architecture/system-architecture.md)

**Validation loop.** Trong lúc làm: test theo từng chức năng. Cuối: 43 AC, cộng một lượt chạy
tay dựng trọn một cơ sở từ hồ sơ tới lịch hiển thị được.

**Stop / pause.** Dừng nếu logic biểu giá cần khái niệm ngoài `BR-VEN-07`, ví dụ khuyến mãi
hoặc giá động — cả hai đã bị loại khỏi phạm vi.

---

## G3 — Tìm sân và giữ chỗ

**Chức năng:** BOK-01 … BOK-06 (6)

**Outcome.** Người chơi tìm được sân trên danh sách và bản đồ, xem lịch trống kèm giá, chọn
slot hợp lệ và giữ chỗ 10 phút.

**Success condition.** 25 AC tương ứng trong [court-booking.md](specs/court-booking.md) pass.
**Bắt buộc:** `AC-BOK-06-2` kiểm thử đồng thời chứng minh hai người bấm cùng lúc chỉ một hold
được tạo — đây là bằng chứng cho ràng buộc bất biến #4.

**Scope boundary.** Được đổi: `venue-booking-service` phần cầu, frontend tìm sân. Không đổi:
lược đồ đã chốt ở G0, luồng tiền. Ngoài phạm vi: gợi ý sân thông minh, bản đồ nhiệt, đặt nhiều
sân một lượt, đặt lặp.

**Context.** [court-booking.md](specs/court-booking.md) BOK-01…06 → [venue-scheduling.md](specs/venue-scheduling.md) `BR-VEN-03`, `BR-VEN-07`, `BR-VEN-10` → [system-architecture.md §4.3](../architecture/system-architecture.md)

**Validation loop.** Trong lúc làm: test đơn vị cho tính giá bắc cầu khung giá. Cuối: 25 AC,
trong đó test đồng thời chạy tối thiểu 20 yêu cầu song song.

**Stop / pause.** Dừng ngay nếu chống đặt trùng phải dựa vào kiểm tra ở tầng ứng dụng thay vì
ràng buộc CSDL — `BR-BOK-03` yêu cầu ràng buộc loại trừ ở tầng CSDL cộng khóa khi tạo hold.

---

## G4 — Thanh toán và xác nhận booking

**Chức năng:** BOK-07, BOK-08, FIN-01, FIN-02, FIN-03, FIN-04, FIN-06 (7)

**Outcome.** Người chơi trả tiền bằng số dư hoặc SePay, booking được xác nhận trong cửa sổ
hold, và tiền về muộn không bị mất mà vào ví.

**Success condition.** 28 AC tương ứng pass. Đặc biệt: `AC-BOK-07-2` tiền về sau khi hold hết
hạn thì booking `cancelled` và tiền vào ví, **không** phục hồi booking; `AC-BOK-07-4` consumer
idempotent khi `PaymentCompleted` phát lại; `AC-FIN-03-3` ví `business` không chi được cho
`payment`.

**Scope boundary.** Được đổi: `finance-service`, phần xác nhận booking của `venue-booking-service`,
outbox và consumer hai bên. Không đổi: logic giữ chỗ đã xong ở G3. Ngoài phạm vi: cổng thẻ,
đặt cọc, trả tại sân, trả một phần bằng số dư phần còn lại qua SePay.

**Context.** [court-booking.md](specs/court-booking.md) BOK-07 → [finance-disputes.md](specs/finance-disputes.md) FIN-01…06 → [flows.md §2, §5](../architecture/flows.md) → [system-architecture.md §8.1](../architecture/system-architecture.md)

**Validation loop.** Trong lúc làm: mỗi consumer phải có test phát lại sự kiện hai lần. Cuối:
28 AC, cộng một lượt chạy trọn saga bằng đồng hồ giả lập cho nhánh tiền về muộn.

**Stop / pause.** Dừng nếu bảo đảm idempotent đòi hỏi khóa phân tán — kiến trúc đã chọn outbox
cộng bảng `ProcessedEvent`, không dùng distributed transaction.

---

## G5 — Hủy, hoàn tiền và điều chỉnh

**Chức năng:** BOK-09, BOK-10, FIN-07, FIN-08 (4)

**Outcome.** Người chơi hủy và nhận hoàn theo bậc thang đã biết trước; phía sân đổi sân con
hoặc hủy kèm hoàn 100%.

**Success condition.** 19 AC tương ứng pass. **Chốt chặn bắt buộc:** `AC-FIN-07-5` và
`AC-FIN-08-4` — cộng tổng ba vế gồm phần hoàn về ví `personal`, doanh thu ròng còn lại của chủ
sân, và hoa hồng còn lại ở ví `platform`, phải bằng đúng số tiền người chơi đã trả, ở cả ba
mốc hủy.

**Scope boundary.** Được đổi: luồng hủy của `venue-booking-service`, luồng hoàn của
`finance-service`. Không đổi: cách ghi doanh thu ban đầu ở G4. Ngoài phạm vi: hủy một phần
thời lượng, dời lịch, nhượng booking, đổi giờ.

**Context.** [court-booking.md](specs/court-booking.md) BOK-09, BOK-10 → [finance-disputes.md](specs/finance-disputes.md) `BR-FIN-14`, `BR-FIN-15`, FIN-07, FIN-08 → [flows.md §4](../architecture/flows.md)

**Validation loop.** Trong lúc làm: sau mỗi luồng hoàn, chạy ngay phép kiểm tra bảo toàn ba vế.
Cuối: 19 AC.

**Stop / pause.** Dừng nếu bất kỳ luồng hoàn nào không đảo đủ ba vế. `BR-FIN-14` là quy tắc
dùng chung cho cả ba luồng hoàn; hai vòng review trước đã bắt được đúng lỗi đảo thiếu vế này.

---

## G6 — Doanh thu, rút tiền và đối soát

**Chức năng:** FIN-09, FIN-10, FIN-11, FIN-14 (4)

**Outcome.** Chủ sân theo dõi được doanh thu và rút được tiền; mọi giao dịch ngân hàng đều có
đối ứng trong ledger.

**Success condition.** 26 AC tương ứng pass. **Bắt buộc:** `AC-FIN-10-6` hai yêu cầu rút đồng
thời không chiếm cùng một khoản; `AC-FIN-11-6` khoản rút chỉ bị trừ đúng một lần;
`AC-FIN-14-10` yêu cầu đã có `payout` không chuyển được sang `rejected`; `AC-FIN-14-8` bảo
toàn ở mức hệ thống sau khi hàng chờ đối soát rỗng.

**Scope boundary.** Được đổi: `finance-service` phần doanh thu và chi trả, màn hình Admin.
Không đổi: luồng thanh toán ở G4. Ngoài phạm vi: API chi hộ tự động của ngân hàng, chi hàng
loạt, rút tự động định kỳ, rút từ ví cá nhân.

**Context.** [finance-disputes.md](specs/finance-disputes.md) FIN-09…11, FIN-14 và `BR-FIN-16` … `BR-FIN-19` → [flows.md §3](../architecture/flows.md)

**Validation loop.** Trong lúc làm: sau mỗi thay đổi chạm ví, chạy `AC-FIN-14-8`. Cuối: 26 AC,
cộng một kịch bản đầy đủ gồm nạp, thanh toán hai đường, hủy, tranh chấp và rút.

**Stop / pause.** Dừng nếu xuất hiện bất kỳ đường nào cho phép hoàn tác một bút toán `payout`
đã ghi. `BR-FIN-19` cấm tuyệt đối, vì đó là kịch bản nền tảng mất tiền thật.

---

## G7 — Tranh chấp

**Chức năng:** FIN-12, FIN-13 (2)

**Outcome.** Người chơi khiếu nại được trong 24 giờ và Admin ra quyết định dứt điểm với dòng
tiền được điều chỉnh đúng.

**Success condition.** 14 AC tương ứng pass. **Bắt buộc:** `AC-FIN-12-6` kiểm thử đồng thời
đúng tại mốc 24 giờ, khẳng định không bao giờ vừa giải phóng tiền vừa chấp nhận tranh chấp;
`AC-FIN-13-8` bảo toàn ba vế sau mọi quyết định.

**Scope boundary.** Được đổi: `finance-service` phần tranh chấp, màn hình Admin. Không đổi:
mốc giải phóng doanh thu đã làm ở G6. Ngoài phạm vi: khiếu nại lại quyết định Admin, phạt chủ
sân, AI tự quyết, tranh chấp do chủ sân khởi xướng.

**Context.** [finance-disputes.md](specs/finance-disputes.md) FIN-12, FIN-13 → [flows.md §6](../architecture/flows.md) → `BR-FIN-06`, `BR-FIN-07`, `BR-FIN-14`

**Validation loop.** Trong lúc làm: test đồng hồ giả lập cho từng phía của mốc 24 giờ. Cuối:
14 AC, trong đó test đồng thời chạy tối thiểu 20 lần để bắt cuộc đua không ổn định.

**Stop / pause.** Dừng nếu việc hoãn giải phóng doanh thu cần phong tỏa toàn bộ ví thay vì
riêng khoản của booking bị tranh chấp.

---

## G8 — Quản trị

**Chức năng:** VEN-02, ACC-08 (đã làm ở G1, G2 — gói này chỉ là màn hình gom lại)

**Outcome.** Admin có một nơi duy nhất để duyệt hồ sơ nhà cung cấp, khóa và khôi phục tài
khoản, xử lý rút tiền, tranh chấp và đối soát.

**Success condition.** Mọi chức năng Admin đã pass AC ở các gói trước đều truy cập được từ một
khu vực quản trị thống nhất, và mọi thao tác đều ghi vết kèm lý do bắt buộc.

**Scope boundary.** Chỉ gom giao diện. Không thêm quyền mới, không thêm nghiệp vụ mới.

**Context.** Các file spec đã duyệt, phần nào có actor là Admin.

**Validation loop.** Cuối: chạy lại toàn bộ AC có actor Admin qua đường giao diện mới.

**Stop / pause.** Dừng nếu phát sinh nhu cầu phân nhỏ quyền Admin — ràng buộc bất biến #7 chỉ
cho phép một quyền vận hành duy nhất.

---

## 4. Rủi ro còn lại

| # | Rủi ro | Mức | Ghi chú |
|---|---|---|---|
| R1 | GĐ1 chiếm 40/62 chức năng, dồn phần lớn khối lượng vào nửa đầu; ngôi sao demo F-03 nằm trọn ở GĐ2 | Cao | Van an toàn đã ghi ở [phasing.md §10](phasing.md): tới mốc giữa GĐ1 mà hành trình J1 chưa chạy end-to-end thì cắt FIN-12 và FIN-13 xuống GĐ3 |
| R2 | Bốn quyết định kỹ thuật ở [system-architecture.md §10](../architecture/system-architecture.md) chưa được PO xác nhận | Trung bình | Không chặn spec, nhưng phải chốt trước khi Codex bắt đầu G0 |
| R3 | Hai vòng review đều tìm ra lỗi tiền trong `finance-disputes` | Trung bình | Đã sửa 6 lỗi. G5 và G6 nên được review lại sau khi code xong, không chỉ dựa vào AC pass |
| R4 | Tỷ lệ hoa hồng chưa chốt con số | Thấp | Mọi AC viết theo tham số `r`; đặt lúc triển khai |
| R5 | Bộ dữ liệu seed cho demo chưa chuẩn bị | Thấp | Chỉ ảnh hưởng F-05 ở GĐ3 |

## 5. Việc phải làm trước khi tạo goal

1. PO xác nhận 4 quyết định kỹ thuật ở `system-architecture.md` §10.
2. Chốt giá trị khởi đầu của tỷ lệ hoa hồng.
3. Chạy G0 để data model khớp với spec đã duyệt.

Sau ba việc đó, phiên `/goal-griller` tiếp theo dựng `/goal` cho từng gói G1 đến G8 bằng đúng
sáu trường ở trên, không cần phỏng vấn lại.
