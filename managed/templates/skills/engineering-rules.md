---
name: engineering-rules
description: Code patterns and architecture rules of this repository (stack, layers, data ownership, state, dependencies). Load before designing or implementing any change.
---

# Engineering rules

Verified patterns and reference files: `references/patterns.md` next to this skill (open it when you need a pattern). Reasons behind the rules: `context/foundation/tech-notes.md`. Check facts in the repo; do not assume an API, file or infrastructure exists.

- Stack: <fill>.
- Reference slice (the area to copy patterns from): <fill>.
- Layers and dependency direction: <fill>.
- Data ownership and contracts: <fill>.
- Parallel work: one implementer by default, at most <fill> in parallel on disjoint files. Shared contracts, schema, migrations, config and lockfile have one owner.
- No new dependency, CI workflow or framework without a human decision.
- UI pillars and design references: `business-rules`.
