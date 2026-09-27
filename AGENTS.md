# Khoaluantn — Agent Guide

## Mục tiêu

Xây dựng nền tảng cầu lông kết nối chủ sân, người chơi và cộng đồng. Đây là
monorepo đang triển khai, không còn là workspace discovery thuần tài liệu.

## Nguồn sự thật và thứ tự đọc

1. `docs/WORKFLOW.md` — quy trình làm việc và chuẩn hoàn thành.
2. `docs/product/phasing.md` — phạm vi và phân kỳ đã duyệt.
3. `docs/product/decision-log.md` — quyết định sản phẩm hiện hành.
4. `docs/product/phase-1-handoff.md` và `phase-1-progress.md` — thứ tự triển khai,
   trạng thái milestone và test ledger.
5. Spec liên quan trong `docs/product/specs/`.
6. `docs/architecture/`, `docs/decisions/`, code và test liên quan.

Không dùng `src/integration/progress.json` hoặc `src/orchestrator/tasks.json` làm
nguồn trạng thái chính; chúng chỉ là metadata tương thích trỏ về tài liệu trên.

## Nguyên tắc thực thi

- **Karpathy rule là ràng buộc bắt buộc cho mọi task và mọi agent trong repo.**
  Trước khi sửa phải nêu giả định/điểm chưa rõ; chọn giải pháp đơn giản nhất đáp
  ứng đúng yêu cầu; chỉ thay đổi những dòng truy nguyên trực tiếp về task, không
  thêm tính năng, abstraction, refactor hay dọn dẹp ngoài phạm vi; và xác định
  tiêu chí thành công cùng bằng chứng kiểm chứng. Nếu yêu cầu còn mơ hồ hoặc có
  nhiều cách hiểu làm thay đổi kết quả, phải dừng và hỏi thay vì tự đoán. Skill
  `karpathy-guidelines` luôn bật mặc định và phải được áp dụng.
- **Bốn skill/rule luôn bật mặc định:** `karpathy-guidelines`, `ponytail`,
  `caveman` và `i-have-adhd`. Dùng `ponytail` để giảm code, abstraction,
  dependency và kích thước diff không cần thiết. Dùng `i-have-adhd` để trả lời
  theo hướng hành động, có cấu trúc, thể hiện tiến độ và dễ theo dõi. Dùng
  `caveman` để giao tiếp ngắn gọn; tạm giảm hoặc tắt riêng skill này khi cần bằng
  chứng debug chi tiết, phân tích kiến trúc, log, rủi ro hoặc giải thích đầy đủ.
  Nếu một skill làm giảm đáng kể chất lượng task, chỉ tạm bỏ skill đó và phải nói
  ngắn gọn lý do. Không được hy sinh tính đúng đắn, kiểm chứng cần thiết, test,
  bảo mật, xử lý lỗi hoặc bằng chứng quan trọng để rút ngắn code hay câu trả lời.
- **Các bộ skill ưu tiên, không bắt buộc:** chỉ gọi skill trực tiếp phù hợp khi
  task thực sự cần; không gọi cả bộ theo thói quen. Các bộ ưu tiên gồm Ponytail
  plugin, Superpowers, Matt Pocock Engineering, toàn bộ Vercel, Railway, Browser
  và điều khiển máy, Tài liệu và Office, Site hosting, Codex/plugin/skill
  development; cùng nhóm UI/frontend/design, đặc biệt `ui-ux-pro-max`,
  `web-design-guidelines` và `vercel-react-best-practices`.
- Nêu rõ giả định và điểm chưa chắc chắn trước khi thay đổi hành vi.
- Chỉ làm đúng phạm vi được giao; không thêm tính năng suy đoán.
- Thay đổi tối thiểu, giữ phong cách hiện có và tránh dọn dẹp ngoài phạm vi.
- Xác định tiêu chí đạt và bằng chứng trước khi tuyên bố hoàn thành.
- Không coi frontmatter `approved`, số lượng AC hoặc mô tả thủ công là bằng chứng
  code đã sẵn sàng/chạy đúng.
- Chính sách mới ảnh hưởng người dùng, tiền, quyền, trạng thái hoặc ranh giới
  service phải có thẩm quyền rõ ràng trong tài liệu hiện hành.
- Với tài chính, bảo toàn giá trị và tính append-only của ledger; dừng nếu spec,
  data model và quy tắc phân bổ chưa thống nhất.

## Bản đồ repository

```text
apps/web/                    Frontend React/Vite
services/api-gateway/        API gateway
services/account-service/    Tài khoản và quyền truy cập
services/venue-booking-service/
                             Cơ sở, sân, lịch và booking
services/finance-service/    Thanh toán, ví, doanh thu, hoàn tiền, tranh chấp
services/matchmaking-service/
services/community-service/  Các service cho giai đoạn sau
packages/shared/             Kiểu và tiện ích dùng chung
packages/eventbus/           RabbitMQ và outbox relay
packages/ai/                 Nền tích hợp AI
infra/                       PostgreSQL và hạ tầng cục bộ
docs/product/                Phạm vi, spec, handoff, tiến độ
docs/architecture/           Kiến trúc và mô hình dữ liệu
docs/decisions/              ADR/quyết định lâu dài
.agents/skills/              Skill cục bộ của dự án
.claude/ .codex/             Cấu hình host agent
src/                         Metadata orchestration tương thích cũ
ai-notes/                    Vùng nháp cho agent — file tạm, đã gitignore
```

**File tạm chỉ ghi vào `ai-notes/`.** Mọi file nháp (script dùng một lần, kết
quả điều tra trung gian, log, báo cáo tạm) đặt trong `ai-notes/` — không rải ra
`apps/`, `services/`, `packages/` hay gốc repo. Thư mục đã `.gitignore` (chỉ giữ
`README.md`). Test thật nằm cạnh mã nguồn (`*.test.ts(x)`); tài liệu sản phẩm
nằm trong `docs/` — không đặt hai loại này ở `ai-notes/`.

## Luồng công việc

1. Discovery và quyết định nghiệp vụ phải được duyệt trước.
2. Đọc spec, handoff, milestone hiện hành và các phụ thuộc.
3. Nếu công việc dài/nhiều phiên, dùng một plan trong `docs/plans/active/`.
4. Triển khai thay đổi nhỏ nhất đáp ứng tiêu chí.
5. Chạy test tập trung, sau đó typecheck/build hoặc kiểm chứng rộng hơn phù hợp.
6. Cập nhật bằng chứng/trạng thái ở tài liệu có thẩm quyền khi milestone yêu cầu.

Claude Code thường điều phối phạm vi và quyết định; Codex thường thực thi task đã
được giao. Quyết định hiện hành trong goal/decision log có thể chỉ định executor
khác và được ưu tiên hơn mô tả vai trò mặc định này.

## Lệnh nền

```powershell
npm run typecheck
npm run build
npm run infra:up
npm run infra:down
```

Test và Prisma chạy theo từng workspace. Không chạy migration hoặc thao tác dữ
liệu chỉ để trả lời một yêu cầu review/đọc.

<!-- HARNESS:BEGIN -->
## Harness

Start with the requested outcome, then use the repository as the system of
record. Read `docs/WORKFLOW.md` and only relevant product, design, plan, code,
and validation material.

- Answers, explanations, reviews, diagnoses, plans, and status reports are
  read-only. Inspect only what is needed and do not mutate repository or Harness
  state.
- For a bounded change, use an ephemeral plan: inspect the affected behavior and
  proof, implement, and validate. No control-plane operation is required.
- Create or update one file under `docs/plans/active/` when work spans sessions,
  needs coordination, has meaningful dependencies, or requires recovery steps.
  Move it to `docs/plans/completed/` only after validation.
- Before editing, identify repository authority for each new externally
  observable policy. If materially different choices remain open, stop before
  edits; configurable defaults are not authority.
- Report reusable agent friction. Change guidance, tools, runbooks, or validation
  for that purpose only when explicitly asked to use `$improve-harness`.
- Also pause when product intent remains ambiguous, recovery is difficult,
  validation is weakened, or authority is insufficient.
- Claim completion only with relevant executable or observable evidence. Report
  the outcome, important changes, validation, and unresolved risks.

SQLite intake, story, trace, scoring, audit, and proposal commands are optional
compatibility features. Use them only when explicitly requested or required by
an external orchestrator.
<!-- HARNESS:END -->
