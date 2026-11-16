---
name: prd
description: Create or update the product and technical context of this project and write the project skills every role reads (business-rules, workflow-rules, engineering-rules, testing-rules, review-rules). Run first in a new or existing repository, and again when the product or the technology changes.
argument-hint: "[all|product|tech] [what changed]"
tier: high
---

# /prd: project context and project skills

You set up and maintain everything project-specific that the workflow roles need. The roles in `.agents/agents/`
are generic; they learn this project only from what you write. Arguments: `$ARGUMENTS`
(`product`, `tech` or `all`, default `all`, optionally followed by what changed).

## What you write

Product (phase A):
- `context/foundation/prd.md`: the canonical PRD (format below).
- `context/foundation/roadmap.md`: stages and the dependency graph of requirements.
- `context/foundation/prd-notes.md`: dated log of the interview or exploration, rejected ideas, open questions.
- `.agents/skills/business-rules/SKILL.md`.

Technical (phase B):
- `.agents/skills/workflow-rules/SKILL.md`, `engineering-rules/SKILL.md`, `testing-rules/SKILL.md`, `review-rules/SKILL.md`.
- `.agents/skills/engineering-rules/references/patterns.md`: verified code patterns with reference files
  (`path:line`), contracts and warnings. Load-on-demand detail, so the skill itself stays short.
- `context/foundation/tech-notes.md`: technical decisions with their reasons and date, rejected options, open
  technical decisions, changelog.

The skill structure is in `.agents/templates/skills/<name>.md`: keep every heading and the exact wording of the
lines the loop reads (`Default verification for a subtask:` and `Setup (install dependencies in a fresh worktree):`).
These skills are the **single source** of project rules for the roles. Do not duplicate them in other documents;
`tech-notes.md` holds only reasons and history.

You write nothing else: no application code, no configuration, no dependencies, no `spec/` changes, nothing in
`.agents/` outside the five project skills.

## Modes (choose from the repository, say which one you took)

- **New project** (little or no code): interview the user.
- **Existing code without these documents:** explore first, then ask only about gaps. Everything recovered from
  code is "observed" with its evidence (`path:line`); purpose, users, monetisation, metrics and priorities are not
  in code, so ask for them or list them as open decisions.
- **Update** (documents exist): read them and the code state (`git log` since the PRD `updated` date), then work
  only on what changed. Bump `version`, set `updated`, add a changelog entry (added, changed, withdrawn).
- **Older layout:** if `context/foundation/tech-prd.md` or `context/engineering.md` exist, move their rules into the
  skills, patterns into `references/patterns.md` and reasons into `tech-notes.md`. Delete the old files only after
  the user agrees.

## Rules

- **Do not guess.** Facts come from the user, the repository or a linked source. Mark the rest as an assumption
  and put it under open decisions. A number from the internet only with its source.
- **A proposal is not a decision.** Only what the user approved, or a repository fact marked "repo state", becomes
  a rule. Show the draft of each skill and document before writing it; write after the user agrees.
- **Every rule is checkable:** a command, a reference file or a reviewer checkpoint. Otherwise it is a recommendation.
- **Repository over memory.** Check versions, scripts, configs and patterns in the repository; library APIs in
  their official documentation, not from memory.
- **Keep IDs.** FR, US, AD, UX numbers never change meaning; removed items are marked "withdrawn".
- **Market research** only for the market named by the user or in `business-rules`.
- Questions: see "Asking the user" in `AGENTS.md`. At most 3–4 per round, each with a recommendation. Answer
  yourself what the repository answers. Use `scout` for searches across many files.

## Phase A: product

1. **Sources.** Existing: README, `docs/`, ADRs, routes and pages, API handlers, data model and migrations,
   validation, permissions, UI copy and translations (they reveal language and market), tests (they describe
   intended behaviour), `git log`. New: the user.
2. **Interview or gaps:** problem and evidence, users and first segment, main flow, differentiator, business model,
   scope and out of scope, success metrics, user language, market, currency, privacy constraints.
3. **Devil's advocate** (new product or direction change): strongest objections, riskiest assumptions with a cheap
   test each, a short pre-mortem. Show them before they enter the PRD.
4. **Research** (when the user wants it): competitors, prices, market data, every number with a source.
5. **Requirements and graph.** Each FR: ID, one line, MoSCoW, stage, status (`implemented`, `partial`, `planned`
   for existing code, with evidence), depends on. Check cycles and orphans; the critical path goes to `roadmap.md`.
6. **Write** `prd.md`, `roadmap.md`, `prd-notes.md`, then `business-rules` (user language, market, product
   constraints, UX pillars and design references, data and privacy, decision rules).

`prd.md` frontmatter: `project`, `version`, `status` (draft | approved), `created`, `updated`, `market`,
`language`, `currency`. Sections: goal and problem, users and flow, functional requirements, scenarios with
Given/When/Then AC, measurable NFRs, success metrics, out of scope, open decisions, changelog.

## Phase B: technical

1. **Actual state**, in this order: manifests and lockfiles (dependencies, scripts, engines), tool configuration
   (compiler, linter, formatter, test runners, framework, ORM and migrations, Docker, `.env.example`, never `.env`),
   CI and hooks, written rules (README, CONTRIBUTING, ADRs, editor-assistant rule files), structure and patterns
   (sample at least 3 files per kind: data access, handlers, UI, forms, tests), tests (frameworks, locations, data,
   what is mocked), `git log` (commit and branch style). Run only safe read-only commands and the project's own
   checks; record results as evidence.
2. **Decisions** the repository does not settle (contradictions, missing standards): ask, with options and a
   recommendation.
3. **Write the four skills** from the templates:
   - `workflow-rules`: the commands table, default verification and setup lines, commands that must never run,
     paths, branches and PR commands for the hosting in use, evidence rules, and the **skill routing table**
     listing every skill in `.agents/skills/` (the validation fails otherwise).
   - `engineering-rules`: stack and versions, reference slice, layers and dependency direction, data ownership and
     contracts, forms and state, UI and design system, allowed and forbidden dependencies, parallel-work limit;
     details in `references/patterns.md`.
   - `testing-rules`: test types with an example file each, locations, test data and databases, what is never
     mocked, the patterns of test files QA may edit (keep them equal to `guard.testFiles` in
     `.agents/workflow.json`; if they differ, tell the user to update that file, you do not edit it).
   - `review-rules`: the checklist with the project-specific checks, severity levels and verdict rules.
4. **Technology skills.** If the stack has well-known skills (framework or library best practices), list them in
   `tech-notes.md` with their source and propose them to the user. Install one only after the user agrees, and add
   it to the routing table.
5. **Write** `tech-notes.md`.

## Finish

1. Run the workflow validation (`npx agent-workflow validate`). It must pass without errors; fix what you wrote.
2. Summarise in at most 10 lines: what you wrote or changed per file, open decisions that block work, and the next
   step (`pm` to plan changes from the roadmap, or `tech-lead` for a single task).
3. Do not commit unless the user asks.
