# 0001 Tech stack & kiến trúc nền tảng

Date: 2026-08-04

## Status

Accepted

## Context

Cần chọn công nghệ + kiến trúc cho đồ án nền tảng cầu lông (7 module / 61 UC nền +
6 tính năng AI). Ràng buộc: **1 dev kiêm PO**, ~4–6 tháng, deadline gần; ưu tiên
**độ quen thuộc** (không bắt buộc tái sử dụng nếu không phù hợp). Có WebSocket (ghép
kèo), LLM (chatbot + matchmaker), webhook SePay, ledger/ví, bản đồ.

Nguồn tham chiếu: `docs/MACHINE_TECH_STACK_ARCHITECTURE_INVENTORY.md` — khảo sát toàn
bộ tech đã dùng trên máy.

## Decision

**Modular monolith**, TypeScript xuyên suốt:

| Lớp | Công nghệ |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind + Leaflet + Recharts |
| Backend | Node + Express + TypeScript — modular monolith (7 module trong 1 deployable) |
| Database | PostgreSQL + Prisma |
| Realtime | Socket.IO (WebSocket) — dùng chính cho ghép kèo, không giới hạn |
| Auth | JWT + bcrypt |
| AI | Trong TypeScript: rating/matching/analytics là module TS; chatbot + giải thích gọi LLM API (LangChain.js) |
| Test | Vitest + Playwright |
| Dev | `npm run dev` thuần (không Docker); DB = Postgres hosted (Neon/Supabase) để không nặng máy |
| Deploy (nếu cần URL) | Frontend → Vercel/Netlify; Backend → Render/Railway (Node sống dai + WebSocket + job nền); DB → Neon/Supabase |

**Không dùng Docker** (máy PO yếu). **Không deploy backend lên Vercel** — serverless không hợp
WebSocket (Socket.IO) và job nền; Vercel chỉ dùng cho frontend tĩnh.

**Loại bỏ có chủ đích:** microservices, API Gateway, RabbitMQ, Kafka, outbox.
**Redis:** chỉ thêm khi có nhu cầu cụ thể (TTL hold nhiều, khóa phân tán).
**project-cnm:** làm mới hoàn toàn — chỉ tham khảo ý tưởng, không mượn code/schema.

## Alternatives Considered

1. **Microservices như project-cnm** (Postgres/Prisma + RabbitMQ + Redis + API Gateway, tách domain service). Bị loại: chi phí vận hành/debug phân tán quá cao cho 1 dev + deadline; đúng cảnh báo mục 3.1 của inventory.
2. **Polyglot + Kafka + AI service Python như CAB system.** Bị loại: phức tạp nhất, chỉ hợp khi thật sự cần scale độc lập/high-throughput.
3. **AI tách service Python/FastAPI (scikit-learn/XGBoost).** Cân nhắc vì ấn tượng khi bảo vệ, nhưng bị loại để giữ một ngôn ngữ, giảm rủi ro deadline.
4. **MongoDB thay PostgreSQL.** Bị loại: ledger/ví và chống đặt trùng cần ACID quan hệ.
5. **Tái dùng project-cnm.** Bị loại theo quyết định PO — làm mới cho sạch.

## Consequences

Positive:

- Một ngôn ngữ (TypeScript) toàn stack — tốc độ cho 1 dev, Codex sinh code nhất quán.
- Vận hành nhẹ: `npm run dev`, DB hosted — không Docker, hợp máy yếu.
- PostgreSQL/Prisma cho tính toàn vẹn giao dịch (ledger, chống đặt trùng).
- Bám đúng vùng quen nhất của PO (React/Vite/Tailwind + Node/Express + Prisma).

Tradeoffs:

- Monolith cần kỷ luật ranh giới module (mitigate bằng cấu trúc thư mục theo 7 module).
- AI trong TS: phần ML nặng (nếu có) kém tiện hơn Python — chấp nhận vì các AI hiện tại chủ yếu là toán + LLM API.
- Làm mới hoàn toàn: mất đòn bẩy schema có sẵn của project-cnm — đổi lấy codebase sạch.

## Follow-Up

- Thiết kế architecture + data model (ERD) cho modular monolith.
- Sau đó viết spec: user story + acceptance criteria (bắt đầu từ Mốc 1 — lát cắt dọc).
- Xác nhận cơ chế webhook SePay khi thiết kế module tài chính.
