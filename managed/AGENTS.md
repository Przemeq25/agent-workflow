<!-- Managed by @przemeq25/agent-workflow. Do not edit: changes are overwritten by `agent-workflow sync`. Project rules live in .agents/skills/*-rules. -->
# Agent instructions

This repository uses a generic, tool-independent agent workflow. Roles, skills and templates live in `.agents/`.
Everything specific to this project (language, market, stack, commands, tests, review) lives only in the
project skills in `.agents/skills/`. This file contains no project rules.

## Where things are

| Path | What it is | Who changes it |
|---|---|---|
| `.agents/agents/*.md` | roles: `tech-lead` (default), `pm`, `autopilot`, `implementer`, `code-reviewer`, `qa`, `scout` and `clerk` (cheap helpers) | the package (`agent-workflow sync`) |
| `.agents/skills/team-*` | generic workflow skills | the package |
| `.agents/commands/*.md` | commands: `/prd` (Codex: `$prd`) | the package |
| `.agents/skills/*-rules` | **project rules**: `workflow-rules`, `business-rules`, `engineering-rules`, `review-rules`, `testing-rules` | `/prd`, approved by a human |
| `.agents/skills/<other>` | technology skills of the project | a human (`/prd` proposes them) |
| `.agents/templates/`, `.agents/docs/` | proposal and design templates, format of changes and reports | the package |
| `.agents/hooks/guard.mjs` | guard that blocks forbidden operations (used by tools with hooks) | the package |
| `.agents/workflow.json` | project configuration: tools, models, guard rules, loop | a human |
| `context/foundation/` | PRD, roadmap, interview notes, technical decisions (`tech-notes.md`) | `/prd` |
| `spec/changes/<ID>/` | changes: `change.json`, `proposal.md`, `design.md`, `verify/` | `pm`, `tech-lead`, the loop |

Tool adapters (`.claude/`, `CLAUDE.md`, `.codex/`, `.opencode/`, `.kilo/`, and the Codex command skill `.agents/skills/prd/`) are generated from `.agents/` by
`agent-workflow sync` for the tools each developer uses, and are not committed. Never edit them.

## Start

1. If the five project skills are missing, the project is not set up yet: run `/prd` (Codex: `$prd`) first.
2. Read the project skill `workflow-rules` first, then only the skills and documents your task needs.
3. Check facts in the repository. Do not assume that an API, file or piece of infrastructure exists.
4. If you were started as a role, follow `.agents/agents/<role>.md`. Otherwise act as `tech-lead`.

## Flow

`/prd` (product and technical context, writes the project skills; new or existing code) → `pm`
(`change.json`, `proposal.md`) ⇄ `tech-lead` (`design.md`) → user approval (`agent-workflow approve <ID>`)
→ `tech-lead` or the loop (`autopilot`) → subtasks land on `task/<ID>` → main PR `task/<ID>` → default branch,
merged only by a human. A single task goes straight to `tech-lead`. Fixes after PR review are done by
`tech-lead` on the same branch.

## Delegation

Roles ask other roles by name ("ask `implementer`"). Use your tool's subagent mechanism with that role. If your
tool cannot start a named subagent, start a generic subagent with the instructions from
`.agents/agents/<role>.md`, or perform the role yourself and say so in the report. Review and QA are then done
critically, as someone other than the author.

### Cheap helpers

Two roles run on the `low` tier so a strong model does not spend tokens on mechanical work:

- `scout` (read-only): searches and maps the code, collects git facts, and returns paths with short facts, not file contents.
- `clerk`: runs commands it is given and reports pass or fail in a few lines, moves and renames files, archives finished changes.

Roles that coordinate (`tech-lead`, `pm`, `autopilot`, and the `/prd` command) hand such work to them when a search would read more than a few files or a command only needs its result reported. Give them a precise task: the question or the exact steps, the allowed files and the report you expect. Do not hand them design, review, QA verdicts, delivery reports or anything that needs a decision. A subagent usually cannot start another subagent, so `implementer`, `qa` and `code-reviewer` do their own lookups. If your tool cannot start a named subagent, do the work yourself.

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
- An unattended run (the loop, `autopilot`) asks nothing: it records the assumption or marks the subtask blocked.

## Hard boundaries

- Never push to the default branch, force push, merge into the default branch or deploy. A human merges.
- Giving `tech-lead` a task, or starting the loop, is consent to commit and push `task/<ID>` and `sub/<ID>/<ST>`,
  to open PRs and (the loop only) to merge green subtask PRs into `task/<ID>`.
- Do not change roles, commands, permissions, hooks, `.agents/workflow.json`, this file, the tool adapters or `.env`.
  The five project skills change only through `/prd` or on the user's request.
- Do not turn proposals into approved decisions. An unanswered product decision blocks the dependent code.
- PASS only with executed evidence; an unexecuted check is NOT VERIFIED. Never reveal or commit secrets,
  production data or credentials.
