---
name: team-task-handoffs
description: Prepare or receive a short brief, result or review package for a subagent. Use when delegating, resuming or changing scope, to keep context small and the change ID and revision consistent.
---

# Task hand-off

The coordinator sends a brief: change ID and subtask, design path (`spec/changes/<ID>/design.md`) and revision, goal, files it may write and what is forbidden, contracts and dependencies, the base commit or worktree, who owns which check, and the mode (standard or no-tests).
Pass paths to the current documents and the differences that matter, not the whole history or the reports of all earlier subtasks.
Keep a short progress log. After losing context, do not redo finished work: check the log and the code state first.
The receiver reads the files it needs; it does not scan the whole repository without a reason and does not start other agents.
The receiver confirms change ID, revision and ownership. A missing essential input is reported as a blocker.
Distinguish a request that was sent from one the receiver has accepted. Do not start a replacement on paths the previous agent is still editing.
Result: status, changed files, AC, revision, evidence, limitations and questions. Keep long reports in a file; a read-only role returns text to the coordinator (tech-lead).
For review, pass the scope and base, the actual diff, the requirements and available check results, never only the implementer's summary.
Do not create commits just to produce a diff. A plan change invalidates the affected assignments and evidence; other subtasks keep their context.
