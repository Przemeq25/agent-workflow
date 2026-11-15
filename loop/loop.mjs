#!/usr/bin/env node
// Agent loop of @przemeq25/agent-workflow (generic; project commands come from .agents/skills/workflow-rules,
// settings from .agents/workflow.json).
//
// Model: spec/changes/<ID>/ is one change (a task from pm or a tracker key) with subtasks.
//   change.json  metadata, status, subtasks with AC and dependencies
//   proposal.md  pm: why and what (AC of the whole change)
//   design.md    tech-lead: how in code (technical spec + skill guidance)
//   tasks.md     generated view of the subtasks
//   verify/      autopilot reports per subtask
//
// Git: a change has branch task/<ID> and one main PR task/<ID> → base (merged by a human).
// Subtask: branch sub/<ID>/<ST>, PR into task/<ID>; the loop merges it itself when verification,
// review and QA passed. A change with one subtask lands directly on task/<ID>.
// The loop never touches the base branch.
//
// Commands:
//   validate | render | status | approve <ID…> | publish
//   run [--max N] [--watch] [--change ID] [--retry ID/ST] [--dry-run]
// No npm dependencies; Node 20+, git, gh (GitHub) or the Bitbucket API.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, syncProject } from "../lib/sync.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.AGENT_LOOP_ROOT ?? process.cwd());
// Changes live in spec/. A project that still has only the old work/ keeps working until it renames it.
const WORK =
	existsSync(join(ROOT, "spec")) || !existsSync(join(ROOT, "work", "changes"))
		? "spec"
		: "work";
const STATE_DIR = join(ROOT, ".agent-loop");
const STATE_FILE = join(STATE_DIR, "state.json");
const LOCK_FILE = join(STATE_DIR, "lock");

// Project defaults come from the workflow-rules skill, so the loop has no stack baked in.
function ruleCommand(label) {
	const file = join(ROOT, ".agents", "skills", "workflow-rules", "SKILL.md");
	if (!existsSync(file)) return "";
	const re = new RegExp(`${label}[^\\n\`]*\`([^\`]+)\``);
	return readFileSync(file, "utf8").match(re)?.[1]?.trim() ?? "";
}

const workflow = loadConfig(ROOT);
const loopCfg = workflow.loop ?? {};
const cfg = {
	runner:
		process.env.AGENT_LOOP_RUNNER ??
		loopCfg.runner ??
		workflow.tools[0] ??
		"claude",
	verifyEnv: loopCfg.verifyEnv ?? {},
	platform: process.env.AGENT_LOOP_PLATFORM ?? "",
	base: process.env.AGENT_LOOP_BASE ?? "",
	model: process.env.AGENT_LOOP_MODEL ?? loopCfg.model ?? "",
	agentCmd: process.env.AGENT_LOOP_CMD ?? loopCfg.command ?? "",
	maxBudget: process.env.AGENT_LOOP_MAX_BUDGET_USD ?? "",
	setupCmd:
		process.env.AGENT_LOOP_SETUP ??
		loopCfg.setup ??
		ruleCommand("Setup \\(install dependencies in a fresh worktree\\):"),
	verifyCmd:
		process.env.AGENT_LOOP_VERIFY ??
		loopCfg.verify ??
		ruleCommand("Default verification for a subtask:"),
	timeoutMin: Number(process.env.AGENT_LOOP_TIMEOUT_MIN ?? 45),
	maxAttempts: Number(process.env.AGENT_LOOP_MAX_ATTEMPTS ?? 2),
	pollMin: Number(process.env.AGENT_LOOP_POLL_MIN ?? 10),
	autoMerge: (process.env.AGENT_LOOP_AUTOMERGE_SUBTASKS ?? "true") === "true",
	copyFiles: (process.env.AGENT_LOOP_COPY_FILES ?? ".env")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean),
	label: process.env.AGENT_LOOP_LABEL ?? "agent-task",
	blockedLabel: process.env.AGENT_LOOP_BLOCKED_LABEL ?? "agent-blocked",
};

// ---------- tools ----------

function sh(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, {
		cwd: opts.cwd ?? ROOT,
		encoding: "utf8",
		stdio: opts.inherit ? "inherit" : "pipe",
		env: { ...process.env, ...(opts.env ?? {}) },
		timeout: opts.timeoutMs,
		shell: opts.shell ?? false,
		maxBuffer: 64 * 1024 * 1024,
	});
	if (r.error && !opts.allowFail) throw r.error;
	if (r.status !== 0 && !opts.allowFail) {
		throw new Error(
			`${cmd} ${args.join(" ")} → exit ${r.status}\n${r.stderr ?? ""}`.trim(),
		);
	}
	return {
		ok: r.status === 0,
		code: r.status,
		out: (r.stdout ?? "").trim(),
		err: (r.stderr ?? "").trim(),
		timedOut: r.error?.code === "ETIMEDOUT",
	};
}

const git = (args, opts) => sh("git", args, opts);
const log = (...a) => console.log("[agent-loop]", ...a);
const die = (msg) => {
	console.error(`[agent-loop] ERROR: ${msg}`);
	process.exit(1);
};
const today = () => new Date().toISOString().slice(0, 10);

function readJson(path, fallback) {
	if (!existsSync(path)) return fallback;
	return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path) {
	return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export const taskBranch = (change) => `task/${change.id}`;
export const subBranch = (change, st) => `sub/${change.id}/${st.id}`;
export const subtaskMarker = (change, st) => `Subtask: ${change.id}/${st.id}`;

function changeDir(id, root = ROOT) {
	return join(root, WORK, "changes", id);
}

export function loadChanges(root = ROOT) {
	const dir = join(root, WORK, "changes");
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => {
			const data = readJson(join(dir, d.name, "change.json"), null);
			return data
				? { ...data, _dir: d.name }
				: { id: d.name, _dir: d.name, _missing: true };
		})
		.sort((a, b) => a.id.localeCompare(b.id));
}

function saveChange(change) {
	const { _dir, _missing, ...data } = change;
	writeFileSync(
		join(changeDir(_dir), "change.json"),
		`${JSON.stringify(data, null, "\t")}\n`,
	);
}

function loadState() {
	return readJson(STATE_FILE, { attempts: {}, blocked: {} });
}

function saveState(state) {
	mkdirSync(STATE_DIR, { recursive: true });
	writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function detectBase() {
	if (cfg.base) return cfg.base;
	const r = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
		allowFail: true,
	});
	return r.ok ? r.out.replace(/^origin\//, "") : "main";
}

function detectRemote() {
	const url = git(["remote", "get-url", "origin"], { allowFail: true }).out;
	const gh = url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
	if (gh) return { platform: "github", owner: gh[1], repo: gh[2] };
	const bb = url.match(/bitbucket\.org[:/]([^/]+)\/(.+?)(\.git)?$/);
	if (bb) return { platform: "bitbucket", owner: bb[1], repo: bb[2] };
	return { platform: "none", owner: "", repo: "" };
}

const remoteHas = (branch) =>
	git(["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`], {
		allowFail: true,
	}).ok;

// ---------- documents and approval fingerprint ----------

const PLACEHOLDERS =
	/<ID>|<title>|<tytuł>|YYYY-MM-DD|RRRR-MM-DD|<KEY or none>|<KLUCZ albo brak>/;

function sectionBody(text, headingRegex) {
	const parts = text.split(headingRegex);
	if (parts.length < 2) return null;
	return (parts[1] ?? "").split(/^## /m)[0] ?? "";
}

export function designProblems(text) {
	if (text === null) return ["missing design.md (tech-lead)"];
	const problems = [];
	if (PLACEHOLDERS.test(text))
		problems.push("design.md has unfilled template placeholders");
	for (let n = 1; n <= 13; n++) {
		if (!new RegExp(`^## ${n}\\. `, "m").test(text))
			problems.push(`design.md: missing section ${n}`);
	}
	const open = text.split(/^## 13\. .*$/m)[1] ?? "";
	if (/^\s*(-|\d+\.)\s+\S/m.test(open))
		problems.push("design.md: section 13 has open questions");
	return problems;
}

export function proposalProblems(text) {
	if (text === null) return ["missing proposal.md (pm)"];
	const problems = [];
	if (PLACEHOLDERS.test(text))
		problems.push("proposal.md has unfilled template placeholders");
	const open = sectionBody(text, /^## (?:Open questions|Otwarte pytania).*$/m);
	if (open === null)
		problems.push('proposal.md: missing section "Open questions"');
	else if (/^\s*(-|\d+\.)\s+\S/m.test(open))
		problems.push("proposal.md: has open questions");
	return problems;
}

export function approvalHash(change, root = ROOT) {
	const dir = changeDir(change._dir ?? change.id, root);
	const norm = (t) => (t ?? "").replace(/\r\n/g, "\n");
	const payload = [
		norm(readText(join(dir, "proposal.md"))),
		norm(readText(join(dir, "design.md"))),
		JSON.stringify(change.subtasks ?? []),
	].join("\n\u0000\n");
	return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

// ---------- validation ----------

const STATUSES = ["draft", "approved", "blocked", "cancelled"];
const RISKS = ["QUICK", "STANDARD", "COMPLEX"];
const SIZES = ["S", "M"];
const ID_RE = /^([A-Z][A-Z0-9]+-\d+)(-[a-z0-9]+)*$|^[a-z0-9]+(-[a-z0-9]+)*$/;

function cycles(items) {
	const byId = new Map(items.map((x) => [x.id, x]));
	const color = new Map();
	const found = [];
	const visit = (id, path) => {
		color.set(id, 1);
		for (const d of byId.get(id)?.dependsOn ?? []) {
			if (!byId.has(d)) continue;
			if (color.get(d) === 1) found.push([...path, id, d].join(" → "));
			else if (!color.get(d)) visit(d, [...path, id]);
		}
		color.set(id, 2);
	};
	for (const id of byId.keys()) if (!color.get(id)) visit(id, []);
	return found;
}

export function topoOrder(items) {
	const byId = new Map(items.map((x) => [x.id, x]));
	const out = [];
	const seen = new Set();
	const visit = (x) => {
		if (seen.has(x.id)) return;
		seen.add(x.id);
		for (const d of x.dependsOn ?? []) if (byId.has(d)) visit(byId.get(d));
		out.push(x);
	};
	for (const x of items) visit(x);
	return out;
}

export function validate(changes, root = ROOT) {
	const errors = [];
	const warnings = [];
	const ids = new Map();
	for (const c of changes) {
		const w = c.id ?? c._dir;
		if (c._missing) {
			errors.push(`${w}: folder without change.json`);
			continue;
		}
		if (c.id !== c._dir)
			errors.push(
				`${w}: id in change.json must equal the folder name (${c._dir})`,
			);
		if (!ID_RE.test(c.id ?? ""))
			errors.push(
				`${w}: id is a tracker key (PROJ-123, optionally -note) or a slug (add-rooms)`,
			);
		ids.set(c.id, c);
		if (!c.title) errors.push(`${w}: missing title`);
		if (!STATUSES.includes(c.status))
			errors.push(`${w}: status ∉ ${STATUSES.join("/")}`);
		if (c.jira && !/^[A-Z][A-Z0-9]+-\d+$/.test(c.jira))
			errors.push(`${w}: jira must look like KEY-123`);
		const subs = c.subtasks ?? [];
		if (subs.length === 0) errors.push(`${w}: no subtasks`);
		const subIds = new Set();
		for (const st of subs) {
			const sw = `${w}/${st.id ?? "?"}`;
			if (!/^ST-\d{2,}$/.test(st.id ?? ""))
				errors.push(`${sw}: subtask id must look like ST-01`);
			if (subIds.has(st.id)) errors.push(`${sw}: zduplikowane id`);
			subIds.add(st.id);
			if (!st.title) errors.push(`${sw}: missing title`);
			if (!st.goal) errors.push(`${sw}: missing goal`);
			if (!RISKS.includes(st.risk))
				errors.push(`${sw}: risk ∉ ${RISKS.join("/")}`);
			if (!SIZES.includes(st.size))
				errors.push(`${sw}: size S or M (split larger ones)`);
			const acs = st.acceptanceCriteria;
			if (!Array.isArray(acs) || acs.length === 0)
				errors.push(`${sw}: missing acceptanceCriteria`);
			else
				for (const [i, ac] of acs.entries())
					if (!ac.id || !ac.given || !ac.when || !ac.then)
						errors.push(`${sw}: AC #${i + 1} wymaga id, given, when, then`);
			if (!Array.isArray(st.verification) || st.verification.length === 0)
				warnings.push(`${sw}: missing verification`);
		}
		for (const st of subs)
			for (const d of st.dependsOn ?? [])
				if (!subIds.has(d))
					errors.push(
						`${w}/${st.id}: dependency ${d} does not exist in this change`,
					);
		errors.push(...cycles(subs).map((p) => `${w}: subtask cycle ${p}`));

		const dir = changeDir(c._dir, root);
		if (c.status === "approved") {
			if ((c.openQuestions ?? []).length)
				errors.push(`${w}: approved change has openQuestions`);
			if (c.approvalHash !== approvalHash(c, root))
				errors.push(
					`${w}: proposal/design/subtasks changed after approval. Approve again: agent-workflow approve ${c.id}`,
				);
		} else if (c.status === "draft") {
			if (!existsSync(join(dir, "proposal.md")))
				warnings.push(`${w}: missing proposal.md (pm)`);
			if (!existsSync(join(dir, "design.md")))
				warnings.push(`${w}: missing design.md (tech-lead)`);
		}
	}
	for (const c of changes)
		for (const d of c.dependsOn ?? []) {
			const dep = ids.get(d);
			if (!dep)
				errors.push(`${c.id}: depends on change ${d}, which does not exist`);
			else if (c.status === "approved" && dep.status === "cancelled")
				errors.push(`${c.id}: depends on cancelled change ${d}`);
		}
	errors.push(
		...cycles(changes.filter((c) => !c._missing)).map(
			(p) => `change cycle ${p}`,
		),
	);
	return { errors, warnings };
}

// ---------- workflow configuration (.agents/) ----------

const REQUIRED_AGENTS = [
	"prd",
	"prd-tech",
	"prd-explore",
	"prd-tech-explore",
	"pm",
	"tech-lead",
	"autopilot",
	"implementer",
	"code-reviewer",
	"qa",
];
const TIERS = ["high", "standard", "low", "inherit", "strong"];
const ACCESS = ["full", "no-commit", "qa", "read-only", "prd", "prd-tech"];
const MODES = ["primary", "subagent", "all"];

export function parseFrontmatter(text) {
	const m = text.match(/^---\n([\s\S]*?)\n---/);
	if (!m) return null;
	const out = {};
	let key = null;
	for (const line of (m[1] ?? "").split("\n")) {
		const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
		if (kv) {
			key = kv[1];
			const v = (kv[2] ?? "").trim();
			out[key] =
				v === "" || v === ">" || v === "|" || v === ">-"
					? []
					: v.replace(/^["']|["']$/g, "");
			continue;
		}
		if (!key) continue;
		const item = line.match(/^\s+-\s+(.+)$/);
		if (item && Array.isArray(out[key])) out[key].push((item[1] ?? "").trim());
		else if (/^\s+\S/.test(line) && Array.isArray(out[key]))
			out[key].push(line.trim());
	}
	return out;
}

const fmText = (v) => (Array.isArray(v) ? v.join(" ") : (v ?? ""));

export function validateAgentsConfig(root = ROOT) {
	const errors = [];
	const warnings = [];
	const base = join(root, ".agents");
	if (!existsSync(base))
		return {
			errors: ["missing .agents/ (run: agent-workflow init)"],
			warnings,
		};

	const skillsDir = join(base, "skills");
	const skills = existsSync(skillsDir)
		? readdirSync(skillsDir, { withFileTypes: true })
				.filter((d) => d.isDirectory() || d.isSymbolicLink())
				.map((d) => d.name)
		: [];
	for (const name of skills) {
		const text = readText(join(skillsDir, name, "SKILL.md"));
		if (text === null) {
			errors.push(`skill ${name}: missing SKILL.md`);
			continue;
		}
		const fm = parseFrontmatter(text);
		if (!fm) {
			errors.push(`skill ${name}: missing frontmatter`);
			continue;
		}
		if (fm.name && fm.name !== name)
			errors.push(
				`skill ${name}: name "${fm.name}" differs from the folder name`,
			);
		if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64)
			errors.push(
				`skill ${name}: folder name must use lower case, digits and hyphens, max 64 characters`,
			);
		const desc = fmText(fm.description);
		if (!desc)
			errors.push(
				`skill ${name}: missing description (agents cannot tell when to use it)`,
			);
		else if (desc.length > 1024)
			errors.push(
				`skill ${name}: description has ${desc.length} characters (max 1024)`,
			);
		if (text.split("\n").length > 500)
			warnings.push(`skill ${name}: SKILL.md has more than 500 lines`);
	}
	for (const req of [
		"workflow-rules",
		"business-rules",
		"engineering-rules",
		"review-rules",
		"testing-rules",
	])
		if (!skills.includes(req))
			errors.push(`missing project skill .agents/skills/${req}/SKILL.md`);
		else if (/\bTODO\b/.test(readText(join(skillsDir, req, "SKILL.md")) ?? ""))
			warnings.push(`project skill ${req} still has TODOs`);

	const agentsDir = join(base, "agents");
	const agents = existsSync(agentsDir)
		? readdirSync(agentsDir)
				.filter((f) => f.endsWith(".md"))
				.map((f) => f.replace(/\.md$/, ""))
		: [];
	for (const req of REQUIRED_AGENTS)
		if (!agents.includes(req))
			errors.push(
				`missing role .agents/agents/${req}.md (run: agent-workflow sync)`,
			);
	for (const name of agents) {
		const text = readText(join(agentsDir, `${name}.md`)) ?? "";
		const fm = parseFrontmatter(text);
		if (!fm) {
			errors.push(`role ${name}: missing frontmatter`);
			continue;
		}
		if (fm.name !== name)
			errors.push(
				`role ${name}: name "${fm.name ?? ""}" must equal the file name`,
			);
		if (!fmText(fm.description))
			errors.push(`role ${name}: missing description`);
		if (fm.tier && !TIERS.includes(fm.tier))
			errors.push(`role ${name}: tier "${fm.tier}" not in ${TIERS.join("/")}`);
		if (fm.access && !ACCESS.includes(fm.access))
			errors.push(
				`role ${name}: access "${fm.access}" not in ${ACCESS.join("/")}`,
			);
		if (fm.mode && !MODES.includes(fm.mode))
			errors.push(`role ${name}: mode "${fm.mode}" not in ${MODES.join("/")}`);
		for (const sk of Array.isArray(fm.skills)
			? fm.skills
			: fm.skills
				? fm.skills.split(",").map((x) => x.trim())
				: [])
			if (!skills.includes(sk))
				errors.push(
					`role ${name}: skill "${sk}" does not exist in .agents/skills/`,
				);
		const body = text.replace(/^---[\s\S]*?\n---/, "");
		if (body.trim().length < 200)
			warnings.push(`role ${name}: very short instructions`);
	}

	const routing = readText(join(skillsDir, "workflow-rules", "SKILL.md")) ?? "";
	for (const sk of skills)
		if (!routing.includes(`\`${sk}\``))
			errors.push(
				`skill ${sk}: missing from the skill routing table in workflow-rules, so it never reaches a design`,
			);
	if (!existsSync(join(base, "hooks", "guard.mjs")))
		errors.push("missing .agents/hooks/guard.mjs (run: agent-workflow sync)");
	if (!existsSync(join(root, "AGENTS.md")))
		errors.push("missing AGENTS.md (run: agent-workflow sync)");
	if (!existsSync(join(base, "workflow.json")))
		warnings.push("missing .agents/workflow.json (defaults are used)");
	return { errors, warnings, skills, agents };
}

// ---------- render ----------

const nodeId = (s) => s.replace(/[^A-Za-z0-9]/g, "_");
const label = (s) => s.replace(/["[\]]/g, "'");
const acLine = (ac) =>
	`**${ac.id}** Given ${ac.given}, when ${ac.when}, then ${ac.then}`;

export function renderTasks(change) {
	const subs = topoOrder(change.subtasks ?? []);
	const lines = [
		`# ${change.id} — ${change.title} · subtasks`,
		"",
		"> Generated from `change.json` (`agent-workflow render`). Do not edit by hand.",
		`> Status: **${change.status}**${change.approvedAt ? ` · approved ${change.approvedAt} (fingerprint ${change.approvalHash})` : ""}`,
		`> Branch: \`${taskBranch(change)}\` · subtasks: PRs into this branch · a human merges the main PR into the base`,
		"",
		"```mermaid",
		"flowchart TD",
	];
	for (const st of subs)
		lines.push(`    ${nodeId(st.id)}["${st.id} ${label(st.title)}"]`);
	for (const st of subs)
		for (const d of st.dependsOn ?? [])
			lines.push(`    ${nodeId(d)} --> ${nodeId(st.id)}`);
	lines.push("```", "");
	for (const st of subs) {
		lines.push(
			`## ${st.id} — ${st.title}`,
			"",
			`**Cel:** ${st.goal}  `,
			`Risk ${st.risk} · size ${st.size} · depends on: ${(st.dependsOn ?? []).join(", ") || "—"} · requirements: ${(st.refs ?? []).join(", ") || "—"}`,
			"",
		);
		if (st.scope?.in?.length)
			lines.push(`**W zakresie:** ${st.scope.in.join("; ")}`, "");
		if (st.scope?.out?.length)
			lines.push(`**Poza zakresem:** ${st.scope.out.join("; ")}`, "");
		for (const ac of st.acceptanceCriteria ?? [])
			lines.push(`- [ ] ${acLine(ac)}`);
		if (st.verification?.length)
			lines.push("", `**Verification:** ${st.verification.join("; ")}`);
		lines.push("");
	}
	return `${lines.join("\n")}\n`;
}

export function renderIndex(changes) {
	const list = topoOrder(changes.filter((c) => !c._missing));
	const lines = [
		"# Zmiany",
		"",
		"> Generated (`agent-workflow render`). Details: `spec/changes/<ID>/`. Delivery state: `agent-workflow status`.",
		"",
		"```mermaid",
		"flowchart TD",
	];
	for (const c of list)
		lines.push(`    ${nodeId(c.id)}["${c.id}: ${label(c.title)}"]`);
	for (const c of list)
		for (const d of c.dependsOn ?? [])
			lines.push(`    ${nodeId(d)} --> ${nodeId(c.id)}`);
	const groups = { approved: [], draft: [], blocked: [], cancelled: [] };
	for (const c of list) groups[c.status]?.push(nodeId(c.id));
	lines.push(
		"    classDef approved fill:#d7f0dd,stroke:#2e7d4f,color:#000",
		"    classDef draft fill:#fff1c9,stroke:#b8860b,color:#000",
		"    classDef blocked fill:#f9d0d0,stroke:#b22222,color:#000",
		"    classDef cancelled fill:#e6e6e6,stroke:#777,color:#555",
	);
	for (const [k, ids] of Object.entries(groups))
		if (ids.length) lines.push(`    class ${ids.join(",")} ${k}`);
	lines.push(
		"```",
		"",
		"| ID | Title | Status | Subtasks | Depends on | Proposal | Design |",
		"|---|---|---|---|---|---|---|",
	);
	for (const c of list) {
		const dir = changeDir(c._dir);
		const has = (f) => (existsSync(join(dir, f)) ? "✓" : "—");
		lines.push(
			`| [${c.id}](changes/${c._dir}/tasks.md) | ${c.title} | ${c.status} | ${(c.subtasks ?? []).length} | ${(c.dependsOn ?? []).join(", ") || "—"} | ${has("proposal.md")} | ${has("design.md")} |`,
		);
	}
	return `${lines.join("\n")}\n`;
}

function renderAll(changes) {
	for (const c of changes.filter((x) => !x._missing))
		writeFileSync(join(changeDir(c._dir), "tasks.md"), renderTasks(c));
	mkdirSync(join(ROOT, WORK), { recursive: true });
	writeFileSync(join(ROOT, WORK, "BACKLOG.md"), renderIndex(changes));
}

// ---------- platform adapters ----------

function githubAdapter() {
	const gh = (args, opts = {}) => sh("gh", args, opts);
	const ensureLabel = (name, color) =>
		gh(["label", "create", name, "--color", color, "--force"], {
			allowFail: true,
		});
	const issueFor = (change) => {
		const r = gh(
			[
				"issue",
				"list",
				"--state",
				"all",
				"--search",
				`"[${change.id}]" in:title`,
				"--json",
				"number,title,labels",
				"--limit",
				"20",
			],
			{ allowFail: true },
		);
		if (!r.ok) return null;
		const i = JSON.parse(r.out || "[]").find((x) =>
			x.title.startsWith(`[${change.id}]`),
		);
		return i ? { number: i.number, labels: i.labels.map((l) => l.name) } : null;
	};
	return {
		name: "github",
		supportsPR: true,
		findPR(head, base) {
			const args = [
				"pr",
				"list",
				"--head",
				head,
				"--state",
				"all",
				"--json",
				"number,state,url,isDraft",
				"--limit",
				"5",
			];
			if (base) args.push("--base", base);
			const r = gh(args, { allowFail: true });
			if (!r.ok) throw new Error(`gh pr list failed: ${r.err}`);
			const prs = JSON.parse(r.out || "[]");
			const pr =
				prs.find((p) => p.state === "OPEN") ??
				prs.find((p) => p.state === "MERGED") ??
				prs[0];
			return pr
				? { state: pr.state, url: pr.url, number: pr.number, draft: pr.isDraft }
				: null;
		},
		createPR({ head, base, title, bodyFile, draft }) {
			const args = [
				"pr",
				"create",
				"--base",
				base,
				"--head",
				head,
				"--title",
				title,
				"--body-file",
				bodyFile,
			];
			if (draft) args.push("--draft");
			const url = gh(args).out.split("\n").pop();
			return {
				url,
				number: Number(url.split("/").pop()),
				draft: Boolean(draft),
			};
		},
		mergePR(pr) {
			gh(["pr", "merge", String(pr.number), "--merge", "--delete-branch"]);
		},
		markReady(pr) {
			gh(["pr", "ready", String(pr.number)], { allowFail: true });
		},
		updateBody(pr, bodyFile) {
			gh(["pr", "edit", String(pr.number), "--body-file", bodyFile], {
				allowFail: true,
			});
		},
		findIssue: issueFor,
		createIssue(change, bodyFile) {
			ensureLabel(cfg.label, "1f6feb");
			const url = gh([
				"issue",
				"create",
				"--title",
				`[${change.id}] ${change.title}`,
				"--body-file",
				bodyFile,
				"--label",
				cfg.label,
			]).out;
			return Number(url.split("/").pop());
		},
		isBlocked: (change) =>
			issueFor(change)?.labels.includes(cfg.blockedLabel) ?? false,
		markBlocked(change, bodyFile) {
			const issue = issueFor(change);
			if (!issue) return;
			ensureLabel(cfg.blockedLabel, "b60205");
			gh(
				[
					"issue",
					"edit",
					String(issue.number),
					"--add-label",
					cfg.blockedLabel,
				],
				{ allowFail: true },
			);
			gh(["issue", "comment", String(issue.number), "--body-file", bodyFile], {
				allowFail: true,
			});
		},
		unblock(change) {
			const issue = issueFor(change);
			if (issue)
				gh(
					[
						"issue",
						"edit",
						String(issue.number),
						"--remove-label",
						cfg.blockedLabel,
					],
					{ allowFail: true },
				);
		},
		closesLine(change) {
			const issue = issueFor(change);
			return issue ? `Closes #${issue.number}` : "";
		},
	};
}

function bitbucketAdapter(remote) {
	const api = `https://api.bitbucket.org/2.0/repositories/${remote.owner}/${remote.repo}`;
	const headers = {
		Accept: "application/json",
		"Content-Type": "application/json",
	};
	if (process.env.BITBUCKET_TOKEN)
		headers.Authorization = `Bearer ${process.env.BITBUCKET_TOKEN}`;
	else if (process.env.BITBUCKET_USER && process.env.BITBUCKET_API_TOKEN)
		headers.Authorization = `Basic ${Buffer.from(`${process.env.BITBUCKET_USER}:${process.env.BITBUCKET_API_TOKEN}`).toString("base64")}`;
	const call = async (path, init = {}) => {
		if (!headers.Authorization)
			throw new Error(
				"Bitbucket: set BITBUCKET_TOKEN or BITBUCKET_USER + BITBUCKET_API_TOKEN",
			);
		const res = await fetch(`${api}${path}`, { ...init, headers });
		if (!res.ok)
			throw new Error(
				`Bitbucket ${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`,
			);
		return res.status === 204 ? {} : res.json();
	};
	const none = () => null;
	return {
		name: "bitbucket",
		supportsPR: true,
		async findPR(head, base) {
			let q = `source.branch.name="${head}"`;
			if (base) q += ` AND destination.branch.name="${base}"`;
			const states = ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]
				.map((s) => `state=${s}`)
				.join("&");
			const data = await call(
				`/pullrequests?q=${encodeURIComponent(q)}&${states}&pagelen=5`,
			);
			const pr =
				data.values?.find((p) => p.state === "OPEN") ??
				data.values?.find((p) => p.state === "MERGED") ??
				data.values?.[0];
			if (!pr) return null;
			const state =
				pr.state === "OPEN"
					? "OPEN"
					: pr.state === "MERGED"
						? "MERGED"
						: "CLOSED";
			return {
				state,
				url: pr.links?.html?.href,
				number: pr.id,
				draft: pr.draft,
			};
		},
		async createPR({ head, base, title, bodyFile, draft }) {
			const pr = await call("/pullrequests", {
				method: "POST",
				body: JSON.stringify({
					title,
					description: readFileSync(bodyFile, "utf8"),
					source: { branch: { name: head } },
					destination: { branch: { name: base } },
					close_source_branch: true,
					draft: Boolean(draft),
				}),
			});
			return {
				url: pr.links?.html?.href,
				number: pr.id,
				draft: Boolean(draft),
			};
		},
		async mergePR(pr) {
			await call(`/pullrequests/${pr.number}/merge`, {
				method: "POST",
				body: JSON.stringify({
					merge_strategy: "merge_commit",
					close_source_branch: true,
				}),
			});
		},
		async markReady(pr) {
			await call(`/pullrequests/${pr.number}`, {
				method: "PUT",
				body: JSON.stringify({ draft: false }),
			});
		},
		async updateBody(pr, bodyFile) {
			await call(`/pullrequests/${pr.number}`, {
				method: "PUT",
				body: JSON.stringify({ description: readFileSync(bodyFile, "utf8") }),
			});
		},
		findIssue: none,
		createIssue: none,
		isBlocked: () => false,
		markBlocked: () => {},
		unblock: () => {},
		closesLine: () => "",
	};
}

// No platform: branches only. "PR" = branch on origin, "merged" = contained in the base.
function noneAdapter() {
	return {
		name: "none",
		supportsPR: false,
		findPR(head, base) {
			if (!remoteHas(head)) return null;
			// task/<ID> → "Subtask: <ID>/", sub/<ID>/<ST> → "Subtask: <ID>/<ST>".
			// A fresh task/<ID> without work is not a "merged PR" yet.
			const marker = `Subtask: ${head.replace(/^(task|sub)\//, "")}${head.startsWith("task/") ? "/" : ""}`;
			const hasWork = git(
				[
					"log",
					`origin/${head}`,
					"--fixed-strings",
					`--grep=${marker}`,
					"--format=%H",
					"-n",
					"1",
				],
				{ allowFail: true },
			).out;
			if (!hasWork) return null;
			const merged = git(
				["merge-base", "--is-ancestor", `origin/${head}`, `origin/${base}`],
				{ allowFail: true },
			);
			return { state: merged.ok ? "MERGED" : "OPEN", url: `origin/${head}` };
		},
		createPR({ head, base }) {
			log(
				`platform "none": branch ${head} → ${base} pushed, open the PR by hand`,
			);
			return { url: `origin/${head}` };
		},
		mergePR: () => {},
		markReady: () => {},
		updateBody: () => {},
		findIssue: () => null,
		createIssue: () => null,
		isBlocked: () => false,
		markBlocked: () => {},
		unblock: () => {},
		closesLine: () => "",
	};
}

function makeAdapter() {
	const remote = detectRemote();
	const platform = cfg.platform || remote.platform;
	if (platform === "github") return githubAdapter();
	if (platform === "bitbucket") return bitbucketAdapter(remote);
	return noneAdapter();
}

// ---------- state ----------

function landedOnTaskBranch(change, st) {
	if (!remoteHas(taskBranch(change))) return false;
	const r = git(
		[
			"log",
			`origin/${taskBranch(change)}`,
			"--fixed-strings",
			`--grep=${subtaskMarker(change, st)}`,
			"--format=%H",
			"-n",
			"1",
		],
		{ allowFail: true },
	);
	return r.ok && r.out.length > 0;
}

async function computeStatus(changes, adapter, state, base, retryKey = null) {
	const result = new Map();
	for (const c of changes) {
		if (c._missing || c.status !== "approved") {
			result.set(c.id, {
				change: c,
				run: c._missing ? "invalid" : c.status,
				subs: new Map(),
			});
			continue;
		}
		const mainPR = await adapter.findPR(taskBranch(c), base);
		const subs = new Map();
		for (const st of c.subtasks) {
			let run = "todo";
			let pr = null;
			if (mainPR?.state === "MERGED" || landedOnTaskBranch(c, st)) run = "done";
			else {
				pr = await adapter.findPR(subBranch(c, st), taskBranch(c));
				if (pr?.state === "OPEN") run = "in_review";
				else if (pr?.state === "CLOSED")
					run = retryKey === `${c.id}/${st.id}` ? "todo" : "rejected";
				else if (pr?.state === "MERGED") run = "done";
				else if (state.blocked[`${c.id}/${st.id}`]) run = "agent_blocked";
			}
			subs.set(st.id, { st, run, pr });
		}
		for (const [id, s] of subs) {
			if (s.run !== "todo") continue;
			const waiting = (s.st.dependsOn ?? []).filter(
				(d) => subs.get(d)?.run !== "done",
			);
			if (waiting.length) subs.set(id, { ...s, run: "waiting", waiting });
		}
		let run;
		if (mainPR?.state === "MERGED") run = "done";
		else if (mainPR?.state === "CLOSED") run = "rejected";
		else if (await adapter.isBlocked(c)) run = "agent_blocked";
		else if ([...subs.values()].every((s) => s.run === "done"))
			run = "in_review";
		else run = "in_progress";
		result.set(c.id, { change: c, run, mainPR, subs });
	}
	for (const [id, s] of result) {
		if (s.run !== "in_progress") continue;
		const waiting = (s.change.dependsOn ?? []).filter(
			(d) => result.get(d)?.run !== "done",
		);
		if (waiting.length) result.set(id, { ...s, run: "waiting", waiting });
	}
	return result;
}

const ICONS = {
	done: "✅",
	in_review: "👀",
	in_progress: "🔧",
	todo: "▶️ ",
	waiting: "⏳",
	agent_blocked: "⛔",
	rejected: "🚫",
	draft: "📝",
	blocked: "⛔",
	cancelled: "✖️ ",
	invalid: "❗",
};

function printStatus(statusMap) {
	for (const { change, run, mainPR, subs, waiting } of statusMap.values()) {
		const extra = mainPR?.url
			? ` ${mainPR.url}`
			: waiting
				? ` (waiting for: ${waiting.join(", ")})`
				: "";
		console.log(
			`${ICONS[run] ?? "  "} ${change.id} [${run}] ${change.title ?? ""}${extra}`,
		);
		for (const s of subs.values()) {
			const e = s.pr?.url
				? ` ${s.pr.url}`
				: s.waiting
					? ` (waiting for: ${s.waiting.join(", ")})`
					: "";
			console.log(
				`    ${ICONS[s.run] ?? "  "} ${s.st.id} [${s.run}] ${s.st.title}${e}`,
			);
		}
	}
}

// ---------- agent ----------

// Claude Code ignores permissions and hooks from .claude/settings.json in a folder without an accepted
// "trust dialog". Loop worktrees are new paths, so they are marked as trusted in ~/.claude.json.
function trustWorktree(dir) {
	if (
		cfg.agentCmd ||
		cfg.runner !== "claude" ||
		process.env.AGENT_LOOP_TRUST_WORKTREES === "false"
	)
		return;
	const home = process.env.HOME ?? "";
	if (!home) return;
	const file = join(home, ".claude.json");
	let data = {};
	try {
		data = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
	} catch {
		log(`warning: cannot read ${file}, the worktree is not marked as trusted`);
		return;
	}
	data.projects ??= {};
	data.projects[dir] = {
		...(data.projects[dir] ?? {}),
		hasTrustDialogAccepted: true,
	};
	writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

const CLAUDE_TOOLS =
	"Bash Read Edit Write MultiEdit Glob Grep Task Skill TodoWrite";

// Tools without a "start as role" flag get the role file as a preamble.
const rolePreamble = (prompt) =>
	`Read .agents/agents/autopilot.md and act as that role for the whole session.\n\n${prompt}`;

export const runnerLabel = () =>
	cfg.agentCmd ? "command" : `${cfg.runner}${cfg.model ? ` ${cfg.model}` : ""}`;

function agentInvocation(promptFile, prompt) {
	// loop.command / AGENT_LOOP_CMD: any agent CLI; {prompt_file} is replaced with the prompt path.
	if (cfg.agentCmd)
		return {
			cmd: cfg.agentCmd.replaceAll("{prompt_file}", promptFile),
			args: [],
			shell: true,
		};
	if (cfg.runner === "codex")
		return {
			cmd: "codex",
			args: [
				"exec",
				"--full-auto",
				...(cfg.model ? ["--model", cfg.model] : []),
				rolePreamble(prompt),
			],
		};
	if (cfg.runner === "opencode")
		return {
			cmd: "opencode",
			args: [
				"run",
				"--agent",
				"autopilot",
				...(cfg.model ? ["--model", cfg.model] : []),
				prompt,
			],
		};
	if (cfg.runner !== "claude")
		throw new Error(
			`unknown loop.runner "${cfg.runner}" (claude, codex, opencode, or set loop.command)`,
		);
	return {
		cmd: "claude",
		args: [
			"-p",
			prompt,
			"--agent",
			"autopilot",
			"--permission-mode",
			"acceptEdits",
			"--allowedTools",
			CLAUDE_TOOLS,
			...(cfg.model ? ["--model", cfg.model] : []),
			...(cfg.maxBudget ? ["--max-budget-usd", cfg.maxBudget] : []),
		],
	};
}

function buildPrompt(change, st, deliveryRel) {
	const dir = `${WORK}/changes/${change._dir}`;
	return readFileSync(join(HERE, "prompt.md"), "utf8")
		.replaceAll("{{CHANGE_ID}}", change.id)
		.replaceAll("{{CHANGE_TITLE}}", change.title)
		.replaceAll("{{SUBTASK_ID}}", st.id)
		.replaceAll("{{SUBTASK_TITLE}}", st.title)
		.replaceAll("{{CHANGE_DIR}}", dir)
		.replaceAll("{{PROPOSAL_PATH}}", `${dir}/proposal.md`)
		.replaceAll("{{DESIGN_PATH}}", `${dir}/design.md`)
		.replaceAll("{{DELIVERY_PATH}}", deliveryRel)
		.replaceAll("{{TARGET_BRANCH}}", taskBranch(change))
		.replaceAll("{{VERIFY_CMD}}", cfg.verifyCmd)
		.replaceAll("{{SUBTASK_JSON}}", JSON.stringify(st, null, 2));
}

function parseDelivery(path) {
	const text = readText(path) ?? "";
	const m = text.match(/^STATUS:\s*(DONE|BLOCKED)/m);
	return { status: m ? m[1] : "MISSING", text };
}

function subPrBody(change, st, { delivery, verify }) {
	return [
		`Subtask **${change.id} / ${st.id}** → \`${taskBranch(change)}\` · risk ${st.risk} · size ${st.size}`,
		"",
		`**Goal:** ${st.goal}`,
		`**Design:** \`${WORK}/changes/${change._dir}/design.md\` (fingerprint ${change.approvalHash})`,
		"",
		"### Acceptance criteria",
		...(st.acceptanceCriteria ?? []).map((ac) => `- [ ] ${acLine(ac)}`),
		"",
		`### Loop verification: ${verify.ok ? "PASS" : verify.skipped ? "SKIPPED" : "FAIL"}`,
		`\`${cfg.verifyCmd}\``,
		"",
		"<details><summary>Last lines of the output</summary>",
		"",
		"```",
		verify.out.split("\n").slice(-40).join("\n") || "(none)",
		"```",
		"</details>",
		"",
		"### Autopilot report",
		"",
		delivery.text || "_No report._",
	].join("\n");
}

function mainPrBody(change, subStatus, closes) {
	const proposal = readText(join(changeDir(change._dir), "proposal.md")) ?? "";
	const why = sectionBody(proposal, /^## (?:Why|Dlaczego).*$/m)?.trim() ?? "";
	const dir = `${WORK}/changes/${change._dir}`;
	return [
		`Change **${change.id}**${change.jira ? ` (${change.jira})` : ""}: ${change.title}`,
		closes,
		"",
		why,
		"",
		`Proposal: \`${dir}/proposal.md\` · Design: \`${dir}/design.md\` · approved ${change.approvedAt} (fingerprint ${change.approvalHash})`,
		"",
		"### Subtasks",
		...(change.subtasks ?? []).map((st) => {
			const s = subStatus(st);
			return `- [${s === "done" ? "x" : " "}] **${st.id}** ${st.title}${s && s !== "done" ? ` _(${s})_` : ""}`;
		}),
		"",
		`Review and QA reports: \`${dir}/verify/\`.`,
		"",
		"---",
		"The agent loop merges subtasks into this branch after green verification, review and QA. **A human merges this PR into the base.**",
	].join("\n");
}

async function ensureMainPR(change, { base, adapter, allDone, subStatus }) {
	const bodyFile = join(STATE_DIR, `${change.id}.main-pr.md`);
	writeFileSync(
		bodyFile,
		mainPrBody(change, subStatus, await adapter.closesLine(change)),
	);
	const pr = await adapter.findPR(taskBranch(change), base);
	if (!pr || pr.state === "CLOSED") {
		const prefix =
			change.jira && !change.id.startsWith(change.jira)
				? `${change.jira} `
				: "";
		const created = await adapter.createPR({
			head: taskBranch(change),
			base,
			title: `${prefix}[${change.id}] ${change.title}`,
			bodyFile,
			draft: !allDone,
		});
		log(
			`${allDone ? "✅" : "📝"} main PR ${taskBranch(change)} → ${base}: ${created.url}`,
		);
		return;
	}
	await adapter.updateBody(pr, bodyFile);
	if (allDone && pr.draft) {
		await adapter.markReady(pr);
		log(`✅ main PR ready for your review: ${pr.url}`);
	}
}

async function runSubtask(change, st, { base, adapter, state, dryRun, entry }) {
	const key = `${change.id}/${st.id}`;
	const single = (change.subtasks ?? []).length === 1;
	const target = taskBranch(change);
	const wt = join(STATE_DIR, "worktrees", `${change.id}--${st.id}`);
	const localBranch = `agent-loop/${change.id}--${st.id}`;
	const deliveryRel = `${WORK}/changes/${change._dir}/verify/${st.id}.md`;
	log(
		`▶ ${key} ${st.title} → ${single ? target : `${subBranch(change, st)} → ${target}`}`,
	);
	if (dryRun) return "dry";

	git(["fetch", "origin", base]);
	if (!remoteHas(target)) {
		git(["push", "origin", `refs/remotes/origin/${base}:refs/heads/${target}`]);
		log(`created ${target} from ${base}`);
	}
	git(["fetch", "origin", target]);

	if (existsSync(wt))
		git(["worktree", "remove", "--force", wt], { allowFail: true });
	git(["worktree", "prune"], { allowFail: true });
	git(["branch", "-D", localBranch], { allowFail: true });
	mkdirSync(dirname(wt), { recursive: true });
	git(["worktree", "add", "-b", localBranch, wt, `origin/${target}`]);

	try {
		const inWt = loadChanges(wt).find((c) => c.id === change.id);
		if (!inWt || approvalHash(inWt, wt) !== change.approvalHash)
			throw new Error(
				`proposal/design/subtasks of ${change.id} on ${target} differ from the approved ones (fingerprint ${change.approvalHash}). Commit the approved version to ${base}; if ${target} was created earlier, merge ${base} into ${target}.`,
			);
		for (const f of cfg.copyFiles)
			if (existsSync(join(ROOT, f))) copyFileSync(join(ROOT, f), join(wt, f));
		if (cfg.setupCmd) {
			log(`setup: ${cfg.setupCmd}`);
			const setup = sh(cfg.setupCmd, [], {
				cwd: wt,
				shell: true,
				allowFail: true,
			});
			if (!setup.ok)
				throw new Error(`setup failed:\n${setup.err.slice(-2000)}`);
		}

		// Tool adapters are not committed: generate the one the runner needs.
		if (!cfg.agentCmd)
			syncProject(wt, { tools: [cfg.runner], quiet: true, managed: false });

		const prompt = buildPrompt(change, st, deliveryRel);
		const promptFile = join(STATE_DIR, `${change.id}--${st.id}.prompt.md`);
		writeFileSync(promptFile, prompt);
		trustWorktree(wt);
		const inv = agentInvocation(promptFile, prompt);
		log(`agent: ${runnerLabel()}, limit ${cfg.timeoutMin} min`);
		const agentRun = sh(inv.cmd, inv.args, {
			cwd: wt,
			inherit: true,
			shell: inv.shell,
			allowFail: true,
			timeoutMs: cfg.timeoutMin * 60_000,
		});
		if (agentRun.timedOut) log("agent exceeded the time limit");

		const delivery = parseDelivery(join(wt, deliveryRel));
		for (const f of cfg.copyFiles) rmSync(join(wt, f), { force: true });
		const changed = git(["status", "--porcelain", "--untracked-files=all"], {
			cwd: wt,
		}).out;
		const codeChanged = changed
			.split("\n")
			.some((l) => l && !l.includes(deliveryRel));

		if (!codeChanged) {
			const attempts = (state.attempts[key] ?? 0) + 1;
			state.attempts[key] = attempts;
			const reason =
				delivery.status === "BLOCKED"
					? "autopilot reported a blocker"
					: "no code changes";
			if (delivery.status === "BLOCKED" || attempts >= cfg.maxAttempts) {
				state.blocked[key] = { reason, at: new Date().toISOString() };
				const note = join(STATE_DIR, `${change.id}--${st.id}.blocked.md`);
				writeFileSync(
					note,
					`⛔ The loop stopped **${key}**: ${reason}.\n\n${delivery.text}`,
				);
				await adapter.markBlocked(change, note);
				log(`⛔ ${key} blocked (${reason}). See ${note}`);
			} else log(`↻ ${key}: ${reason}, attempt ${attempts}/${cfg.maxAttempts}`);
			saveState(state);
			return "no_changes";
		}

		let verify = { ok: false, skipped: true, out: "" };
		if (cfg.verifyCmd) {
			log(`verification: ${cfg.verifyCmd}`);
			verify = sh(cfg.verifyCmd, [], {
				cwd: wt,
				shell: true,
				allowFail: true,
				env: cfg.verifyEnv,
			});
			verify.out = `${verify.out}\n${verify.err}`.trim();
		}
		const green = delivery.status === "DONE" && verify.ok;

		git(["add", "-A"], { cwd: wt });
		git(
			[
				"commit",
				"-m",
				`feat(${change.id}): ${st.id} ${st.title}\n\n${subtaskMarker(change, st)}\nAgent-Loop: ${runnerLabel()}\nDelivery: ${delivery.status}; verify: ${verify.ok ? "PASS" : "FAIL"}`,
			],
			{ cwd: wt },
		);

		let landed = false;
		if (green && cfg.autoMerge && (single || !adapter.supportsPR)) {
			git(["push", "origin", `HEAD:refs/heads/${target}`], { cwd: wt });
			landed = true;
			log(`✅ ${key} on ${target}`);
		} else {
			const head = subBranch(change, st);
			git(["push", "-f", "origin", `HEAD:refs/heads/${head}`], { cwd: wt });
			const bodyFile = join(STATE_DIR, `${change.id}--${st.id}.pr.md`);
			writeFileSync(bodyFile, subPrBody(change, st, { delivery, verify }));
			let pr = await adapter.findPR(head, target);
			if (pr?.state !== "OPEN")
				pr = await adapter.createPR({
					head,
					base: target,
					title: `[${change.id}/${st.id}] ${st.title}`,
					bodyFile,
					draft: !green,
				});
			else await adapter.updateBody(pr, bodyFile);
			if (green && cfg.autoMerge && adapter.supportsPR) {
				await adapter.mergePR(pr);
				landed = true;
				log(`✅ ${key}: PR merged into ${target} (${pr.url})`);
			} else
				log(`${green ? "👀" : "📝 draft"} PR ${key} → ${target}: ${pr.url}`);
		}
		delete state.attempts[key];
		saveState(state);

		git(["fetch", "origin", target], { allowFail: true });
		const subStatus = (s) =>
			s.id === st.id
				? landed
					? "done"
					: "in_review"
				: entry.subs.get(s.id)?.run;
		const allDone = (change.subtasks ?? []).every(
			(s) => subStatus(s) === "done",
		);
		const ahead = git(
			["rev-list", "--count", `origin/${base}..origin/${target}`],
			{ allowFail: true },
		).out;
		if (ahead && ahead !== "0")
			await ensureMainPR(change, { base, adapter, allDone, subStatus });
		return landed ? "done" : "review";
	} finally {
		git(["worktree", "remove", "--force", wt], { allowFail: true });
		git(["branch", "-D", localBranch], { allowFail: true });
	}
}

// ---------- commands ----------

function cmdValidate() {
	const changes = loadChanges();
	const cfgCheck = validateAgentsConfig();
	const changeCheck = validate(changes);
	const errors = [...cfgCheck.errors, ...changeCheck.errors];
	const warnings = [...cfgCheck.warnings, ...changeCheck.warnings];
	if (WORK === "work")
		warnings.push(
			"changes are still in work/: the roles now expect spec/. Rename it: git mv work spec",
		);
	console.log(
		`.agents: ${cfgCheck.agents?.length ?? 0} roles, ${cfgCheck.skills?.length ?? 0} skills`,
	);
	for (const w of warnings) console.log(`⚠️  ${w}`);
	for (const e of errors) console.log(`❌ ${e}`);
	if (errors.length) process.exit(1);
	console.log(
		`✅ ${WORK}/changes valid (${changes.length} change(s), ${warnings.length} warning(s))`,
	);
}

function cmdRender() {
	renderAll(loadChanges());
	console.log(`✅ wrote ${WORK}/BACKLOG.md and tasks.md in every change`);
}

async function cmdStatus() {
	git(["fetch", "origin", "--prune"], { allowFail: true });
	printStatus(
		await computeStatus(
			loadChanges(),
			makeAdapter(),
			loadState(),
			detectBase(),
		),
	);
}

function cmdApprove(ids) {
	if (ids.length === 0)
		die("give change IDs: agent-workflow approve PROJ-123 add-rooms");
	const changes = loadChanges();
	let failed = false;
	for (const id of ids) {
		const c = changes.find((x) => x.id === id);
		const problems = [];
		if (!c || c._missing)
			problems.push("no such change (spec/changes/<ID>/change.json)");
		else {
			if (c.status === "cancelled") problems.push("change cancelled");
			if ((c.openQuestions ?? []).length)
				problems.push("change.json has openQuestions");
			const dir = changeDir(c._dir);
			problems.push(...proposalProblems(readText(join(dir, "proposal.md"))));
			problems.push(...designProblems(readText(join(dir, "design.md"))));
			problems.push(
				...validate([{ ...c, status: "draft" }]).errors.filter(
					(e) => !e.includes("depends on change"),
				),
			);
		}
		if (problems.length) {
			failed = true;
			console.log(`❌ ${id}: ${problems.join("; ")}`);
			continue;
		}
		c.status = "approved";
		c.approvedAt = today();
		c.approvalHash = approvalHash(c);
		saveChange(c);
		console.log(
			`✅ ${id} approved (${c.subtasks.length} subtask(s), fingerprint ${c.approvalHash})`,
		);
	}
	renderAll(loadChanges());
	if (failed) process.exit(1);
}

async function cmdPublish() {
	const adapter = makeAdapter();
	if (adapter.name !== "github") {
		log(
			`platform ${adapter.name}: no issue tracker. Changes stay in spec/changes (tracker key as ID or the "jira" field).`,
		);
		return;
	}
	mkdirSync(STATE_DIR, { recursive: true });
	for (const c of topoOrder(
		loadChanges().filter((x) => x.status === "approved"),
	)) {
		const existing = adapter.findIssue(c);
		if (existing) {
			log(`= ${c.id} already has issue #${existing.number}`);
			continue;
		}
		const body = [
			`Change from \`${WORK}/changes/${c._dir}/\` (proposal, design, subtasks). Branch: \`${taskBranch(c)}\`.`,
			(c.dependsOn ?? []).length ? `Depends on: ${c.dependsOn.join(", ")}` : "",
			"",
			"### Subtasks",
			...(c.subtasks ?? []).flatMap((st) => [
				`- [ ] **${st.id}** ${st.title}`,
				...(st.acceptanceCriteria ?? []).map((ac) => `  - ${acLine(ac)}`),
			]),
		].join("\n");
		const file = join(STATE_DIR, `${c.id}.issue.md`);
		writeFileSync(file, body);
		log(`+ ${c.id} → issue #${adapter.createIssue(c, file)}`);
	}
}

function acquireLock() {
	mkdirSync(STATE_DIR, { recursive: true });
	if (existsSync(LOCK_FILE)) {
		const pid = Number(readFileSync(LOCK_FILE, "utf8"));
		let alive = false;
		try {
			process.kill(pid, 0);
			alive = true;
		} catch {}
		if (alive)
			die(
				`the loop is already running (pid ${pid}). Remove ${LOCK_FILE} if that is not true.`,
			);
	}
	writeFileSync(LOCK_FILE, String(process.pid));
	process.on("exit", () => rmSync(LOCK_FILE, { force: true }));
	process.on("SIGINT", () => process.exit(130));
	process.on("SIGTERM", () => process.exit(143));
}

async function cmdRun(flags) {
	const changes = loadChanges();
	const { errors } = validate(changes);
	if (errors.length)
		die(
			`spec/changes has errors (agent-workflow validate):\n${errors.join("\n")}`,
		);
	acquireLock();
	const base = detectBase();
	const adapter = makeAdapter();
	const state = loadState();
	if (flags.retry) {
		delete state.blocked[flags.retry];
		delete state.attempts[flags.retry];
		saveState(state);
		const c = changes.find((x) => x.id === flags.retry.split("/")[0]);
		if (c) await adapter.unblock(c);
	}
	log(
		`base: ${base}, platform: ${adapter.name}, agent: ${runnerLabel()}, auto-merge subtasks: ${cfg.autoMerge ? "yes" : "no"}, max: ${flags.max}`,
	);

	let handled = 0;
	const dryDone = new Set();
	while (handled < flags.max) {
		git(["fetch", "origin", "--prune"], { allowFail: true });
		const status = await computeStatus(
			changes,
			adapter,
			state,
			base,
			flags.retry,
		);
		let next = null;
		for (const c of topoOrder(changes)) {
			const s = status.get(c.id);
			if (s?.run !== "in_progress" || (flags.change && c.id !== flags.change))
				continue;
			const st = topoOrder(c.subtasks).find(
				(x) =>
					s.subs.get(x.id)?.run === "todo" && !dryDone.has(`${c.id}/${x.id}`),
			);
			if (st) {
				next = { change: c, st, entry: s };
				break;
			}
		}
		if (!next) {
			printStatus(status);
			const pending = [...status.values()].filter((s) =>
				["in_progress", "in_review", "waiting"].includes(s.run),
			);
			if (pending.length && flags.watch && !flags.dryRun) {
				log(
					`nothing ready, ${pending.length} change(s) wait for review/merge. Checking again in ${cfg.pollMin} min…`,
				);
				await new Promise((r) => setTimeout(r, cfg.pollMin * 60_000));
				continue;
			}
			log(
				pending.length
					? "nothing ready: waiting for your merge or an unblock"
					: "no work left 🎉",
			);
			break;
		}
		const key = `${next.change.id}/${next.st.id}`;
		const outcome = await runSubtask(next.change, next.st, {
			base,
			adapter,
			state,
			dryRun: flags.dryRun,
			entry: next.entry,
		});
		handled += 1;
		if (flags.dryRun) dryDone.add(key);
		if (outcome === "no_changes" && !state.blocked[key]) continue;
	}
	log(`done: handled ${handled} subtask(s)`);
}

function parseFlags(argv) {
	const flags = {
		max: 1,
		watch: false,
		dryRun: false,
		change: null,
		retry: null,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--max") flags.max = Number(argv[++i]);
		else if (a === "--watch") {
			flags.watch = true;
			if (flags.max === 1) flags.max = Number.POSITIVE_INFINITY;
		} else if (a === "--dry-run") flags.dryRun = true;
		else if (a === "--change") flags.change = argv[++i];
		else if (a === "--retry") flags.retry = argv[++i];
		else die(`unknown flag ${a}`);
	}
	return flags;
}

export async function main(argv = process.argv.slice(2)) {
	const [cmd, ...rest] = argv;
	switch (cmd) {
		case "validate":
			return cmdValidate();
		case "render":
			return cmdRender();
		case "status":
			return cmdStatus();
		case "approve":
			return cmdApprove(rest);
		case "publish":
			return cmdPublish();
		case "run":
			return cmdRun(parseFlags(rest));
		default:
			console.log(
				"Usage: agent-workflow validate | render | status | approve <ID…> | publish | loop [--max N] [--watch] [--change ID] [--retry ID/ST-01] [--dry-run]",
			);
			process.exit(cmd ? 1 : 0);
	}
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main().catch((e) => die(e.message));
}
