# agent-workflow

A tool-independent agent workflow for software projects:

```
/prd (context + project skills) ─► pm (change + subtasks + AC) ⇄ tech-lead (design) ─► user approves
   ─► tech-lead or the loop: implementer → code-reviewer → qa ─► PR task/<ID> → main (a human merges)
```

Roles, skills and templates live in **`.agents/`** of your project and contain **no project rules**. Everything
specific to a project (language, market, stack, commands, tests, review) lives in five project skills:
`workflow-rules`, `business-rules`, `engineering-rules`, `review-rules`, `testing-rules`. You do not write them by
hand: the `/prd` command writes them while it creates the PRD.

Installing the package changes nothing in your project. `agent-workflow init` asks which tools get their own
adapter files (Claude Code, Codex, OpenCode; git-ignored) and which models the tiers use. Choose none and you
get only `.agents/` and `AGENTS.md`, which tools that read `AGENTS.md` natively use as they are.

## Design system for agents: `/prd design`

For a project with a UI, `/prd design` writes three topic files of `engineering-rules`: `ui-tokens.md` (colours by
purpose, type, spacing, radius, motion, taken from the theme in code), `ui-components.md` (which component for which
need, with file and export) and `ui-patterns.md` (states, texts, forms, accessibility, responsive; the user's rules
plus general ones). `tech-lead` names components and tokens in design section 6, the implementer uses only those,
and the reviewer blocks raw colours or sizes, a duplicate component and missing states. Agents read these files only
for changes that touch UI.

## Copy without npm

`copy/` holds the whole workflow ready to copy into a repository: `AGENTS.md`, `.agents/`, `spec/` and the tool
folders `.kilo/`, `.opencode/`, `.claude/`. It names no package, installer or script, so agents never look for a
command they do not have. Instructions in Polish: `copy/INSTRUKCJA.md`. Download it from GitHub (Code → Download ZIP,
then take the `copy/` folder) or `git clone` and copy it. Maintainers rebuild it with `npm run build:copy`; a test
fails when it is out of date.

## Install

```bash
npm i -D github:Przemeq25/agent-workflow#<tag or commit>   # installs only, generates nothing
npx agent-workflow init                                    # questions, see below
```

`init` creates `.agents/` (managed roles, commands, skills, guard, templates), `AGENTS.md`, `spec/changes/` and
`.agents/workflow.json`, then asks:

1. **Tools** that get adapter files: `claude`, `codex`, `opencode`, several or none (default: none).
2. **Models** per chosen tool for the `high`, `standard` and `low` tiers (empty = the tool's default model;
   Claude suggests opus / sonnet / haiku).
3. **Main role** of a session (default `tech-lead`) and the **tool that runs the loop**.
4. **Save for the whole project** (`.agents/workflow.json`, committed) **or only for you**
   (`.agents/workflow.local.json`, git-ignored). Run `init` again any time to change your choice; adapters of
   tools you drop are removed.
5. Whether to add the `postinstall` hook that refreshes `.agents/` and your adapters after every `npm install`.

Without a terminal (CI) or with `--yes`, flags replace the questions and no flags means no tools:

```bash
npx agent-workflow init --yes --tools codex,claude \
  --models codex.high=gpt-5.5,codex.low=gpt-5.5-mini --runner codex --local
```

Once published to npm, `npm init agent-workflow` runs the same `init` (the package also ships the
`create-agent-workflow` bin). The postinstall hook does nothing before `init` and never fails an install:

```json
"postinstall": "node -e \"import('@przemeq25/agent-workflow/postinstall').catch(()=>{})\""
```

## Set up a project: `/prd`

After `init`, run **`/prd`** in your tool (Codex: **`$prd`**). One command, new or existing codebase:

1. **Product:** interview (new project) or exploration of the code with evidence (existing project), devil's
   advocate, optional market research, requirements with a dependency graph. Writes `context/foundation/prd.md`,
   `roadmap.md`, `prd-notes.md` and the `business-rules` skill.
2. **Technical:** reads manifests, configs, CI, written rules, code patterns and tests, asks only about what the
   repository does not settle, and writes `workflow-rules`, `engineering-rules` (with
   topic files `references/<topic>.md` such as configuration or translations), `testing-rules`, `review-rules` and `context/foundation/tech-notes.md` (reasons and
   history). It proposes well-known technology skills for the stack and installs them only after you agree.

Every skill and document is shown as a draft and written after you approve it. `/prd product`, `/prd tech` or
`/prd tech new test runner` run one part or an update; the command then works only on what changed. The skill
structure comes from `.agents/templates/skills/`; the skills are the single source of project rules for all roles.

| Tool | Where the command lives (generated, git-ignored) | Model |
|---|---|---|
| Claude Code | `.claude/commands/prd.md` | `models.claude.high` |
| OpenCode | `.opencode/commands/prd.md` | `models.opencode.high` |
| Kilo | `.kilo/commands/prd.md` | `models.kilo.high` |
| Codex | `.agents/skills/prd/` (explicit-only skill, `$prd`) | session model |
| others | point the tool at `.agents/commands/prd.md` | |

Projects set up before 0.4 with `context/foundation/tech-prd.md` and `context/engineering.md`: `/prd` (update mode) moves
their rules into the skills and asks before deleting the old files.

## Layout in a project

| Path | Committed | Owner |
|---|---|---|
| `AGENTS.md` | yes | package (managed) |
| `.agents/agents/*.md` | yes | package (managed); you may add project roles next to them |
| `.agents/commands/*.md` (`/prd`) | yes | package (managed) |
| `.agents/skills/team-*` | yes | package (managed) |
| `.agents/skills/*-rules` | yes | written by `/prd`, approved by you |
| other skills in `.agents/skills/` | yes | you |
| `.agents/hooks/guard.mjs`, `.agents/templates/`, `.agents/docs/` | yes | package (managed) |
| `.agents/workflow.json` | yes | you (project config) |
| `.agents/.managed.json` | yes | package (hashes of managed files) |
| `.agents/workflow.local.json` | no | each developer |
| `spec/changes/<ID>/` (`change.json`, `proposal.md`, `design.md`, `verify/`), `spec/BACKLOG.md` | yes | `pm`, `tech-lead`, the loop |
| `.claude/agents/`, `.claude/skills`, `.claude/settings.json`, `CLAUDE.md` | no | generated |
| `.codex/agents/*.toml`, `.opencode/agents/*.md`, `.kilo/agents/*.md` | no | generated |

Managed files are overwritten by `sync` only while you have not edited them. A local edit is kept and reported;
`sync --force` replaces it. `validate` (and `sync --check`) fail when a managed file is out of date.

## Choosing tools

Priority: `AGENT_WORKFLOW_TOOLS=claude,codex` > `.agents/workflow.local.json` > `.agents/workflow.json` > none.

```jsonc
// .agents/workflow.local.json (not committed), written by `init` when you save "only for you"
{ "tools": ["codex"], "models": { "codex": { "high": "gpt-5.5", "low": "gpt-5.5-mini" } } }
```

The local file may change tools, models and the loop runner. It cannot change the `guard` rules.

| Tool | Instructions | Skills | Roles | Enforcement |
|---|---|---|---|---|
| Claude Code | `CLAUDE.md` with `@AGENTS.md` (generated) | `.claude/skills` → symlink to `.agents/skills` (copy on Windows) | `.claude/agents/*.md` | guard hook per role + `settings.json` |
| Codex | `AGENTS.md` (native) | `.agents/skills` (native) | `.codex/agents/*.toml` | `sandbox_mode` (read-only roles) |
| OpenCode | `AGENTS.md` (native) | `.agents/skills` (native) | `.opencode/agents/*.md` | `permission` patterns per role |
| Kilo (CLI, VS Code, JetBrains) | `AGENTS.md` (native) | `.agents/skills` (native) | `.kilo/agents/*.md` | `permission` patterns per role; reads, `question` and `task` pre-allowed |

Role frontmatter is tool-neutral and mapped by the adapters:

```yaml
tier: high | standard | low | inherit   # → models.<tool>.<tier>; inherit = tool default ("strong" = old name of high)
access: full | no-commit | qa | read-only | prd | prd-tech
mode: primary | subagent | all
skills: [team-verification]             # preloaded where the tool supports it
```

## Precise planning

- One **edge-case checklist** (`.agents/docs/spec-format.md`: input, empty, limits, permissions, conflict, failure,
  states, texts, existing data). `pm` turns user-visible cases into AC and fills the "Edge cases" table of the
  proposal (every category: an AC or "n/a: reason"); `tech-lead` adds technical cases in design section 7.
- Design section 9 has a row for every AC (`ST-01 AC-1`) and every section 7 row. The **approval checklist**
  (`.agents/docs/spec-format.md`, done by the role by hand after the user says "ok") fails a design where an AC has
  no test row, a section 7 row has no test (or `not tested: reason`), or the proposal's edge-case table has gaps.
- `code-reviewer` reviews the design before approval when a change has several subtasks, contracts or data.
- `qa` checks every AC and every section 7 row of its subtask, running only the targeted tests.
- Documentation the change makes true (feature line in the PRD, roadmap status, topic files in `engineering-rules`)
  is listed in design section 3 and ships in the same PR as the code.

## Sessions and tokens

Roles hand over through files, not chat history: start a new session after `/prd`, after approval, after a merge,
and during a long delivery once `spec/changes/<ID>/progress.md` is updated.

Every subagent call reloads the rules and the code (about 100k tokens on a strong model), so delivery uses as few
calls as the change allows:

- **solo** (default: one subtask or only S subtasks, nothing COMPLEX, no migration): `tech-lead` plans and implements
  in its own session, then **one** `code-reviewer` pass for the whole change, which also checks every AC and edge case
  against a test and runs the targeted tests. No `implementer`, `qa` or `clerk`.
- **team** (M or COMPLEX subtasks, a migration, or on request): `implementer` builds a **batch** of subtasks in one
  call (default: all of them; a batch ends after a COMPLEX subtask), one review per batch, `qa` only for COMPLEX or UI.
  `tech-lead` does not read the code in team mode and commits each batch once with one `Subtask:` line per subtask.
- **Fewer, bigger subtasks:** a subtask is a delivery unit (S up to ~5 files, M up to ~15, 2–10 AC); split only for a
  migration or contract that must land first, a COMPLEX part, or a PR too big to review. Most changes have 1–3.
- Design review only for COMPLEX changes or migrations; design sections that do not apply are one line `n/a: reason`.
- **Commands run in the agent's own shell, quietly.** `workflow-rules` names quiet test commands (only failures and a
  summary): a green run costs ~20 tokens, a failure a few hundred. Starting a subagent just to run a command costs
  ~80k tokens, so `clerk` is only for multi-step mechanical work.
- **Test strength:** the reviewer asks for each logic test whether a simpler wrong implementation would still pass
  (locale order, one-sided boundaries, assertions on length) and blocks it with the one input that tells them apart.
- **Small always-loaded context:** `AGENTS.md` (loaded into every agent) is ~650 tokens; the flow, sessions, delegation
  and helper details live in `.agents/docs/workflow.md`, read only by coordinators. Each role names the few skills it
  loads (implementer: design sections for its subtasks + commands + `testing-rules`), and every role reads sections,
  not files (PRD by FR id, design by section, code by symbol). Same review, same model: ~19k fewer tokens per call.
- Documentation names files and symbols, never line numbers. A stale doc is fixed in the same commit; it is a review
  suggestion, not `SPEC_CONFLICT`, and needs no new approval.

Benchmark (2 small changes, same model, hidden acceptance tests): the old per-subtask chain used ~1.63M tokens in 15
calls; solo mode used ~0.44M in 4 calls with the same result (20/20 hidden tests) and no human interruptions.

## Questions to the user

Every generated role ends with a short "Asking the user" section for its tool, so questions arrive as a picker
instead of text:

| Tool | Question tool | Notes |
|---|---|---|
| Claude Code | `AskUserQuestion` | up to 4 questions, 2-4 options, recommended option first |
| OpenCode, Kilo | `question` | header, options with descriptions, `multiple` when needed; Kilo agents get `question: allow` |
| Codex | `request_user_input` | only in Plan mode unless `features.default_mode_request_user_input = true` |
| anything else | none | numbered list at the end of the message (rule in `AGENTS.md`) |

Before work that needs decisions, a role shows one **Decisions** block: the questions with recommendations, the
order of steps and what is blocked. Subagents cannot ask; they return questions in their report. The loop never
asks.

## Cheap helpers on the `low` tier

Two roles keep mechanical work off the strong models:

| Role | Access | Does |
|---|---|---|
| `scout` | read-only | searches and maps code, collects git facts, returns paths and short facts, never file contents |
| `clerk` | no commit/push | runs the commands it is given and reports pass or fail briefly, moves and renames files, archives finished changes |

Coordinating roles (`tech-lead`, `pm`, `autopilot`) and the `/prd` command hand them lookups and
command runs. They never get design, review, QA verdicts or delivery reports. Subagents usually cannot start
other subagents, so `implementer`, `qa` and `code-reviewer` do their own lookups.

The saving needs a cheap model in `models.<tool>.low`. `init` suggests `haiku` for Claude; for Codex and OpenCode
enter a small model, otherwise the tool's default model runs these roles.

## Project config `.agents/workflow.json`

```jsonc
{
  "tools": ["claude"],                                             // [] = only .agents/ and AGENTS.md
  "defaultAgent": "tech-lead",
  "models": { "claude": { "high": "opus", "standard": "sonnet", "low": "haiku" }, "codex": {}, "opencode": {} },
  "guard": {
    "defaultBranch": "main",
    "testFiles": "(\\.test\\.tsx?$|(^|/)tests/)",                // files qa may edit
    "forbiddenCommands": [["\\bvercel\\b", "a human deploys"]]      // regex, reason
  },
  "claude": { "permissions": { "deny": ["Bash(vercel *)"] } },
  "opencode": { "bashDeny": ["vercel*"] },
  "loop": { "runner": "claude", "verifyEnv": { "SKIP_ENV_VALIDATION": "1" } }
}
```

Projects created before 0.2.0 keep changes in `work/`; the loop still reads it and `validate` suggests
`git mv work spec`.

## Skills only: no scripts at work time

Roles and commands (`/prd`) never run `agent-workflow`. They work from the skills and documents: validation and
approval are the checklists in `.agents/docs/spec-format.md`, delivery state is read from git. The CLI is only
the installer (`init`, `sync`, run by a human) and, optionally, the unattended loop. A change approved by hand has no
fingerprint (`approvalHash`); `validate` warns about it, and the loop asks you to run `agent-workflow approve <ID>`
first.

### Starting `pm` in Kilo (desktop, VS Code, CLI)

`sync` writes the roles to `.kilo/agents/`; `pm` and `tech-lead` are primary agents. Reload the window (or restart
the CLI), then pick the agent in the agent selector of the chat (CLI: `/agents` or Tab) and write what you need, or run
`/prd` first. Models come from `models.kilo.<tier>` in `.agents/workflow.json` (names from `kilo models`).

## Commands

```bash
agent-workflow init [--yes --tools … --models … --runner … --default-agent … --local --no-postinstall]
agent-workflow sync [--tools …] [--force] [--check]
agent-workflow validate | render | status | approve <ID…> | publish
agent-workflow loop [--max N] [--change ID] [--retry ID/ST] [--dry-run]
agent-workflow watch
```

The loop takes its setup and verification commands from `workflow-rules`
(`Default verification for a subtask:` and `Setup (install dependencies in a fresh worktree):`).
Environment variables `AGENT_LOOP_*` override them (`AGENT_LOOP_RUNNER`, `AGENT_LOOP_MODEL`,
`AGENT_LOOP_VERIFY`, `AGENT_LOOP_SETUP`, `AGENT_LOOP_CMD`, …). Platforms: GitHub (`gh`), Bitbucket Cloud
(API token) or plain branches.

Runners: `loop.runner`, else the first configured tool, else `claude` (tested). `codex` (`codex exec --full-auto`) and `opencode` (`opencode run --agent
autopilot`) are experimental. `loop.command` runs any CLI with `{prompt_file}`.

GitHub Actions step:

```yaml
- run: npm ci                       # postinstall generates the adapters
- run: npm install -g @anthropic-ai/claude-code
- run: npx agent-workflow loop --max 3
  env:
    GH_TOKEN: ${{ secrets.AGENT_LOOP_GH_TOKEN || github.token }}
    CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

## Known limits

- Hard enforcement (blocked commands and paths per role) exists only in Claude Code, through the guard hook.
  Codex and OpenCode get their own sandbox or permission settings plus the same written rules. OpenCode and
  Kilo agents also deny pushes to `guard.defaultBranch`, `main` and `master` (as a separate argument, after
  `:` or `/`) and a bare `git push`; protected files are guarded only by the written rules there.
- Provider keys for OpenCode belong in the global `~/.config/opencode/opencode.json` as `{file:...}` or
  `{env:...}` references, never in the repository (example in `copy/INSTRUKCJA.md`).
- Codex does not always start a custom agent by name; roles then fall back to a generic subagent with the role
  file (see "Delegation" in `AGENTS.md`).
- With both Claude and OpenCode enabled, OpenCode sees the skills twice (`.claude/skills` and `.agents/skills`).
- Workflow documents (proposal, design) are validated by numbered sections, so they can be written in any
  language; the Polish headings of older documents are accepted.

## Development

```bash
npm test
```

Releases are git tags (`v0.1.1`); projects pin a tag or a commit in `package.json`. npm records GitHub dependencies as `git+ssh` in the lockfile, but fetches a public repository over HTTPS, so CI and deploys need no keys.
