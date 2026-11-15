---
name: engineering-rules
description: Code patterns and architecture rules of this repository (stack, layers, data ownership, state, dependencies). Load before designing or implementing any change.
---

# Engineering rules

Detailed, verified patterns and reference files: `context/engineering.md`. Standards and allowed packages: `context/foundation/tech-prd.md`. Check facts in the repo; do not assume an API, file or infrastructure exists.

- Stack: TODO.
- Reference slice (the area to copy patterns from): TODO.
- Layers and dependency direction: TODO.
- Data ownership and contracts: TODO.
- Parallel work: one implementer by default, at most TODO in parallel on disjoint files. Shared contracts, schema, migrations, config and lockfile have one owner.
- No new dependency, CI workflow or framework without a human decision.
- UI pillars and design references: `business-rules`.
