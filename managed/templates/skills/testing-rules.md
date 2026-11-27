---
name: testing-rules
description: Test conventions of this repository - test types, locations, databases, what needs a test, what not to mock. Load before writing or judging tests.
---

# Testing rules

- Types: <fill> (unit, component, integration, end-to-end) with an example file each.
- Locations: <fill>.
- Data: <fill> (isolated test database or fixtures; what is never mocked).
- Test data must separate the right code from a simpler wrong one (both sides of a boundary, locale-sensitive strings, every escaping case); the reviewer blocks tests a naive implementation would also pass.
- **Test budget (tests cost tokens: few, and only for the most important logic).** Test only logic that can be wrong in a way the user or the data would feel: business rules and branches, calculations and rounding, permissions and ownership, state transitions, data mapping with edge cases, parsing and escaping. One test per AC with logic, a second case only for a boundary or an error branch that changes what the user gets. Never test getters, wiring, pass-through code, types, config, markup or class names, simple presentational components or third-party behaviour, and never prove the same behaviour at two levels (unit and integration and e2e): take the lowest level that proves it.
- **Where tests go:** a test lives in the test file named after its source file (`rooms.ts` → `rooms.test.ts`, following Locations). Do not create test files under other names, do not add tests to a file that belongs to another module, and give a source file without logic no test file at all.
- **No test needed** (the evidence is named instead): a text, style or layout-only change (evidence: the visual check or `qa` UI check, or "visual only"); config, docs and dependency bumps (evidence: build and type check); code moves without behaviour change (evidence: the existing tests still pass). Do not write tests that only assert markup, class names or that a component renders. <fill: project-specific additions> 
- Never weaken assertions or add lint/type suppressions to pass. Report flaky tests instead of retrying until green.
- End-to-end tests only when the test plan requires them and the environment allows it; otherwise NOT VERIFIED with the reason.
- QA may edit only test files: <fill> (the patterns; keep them in sync with `guard.testFiles` in `.agents/workflow.json`).
