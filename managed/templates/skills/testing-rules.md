---
name: testing-rules
description: Test conventions of this repository - test types, locations, databases, what needs a test, what not to mock. Load before writing or judging tests.
---

# Testing rules

- Types: <fill> (unit, component, integration, end-to-end) with an example file each.
- Locations: <fill>.
- Data: <fill> (isolated test database or fixtures; what is never mocked).
- Every AC gets at least one test that checks Given/When/Then behaviour. Every row of design section 7 gets a test unless the row says `not tested: <reason>`.
- Never weaken assertions or add lint/type suppressions to pass. Report flaky tests instead of retrying until green.
- End-to-end tests only when the test plan requires them and the environment allows it; otherwise NOT VERIFIED with the reason.
- QA may edit only test files: <fill> (the patterns; keep them in sync with `guard.testFiles` in `.agents/workflow.json`).
