# Workflow (for coordinating roles)

Read by `tech-lead`, `pm` and `/prd`. Other roles do not need it: everything they need is in `AGENTS.md`, their role and the brief they get.

## Where things are

| Path | What it is | Who changes it |
|---|---|---|
| `.agents/agents/*.md` | roles: `tech-lead` (default), `pm`, `implementer`, `code-reviewer`, `qa`, `scout` and `clerk` (cheap helpers) | a human |
| `.agents/skills/team-*` | generic workflow skills | the package |
| `.agents/commands/*.md` | commands: `/prd` (Codex: `$prd`) | the package |
| `.agents/skills/*-rules` | **project rules**: `workflow-rules`, `business-rules`, `engineering-rules`, `review-rules`, `testing-rules` | `/prd`, approved by a human |
| `.agents/skills/<other>` | technology skills of the project | a human (`/prd` proposes them) |
| `.agents/templates/`, `.agents/docs/` | proposal and design templates, format of changes and reports | the package |
| `.agents/hooks/guard.mjs` | guard that blocks forbidden operations (used by tools with hooks) | the package |
| `.agents/workflow.json` | project configuration: tools, models, guard rules, loop | a human |
| `context/foundation/` | PRD, roadmap, interview notes, technical decisions (`tech-notes.md`) | `/prd` |
| `spec/changes/<ID>/` | changes: `change.json`, `proposal.md`, `design.md`, `verify/` | `pm`, `tech-lead`, the loop |

Tool adapters (`.claude/`, `CLAUDE.md`, `.codex/`, `.opencode/`, `.kilo/`, and the Codex command skill `.agents/skills/prd/`) are copies of the roles and commands in `.agents/`, kept in step by a human. Never edit them. There are no workflow scripts: roles work only from skills, roles, commands and documents.

## Flow

`/prd` (product and technical context, writes the project skills; new or existing code) → `pm`
(`change.json`, `proposal.md`) ⇄ `tech-lead` (`design.md`) → user approval (the approval checklist in `.agents/docs/spec-format.md`, done by hand)
→ `tech-lead` → subtasks land on `<change branch>` → main PR `<change branch>` → default branch,
merged only by a human. A single task goes straight to `tech-lead`. Fixes after PR review are done by
`tech-lead` on the same branch.

## Sessions

Everything a role needs is in files: the project skills, the PRD, the change documents, `progress.md` and git. A
chat history is not needed and only costs tokens. Start a **new session** at the end of a phase: after `/prd`, after
a change is approved (**always** for a STANDARD or COMPLEX change: the role commits the approved documents and stops), after a merge, and during a long delivery once `progress.md` is updated. End such a phase with
one line: `Next: new session, <role or command>, <change ID>`. Do not split an interview or a design discussion.

## Delegation

Roles ask other roles by name ("ask `implementer`"). Use your tool's subagent mechanism with that role. If your
tool cannot start a named subagent, start a generic subagent with the instructions from
`.agents/agents/<role>.md`, or perform the role yourself and say so in the report. Review and QA are then done
critically, as someone other than the author.

## Cheap helpers

Two roles run on the `low` tier so a strong model does not spend tokens on mechanical work:

- `scout` (read-only): searches and maps the code, collects git facts, and returns paths with short facts, not file contents.
- `clerk`: multi-step mechanical work only (moving and renaming many files, archiving finished changes). Never a single command: run that yourself.

Every subagent start reloads the rules (tens of thousands of tokens), so a helper pays off only when it saves more than that. **Run commands yourself, quietly.** Run verification and tests directly in your shell with the quiet commands from `workflow-rules` (they print only failures and a summary). A green run costs a few dozen tokens; read the full log only for a failure. Never start a subagent just to run a command: starting one reloads the rules and costs tens of thousands of tokens. If your tool can run a command in the background and notify you, start long suites that way and continue with other work.

Roles that coordinate (`tech-lead`, `pm`, and the `/prd` command) hand work to helpers only when a search would read many files (`scout`) or the mechanical work has many steps (`clerk`). Give them a precise task: the question or the exact steps, the allowed files and the report you expect. Do not hand them design, review, QA verdicts, delivery reports or anything that needs a decision. A subagent usually cannot start another subagent, so `implementer`, `qa` and `code-reviewer` do their own lookups. If your tool cannot start a named subagent, do the work yourself.

## Asking the user

Questions and decisions must be easy to find, never buried in a long answer.

- **Before work that needs decisions**, show one block titled **Decisions** first: each open question with your
  recommendation, the proposed order of steps, and what stays blocked until the user answers.
- **Ask through your tool's question tool** when it has one, so the user gets a picker instead of text:
  `AskUserQuestion` (Claude Code), `question` (OpenCode, Kilo), `request_user_input` (Codex, when available),
  `ask_followup_question` (older Kilo Code and Roo Code extensions). The generated role files say which one you have.
- **Without such a tool**, end the message with a numbered list and nothing after it:
  `1. <question>? A) <option> (recommended) B) <option>. Blocks: <what>.`
- At most 3-4 questions per round, each with a recommendation. Answer yourself what the repository answers.
- Subagents cannot reach the user. They put open questions at the top of their report and the coordinator asks.
