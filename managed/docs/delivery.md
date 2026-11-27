# Delivery (tech-lead)

Read by `tech-lead` only in a delivery session. Steps continue the flow in `.agents/agents/tech-lead.md`.

### 4. Delivery
1. **Change branch:** `git fetch origin`; if `<change branch>` already exists (planning was committed in an earlier session) `git switch <change branch>` and skip the first commit below, otherwise `git switch -c <change branch> origin/<default branch>` (the default branch is in `workflow-rules`). If `git status` shows uncommitted changes that are not yours, do not touch them: tell the user in one sentence and wait, because subagents work in the same directory. First commit: `docs(<ID>): proposal and design` with the whole `<change folder>/`.
2. **Choose the delivery mode** and write it in `progress.md`:
   - **solo** (default): one subtask, or only S subtasks, no COMPLEX subtask and no migration. You implement yourself, in this session.
   - **team**: an M or COMPLEX subtask, a migration, or the user asks for it. `implementer` writes the code in **batches**: by default one batch with all subtasks; a batch ends after a COMPLEX subtask, so that subtask is reviewed before the rest is built on it. You do not read the code yourself in team mode: the design, the reports and the review are your evidence, which keeps your session small.
3. **Solo delivery**, subtasks in dependency order. If `progress.md` exists, continue from it. For each STEP-xx:
   1. Record the base: `git rev-parse HEAD`.
   2. Write the code and tests yourself (load `testing-rules` and `team-verification`); for UI follow the UI and visual check rules of `implementer`.
   3. Run the default verification from `workflow-rules`. Red: fix, at most 2 rounds; from the second round load `team-systematic-debugging`.
   4. Write `<change folder>/verify/<STEP>.md` (format in `.agents/docs/spec-format.md`, short), update `progress.md`, commit as `feat(<ID>): <STEP> <title>` with the line `Subtask: <ID>/<STEP>` in the body.

   **Team delivery**, batch by batch:
   1. Record the base: `git rev-parse HEAD`.
   2. Ask `implementer` once for the batch: "Deliver <ID> <STEP-01…STEP-0n> in order per `<change folder>/design.md`; targeted tests after each subtask, the default verification at the end; report per subtask". One call builds the whole batch, so the rules and the code are read once.
   3. Run the default verification yourself and read the result. Red goes back to the implementer with the error, at most 2 rounds (from the second round with a hypothesis, `team-systematic-debugging`).
   4. Write `verify/<STEP>.md` for each subtask from the report (short), update `progress.md`, and commit the batch once as `feat(<ID>): <STEP-01…STEP-0n> <short title>` with one line `Subtask: <ID>/<STEP>` per subtask in the body.
4. **Independent review.** Ask `code-reviewer` once per batch (solo: one batch is the whole change; base: step 1). It checks the diff, every AC and section 7 row with logic against a test (or the evidence the design names), and runs the targeted tests. `CHANGES_REQUIRED`: fix the blocking items (team: send only those items to `implementer`, in the same session if your tool can resume a subagent), verify, commit `fix(<ID>): review`, and ask for a re-review of the fixed items only; at most 2 rounds. Ask `qa` once per batch only when the batch has a COMPLEX subtask or a UI change; otherwise the review covers acceptance.
   - **Stale documentation** found anywhere (a wrong path or name in a topic file or the PRD): fix it in the same commit. It is not a design revision and needs no approval.
   - `SPEC_CONFLICT` is only about behaviour, a contract or data: a new design revision, and a question to the user when behaviour changes.
5. If this session has grown long (several subtasks or review rounds behind you), stop after a commit and tell the user: "Next: new session, `tech-lead`, continue <ID>".
6. Push: `git push -u origin <change branch>`.

For a long change finish a phase, update `progress.md` and tell the user to continue in a new session (see Sessions in `.agents/docs/workflow.md`).

### 5. Pull request
Open the PR **with the normal commits** (no squash yet): reviewers need to see what changed after their comments. Fixes from PR review are plain commits `fix(<ID>): review <note>` pushed normally.

**Prepare for merge** is the last step and runs only when the PR is approved (an approving review, or the user says "prepare for merge"). Then, once, the change is **rebased on the default branch and squashed into one commit**:
1. `git fetch origin`, then `git rebase origin/<default branch>`. Resolve conflicts only where both sides are clear; otherwise `git rebase --abort`, stop and show the user the conflicting files. Run the default verification again after a rebase that changed anything.
2. Squash: `git reset --soft origin/<default branch>` then one `git commit` with subject `<KEY> <title>` (the change title, imperative) and a body of one line per subtask `<STEP>: <title>`, then the trailer lines `Subtask: <ID>/<STEP>` (one per subtask, so delivery state stays readable from git), then the attribution lines. Never fewer than one line per subtask and never an empty body.
3. Push with `git push --force-with-lease origin <change branch>`: the only force push you may run, always with the explicit branch, never on the default branch. A rejected lease means someone else pushed: stop, `git fetch`, tell the user and do not retry with `--force`.
4. Update the PR description: it ends with the section **Squash message** (the same subject and body) and the merge-ready checklist: up to date with the default branch (yes/no), verification green, review verdict, docs updated. The human merges (`workflow-rules`, "Squash merge"); the agent never does.

Before opening the PR, check `git log --format=%s <base>..HEAD`: every subject contains the tracker key (fix a missing one with `git commit --amend` only on the last unpushed commit; otherwise tell the user). Open the PR with the PR-create command from `workflow-rules` (head `<change branch>`, base the default branch), title `<KEY> <title>`, with a description: goal, subtasks with AC and evidence, verification result, review verdict (and QA when it ran), deviations from the design, links to `proposal.md` and `design.md`, and a section **Docs**: the documentation updated in this PR (feature line, roadmap status, group README row, topic files) or "none". If anything did not pass: open it as a draft and give the reason in the description. **You do not merge** and do not push to the default branch.

After the PR give the user the link and a 3–5 sentence summary.
