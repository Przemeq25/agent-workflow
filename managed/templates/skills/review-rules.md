---
name: review-rules
description: Review checklist, severity levels and verdict rules for this repository. Load before reviewing any diff.
---

# Review rules

Check in this order. Cite every finding as `file:line`, the rule or design point, the impact, and a concrete fix.

1. **Design conformance:** only files from the design list (trivial wiring aside); contracts and names as in design section 4; data as in section 5; UI and texts as in section 6; errors as in section 7.
2. **Acceptance criteria:** each AC has a test that verifies behaviour, not just rendering.
3. **Skill guidance:** rules from design section 12 are applied in code.
4. **Repo patterns** (`engineering-rules`): <fill> (the project-specific checks).
5. **Correctness:** async and error paths, edge cases, types, security and data ownership, UI accessibility.
6. **Scope:** no drive-by refactors, needless abstractions or new dependencies; no secrets.

Severity: **blocking** (breaks design, AC, data ownership, security, correctness) versus **suggestion** (style preference; never blocks).

Verification evidence: use the commands from `workflow-rules`. Run read-only checks when the tool allows it and report the result; otherwise mark them NOT VERIFIED. Never claim to have run something you did not run.
