# <ID> — <title> · design (technical spec)

> Revision: R1 · Author: tech-lead · Date: YYYY-MM-DD
> Change: `spec/changes/<ID>/` (proposal.md, change.json) · Requirements: FR-…, US-…
> Why: one sentence from the proposal: whose problem this solves and what changes for them.
> After approval exactly this file is delivered. A change of behaviour, contracts or data after approval needs the user's approval again; fixing stale documentation does not.
> Describe sections 3, 4 and 9 per subtask (ST-01, ST-02…) when the change has several subtasks.
> Write the content in the user language set by `business-rules`. Keep the numbered headings; a section that does not apply is one line `n/a: <reason>`. Keep it short: the implementer reads all of it.

## 1. Approach

2–5 sentences: how we solve the task. Rejected alternatives, one sentence each.

## 2. Existing code we build on

Every row verified in the repository (search or read). No row means we do not assume it exists.

| File and symbol (no line numbers) | What it is | How we use it (pattern / call / extension) |
|---|---|---|
| | | |

## 3. Files

| Path | NEW / CHANGE | Responsibility |
|---|---|---|
| | | |

Files outside this list: only trivial wiring (an import, registration in an index). Anything else is a blocker.

Documentation is listed here too, in the subtask that makes it true, so it ships in the same PR as the code:
the feature line in `context/foundation/prd.md` and the status in `roadmap.md` (usually the last subtask), and
`.agents/skills/engineering-rules/references/<topic>.md` plus its row in the topic table when this change introduces
or changes a project-wide way of doing something (configuration, translations, auth, data access…).

## 4. Contracts

Sketch in the project language: validation schemas, domain types, use-case and repository signatures, API procedures (input, output, errors). Names are binding.

```
// path/to/contract
```

## 5. Data

Schema changes: tables, columns (type, null, default), keys and cascades, indexes. Migration through the command in `workflow-rules`. Impact on existing data. "No database changes" is an answer too.

## 6. UI and flow

Entry file and composition, owner of state, saving, states: loading, empty, error, conflict, offline. User-facing texts in the user language. Accessibility. Name the components (`ui-components.md`) and tokens (`ui-tokens.md`) each part uses; a new component only as a decision D… with a reason. "No UI" is an answer too.

## 7. Errors and edge cases

Start from the proposal's "Edge cases" table and add the technical cases (error mapping, retries, transactions,
timeouts). Every row names its test (a section 9 row) or `not tested: <reason>`; the approval checklist fails an
empty Test cell.

| Situation | Category | Domain / API error | Message / UI behaviour | Test |
|---|---|---|---|---|

## 8. Security and ownership

Where the owner comes from, which checks run on the server, what the client may not send.

## 9. Test plan

One row per AC (written `ST-01 AC-1`) and per section 7 row (written `§7 <situation>`). Test types from
`testing-rules`. the approval checklist fails a design where an AC of `change.json` has no row here.

| Covers | Test file | Case (Given/When/Then in short) | Type |
|---|---|---|---|

## 10. Out of scope

What we do not touch (files, behaviour, refactors), even if tempting.

## 11. Decisions and risks

- D1: technical decision + reason
- R1: risk + how we limit it

## 12. Implementation guidance (from the project skills)

Only rules that concern the files in section 3, taken from the project's topic files
(`engineering-rules/references/<topic>.md`) and from technology skills. The implementer does not read whole skills
or topic files, only this.

| # | Rule (imperative) | Where in this task | Source |
|---|---|---|---|
| 1 | | | `.agents/skills/…/SKILL.md` |

Do / don't examples for non-obvious rules:

```
// do
// don't
```

## 13. Open questions

Empty before approval. Every question blocks approval.
