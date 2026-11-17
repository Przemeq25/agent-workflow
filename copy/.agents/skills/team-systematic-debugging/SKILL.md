---
name: team-systematic-debugging
description: Find the cause of a bug, a failed check or unexpected behaviour before fixing it. Use after a real defect; do not run it as a step of every change.
---

# Debugging with a hypothesis

1. Establish the change ID, revision, symptom, environment, constraints and available evidence.
2. Read the full relevant message and the related code. Separate an application error from environment, permissions and network.
3. When allowed, reproduce the problem by the shortest adequate path. Compare with a working case and with the last change.
4. Write one testable hypothesis: cause, evidence, predicted result and the smallest experiment.
5. Change one relevant factor at a time; do not raise timeouts or add workarounds without a reason.
6. The implementer fixes production code; other roles report the cause to it through the coordinator. Add a regression test when it fits.
7. Confirm that the symptom and the affected risks are fixed, following `team-verification`.

With *no-tests* active, run no commands or experiments and do not work around it through other tools. You may analyse supplied logs and code; an unexecuted hypothesis stays unconfirmed.
When evidence is missing, ask for the concrete gap instead of guessing. After two unsuccessful rounds, go back to the cause and report a blocker.
Do not widen the scope, do not revert other people's changes and do not run destructive operations.
