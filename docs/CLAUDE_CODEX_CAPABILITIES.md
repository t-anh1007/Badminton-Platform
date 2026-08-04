# Catalog skill và plugin cho Claude Code + Codex

Tài liệu này giúp Claude Code chọn năng lực phù hợp khi điều phối Codex trong dự án
Khoaluantn. Đây là catalog định tuyến, không phải yêu cầu phải dùng mọi skill hoặc
plugin.

## Trạng thái và nguyên tắc chọn

- Dự án đang ở giai đoạn `discovery`; ưu tiên làm rõ yêu cầu, use case và mô hình
  nghiệp vụ trước khi thiết kế hoặc viết code.
- Skill trong `D:\Khoaluantn\.agents\skills\` là skill cục bộ, phù hợp nhất với
  quy ước của dự án này.
- Skill/plugin toàn cục của Codex chỉ được dùng khi nhiệm vụ thực sự cần. Claude
  nên ghi rõ tên skill trong task gửi Codex; không giả định chúng tự kích hoạt.
- Catalog này chủ động loại trừ các skill chuyên vẽ diagram theo yêu cầu của dự
  án; Claude không chọn hoặc giao các skill đó cho Codex từ tài liệu này.
- Plugin kết nối bên ngoài ở cuối tài liệu mới chỉ là đề xuất chưa cài. Không giao
  task phụ thuộc vào chúng cho đến khi đã cài và xác minh quyền truy cập.
- `AGENTS.md` đang tham chiếu `RTK.md`, nhưng hiện không có file `RTK.md` ở gốc dự
  án. Không coi RTK là hướng dẫn dự án đã kích hoạt.

## Skill cục bộ nên ưu tiên

| Nhu cầu | Skill | Khi dùng |
|---|---|---|
| Làm rõ ý tưởng | `$brainstorm` | Phỏng vấn và chuẩn hóa ý tưởng thô trước URD/PRD |
| Đặc tả nghiệp vụ | `$usecase` | Xác định phạm vi, viết hoặc review Use Case bằng tiếng Việt |
| Khảo sát repo brownfield | `$onboard-repository` | Chỉ khi được yêu cầu map/onboard repository; lượt đầu read-only |
| Kiểm toán khảo sát repo | `$audit-onboarding-proposal` | Review độc lập proposal onboarding; read-only |

## Skill Codex toàn cục hữu ích

Claude có thể yêu cầu Codex dùng các skill sau khi task phù hợp:

### Discovery, thiết kế và lập kế hoạch

- `brainstorming`: dùng trước công việc sáng tạo hoặc thiết kế tính năng mới.
- `grilling`: stress-test một kế hoạch/ý tưởng sau khi đã có bản tóm tắt và người
  dùng đồng ý.
- `research`: nghiên cứu dựa trên nguồn sơ cấp, đáng tin cậy.
- `domain-modeling`: làm rõ entity, invariant, hành vi và ranh giới domain.
- `codebase-design`: thiết kế module và API có ranh giới rõ.
- `request-refactor-plan`: tạo kế hoạch refactor chi tiết khi thực sự có code cần
  tái cấu trúc.

### Implementation và chất lượng

- `tdd` / `superpowers:test-driven-development`: viết test trước khi triển khai
  feature hoặc sửa lỗi.
- `diagnosing-bugs` / `superpowers:systematic-debugging`: điều tra nguyên nhân gốc
  trước khi sửa bug.
- `code-review`: review thay đổi từ một commit/branch/merge-base xác định.
- `resolving-merge-conflicts`: xử lý merge hoặc rebase conflict đang diễn ra.
- `superpowers:verification-before-completion`: kiểm chứng trước khi báo hoàn thành.
- `setup-pre-commit`: thiết lập Husky/lint-staged khi stack JavaScript/TypeScript đã
  được xác nhận.
- `karpathy-guidelines`: giữ thay đổi đơn giản, tối thiểu, có tiêu chí kiểm chứng.

### Frontend và nền tảng web

- `build-web-apps:frontend-app-builder`: tạo frontend/dashboard/app mới.
- `build-web-apps:frontend-testing-debugging`: kiểm thử hoặc sửa UI đã render.
- `build-web-apps:react-best-practices` và `vercel-react-best-practices`: tối ưu
  React/Next.js khi stack đã được chọn.
- `build-web-apps:shadcn`: thêm hoặc sửa component shadcn.
- `build-web-apps:supabase-postgres-best-practices`: review thiết kế và hiệu năng
  PostgreSQL/Supabase.
- `build-web-apps:stripe-best-practices`: chỉ dùng nếu Stripe được chọn làm cổng
  thanh toán; hiện chưa phải quyết định sản phẩm mặc định.

### Tài liệu và artefact

- `documents:documents`: tạo/chỉnh sửa DOCX.
- `pdf:pdf`: đọc, tạo, render và kiểm tra PDF.
- `presentations:Presentations`: tạo/chỉnh sửa slide.
- `spreadsheets:Spreadsheets`: tạo và phân tích bảng tính.
- `imagegen`: tạo hoặc chỉnh sửa ảnh raster.
- `browser:control-in-app-browser`, `chrome:control-chrome`,
  `computer-use:computer-use`: chỉ dùng khi task cần thao tác UI/browser thực tế.

## Plugin đã có năng lực khả dụng trong Codex

| Nhóm plugin | Năng lực chính | Mức phù hợp |
|---|---|---|
| OpenAI bundled | Browser, Chrome, computer use, visualization | Hữu ích cho khảo sát và QA giao diện |
| OpenAI primary runtime | DOCX, PDF, slide, spreadsheet, template | Rất phù hợp cho báo cáo khóa luận |
| Build Web Apps | Frontend builder/debugging, React, shadcn, Supabase, Stripe | Dùng sau khi kiến trúc và stack được duyệt |
| Superpowers | Brainstorming, planning, TDD, debugging, verification, review | Hữu ích theo từng task; không bật đồng loạt |
| Matt Pocock engineering skills | Review, domain modeling, design, debugging, TDD | Hữu ích cho chất lượng kỹ thuật |
| OpenAI Codex helpers | Hỗ trợ runtime và định dạng kết quả Codex | Năng lực nội bộ, Claude không cần chọn trực tiếp |
| Claude cowork plugin management | Tạo/tùy chỉnh plugin Claude | Chỉ dùng khi có yêu cầu xây plugin riêng |

## Plugin được đề xuất nhưng chưa cài

Các plugin sau có thể đáng cân nhắc cho dự án, nhưng **chưa khả dụng cho task**
cho đến khi người dùng yêu cầu cài và hoàn tất xác minh:

| Ưu tiên | Plugin | Chỉ cài khi |
|---|---|---|
| Cao | GitHub | Cần quản lý issue, PR, review hoặc CI từ Codex |
| Cao | Figma hoặc Product Design | Có quy trình UI/UX và nguồn thiết kế chính thức |
| Cao | Supabase hoặc Neon Postgres | Đã chọn nền tảng database/hosting tương ứng |
| Cao | Vercel hoặc Cloudflare | Đã chọn chiến lược deploy tương ứng |
| Trung bình | Sentry | Có ứng dụng chạy và cần error monitoring |
| Trung bình | PostHog | Có consent và kế hoạch product analytics rõ ràng |
| Trung bình | Stripe | Stripe được phê duyệt là cổng thanh toán |
| Thấp | Notion, Google Drive, Zotero | Cần đồng bộ tài liệu/nghiên cứu với dịch vụ đó |

Không cài đồng thời các lựa chọn thay thế như Supabase và Neon, hoặc Vercel và
Cloudflare, nếu kiến trúc chưa quyết định.

## Cách Claude giao task cho Codex

Claude nên gửi một task hẹp, có skill được chọn và bằng chứng hoàn thành:

```json
{
  "task_id": "task-xxx",
  "skill": "$usecase",
  "goal": "Viết đặc tả use case đặt sân từ yêu cầu đã xác nhận",
  "inputs": ["docs/SCOPE_BASELINE.md"],
  "scope": "Chỉ luồng đặt sân của người chơi",
  "out_of_scope": ["thanh toán", "hoàn tiền", "tìm kèo"],
  "acceptance_criteria": [
    "Không phát minh quy tắc nghiệp vụ",
    "Đánh dấu rõ điểm chưa xác nhận",
    "Đầu ra tiếng Việt có dấu"
  ],
  "verification": ["Đối chiếu từng điều kiện với tài liệu nguồn"]
}
```

Quy tắc chọn nhanh: dùng skill cục bộ nếu có; nếu không có, chọn đúng một skill
toàn cục chính và chỉ bổ sung skill kiểm chứng khi cần. Không dùng plugin chỉ vì
nó đã cài.
