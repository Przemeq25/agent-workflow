---
name: review-rules
description: Review checklist, severity levels and verdict rules for this repository. Load before reviewing any diff.
---

# Review rules

Check in this order. Cite every finding as `file:line`, the rule or design point, the impact, and a concrete fix.

1. **Design conformance:** only files from the design list (trivial wiring aside); contracts and names as in design section 4; data as in section 5; UI and texts as in section 6; errors as in section 7.
2. **Acceptance criteria and edge cases:** each AC and each design section 7 row with logic has a test that verifies behaviour, not just rendering; the code handles every section 7 row as specified.
3. **Skill guidance:** rules from design section 12 are applied in code.
4. **Repo patterns** (`engineering-rules`): <fill> (the project-specific checks).
5. **UI** (only when the diff touches UI): tokens from `ui-tokens.md`, not raw colours or sizes; existing components from `ui-components.md`, not a new one for the same need; every state from design section 6; texts and accessibility per `ui-patterns.md`. A breach is blocking.
6. **Correctness:** async and error paths, edge cases, types, security and data ownership, UI accessibility.
7. **Security** (only when the diff touches auth, sessions, uploads, file paths, external input, queries or permissions): every server entry checks the signed-in user and ownership of the data; input validated on the server (types, size, file type by content, not by name); no user input in raw SQL, shell, paths or HTML; uploads go to storage with a generated name and size limit; secrets and personal data never in logs, errors or the client bundle; rate limits where the design names them. <fill: project-specific checks>
8. **Scope:** no drive-by refactors, needless abstractions or new dependencies; no secrets.

Severity: **blocking** (breaks design, AC, data ownership, security, correctness) versus **suggestion** (style preference; never blocks).

Verification evidence: use the commands from `workflow-rules`. Run read-only checks when the tool allows it and report the result; otherwise mark them NOT VERIFIED. Never claim to have run something you did not run.
