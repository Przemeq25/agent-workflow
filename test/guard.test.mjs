import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const GUARD = resolve(
	fileURLToPath(import.meta.url),
	"../../managed/hooks/guard.mjs",
);

function guard(dir, role, tool, input) {
	const r = spawnSync("node", role ? [GUARD, "--role", role] : [GUARD], {
		input: JSON.stringify({ tool_name: tool, tool_input: input }),
		encoding: "utf8",
		env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
	});
	return r.status;
}
const bash = (dir, role, command) => guard(dir, role, "Bash", { command });
const edit = (dir, role, file_path) => guard(dir, role, "Edit", { file_path });

function project(config) {
	const dir = mkdtempSync(join(tmpdir(), "aw-guard-"));
	if (config) {
		mkdirSync(join(dir, ".agents"), { recursive: true });
		writeFileSync(join(dir, ".agents/workflow.json"), JSON.stringify(config));
	}
	return dir;
}

test("common prohibitions", () => {
	const d = project();
	assert.equal(bash(d, null, "git push origin main"), 2);
	assert.equal(bash(d, null, "git push origin master"), 2);
	assert.equal(bash(d, null, "git push --force origin task/x"), 2);
	assert.equal(bash(d, null, "git push -f origin PROJ-1-x"), 2);
	assert.equal(bash(d, null, "git push origin +PROJ-1-x"), 2);
	assert.equal(bash(d, null, "git push origin +main"), 2);
	assert.equal(bash(d, null, "git push --force-with-lease origin main"), 2);
	assert.equal(bash(d, null, "git push --force-with-lease"), 2);
	assert.equal(bash(d, null, "git push --force-with-lease origin PROJ-1-x"), 0);
	assert.equal(bash(d, null, "git push"), 2);
	assert.equal(bash(d, null, "git push -u origin task/x"), 0);
	assert.equal(bash(d, null, "gh pr merge 3"), 2);
	assert.equal(bash(d, null, "gh api -X POST repos/a/b/pulls"), 2);
	assert.equal(bash(d, null, "gh api repos/a/b/issues -f title=x"), 2);
	assert.equal(bash(d, null, "gh api repos/a/b/pulls/3/comments"), 0);
	assert.equal(bash(d, null, "gh pr comment 3 --body-file /tmp/x"), 0);
	assert.equal(bash(d, null, "vercel deploy"), 0, "no project rule, no block");
});

test("protected files", () => {
	const d = project();
	for (const p of [
		"/r/.agents/agents/tech-lead.md",
		"/r/.agents/hooks/guard.mjs",
		"/r/.agents/workflow.json",
		"/r/.agents/workflow.local.json",
		"/r/.agents/skills/team-verification/SKILL.md",
		"/r/.claude/agents/qa.md",
		"/r/.claude/settings.json",
		"/r/.codex/agents/qa.toml",
		"/r/AGENTS.md",
		"/r/CLAUDE.md",
		"/r/.env",
	])
		assert.equal(edit(d, null, p), 2, p);
	assert.equal(edit(d, null, "/r/.env.example"), 0);
	assert.equal(
		edit(d, null, "/r/.agents/skills/engineering-rules/SKILL.md"),
		0,
	);
	assert.equal(bash(d, null, "echo x > .agents/workflow.json"), 2);
	assert.equal(bash(d, null, "sed -i s/a/b/ AGENTS.md"), 2);
});

test("roles", () => {
	const d = project();
	assert.equal(bash(d, "no-commit", "git commit -m x"), 2);
	assert.equal(bash(d, "no-commit", "pnpm add zod"), 2);
	assert.equal(bash(d, "no-commit", "npm run test"), 0);
	assert.equal(edit(d, "qa", "/r/src/a.test.tsx"), 0);
	assert.equal(edit(d, "qa", "/r/src/a.spec.py"), 2);
	assert.equal(edit(d, "qa", "/r/tests/test_a.py"), 0);
	assert.equal(edit(d, "qa", "/r/src/a.tsx"), 2);
	assert.equal(edit(d, "read-only", "/r/src/a.tsx"), 2);
	assert.equal(bash(d, "read-only", "git diff abc123 --stat"), 0);
	assert.equal(bash(d, "read-only", "npm run test"), 2);
	assert.equal(edit(d, "prd", "/r/context/foundation/prd.md"), 0);
	assert.equal(edit(d, "prd", "/r/context/engineering.md"), 2);
	assert.equal(edit(d, "prd-tech", "/r/context/engineering.md"), 2);
	assert.equal(edit(d, "prd-tech", "/r/context/foundation/tech-notes.md"), 0);
	assert.equal(
		edit(d, "prd-tech", "/r/.agents/skills/testing-rules/SKILL.md"),
		0,
	);
	assert.equal(edit(d, "base", "/r/.agents/commands/prd.md"), 2);
	assert.equal(edit(d, "base", "/r/.kilo/commands/prd.md"), 2);
});

test("project config from .agents/workflow.json", () => {
	const d = project({
		guard: {
			defaultBranch: "develop",
			testFiles: "\\.test\\.ts$",
			forbiddenCommands: [["\\bvercel\\b", "a human deploys"]],
		},
	});
	assert.equal(bash(d, null, "git push origin develop"), 2);
	assert.equal(bash(d, null, "vercel deploy"), 2);
	assert.equal(edit(d, "qa", "/r/tests/x.py"), 2);
	assert.equal(edit(d, "qa", "/r/src/x.test.ts"), 0);
});

test("invalid config blocks everything", () => {
	const d = project();
	mkdirSync(join(d, ".agents"), { recursive: true });
	writeFileSync(join(d, ".agents/workflow.json"), "{bad");
	assert.equal(bash(d, null, "ls"), 2);
});
