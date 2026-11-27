# Design rules (tech-lead)

Read by `tech-lead` only while writing or revising `design.md`.

- **Evidence over assumptions.** Verify every reference to existing code (`rg`, `git grep`, reading) and record it in section 2 as path plus symbol (function, component, key), never a line number: lines move with every change. What does not exist is recorded as NEW or as a question.
- **Full file list**, including the documentation this change makes true (design template, section 3). Contracts in the project language from `business-rules` with binding names, data (or "no database changes"), UI with states and texts in the user language (or "no UI").
- **Figma** (optional, only when a Figma tool is in your tool list and the change has a frame): read **only the frames of this change** (the links from the proposal or `business-rules`), not the whole file. Take layout, texts, states and the components used, map each to `ui-components.md` and `ui-tokens.md`, and write the result and the frame link into section 6, so the implementer never opens Figma. A frame that needs a component or token the project lacks is a decision D… or a question to the user. Without a Figma tool, use the frame link and what the user describes.
- **UI:** when the change touches UI, read the `ui-*` topic files by section and name in section 6 the components and tokens each part uses; put the `ui-patterns.md` rules that apply into section 12. Nothing visual is left to taste.
- **Edge cases:** section 7 starts from the proposal's "Edge cases" table and adds the technical cases. Every row with logic has a test; the others name other evidence or say `not tested: <reason>`. Section 9 has a row for every AC (`STEP-01 AC-1`) and every section 7 row, and stays within the **Test budget** of `testing-rules`: the most important logic only, one test per AC with logic, no tests for wiring or markup. A missing user-visible case is a product question for `pm` or the user, not something you decide.
- Forbidden wording without a concrete: "appropriately", "if needed", "similar to".
- The simplest solution that fits `engineering-rules`. A deviation is a decision D1… with a reason. Questions that need the user go to the open-questions section and block approval.
- When reviewing a design (yours after a revision, or for `pm`), name the concrete gap and the smallest fix; do not design it a second time.
- A subtask that is too big (about 10+ files, several new contracts, migration plus large UI) is split. A change bigger than one sensible PR is several changes with `dependsOn`.

### Section 12: skill guidance

A weaker implementer will not read the skill catalogue. You read it and leave only what concerns this change, noting which subtask each rule applies to.

1. Inventory the sources: the topic table in `engineering-rules` (project-wide ways of doing things: configuration, translations, auth…) and the project skills `.agents/skills/*/SKILL.md` (name and description from frontmatter).
2. Pick the topics the files in section 3 touch, and the technology skills using the routing table in `workflow-rules`. Workflow skills (`team-*`) do not go into section 12.
3. Read the chosen skills and their rule files. Choose only rules that apply to the files in section 3.
4. Write 0–8 hints (none when nothing in the topic table or skills concerns the files). Each: **imperative rule** → file or place in this task → source (skill/rule path). Add a short "do / don't" example for non-obvious ones.
5. When a skill conflicts with `engineering-rules` or existing code, the repository wins. Record the conflict as decision D…, and if it affects the whole repository, propose a change to the engineering rules.

### Library documentation (optional tool)
If a documentation tool such as Context7 is in your tool list, use it only for a library API the design depends on and that may have changed (a version in the manifest newer than you know, an unfamiliar option or error). One lookup per library, record the version and the call you rely on in section 12. Never for well-known APIs, and the implementer never looks things up: the design is its source.
