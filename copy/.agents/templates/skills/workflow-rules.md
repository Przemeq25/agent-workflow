---
name: workflow-rules
description: How work is done in this repository - commands, paths, branch and PR conventions, forbidden operations, evidence rules and the skill routing table. Load first, before any task.
---

# Workflow rules

The workflow roles are generic. Everything specific to this repository lives here and in `business-rules`, `engineering-rules`, `review-rules` and `testing-rules`. Written by `/prd`; every `<fill>` is replaced with facts from this repository.

## Commands (single source of truth)
| Purpose | Command |
|---|---|
| Typecheck | <fill> |
| Lint / format check | <fill> |
| Unit and integration tests | <fill> |
| Targeted tests (one file or pattern) | <fill> |
| Quiet tests (only failures and a summary) | <fill> (e.g. `node --test --test-reporter=dot`, `vitest run --reporter=dot`, `jest --silent`, `pytest -q`) |
| End-to-end tests | <fill> |
| Run the app (for a browser check by `qa`) | <fill> (e.g. `npm run dev`, URL `http://localhost:3000`) or "none" |
| Test account (for a browser check) | <fill> (how to get one, e.g. a seed command; never a real password here) or "none" |
| Build | <fill> |
| Generate migration | <fill> (or "none") |
| Update project context and these skills | `/prd` (Codex: `$prd`) |
Default verification for a subtask: `<fill>` (quiet: prints only failures and a summary; the same exit code).
Setup (install dependencies in a fresh worktree): `<fill>`.
Keep the exact wording `Default verification for a subtask:` and `Setup (install dependencies in a fresh worktree):` (the optional unattended loop reads both lines as its defaults).
Commands that must never run (shared database, deploy): <fill>.

## Paths
- Product: `context/foundation/prd.md`, `roadmap.md`, `prd-notes.md`. Technical decisions and reasons: `context/foundation/tech-notes.md`. Project-wide ways of doing things: the topic table in `engineering-rules`.
- Changes: `spec/changes/<ID>/` (`change.json`, `proposal.md`, `design.md`, `verify/<ST>.md`), templates in `.agents/templates/`, format in `.agents/docs/spec-format.md`.
- Source: <fill>. Tests: <fill>.

## Git and delivery
- Default branch: `main`. Branches: `task/<ID>` (one per change), `sub/<ID>/<ST>` (loop subtasks). Commit trailer `Subtask: <ID>/<ST>`.
- Tracker: <fill> (e.g. `Jira, key PROJ`, or `none`). With a tracker, every change ID starts with the issue key in upper case (`PROJ-123` or `PROJ-123-short-note`), so every branch name, every commit subject (`feat(PROJ-123-rooms): …`, also `fix`, `docs`, `chore` outside a change: `chore(PROJ-123): …`) and every PR title (`PROJ-123 <title>`) contains the key. No key given: ask the user; never invent or reuse one.
- Hosting: <fill> (GitHub or Bitbucket). PR-create: <fill> (e.g. `gh pr create --base main --head task/<ID>`, `--draft` when something did not pass). PR-read with review comments: <fill>. PR-reply: <fill>.
- Only a human merges to the default branch, pushes to it, deploys, or changes repo settings and secrets.
- Roles, permissions, hooks, `.agents/workflow.json`, `AGENTS.md` and `.env` are changed only by a human.

## Evidence rules
PASS needs executed evidence; an unexecuted check is NOT VERIFIED. A user-activated *no-tests* marker disables all verification commands for that change. Docs-only changes need no application tests. Present code or a green build does not prove visual acceptance. Each check has one owner. Environment variable names are in `.env.example`; never read `.env`.

## Skill routing (design section 12)
Skills used when writing design guidance. `team-*` skills are workflow skills, not design guidance. Every skill in `.agents/skills/` must appear in this table.

| Skill | When |
|---|---|
| `workflow-rules` | every role, first |
| `business-rules` | every role: user language, product and market constraints |
| `engineering-rules` | always: code patterns of this repo |
| `review-rules` | reviewer, always |
| `testing-rules` | implementer, qa and code-reviewer always; tech-lead for the test plan and in solo mode |
| `team-task-handoffs` | tech-lead, always |
| `team-verification` | implementer, qa and tech-lead in solo mode |
| `team-systematic-debugging` | implementer, tech-lead: when verification, review or QA shows a real defect |
