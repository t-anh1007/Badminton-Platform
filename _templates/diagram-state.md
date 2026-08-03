---
type: srs-states
feature: {{feature}}
updated: {{date}}
---

# {{feature}} — State Diagrams

> State diagram per entity của feature **{{feature}}**. Mỗi entity 1 section `## State: {Entity}`.

## State: {{entity}}

**Related UC**: [[../usecases/uc-{{slug}}.md]]
**Related BR**: BR-{{feature}}-{{NNN}}

```mermaid
{{mermaid_code}}
```

### Invalid transitions

| From | To | Why not |
|---|---|---|
| {{from}} | {{to}} | {{reason}} |
