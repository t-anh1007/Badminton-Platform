# Diagram skills for Codex

This workspace contains 11 diagram skills ported from `diagram-skills-package`.

## Invoke

Use `/skills` or mention a skill explicitly, for example:

```text
Use $sequence to model the checkout payment flow for feature checkout.
Use $activity-swimlane to model a multi-role refund process.
Use $erd to model the booking data for feature booking.
```

Codex may also select a skill implicitly when the request matches its description.

## Installed layout

- `.agents/skills/`: 11 skill definitions and bundled engine files
- `.agents/rules/`: shared BA, naming, approval, and review rules
- `.agents/scripts/mermaid-verify.mjs`: Mermaid compile verification
- `.agents/scripts/plantuml-render.mjs`: cross-platform PlantUML server renderer
- `.agents/scripts/d2-render.mjs`: cross-platform D2 SVG/PNG renderer
- `.agents/scripts/activity-log.mjs`: append-only activity log writer
- `.agents/agents/diagram-reviewer.md`: reviewer instructions
- `.codex/agents/diagram-reviewer.toml`: Codex subagent registration
- `_templates/`: output templates referenced by the skills

## Engines

- Mermaid: `@mermaid-js/mermaid-cli`
- PlantUML: Node.js plus HTTPS access to `plantuml.com`
- D2: `Terrastruct.D2`
- BPMN: local dependencies in `.agents/skills/bpmn/engine/node_modules`
- DBML: `@dbml/cli`

PlantUML rendering sends diagram text to a public server. Use Mermaid/D2 or replace the renderer with a local PlantUML installation for sensitive material.

Restart Codex after installation so the new skill list and the D2 PATH update are detected.
