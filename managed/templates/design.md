# <ID> — <title> · design (technical spec)

> Revision: R1 · Author: tech-lead · Date: YYYY-MM-DD
> Change: `spec/changes/<ID>/` (proposal.md, change.json) · Requirements: FR-…, US-…
> After approval the loop delivers exactly this file. Any change after approval needs `agent-workflow approve <ID>` again.
> Describe sections 3, 4 and 9 per subtask (ST-01, ST-02…) when the change has several subtasks.
> Write the content in the user language set by `business-rules`. Keep the numbered headings.

## 1. Approach

2–5 sentences: how we solve the task. Rejected alternatives, one sentence each.

## 2. Existing code we build on

Every row verified in the repository (search or read). No row means we do not assume it exists.

| File:line | What it is | How we use it (pattern / call / extension) |
|---|---|---|
| | | |

## 3. Files

| Path | NEW / CHANGE | Responsibility |
|---|---|---|
| | | |

Files outside this list: only trivial wiring (an import, registration in an index). Anything else is a blocker.

## 4. Contracts

Sketch in the project language: validation schemas, domain types, use-case and repository signatures, API procedures (input, output, errors). Names are binding.

```
// path/to/contract
```

## 5. Data

Schema changes: tables, columns (type, null, default), keys and cascades, indexes. Migration through the command in `workflow-rules`. Impact on existing data. "No database changes" is an answer too.

## 6. UI and flow

Entry file and composition, owner of state, saving, states: loading, empty, error, conflict, offline. User-facing texts in the user language. Accessibility. "No UI" is an answer too.

## 7. Errors and edge cases

| Situation | Domain error | API error | Message / UI behaviour |
|---|---|---|---|

## 8. Security and ownership

Where the owner comes from, which checks run on the server, what the client may not send.

## 9. Test plan → AC

Every AC has at least one test. Test types from `testing-rules`.

| AC | Test file | Case | Type |
|---|---|---|---|

## 10. Out of scope

What we do not touch (files, behaviour, refactors), even if tempting.

## 11. Decisions and risks

- D1: technical decision + reason
- R1: risk + how we limit it

## 12. Implementation guidance (from the project skills)

Only rules that concern the files in section 3. The implementer does not read whole skills, only this.

| # | Rule (imperative) | Where in this task | Source |
|---|---|---|---|
| 1 | | | `.agents/skills/…/SKILL.md` |

Do / don't examples for non-obvious rules:

```
// do
// don't
```

## 13. Open questions

Empty before approval. Every question blocks `agent-workflow approve`.
