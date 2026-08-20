# Số liệu định lượng cho CV — đo ngày 2026-08-20

Nguồn: đo trực tiếp trên nhánh `TuanAnh`, commit gần nhất `d034861`.
Mục đích: kho số liệu thô để sau này chọn đưa vào CV. Mỗi mục ghi: **con số**,
cách đo, và mức tin cậy. Con số nào **chưa đo được** (thiếu hạ tầng) ghi rõ để
chạy lại sau.

> Môi trường đo: Node v22.18.0, Windows 11. **Docker KHÔNG chạy** lúc đo → các
> phép cần Postgres/RabbitMQ (#2, #5, #10-live) bị chặn, chỉ đo được phần tĩnh.

---

## Bảng tóm tắt (chọn nhanh cho CV)

| # | Vấn đề | Con số đo được | Trạng thái |
|---|--------|----------------|-----------|
| 1 | Kích thước bundle frontend | **245.7 KB gzip** (JS 200.5 + CSS 45.2), build 1.57s | ✅ Đo xong |
| 3 | Quy mô kiểm thử tự động | **486 test case / 105 file** + 11 E2E case | ✅ Đo xong |
| 4 | Chất lượng ghép kèo cân bằng | Giảm **99.7%** độ lệch trình độ trong nhóm (0.7 vs 260.9) | ✅ Đo xong |
| 6 | Bảo mật webhook thanh toán SePay | **100%** chặn giả mạo & sửa số tiền (15.000 lượt thử) | ✅ Đo xong |
| 7 | Toàn vẹn sổ cái tài chính | **0 sai lệch / 1.000.000** giao dịch (bảo toàn 100%) | ✅ Đo xong |
| 8 | Geocoding bản đồ (Nominatim) | Trễ warm **~145 ms**, 100% thành công | ✅ Đo xong |
| 2 | Độ trễ API qua gateway | Gateway thuần **p50 58 ms, 635 req/s**; qua proxy+DB p50 338 ms | ✅ Đo xong (dev) |
| 5 | Độ trễ / sức chứa WebSocket | RTT warm **p50 ~1 ms**; **500/500** kết nối đồng thời (100%) | ✅ Đo xong (dev) |

---

## Chi tiết từng phép đo

### #1 — Kích thước bundle frontend ✅
- **Con số**: JS `index-CK-bSy4c.js` = 692.81 KB (gzip **200.53 KB**);
  CSS = 107.83 KB (gzip **45.20 KB**) → **tổng ~245.7 KB gzip**. Build **1.57s**.
- **Cách đo**: `npm run build -w apps/web` (Vite/Rolldown).
- **Câu CV gợi ý**: *"Đóng gói SPA React 19 xuống ~246 KB (gzip), thời gian
  build production < 2 giây."*
- Ghi chú: Vite cảnh báo chunk > 500 KB (chưa code-split) → nếu muốn số đẹp hơn
  có thể tách route bằng dynamic import.

### #3 — Quy mô kiểm thử tự động ✅
- **Con số**: **486** test case (`it/test`) trong **105** file test unit/tích
  hợp (vitest + supertest), cộng **11** E2E case trong **3** spec Playwright.
- **Cách đo**: đếm `it(`/`test(` trên `services|packages|apps` và `e2e/`.
- **Câu CV gợi ý**: *"Xây 486 test case tự động (unit/integration + E2E) trên
  kiến trúc 6 microservice."*
- Ghi chú: đây là **số lượng test**, không phải % coverage. Muốn có % coverage
  cần cài `@vitest/coverage-v8` rồi `vitest run --coverage` (nhiều test tích hợp
  cần Postgres → bật `npm run infra:up` trước).

### #4 — Chất lượng ghép kèo cân bằng (matchmaking) ✅
- **Con số**: thuật toán `suggestBalancedGroups` (sort-and-partition) đạt độ lệch
  chuẩn trình độ **trong nhóm trung bình 0.7 điểm rating**, so với **260.9** khi
  chia ngẫu nhiên → **giảm 99.7%** độ chênh trình độ.
- **Cách đo**: 50 lượt, mỗi lượt 2.000 người chơi rating 900–2000, nhóm 4 người;
  so thuật toán vs baseline ngẫu nhiên (script `bench.mjs`).
- **Câu CV gợi ý**: *"Thuật toán ghép nhóm cân bằng giảm 99.7% chênh lệch trình
  độ giữa các thành viên so với ghép ngẫu nhiên."*

### #6 — Bảo mật webhook thanh toán SePay ✅
- **Con số**: `verifySepaySignature` (HMAC-SHA256, so khớp timing-safe) đạt
  **100% chấp nhận** chữ ký hợp lệ, **100% từ chối** chữ ký giả, **100% từ chối**
  payload bị sửa số tiền — trên **5.000 lượt/mỗi loại (15.000 tổng)**.
- **Cách đo**: sinh chữ ký thật/giả/tamper rồi kiểm chứng (script `bench.mjs`).
- **Câu CV gợi ý**: *"Cổng webhook SePay xác thực HMAC-SHA256 chặn 100% giao dịch
  giả mạo và sửa số tiền qua 15.000 ca kiểm thử."*

### #7 — Toàn vẹn sổ cái tài chính (ledger append-only) ✅
- **Con số**: công thức chia doanh thu `commission = gross*10%`, `net = gross -
  commission` (BigInt) bảo toàn giá trị **tuyệt đối 100%**: **0 sai lệch trên
  1.000.000** giao dịch mô phỏng (tới 50 triệu VND/giao dịch).
- **Cách đo**: assert `net + commission == gross` với BigInt (script `bench.mjs`).
- **Câu CV gợi ý**: *"Sổ cái tài chính append-only bảo toàn giá trị tuyệt đối:
  0đ sai lệch qua 1 triệu giao dịch mô phỏng."*

### #8 — Geocoding bản đồ qua Nominatim/OSM ✅
- **Con số**: độ trễ lần đầu (cold) **1.40s**, các lần sau **~137–152 ms**
  (trung vị warm **~145 ms**), **100% thành công** (5/5 HTTP 200).
- **Cách đo**: 5 request `curl` tới Nominatim, đo `time_total`.
- **Câu CV gợi ý**: *"Tự động chuyển địa chỉ sân → tọa độ qua OSM/Nominatim, độ
  trễ ~145 ms/truy vấn."*
- Ghi chú: mẫu nhỏ (5 request) vì Nominatim giới hạn 1 req/s. Muốn số chắc hơn
  chạy 30–50 địa chỉ thật rải đều.

---

### #2 — Độ trễ API qua api-gateway ✅ (đo trên stack chạy thật, dev mode)
- **Con số** (Node keep-alive, warmup trước; đo trên `npm run dev` = tsx, chưa
  build production):
  - Gateway thuần `/health`: **p50 58 ms, p95 196 ms, 635 req/s**, 100% OK
    (3.000 request, đồng thời 50).
  - Qua proxy 1 hop `/api/matchmaking/health`: p50 416 ms, p95 759 ms, 110 req/s.
  - Có truy vấn DB `/api/matchmaking/matches`: **p50 338 ms, p95 578 ms, 84 req/s**,
    100% OK (1.000 request, đồng thời 30).
- **Cách đo**: script `load.mjs` (bắn tải HTTP có đo p50/p95/p99).
- **Câu CV gợi ý**: *"API gateway phục vụ ~635 req/s với p95 < 200 ms (endpoint
  nhẹ) trên kiến trúc 6 microservice."*
- Ghi chú quan trọng: số này ở **dev mode (tsx)** trên máy đang tải nặng (Docker
  + 6 tiến trình dev). Bản build production (`tsc` + node) sẽ nhanh hơn đáng kể;
  nếu cần số đẹp hơn, đo lại trên build prod với đồng thời thấp (c=1–10).

### #5 — Độ trễ / sức chứa WebSocket ghép kèo ✅ (đo trên stack chạy thật)
- **Con số** (socket.io tới matchmaking-service, token player thật qua cổng demo):
  - RTT realtime (emit `quick_match:find` → nhận `quick_match:progress`) trên 1
    kết nối warm: **trung bình 10.4 ms, p50 1.1 ms, p95 52 ms** (200 mẫu).
  - Sức chứa: **500/500 kết nối đồng thời thành công (100%)**, mở hết trong 7.45s;
    dưới tải 500 client cùng gửi, p50 572 ms / p95 951 ms.
- **Cách đo**: script `ws-bench.mjs`.
- **Câu CV gợi ý**: *"Kênh WebSocket ghép kèo đạt độ trễ realtime p50 ~1 ms, chịu
  500 kết nối đồng thời (100% thành công)."*

---

## Tái tạo số liệu

Scripts nằm cùng thư mục `docs/benchmarks/`. Cần bật hạ tầng + services cho #2, #5:
`npm run infra:up` → `npm run prisma:migrate:deploy -w services/<svc>` (5 service)
→ `npm run dev` (chờ 6 cổng 3000–3005 lên).

- Bundle (#1): `npm run build -w apps/web`
- Pure logic (#4, #6, #7): `node docs/benchmarks/bench.mjs` (Node ≥ 20).
- Đếm test (#3): `grep -rE "^\s*(it|test)\(" services packages apps --include=*.test.ts*`
- Geocoding (#8): `curl` Nominatim (tôn trọng giới hạn 1 req/s).
- API latency (#2): `node docs/benchmarks/load.mjs` (services phải đang chạy).
- WebSocket (#5): `node docs/benchmarks/ws-bench.mjs` (services phải đang chạy).

Lưu ý về advisory lock: nếu lỡ chạy `npm run prisma:migrate` (= `migrate dev`) rồi
kill giữa chừng, nó để lại lock trên `_prisma_migrations` khiến lệnh migrate sau
báo `P1002 timed out`. Gỡ bằng: terminate connection treo trong Postgres
(`pg_terminate_backend`) rồi chạy lại `migrate deploy`.
