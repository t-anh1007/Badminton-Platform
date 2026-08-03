# BPMN Template — IR-driven (kiến trúc 2 lớp)

## Nguyên tắc

## IR schema (`{slug}.ir.json`)

```jsonc
{
  "process": { "id": "Process_{slug}", "title": "Tên quy trình hiển thị" },
  "lanes": [                                  // thứ tự = thứ tự dải ngang (trên→dưới)
    { "id": "Lane_learner", "name": "Người học" },
    { "id": "Lane_system",  "name": "Hệ thống auth" }
  ],
  "nodes": [
    { "id": "Start_1",  "kind": "start",   "lane": "Lane_learner", "name": "Trigger bắt đầu" },
    { "id": "Task_a",   "kind": "task",    "lane": "Lane_system",  "name": "Động từ + tân ngữ nghiệp vụ" },
    { "id": "GW_a",     "kind": "gateway", "lane": "Lane_system",  "name": "Câu hỏi quyết định?" },
    { "id": "End_ok",   "kind": "end",     "lane": "Lane_learner", "name": "Kết cục thành công" },
    { "id": "End_err",  "kind": "end",     "lane": "Lane_system",  "name": "Kết cục lỗi" }
  ],
  "flows": [
    { "id": "Flow_1", "src": "Start_1", "tgt": "Task_a" },
    { "id": "Flow_2", "src": "GW_a", "tgt": "End_ok",  "name": "Đạt" },     // name BẮT BUỘC cho nhánh gateway
    { "id": "Flow_3", "src": "GW_a", "tgt": "End_err", "name": "Không đạt" }
  ]
}
```

## Source facts (`{slug}.src.json`) — để semcheck đối chiếu nguồn

```json
{
  "actors":   ["Người học", "Hệ thống auth", "Email service"],
  "branches": ["Không đạt", "Email đã có", "Token hết hạn"],
  "errors":   ["Email đã được đăng ký", "Link đã hết hạn"]
}
```

- `actors` = mọi actor trong UC Mục b → semcheck kiểm mỗi cái có lane.
- `branches` = mọi nhánh UC Mục d → semcheck kiểm có gateway-nhánh tương ứng.
- `errors` = E-code liên quan → semcheck kiểm có end/nhánh xử lý.
- Semcheck so khớp gần đúng (bỏ dấu, lowercase) → cảnh báo nếu IR sót, KHÔNG chặn (phán xét cuối là nghiệp vụ).

## Cách suy luận IR từ UC (gap-driven, không bịa)

| Nguồn trong UC | → IR |
|---|---|
| Mục b Actors (primary + supporting) | `lanes[]` |
| Mục a/c trigger | `start` node |
| Mỗi bước trong Mục d Expected result | `task` node (lane = actor làm bước đó) |
| Mỗi "Nếu... thì..." trong Mục d Branches | `gateway` + các `flow` có `name` = điều kiện |
| Kết quả chính + mỗi error-path | `end` node (mỗi kết cục 1 cái) |
| Mục g Related FR / Error Matrix | đối chiếu errors trong src.json |

**Đặt lane cho node** = ai chịu trách nhiệm bước đó (người học nhập, hệ thống validate, email service gửi...). Cột/toạ độ KHÔNG khai — engine longest-path tự tính.

## IR rules (semcheck enforce — structural, BẮT BUỘC pass)

- Đúng 1 `start`; ≥1 `end`.
- `gateway` có ≥2 outgoing; mỗi outgoing có `name`.
- Mọi node reachable từ start + dẫn được tới end.
- Không self-loop; id duy nhất; lane/src/tgt tham chiếu hợp lệ.
- Loop (vd revise→draft, retry) hợp lệ — engine nhận back-edge tự đi vòng band trống.

## Pipeline (engine lo, AI chỉ chạy lệnh)

```
node bpmn-build.mjs            # mọi .ir.json → semcheck → layout → .bpmn → _viewer.html
node bpmn-build.mjs --verify   # semcheck (structural+coverage) + validate layout mọi .bpmn
```

## File `bpmn/{feature}-bpmn-index.md`

```yaml
---
type: bpmn-index
feature: {{feature}}
status: draft
updated: {{date}}
---
# {{feature}} — BPMN Index
| Process | File | Lanes | Gateways | Viewer |
|---|---|---|---|---|
| {{title}} | `{{slug}}.bpmn` | {{n}} | {{k}} | `_viewer.html#{{slug}}` |
```

## Cross-ref

- `srs/{{feature}}-flows.md` — Mermaid activity (nhẹ, render Obsidian). BPMN cho chuẩn OMG + import tool BPM.
- `.agents/rules/diagram-selection.md` — khi nào `$activity` vs `$bpmn`.
