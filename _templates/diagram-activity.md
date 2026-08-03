---
type: srs-flows
feature: {{feature}}
updated: {{date}}
---

# {{process}} — Activity Diagram

> Quy trình nghiệp vụ **{{process}}** trong feature **{{feature}}**.

## Process overview

{{overview}}

*1-2 đoạn mô tả mục đích process, ai chạy, khi nào trigger.*

## Roles / Lanes (nếu có)

| Lane | Role | Trách nhiệm |
|---|---|---|
| {{lane_1}} | {{role}} | {{responsibility}} |

## Diagram

```mermaid
{{mermaid_code}}
```

## Decision points

| ID | Khi nào | YES | NO |
|---|---|---|---|
| D1 | {{condition}} | {{yes_path}} | {{no_path}} |

## Parallel / Sub-processes

{{parallels}}

*Liệt kê nhánh chạy song song hoặc sub-process được gọi.*

## Notes

{{notes}}

*Cross-ref: `docs/{{feature}}/srs/{{feature}}-flows.md`, related sequence diagrams, `usecases/`.*
