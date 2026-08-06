# Khoaluantn — Nền tảng cầu lông

Monorepo cho nền tảng kết nối chủ sân, người chơi và cộng đồng cầu lông. Phạm vi
Giai đoạn 1 tập trung vào tài khoản, vận hành sân, tìm và đặt sân, thanh toán,
doanh thu, hoàn tiền và tranh chấp.

## Bắt đầu từ đâu

1. Đọc [quy trình repository](docs/WORKFLOW.md).
2. Xem [phân kỳ sản phẩm](docs/product/phasing.md) và
   [bàn giao Giai đoạn 1](docs/product/phase-1-handoff.md).
3. Xem [tiến độ và test ledger](docs/product/phase-1-progress.md) trước khi nhận
   milestone tiếp theo.
4. Đọc [kiến trúc hệ thống](docs/architecture/system-architecture.md),
   [mô hình dữ liệu](docs/architecture/data-model.md) và các ADR liên quan.

## Cấu trúc monorepo

```text
apps/
  web/                       React + Vite frontend
services/
  api-gateway/               Điểm vào HTTP
  account-service/           Tài khoản và phân quyền
  venue-booking-service/     Sân, lịch, tìm kiếm và booking
  finance-service/           Thanh toán, ví, doanh thu và tranh chấp
  matchmaking-service/       Ghép kèo (giai đoạn sau)
  community-service/         Cộng đồng (giai đoạn sau)
packages/
  shared/                    Kiểu và tiện ích dùng chung
  eventbus/                  Hạ tầng sự kiện RabbitMQ
  ai/                        Nền tích hợp AI
infra/                       Khởi tạo hạ tầng cục bộ
docs/                        Sản phẩm, kiến trúc, quyết định và kế hoạch
.agents/ .claude/ .codex/    Hướng dẫn và cấu hình agent
src/                         Metadata orchestration tương thích cũ
```

Mã ứng dụng nằm trong `apps/`, `services/` và `packages/`. Hai tệp trong `src/`
chỉ là chỉ mục tương thích; trạng thái triển khai chuẩn nằm ở
`docs/product/phase-1-progress.md`.

## Công nghệ chính

- npm workspaces, Node.js 20+, TypeScript
- React 19, Vite và Tailwind CSS
- Express, Prisma và PostgreSQL theo schema/service
- Redis và RabbitMQ
- Vitest; Playwright cho hành trình end-to-end

## Lệnh thường dùng

```powershell
npm install
npm run infra:up
npm run dev
npm run typecheck
npm run build
```

Các service có lệnh test và Prisma riêng trong `package.json` của từng workspace.
Biến môi trường mẫu nằm tại `.env.example`; không commit `.env` thật.

## Trạng thái

Giai đoạn 1 đang được triển khai theo chuỗi milestone trong
`docs/product/phase-1-handoff.md`. Không ghi lặp trạng thái động tại README này;
hãy dùng `docs/product/phase-1-progress.md` làm nguồn hiện hành.

## Cách làm việc với agent

- Dùng repository làm nguồn sự thật; đọc ít nhất đúng tài liệu liên quan.
- Đi theo chuỗi: discovery đã duyệt → spec → goal → kế hoạch → code → kiểm thử.
- Chỉ triển khai phạm vi đã được phê duyệt, thay đổi tối thiểu và có bằng chứng.
- Quy tắc chung nằm trong [AGENTS.md](AGENTS.md); Claude Code đọc thêm
  [.claude/CLAUDE.md](.claude/CLAUDE.md).
