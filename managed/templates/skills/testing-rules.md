---
name: testing-rules
description: Test conventions of this repository - test types, locations, databases, what needs a test, what not to mock. Load before writing or judging tests.
---

# Testing rules

- Types: <fill> (unit, component, integration, end-to-end) with an example file each.
- Locations: <fill>.
- Data: <fill> (isolated test database or fixtures; what is never mocked).
- Test data must separate the right code from a simpler wrong one (both sides of a boundary, locale-sensitive strings, every escaping case); the reviewer blocks tests a naive implementation would also pass.
- Every AC with logic gets at least one test that checks Given/When/Then behaviour.
- **No test needed** (the evidence is named instead): a text, style or layout-only change (evidence: the visual check or `qa` UI check, or "visual only"); config, docs and dependency bumps (evidence: build and type check); code moves without behaviour change (evidence: the existing tests still pass). Do not write tests that only assert markup, class names or that a component renders. <fill: project-specific additions> Every row of design section 7 gets a test unless the row says `not tested: <reason>`.
- Never weaken assertions or add lint/type suppressions to pass. Report flaky tests instead of retrying until green.
- End-to-end tests only when the test plan requires them and the environment allows it; otherwise NOT VERIFIED with the reason.
- QA may edit only test files: <fill> (the patterns; keep them in sync with `guard.testFiles` in `.agents/workflow.json`).
