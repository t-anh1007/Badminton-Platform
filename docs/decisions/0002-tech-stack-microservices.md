# 0002 Tech stack & kiến trúc — Microservices

Date: 2026-08-04

## Status

Accepted (supersedes [0001](0001-tech-stack.md))

## Context

PO quyết định build bằng **kiến trúc microservices** thay cho modular monolith ở ADR
0001. Lý do PO: ưu tiên **độ quen thuộc** (mọi project trước đều microservices), và
điểm cộng năng lực kiến trúc phân tán khi bảo vệ. Ràng buộc khác giữ nguyên: 1 dev
kiêm PO, ~4–6 tháng, máy yếu, không thích Docker.

## Decision

TypeScript xuyên suốt. **5 service theo module + API Gateway** (đã gộp từ 8 để nhẹ máy).

**Service:** `api-gateway`, `account-service`, `venue-booking-service` (venue+booking),
`finance-service`, `matchmaking-service` (kèo + passport + F-01/03/04 + WebSocket),
`community-service` (bài viết + kiểm duyệt + hỗ trợ + chatbot).

**AI là thư viện TypeScript dùng chung** (không phải service riêng) — import vào nơi cần.

**Quyết định gộp (2026-08-04):**
- `venue` + `booking` gộp làm một: giữ-slot và chống đặt trùng sạch nhất khi lịch và booking cùng một service/DB, tránh khóa phân tán across service.
- `ai-service` hạ xuống thư viện: AI đã là TS, được matchmaking gọi đồng bộ; tách service chỉ thêm network hop.
- `finance` và `account` giữ riêng: ranh giới tiền/audit và auth, đáng cô lập nhất.

| Lớp | Công nghệ |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind + React Router + Leaflet + Recharts + Axios + Socket.IO client |
| API Gateway | Node + Express + http-proxy-middleware + JWT verify + express-rate-limit + helmet + CORS |
| Mỗi service | Node + Express + TypeScript + Prisma + Zod |
| Database | PostgreSQL — database-per-service (thực dụng: 1 Neon project nhiều DB, hoặc schema-per-service) |
| Async/event | RabbitMQ (amqplib) + outbox pattern — không Kafka |
| Cache/lock | Redis (ioredis) — khóa giữ-slot phân tán, rate-limit, token blacklist, state ghép kèo |
| Realtime | Socket.IO trong matchmaking-service |
| Auth | JWT + bcrypt (account-service phát hành, gateway verify) |
| AI | Thư viện TS dùng chung: LangChain.js + LLM API (F-02, F-05, chatbot, matchmaker) — import vào matchmaking/community/venue-booking |
| Test | Vitest + Supertest (per service) + Playwright (e2e) |
| Log/metrics | pino + Prometheus client (tùy chọn) |
| Chạy local (không Docker) | concurrently/pm2 nhiều tiến trình Node, trỏ tới Postgres/Redis/RabbitMQ hosted trên Railway → máy chỉ gánh tiến trình Node |
| Deploy | **Railway**: backend (5 service + gateway) + Postgres (per-service) + Redis + RabbitMQ trong một project, mạng nội bộ riêng tư. **Vercel**: frontend. Realtime = Socket.IO self-host trên Railway + Redis adapter. |

**Docker:** tùy chọn. Docker giải quyết *khởi động*, không giải quyết *máy yếu* (còn nặng hơn do
overhead container). Cách làm nhẹ thật sự = ít service + đẩy DB/broker/Redis lên hosted. Nếu dùng
Docker thì chỉ cho các Node service, hạ tầng vẫn hosted.
**AI trong TypeScript** (giữ nguyên từ 0001). **Làm mới hoàn toàn**, không tái dùng project-cnm.

## Alternatives Considered

1. **Modular monolith** (ADR 0001, khuyến nghị trước đó). PO loại vì ưu tiên độ quen thuộc + trình diễn kiến trúc phân tán.
2. **Kafka thay RabbitMQ.** Loại: quá nặng cho quy mô đồ án + máy yếu; RabbitMQ đủ và PO đã quen (amqplib).
3. **AI service Python/FastAPI.** Loại từ 0001: giữ một ngôn ngữ TypeScript.

## Consequences

Positive:

- Đúng vùng quen nhất của PO; ranh giới service rõ; điểm "kiến trúc phân tán" khi bảo vệ.
- Mỗi service scale/deploy độc lập; lỗi một service không kéo sập toàn hệ.

Tradeoffs:

- **Tải nặng nhất cho máy yếu** — mâu thuẫn với ràng buộc "không Docker": phải chạy nhiều tiến trình + broker + Redis. Mitigate bằng hạ tầng hosted + concurrently/pm2.
- **Tính nhất quán phân tán** trở thành phần khó: chống đặt trùng (booking) và bút toán ví (finance) nay bắc cầu nhiều service → cần outbox + event + saga/bù trừ. Đây là rủi ro kỹ thuật lớn nhất.
- Chi phí lặp lại mỗi service: auth-verify, log, test, migration riêng.
- Deadline rủi ro cao hơn monolith với 1 dev.

## Deploy (chốt 2026-08-04)

**Railway + Vercel.** Railway chạy toàn bộ backend + Postgres + Redis + RabbitMQ trong một
project (mạng nội bộ riêng tư); Vercel chạy frontend. Realtime giữ Socket.IO self-host trên
Railway (không cần Supabase Realtime). Dev local trỏ tới hạ tầng Railway để máy yếu không phải
chạy DB/broker cục bộ.

- **Vì sao thắng:** zero rearchitect (giữ nguyên Socket.IO/RabbitMQ/Redis); ít nền tảng nhất
  (2); không cold-start lúc demo (tiến trình sống dai).
- **Đánh đổi:** Railway ~$5/mo hobby (không free vĩnh viễn) — chấp nhận đổi lấy ổn định.
- **Loại:** Supabase (BaaS không chạy được Express microservices; đồ ăn kèm trùng service tự làm).
  Phương án lùi free nếu cần: Render + Supabase + CloudAMQP + Vercel. TOSE.sh để ngỏ.

## Follow-Up

- Thiết kế luồng event/outbox cho nhất quán booking↔finance↔matchmaking.
- Architecture chi tiết + data model (database-per-service).
- Sau đó: grill goal Mốc 1 → spec user story + AC.
