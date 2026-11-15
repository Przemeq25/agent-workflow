---
name: team-verification
description: Choose targeted checks and judge evidence before claiming done, fixed or PASS. Use when planning checks, accepting work, reviewing results and after fixes; respect no-tests and the role's permissions.
---

# Evidence, not claims

1. Name the claim and the AC that needs evidence.
2. Pick the right method: inspection, unit, component, integration, end-to-end, visual or static check. Not every change needs every method.
3. Check the owner, revision and environment of the evidence. Read the actual output and exit code, not a statement that it passed.
4. Reuse valid evidence from the same state; do not repeat checks without reason. After a change, an integration or a failure, rerun the affected scope. Do not extrapolate a targeted PASS to the whole repository.
5. A role that may run commands runs the project's commands from `workflow-rules` and reads the result. A read-only reviewer judges the evidence or asks for what is missing.
6. Keep mocks apart from the real test database described in `testing-rules`, typecheck apart from running the app, component tests apart from end-to-end tests.
7. Before PASS, compare the result with the expectation and give the evidence. Report FAIL or NOT VERIFIED with the reason when a check was not run or is stale.

An active *no-tests* marker disables all verification commands of the change. Do not work around it through another agent or tool. Record what was skipped; inspection does not pretend to be a run.
Do not force TDD, the full suite of a monorepo, or a rerun only for a fresher date. Do not disable mandatory CI rules and do not hide failures that already exist on the base.
