# Format of changes (`spec/`)

Layout modelled on OpenSpec. One **change** is one folder, one branch and one main PR.

```
spec/
├── changes/
│   └── <ID>/                     ← tracker key (PROJ-123, PROJ-123-note) or a slug from pm
│       ├── change.json           ← metadata, status, subtasks with AC (source of truth for the loop)
│       ├── proposal.md           ← pm: why, what, AC of the whole change (.agents/templates/proposal.md)
│       ├── design.md             ← tech-lead: how in code + skill guidance (.agents/templates/design.md)
│       └── verify/STEP-01.md       ← delivery report: AC, verification, review, QA
└── archive/
    └── YYYY-MM-DD-<ID>/          ← finished changes (decision trail)
```

## Groups: one feature, several changes

A feature split into several changes (e.g. `quick-link`: API, assets, UI) lives in one **group** folder. `change.json` gets the optional field `"group": "quick-link"` (lower case and hyphens, in Jira usually the epic) and the change folder is `spec/changes/<group>/<ID>/`; without `group` it is `spec/changes/<ID>/`. In this documentation `<change folder>` means that path. The group folder also holds `README.md` written by `pm`: the feature goal, a table of its changes (ID, title, status, `dependsOn`) in delivery order, and the group-wide open decisions. IDs stay unique across all groups (branches, `dependsOn` and commits use only the ID, never the group). To find a change by ID: `rg -l '"id": "<ID>"' spec/changes --glob change.json`. Finished groups move as a whole to `spec/archive/YYYY-MM-DD-<group>/` once every change is merged. The optional unattended loop reads only flat `spec/changes/<ID>/` folders: do not use groups with it.

## Flow

1. `pm` (from the PRD) or `tech-lead` (from a short description) creates the change: `change.json` + `proposal.md`.
2. `tech-lead` writes `design.md` and may adjust the subtask split.
3. The user approves in the chat ("ok"). Only then the role that asked (`pm` or `tech-lead`) goes through the **Approval checklist** below, and if every line holds sets `status: "approved"` and `approvedAt` (today) in `change.json`. Any change to proposal, design or subtasks after approval needs the user's approval again.
4. The approved change reaches the default branch (commit or PR) or its own `<change branch>` branch.
5. `tech-lead` delivers the subtasks:
   - a change with **one** subtask: commit straight to `<change branch>`,
   - a change with **several** subtasks: each subtask is a PR `sub/<ID>/<STEP>` → `<change branch>`, merged by the loop when verification, review and QA passed; otherwise it stays a draft for the user.
6. The main PR `<change branch>` → default branch is opened as a draft after the first subtask and becomes ready when all subtasks are done. **Only a human merges it.**

## Approval checklist (done by hand, before `approvedAt` is set)

Go through every line and read the files; do not set `approved` while one fails. Report failures to the user as a short list.

1. `change.json`: `id` equals the folder name; subtasks are `STEP-01…`; every subtask has size `S` or `M`, risk `QUICK`/`STANDARD`/`COMPLEX` and at least one AC with `id`, `given`, `when`, `then`; dependencies exist and have no cycles; `openQuestions` is empty.
2. `proposal.md`: the "Edge cases" table has every category E1–E9 filled with an AC id or `n/a: reason`; no section is left empty or as a placeholder.
3. `design.md` (STANDARD and COMPLEX only): all 13 headings exist, each filled or `n/a: <reason>`; the open-questions section is empty; every AC in `change.json` has a row in section 9 (`STEP-01 AC-1`); every section 7 row names a test or `not tested: <reason>`; every test named in section 9 exists in the test plan.
4. QUICK-only changes need no design: only points 1 and 2 apply.
5. After approval the change is frozen: a later edit of proposal, design or subtasks is a new revision and needs the user's approval again.

## Edge-case checklist

The single list both `pm` and `tech-lead` go through for every subtask. A category either applies (it gets an AC or
a design section 7 row, and a test) or it is marked "n/a" with a short reason in the proposal.

| # | Category | Typical questions |
|---|---|---|
| E1 | Invalid input | wrong format, missing or extra field, too long, wrong type, injection |
| E2 | Empty and first use | no data yet, nothing selected, empty result, first visit |
| E3 | Limits | maximum count or size, pagination, rate limits, very long text |
| E4 | Permissions and ownership | signed out, another user's data, role without rights, shared links |
| E5 | Conflict and repetition | stale edit, double submit, idempotency, two tabs or devices |
| E6 | Failure of a dependency | network, timeout, external API, storage or database error, offline |
| E7 | State transitions | allowed and forbidden transitions, cancel, retry, undo, partial save |
| E8 | Texts and locale | user language, number, date and currency formats, plurals (only with UI or messages) |
| E9 | Existing data | data created before this change, migration, deletion and archiving |

Who writes what: a category that changes **what the user sees or may do** is a product decision, so `pm` writes it
as an AC (a negative AC is still Given/When/Then). A category that only changes **how the code behaves inside**
(retries, error mapping, transactions) goes to design section 7 by `tech-lead`. Design section 9 then gives every AC
and every section 7 row a test; the approval checklist fails a design where an AC has no test row or a section 7
row has no test.

## Progress of a delivery `progress.md`

`tech-lead` keeps `spec/changes/<ID>/progress.md` while it delivers a change in an interactive session, at most about
20 lines: subtasks done (with commit), the current step, open issues, the next step. It is updated in each subtask
commit. A new session continues from this file and the change documents, not from a chat history.

## State

`change.json` holds only the planning status: `draft`, `approved`, `blocked`, `cancelled`.
The delivery state is read from git (branches, PRs, commits with `Subtask: <ID>/<STEP>`):

| State | Change | Subtask |
|---|---|---|
| todo / in_progress | approved, in progress | ready to deliver |
| waiting | waits for changes in `dependsOn` to be merged | waits for subtasks in `dependsOn` |
| in_review | all subtasks done, main PR waits for the user | subtask PR open (e.g. draft after failed verification) |
| done | main PR merged | commit with `Subtask: <ID>/<STEP>` is on `<change branch>` |
| rejected | main PR closed without merge | subtask PR closed without merge |
| agent_blocked | `agent-blocked` label on the issue | the loop reported a blocker or changed nothing twice |

## `change.json`

```json
{
  "id": "PROJ-123-rooms",
  "title": "Customer saves rooms with dimensions",
  "jira": "PROJ-123",
  "group": "",
  "status": "draft",
  "refs": ["FR-003", "US-01"],
  "dependsOn": [],
  "openQuestions": [],
  "notes": "",
  "subtasks": [
    {
      "id": "STEP-01",
      "title": "Rooms domain and API",
      "goal": "The server saves and returns the owner's rooms.",
      "risk": "COMPLEX",
      "size": "M",
      "refs": ["FR-003"],
      "scope": { "in": ["room schema", "room API"], "out": ["UI"] },
      "acceptanceCriteria": [
        { "id": "AC-1", "given": "a signed-in customer", "when": "they create a room", "then": "the room list returns it" }
      ],
      "verification": ["unit tests of the room repository"],
      "dependsOn": []
    }
  ],
  "approvedAt": "",
  "approvalHash": ""
}
```

Rules (part of the approval checklist):
- `group` is empty or a lower-case slug equal to the parent folder name under `spec/changes/`,
- `id` equals the folder name: the tracker key in upper case with an optional lower-case note (`PROJ-123`, `PROJ-123-rooms`); a lower-case slug only when `workflow-rules` sets no tracker,
- subtasks `STEP-01…`, size `S` or `M`, risk `QUICK`, `STANDARD` or `COMPLEX`, at least one AC with `id`, `given`, `when`, `then`,
- dependencies exist and there are no cycles (subtasks within a change, changes between each other),
- `approvedAt` is set only after the user's explicit approval. `approvalHash` stays empty; only projects that use the optional loop fill it (the loop's `approve` command).

Subtasks are **delivery units, not AC groups**: fewer and bigger. One subtask is one coherent vertical slice (size S up to ~5 files, M up to ~15 files) with 2–10 AC. Split only for a reason you can name: a migration or shared contract that must land first, a COMPLEX part that deserves its own review, or a PR that would be too big to review (about 800 changed lines). Most changes have 1–3 subtasks.

Risk: **QUICK** (text, style, local fix without logic or contracts) needs no design. **STANDARD** and **COMPLEX** need an approved design with all 13 headings (a section that does not apply is one line `n/a: <reason>`).

Delivery: **solo** (default, `tech-lead` implements; one `code-reviewer` pass for the whole change) or **team** (M or COMPLEX subtasks or a migration: `implementer` builds a batch of subtasks in one call, one review per batch, a batch ends after a COMPLEX subtask, `qa` only for COMPLEX or UI). A batch commit carries one `Subtask: <ID>/<STEP>` line per subtask. See `tech-lead`.

## Delivery report `verify/<STEP>.md`

The first line is exactly `STATUS: DONE` or `STATUS: BLOCKED`. Then:

- **Summary** (3–6 sentences)
- **AC:** table AC → PASS / FAIL / NOT VERIFIED → evidence (test file and case, or a command with its result)
- **Verification:** commands and actual results
- **Review:** final verdict, number of rounds, what was fixed
- **QA:** verdict, tests added
- **Skill guidance:** which hints from design section 12 were applied, which did not concern this subtask
- **Deviations from the design:** list (allowed) or the reason for the block
- **Files:** changed and new
- **Blocker** (BLOCKED only): problem, evidence, proposed design change or a product question with a recommendation
- **Docs:** documentation files updated in this subtask (feature line, roadmap status, topic files) or "none"
- **Next steps:** things outside the scope

A delivery done by `tech-lead` in an interactive session uses the same format, and its commit carries the line `Subtask: <ID>/<STEP>`.
