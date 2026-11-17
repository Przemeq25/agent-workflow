# Format of changes (`spec/`)

Layout modelled on OpenSpec. One **change** is one folder, one branch and one main PR.

```
spec/
├── BACKLOG.md                    ← generated index of changes with the dependency graph
├── changes/
│   └── <ID>/                     ← tracker key (PROJ-123, PROJ-123-note) or a slug from pm
│       ├── change.json           ← metadata, status, subtasks with AC (source of truth for the loop)
│       ├── proposal.md           ← pm: why, what, AC of the whole change (.agents/templates/proposal.md)
│       ├── design.md             ← tech-lead: how in code + skill guidance (.agents/templates/design.md)
│       ├── tasks.md              ← generated view of the subtasks
│       └── verify/ST-01.md       ← delivery report: AC, verification, review, QA
└── archive/
    └── YYYY-MM-DD-<ID>/          ← finished changes (decision trail)
```

## Flow

1. `pm` (from the PRD) or `tech-lead` (from a short description) creates the change: `change.json` + `proposal.md`.
2. `tech-lead` writes `design.md` and may adjust the subtask split.
3. The user approves: `agent-workflow approve <ID>`. It refuses when proposal or design are incomplete or have open questions, and stores a **fingerprint** of proposal, design and subtasks. Any change after approval needs approval again.
4. The approved change reaches the default branch (commit or PR) or its own `task/<ID>` branch.
5. The loop (`agent-workflow loop`) or `tech-lead` delivers the subtasks:
   - a change with **one** subtask: commit straight to `task/<ID>`,
   - a change with **several** subtasks: each subtask is a PR `sub/<ID>/<ST>` → `task/<ID>`, merged by the loop when verification, review and QA passed; otherwise it stays a draft for the user.
6. The main PR `task/<ID>` → default branch is opened as a draft after the first subtask and becomes ready when all subtasks are done. **Only a human merges it.**

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
and every section 7 row a test; `agent-workflow approve` refuses a design where an AC has no test row or a section 7
row has no test.

## Progress of a delivery `progress.md`

`tech-lead` keeps `spec/changes/<ID>/progress.md` while it delivers a change in an interactive session, at most about
20 lines: subtasks done (with commit), the current step, open issues, the next step. It is updated in each subtask
commit. A new session continues from this file and the change documents, not from a chat history.

## State

`change.json` holds only the planning status: `draft`, `approved`, `blocked`, `cancelled`.
`agent-workflow status` computes the delivery state from git:

| State | Change | Subtask |
|---|---|---|
| todo / in_progress | approved, in progress | ready to deliver |
| waiting | waits for changes in `dependsOn` to be merged | waits for subtasks in `dependsOn` |
| in_review | all subtasks done, main PR waits for the user | subtask PR open (e.g. draft after failed verification) |
| done | main PR merged | commit with `Subtask: <ID>/<ST>` is on `task/<ID>` |
| rejected | main PR closed without merge | subtask PR closed without merge |
| agent_blocked | `agent-blocked` label on the issue | autopilot reported a blocker or changed nothing twice |

## `change.json`

```json
{
  "id": "PROJ-123-rooms",
  "title": "Customer saves rooms with dimensions",
  "jira": "PROJ-123",
  "status": "draft",
  "refs": ["FR-003", "US-01"],
  "dependsOn": [],
  "openQuestions": [],
  "notes": "",
  "subtasks": [
    {
      "id": "ST-01",
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

Rules (`agent-workflow validate`):
- `id` equals the folder name: tracker key or slug, lower case and hyphens,
- subtasks `ST-01…`, size `S` or `M`, risk `QUICK`, `STANDARD` or `COMPLEX`, at least one AC with `id`, `given`, `when`, `then`,
- dependencies exist and there are no cycles (subtasks within a change, changes between each other),
- `approvedAt` and `approvalHash` are set only by `agent-workflow approve`.

Risk: **QUICK** (text, style, local fix without logic or contracts) needs no design. **STANDARD** and **COMPLEX** need an approved design with all 13 sections.

## Delivery report `verify/<ST>.md`

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

A delivery done by `tech-lead` in an interactive session uses the same format, and its commit carries the line `Subtask: <ID>/<ST>`.
