import assert from "node:assert/strict";
import { test } from "node:test";
import { designProblems, proposalProblems } from "../loop/loop.mjs";

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
		proposalProblems("## Why\n\nx\n\n## Open questions\n\n"),
		[],
	);
	assert.deepEqual(
		proposalProblems("## Dlaczego\n\nx\n\n## Otwarte pytania\n\n"),
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
