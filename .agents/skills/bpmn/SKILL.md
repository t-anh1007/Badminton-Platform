---
name: bpmn
description: Dùng khi cần vẽ BPMN 2.0 chuẩn OMG cho 1 quy trình nghiệp vụ đa vai trò (approval, onboarding, refund...). Kích hoạt bằng `$bpmn "<mô tả quy trình>" --feature <slug>`. Khác `$activity` (Mermaid gần đúng, không phải chuẩn OMG).
---

# $bpmn — BPMN 2.0 Process Diagram (chuẩn OMG, kiến trúc 2 lớp)

## Goal

Sinh BPMN 2.0 cho 1 quy trình nghiệp vụ đa vai trò, **chạy là vẽ đúng + đúng nghiệp vụ**.

**ENGINE dùng chung ở `.agents/skills/bpmn/engine/`** (KHÔNG copy vào mỗi feature). Chứa `bpmn-build.mjs` + `bpmn-layout-*.mjs` + `bpmn-semcheck.mjs` + `_viewer_template.html` + `node_modules` (cài 1 lần). Gọi trỏ vào feature qua `--dir docs/{feature}/bpmn`.

**OUTPUT per-feature** trong `docs/{feature}/bpmn/` — CHỈ 3-5 file nghiệp vụ (không có engine/deps):

1. `{process}.ir.json` — **IR** nghiệp vụ do AI sinh. Source of intent. Sửa cái này khi gọi lại skill để update.
2. `{process}.src.json` — source facts (actors/branches/errors) để check coverage.
3. `{process}.bpmn` — XML BPMN 2.0 đầy đủ (semantic + BPMNDiagram) do engine sinh. Import Camunda/Bizagi/draw.io.
4. `{feature}-bpmn-editor.html` — **editor** kéo-thả (bpmn-js modeler): sửa như bpmn.io + nút Tải/Lưu .bpmn. Đa-process dropdown.
5. `{feature}-bpmn-index.md` — metadata + bảng process.

> **Không nhân bản engine.** Trước đây engine + node_modules copy vào mỗi feature (18+ file/feature). Từ 2026-07-09: engine 1 nơi chung, feature chỉ giữ output.

## Kiến trúc 2 lớp (CỐT LÕI — đừng đổi)

```
UC/SRS/flows ──(AI đọc + suy luận)──► {slug}.ir.json   (lanes / nodes / flows)
                                       {slug}.src.json  (actors / branches / errors trích nguồn)
                                          │
              bpmn-build.mjs:             ▼
   (A) semcheck ── structural BẮT BUỘC pass (start/end, reachable, gateway≥2 nhánh, không mồ côi)
                ── coverage: actor↔lane, branch↔gateway, error↔end  → cảnh báo nếu lệch nguồn
                                          │ (ok)
   (B) layout engine ── no-lane: bpmn-auto-layout · swimlane dọc: grid (lane=cột, bước=hàng) — tính toạ độ + routing
                                          ▼
                                  {slug}.bpmn  ──► {feature}-bpmn-editor.html
```

> **AI CHỈ sinh IR JSON + src facts. KHÔNG viết XML, KHÔNG tính toạ độ.** Engine `bpmn-layout-auto.mjs` (bpmn-auto-layout) lo toàn bộ layout. Semcheck `bpmn-semcheck.mjs` chặn IR sai nghiệp vụ trước khi vẽ.
>
> **2 engine chính, chọn theo có/không swimlane:**
> - **No-lane (mặc định)** = `bpmn-auto-layout` (bpmn-io chính chủ) — routing sạch như vẽ tay, gateway `X` chuẩn OMG, loop-back đi vòng đẹp. IR → BPMN semantic thuần (KHÔNG toạ độ) → `layoutProcess()` sinh DI → tự chèn `<BPMNLabel>`. **Bài học:** thư viện tự route rất tốt; ĐỪNG chồng routing tự chế lên (clip/dogleg → khúc "tréo tréo"). Hạn chế cứng: **KHÔNG có khái niệm swimlane** (chỉ set size Lane 400×100, không partition node) — không thể ép ra lane.
> - **Swimlane DỌC (mặc định khi có lane)** = engine grid tự viết `bpmn-layout-grid.mjs` (từ 2026-07-13). **lane = CỘT, bước = HÀNG** (rank longest-path), node canh giữa cột lane, flow chảy XUỐNG. Fan-out gateway (mỗi nhánh ra 1 cạnh khác — tránh chồng stub đáy), fan-in (nhiều edge vào 1 node cắm điểm top khác nhau), loop đi hành lang mép phải (không vọt đỉnh). Vào bằng `BPMN_LANES=1` + IR ≥2 lane. Verify soi overlap dọc/ngang + cắt task → engine grid PASS sạch.
> - `BPMN_ENGINE=grid` ép grid dọc kể cả no-lane; `BPMN_ENGINE=elk` ép ELK swimlane NGANG cũ (dự phòng, `bpmn-layout-elk.mjs`); `BPMN_ENGINE=legacy` engine tự viết 267 dòng cũ.
>
> **Vì sao grid tự viết cho swimlane:** bpmn-auto-layout đẹp nhưng không làm lane (hạn chế cứng bpmn-io); ELK partition được nhưng loop vọt lên đỉnh cắt ngang + không nén node cùng lane → xấu. Grid kiểm soát 100%: node thẳng hàng theo rank, lane dọc sạch (như draw.io vẽ tay), route gọn.
>
> **Lane MẶC ĐỊNH TẮT (no-lane / phẳng).** Flow nhiều nhánh nhảy lane → phẳng vẫn đẹp & rõ. Bật swimlane có chủ đích khi quy trình phân vai rõ (mỗi vai 1 cụm liền mạch): `BPMN_LANES=1 node bpmn-build.mjs`. IR vẫn khai `lanes` (dùng cho flowNodeRef + coverage).
>
> **Tại sao IR?** Tách "hiểu nghiệp vụ" (AI giỏi) khỏi "vẽ pixel" (engine giỏi). AI sai toạ độ = thảm hoạ; AI sinh cấu trúc nghiệp vụ thì đáng tin + kiểm được. IR cũng khiến update mode chỉ sửa JSON, layout tự regen.

## Constraints

- **AI sinh IR + src, KHÔNG sinh XML.** Vi phạm = quay lại đúng vấn đề cũ (toạ độ sai, line đè). Engine (auto-layout / grid) lo toạ độ.
- **Lane mặc định tắt.** KHÔNG ép swimlane trừ khi user muốn rõ + quy trình phân vai sạch. Đa số flow → no-lane đẹp hơn.
- **Semcheck structural phải PASS** trước khi có .bpmn. Coverage warning → review nghiệp vụ (thiếu actor/branch/error?), sửa IR nếu thật sự sót.
- **L1 approval** trước Write — prose BA-friendly (xem `ba-conventions.md` Mục 5), trình bày IR bằng từ nghiệp vụ (vai trò / bước / nhánh), KHÔNG dump JSON.
- **KHÔNG L3 iterate** — review từ `{feature}-bpmn-editor.html`.
- **Vietnamese-first** trong name; engine tự escape XML.
- **Per `diagram-selection.md`** — `$bpmn` khi cần chuẩn OMG + import tool BPM / kéo-thả editor. Đa vai trò mô tả nghiệp vụ thường (không cần engine) → `$activity-swimlane` (swimlane thật, nhẹ hơn). Flow gọn cần nhúng inline → `$activity` (Mermaid).
- **1 quy trình = 1 mục tiêu.** Quy trình quá lớn / 2 luồng merge phức tạp → tách 2 BPMN (như login email vs Google), gọn + dropdown nhiều process.
- **Idempotent** — `bpmn/{feature}-bpmn-index.md` track process; trùng slug → tự vào update mode (L2 diff cho IR), không refuse.
- **`--feature` optional** — auto-detect từ ngữ cảnh/feature đang làm dở; mơ hồ mới hỏi bằng picker. **Feature chưa tồn tại + arg là mô tả quy trình → tự derive slug + tạo feature** (điểm-vào, xem `feature-bootstrap.md` nhóm A). KHÔNG bắt qua `/brainstorm` trước.

## Inputs

```
$bpmn "<mô tả quy trình>" --feature <slug>    # tạo process mới, hoặc tự vào update mode nếu trùng slug
$bpmn --feature <slug>                        # interactive: hỏi quy trình nào
$bpmn <feature>                               # feature-only: đọc context, đề xuất quy trình nên vẽ
```

`--feature` có thể bỏ nếu chỉ đang làm dở 1 feature — skill auto-detect, mơ hồ mới hỏi.

## Context (dynamic)

Khi chạy, lấy ngày hiện tại từ runtime; quét feature và BPMN index hiện có bằng công cụ filesystem của Codex. Kiểm tra Node.js và thư mục `.agents/skills/bpmn/engine/node_modules` trước khi ghi.

## Approach

1. **Resolve feature + quy trình.** Nếu chỉ có `<feature>` (không mô tả) → đọc context, đề xuất quy trình nào nên vẽ (gateway nhiều/đa vai trò), hỏi user chọn. Slug = verb-object kebab-case.
   - **Feature chưa tồn tại (điểm-vào, per `feature-bootstrap.md` nhóm A):** nếu arg là 1 mô tả quy trình thô mà chưa có `docs/{feature}/` nào khớp (vd `$bpmn "khách đặt hàng, shipper giao, admin duyệt hoàn tiền"`) → `$bpmn` ĐƯỢC PHÉP tự khởi tạo: derive feature slug từ mô tả (kebab-case, ASCII, ≤50 ký tự), confirm slug ở L1 (user override được), tạo `docs/{feature}/bpmn/` khi Write. KHÔNG bắt user chạy `/brainstorm` trước.
2. **Đọc nguồn nghiệp vụ** (nếu có, không bịa): UC liên quan (`usecases/uc-*.md` Mục b Actors, d Expected result + **Branches**, g Related FR), `srs/{feature}-flows.md`, `srs/{feature}-spec.md` Error Matrix.
   - **Có UC/SRS** → trích facts từ đó (bước 3), không hỏi lại cái đã có (no-re-ask).
   - **CHƯA có UC/SRS (feature mới hoặc feature cũ thiếu nguồn)** → **phỏng vấn ĐÚNG PHẠM VI BPMN cần** (per `feature-bootstrap.md` nhóm A bước 3), hỏi gom 1 batch business-language (KHÔNG hỏi DB/SDK): **vai trò/lanes** nào tham gia · **các bước** chính theo thứ tự · **điểm rẽ nhánh** (câu hỏi quyết định + các nhánh) · **kết cục** (thành công + mỗi error-path). KHÔNG bịa — thiếu ý nào hỏi ý đó. Đây là phỏng vấn làm rõ đủ để vẽ đúng, không lan man toàn diện như `/brainstorm`.
3. **Trích source facts** → `{slug}.src.json`:
   - `actors`: mọi actor trong UC Mục b (primary + supporting).
   - `branches`: mọi nhánh "Nếu... thì..." trong UC Mục d Branches.
   - `errors`: mọi E-code liên quan (từ UC + Error Matrix).
4. **Suy luận IR** → `{slug}.ir.json`:
   - `lanes` = actors (mỗi actor 1 lane; gộp nếu cùng vai trò).
   - `nodes`: 1 `start` (trigger UC Mục a/c) · `task` cho mỗi bước (động từ+tân ngữ, lane = ai làm) · `gateway` cho mỗi điểm rẽ (từ Branches) · `end` cho mỗi kết cục (success + mỗi error-path).
   - `flows`: nối node theo Expected result + Branches; mỗi gateway-outgoing có `name` = điều kiện nhánh.
   - **Lane đặt node theo AI** (ai chịu trách nhiệm bước đó); cột/toạ độ KHÔNG cần — engine tự lo.
5. **L1 plan preview** — prose BA-friendly:
   > Em sẽ tạo BPMN **{title}** trong `docs/{feature}/bpmn/`:
   > - **{N} vai trò**: {liệt kê}
   > - **{M} bước** + **{K} điểm rẽ nhánh**: {1-line nhánh chính}
   > - **{E} kết cục**: {liệt kê}
   > - Phủ nghiệp vụ: {a actor / b branch / c error} từ UC {tên}
   >
   > Apply? (Y / sửa)
6. **Write** sau khi user Y:
   - Tạo `docs/{feature}/bpmn/` (chỉ chứa OUTPUT — KHÔNG copy engine vào feature nữa).
   - Write `{slug}.ir.json` + `{slug}.src.json`.
   - Chạy engine CHUNG trỏ vào feature: `node .agents/skills/bpmn/engine/bpmn-build.mjs --dir docs/{feature}/bpmn` → semcheck + layout → `{slug}.bpmn` + rebuild `{feature}-bpmn-editor.html` (trong feature dir).
   - Tạo/cập nhật `bpmn/{feature}-bpmn-index.md`.
7. **Gọi lại với slug trùng** (update mode tự động) → L2 diff cho `{slug}.ir.json`, rồi rerun `... bpmn-build.mjs --dir docs/{feature}/bpmn` (layout regen tự động).
8. **Verify** (BẮT BUỘC): `node .agents/skills/bpmn/engine/bpmn-build.mjs --dir docs/{feature}/bpmn --verify` → semcheck + layout sạch. Có lỗi structural → sửa IR. Coverage warning → đối chiếu nguồn. KHÔNG báo thành công khi còn ✗.
9. **Activity log** — sau mỗi file đã Write/Edit, chạy `node .agents/scripts/activity-log.mjs --skill bpmn --file <project-relative-path-vừa-ghi> --note "added BPMN {title}"`.
10. **Output report:**
    ```
    ✅ BPMN created: docs/{feature}/bpmn/{slug}.bpmn (chuẩn OMG, swimlane)
       Vai trò: {N} | Bước: {M} | Rẽ nhánh: {K} | Kết cục: {E}
       Phủ nghiệp vụ: actors {a}/{a} · branches {b}/{b} · errors {c}/{c}
       Verify: ✓ structural OK, layout sạch

    Xem/sửa: mở docs/{feature}/bpmn/{feature}-bpmn-editor.html (kéo-thả như bpmn.io)
    Import: kéo {slug}.bpmn vào Camunda/Bizagi/draw.io
    Sửa:    gọi lại $bpmn "<thay đổi>" --feature {feature}, em tự vào update mode.
    ```

## IR schema (AI sinh đúng format này)

```jsonc
{
  "process": { "id": "Process_{slug}", "title": "Tên quy trình" },
  "lanes": [ { "id": "Lane_x", "name": "Vai trò" } ],          // thứ tự = thứ tự dải dọc
  "nodes": [
    { "id": "Start_1", "kind": "start",   "lane": "Lane_x", "name": "Trigger" },
    { "id": "Task_a",  "kind": "task",    "lane": "Lane_x", "name": "Động từ + tân ngữ" },
    { "id": "GW_a",    "kind": "gateway", "lane": "Lane_x", "name": "Câu hỏi quyết định?" },
    { "id": "End_a",   "kind": "end",     "lane": "Lane_x", "name": "Kết cục" }
  ],
  "flows": [
    { "id": "Flow_1", "src": "Start_1", "tgt": "Task_a" },
    { "id": "Flow_2", "src": "GW_a", "tgt": "Task_a", "name": "Nhãn nhánh" }   // name BẮT BUỘC cho nhánh gateway
  ]
}
```

src.json: `{ "actors": [...], "branches": [...], "errors": [...] }` — facts trích từ UC để semcheck đối chiếu.

**IR rules** (semcheck enforce): đúng 1 start · ≥1 end · gateway ≥2 outgoing có name · mọi node reachable từ start + tới được end · không self-loop · id duy nhất. Loop (revise→draft) hợp lệ — engine tự nhận back-edge + đi vòng.

## Assets (engine — đừng sửa khi chạy skill, chỉ copy)

| File | Vai trò |
|------|---------|
| `bpmn-semcheck.mjs` | Kiểm IR: structural (chặn) + coverage (cảnh báo). Hàm `checkIR(ir, src)`. |
| `bpmn-layout-auto.mjs` | Engine no-lane MẶC ĐỊNH (bpmn-auto-layout bpmn-io). IR → semantic → `layoutProcess()`. Routing sạch nhất. |
| `bpmn-layout-grid.mjs` | Engine SWIMLANE DỌC mặc định (tự viết). lane=cột, bước=hàng, fan-out/fan-in, loop hành lang phải. Hàm `layoutToBpmn(ir)`. |
| `bpmn-layout-elk.mjs` | Engine swimlane NGANG dự phòng (elkjs partitioning). `BPMN_ENGINE=elk`. |
| `bpmn-layout.mjs` | Engine tự viết cũ (`BPMN_ENGINE=legacy`). Hàm `layoutIR(ir)`. |
| `bpmn-build.mjs` | Pipeline: IR → semcheck → chọn engine → .bpmn → viewer. `--verify` / `--no-ir`. |
| `_viewer_template.html` | Viewer bpmn-js CDN, dropdown đa-process. |

## Gotchas

- **AI viết XML tay = sai mục đích.** Chỉ sinh IR JSON. Nếu user paste BPMN XML để sửa → trích về IR rồi mới layout lại.
- **Semcheck báo coverage thiếu** (vd "branch X chưa có gateway") → ĐỌC LẠI UC, nếu thật sự sót thì thêm vào IR; nếu nhánh đó out-of-scope thì OK bỏ qua (warning, không chặn).
- **Quy trình 2 luồng merge phức tạp** (vd login email+Google chung) → tách 2 BPMN. Engine xử lý fan-out/fan-in tốt nhưng 1 quy trình nên 1 mục tiêu.
- **Loop/back-edge** — engine tự nhận (DFS) + đi vòng band trên/dưới. AI cứ khai flow quay lại bình thường.
- **Gateway 1 nhánh** — semcheck chặn. Gateway phải ≥2 outgoing.
- **Viewer cần internet lần đầu** (CDN bpmn-js, như `/dashboard`). Offline tuyệt đối → user yêu cầu, inline lib (~600KB).
- **Đừng over-dùng** — tuyến tính 1 vai trò → `$sequence` / `$activity`; đa vai không cần chuẩn OMG/engine → `$activity-swimlane`.

## References

- @../../rules/ba-conventions.md
- @../../rules/approval-gate.md
- @../../rules/naming-conventions.md
- @../../rules/changelog.md
- @../../rules/diagram-selection.md
- @../../rules/feature-bootstrap.md
- @../../../_templates/diagram-bpmn.md
