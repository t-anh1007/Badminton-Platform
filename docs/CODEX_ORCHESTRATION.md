---
type: operating-manual
status: active
updated: 2026-08-05
purpose: Quy trình Claude điều khiển Codex thực thi GĐ1. Ai làm gì, giao việc thế nào, cổng kiểm nào phải qua trước khi PO nghiệm thu.
---

# Quy trình vận hành Claude ↔ Codex

Tài liệu này là hợp đồng vận hành cho toàn bộ khâu code GĐ1. Nó trả lời đúng ba câu:
ai chịu trách nhiệm gì, một task đi qua những cổng nào, và khi nào PO phải ra mặt.

## 1. Phân vai

| Vai | Ai | Trách nhiệm |
|---|---|---|
| **PO / nghiệm thu** | Tuan Anh | Quan sát và nghiệm thu kết quả. Ra quyết định khi bị escalate. Không giao task, không review code. |
| **Tech Lead** | Claude | Chia task, giao việc, giám sát, review code, review design, test lần cuối, quyết định accept hay trả lại. Chịu trách nhiệm về chất lượng trước PO. |
| **Engineer** | Codex | Viết code, viết test, chạy e2e, báo cáo kết quả kèm bằng chứng. Tự chọn skill phù hợp trong phạm vi được giao. |

Nguyên tắc: **PO chỉ thấy kết quả đã qua cổng.** Nếu Codex làm sai, Claude bắt và trả lại,
không đẩy lên PO. PO chỉ nhận escalation cho những thứ ở mục 7.

## 2. Cơ chế điều khiển

Claude điều khiển Codex qua MCP, không cần PO thao tác:

| Việc | Công cụ |
|---|---|
| Giao task mới | `mcp__codex__codex` |
| Đối thoại tiếp trong cùng task | `mcp__codex__codex-reply` |
| Codex bí, cần điều tra sâu hoặc gỡ rối | agent `codex:codex-rescue` |
| Claude tự review diff | đọc file trực tiếp + skill `code-review` |

Một gói (G-package) không nhất thiết là một lần gọi Codex. Claude cắt gói thành **task
nhỏ có kiểm chứng riêng**, giao lần lượt, review từng cái. Lý do: `Operating rules` trong
mọi `/goal` đều yêu cầu *"prefer small verified iterations over large unverified edits"* —
Claude phải cắt việc theo đúng tinh thần đó thay vì ném cả gói.

## 3. Kiểm kê skill trước khi giao task — bắt buộc

Trước **mỗi** task coding, Claude kiểm bốn nguồn:

```
D:\Khoaluantn\.agents\skills      — skill riêng của dự án (sơ đồ, onboard)
C:\Users\firet\.agents\skills     — skill dùng chung (implement, tdd, code-review, UI…)
C:\Users\firet\.codex\skills      — skill Codex đọc được
C:\Users\firet\.codex\plugins     — plugin Codex
```

**Quy tắc đặt `required_skills`:** chỉ ghi khi **thiếu nó thì đầu ra sai chuẩn**. Còn lại
để Codex tự chọn. Ví dụ:

| Tình huống | `required_skills` |
|---|---|
| Vẽ ERD hay sequence cho tài liệu | **Có** — `erd`, `sequence`, `state`. Thiếu thì sai chuẩn ký hiệu của dự án |
| Viết code có test trước | **Có** — `tdd`, nếu task yêu cầu red-green-refactor |
| Dựng khung monorepo, viết CRUD thường | **Không** — Codex tự chọn |
| Làm UI từ design đã chốt | **Có** — `react-components` nếu đi từ Stitch; `vercel-react-best-practices` khi review |

Codex **phải báo cáo** đã dùng skill nào và bằng chứng kiểm chứng. Không được mở rộng
phạm vi ngoài task.

## 4. Định dạng giao task

Mỗi task Claude giao cho Codex gồm đúng những trường sau. Đây là bản rút gọn của 6 trường
Hard Gate trong [phase-1-handoff.md](product/phase-1-handoff.md), cắt xuống mức một task:

```
Task: <một câu, một kết quả>
Thuộc gói: <Gboot | G0 | G1…G7>

Context bắt buộc đọc trước:
- <file spec + AC liên quan>
- <ADR / ràng buộc bất biến áp dụng>

Phạm vi:
- Được sửa: <đường dẫn cụ thể>
- Không được sửa: <đường dẫn cụ thể>
- Ngoài phạm vi: <liệt kê thẳng>

required_skills: <chỉ ghi khi thiếu thì sai chuẩn; còn lại "tự chọn">

Done when:
- <AC-XXX-nn pass> (dẫn mã AC, không mô tả chung chung)
- <lệnh kiểm chứng chạy sạch>

Pause if:
- <điều kiện dừng cụ thể, lấy từ Stop/pause của gói>

Báo cáo lại:
- Đã làm gì, sửa file nào
- Skill nào đã dùng và vì sao
- Bằng chứng: output test, lệnh đã chạy
- Vấn đề còn lại
```

**Không giao task mơ hồ.** Mọi `Done when` phải dẫn mã AC cụ thể từ spec đã duyệt. Nếu
một task không quy được về AC nào, đó là dấu hiệu task nằm ngoài phạm vi GĐ1.

## 5. Vòng đời một task

```
Claude cắt task
   → kiểm skill (mục 3)
   → giao Codex (mục 4)
   → Codex làm + tự test + báo cáo
   → [Cổng 1] Claude review code
   → [Cổng 2] Claude review design (nếu chạm UI)
   → [Cổng 3] Claude test độc lập
   → accept, hoặc trả lại Codex kèm lý do cụ thể
   → gói xong → PO nghiệm thu
```

### Cổng 1 — Review code

Claude tự đọc diff, không tin báo cáo của Codex. Kiểm bốn thứ:

1. **Đúng AC chưa** — chạy đúng test được dẫn trong `Done when`, đọc output thật.
2. **Có vượt phạm vi không** — diff có chạm file nằm ngoài "được sửa" không.
3. **Có phá ràng buộc bất biến không** — đặc biệt: FK/query xuyên schema (D17), import
   business logic xuyên service (D18), 9 ràng buộc bất biến ở `SCOPE_BASELINE §4`.
4. **Có over-engineer không** — theo `karpathy-guidelines` và CLAUDE.md: giải đúng cái được
   hỏi, không trừu tượng hoá sớm.

Trả lại nếu trượt bất kỳ mục nào, kèm lý do trỏ thẳng vào dòng code.

### Cổng 2 — Review design

Chỉ áp dụng cho task chạm UI. Codex viết UI tốt hơn Claude, nên Claude **review chứ không
viết lại**. Kiểm:

- Khớp design baseline đã chốt (xem mục 8)
- Responsive — dự án là web responsive, không phải desktop-only
- Trạng thái rỗng, loading, lỗi có được xử lý không (nhiều AC yêu cầu tường minh, ví dụ
  `AC-BOK-01-4` trạng thái rỗng)
- Thông báo lỗi khớp đúng nội dung AC quy định (ví dụ `AC-ACC-03-4` yêu cầu thông báo
  trùng khớp từng ký tự)

### Cổng 3 — Test độc lập của Claude

Codex đã chạy e2e. Claude **không lặp lại y hệt** mà kiểm đúng những chỗ test tự động dễ bỏ sót:

| Loại | Claude làm gì |
|---|---|
| **Kiểm thử đồng thời** | Chạy lại các AC có nhãn "bắt buộc" của gói — `AC-BOK-06-2`, `AC-FIN-10-6`, `AC-FIN-12-6`. Chạy nhiều lần để bắt race không ổn định |
| **Bất biến tiền** | Chạy `AC-FIN-07-5`, `AC-FIN-08-4`, `AC-FIN-14-8` và đối chiếu trực tiếp trên `LEDGER_ENTRY`, không tin số dư hiển thị |
| **Ranh giới service** | Quét `prisma/schema.prisma` và import: không FK, không query, không import business logic xuyên service |
| **Đường thủ công** | Chạy thử luồng chính trên trình duyệt cho gói có UI |

## 6. Nhịp báo cáo cho PO

- **Sau mỗi gói xong** (không phải mỗi task): Claude trình PO bản tóm tắt — gói nào xong,
  AC nào pass, bằng chứng, vấn đề còn lại. PO nghiệm thu bằng cách trả lời rõ ràng.
- **Không làm phiền PO giữa gói**, trừ escalation ở mục 7.

## 7. Khi nào escalate lên PO

Claude dừng và hỏi PO khi:

1. Một quyết định làm **thay đổi chính sách nghiệp vụ** hoặc phá ràng buộc bất biến.
2. Cần **mở rộng phạm vi** ngoài 40 chức năng GĐ1 đã duyệt.
3. Một AC đã duyệt **không thể hiện thực được** như đã viết — spec sai, phải sửa spec trước.
4. Phát hiện **lỗ hổng tiền** mà việc vá đòi khái niệm mới.
5. Chậm tiến độ tới mức phải kích hoạt van an toàn R1 (cắt FIN-12, FIN-13 xuống GĐ3).

Ngoài năm trường hợp trên, Claude tự quyết và chịu trách nhiệm.

## 8. Design baseline — điều kiện trước khi có UI đầu tiên

Gói **Gboot** và **G0** không có UI, nên chưa cần design. Nhưng **G1 là gói đầu tiên có màn
hình thật** (đăng ký, đăng nhập, hồ sơ). Trước G1 phải có một baseline, nếu không mọi màn
sau sẽ phải làm lại.

Baseline tối thiểu cần chốt:

- Bảng màu, typography, spacing scale
- Bộ component nền: button, input, form field, card, modal, toast, empty state, loading
- Layout khung: header, sidebar cho khu vực quản trị, layout responsive
- Quy ước hiển thị tiền, ngày giờ, trạng thái booking

Công cụ sẵn có: `stitch-design` (sinh design system + màn hình), `react-components`
(chuyển design sang component Vite/React), `design-an-interface` (khám phá nhiều phương án).

**Thứ tự đề xuất:** `Gboot → G0 → Gdesign (baseline UI) → G1 → G2 → …`

## 9. Nguyên tắc bất di

1. Claude **không tự viết code sản phẩm** trừ khi sửa lỗi nhỏ khi review. Việc code là của Codex.
2. Claude **không nghiệm thu thay PO**, và **không đẩy việc review lên PO**.
3. Mọi `Done when` phải dẫn **mã AC cụ thể**, không mô tả chung chung.
4. Không task nào được vượt phạm vi đã ghi. Codex phát hiện cần vượt → dừng và báo Claude.
5. Không bỏ qua cổng. Kể cả task nhỏ cũng qua Cổng 1.
