---
type: goal
package: Gboot
phase: 1
status: draft-for-review
executor: Claude Code (D21 — Claude thực thi trọn goal GĐ1)
reviewer: Claude self-verification
final_acceptance: PO (Tuan Anh) — chỉ cuối phase
created: 2026-08-06
revised: 2026-08-06 (npm ci proof, chốt concurrently, test cách ly 6 role, hạ claim Railway; D21 bỏ Codex)
source: docs/product/phase-1-handoff.md (mục "Gboot — Bootstrap monorepo và Prisma", dòng 78-109)
---

# Goal — Gboot: Bootstrap monorepo + Prisma

> **Vai trò (D21, 2026-08-06).** Goal này do **Claude Code trực tiếp thực thi/chạy code** và
> **tự kiểm chứng** (self-verification: test + review diff + kiểm scope). Không Codex. Milestone
> đầu tiên của goal GĐ1 do Claude làm trọn (Gboot→G7).

---

## Mục tiêu (Outcome)

Dựng khung monorepo (Gboot) cho dự án Khoaluantn: **npm workspaces** với **6 service backend
skeleton** (`api-gateway`, `account-service`, `venue-booking-service`, `finance-service`,
`matchmaking-service`, `community-service`), **`packages/shared`**, **`packages/ai`**,
**`packages/eventbus`**. **5 service nghiệp vụ** (account, venue-booking, finance, matchmaking,
community) có Prisma riêng theo mô hình **schema-per-service trong một Postgres**; **`api-gateway`
là proxy thuần, không Postgres/Prisma** (verify JWT + proxy + rate-limit, dùng Redis nếu cần) —
chốt 2026-08-06.

## Context — đọc trước khi làm

- `docs/product/phase-1-handoff.md` (mục "Gboot — Bootstrap monorepo và Prisma", dòng 78-109)
- `docs/decisions/0004-db-strategy-and-repo-boundary.md` (ADR 0004 — D17 schema-per-service, D18 monorepo)
- `docs/decisions/0002-tech-stack-microservices.md` (ADR 0002 — TypeScript, Node+Express, Prisma+Zod;
  Postgres/Redis/RabbitMQ hosted trên Railway ở production)
- `docs/architecture/system-architecture.md` §9 (cấu trúc thư mục monorepo tham chiếu)

## Ràng buộc (Constraints)

- Package manager: **npm workspaces** (không dùng pnpm/yarn).
- **Chỉ dựng khung + cấu hình. Không viết entity, không viết logic nghiệp vụ.**
- Không chọn lại tech stack — bám đúng ADR 0002 (Node + Express + TypeScript + Prisma + Zod
  cho mỗi service).
- **Không tạo FK hay migration nào chạm schema của service khác.** Không service nào định nghĩa
  hay truy vấn schema của service khác.
- Mỗi service dùng một **tài khoản CSDL riêng chỉ có quyền trên schema của chính nó**.
- **KHÔNG nằm trong phạm vi:** `apps/web` (frontend React+Vite) — chỉ backend + packages dùng chung.
- **Hạ tầng local (hybrid dev):** chỉ Docker hóa **PostgreSQL, Redis, RabbitMQ** qua
  `docker-compose.infrastructure.yml`. **KHÔNG Docker hóa 6 service Node** — chúng chạy trực
  tiếp bằng `npm run dev` để hot reload/debug dễ. Railway vẫn là hạ tầng production, không đổi
  ADR 0002.
- Cấu trúc **schema/role phải tương thích về contract với Postgres Railway** — cùng tên schema,
  cùng mô hình grant (mỗi service một role chỉ có quyền trên schema của mình). **Không giả định
  script init local chạy nguyên trên Railway:** Railway managed Postgres có thể không cho
  `CREATE ROLE`/superuser, nên script provisioning Railway có thể khác local; điều bất biến là
  **schema/grant contract**, không phải từng dòng SQL.
- Lệnh khởi động local: **`concurrently`** (chốt, không dùng pm2) — dựng đồng thời 6 service Node.
- Tạo `.env.example` liệt kê đủ biến kết nối cho cả 6 service.

## Nguyên tắc vận hành (Operating rules)

- Giữ progress log tại **`docs/product/phase-1-progress.md` §3** (Nhật ký thực thi), ghi mỗi
  service/package sau khi thêm xong và mỗi lần chạy migrate thành công/thất bại — đây là
  **bằng chứng self-verification**.
- Ưu tiên thêm và **xác minh từng service một** (build được ngay, migrate sạch ngay) thay vì
  viết hết 6 service rồi mới kiểm tra.
- Không mở rộng phạm vi (không thêm entity, không đụng `apps/web`, không đổi tech stack) mà
  không dừng lại hỏi trước.

## Vòng kiểm chứng (Validation loop)

**Trong lúc làm:**
- Sau khi thêm mỗi service — service đó `npm run build` (hoặc `tsc`) sạch.
- Nếu đã có `prisma/schema.prisma` cho service đó, `npx prisma migrate dev` chạy sạch trên
  schema riêng của service, trên Postgres local (`docker-compose.infrastructure.yml`).

**Cuối cùng (proof):**
1. **`npm ci`** ở gốc chạy sạch trên máy trống (dùng `npm ci` — cài đúng theo lockfile, tái lập
   được — không phải `npm install`; xóa `node_modules` trước khi test lại nếu cần).
2. `docker compose -f docker-compose.infrastructure.yml up -d` khởi động Postgres/Redis/RabbitMQ
   local sạch, không lỗi.
3. Cả **5 service nghiệp vụ**: `prisma migrate` chạy sạch trên CSDL rỗng (schema riêng của từng
   service). `api-gateway` không có DB nên không có bước migrate.
4. Lệnh khởi động local (**`concurrently`**, đã chốt) dựng được toàn bộ **6 service** (gồm gateway);
   **mỗi service trả 200 ở health/readiness endpoint** (`GET /health`) — không chỉ "không lỗi ở stdout".
5. Quét `prisma/schema.prisma` của **5 service nghiệp vụ** — **không service nào có FK hay
   reference tới tên bảng của service khác**.
6. **Test cách ly schema cho cả 5 role nghiệp vụ:** mỗi role (i) thao tác được trong **schema của
   chính nó** (thành công), và (ii) bị **từ chối quyền** khi chạm bảng/schema của **ít nhất một
   service khác**. Chứng minh grant đúng theo cả hai chiều, không chỉ tồn tại schema.

## Hoàn thành khi (Done when)

- Tất cả **6** mục "Cuối cùng" ở Validation loop đều pass, và `docs/product/phase-1-progress.md` §3
  ghi đủ log cho 6 service + 3 package.

## Dừng lại nếu (Pause if)

- Phát hiện nhu cầu FK hay truy vấn xuyên schema giữa hai service — dấu hiệu ranh giới service
  bị vẽ sai ở tầng thiết kế, phải **dừng và báo cáo** thay vì phá D17 để đi tiếp.
- Bất kỳ điểm nào cấu trúc thư mục thực tế cần lệch khỏi `system-architecture.md` §9 để chạy
  được — **dừng và hỏi** trước khi tự quyết.

---

## Vì sao goal này an toàn để chạy

- **Success condition khách quan:** 6 proof chạy được và kiểm tra được (`npm ci`, docker up,
  migrate, health endpoint, quét FK chéo schema, test cách ly 6 role) — không phải đánh giá cảm tính.
- **Phạm vi bị khoá cứng** vào "chỉ khung + cấu hình", không chạm nghiệp vụ, không đụng frontend.
- **Rủi ro chính:** service boundary bị vẽ sai (FK/query xuyên schema) → đã có Pause rule đúng
  cho trường hợp đó.
- **Bằng chứng self-verification:** `docs/product/phase-1-progress.md` §3 + kết quả 6 proof cuối
  (gồm test cách ly 6 role) + diff toàn bộ.

