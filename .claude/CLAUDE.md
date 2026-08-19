# Khoaluantn — Claude Code Guide

Đọc và tuân thủ `../AGENTS.md` trước. Tệp này bổ sung cách Claude Code làm việc
trong repository: bối cảnh, stack, quy ước cứng và chuẩn hoàn thành — những điều
không nằm trong tài liệu sản phẩm.

## Bối cảnh dự án

- Đồ án tốt nghiệp: nền tảng cầu lông kết nối chủ sân, người chơi, cộng đồng.
- Một người duy nhất (Tuấn Anh) vừa là dev vừa là PO, toàn quyền quyết định.
- Giao tiếp và tài liệu bằng tiếng Việt. Khi hỏi PO chọn phương án, luôn ghi
  `(Khuyến nghị)` ngay trong option được khuyến nghị.
- Giai đoạn hiện hành: xác định qua `../docs/product/phasing.md` và cặp
  `phase-N-goal.md` / `phase-N-progress.md` mới nhất trong `../docs/product/`
  (đến 08/2026 là GĐ3 — stabilization, báo cáo, bảo vệ). Đừng coi danh sách
  tài liệu trong tệp này là trạng thái; luôn đọc goal/progress hiện hành.

## Stack (kiểm chứng từ code, không đoán)

- Monorepo npm workspaces (`packages/* → services/* → apps/*`), Node ≥ 20,
  TypeScript strict, ESM (`"type": "module"`).
- Frontend `apps/web`: React 19 + Vite + Tailwind CSS 4 + react-router-dom 7.
  Bản đồ: react-leaflet + Nominatim (Google Maps chỉ dùng làm link chỉ đường).
  Realtime: socket.io-client. Lint: oxlint. Test: vitest + testing-library.
- Backend `services/*`: Express 4 + Prisma 5 (PostgreSQL schema-per-service) +
  Zod + JWT. `api-gateway` là cửa vào duy nhất từ FE. Test: vitest + supertest.
- `packages/`: `shared` (kiểu chung), `eventbus` (RabbitMQ + outbox relay),
  `object-storage` (Cloudflare R2, S3 API), `ai` (Gemini).
- E2E: Playwright ở `e2e/`, chạy `npm run e2e` từ root (cần `.env`).
- Env: một `.env` ở root, service load qua `dotenv -e ../../.env`. Hạ tầng cục
  bộ: `npm run infra:up` / `infra:down` (docker compose).
- Deploy: backend + PostgreSQL + Redis + RabbitMQ trên Railway; frontend trên
  Vercel. Thanh toán: SePay (VietQR + webhook HMAC-SHA256).

## Vai trò và executor

- Từ quyết định D21 (decision log): Claude Code **trực tiếp thực thi** milestone
  — viết spec, code, test, tự kiểm chứng. Không giao việc cho Codex; mọi vòng
  review ngoài (nếu có) do PO tự điều hành, Claude không cần nhắc hay cấu hình.
- Dùng tài liệu trong `docs/product/` làm thẩm quyền nghiệp vụ. Không tự quyết
  về tiền, quyền, trạng thái, ngoại lệ lớn hoặc ranh giới service nếu nguồn
  hiện hành chưa trao thẩm quyền — hỏi PO với các option có `(Khuyến nghị)`.

## Quy ước cứng (hard rules)

Vi phạm bất kỳ dòng nào dưới đây là lỗi, kể cả khi code chạy được:

- **Git**: branch làm việc chính là `TuanAnh`, PR về `main`. Không bao giờ xóa
  branch `TuanAnh` (không dùng `--delete-branch` khi merge PR). Commit theo
  dạng `type(scope): mô tả` như lịch sử hiện có.
- **Build**: `npm run build` ở root là `tsc -b` toàn bộ workspace. Lỗi type ở
  `apps/web` làm **fail cả deploy backend trên Railway** — luôn chạy root build
  trước khi commit, không chỉ build workspace vừa sửa.
- **Railway**: muốn ép rebuild một service, commit một thay đổi chạm thư mục
  service đó (Railway chỉ build khi path thay đổi).
- **Ảnh/venue**: DB lưu `objectKey` thô. Route public phải map objectKey → read
  URL trước khi trả về; route managed (provider tự quản) giữ objectKey thô để
  round-trip khi lưu lại. Không trộn hai kiểu.
- **SePay không có API hoàn tiền**: hoàn tiền ghi vào số dư ví trong hệ thống;
  rút tiền đối soát thủ công qua webhook. Không thiết kế luồng gọi API refund.
- **Trình độ người chơi**: 5 bậc (Mới chơi / Yếu / TB / TB+ / Bán chuyên) kèm
  rating số có độ bất định. Không thay đổi thang này khi làm matchmaking.
- **WebSocket được phép** (chính cho ghép kèo, không giới hạn ở đó).
- **Trợ lý AI** chỉ là bong bóng chat CSKH nổi, không có trang `/assistant`.
- **Tài chính**: ledger append-only, bảo toàn giá trị; dừng lại nếu spec, data
  model và quy tắc phân bổ chưa thống nhất (xem AGENTS.md).

## Ranh giới thư mục

Mã chạy nằm trong `../apps/`, `../services/` và `../packages/`. Skill dự án nằm
trong `../.agents/skills/`. `../src/` chỉ giữ metadata orchestration tương thích
cũ; không đặt mã ứng dụng mới ở đó. E2E ở `../e2e/`, script tiện ích ở
`../scripts/`.

Trước khi giao hoặc thực thi task, kiểm tra trạng thái Git để không ghi đè thay
đổi của người dùng/agent khác.

## Định nghĩa hoàn thành

Một thay đổi chỉ được gọi là xong khi đủ các bước sau, theo thứ tự:

1. Test tập trung của workspace vừa sửa pass: `npm run test -w <workspace>`.
2. Root `npm run build` pass (bắt buộc — xem hard rule Build ở trên).
3. Chạm luồng người dùng chính hoặc milestone yêu cầu → chạy `npm run e2e`.
4. Cập nhật test ledger / progress của giai đoạn trong `docs/product/` khi
   milestone yêu cầu bằng chứng.
5. Báo cáo cuối tách rõ: kết quả, bằng chứng (lệnh + output), rủi ro còn lại.

Không coi frontmatter `approved`, số lượng AC hoặc mô tả thủ công là bằng chứng
code chạy đúng. Thiếu bước nào phải nói rõ là thiếu, không tuyên bố "hoàn thành".

## Khi nào dùng Skill

**Nguyên tắc**: Chỉ invoke skill khi task phức tạp, nhiều bước, hoặc cần cấu trúc
đặc thù — KHÔNG dùng cho task đơn giản có thể trả lời trực tiếp (tốn context).
Skill khả dụng thay đổi theo phiên; nếu skill không có, làm trực tiếp theo
nguyên tắc của nó thay vì tìm skill thay thế.

| Tình huống | Skill cần dùng |
|---|---|
| Yêu cầu mục tiêu mơ hồ, thiếu tiêu chí | `/goal-griller` |
| Debug lỗi khó tái hiện hoặc nhiều nguyên nhân | `/systematic-debugging` |
| Review diff/PR phức tạp trước commit | `/requesting-code-review` |
| Nhận feedback review → áp dụng | `/receiving-code-review` |
| Viết plan cho milestone mới | `/writing-plans` (plan đặt ở `docs/plans/active/`) |
| Thực thi plan đã có từng bước | `/executing-plans` |
| UI/UX frontend phức tạp (layout, design system) | `/web-design-guidelines` (review) hoặc `/frontend-design` (xây mới) |
| Brainstorm giải pháp kỹ thuật | `/brainstorming` |
| Commit / push / merge / deploy | `/release` (skill dự án, `.claude/skills/`) |

**Không dùng skill khi**: sửa bug rõ ràng, thêm field nhỏ, trả lời câu hỏi đơn
giản, refactor cục bộ — làm trực tiếp sẽ nhanh hơn và rẻ hơn.

## Chuẩn làm việc (mọi model phải theo)

Cách làm việc đã cho chất lượng tốt trong dự án này — model nào cũng phải giữ:

- **Đọc trước khi sửa.** Mở file liên quan, xem pattern lân cận và cách code
  hiện có làm việc tương tự trước khi viết dòng nào. Không đoán API nội bộ.
- **Diff tối thiểu.** Chỉ sửa đúng phạm vi được giao; không refactor, không
  dọn dẹp, không thêm tính năng ngoài yêu cầu; giữ style/naming hiện có.
- **Bug phải tái hiện trước khi sửa.** Sửa xong chạy lại đúng bước tái hiện để
  chứng minh hết lỗi; không sửa theo phỏng đoán.
- **Tự kiểm chứng bằng lệnh.** Bằng chứng là output lệnh, log, screenshot —
  không phải mô tả "đã sửa xong". Không tin frontmatter hay số AC.
- **Hỏi đúng lúc.** Quyết định về tiền, quyền, trạng thái, ranh giới service,
  hoặc nhiều phương án còn mở → đưa 2-4 option kèm `(Khuyến nghị)` cho PO chọn.
  Còn lại tự quyết và làm tới cùng, không hỏi xin phép việc thuận nghịch.
- **Báo cáo kiểu Fable**: mở đầu bằng kết quả, sau đó bằng chứng, cuối cùng là
  rủi ro/việc chưa làm. Tiếng Việt, câu đầy đủ, không viết tắt khó hiểu.
- **Trước khi nói "xong"**: chạy đủ checklist Định nghĩa hoàn thành ở trên.

## Điểm vào tài liệu

- Quy trình + chuẩn hoàn thành gốc: `../docs/WORKFLOW.md`
- Phân kỳ: `../docs/product/phasing.md`
- Quyết định: `../docs/product/decision-log.md`
- Goal/tiến độ giai đoạn hiện hành: `../docs/product/phase-N-goal.md`,
  `phase-N-progress.md` (N lớn nhất đang active)
- Kiến trúc: `../docs/architecture/system-architecture.md`
- Data model: `../docs/architecture/data-model.md`
