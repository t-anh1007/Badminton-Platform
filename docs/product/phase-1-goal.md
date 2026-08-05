---
type: goal
scope: Giai đoạn 1 (toàn bộ)
kind: orchestration-goal (goal điều phối, chạy theo milestone có cổng kiểm)
phase: 1
status: draft-for-review
executor: Claude Code (toàn bộ 10 milestone Gboot..G7 — không Codex)
reviewer: Claude self-verification (unit/integration/contract/Playwright E2E + review diff + kiểm scope)
final_acceptance: PO (Tuan Anh) — chỉ nghiệm thu cuối phase
commission_rate_r: 0.10 (D19, 2026-08-06; AC tham số hóa theo r)
created: 2026-08-06
revised: 2026-08-06 (PO đính chính D21: Claude thực thi trọn goal, bỏ Hybrid/Codex; thêm 8 E2E phase-level)
source: docs/product/phase-1-handoff.md (Gboot..G7) + docs/DESIGN.md + 4 spec ở docs/product/specs/
---

# Goal bao quát — Hoàn thành toàn bộ Giai đoạn 1

> **Hình dạng.** KHÔNG phải goal phẳng "làm hết GĐ1 một lượt" (anti-pattern). Đây là **goal
> điều phối**: đích là cả phase, nhưng chạy theo **milestone tuần tự có cổng kiểm** — mỗi
> milestone pass gate (Claude self-verify) xong mới sang milestone kế. Chi tiết 6 trường Hard
> Gate của G1…G7 ở [phase-1-handoff.md](phase-1-handoff.md); Gboot ở [gboot-goal.md](gboot-goal.md);
> Gdesign ở [gdesign-goal.md](gdesign-goal.md). File này tham chiếu, không lặp lại.

## Vai trò (đính chính PO 2026-08-06 — D21)

| Vai | Ai | Trách nhiệm |
|---|---|---|
| Executor | **Claude Code** | Thực thi **toàn bộ** 10 milestone Gboot→G7: implementation backend/frontend |
| Reviewer / QA | **Claude self-verification** | unit + integration + contract + Playwright E2E; review diff; kiểm scope; kiểm thử độc lập cuối phase |
| Nghiệm thu | **PO (Tuan Anh)** | Chỉ nghiệm thu **cuối phase**, hoặc khi có escalation |

> **Không Codex.** Phiên goal này Claude làm trọn từ đầu đến cuối — không giao task, không
> dispatch, không phụ thuộc Codex. **[CODEX_ORCHESTRATION.md](../CODEX_ORCHESTRATION.md) KHÔNG
> áp dụng cho goal này** (xem [D21](decision-log.md)). Cổng chuyển milestone do Claude tự kiểm
> chứng quyết, có evidence ghi vào `phase-1-progress.md`.

---

## Mục tiêu phase (Outcome)

Toàn bộ **40 chức năng / 198 AC** của GĐ1 (4 module: `account-access`, `venue-scheduling`,
`court-booking`, `finance-disputes`) chạy được và pass acceptance, trên khung monorepo
schema-per-service, với **frontend `apps/web`** bám sát design baseline (DESIGN.md, giống
actl.me ~90% theo định nghĩa ở [§1.1](../DESIGN.md)) — sẵn sàng bàn giao GĐ2.

## Success condition (phase-level, khách quan)

1. **Cổng cấu trúc (Gboot + G0):** monorepo dựng được, `npm ci` sạch, 6 service migrate sạch
   trên CSDL rỗng, không FK/query xuyên schema, **test âm** chứng minh role service A không
   truy cập được schema B; lược đồ Prisma phản ánh đủ 12 thay đổi ở [decision-log §5](decision-log.md).
2. **Cổng design baseline (Gdesign):** 5 page shell GĐ1 ([DESIGN.md §4](../DESIGN.md) nhóm "GĐ1")
   có component baseline (design tokens + layout + motion) đạt tiêu chí "giống 90%" ở
   [DESIGN.md §1.1](../DESIGN.md); G1…G7 build UI **trên** baseline này, không dựng lại từ đầu.
3. **Cổng nghiệp vụ (G1…G7):** cả **198 AC** đạt trạng thái `pass` trong **test ledger**
   (`phase-1-progress.md` §Test ledger) — **không** dùng coverage-matrix làm thước đo (xem ghi
   chú dưới). Phân bổ: G1=34, G2=43, G3=25, G4=32, G5=24, G6=26, G7=14.
4. **Cổng bảo toàn tiền (end-to-end, G7):** kịch bản đầy đủ dùng **nhiều booking riêng biệt** —
   một booking đi nhánh hủy/hoàn một phần, **một booking khác đã hoàn tất** đi nhánh tranh chấp
   (booking đã hủy không thể tranh chấp) — sau khi hàng chờ đối soát rỗng, `AC-FIN-14-8` bảo
   toàn giá trị ở mức hệ thống pass.

> **Ghi chú.** [coverage-matrix.md](coverage-matrix.md) `purpose: Trạng thái
> spec` — nó theo dõi **spec đã duyệt**, KHÔNG phải test pass. Giữ nó **read-only**. Thước đo
> "done" của implementation là **test ledger** riêng trong `phase-1-progress.md`.

## Context — đọc trước khi làm

- [phase-1-handoff.md](phase-1-handoff.md) — Hard Gate G1…G7 · [gboot-goal.md](gboot-goal.md) · [gdesign-goal.md](gdesign-goal.md)
- [DESIGN.md](../DESIGN.md) — design baseline, §1.1 định nghĩa "giống actl.me 90%", §4 sáu trang
- [decision-log.md](decision-log.md) — D1…D18, §5 (12 thay đổi data-model), §7 (sửa sau review 3)
- 4 spec: [account-access](specs/account-access.md) · [venue-scheduling](specs/venue-scheduling.md) · [court-booking](specs/court-booking.md) · [finance-disputes](specs/finance-disputes.md)
- ADR: [0002](../decisions/0002-tech-stack-microservices.md) · [0003](../decisions/0003-multi-role-dual-wallet.md) · [0004](../decisions/0004-db-strategy-and-repo-boundary.md)
- Kiến trúc: [system-architecture.md](../architecture/system-architecture.md) · [flows.md](../architecture/flows.md) · [data-model.md](../architecture/data-model.md)

## Chuỗi milestone (thứ tự cứng, có cổng kiểm)

```
Gboot ─> G0 ─> Gdesign ─> G1 ─> G2 ─> G3 ─> G4 ─> (G5 ∥ G6) ─> G7
                    [Claude Code thực thi toàn bộ]
```

| # | Gói | Exec | Outcome một dòng | AC | Gate chi tiết |
|---|---|---|---|---:|---|
| 0a | **Gboot** | Claude | Khung monorepo + Prisma, 6 service skeleton + 3 package | — | [gboot-goal.md](gboot-goal.md) |
| 0b | **G0** | Claude | Lược đồ Prisma đủ 12 thay đổi data-model, migrate sạch | — | [handoff G0](phase-1-handoff.md) |
| 0c | **Gdesign** | Claude | Design baseline 5 page shell GĐ1, giống actl.me 90%, `apps/web` khung | — | [gdesign-goal.md](gdesign-goal.md) · [DESIGN.md](../DESIGN.md) |
| 1 | **G1** | Claude | Đăng ký/xác minh/đăng nhập/hồ sơ; Admin khóa–khôi phục có ghi vết | 34 | [handoff G1](phase-1-handoff.md) |
| 2 | **G2** | Claude | Duyệt NCC, khai báo cơ sở/sân/giờ/giá/quy tắc, lịch hợp nhất, booking quầy | 43 | [handoff G2](phase-1-handoff.md) |
| 3 | **G3** | Claude | Tìm sân (list+map), xem lịch trống+giá, giữ chỗ 10 phút chống đua | 25 | [handoff G3](phase-1-handoff.md) |
| 4 | **G4** | Claude | Thanh toán số dư/SePay, xác nhận trong hold, ghi doanh thu + hoa hồng `r=10%` ba vế cân | 32 | [handoff G4](phase-1-handoff.md) |
| 5 | **G5** | Claude | Hủy hoàn theo bậc thang, đổi sân con; đảo đủ ba vế của G4 | 24 | [handoff G5](phase-1-handoff.md) |
| 6 | **G6** | Claude | Theo dõi doanh thu, đáo hạn `pending→available`, rút tiền, đối soát | 26 | [handoff G6](phase-1-handoff.md) |
| 7 | **G7** | Claude | Khiếu nại trong 24h, Admin xử dứt điểm; **E2E đa booking + bảo toàn hệ thống** | 14 | [handoff G7](phase-1-handoff.md) |

- **`apps/web`:** loại khỏi **Gboot + G0** (đó là backend/schema); **có mặt từ Gdesign trở đi**.
  Mỗi gói G1…G7 build UI của nó trên baseline Gdesign.
- **G5 ∥ G6:** độc lập, làm song song được sau khi G4 pass. **G7 cần G6.**

## Ràng buộc xuyên suốt (mọi milestone phải tuân)

- 8 quyết định xuyên module ở [handoff §3](phase-1-handoff.md) + 9 ràng buộc bất biến ở
  [SCOPE_BASELINE §4](../SCOPE_BASELINE.md).
- Tech stack ADR 0002 (không chọn lại). DB schema-per-service ADR 0004: **không FK, không query
  xuyên schema**; giao tiếp chỉ qua API/event.
- Không mở rộng phạm vi ngoài "Ngoài phạm vi" của từng gói.
- Frontend bám **DESIGN.md**: cấm WebGL/3D/canvas/video nền (ràng buộc hiệu năng [DESIGN §5](../DESIGN.md)).

## Nguyên tắc vận hành (Operating rules)

- **Milestone song song chỉ khi độc lập cùng dependency frontier** (hiện chỉ G5∥G6). Ngoài cặp
  đó, chạy tuần tự. Mỗi milestone **self-verify và commit riêng**; không gộp nhiều milestone.
- Không bắt đầu milestone khi phần phụ thuộc của nó chưa pass gate (Claude self-verify).
- Trong mỗi gói: **xác minh từng chức năng** ngay sau khi xong (chạy nhóm test/AC của chức năng
  đó), không dồn cả gói rồi mới test.
- Progress log + **test ledger** tại `docs/product/phase-1-progress.md`. Ledger là bằng chứng
  bàn giao; mỗi AC một dòng (xem cấu trúc trong file đó).
- **Không vẽ diagram như một sản phẩm bàn giao.** Spec (198 AC) + [flows.md](../architecture/flows.md)
  §1–§6 đã đủ để code — flows.md là nguồn sơ đồ có thẩm quyền. Cột "Sơ đồ cần vẽ" trong các spec
  là **tham chiếu, không phải việc phải làm**. Chỉ vẽ **tối thiểu** (mermaid inline) khi thực sự
  cần gỡ một quyết định coding; không tạo milestone/độ trễ cho việc vẽ.
- Không đổi lược đồ đã chốt ở G0 khi làm G1…G7; nếu lộ ra lược đồ thiếu → **dừng** (xem Pause).

## Vòng kiểm chứng (Validation loop)

**Trong lúc làm mỗi gói:** theo đúng "Validation loop" của gói đó trong handoff (G3 test đồng
thời ≥20 request; G4/G5/G6 chạy kiểm tra **bảo toàn ba vế** sau mỗi luồng chạm tiền; G7 test
đồng hồ giả lập hai phía mốc 24h).

**Cổng cuối mỗi milestone (trước khi sang gói kế):**
- Toàn bộ AC của gói đạt `pass` trong test ledger, mỗi dòng có evidence (test tự động hoặc E2E/thủ công).
- Build + migrate của (các) service gói đó chạm vào đều sạch.
- **Claude self-verification:** review diff của gói, kiểm scope không lệch, ghi kết quả +
  evidence vào `phase-1-progress.md` trước khi sang gói kế.

**Cổng cuối phase:**
- Cả 198 AC `pass` trong ledger.
- **8 hành trình Playwright E2E phase-level** (xem mục dưới) đều xanh.
- Claude **kiểm thử độc lập cuối phase** + kịch bản E2E đa booking chứng minh `AC-FIN-14-8`
  (bảo toàn giá trị mức hệ thống).

## Phase-level Playwright E2E (8 hành trình bắt buộc)

Ngoài test đơn vị/integration/contract theo từng AC, phase phải có **8 kịch bản Playwright E2E**
chạy xuyên nhiều service/màn hình. Đây là bằng chứng end-to-end ở cổng cuối phase; kết quả (pass +
đường dẫn spec/trace) ghi vào [`phase-1-progress.md` §6](phase-1-progress.md).

| # | Hành trình | Chạm gói |
|---|---|---|
| 1 | Đăng ký → xác minh email → đăng nhập → cập nhật hồ sơ | G1 |
| 2 | Đăng ký nhà cung cấp → Admin duyệt → cấu hình sân/lịch/giá | G1, G2 |
| 3 | Tìm sân → giữ slot → thanh toán → booking `confirmed` | G3, G4 |
| 4 | Tự hủy và hoàn tiền theo bậc thang | G5 |
| 5 | Phía sân hủy và hoàn 100% | G5 |
| 6 | Doanh thu `pending` → `available` → rút tiền | G6 |
| 7 | Tranh chấp trong 24 giờ → Admin xử lý | G7 |
| 8 | Đối soát giao dịch chưa khớp | G6 (FIN-14) |

> Hành trình 3–8 dùng **nhiều booking riêng biệt** khi cần: booking đã hủy (HT4/5) không thể đi
> tiếp nhánh tranh chấp (HT7) — tranh chấp chỉ áp cho booking đã hoàn tất.

> **Công cụ E2E: Playwright** (chốt). Chọn vì đúng nhu cầu của 8 journey: đa vai trong một luồng
> (player+provider+admin) qua browser context; chặn/giả lập webhook SePay qua `route/fulfill`;
> tua đồng hồ cho mốc giữ chỗ 10 phút và tranh chấp 24h qua `page.clock`; trace/video soi lỗi
> tiền; chạy song song miễn phí. Bằng chứng **bảo toàn tiền ba vế** vẫn chủ yếu ở tầng
> integration/contract (nhanh, chính xác), E2E là lớp khẳng định cuối.

## Hoàn thành khi (Done when)

Cả 4 mục "Success condition" pass, test ledger 198/198 `pass` có evidence, `phase-1-progress.md`
ghi đủ **10 milestone** (Gboot, G0, Gdesign, G1…G7) đã xong + đã reviewer OK, và **PO nghiệm thu
cuối phase** (một lần, không phải từng milestone).

## Dừng lại nếu (Pause if)

- Bất kỳ gói nào lộ ra **nhu cầu FK/query xuyên schema** → ranh giới service vẽ sai, quay lại
  kiến trúc, không phá D17.
- Bất kỳ **luồng chạm tiền nào không bảo toàn đủ ba vế** (G4/G5/G6/G7) → dừng ngay.
- Chống đặt trùng (G3) phải dựa vào kiểm tra tầng ứng dụng thay vì ràng buộc CSDL (`BR-BOK-03`).
- Xuất hiện đường **hoàn tác bút toán `payout`** đã ghi (`BR-FIN-19`) → dừng tuyệt đối.
- Cấu trúc thư mục phải lệch khỏi [system-architecture §9](../architecture/system-architecture.md).
- Bất kỳ gói nào đòi thêm vai trò ngoài `player/provider/admin` (ràng buộc bất biến #7).
- **Frontend muốn dùng WebGL/3D/animation nặng** để "giống actl.me hơn" → dừng; DESIGN §1.1 đã
  chốt 90% là layout/motion/UX, KHÔNG phải cảnh 3D.
- PO muốn đổi `r` khỏi 10% → dừng phần tính tiền G4 tới khi có giá trị mới.

---

## Vì sao goal này an toàn để chạy

- **Đo được:** đích là test ledger 198 AC `pass` + một kịch bản bảo toàn end-to-end đa booking.
- **Chia cổng:** 10 milestone tuần tự, mỗi milestone Claude self-verify (test + review diff +
  kiểm scope) → sai sót bị chặn tại gói, không lan toàn phase.
- **Rủi ro chính đã có Pause rule:** ranh giới service sai (FK/query xuyên schema); mất tiền do
  đảo thiếu vế (bảo toàn ba vế mọi luồng tiền); trôi phạm vi UI sang 3D (chốt 90% ở DESIGN §1.1).
- **`r` đã chốt (10%)** nên goal chạy xuyên tới G7 không bị chặn giữa chừng.
- **Bằng chứng bàn giao:** `phase-1-progress.md` (progress + test ledger) + kết luận review từng gói.
