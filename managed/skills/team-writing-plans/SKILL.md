---
name: team-writing-plans
description: Write or review the design (technical spec) of a change following .agents/templates/design.md. Use when writing a spec, a new revision of it, or reviewing a spec; skip for a cosmetic QUICK change.
---

# Design of a change

1. Read the change (`proposal.md`, subtasks and AC in `change.json`), the engineering rules (`engineering-rules` and the patterns document it points to) and the code of the area. The reference slice is named in `engineering-rules`.
2. Verify every reference to existing code in the repository and record it as `file:line`. What you did not find does not exist: record it as NEW or as a question.
3. Fill all sections of the template, including the skill guidance section (rules in the `tech-lead` role). "No database changes" and "no UI" are answers too.
4. Write contracts in the project's language with binding names. Test plan: every AC has a test file, a case and a test type from `testing-rules`.
5. Remove wording that leaves a decision to the implementer ("appropriately", "if needed", "similar to" without a file).
6. Report a subtask that is too big (about 10+ files, several new contracts, migration plus large UI) for splitting instead of writing a huge spec.
7. When reviewing a design, name the concrete gap and the smallest fix; do not design it a second time.

Decisions that deviate from the engineering rules are recorded as D1, D2… with a reason. Questions that need the user go to the open-questions section and block approval.
