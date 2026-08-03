---
name: d2-architect
description: Dùng khi cần vẽ sơ đồ kiến trúc hệ thống (component, service, DB lồng nhau) bằng D2 — layout ELK, đẹp hơn Mermaid cho loại sơ đồ này. Kích hoạt bằng `$d2-architect --feature <slug>`. Cùng họ với `$d2-activity`, `$d2-erd`.
---

# $d2-architect — System / Architecture Diagram (D2, nested container + ELK)

> Họ skill D2: `$d2-activity` (flow) · `$d2-erd` (data model) · `$d2-architect` (kiến trúc này). Cả 3 dùng chung `d2-render.mjs` ở `.agents/skills/d2-activity/`.

## Goal

Vẽ **bức tranh kiến trúc hệ thống** ở tầm nghiệp vụ: các khối (client, backend, dịch vụ ngoài) lồng các thành phần con (service, DB, gateway), luồng gọi giữa chúng có nhãn nghiệp vụ. Dùng nested container của [D2](https://d2lang.com) — thứ **Mermaid không vẽ được đẹp**. Output trong `docs/{feature}/d2-architect/`:

1. `{slug}.d2` — source D2 (text, version git). Sửa khi gọi lại skill (tự vào update mode).
2. `{slug}.svg` — render sẵn (mở browser/IDE/Obsidian).

Plus `d2-architect/{feature-or-shared}-d2-architect-index.md` (metadata + bảng khối). Nếu vẽ kiến trúc toàn hệ thống (không thuộc 1 feature) → lưu `docs/_shared/d2-architect/`.

## Kiến trúc = tầm nghiệp vụ, KHÔNG phải sơ đồ triển khai

Skill phục vụ IT-BA, KHÔNG phải solution architect. Vẽ ở mức **"hệ thống gồm khối gì, gọi dịch vụ ngoài nào, luồng dữ liệu chính"** — đủ để stakeholder + dev hiểu bối cảnh. KHÔNG vẽ: pod/replica, load balancer config, VPC/subnet, port number, container image. Nếu user cần mức đó → đó là việc của architect, ngoài scope.

**ĐƯỢC vẽ:** khối logic (Client/Backend/Mobile), service theo chức năng nghiệp vụ (Auth, SRS Engine, Import), database (1 khối), dịch vụ ngoài theo tên + mục đích (Google OAuth, Stripe, SendGrid), luồng gọi có nhãn nghiệp vụ.

## Constraints

- **Output cố định** `docs/{feature}/d2-architect/{slug}.d2` + `.svg` (hoặc `docs/_shared/d2-architect/` nếu cross-feature).
- **`--feature` optional** — auto-detect từ ngữ cảnh; không có `--feature` mà có mô tả kiến trúc TỔNG → vẽ vào `_shared/d2-architect/` (escape hatch, GIỮ nguyên). File đã tồn tại → tự vào update mode, không cần flag. **Muốn gắn vào 1 feature cụ thể mà feature chưa có → tự derive slug + tạo feature** (điểm-vào, xem `feature-bootstrap.md` nhóm A); kiến trúc tổng thì vẫn vào `_shared/` như cũ.
- **AI viết source, KHÔNG toạ độ** — ELK lo layout.
- **Render qua `node .agents/scripts/d2-render.mjs`** (dùng chung). KHÔNG gọi d2/Chrome trực tiếp.
- **Compile phải PASS** trước khi báo xong.
- **L1 approval** trước Write — prose BA-friendly (các khối + dịch vụ ngoài + luồng chính), KHÔNG dump source.
- **KHÔNG L3 iterate** — review từ .svg.
- **KHÔNG hỏi/vẽ infra detail** (port, replica, VPC) — xem Mục "tầm nghiệp vụ" trên.
- **Vietnamese-first** nhãn luồng + tên khối; tên service giữ theo hệ thống thật.
- **Per `diagram-selection.md`** — `$d2-architect` cho bức tranh hệ thống; luồng nghiệp vụ nhiều nhánh → `$d2-activity`; data model → `$d2-erd`.
- **Idempotent** — 1 slug = 1 file; chạy lại → tự vào update mode (L2 diff), không refuse.

## Inputs

```
$d2-architect --feature <slug>              # kiến trúc trong bối cảnh 1 feature
$d2-architect "<mô tả hệ thống>"            # kiến trúc tổng → docs/_shared/d2-architect/
$d2-architect "<mô tả>" --feature <slug-mới>  # feature chưa có → derive/dùng slug + phỏng vấn + tạo (điểm-vào)
```

Slug đã tồn tại → skill tự nhận ra và vào update mode (L2 diff), không cần gõ thêm gì.

## Context (dynamic)

Khi chạy, lấy ngày hiện tại từ runtime; quét feature và `docs/_shared/system-overview.md` bằng công cụ filesystem của Codex. Kiểm tra lệnh `d2` trong PATH trước khi ghi.

## Flow runtime

```
User gọi $d2-architect [--feature X | "<mô tả>"]
   │  d2 chưa cài? → dừng, hướng dẫn install
   │  ┌─ Resolve đích ghi (feature-bootstrap.md nhóm A + escape hatch _shared):
   │  │  • Kiến trúc TỔNG (mô tả toàn hệ thống, không --feature) → docs/_shared/d2-architect/
   │  │    (GIỮ nguyên đường này — trạng thái "chưa feature" hợp lệ, không cần derive).
   │  │  • Muốn gắn 1 feature cụ thể mà feature chưa khớp docs/{feature}/ nào → điểm-vào:
   │  │    derive/dùng slug (kebab-case, ASCII, ≤50 ký tự), confirm ở L1 (user override được),
   │  │    tạo docs/{feature}/d2-architect/ khi Write. KHÔNG bắt chạy /brainstorm trước.
   │  │  • slug-lạ 1 từ mơ hồ → hỏi "feature mới, gõ nhầm, hay kiến trúc tổng?" (liệt kê feature).
   │  ▼
1. Đọc nguồn kiến trúc theo ưu tiên:
   docs/_shared/system-overview.md (nếu có — nguồn tốt nhất) →
   docs/X/srs/{feature}-spec.md + flows.md (external service mentions, component) →
   CHƯA có nguồn (feature mới / kiến trúc tổng thiếu system-overview): phỏng vấn ĐÚNG PHẠM VI
   kiến trúc cần (feature-bootstrap.md nhóm A bước 3), gom 1 batch business-language (KHÔNG hỏi
   port/replica/VPC): các khối logic (Client/Backend/...) · service theo chức năng · dịch vụ
   ngoài (tên + mục đích) · luồng gọi chính. No-re-ask cái nguồn đã có.
   Mô tả mơ hồ dù có nguồn (system-overview.md chỉ liệt kê tên khối không rõ luồng gọi) →
   PHẢI hỏi clarifying trước khi generate, KHÔNG tự bịa luồng gọi/dịch vụ ngoài.
   ▼
2. Bóc tách: khối logic (container) → thành phần con → dịch vụ ngoài → luồng gọi + nhãn
   ▼
3. Viết source .d2 (công thức bên dưới) — nested container
   ▼
4. L1 plan preview (prose: K khối, N service, M dịch vụ ngoài). User Y → tiếp
   ▼
5. Write {slug}.d2 → d2-render.mjs → {slug}.svg (compile fail → sửa, tối đa 2 lần)
   ▼
6. Update {feature-or-shared}-d2-architect-index.md (env note → activity.log). Báo user mở .svg.
```

## Cách xây (build step-by-step)

### Bước 1 — Skeleton d2-architect/ nếu chưa có

`{feature-or-shared}-d2-architect-index.md` (type `d2-architect-index`): frontmatter chuẩn + bảng diagram (slug / khối / dịch vụ ngoài / updated). Lifecycle inherit `srs/{feature}-spec.md` (hoặc standalone nếu `_shared/`).

### Bước 2 — Công thức viết source .d2 (architecture)

```
direction: right       # kiến trúc ngang dễ đọc

# Actor người dùng:
Learner: Người học { shape: person; style.fill: "#E8F0FE" }

# Khối logic = container lồng thành phần con:
Client: Client (Web / Mobile) {
  UI: Giao diện
  SW: Service Worker
}

Backend: Backend {
  API: API Gateway
  Auth: Auth Service
  Core: Core Engine { style.fill: "#FFF4E5" }   # nhấn thành phần chính
  DB: Database { shape: cylinder; style.fill: "#E6F4EA" }   # DB = cylinder
}

# Dịch vụ ngoài = container viền đứt:
External: Dịch vụ ngoài {
  style.stroke-dash: 3
  Google: Google OAuth
  Pay: Cổng thanh toán
}

# Luồng gọi = cạnh, nhãn nghiệp vụ, tham chiếu con qua dấu chấm:
Learner -> Client.UI: sử dụng
Client.UI -> Backend.API: HTTPS / REST
Backend.API -> Backend.Auth: đăng nhập
Backend.Core -> Backend.DB: đọc/ghi
Backend.Auth -> External.Google: OAuth callback
```

**Quy tắc:**
- Container lồng: `Backend: { API: ...; DB: {shape: cylinder} }`. Tham chiếu con: `Backend.API`.
- Shape gợi ý: `person` (actor), `cylinder` (DB/storage), `queue` (message queue), mặc định ▭ (service).
- Dịch vụ ngoài: gói trong 1 container `style.stroke-dash: 3` (viền đứt) — phân biệt "ngoài tầm kiểm soát".
- Nhấn thành phần chính bằng `style.fill`. Đừng tô màu loạn — 1-2 màu nhấn là đủ.
- **QUOTE nhãn/tên có ký tự đặc biệt** `() / | :` — vd `Client (Web / Mobile)` OK không space-only, nhưng `"API v2 / gateway"` cần quote.
- KHÔNG toạ độ — ELK lo. KHÔNG infra detail (port/replica).

### Bước 3 — Render + verify

```bash
node .agents/scripts/d2-render.mjs docs/{feature}/d2-architect/{slug}.d2
# compile fail → thường thiếu quote nhãn có ký tự đặc biệt → sửa, render lại.
```

## L1 plan preview (mẫu BA-friendly)

> Em sẽ vẽ sơ đồ kiến trúc **{tên hệ thống}** tại `docs/{...}/d2-architect/{slug}.d2` (+ ảnh `.svg`):
>
> **Các khối ({K}):** {vd Client (Web/Mobile), Backend, Dịch vụ ngoài}
> **Thành phần chính:** {vd API Gateway, Auth Service, SRS Engine, Database}
> **Dịch vụ ngoài ({M}):** {vd Google OAuth, Web Speech API, AI Model}
> **Luồng chính:** {vd "Client gọi Backend qua REST", "Auth gọi Google OAuth"}
>
> Nguồn: {system-overview.md | srs/{feature}-spec.md | bạn cung cấp}.
>
> **Ghi nhận:** activity log "{note}".
>
> Apply? (Y / sửa)

## Output report

```
✅ D2 architecture: docs/{...}/d2-architect/{slug}.svg
   Khối: {K} | Service: {N} | Dịch vụ ngoài: {M}

Mở {slug}.svg bằng browser/IDE/Obsidian để xem (khối lồng nhau, DB cylinder).
Cần sửa? $d2-architect --feature {feature} (skill tự vào update mode)
```

## Gotchas

- **d2 chưa cài** → dừng, in 1 dòng install.
- **QUOTE nhãn có ký tự đặc biệt** (gotcha #1) — `/ | ( ) :` trong tên/nhãn phải bọc `"..."`. Quên → compile fail.
- **Đừng vẽ infra** — port, replica, load balancer, VPC là mức triển khai, ngoài scope IT-BA. Giữ ở tầm khối logic + dịch vụ ngoài.
- **Nguồn tốt nhất là system-overview.md** — nếu chưa có, gợi ý user chạy `/update-overview system` trước để có nguồn chuẩn.
- **Container quá sâu** (lồng >3 tầng) → khó đọc; gộp bớt hoặc tách 2 diagram (vd 1 tổng quan + 1 zoom backend).
- **Dịch vụ ngoài** luôn gói viền đứt + ghi tên thật + mục đích 1 cụm từ (Google OAuth, không phải "IdP #1").
- **Cross-feature** (kiến trúc toàn app) → lưu `docs/_shared/d2-architect/`, KHÔNG nhét vào 1 feature folder.
- **Update mode (slug đã tồn tại)** → Read source cũ, L2 diff, re-render sau khi user Y.

## References

- @../../rules/ba-conventions.md
- @../../rules/approval-gate.md
- @../../rules/naming-conventions.md
- @../../rules/changelog.md
- @../../rules/diagram-selection.md
- @../../rules/feature-bootstrap.md
