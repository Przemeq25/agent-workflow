import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig, readRoles, scaffold, syncProject } from "../lib/sync.mjs";

const PKG = resolve(fileURLToPath(import.meta.url), "../..");
const CLI = join(PKG, "bin", "agent-workflow.mjs");

function project() {
	const dir = mkdtempSync(join(tmpdir(), "aw-"));
	spawnSync("git", ["init", "-q"], { cwd: dir });
	writeFileSync(join(dir, "package.json"), '{ "name": "demo" }\n');
	return dir;
}
const run = (dir, ...args) =>
	spawnSync("node", [CLI, ...args], { cwd: dir, encoding: "utf8" });
const read = (dir, rel) => readFileSync(join(dir, rel), "utf8");

test("init creates the project skeleton, managed files and claude adapters", () => {
	const dir = project();
	const r = run(dir, "init");
	assert.equal(r.status, 0, r.stderr);
	for (const rel of [
		"AGENTS.md",
		".agents/workflow.json",
		".agents/agents/tech-lead.md",
		".agents/skills/team-verification/SKILL.md",
		".agents/skills/workflow-rules/SKILL.md",
		".agents/hooks/guard.mjs",
		".agents/templates/design.md",
		".agents/docs/work-format.md",
		".agents/.managed.json",
		".claude/agents/implementer.md",
		".claude/settings.json",
		"CLAUDE.md",
	])
		assert.ok(existsSync(join(dir, rel)), rel);
	assert.ok(lstatSync(join(dir, ".claude/skills")).isSymbolicLink());
	assert.ok(!existsSync(join(dir, ".codex")));
	assert.match(read(dir, "CLAUDE.md"), /^@AGENTS\.md$/m);
	assert.match(read(dir, ".gitignore"), /\/\.claude\/agents\//);
	assert.match(read(dir, "package.json"), /postinstall/);
	const v = run(dir, "validate");
	assert.equal(v.status, 0, v.stdout + v.stderr);
	assert.match(v.stdout, /still has TODOs/);
});

test("claude adapter maps tier and access", () => {
	const dir = project();
	run(dir, "init");
	const impl = read(dir, ".claude/agents/implementer.md");
	assert.match(impl, /model: sonnet/);
	assert.match(impl, /guard\.mjs" --role no-commit/);
	const rev = read(dir, ".claude/agents/code-reviewer.md");
	assert.match(rev, /tools: Read, Glob, Grep, Bash/);
	assert.match(rev, /--role read-only/);
	const tl = read(dir, ".claude/agents/tech-lead.md");
	assert.doesNotMatch(tl, /hooks:/);
	assert.equal(
		JSON.parse(read(dir, ".claude/settings.json")).agent,
		"tech-lead",
	);
});

test("developer chooses tools locally; removed tools lose their adapters", () => {
	const dir = project();
	run(dir, "init");
	writeFileSync(
		join(dir, ".agents/workflow.local.json"),
		'{ "tools": ["codex", "opencode"], "guard": { "defaultBranch": "x" } }',
	);
	const cfg = loadConfig(dir);
	assert.deepEqual(cfg.tools, ["codex", "opencode"]);
	assert.equal(
		cfg.guard.defaultBranch,
		"main",
		"local file cannot weaken the guard",
	);
	syncProject(dir, { quiet: true });
	assert.ok(!existsSync(join(dir, ".claude/agents/implementer.md")));
	assert.ok(!existsSync(join(dir, "CLAUDE.md")));
	assert.ok(!existsSync(join(dir, ".claude/skills")));
	assert.match(
		read(dir, ".codex/agents/code-reviewer.toml"),
		/sandbox_mode = "read-only"/,
	);
	assert.match(read(dir, ".opencode/agents/qa.md"), /"git push\*": deny/);
	assert.match(read(dir, ".opencode/agents/tech-lead.md"), /mode: all/);
});

test("AGENT_WORKFLOW_TOOLS overrides the config", () => {
	const dir = project();
	run(dir, "init");
	process.env.AGENT_WORKFLOW_TOOLS = "codex";
	try {
		assert.deepEqual(loadConfig(dir).tools, ["codex"]);
	} finally {
		delete process.env.AGENT_WORKFLOW_TOOLS;
	}
});

test("a locally edited managed file is kept, --force replaces it, --check reports drift", () => {
	const dir = project();
	run(dir, "init");
	writeFileSync(join(dir, ".agents/agents/qa.md"), "hacked\n");
	const r = syncProject(dir, { quiet: true });
	assert.equal(read(dir, ".agents/agents/qa.md"), "hacked\n");
	assert.ok(r.conflicts.some((c) => c.includes("qa.md")));
	assert.equal(run(dir, "sync", "--check").status, 1);
	assert.equal(run(dir, "validate").status, 1);
	syncProject(dir, { quiet: true, force: true });
	assert.notEqual(read(dir, ".agents/agents/qa.md"), "hacked\n");
	assert.equal(run(dir, "sync", "--check").status, 0);
});

test("an existing hand-written file is never overwritten without --force", () => {
	const dir = project();
	writeFileSync(join(dir, "AGENTS.md"), "my own\n");
	writeFileSync(join(dir, "CLAUDE.md"), "my claude\n");
	run(dir, "init");
	assert.equal(read(dir, "AGENTS.md"), "my own\n");
	assert.equal(read(dir, "CLAUDE.md"), "my claude\n");
});

test("project-specific roles are adapted too, and init never overwrites project skills", () => {
	const dir = project();
	run(dir, "init");
	writeFileSync(join(dir, ".agents/skills/business-rules/SKILL.md"), "mine\n");
	writeFileSync(
		join(dir, ".agents/agents/designer.md"),
		"---\nname: designer\ndescription: Project role.\ntier: standard\naccess: read-only\nmode: subagent\n---\n\nBody of the project role.\n",
	);
	scaffold(dir);
	assert.equal(read(dir, ".agents/skills/business-rules/SKILL.md"), "mine\n");
	syncProject(dir, { quiet: true });
	assert.ok(readRoles(dir).some((r) => r.name === "designer"));
	assert.match(
		read(dir, ".claude/agents/designer.md"),
		/Body of the project role/,
	);
});

test("sync is idempotent", () => {
	const dir = project();
	run(dir, "init");
	const r = syncProject(dir, { quiet: true });
	assert.deepEqual(r.written, []);
	assert.deepEqual(r.conflicts, []);
});
