---
type: progress-log + test-ledger
phase: 1
status: not-started
updated: 2026-08-06
purpose: Bằng chứng bàn giao GĐ1 — trạng thái milestone + test ledger từng AC (198 dòng). KHÁC coverage-matrix.md (file kia theo dõi spec đã duyệt; file này theo dõi implementation đã test pass).
---

# Tiến độ + Test ledger — Giai đoạn 1

Nguồn goal: [phase-1-goal.md](phase-1-goal.md). Chuỗi 10 milestone:
`Gboot → G0 → Gdesign → G1 → G2 → G3 → G4 → (G5 ∥ G6) → G7`.

Executor: **Claude Code** cho toàn bộ 10 milestone (không Codex — xem [D21](decision-log.md)).
Cổng chuyển milestone do **Claude self-verification** quyết (test pass + review diff + kiểm scope,
có evidence). **PO chỉ nghiệm thu cuối phase** hoặc khi có escalation. Nhờ vậy goal chạy xuyên GĐ1
không dừng chờ PO 10 lần.

## 1. Trạng thái milestone

| # | Gói | Executor | Trạng thái | AC pass/tổng | Self-verify OK (cho sang gói kế) | Ngày |
|---|---|---|---|---:|---|---|
| 0a | Gboot | Claude | **self-verify OK** | — (6/6 proof) | ✅ (xem §3) | 2026-08-06 |
| 0b | G0 | Claude | chưa bắt đầu | — | — | — |
| 0c | Gdesign | Claude | chưa bắt đầu | — | — | — |
| 1 | G1 | Claude | chưa bắt đầu | 0/34 | — | — |
| 2 | G2 | Claude | chưa bắt đầu | 0/43 | — | — |
| 3 | G3 | Claude | chưa bắt đầu | 0/25 | — | — |
| 4 | G4 | Claude | chưa bắt đầu | 0/32 | — | — |
| 5 | G5 | Claude | chưa bắt đầu | 0/24 | — | — |
| 6 | G6 | Claude | chưa bắt đầu | 0/26 | — | — |
| 7 | G7 | Claude | chưa bắt đầu | 0/14 | — | — |

Trạng thái: `chưa bắt đầu` · `đang làm` · `đã test` · `self-verify OK` · `báo cáo PO`.
PO nghiệm thu ghi ở §5, chỉ cuối phase.

## 2. Test ledger (198 AC)

> Một dòng mỗi AC. `status`: `todo` · `pass` · `fail` · `blocked`. `evidence`: đường dẫn file
> test / log / ảnh E2E. **Thước đo "done" của phase** — không phải coverage-matrix. Sinh sẵn đủ
> 198 dòng để không bỏ sót AC nào; điền dần khi làm từng gói.

| AC ID | Milestone | Automated test | E2E/manual proof | Status | Evidence |
|---|---|---|---|---|---|
| AC-ACC-01-1 | G1 |  |  | todo |  |
| AC-ACC-01-2 | G1 |  |  | todo |  |
| AC-ACC-01-3 | G1 |  |  | todo |  |
| AC-ACC-01-4 | G1 |  |  | todo |  |
| AC-ACC-02-1 | G1 |  |  | todo |  |
| AC-ACC-02-2 | G1 |  |  | todo |  |
| AC-ACC-02-3 | G1 |  |  | todo |  |
| AC-ACC-02-4 | G1 |  |  | todo |  |
| AC-ACC-02-5 | G1 |  |  | todo |  |
| AC-ACC-03-1 | G1 |  |  | todo |  |
| AC-ACC-03-2 | G1 |  |  | todo |  |
| AC-ACC-03-3 | G1 |  |  | todo |  |
| AC-ACC-03-4 | G1 |  |  | todo |  |
| AC-ACC-03-5 | G1 |  |  | todo |  |
| AC-ACC-03-6 | G1 |  |  | todo |  |
| AC-ACC-04-1 | G1 |  |  | todo |  |
| AC-ACC-04-2 | G1 |  |  | todo |  |
| AC-ACC-05-1 | G1 |  |  | todo |  |
| AC-ACC-05-2 | G1 |  |  | todo |  |
| AC-ACC-05-3 | G1 |  |  | todo |  |
| AC-ACC-05-4 | G1 |  |  | todo |  |
| AC-ACC-05-5 | G1 |  |  | todo |  |
| AC-ACC-06-1 | G1 |  |  | todo |  |
| AC-ACC-06-2 | G1 |  |  | todo |  |
| AC-ACC-06-3 | G1 |  |  | todo |  |
| AC-ACC-07-1 | G1 |  |  | todo |  |
| AC-ACC-07-2 | G1 |  |  | todo |  |
| AC-ACC-07-3 | G1 |  |  | todo |  |
| AC-ACC-08-1 | G1 |  |  | todo |  |
| AC-ACC-08-2 | G1 |  |  | todo |  |
| AC-ACC-08-3 | G1 |  |  | todo |  |
| AC-ACC-08-4 | G1 |  |  | todo |  |
| AC-ACC-08-5 | G1 |  |  | todo |  |
| AC-ACC-08-6 | G1 |  |  | todo |  |
| AC-VEN-01-1 | G2 |  |  | todo |  |
| AC-VEN-01-2 | G2 |  |  | todo |  |
| AC-VEN-01-3 | G2 |  |  | todo |  |
| AC-VEN-01-4 | G2 |  |  | todo |  |
| AC-VEN-02-1 | G2 |  |  | todo |  |
| AC-VEN-02-2 | G2 |  |  | todo |  |
| AC-VEN-02-3 | G2 |  |  | todo |  |
| AC-VEN-02-4 | G2 |  |  | todo |  |
| AC-VEN-02-5 | G2 |  |  | todo |  |
| AC-VEN-03-1 | G2 |  |  | todo |  |
| AC-VEN-03-2 | G2 |  |  | todo |  |
| AC-VEN-03-3 | G2 |  |  | todo |  |
| AC-VEN-03-4 | G2 |  |  | todo |  |
| AC-VEN-04-1 | G2 |  |  | todo |  |
| AC-VEN-04-2 | G2 |  |  | todo |  |
| AC-VEN-04-3 | G2 |  |  | todo |  |
| AC-VEN-04-4 | G2 |  |  | todo |  |
| AC-VEN-04-5 | G2 |  |  | todo |  |
| AC-VEN-05-1 | G2 |  |  | todo |  |
| AC-VEN-05-2 | G2 |  |  | todo |  |
| AC-VEN-05-3 | G2 |  |  | todo |  |
| AC-VEN-05-4 | G2 |  |  | todo |  |
| AC-VEN-05-5 | G2 |  |  | todo |  |
| AC-VEN-05-6 | G2 |  |  | todo |  |
| AC-VEN-06-1 | G2 |  |  | todo |  |
| AC-VEN-06-2 | G2 |  |  | todo |  |
| AC-VEN-06-3 | G2 |  |  | todo |  |
| AC-VEN-06-4 | G2 |  |  | todo |  |
| AC-VEN-06-5 | G2 |  |  | todo |  |
| AC-VEN-07-1 | G2 |  |  | todo |  |
| AC-VEN-07-2 | G2 |  |  | todo |  |
| AC-VEN-07-3 | G2 |  |  | todo |  |
| AC-VEN-07-4 | G2 |  |  | todo |  |
| AC-VEN-08-1 | G2 |  |  | todo |  |
| AC-VEN-08-2 | G2 |  |  | todo |  |
| AC-VEN-08-3 | G2 |  |  | todo |  |
| AC-VEN-08-4 | G2 |  |  | todo |  |
| AC-VEN-08-5 | G2 |  |  | todo |  |
| AC-VEN-09-1 | G2 |  |  | todo |  |
| AC-VEN-09-2 | G2 |  |  | todo |  |
| AC-VEN-09-3 | G2 |  |  | todo |  |
| AC-VEN-09-4 | G2 |  |  | todo |  |
| AC-VEN-09-5 | G2 |  |  | todo |  |
| AC-BOK-01-1 | G3 |  |  | todo |  |
| AC-BOK-01-2 | G3 |  |  | todo |  |
| AC-BOK-01-3 | G3 |  |  | todo |  |
| AC-BOK-01-4 | G3 |  |  | todo |  |
| AC-BOK-02-1 | G3 |  |  | todo |  |
| AC-BOK-02-2 | G3 |  |  | todo |  |
| AC-BOK-02-3 | G3 |  |  | todo |  |
| AC-BOK-03-1 | G3 |  |  | todo |  |
| AC-BOK-03-2 | G3 |  |  | todo |  |
| AC-BOK-04-1 | G3 |  |  | todo |  |
| AC-BOK-04-2 | G3 |  |  | todo |  |
| AC-BOK-04-3 | G3 |  |  | todo |  |
| AC-BOK-04-4 | G3 |  |  | todo |  |
| AC-BOK-04-5 | G3 |  |  | todo |  |
| AC-BOK-04-6 | G3 |  |  | todo |  |
| AC-BOK-05-1 | G3 |  |  | todo |  |
| AC-BOK-05-2 | G3 |  |  | todo |  |
| AC-BOK-05-3 | G3 |  |  | todo |  |
| AC-BOK-05-4 | G3 |  |  | todo |  |
| AC-BOK-05-5 | G3 |  |  | todo |  |
| AC-BOK-06-1 | G3 |  |  | todo |  |
| AC-BOK-06-2 | G3 |  |  | todo |  |
| AC-BOK-06-3 | G3 |  |  | todo |  |
| AC-BOK-06-4 | G3 |  |  | todo |  |
| AC-BOK-06-5 | G3 |  |  | todo |  |
| AC-BOK-07-1 | G4 |  |  | todo |  |
| AC-BOK-07-2 | G4 |  |  | todo |  |
| AC-BOK-07-3 | G4 |  |  | todo |  |
| AC-BOK-07-4 | G4 |  |  | todo |  |
| AC-BOK-07-5 | G4 |  |  | todo |  |
| AC-BOK-08-1 | G4 |  |  | todo |  |
| AC-BOK-08-2 | G4 |  |  | todo |  |
| AC-BOK-08-3 | G4 |  |  | todo |  |
| AC-BOK-08-4 | G4 |  |  | todo |  |
| AC-BOK-08-5 | G4 |  |  | todo |  |
| AC-FIN-01-1 | G4 |  |  | todo |  |
| AC-FIN-01-2 | G4 |  |  | todo |  |
| AC-FIN-01-3 | G4 |  |  | todo |  |
| AC-FIN-01-4 | G4 |  |  | todo |  |
| AC-FIN-02-1 | G4 |  |  | todo |  |
| AC-FIN-02-2 | G4 |  |  | todo |  |
| AC-FIN-02-3 | G4 |  |  | todo |  |
| AC-FIN-02-4 | G4 |  |  | todo |  |
| AC-FIN-03-1 | G4 |  |  | todo |  |
| AC-FIN-03-2 | G4 |  |  | todo |  |
| AC-FIN-03-3 | G4 |  |  | todo |  |
| AC-FIN-03-4 | G4 |  |  | todo |  |
| AC-FIN-04-1 | G4 |  |  | todo |  |
| AC-FIN-04-2 | G4 |  |  | todo |  |
| AC-FIN-04-3 | G4 |  |  | todo |  |
| AC-FIN-04-4 | G4 |  |  | todo |  |
| AC-FIN-06-1 | G4 |  |  | todo |  |
| AC-FIN-06-2 | G4 |  |  | todo |  |
| AC-FIN-06-3 | G4 |  |  | todo |  |
| AC-FIN-09-1 | G4 |  |  | todo |  |
| AC-FIN-09-2 | G4 |  |  | todo |  |
| AC-FIN-09-3 | G4 |  |  | todo |  |
| AC-BOK-09-1 | G5 |  |  | todo |  |
| AC-BOK-09-2 | G5 |  |  | todo |  |
| AC-BOK-09-3 | G5 |  |  | todo |  |
| AC-BOK-09-4 | G5 |  |  | todo |  |
| AC-BOK-09-5 | G5 |  |  | todo |  |
| AC-BOK-09-6 | G5 |  |  | todo |  |
| AC-BOK-09-7 | G5 |  |  | todo |  |
| AC-BOK-10-1 | G5 |  |  | todo |  |
| AC-BOK-10-2 | G5 |  |  | todo |  |
| AC-BOK-10-3 | G5 |  |  | todo |  |
| AC-BOK-10-4 | G5 |  |  | todo |  |
| AC-BOK-10-5 | G5 |  |  | todo |  |
| AC-BOK-10-6 | G5 |  |  | todo |  |
| AC-FIN-07-1 | G5 |  |  | todo |  |
| AC-FIN-07-2 | G5 |  |  | todo |  |
| AC-FIN-07-3 | G5 |  |  | todo |  |
| AC-FIN-07-4 | G5 |  |  | todo |  |
| AC-FIN-07-5 | G5 |  |  | todo |  |
| AC-FIN-07-6 | G5 |  |  | todo |  |
| AC-FIN-08-1 | G5 |  |  | todo |  |
| AC-FIN-08-2 | G5 |  |  | todo |  |
| AC-FIN-08-3 | G5 |  |  | todo |  |
| AC-FIN-08-4 | G5 |  |  | todo |  |
| AC-FIN-08-5 | G5 |  |  | todo |  |
| AC-FIN-09-4 | G6 |  |  | todo |  |
| AC-FIN-09-5 | G6 |  |  | todo |  |
| AC-FIN-09-6 | G6 |  |  | todo |  |
| AC-FIN-10-1 | G6 |  |  | todo |  |
| AC-FIN-10-2 | G6 |  |  | todo |  |
| AC-FIN-10-3 | G6 |  |  | todo |  |
| AC-FIN-10-4 | G6 |  |  | todo |  |
| AC-FIN-10-5 | G6 |  |  | todo |  |
| AC-FIN-10-6 | G6 |  |  | todo |  |
| AC-FIN-11-1 | G6 |  |  | todo |  |
| AC-FIN-11-2 | G6 |  |  | todo |  |
| AC-FIN-11-3 | G6 |  |  | todo |  |
| AC-FIN-11-4 | G6 |  |  | todo |  |
| AC-FIN-11-5 | G6 |  |  | todo |  |
| AC-FIN-11-6 | G6 |  |  | todo |  |
| AC-FIN-14-1 | G6 |  |  | todo |  |
| AC-FIN-14-2 | G6 |  |  | todo |  |
| AC-FIN-14-3 | G6 |  |  | todo |  |
| AC-FIN-14-4 | G6 |  |  | todo |  |
| AC-FIN-14-5 | G6 |  |  | todo |  |
| AC-FIN-14-6 | G6 |  |  | todo |  |
| AC-FIN-14-7 | G6 |  |  | todo |  |
| AC-FIN-14-8 | G6 |  |  | todo |  |
| AC-FIN-14-9 | G6 |  |  | todo |  |
| AC-FIN-14-10 | G6 |  |  | todo |  |
| AC-FIN-14-11 | G6 |  |  | todo |  |
| AC-FIN-12-1 | G7 |  |  | todo |  |
| AC-FIN-12-2 | G7 |  |  | todo |  |
| AC-FIN-12-3 | G7 |  |  | todo |  |
| AC-FIN-12-4 | G7 |  |  | todo |  |
| AC-FIN-12-5 | G7 |  |  | todo |  |
| AC-FIN-12-6 | G7 |  |  | todo |  |
| AC-FIN-13-1 | G7 |  |  | todo |  |
| AC-FIN-13-2 | G7 |  |  | todo |  |
| AC-FIN-13-3 | G7 |  |  | todo |  |
| AC-FIN-13-4 | G7 |  |  | todo |  |
| AC-FIN-13-5 | G7 |  |  | todo |  |
| AC-FIN-13-6 | G7 |  |  | todo |  |
| AC-FIN-13-7 | G7 |  |  | todo |  |
| AC-FIN-13-8 | G7 |  |  | todo |  |

## 3. Nhật ký thực thi (tất cả milestone — Claude execute)

### Gboot — 2026-08-06 — ✅ self-verify OK (6/6 proof)

**Đã dựng:**
- Root: `package.json` (npm workspaces `packages/*`, `services/*`), `tsconfig.base.json`,
  `.env.example` (đủ biến 6 service + hạ tầng), `.gitignore` cập nhật, script `dev`
  (**concurrently** 6 service), `infra:up/down`.
- `docker-compose.infrastructure.yml`: Postgres 16 + Redis 7 + RabbitMQ 3.13 (chỉ hạ tầng).
- `infra/postgres-init/01-schemas-roles.sql`: tạo **5 schema + 5 role** sở hữu schema riêng.
- 3 package: `packages/shared`, `packages/eventbus`, `packages/ai` (skeleton, build sạch).
- 6 service: `api-gateway` (proxy, **không Prisma**) + 5 service nghiệp vụ (account, venue-booking,
  finance, matchmaking, community) — Express + TS + `/health`, mỗi service nghiệp vụ có
  `prisma/schema.prisma` trỏ schema riêng (chưa có model — model áp ở G0).

**6 proof cuối (bằng chứng):**
1. **`npm ci` sạch** trên `node_modules` rỗng — exit 0, 137 packages, ~20s.
2. **`docker compose ... up -d`** — postgres/redis/rabbitmq đều `healthy`.
3. **`prisma migrate dev` sạch cho cả 5 service** — mỗi service nối đúng schema riêng
   (`account`/`venue_booking`/`finance`/`matchmaking`/`community`), "Already in sync". `validate` sạch.
   *(Ghi chú: `prisma generate` báo "no models" — đúng bản chất Gboot, model áp ở G0.)*
4. **6 service `/health` trả 200** — gateway :3000, account :3001, venue :3002, finance :3003,
   match :3004, community :3005 (khởi động bằng `node dist`).
5. **Quét FK/model chéo schema**: cả 5 `schema.prisma` chỉ có `datasource`+`generator`, KHÔNG
   model/@relation/references — 0 tham chiếu chéo.
6. **Test cách ly 5 role: PASS 10/10** — mỗi role thao tác được schema riêng và **bị từ chối
   quyền** khi chạm schema service khác (`permission denied for schema ...`).

**Ghi chú Railway:** SQL init dùng `CREATEDB` cho role (chỉ để `prisma migrate dev` tạo shadow DB
ở local). Railway provisioning riêng, giữ đúng schema/grant **contract** (ADR 0004).

**Hạ tầng local đang chạy** (3 container). Dừng: `npm run infra:down`.

_(Milestone kế: G0 — áp lược đồ data model vào 5 schema.prisma.)_

## 4. Self-verification cuối mỗi milestone

_(mỗi milestone: kết quả review diff, kiểm scope không lệch, và xác nhận đủ điều kiện sang gói kế —
Claude ghi tại đây)_

## 5. PO nghiệm thu (chỉ cuối phase hoặc khi escalation)

_(để trống tới khi cả 198 AC pass, 8 E2E phase-level xanh và kiểm thử độc lập cuối phase xong;
PO ký nhận tại đây)_

## 6. Playwright E2E phase-level (8 hành trình)

| # | Hành trình | Chạm gói | Spec file | Status | Trace/evidence |
|---|---|---|---|---|---|
| 1 | Đăng ký → xác minh → đăng nhập → cập nhật hồ sơ | G1 |  | todo |  |
| 2 | Đăng ký NCC → Admin duyệt → cấu hình sân/lịch/giá | G1,G2 |  | todo |  |
| 3 | Tìm sân → giữ slot → thanh toán → booking confirmed | G3,G4 |  | todo |  |
| 4 | Tự hủy và hoàn tiền theo bậc | G5 |  | todo |  |
| 5 | Phía sân hủy và hoàn 100% | G5 |  | todo |  |
| 6 | Doanh thu pending → available → rút tiền | G6 |  | todo |  |
| 7 | Tranh chấp trong 24 giờ → Admin xử lý | G7 |  | todo |  |
| 8 | Đối soát giao dịch chưa khớp | G6 |  | todo |  |
