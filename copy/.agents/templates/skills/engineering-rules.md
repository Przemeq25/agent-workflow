---
name: engineering-rules
description: Code patterns and architecture rules of this repository (stack, layers, data ownership, state, dependencies). Load before designing or implementing any change.
---

# Engineering rules

Reasons behind the rules: `context/foundation/tech-notes.md`. Project-wide ways of doing things are in the topic files below; open only the ones your task touches. Check facts in the repo; do not assume an API, file or infrastructure exists.

- Stack: <fill>.
- Reference slice (the area to copy patterns from): <fill>.
- Layers and dependency direction: <fill>.
- Data ownership and contracts: <fill>.
- One subtask at a time in a session (subagents share the working directory); parallel delivery only through the loop, which uses separate worktrees. Shared contracts, schema, migrations, config and lockfile have one owner per change.
- No new dependency, CI workflow or framework without a human decision.
- UI pillars and design references: `business-rules`.

## Topics

One file per project-wide way of doing something, at most about 40 lines each: where it lives, how to use it with a
reference file and symbol (path plus function or component name, never a line number), what not to do, the change that last touched it. `/prd` writes them; a change that
introduces or changes a topic updates its file in the same PR (design section 3).

| Topic | File | Read when |
|---|---|---|
| <fill> (e.g. configuration and env) | `references/<fill>.md` | <fill> (e.g. the change reads a setting or a flag) |
