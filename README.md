# agent-workflow

A tool-independent agent workflow for software projects:

```
prd / prd-tech ─► pm (change + subtasks + AC) ⇄ tech-lead (design) ─► user approves
   ─► tech-lead or the loop: implementer → code-reviewer → qa ─► PR task/<ID> → main (a human merges)
```

Roles, skills and templates live in **`.agents/`** of your project and contain **no project rules**. Everything
specific to a project (language, market, stack, commands, tests, review) lives in five project skills you write
once: `workflow-rules`, `business-rules`, `engineering-rules`, `review-rules`, `testing-rules`.

Each developer picks the tools they use. `agent-workflow sync` generates the adapters for them
(Claude Code, Codex, OpenCode), and those adapters are git-ignored.

## Install

```bash
npm i -D github:Przemeq25/agent-workflow#<tag or commit>
npx agent-workflow init            # or: init --tools claude,codex
```

`init` creates `.agents/workflow.json` and skeletons of the five project skills (only missing files), adds npm
scripts and a `postinstall` hook, then runs `sync`. After that every `npm install` / `npm ci` regenerates the
adapters. The hook never fails an install, also when dev dependencies are omitted:

```json
"postinstall": "node -e \"import('@przemeq25/agent-workflow/postinstall').catch(()=>{})\""
```

For an existing codebase, run the `prd-tech-explore` and `prd-explore` roles once: they reverse-engineer the
PRD and the technical standards and draft the five project skills for you.

## Layout in a project

| Path | Committed | Owner |
|---|---|---|
| `AGENTS.md` | yes | package (managed) |
| `.agents/agents/*.md` | yes | package (managed); you may add project roles next to them |
| `.agents/skills/team-*` | yes | package (managed) |
| `.agents/skills/*-rules`, other skills | yes | you |
| `.agents/hooks/guard.mjs`, `.agents/templates/`, `.agents/docs/` | yes | package (managed) |
| `.agents/workflow.json` | yes | you (project config) |
| `.agents/.managed.json` | yes | package (hashes of managed files) |
| `.agents/workflow.local.json` | no | each developer |
| `.claude/agents/`, `.claude/skills`, `.claude/settings.json`, `CLAUDE.md` | no | generated |
| `.codex/agents/*.toml`, `.opencode/agents/*.md` | no | generated |

Managed files are overwritten by `sync` only while you have not edited them. A local edit is kept and reported;
`sync --force` replaces it. `validate` (and `sync --check`) fail when a managed file is out of date.

## Choosing tools

Priority: `AGENT_WORKFLOW_TOOLS=claude,codex` > `.agents/workflow.local.json` > `.agents/workflow.json` > `["claude"]`.

```jsonc
// .agents/workflow.local.json (not committed)
{ "tools": ["codex"], "models": { "codex": { "strong": "gpt-5.5" } } }
```

The local file may change tools, models and the loop runner. It cannot change the `guard` rules.

| Tool | Instructions | Skills | Roles | Enforcement |
|---|---|---|---|---|
| Claude Code | `CLAUDE.md` with `@AGENTS.md` (generated) | `.claude/skills` → symlink to `.agents/skills` (copy on Windows) | `.claude/agents/*.md` | guard hook per role + `settings.json` |
| Codex | `AGENTS.md` (native) | `.agents/skills` (native) | `.codex/agents/*.toml` | `sandbox_mode` (read-only roles) |
| OpenCode | `AGENTS.md` (native) | `.agents/skills` (native) | `.opencode/agents/*.md` | `permission` patterns per role |

Role frontmatter is tool-neutral and mapped by the adapters:

```yaml
tier: strong | standard | inherit       # → models.<tool>.<tier> in workflow.json
access: full | no-commit | qa | read-only | prd | prd-tech
mode: primary | subagent | all
skills: [team-verification]             # preloaded where the tool supports it
```

## Project config `.agents/workflow.json`

```jsonc
{
  "tools": ["claude"],
  "defaultAgent": "tech-lead",
  "models": { "claude": { "strong": "opus", "standard": "sonnet" }, "codex": {}, "opencode": {} },
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

## Commands

```bash
agent-workflow init | sync [--tools …] [--force] [--check]
agent-workflow validate | render | status | approve <ID…> | publish
agent-workflow loop [--max N] [--change ID] [--retry ID/ST] [--dry-run]
agent-workflow watch
```

The loop takes its setup and verification commands from `workflow-rules`
(`Default verification for a subtask:` and `Setup (install dependencies in a fresh worktree):`).
Environment variables `AGENT_LOOP_*` override them (`AGENT_LOOP_RUNNER`, `AGENT_LOOP_MODEL`,
`AGENT_LOOP_VERIFY`, `AGENT_LOOP_SETUP`, `AGENT_LOOP_CMD`, …). Platforms: GitHub (`gh`), Bitbucket Cloud
(API token) or plain branches.

Runners: `claude` (default, tested). `codex` (`codex exec --full-auto`) and `opencode` (`opencode run --agent
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
  Codex and OpenCode get their own sandbox or permission settings plus the same written rules.
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
