---
type: handoff
phase: 1
status: ready
updated: 2026-08-05
purpose: Đầu vào trực tiếp cho phiên /goal-griller tạo goal triển khai cho Codex. Viết theo 6 trường Hard Gate của skill.
---

# Gói bàn giao — Giai đoạn 1

Toàn bộ 40 chức năng GĐ1 (198 AC) đã được PO phê duyệt ngày 2026-08-05. Tài liệu này chia
chúng thành **chín gói**: Gboot (dựng khung), G0 (áp lược đồ), và bảy gói nghiệp vụ G1–G7. Mỗi
gói viết theo đúng 6 trường Hard Gate của `goal-griller`, để phiên tạo goal dựng được `/goal`
mà không phải phỏng vấn lại.

> **Sửa đổi 2026-08-05 sau vòng review thứ ba.** Đã khắc phục: BR-FIN-17 nay cho một sự kiện
> ánh xạ tới một tập đối ứng có tổng bằng số tiền sự kiện (xử lý được chi vượt); FIN-09 bổ
> sung AC ghi và kiểm chứng hoa hồng vào ví `platform` khi booking xác nhận; số AC từng gói
> đã đếm lại; G0 tách phần bootstrap; đồ thị phụ thuộc sửa mâu thuẫn; G8 bị hòa vào các gói
> sở hữu nghiệp vụ; danh sách quyết định chặn thu hẹp đúng phạm vi. Xem [decision-log §7](decision-log.md).

Các gói Admin **không tách riêng**: mỗi màn hình quản trị nằm trong gói sở hữu nghiệp vụ của
nó (VEN-02 ở G2, ACC-08 ở G1, FIN-11 và FIN-14 ở G6, FIN-13 ở G7).

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
Gboot (bootstrap monorepo + Prisma)
 └─> G0 (áp lược đồ data model)
      └─> G1 (danh tính)
           └─> G2 (nhà cung cấp, lịch sân)
                └─> G3 (tìm sân, giữ chỗ)
                     └─> G4 (thanh toán, xác nhận)
                          ├─> G5 (hủy, hoàn tiền) ─┐
                          └─> G6 (doanh thu, rút) ─┴─> G7 (tranh chấp)
```

**Chuỗi bắt buộc:** Gboot → G0 → G1 → G2 → G3 → G4 → (G5 song song G6) → G7.

- G5 và G6 độc lập nhau, làm song song được sau G4.
- **G7 cần G6**, vì tranh chấp hoãn việc chuyển `pending → available` mà mốc giải phóng đó do
  G6 dựng (FIN-09). Đây là lý do G7 đứng sau G6, không song song với nó.
- Không có gói quản trị riêng. Màn hình Admin nằm trong gói sở hữu nghiệp vụ; một khu vực điều
  hướng gom chúng lại là việc frontend trong từng gói, không phải một goal riêng.

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

## Gboot — Bootstrap monorepo và Prisma

> Gói này tồn tại vì repo hiện **chưa có `package.json` hay file `.prisma` nào** — không có
> runtime để "migration chạy sạch". Phải dựng khung trước khi áp lược đồ.

**Outcome.** Khung monorepo chạy được: workspaces, sáu service skeleton, `packages/shared`,
`packages/ai`, `packages/eventbus`, và Prisma khởi tạo cho từng service, khớp cấu trúc thư mục
ở [system-architecture.md §9](../architecture/system-architecture.md).

**Success condition.** `npm install` ở gốc chạy sạch; mỗi service có `prisma/schema.prisma`
rỗng nhưng hợp lệ trỏ tới schema Postgres riêng; `prisma migrate` chạy được trên một CSDL rỗng;
lệnh khởi động local dựng được toàn bộ service mà không lỗi.

**Scope boundary.** Chỉ dựng khung và cấu hình. Không viết entity, không viết nghiệp vụ. Không
chọn lại tech stack — theo [ADR 0002](../decisions/0002-tech-stack-microservices.md).

**Context.** [system-architecture.md §9](../architecture/system-architecture.md) · [ADR 0002](../decisions/0002-tech-stack-microservices.md) · quyết định kỹ thuật §10 phải chốt trước (xem mục 5)

**Validation loop.** Trong lúc làm: mỗi service build được sau khi thêm. Cuối: `npm install`
và `prisma migrate` chạy sạch trên máy trống.

**Stop / pause.** Dừng nếu chiến lược DB (một Postgres nhiều schema hay tách hẳn) và ranh giới
monorepo chưa được PO chốt — cả hai chặn gói này.

---

## G0 — Áp lược đồ data model

**Outcome.** Lược đồ Prisma của từng service phản ánh đúng mọi quyết định đã duyệt, trước khi
viết bất kỳ dòng nghiệp vụ nào.

**Success condition.** **Mười hai** thay đổi `data-model.md` tại [decision-log.md §5](decision-log.md)
đã được áp: `USER.role` thành tập vai trò; `WALLET` bỏ `UK` trên `userId`, thêm `walletType`
gồm `personal|business|platform`, thêm ba phân vùng `pending|available|reserved` cho ví
`business`; `PROVIDER.status` thêm `rejected`; `BOOKING.userId` cho phép rỗng và thêm trường
khách nội bộ; `BOOKING` thêm nguyên nhân hủy; bỏ `CANCELLATION_POLICY`; `BOOKING_REVIEW` đánh
dấu hoãn; `WITHDRAWAL_REQUEST` thêm `partially_paid` và `paidAmount`; `SEPAY_EVENT` thêm bốn
trạng thái; **`DISPUTE` thêm mốc hạn 24 giờ tính từ lúc ca kết thúc và liên kết tới booking**.
Migration chạy sạch trên CSDL rỗng.

**Scope boundary.** Chỉ sửa lược đồ và tài liệu kiến trúc. Không viết logic nghiệp vụ.

**Context.** [decision-log.md §5](decision-log.md) (12 dòng `data-model.md`) · [ADR 0003](../decisions/0003-multi-role-dual-wallet.md) · [data-model.md](../architecture/data-model.md)

**Validation loop.** Trong lúc làm: migration chạy được sau mỗi thay đổi. Cuối: so từng dòng
trong 12 dòng bảng §5 với lược đồ thực tế; không thiếu dòng nào.

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

## G4 — Thanh toán, xác nhận và ghi doanh thu

**Chức năng:** BOK-07, BOK-08, FIN-01, FIN-02, FIN-03, FIN-04, FIN-06, **cộng phần ghi doanh
thu của FIN-09** (AC-FIN-09-1, 09-2, 09-3) — **32 AC**

> Phần ghi doanh thu và hoa hồng nằm ở đây, không ở G6, vì nó xảy ra ngay khi booking xác nhận
> và **G5 phụ thuộc vào nó để đảo khi hoàn tiền**. G6 chỉ giữ phần hiển thị và đáo hạn của FIN-09.

**Outcome.** Người chơi trả tiền bằng số dư hoặc SePay, booking được xác nhận trong cửa sổ
hold, tiền về muộn không bị mất mà vào ví, và mỗi lần xác nhận ghi đúng doanh thu ròng cho chủ
sân cộng hoa hồng vào ví `platform`.

**Success condition.** 32 AC pass. Đặc biệt: `AC-BOK-07-2` tiền về sau khi hold hết hạn thì
booking `cancelled` và tiền vào ví, **không** phục hồi booking; `AC-BOK-07-4` consumer
idempotent khi `PaymentCompleted` phát lại; `AC-FIN-03-3` ví `business` không chi được cho
`payment`; **`AC-FIN-09-2` ba vế cân bằng tại thời điểm xác nhận** — người chơi trả `gross`,
chủ sân nhận `gross × (1 − r)`, ví `platform` nhận `gross × r`.

**Scope boundary.** Được đổi: `finance-service` gồm consumer `BookingConfirmed` ghi
`release` cộng `commission`, phần xác nhận booking của `venue-booking-service`, outbox và
consumer hai bên. Không đổi: logic giữ chỗ đã xong ở G3. Ngoài phạm vi: cổng thẻ, đặt cọc, trả
tại sân, trả một phần bằng số dư phần còn lại qua SePay.

**Context.** [court-booking.md](specs/court-booking.md) BOK-07 → [finance-disputes.md](specs/finance-disputes.md) FIN-01…06, FIN-09 (`BR-FIN-06`) → [flows.md §2, §5](../architecture/flows.md) → [system-architecture.md §8.1](../architecture/system-architecture.md)

**Validation loop.** Trong lúc làm: mỗi consumer phải có test phát lại sự kiện hai lần; sau khi
có consumer doanh thu, chạy ngay `AC-FIN-09-2`. Cuối: 32 AC, cộng một lượt chạy trọn saga bằng
đồng hồ giả lập cho nhánh tiền về muộn.

**Stop / pause.** Dừng nếu bảo đảm idempotent đòi hỏi khóa phân tán — kiến trúc đã chọn outbox
cộng bảng `ProcessedEvent`, không dùng distributed transaction. Dừng nếu **hoa hồng chưa có tỷ
lệ `r` được chốt** — đây là điểm chặn của G4, xem mục 5.

---

## G5 — Hủy, hoàn tiền và điều chỉnh

**Chức năng:** BOK-09, BOK-10, FIN-07, FIN-08 (4)

**Outcome.** Người chơi hủy và nhận hoàn theo bậc thang đã biết trước; phía sân đổi sân con
hoặc hủy kèm hoàn 100%.

**Success condition.** **24 AC** pass. **Chốt chặn bắt buộc:** `AC-FIN-07-5` và
`AC-FIN-08-4` — cộng tổng ba vế gồm phần hoàn về ví `personal`, doanh thu ròng còn lại của chủ
sân, và hoa hồng còn lại ở ví `platform`, phải bằng đúng số tiền người chơi đã trả, ở cả ba
mốc hủy.

**Scope boundary.** Được đổi: luồng hủy của `venue-booking-service`, luồng hoàn của
`finance-service`. Không đổi: cách ghi doanh thu ban đầu ở G4 — G5 chỉ **đảo** những gì G4 đã
ghi. Ngoài phạm vi: hủy một phần thời lượng, dời lịch, nhượng booking, đổi giờ.

**Context.** [court-booking.md](specs/court-booking.md) BOK-09, BOK-10 → [finance-disputes.md](specs/finance-disputes.md) `BR-FIN-14`, `BR-FIN-15`, FIN-07, FIN-08 → [flows.md §4](../architecture/flows.md)

**Phụ thuộc.** Chỉ G4 (cần doanh thu và hoa hồng đã được G4 ghi để đảo). Song song được với G6.

**Validation loop.** Trong lúc làm: sau mỗi luồng hoàn, chạy ngay phép kiểm tra bảo toàn ba vế.
Cuối: 24 AC.

**Stop / pause.** Dừng nếu bất kỳ luồng hoàn nào không đảo đủ ba vế. `BR-FIN-14` là quy tắc
dùng chung cho cả ba luồng hoàn; hai vòng review trước đã bắt được đúng lỗi đảo thiếu vế này.

---

## G6 — Doanh thu, rút tiền và đối soát

**Chức năng:** phần hiển thị và đáo hạn của FIN-09 (AC-FIN-09-4, 09-5, 09-6), FIN-10, FIN-11,
FIN-14 — **26 AC**

> Phần **ghi** doanh thu của FIN-09 đã thuộc G4. G6 chỉ giữ phần **hiển thị** doanh thu và
> chuyển `pending → available` khi đáo hạn.

**Outcome.** Chủ sân theo dõi được doanh thu, biết phần nào đáo hạn rút được, rút được tiền; và
mọi giao dịch ngân hàng đều có đối ứng trong ledger.

**Success condition.** 26 AC pass. **Bắt buộc:** `AC-FIN-09-4` chuyển `pending → available` sau
24 giờ; `AC-FIN-10-6` hai yêu cầu rút đồng thời không chiếm cùng một khoản; `AC-FIN-11-6` khoản
rút chỉ bị trừ đúng một lần; `AC-FIN-14-10` yêu cầu đã có `payout` không chuyển được sang
`rejected`; `AC-FIN-14-8` bảo toàn ở mức hệ thống sau khi hàng chờ đối soát rỗng.

**Scope boundary.** Được đổi: `finance-service` phần đáo hạn doanh thu và chi trả, màn hình
Admin rút tiền và đối soát. Không đổi: consumer ghi doanh thu đã làm ở G4. Ngoài phạm vi: API
chi hộ tự động của ngân hàng, chi hàng loạt, rút tự động định kỳ, rút từ ví cá nhân.

**Context.** [finance-disputes.md](specs/finance-disputes.md) FIN-09 (phần đáo hạn), FIN-10, FIN-11, FIN-14 và `BR-FIN-16` … `BR-FIN-19` → [flows.md §3](../architecture/flows.md)

**Phụ thuộc.** Chỉ G4. Song song được với G5.

**Validation loop.** Trong lúc làm: sau mỗi thay đổi chạm ví, chạy `AC-FIN-14-8`. Cuối: 26 AC.
Kịch bản đầy đủ có tranh chấp thuộc **G7**, không chạy ở đây.

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

**Scope boundary.** Được đổi: `finance-service` phần tranh chấp, màn hình Admin xử tranh chấp.
Không đổi: mốc giải phóng doanh thu đã làm ở G6. Ngoài phạm vi: khiếu nại lại quyết định Admin,
phạt chủ sân, AI tự quyết, tranh chấp do chủ sân khởi xướng.

**Context.** [finance-disputes.md](specs/finance-disputes.md) FIN-12, FIN-13 → [flows.md §6](../architecture/flows.md) → `BR-FIN-06`, `BR-FIN-07`, `BR-FIN-14`

**Phụ thuộc.** G6 (cần mốc giải phóng `pending → available` để hoãn đúng khoản khi có tranh chấp).

**Validation loop.** Trong lúc làm: test đồng hồ giả lập cho từng phía của mốc 24 giờ. Cuối:
14 AC, trong đó test đồng thời chạy tối thiểu 20 lần để bắt cuộc đua không ổn định. **Kịch bản
tích hợp đầy đủ** — nạp, thanh toán hai đường, hủy hoàn một phần, tranh chấp, rút — chạy ở đây
vì đây là gói cuối chạm tiền, và là nơi `AC-FIN-14-8` được kiểm ở dạng end-to-end.

**Stop / pause.** Dừng nếu việc hoãn giải phóng doanh thu cần phong tỏa toàn bộ ví thay vì
riêng khoản của booking bị tranh chấp.

---

## 4. Rủi ro còn lại

| # | Rủi ro | Mức | Ghi chú |
|---|---|---|---|
| R1 | GĐ1 chiếm 40/62 chức năng, dồn phần lớn khối lượng vào nửa đầu; ngôi sao demo F-03 nằm trọn ở GĐ2 | Cao | Van an toàn đã ghi ở [phasing.md §10](phasing.md): tới mốc giữa GĐ1 mà hành trình J1 chưa chạy end-to-end thì cắt FIN-12 và FIN-13 xuống GĐ3 |
| R2 | Chiến lược DB và ranh giới monorepo chưa được PO chốt | Trung bình | **Chặn Gboot.** Chỉ hai quyết định này chặn khâu bootstrap |
| R3 | Ba vòng review đều tìm ra lỗi tiền trong `finance-disputes` | Trung bình | Đã sửa 9 lỗi qua ba vòng. G4, G5, G6, G7 nên được review lại sau khi code xong, không chỉ dựa vào AC pass |
| R4 | Tỷ lệ hoa hồng chưa chốt con số | Thấp | **Chặn G4** (điểm đầu tiên ghi hoa hồng), không chặn Gboot hay G0. Mọi AC viết theo tham số `r` |
| R5 | Bộ dữ liệu seed cho demo chưa chuẩn bị | Thấp | Chỉ ảnh hưởng F-05 ở GĐ3 |

## 5. Quyết định chặn, theo đúng gói bị chặn

Không phải mọi quyết định đều chặn từ đầu. Chỉ chốt cái nào khi gói của nó tới:

| Quyết định | Chặn gói nào | Trạng thái |
|---|---|---|
| Chiến lược DB (một Postgres nhiều schema hay tách hẳn); ranh giới monorepo | **Gboot** | Chưa chốt — [system-architecture.md §10](../architecture/system-architecture.md) mục 1, 2 |
| Tỷ lệ hoa hồng `r` | **G4** | Chưa chốt; đề xuất khởi đầu 10% |
| Client nối WebSocket thẳng matchmaking hay qua gateway | **Không chặn GĐ1** | Thuộc GĐ2 (matchmaking), bỏ qua ở GĐ1 |
| Thời điểm tạo ví | **Không chặn** | Đã được spec chốt: ví `personal` tạo khi xác minh email (`AC-ACC-02-5`), ví `business` khi duyệt nhà cung cấp (`AC-VEN-02-1`) |

Nói cách khác: chỉ **DB và monorepo** chặn việc bắt đầu. Hoa hồng chốt trước G4. Hai mục còn
lại ở `system-architecture.md §10` không chặn GĐ1.

## 6. Trình tự vào việc

1. PO chốt chiến lược DB và ranh giới monorepo → mở khoá **Gboot**.
2. Chạy Gboot rồi G0 để có khung và lược đồ khớp spec.
3. G1 → G2 → G3 → G4 (chốt tỷ lệ hoa hồng trước bước này) → (G5 song song G6) → G7.

Sau khi Gboot và G0 xong, phiên `/goal-griller` tiếp theo dựng `/goal` cho từng gói bằng đúng
sáu trường ở trên, không cần phỏng vấn lại.
