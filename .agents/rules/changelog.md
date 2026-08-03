---
paths:
  - "docs/**/*.md"
  - ".agents/scripts/activity-log.mjs"
---

# Activity Log Convention

> Lịch sử thay đổi của TOÀN BỘ vault sống ở **một file duy nhất**: `docs/_shared/activity.log` (append-only). Doc KHÔNG mang `changelog:` trong frontmatter. Không còn routing table, không còn prefix, không còn echo 1 sự kiện vào nhiều file.

## Vì sao 1 log tập trung

Kiến trúc cũ (changelog YAML per review-unit + routing file con → file cha) tạo ra: 49 file mang changelog, 1 sự kiện CR apply chép vào 11 file, bảng routing tồn tại 3 bản sao (rule + hook + SKILL.md) từng lệch nhau, hook phải rewrite YAML + dedupe mỗi lần Write. Log tập trung xoá cả 4 vấn đề: **path của file được sửa chính là thông tin routing** — không cần bảng nào nữa.

## Format

```
{date} | {skill} | {@author} | {file-path} | {note}
```

- 1 dòng = 1 sự kiện. Append cuối file (mới nhất ở cuối, giống `staleness.log`).
- **date**: ISO `YYYY-MM-DD`.
- **skill**: `/urd`, `$sequence`, `/cr`, `/jira`, ... hoặc `manual` (edit tay ngoài skill).
- **@author**: @handle người chạy — resolve từ memory `user-identity` key `current_user` (xem `ba-conventions.md` Mục 1). Script fallback: `CODEX_CHANGELOG_AUTHOR` → `git config user.name` → tài khoản hệ điều hành.
- **file-path**: project-relative path của file vừa Write/Edit (vd `docs/payment/srs/payment-spec.md`).
- **note**: what changed — imperative/past-tense, factual, ≤80 chars, tiếng Việt hoặc Anh.

**Ví dụ:**

```
2026-07-12 | /srs | @hoangpm | docs/payment/srs/payment-spec.md | initial spec 12 FR + 9 error
2026-07-12 | $erd | @hoangpm | docs/payment/srs/payment-erd.md | 5 entities, 4 relationships
2026-07-13 | /cr | @hoangpm | docs/payment/srs/payment-spec.md | applied CR-20260713-001: FR-payment-013 thêm
2026-07-13 | /jira | @hoangpm | docs/payment/userstories/payment-story-index.md | pushed 7 US → KAN-127..133
```

## Cơ chế ghi trong Codex

Sau mỗi Write/Edit đã được người dùng duyệt, skill gọi script đa nền tảng:

```text
node .agents/scripts/activity-log.mjs --skill sequence --file docs/payment/srs/payment-flows.md --note "added checkout sequence"
```

Có thể truyền `--author @handle`; nếu bỏ trống, script dùng `CODEX_CHANGELOG_AUTHOR`, Git user, rồi tài khoản hệ điều hành. Script tự tạo `docs/_shared/activity.log`, append UTF-8 và bỏ qua dòng trùng hoàn toàn.

## Dedupe

Bỏ qua nếu dòng **giống hệt** (cùng date + skill + path + note) đã tồn tại — tránh double-fire khi 1 skill Write cùng file 2 lần với cùng note. Khác note → ghi bình thường (nhiều sự kiện/ngày/file là hợp lệ).

## Files excluded

Hook skip (không log):
- `docs/_shared/*` (gồm chính activity.log — tránh đệ quy)
- `docs/exports/*` (regenerated)
- `docs/inbox/*` (raw capture)
- `docs/feature-list.md`, `docs/README.md` (auto-gen)

## Đọc lịch sử

- Lịch sử 1 feature: `grep " docs/payment/" docs/_shared/activity.log`
- Lịch sử 1 file: `grep " docs/payment/srs/payment-spec.md " docs/_shared/activity.log`
- Stakeholder-facing: `/export` render section "Lịch sử thay đổi" từ log (lọc theo feature) khi cần — KHÔNG nhét lịch sử vào doc.
- `/dashboard`, KG engine ingest log như event stream (cùng cách đọc `staleness.log`).

## Note style

- Good: `added refund webhook sequence`, `AC for invalid password updated`, `applied CR-20260512-001: added OTP requirement`.
- Bad: `updated stuff`, `fixed things`, `per Hoang's request` (người đã có ở field @author).

## Backward-compat

Docs demo cũ còn `changelog:` frontmatter → **giữ nguyên, không migrate** (docs demo sẽ bỏ khi rebuild). Parser/reader gặp field `changelog:` trong frontmatter hiểu là di sản, bỏ qua. Không tạo entry mới vào frontmatter trong bất kỳ trường hợp nào.
