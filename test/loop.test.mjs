import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	coverageProblems,
	designProblems,
	loadChanges,
	proposalProblems,
	reportFormat,
	validate,
} from "../loop/loop.mjs";

const EDGE = `## Edge cases

| Subtask | E1 | E2 |
|---|---|---|
| STEP-01 | AC-2 | n/a: no list |
`;

const design = (lang) =>
	Array.from(
		{ length: 13 },
		(_, i) => `## ${i + 1}. ${lang === "pl" ? "Sekcja" : "Section"}\n\ntext\n`,
	).join("\n");

test("design sections are checked by number in any language", () => {
	assert.deepEqual(designProblems(design("en")), []);
	assert.deepEqual(designProblems(design("pl")), []);
	assert.ok(
		designProblems("## 1. Approach\n").includes("design.md: missing section 2"),
	);
	assert.ok(
		designProblems(`${design("en")}\n- open?`).includes(
			"design.md: section 13 has open questions",
		),
	);
	assert.ok(
		designProblems("# <ID> — <title>\n").some((p) =>
			p.includes("placeholders"),
		),
	);
});

test("proposal open questions in English and Polish", () => {
	assert.deepEqual(
		proposalProblems(`## Why\n\nx\n\n${EDGE}\n## Open questions\n\n`),
		[],
	);
	assert.deepEqual(
		proposalProblems(
			`## Dlaczego\n\nx\n\n${EDGE.replace("Edge cases", "Przypadki brzegowe")}\n## Otwarte pytania\n\n`,
		),
		[],
	);
	assert.ok(
		proposalProblems("## Open questions\n\n- what?\n").includes(
			"proposal.md: has open questions",
		),
	);
	assert.ok(
		proposalProblems("## Why\n").some((p) => p.includes("Open questions")),
	);
});

const change = {
	subtasks: [
		{
			id: "STEP-01",
			acceptanceCriteria: [{ id: "AC-1" }, { id: "AC-2" }],
		},
		{ id: "STEP-02", acceptanceCriteria: [{ id: "AC-1" }] },
	],
};
const sections = (s7, s9) =>
	Array.from({ length: 13 }, (_, i) => {
		const n = i + 1;
		const body = n === 7 ? s7 : n === 9 ? s9 : "text";
		return `## ${n}. Section\n\n${body}\n`;
	}).join("\n");
const S7 = `| Situation | Category | Error | UI | Test |
|---|---|---|---|---|
| room name taken | E5 | Conflict | message | §9 rooms.test.ts name taken |
| storage down | E6 | Unavailable | retry banner | not tested: covered by platform |`;
const S9 = `| Covers | Test file | Case | Type |
|---|---|---|---|
| STEP-01 AC-1 | rooms.test.ts | creates | integration |
| STEP-01 AC-2 | rooms.test.ts | rejects | integration |
| STEP-02 AC-1 | room-form.test.tsx | shows | component |
| §7 room name taken | rooms.test.ts | name taken | integration |`;

test("approve: every AC needs a section 9 row and every section 7 row a test", () => {
	assert.deepEqual(coverageProblems(sections(S7, S9), change), []);
	const missingAc = coverageProblems(
		sections(S7, S9.replace("| STEP-01 AC-2 |", "| STEP-01 AC-9 |")),
		change,
	);
	assert.ok(missingAc.some((p) => p.includes("no test row for STEP-01 AC-2")));
	// AC-1 of STEP-02 is not satisfied by STEP-01 AC-1
	const wrongSt = coverageProblems(
		sections(S7, S9.replace("| STEP-02 AC-1 |", "| STEP-01 AC-10 |")),
		change,
	);
	assert.ok(wrongSt.some((p) => p.includes("STEP-02 AC-1")));
	assert.ok(!wrongSt.some((p) => p.includes("STEP-01 AC-1")));
	const noTest = coverageProblems(
		sections(S7.replace("not tested: covered by platform", ""), S9),
		change,
	);
	assert.ok(noTest.some((p) => p.includes("row 2 (storage down) has no test")));
	const empty = coverageProblems(sections("intro only", S9), change);
	assert.ok(empty.some((p) => p.includes("lists no edge cases")));
	assert.deepEqual(
		coverageProblems(
			sections("No edge cases: static text change.", S9),
			change,
		),
		[],
	);
	// one subtask: a bare AC id is enough
	assert.deepEqual(
		coverageProblems(
			sections(S7, "| AC-1 | a | b | unit |\n| AC-2 | a | c | unit |"),
			{
				subtasks: [change.subtasks[0]],
			},
		),
		[],
	);
	// designProblems runs the coverage only when the change is given
	assert.deepEqual(designProblems(sections("intro only", "")), []);
});

test("proposal needs a complete edge-case table", () => {
	assert.ok(
		proposalProblems("## Why\n\nx\n\n## Open questions\n\n").some((p) =>
			p.includes('missing section "Edge cases"'),
		),
	);
	assert.ok(
		proposalProblems(
			`${EDGE.replace("n/a: no list", "")}\n## Open questions\n\n`,
		).some((p) => p.includes("edge cases of STEP-01 are incomplete")),
	);
});

test("the loop prompt takes the report format from spec-format.md", () => {
	const root = mkdtempSync(join(tmpdir(), "aw-rf-"));
	mkdirSync(join(root, ".agents", "docs"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "docs", "spec-format.md"),
		"# x\n\n## Delivery report `verify/<STEP>.md`\n\nThe first line is STATUS.\n- **Docs:** files\n",
	);
	const f = reportFormat(root);
	assert.match(f, /The first line is STATUS/);
	assert.match(f, /\*\*Docs:\*\*/);
});

test("a change approved by hand (no fingerprint) validates with a warning, not an error", () => {
	const root = mkdtempSync(join(tmpdir(), "aw-hand-"));
	const dir = join(root, "openspec", "changes", "demo-1");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "change.json"),
		JSON.stringify({
			id: "demo-1",
			title: "Demo",
			status: "approved",
			approvedAt: "2026-11-17",
			approvalHash: "",
			openQuestions: [],
			subtasks: [
				{
					id: "STEP-01",
					title: "One",
					goal: "g",
					size: "S",
					risk: "QUICK",
					dependsOn: [],
					acceptanceCriteria: [
						// biome-ignore lint/suspicious/noThenProperty: field of the change.json schema
						{ id: "AC-1", given: "a", when: "b", then: "c" },
					],
				},
			],
		}),
	);
	writeFileSync(join(dir, "proposal.md"), "# Demo\n");
	const { errors, warnings } = validate(loadChanges(root), root);
	assert.deepEqual(errors, []);
	assert.ok(warnings.some((w) => w.includes("approved by hand")));
});
