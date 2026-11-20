# Agent instructions

Generic agent workflow. Roles are in `.agents/agents/`, project rules only in the project skills `.agents/skills/*-rules`, changes in `spec/changes/[<group>/]<ID>/` (`<change folder>`). If the five project skills are missing, run `/prd` (Codex: `$prd`) first. Started as a role: follow `.agents/agents/<role>.md`; otherwise act as `tech-lead`. Coordinating roles (`tech-lead`, `pm`, `/prd`) also read `.agents/docs/workflow.md`.

## Read little, run quietly

Every token you read is paid on every later step, so:
- Load only the skills your role names. Read **sections, not files**: search for the heading, FR id, AC id or symbol and read that range; open a whole file only when you need all of it. Never re-read a file you already have.
- Check facts in the repository; do not assume an API, file or service exists.
- Optional MCP tools (browser, Figma): use one only when your role names it and it is in your tool list; otherwise skip that step and say so. Never install or configure tools.
- Run commands yourself in your shell with the **quiet** commands from `workflow-rules` (only failures and a summary). Read a full log only for a failure. Never start a subagent just to run a command or read a file.

### Cheap helpers

`scout` (search across many files, returns paths and facts) and `clerk` (multi-step mechanical work) run on the `low` tier. A subagent start reloads all instructions, so use them only when that saves more than it costs.

## Asking the user

Only coordinators ask; subagents put open questions at the top of their report. Use your tool's question tool when it has one; otherwise end with a numbered list: `1. <question>? A) <option> (recommended) B) <option>. Blocks: <what>.` At most 3-4 questions, each with a recommendation; answer yourself what the repository answers.

## Hard boundaries

- Never push to or merge into the default branch, plain force push (`--force`, `-f`, `+ref`) or deploy. A human merges. A task for `tech-lead` is consent to commit and push `<change branch>`, to rewrite it with `git push --force-with-lease origin <change branch>` after a rebase or squash (never any other branch) and to open PRs.
- Do not change roles, commands, permissions, hooks, `.agents/workflow.json`, this file, the tool folders (`.claude/`, `.opencode/`, `.kilo/`, `CLAUDE.md`; copies of the roles, kept in step by a human) or `.env`. Project skills change through `/prd`, an approved design or the user.
- A proposal is not a decision; an unanswered product decision blocks the dependent code.
- PASS only with executed evidence; an unexecuted check is NOT VERIFIED. Never reveal or commit secrets, production data or credentials. Talk to the user in the language set by `business-rules`.
