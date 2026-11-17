import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
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

test("init without a choice creates only .agents/ and AGENTS.md, no tool adapters", () => {
	const dir = project();
	const r = run(dir, "init");
	assert.equal(r.status, 0, r.stderr);
	assert.ok(existsSync(join(dir, "AGENTS.md")));
	assert.ok(existsSync(join(dir, ".agents/agents/tech-lead.md")));
	for (const rel of [".claude", "CLAUDE.md", ".codex", ".opencode"])
		assert.ok(!existsSync(join(dir, rel)), rel);
	assert.deepEqual(JSON.parse(read(dir, ".agents/workflow.json")).tools, []);
	assert.match(r.stdout, /no tool adapters/);
	// postinstall after a plain install generates nothing either
	const p = spawnSync("node", [join(PKG, "lib", "postinstall.mjs")], {
		env: { ...process.env, INIT_CWD: dir },
		encoding: "utf8",
	});
	assert.equal(p.status, 0, p.stderr);
	assert.ok(!existsSync(join(dir, ".claude")));
});

test("init creates spec/, and a project with the old work/ still validates with a hint", () => {
	const dir = project();
	run(dir, "init");
	assert.ok(existsSync(join(dir, "spec/changes/.gitkeep")));
	assert.ok(!existsSync(join(dir, "work")));
	assert.match(read(dir, "AGENTS.md"), /spec\/changes\/<ID>\//);
	const legacy = project();
	run(legacy, "init");
	spawnSync("git", ["mv", "spec", "work"], { cwd: legacy });
	spawnSync("mv", ["spec", "work"], { cwd: legacy });
	const v = run(legacy, "validate");
	assert.match(v.stdout, /git mv work spec/);
	assert.match(v.stdout, /work\/changes valid/);
});

test("cheap helpers: scout and clerk run on the low tier with their own models", () => {
	const dir = project();
	run(
		dir,
		"init",
		"--yes",
		"--tools",
		"claude,codex",
		"--models",
		"claude.low=haiku,codex.low=gpt-5.5-mini",
	);
	const scout = read(dir, ".claude/agents/scout.md");
	assert.match(scout, /model: haiku/);
	assert.match(scout, /tools: Read, Glob, Grep, Bash/);
	assert.match(scout, /--role read-only/);
	const clerk = read(dir, ".claude/agents/clerk.md");
	assert.match(clerk, /model: haiku/);
	assert.match(clerk, /--role no-commit/);
	assert.match(
		read(dir, ".codex/agents/scout.toml"),
		/model = "gpt-5\.5-mini"/,
	);
	assert.match(
		read(dir, ".codex/agents/scout.toml"),
		/sandbox_mode = "read-only"/,
	);
	assert.match(
		read(dir, ".codex/agents/clerk.toml"),
		/model = "gpt-5\.5-mini"/,
	);
	// without a low model the tool default is used, never a stronger one by accident
	const bare = project();
	run(bare, "init", "--yes", "--tools", "codex");
	assert.doesNotMatch(read(bare, ".codex/agents/scout.toml"), /model =/);
	assert.match(read(dir, "AGENTS.md"), /### Cheap helpers/);
	assert.match(read(dir, ".agents/agents/tech-lead.md"), /ask `scout`/);
});

test("each tool's roles say how to ask the user; kilo agents allow reads, question and task", () => {
	const dir = project();
	const r = run(
		dir,
		"init",
		"--yes",
		"--tools",
		"claude,opencode,kilo,codex",
		"--models",
		"kilo.high=anthropic/claude-opus-5-5,kilo.low=anthropic/claude-haiku-5-5",
	);
	assert.equal(r.status, 0, r.stderr);
	assert.match(read(dir, ".claude/agents/tech-lead.md"), /`AskUserQuestion`/);
	assert.match(
		read(dir, ".opencode/agents/pm.md"),
		/through the `question` tool/,
	);
	assert.match(read(dir, ".codex/agents/tech-lead.toml"), /request_user_input/);
	const tl = read(dir, ".kilo/agents/tech-lead.md");
	assert.match(tl, /model: anthropic\/claude-opus-5-5/);
	assert.match(tl, /question: allow/);
	assert.match(tl, /task: allow/);
	assert.match(tl, /read: allow/);
	assert.match(tl, /## Asking the user \(kilo\)/);
	const scout = read(dir, ".kilo/agents/scout.md");
	assert.match(scout, /model: anthropic\/claude-haiku-5-5/);
	assert.match(scout, /question: deny/);
	assert.match(scout, /task: deny/);
	assert.match(scout, /edit: deny/);
	assert.match(scout, /cannot ask the user/);
	assert.match(read(dir, ".kilo/agents/autopilot.md"), /cannot ask the user/);
	assert.match(read(dir, "AGENTS.md"), /## Asking the user/);
	assert.match(read(dir, ".gitignore"), /\/\.kilo\/agents\//);
	// kilo cannot run the loop: the runner is the first tool that can
	assert.equal(
		JSON.parse(read(dir, ".agents/workflow.json")).loop.runner,
		undefined,
	);
	const k = project();
	run(k, "init", "--yes", "--tools", "kilo");
	assert.ok(existsSync(join(k, ".kilo/agents/pm.md")));
	assert.ok(!existsSync(join(k, ".opencode")));
});

test("postinstall does nothing before init", () => {
	const dir = project();
	const p = spawnSync("node", [join(PKG, "lib", "postinstall.mjs")], {
		env: { ...process.env, INIT_CWD: dir },
		encoding: "utf8",
	});
	assert.equal(p.status, 0, p.stderr);
	assert.ok(!existsSync(join(dir, ".agents")));
	assert.ok(!existsSync(join(dir, "AGENTS.md")));
});

test("init --tools claude creates the project skeleton, managed files and claude adapters", () => {
	const dir = project();
	const r = run(dir, "init", "--yes", "--tools", "claude");
	assert.equal(r.status, 0, r.stderr);
	for (const rel of [
		"AGENTS.md",
		".agents/workflow.json",
		".agents/agents/tech-lead.md",
		".agents/skills/team-verification/SKILL.md",
		".agents/commands/prd.md",
		".agents/templates/skills/workflow-rules.md",
		".agents/hooks/guard.mjs",
		".agents/templates/design.md",
		".agents/docs/spec-format.md",
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
	assert.match(v.stdout, /project not set up: missing workflow-rules/);
	assert.match(v.stdout, /Run \/prd/);
	assert.match(r.stdout, /next: run \/prd/);
	// no rule skills are scaffolded any more: /prd writes them
	assert.ok(!existsSync(join(dir, ".agents/skills/workflow-rules")));
	for (const old of ["prd", "prd-tech", "prd-explore", "prd-tech-explore"])
		assert.ok(!existsSync(join(dir, `.agents/agents/${old}.md`)), old);
	assert.ok(!existsSync(join(dir, ".agents/skills/team-writing-plans")));
});

test("/prd becomes a command in claude, opencode and kilo and an explicit-only skill in codex", () => {
	const dir = project();
	const r = run(
		dir,
		"init",
		"--yes",
		"--tools",
		"claude,opencode,kilo,codex",
		"--models",
		"claude.high=opus,opencode.high=anthropic/claude-opus-5-5,kilo.high=openrouter/x-high",
	);
	assert.equal(r.status, 0, r.stderr);
	const cc = read(dir, ".claude/commands/prd.md");
	assert.match(cc, /^model: opus$/m);
	assert.match(cc, /disable-model-invocation: true/);
	assert.match(
		cc,
		/argument-hint: "\[all\|product\|tech\|design\|sync\] \[what changed\]"/,
	);
	assert.match(cc, /`\$ARGUMENTS`/);
	assert.match(cc, /`AskUserQuestion`/);
	const oc = read(dir, ".opencode/commands/prd.md");
	assert.match(oc, /^model: anthropic\/claude-opus-5-5$/m);
	assert.match(oc, /through the `question` tool/);
	assert.match(
		read(dir, ".kilo/commands/prd.md"),
		/^model: openrouter\/x-high$/m,
	);
	const cx = read(dir, ".agents/skills/prd/SKILL.md");
	assert.match(cx, /^name: prd$/m);
	assert.match(cx, /Run only when the user invokes \$prd/);
	assert.match(cx, /the text the user wrote after `\$prd`/);
	assert.doesNotMatch(cx, /\$ARGUMENTS/);
	assert.match(
		read(dir, ".agents/skills/prd/agents/openai.yaml"),
		/allow_implicit_invocation: false/,
	);
	assert.match(read(dir, ".gitignore"), /\/\.agents\/skills\/prd\//);
	assert.match(read(dir, ".gitignore"), /\/\.claude\/commands\//);
	// the generated Codex skill is not a project skill: no routing-table error
	const v = run(dir, "validate");
	assert.equal(v.status, 0, v.stdout + v.stderr);
	assert.doesNotMatch(
		v.stdout,
		/skill prd: missing from the skill routing table/,
	);
	// dropping codex removes its skill folder completely
	run(dir, "init", "--yes", "--tools", "claude");
	assert.ok(!existsSync(join(dir, ".agents/skills/prd")));
	assert.ok(!existsSync(join(dir, ".opencode")));
	assert.ok(existsSync(join(dir, ".claude/commands/prd.md")));
});

test("a project with written rule skills validates without the setup warning", () => {
	const dir = project();
	run(dir, "init", "--yes", "--tools", "claude");
	for (const name of [
		"business-rules",
		"engineering-rules",
		"review-rules",
		"testing-rules",
		"workflow-rules",
	]) {
		mkdirSync(join(dir, ".agents/skills", name), { recursive: true });
		const tpl = read(dir, `.agents/templates/skills/${name}.md`);
		writeFileSync(
			join(dir, ".agents/skills", name, "SKILL.md"),
			tpl.replaceAll("<fill>", "filled"),
		);
	}
	const v = run(dir, "validate");
	assert.equal(v.status, 0, v.stdout + v.stderr);
	assert.doesNotMatch(v.stdout, /project not set up/);
	assert.doesNotMatch(v.stdout, /routing table/);
});

test("init saves chosen models per tier, locally when asked, and the loop runner", () => {
	const dir = project();
	run(dir, "init");
	const r = run(
		dir,
		"init",
		"--yes",
		"--local",
		"--tools",
		"codex,claude",
		"--models",
		"codex.high=gpt-5.5,codex.low=gpt-5.5-mini,claude.high=opus",
		"--runner",
		"codex",
	);
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(JSON.parse(read(dir, ".agents/workflow.json")).tools, []);
	const local = JSON.parse(read(dir, ".agents/workflow.local.json"));
	assert.deepEqual(local.tools, ["codex", "claude"]);
	assert.equal(local.loop.runner, "codex");
	assert.deepEqual(local.models.claude, {
		high: "opus",
		standard: "sonnet",
		low: "haiku",
	});
	assert.match(read(dir, ".codex/agents/tech-lead.toml"), /model = "gpt-5\.5"/);
	assert.doesNotMatch(read(dir, ".codex/agents/implementer.toml"), /model =/);
	assert.match(read(dir, ".claude/agents/pm.md"), /model: opus/);
	assert.match(read(dir, ".gitignore"), /workflow\.local\.json/);
});

test("init warns when the developer's local file overrides the project choice", () => {
	const dir = project();
	run(dir, "init", "--yes", "--local", "--tools", "codex");
	const r = run(dir, "init", "--yes", "--tools", "none");
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /workflow\.local\.json overrides this choice/);
	assert.ok(existsSync(join(dir, ".codex/agents/pm.toml")));
});

test("old tier name strong still maps to high", () => {
	const dir = project();
	run(dir, "init");
	writeFileSync(
		join(dir, ".agents/workflow.json"),
		'{ "tools": ["claude"], "models": { "claude": { "strong": "opus-old" } } }',
	);
	writeFileSync(
		join(dir, ".agents/agents/legacy.md"),
		"---\nname: legacy\ndescription: Old role.\ntier: strong\n---\n\nBody.\n",
	);
	syncProject(dir, { quiet: true });
	assert.match(read(dir, ".claude/agents/legacy.md"), /model: opus-old/);
	assert.match(read(dir, ".claude/agents/tech-lead.md"), /model: opus-old/);
});

test("claude adapter maps tier and access", () => {
	const dir = project();
	run(dir, "init", "--yes", "--tools", "claude");
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
	run(dir, "init", "--yes", "--tools", "claude");
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
	assert.ok(!existsSync(join(dir, ".claude")), "empty .claude/ is removed");
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
	run(dir, "init", "--yes", "--tools", "claude");
	assert.equal(read(dir, "AGENTS.md"), "my own\n");
	assert.equal(read(dir, "CLAUDE.md"), "my claude\n");
});

test("project-specific roles are adapted too, and init never overwrites project skills", () => {
	const dir = project();
	run(dir, "init", "--yes", "--tools", "claude");
	mkdirSync(join(dir, ".agents/skills/business-rules"), { recursive: true });
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

test("a managed file the package dropped is removed with its empty folder", () => {
	const dir = project();
	run(dir, "init", "--yes");
	const manifest = JSON.parse(read(dir, ".agents/.managed.json"));
	const rel = ".agents/skills/team-old/SKILL.md";
	mkdirSync(join(dir, ".agents/skills/team-old"), { recursive: true });
	writeFileSync(join(dir, rel), "old\n");
	manifest.files[rel] = createHash("sha256")
		.update("old\n")
		.digest("hex")
		.slice(0, 16);
	writeFileSync(join(dir, ".agents/.managed.json"), JSON.stringify(manifest));
	const r = syncProject(dir, { quiet: true });
	assert.ok(r.removed.includes(rel));
	assert.ok(!existsSync(join(dir, ".agents/skills/team-old")));
	assert.ok(existsSync(join(dir, ".agents/skills")));
});

test("sync is idempotent", () => {
	const dir = project();
	run(dir, "init", "--yes", "--tools", "claude,codex,opencode");
	const r = syncProject(dir, { quiet: true });
	assert.deepEqual(r.written, []);
	assert.deepEqual(r.conflicts, []);
});

test("role, command and doc texts never tell an agent to run the workflow CLI", () => {
	const files = [];
	const walk = (d) => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const f = join(d, e.name);
			if (e.isDirectory()) walk(f);
			else if (f.endsWith(".md")) files.push(f);
		}
	};
	walk(join(PKG, "managed"));
	assert.ok(files.length > 10);
	for (const f of files) {
		const text = readFileSync(f, "utf8")
			.split("\n")
			.filter((l) => !l.startsWith("<!-- Managed by"))
			.join("\n");
		assert.ok(!/agent-workflow|npx /.test(text), `${f} mentions the CLI`);
	}
});

test("copy/ is up to date and never names the CLI, the installer or the loop-only role", () => {
	const check = spawnSync(
		"node",
		[join(PKG, "scripts", "build-copy.mjs"), "--check"],
		{ encoding: "utf8" },
	);
	assert.equal(check.status, 0, check.stderr);
	const files = [];
	const walk = (d) => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const f = join(d, e.name);
			if (e.isSymbolicLink()) continue;
			if (e.isDirectory()) walk(f);
			else if (f.endsWith(".md")) files.push(f);
		}
	};
	walk(join(PKG, "copy"));
	assert.ok(files.length > 20);
	for (const f of files) {
		const text = readFileSync(f, "utf8");
		assert.ok(
			!/agent-workflow|npx |autopilot|installer/.test(text),
			`${f} mentions the package`,
		);
	}
	assert.ok(existsSync(join(PKG, "copy", ".kilo", "agents", "pm.md")));
	assert.ok(existsSync(join(PKG, "copy", "INSTRUKCJA.md")));
});

// OpenCode/Kilo permission matching: whole-value wildcards (`*` any characters, `?` one), last match wins.
function opencodeBashDecision(agentFile, command) {
	const rules = [
		...agentFile.matchAll(/^ {4}("(?:[^"\\]|\\.)*"): (allow|deny|ask)$/gm),
	].map(([, pattern, effect]) => [JSON.parse(pattern), effect]);
	let decision = "ask";
	for (const [pattern, effect] of rules) {
		const re = new RegExp(
			`^${pattern
				.replace(/[.+^${}()|[\]\\]/g, "\\$&")
				.replaceAll("*", ".*")
				.replaceAll("?", ".")}$`,
			"s",
		);
		if (re.test(command)) decision = effect;
	}
	return decision;
}

test("opencode and kilo agents cannot push to the protected branches", () => {
	const dir = project();
	run(dir, "init", "--yes", "--tools", "opencode,kilo");
	writeFileSync(
		join(dir, ".agents/workflow.json"),
		JSON.stringify({
			...JSON.parse(read(dir, ".agents/workflow.json")),
			guard: { defaultBranch: "develop" },
		}),
	);
	syncProject(dir, { quiet: true });
	for (const tool of ["opencode", "kilo"]) {
		const tl = read(dir, `.${tool}/agents/tech-lead.md`);
		for (const cmd of [
			"git push",
			"git push origin main",
			"git push -u origin main",
			"git push origin HEAD:main",
			"git push origin task/X:refs/heads/master",
			"git push origin develop --tags",
			"git push --force origin task/X",
		])
			assert.equal(opencodeBashDecision(tl, cmd), "deny", `${tool}: ${cmd}`);
		for (const cmd of [
			"git push -u origin task/PROJ-1",
			"git push origin sub/PROJ-1/ST-2",
			"git push origin task/maintenance",
			"git status",
		])
			assert.equal(opencodeBashDecision(tl, cmd), "allow", `${tool}: ${cmd}`);
	}
});

test("mcp servers per role: allowed for listed roles, switched off for the others", () => {
	const dir = project();
	assert.equal(
		run(dir, "init", "--yes", "--tools", "kilo,opencode,claude").status,
		0,
	);
	const cfgPath = join(dir, ".agents", "workflow.json");
	const cfg = JSON.parse(read(dir, ".agents/workflow.json"));
	cfg.mcp = { "chrome-devtools": ["qa"], figma: ["tech-lead", "qa", "scout"] };
	writeFileSync(cfgPath, JSON.stringify(cfg));
	assert.equal(run(dir, "sync").status, 0);
	for (const tool of ["kilo", "opencode"]) {
		const qa = read(dir, `.${tool}/agents/qa.md`);
		assert.match(qa, /"chrome-devtools_\*": allow/);
		assert.match(qa, /"figma_\*": allow/);
		const impl = read(dir, `.${tool}/agents/implementer.md`);
		assert.match(impl, /"chrome-devtools_\*": deny/);
		assert.match(impl, /"figma_\*": deny/);
		assert.match(
			read(dir, `.${tool}/agents/tech-lead.md`),
			/"chrome-devtools_\*": deny/,
		);
	}
	assert.match(
		read(dir, ".claude/agents/implementer.md"),
		/disallowedTools: mcp__chrome-devtools, mcp__figma/,
	);
	assert.match(
		read(dir, ".claude/agents/qa.md"),
		/^(?![\s\S]*disallowedTools)/,
	);
	assert.match(
		read(dir, ".claude/agents/scout.md"),
		/tools: Read, Glob, Grep, Bash, mcp__figma/,
	);
	cfg.mcp = { figma: "tech-lead" };
	writeFileSync(cfgPath, JSON.stringify(cfg));
	assert.notEqual(run(dir, "sync").status, 0);
});
