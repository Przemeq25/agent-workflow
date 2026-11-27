---
description: "Create or update the product and technical context of this project and write the project skills every role reads (business-rules, workflow-rules, engineering-rules, testing-rules, review-rules). Run first in a new or existing repository, and again when the product or the technology changes."
---


# /prd: project context and project skills

You set up and maintain everything project-specific that the workflow roles need. The roles in `.agents/agents/`
are generic; they learn this project only from what you write. Arguments: `$ARGUMENTS`
(`product`, `tech`, `design`, `all` or `sync`, default `all`, optionally followed by what changed). `all` runs
phase C only when the project has a UI.

## What you write

Product (phase A):
- `context/foundation/prd.md`: the canonical PRD (format below).
- `context/foundation/roadmap.md`: stages and the dependency graph of requirements.
- `context/foundation/prd-notes.md`: dated log of the interview or exploration, rejected ideas, open questions.
- `.agents/skills/business-rules/SKILL.md`.

Technical (phase B):
- `.agents/skills/workflow-rules/SKILL.md`, `engineering-rules/SKILL.md`, `testing-rules/SKILL.md`, `review-rules/SKILL.md`.
- `.agents/skills/engineering-rules/references/<topic>.md`: one file per project-wide way of doing something
  (configuration and env, translations, auth and permissions, data access, errors and logging, forms, storage,
  background jobs…), each at most about 40 lines: where it lives, how to use it with a reference file and symbol (path plus function or component name, no line numbers),
  what not to do. Listed in the topic table of `engineering-rules`; roles open only the topics their task touches.
- `context/foundation/tech-notes.md`: technical decisions with their reasons and date, rejected options, open
  technical decisions, changelog.

Design system (phase C, `/prd design`, only for a project with a UI):
- `.agents/skills/engineering-rules/references/ui-tokens.md`, `ui-components.md`, `ui-patterns.md` from
  `.agents/templates/skills/references/`, with their rows in the topic table of `engineering-rules`.

The skill structure is in `.agents/templates/skills/<name>.md`: keep every heading and the exact wording of the
lines the loop reads (`Default verification for a subtask:` and `Setup (install dependencies in a fresh worktree):`). Make the verification and the "Quiet tests" row quiet: the project's reporter or flags that print only failures and a summary (check the test runner's options in the repo); agents read this output, so every line costs tokens.
These skills are the **single source** of project rules for the roles. Do not duplicate them in other documents;
`tech-notes.md` holds only reasons and history.

You write nothing else: no application code, no configuration, no dependencies, no `openspec/` changes, nothing in
`.agents/` outside the five project skills and their topic files.

## Modes (choose from the repository, say which one you took)

- **New project** (little or no code): interview the user.
- **Existing code without these documents:** explore first, then ask only about gaps. Everything recovered from
  code is "observed" with its evidence (`path:line`); purpose, users, monetisation, metrics and priorities are not
  in code, so ask for them or list them as open decisions.
- **Update** (documents exist): read them and the code state (`git log` since the PRD `updated` date), then work
  only on what changed. Bump `version`, set `updated`, add a changelog entry (added, changed, withdrawn).
- **Sync** (`/prd sync`): documents drifted from the code (work done outside this workflow, a hotfix). Compare the
  feature map, roadmap statuses and topic files with the code and `git log`; propose only the corrections.
- **Older layout:** if `context/foundation/tech-prd.md`, `context/engineering.md` or `references/patterns.md`
  exist, move their rules into the skills, patterns into topic files and reasons into `tech-notes.md`. Delete the old files only after
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
`language`, `currency`. Sections: goal and problem, users and flow, **features** (the feature map below), functional
requirements, scenarios with Given/When/Then AC, measurable NFRs, success metrics, out of scope, open decisions,
changelog.

Feature map: one line per feature, so changes in parallel rarely conflict:
`F-07 Room photos · FR-21, FR-22 · done | partial | planned · code: src/rooms/photos/ · changes: PROJ-12, PROJ-31`.
Changes keep it current in their own PR (design section 3).

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
     paths, branches and PR commands for the hosting in use, the **Tracker** line (ask the user: Jira or another tracker and its key, e.g. `PROJ`; `none` only when the user says so), the **Visual check** row (see below), evidence rules, and the **skill routing table**
     listing every skill in `.agents/skills/` (a skill missing from it is never routed).
   - **Visual check** row: if the project already has Playwright (`@playwright/test` in the manifest, a `playwright.config.*`),
     write its command. If it has none, ask once whether the user wants screen-vs-image checks; "no" writes `none`.
     "Yes" means you set it up now, with the smallest change: `@playwright/test` as a dev dependency (show the install
     command, run it only with the user's consent), `playwright.config.ts` (`testDir: 'tests/visual'`, `webServer` from the
     "Run the app" row, `snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}'`, projects for 390 and 1440 px
     widths, `expect.toHaveScreenshot.maxDiffPixelRatio: 0.02`), an empty `tests/visual/`, and the command in the row.
     Do not write tests for screens; `implementer` does that when a design asks for "visual check: yes".
   - `engineering-rules`: stack and versions, reference slice, layers and dependency direction, data ownership and
     contracts, forms and state, UI and design system (one line pointing to the `ui-*` topic files of phase C), allowed and forbidden dependencies, and the topic table with
     one `references/<topic>.md` per project-wide way of doing something found in the code (sample at least 3
     usages per topic; contradictions go to open decisions).
   - `testing-rules`: test types with an example file each, locations, the targeted test command, test data and
     databases, what is never
     mocked, the patterns of test files QA may edit (keep them equal to `guard.testFiles` in
     `.agents/workflow.json`; if they differ, tell the user to update that file, you do not edit it).
   - `review-rules`: the checklist with the project-specific checks, severity levels and verdict rules.
4. **Technology skills.** If the stack has well-known skills (framework or library best practices), list them in
   `tech-notes.md` with their source and propose them to the user. Install one only after the user agrees, and add
   it to the routing table.
5. **Write** `tech-notes.md`.

## Phase C: design system

Agents build UI from these files, so they must name real tokens and components, not taste.

1. **Sources.** Existing code: theme and token files (CSS variables, `tailwind.config.*`, `@theme` blocks, theme
   providers), the component folder (e.g. `src/components/ui/`), icon library, 3 or more real screens (forms, lists,
   dialogs, empty and error states), Storybook, Figma links in docs. If a Figma tool is in your tool list and the user names the file, read its
   variables, styles and components (not every screen) and compare them with the code: a token or component that
   exists only in Figma, or only in code, is an open decision. Without a Figma tool, use the code and the links.
   New project: the user, and the stack chosen in phase B.
2. **Tokens** (`ui-tokens.md`): colours by purpose (main action, destructive, muted, surfaces, borders), type scale,
   spacing scale, radius family, shadows, motion; light and dark. Observed values with their source file; values used
   in components but missing from the theme go to open decisions ("raw colour in 6 files").
3. **Components** (`ui-components.md`): one row per need (main action, secondary action, destructive confirm, form
   field, select, dialog, toast, table or list, empty state, loading), with file and export, and what not to use
   instead. Name duplicates (two button components) as open decisions.
4. **Patterns** (`ui-patterns.md`): ask the user at most 3-4 questions the code cannot answer (tone and form of
   address, visual references, what agents must avoid, accessibility level), each with a recommendation. Keep the
   general rules of the template unless the user removes one.
5. **New project:** propose a small token set and component list for the chosen stack, show it, write after the
   user agrees. Never pick colours by taste without a reason: tie them to the brand, the product or the user's words.
6. Add the three rows to the topic table of `engineering-rules` ("Read when: the change touches UI") and point the
   "UI and design system" line there.

## Finish

1. Check by hand what you wrote: the five project skills exist and have a valid frontmatter (`name` equals the folder, one-line `description`); no `<fill>` is left (unknown facts are marked as open questions); every path and command you named exists in the repository; the topic table in `engineering-rules` points to existing `references/<topic>.md` files; after phase C every token
   and component you named exists in the code (or is marked as proposed). Fix what fails.
2. Summarise in at most 10 lines: what you wrote or changed per file, open decisions that block work, and the next
   step (`pm` to plan changes from the roadmap, or `tech-lead` for a single task).
3. Do not commit unless the user asks.

## Asking the user (opencode)

Ask through the `question` tool, never as questions buried in prose. Each question has a header of at most
30 characters, the full question and options with a label and a one-line description. Put your recommended
option first and end its label with "(Recommended)". A custom answer is always possible, so add no "Other"
option. Set `multiple: true` only when several answers can apply. Group related questions in one call.
