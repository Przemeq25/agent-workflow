// Sync of @przemeq25/agent-workflow.
//
// 1. Managed files: the package copies roles, team skills, the guard, templates, docs and AGENTS.md into the
//    project (committed). A manifest (.agents/.managed.json) records their hashes, so a local edit is never
//    overwritten silently.
// 2. Tool adapters: from the canonical roles in .agents/agents/ it generates the files each tool needs
//    (.claude/, CLAUDE.md, .codex/agents/, .opencode/agents/). They are git-ignored and recorded in
//    .agents/.generated.json, so a hand-written file with the same name is never overwritten.
//
// Which tools get adapters: AGENT_WORKFLOW_TOOLS env > .agents/workflow.local.json (per developer)
// > .agents/workflow.json (project) > ["claude"].

import { createHash } from "node:crypto";
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PKG = JSON.parse(
	readFileSync(join(PKG_ROOT, "package.json"), "utf8"),
);
export const TOOLS = ["claude", "codex", "opencode"];
export const RULE_SKILLS = [
	"workflow-rules",
	"business-rules",
	"engineering-rules",
	"review-rules",
	"testing-rules",
];

const MANAGED = [
	["managed/agents", ".agents/agents"],
	["managed/skills", ".agents/skills"],
	["managed/hooks", ".agents/hooks"],
	["managed/templates", ".agents/templates"],
	["managed/docs", ".agents/docs"],
	["managed/AGENTS.md", "AGENTS.md"],
];
const MANAGED_MANIFEST = ".agents/.managed.json";
const GENERATED_MANIFEST = ".agents/.generated.json";

const DEFAULTS = {
	tools: ["claude"],
	defaultAgent: "tech-lead",
	models: {
		claude: { strong: "opus", standard: "sonnet", inherit: "inherit" },
		codex: {},
		opencode: {},
	},
	guard: {},
	claude: { skills: "auto", permissions: { allow: [], deny: [] } },
	codex: {},
	opencode: { bashDeny: [] },
	loop: {},
};

// ---------- helpers ----------

const sha = (text) =>
	createHash("sha256").update(text).digest("hex").slice(0, 16);
const posix = (p) => p.split(sep).join("/");
const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

function deepMerge(...items) {
	const out = {};
	for (const item of items) {
		if (!isObject(item)) continue;
		for (const [k, v] of Object.entries(item))
			out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : v;
	}
	return out;
}

function readJson(file) {
	if (!existsSync(file)) return null;
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch (e) {
		throw new Error(`${file} is not valid JSON: ${e.message}`);
	}
}

function listFiles(dir) {
	if (!existsSync(dir)) return [];
	if (!lstatSync(dir).isDirectory()) return [dir];
	return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
		d.isDirectory() ? listFiles(join(dir, d.name)) : [join(dir, d.name)],
	);
}

function writeFile(file, content) {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

// ---------- configuration ----------

export function loadConfig(root, { tools } = {}) {
	const project = readJson(join(root, ".agents", "workflow.json")) ?? {};
	const local = readJson(join(root, ".agents", "workflow.local.json")) ?? {};
	// A developer may choose tools, models and the loop runner, never weaker guard rules.
	const { guard: _ignored, ...localSafe } = local;
	const cfg = deepMerge(DEFAULTS, project, localSafe);
	const env = process.env.AGENT_WORKFLOW_TOOLS;
	const chosen = tools ?? (env ? env.split(",") : cfg.tools);
	cfg.tools = [...new Set(chosen.map((t) => t.trim()).filter(Boolean))];
	for (const t of cfg.tools)
		if (!TOOLS.includes(t))
			throw new Error(`unknown tool "${t}" (supported: ${TOOLS.join(", ")})`);
	return cfg;
}

// ---------- roles ----------

export function parseFrontmatter(text) {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!m) return null;
	const data = {};
	let key = null;
	for (const line of (m[1] ?? "").split(/\r?\n/)) {
		const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
		if (kv) {
			key = kv[1];
			const v = (kv[2] ?? "").trim();
			data[key] =
				v === ""
					? []
					: v.startsWith('"')
						? JSON.parse(v)
						: v.replace(/^'|'$/g, "");
			continue;
		}
		const item = line.match(/^\s+-\s+(.+)$/);
		if (key && item && Array.isArray(data[key]))
			data[key].push((item[1] ?? "").trim());
	}
	return { data, body: text.slice(m[0].length).replace(/^\s*\n/, "") };
}

export function readRoles(root, report) {
	const dir = join(root, ".agents", "agents");
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(".md"))
		.sort()
		.map((f) => {
			const parsed = parseFrontmatter(readFileSync(join(dir, f), "utf8"));
			if (!parsed) {
				const msg = `.agents/agents/${f}: missing frontmatter, no adapters generated for it`;
				if (!report) throw new Error(msg);
				report.conflicts.push(msg);
				return null;
			}
			const d = parsed.data;
			return {
				file: `.agents/agents/${f}`,
				name: String(d.name || f.replace(/\.md$/, "")),
				description: Array.isArray(d.description)
					? d.description.join(" ")
					: String(d.description ?? ""),
				tier: d.tier || "inherit",
				access: d.access || "full",
				mode: d.mode || "subagent",
				skills: Array.isArray(d.skills) ? d.skills : [],
				body: parsed.body,
			};
		})
		.filter(Boolean);
}

const note = (role) =>
	`<!-- Generated by ${PKG.name} from ${role.file}. Do not edit: change the role and run \`agent-workflow sync\`. -->`;

// ---------- adapters ----------

const GUARD = '"$CLAUDE_PROJECT_DIR/.agents/hooks/guard.mjs"';
const HOOK_MATCHER = "Bash|Edit|Write|MultiEdit|NotebookEdit";

function claudeAgent(role, cfg) {
	const lines = [
		"---",
		`name: ${role.name}`,
		`description: ${JSON.stringify(role.description)}`,
	];
	const model = cfg.models.claude?.[role.tier];
	if (model) lines.push(`model: ${model}`);
	if (role.access === "read-only") lines.push("tools: Read, Glob, Grep, Bash");
	else lines.push("permissionMode: acceptEdits");
	if (role.skills.length)
		lines.push("skills:", ...role.skills.map((s) => `  - ${s}`));
	if (role.access !== "full")
		lines.push(
			"hooks:",
			"  PreToolUse:",
			`    - matcher: "${HOOK_MATCHER}"`,
			"      hooks:",
			"        - type: command",
			`          command: node ${GUARD} --role ${role.access}`,
		);
	lines.push("---", "", note(role), "", role.body.trimEnd(), "");
	return lines.join("\n");
}

function claudeSettings(cfg) {
	const extra = cfg.claude?.permissions ?? {};
	return `${JSON.stringify(
		{
			$schema: "https://json.schemastore.org/claude-code-settings.json",
			agent: cfg.defaultAgent,
			permissions: {
				defaultMode: "acceptEdits",
				allow: [
					"Bash",
					"Read",
					"Edit",
					"Write",
					"MultiEdit",
					"Glob",
					"Grep",
					"WebFetch",
					"WebSearch",
					"Task",
					"Skill",
					"TodoWrite",
					...(extra.allow ?? []),
				],
				deny: [
					"Read(./.env)",
					"Read(./.env.local)",
					"Bash(git push --force *)",
					"Bash(git push -f *)",
					"Bash(gh pr merge *)",
					"Bash(sudo *)",
					...(extra.deny ?? []),
				],
			},
			hooks: {
				PreToolUse: [
					{
						matcher: HOOK_MATCHER,
						hooks: [{ type: "command", command: `node ${GUARD}` }],
					},
				],
			},
		},
		null,
		"\t",
	)}\n`;
}

function tomlMultiline(text) {
	if (!text.includes("'''")) return `'''\n${text}'''`;
	return `"""\n${text.replaceAll("\\", "\\\\").replaceAll('"""', '\\"""')}"""`;
}

function codexAgent(role, cfg) {
	const lines = [
		`# Generated by ${PKG.name} from ${role.file}. Do not edit: change the role and run \`agent-workflow sync\`.`,
		`name = ${JSON.stringify(role.name)}`,
		`description = ${JSON.stringify(role.description)}`,
	];
	const model = cfg.models.codex?.[role.tier];
	if (model) lines.push(`model = ${JSON.stringify(model)}`);
	lines.push(
		`sandbox_mode = "${role.access === "read-only" ? "read-only" : "workspace-write"}"`,
		`developer_instructions = ${tomlMultiline(`${role.body.trimEnd()}\n`)}`,
		"",
	);
	return lines.join("\n");
}

const READ_ONLY_BASH = [
	"git diff*",
	"git status*",
	"git log*",
	"git show*",
	"git grep*",
	"git blame*",
	"rg *",
	"grep *",
	"ls*",
	"cat *",
	"head *",
	"tail *",
	"wc *",
];
const NO_COMMIT_DENY = [
	"git commit*",
	"git push*",
	"git merge*",
	"git rebase*",
	"git checkout*",
	"git switch*",
	"git worktree*",
	"gh *",
];
const ALWAYS_DENY = [
	"git push --force*",
	"git push -f*",
	"gh pr merge*",
	"sudo *",
];

function opencodeAgent(role, cfg) {
	const bash = new Map();
	if (role.access === "read-only") {
		bash.set("*", "deny");
		for (const c of READ_ONLY_BASH) bash.set(c, "allow");
	} else {
		bash.set("*", "allow");
		if (role.access !== "full")
			for (const c of NO_COMMIT_DENY) bash.set(c, "deny");
		for (const c of [...ALWAYS_DENY, ...(cfg.opencode?.bashDeny ?? [])])
			bash.set(c, "deny");
	}
	const lines = [
		"---",
		`description: ${JSON.stringify(role.description)}`,
		`mode: ${role.mode}`,
	];
	const model = cfg.models.opencode?.[role.tier];
	if (model) lines.push(`model: ${model}`);
	lines.push(
		"permission:",
		`  edit: ${role.access === "read-only" ? "deny" : "allow"}`,
		"  bash:",
		...[...bash].map(([k, v]) => `    ${JSON.stringify(k)}: ${v}`),
		"---",
		"",
		note(role),
		"",
		role.body.trimEnd(),
		"",
	);
	return lines.join("\n");
}

// ---------- managed files ----------

function managedSources() {
	return MANAGED.flatMap(([src, dest]) =>
		listFiles(join(PKG_ROOT, src)).map((abs) => ({
			abs,
			rel: posix(join(dest, relative(join(PKG_ROOT, src), abs))),
		})),
	).map((f) => ({ ...f, rel: f.rel.replace(/\/$/, "") }));
}

function syncManaged(root, { force, check, report }) {
	const manifestPath = join(root, MANAGED_MANIFEST);
	const old = readJson(manifestPath) ?? { files: {} };
	const files = {};
	for (const { abs, rel } of managedSources()) {
		const content = readFileSync(abs, "utf8");
		const next = sha(content);
		const dest = join(root, rel);
		const current = existsSync(dest) ? sha(readFileSync(dest, "utf8")) : null;
		if (current === next) {
			files[rel] = next;
			continue;
		}
		const known = old.files?.[rel];
		const localEdit = current !== null && current !== known;
		if (localEdit && !force) {
			report.conflicts.push(
				known
					? `${rel}: changed locally, kept (run with --force to replace it)`
					: `${rel}: exists and is not managed, kept (move your content to a project skill, then run with --force)`,
			);
			if (known) files[rel] = known;
			continue;
		}
		report.drift.push(rel);
		if (!check) {
			writeFile(dest, content);
			report.written.push(rel);
		}
		files[rel] = next;
	}
	for (const [rel, hash] of Object.entries(old.files ?? {})) {
		if (files[rel]) continue;
		const dest = join(root, rel);
		if (!existsSync(dest)) continue;
		if (sha(readFileSync(dest, "utf8")) !== hash) {
			report.conflicts.push(
				`${rel}: no longer managed but changed locally, kept`,
			);
			continue;
		}
		report.drift.push(rel);
		if (!check) {
			rmSync(dest);
			report.removed.push(rel);
		}
	}
	if (!check)
		writeFile(
			manifestPath,
			`${JSON.stringify({ package: PKG.name, version: PKG.version, files }, null, 2)}\n`,
		);
}

// ---------- generated files ----------

function generated(root) {
	const path = join(root, GENERATED_MANIFEST);
	const data = readJson(path) ?? { files: {} };
	const next = {};
	return {
		write(rel, content, report, force) {
			const dest = join(root, rel);
			const current = existsSync(dest) ? sha(readFileSync(dest, "utf8")) : null;
			const known = data.files?.[rel];
			if (current !== null && current !== known && !force) {
				report.conflicts.push(
					`${rel}: not generated by ${PKG.name}, kept (remove it or run with --force)`,
				);
				return;
			}
			const hash = sha(content);
			if (current !== hash) {
				writeFile(dest, content);
				report.written.push(rel);
			}
			next[rel] = hash;
		},
		keep(rel, hash) {
			next[rel] = hash;
		},
		finish(report) {
			for (const [rel, hash] of Object.entries(data.files ?? {})) {
				if (next[rel]) continue;
				const dest = join(root, rel);
				if (!existsSync(dest)) continue;
				const isLink = lstatSync(dest).isSymbolicLink();
				if (
					!isLink &&
					hash !== "dir" &&
					sha(readFileSync(dest, "utf8")) !== hash
				)
					continue;
				rmSync(dest, { recursive: true, force: true });
				report.removed.push(rel);
			}
			writeFile(path, `${JSON.stringify({ files: next }, null, 2)}\n`);
		},
	};
}

function linkClaudeSkills(root, cfg, gen, report, force) {
	const rel = ".claude/skills";
	const dest = join(root, rel);
	const target = join(root, ".agents", "skills");
	const mode =
		cfg.claude?.skills === "auto"
			? process.platform === "win32"
				? "copy"
				: "link"
			: (cfg.claude?.skills ?? "link");
	const exists = existsSync(dest) || isBrokenLink(dest);
	if (exists) {
		const stat = lstatSync(dest);
		const ours =
			stat.isSymbolicLink() || existsSync(join(dest, ".agent-workflow"));
		if (!ours && !force) {
			report.conflicts.push(
				`${rel}: a real folder that ${PKG.name} did not create, kept. Move its skills to .agents/skills/ and delete it.`,
			);
			return;
		}
		if (
			mode === "link" &&
			stat.isSymbolicLink() &&
			resolve(dirname(dest), readlinkSync(dest)) === target
		) {
			gen.keep(rel, "dir");
			return;
		}
		rmSync(dest, { recursive: true, force: true });
	}
	mkdirSync(dirname(dest), { recursive: true });
	if (mode === "link")
		symlinkSync(join("..", ".agents", "skills"), dest, "dir");
	else {
		cpSync(target, dest, { recursive: true, dereference: true });
		writeFileSync(join(dest, ".agent-workflow"), "copy of .agents/skills\n");
	}
	report.written.push(`${rel} (${mode})`);
	gen.keep(rel, "dir");
}

function isBrokenLink(p) {
	try {
		return lstatSync(p).isSymbolicLink();
	} catch {
		return false;
	}
}

// ---------- gitignore ----------

const IGNORE_START =
	"# >>> agent-workflow: generated tool adapters (agent-workflow sync)";
const IGNORE_END = "# <<< agent-workflow";
export const IGNORE_LINES = [
	"/.claude/agents/",
	"/.claude/skills",
	"/.claude/settings.json",
	"/CLAUDE.md",
	"/.codex/agents/",
	"/.opencode/agents/",
	"/.agents/workflow.local.json",
	"/.agents/.generated.json",
	"/.agent-loop/",
];

function ensureGitignore(root, report) {
	const path = join(root, ".gitignore");
	const text = existsSync(path) ? readFileSync(path, "utf8") : "";
	const block = [IGNORE_START, ...IGNORE_LINES, IGNORE_END].join("\n");
	const re = new RegExp(
		`${IGNORE_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${IGNORE_END}`,
	);
	const next = re.test(text)
		? text.replace(re, block)
		: `${text}${text && !text.endsWith("\n") ? "\n" : ""}${text ? "\n" : ""}${block}\n`;
	if (next !== text) {
		writeFileSync(path, next);
		report.written.push(".gitignore");
	}
}

// ---------- entry points ----------

export function syncProject(
	root,
	{ tools, force = false, check = false, quiet = false, managed = true } = {},
) {
	root = resolve(root);
	const report = {
		written: [],
		removed: [],
		conflicts: [],
		drift: [],
		tools: [],
	};
	if (managed) syncManaged(root, { force, check, report });
	const cfg = loadConfig(root, { tools });
	report.tools = cfg.tools;
	if (check) return report;

	const roles = readRoles(root, report);
	const gen = generated(root);
	if (cfg.tools.includes("claude")) {
		for (const role of roles)
			gen.write(
				`.claude/agents/${role.name}.md`,
				claudeAgent(role, cfg),
				report,
				force,
			);
		gen.write(".claude/settings.json", claudeSettings(cfg), report, force);
		gen.write(
			"CLAUDE.md",
			"<!-- Generated by agent-workflow sync: Claude Code reads AGENTS.md through this import. -->\n@AGENTS.md\n",
			report,
			force,
		);
		linkClaudeSkills(root, cfg, gen, report, force);
	}
	if (cfg.tools.includes("codex"))
		for (const role of roles)
			gen.write(
				`.codex/agents/${role.name}.toml`,
				codexAgent(role, cfg),
				report,
				force,
			);
	if (cfg.tools.includes("opencode"))
		for (const role of roles)
			gen.write(
				`.opencode/agents/${role.name}.md`,
				opencodeAgent(role, cfg),
				report,
				force,
			);
	gen.finish(report);
	if (managed) ensureGitignore(root, report);

	if (!quiet) printReport(report);
	return report;
}

export function printReport(report) {
	const log = (...a) => console.log("[agent-workflow]", ...a);
	log(
		`tools: ${report.tools.join(", ") || "none"} · written: ${report.written.length} · removed: ${report.removed.length}`,
	);
	for (const c of report.conflicts) log(`⚠️  ${c}`);
}

export function scaffold(root, { force = false } = {}) {
	root = resolve(root);
	const created = [];
	for (const abs of listFiles(join(PKG_ROOT, "scaffold"))) {
		const rel = posix(relative(join(PKG_ROOT, "scaffold"), abs));
		const destRel =
			rel === "workflow.json" ? ".agents/workflow.json" : `.agents/${rel}`;
		const dest = join(root, destRel);
		if (existsSync(dest) && !force) continue;
		writeFile(dest, readFileSync(abs, "utf8"));
		created.push(destRel);
	}
	const keep = join(root, "work", "changes", ".gitkeep");
	if (!existsSync(join(root, "work", "changes"))) {
		writeFile(keep, "");
		created.push("work/changes/.gitkeep");
	}
	return created;
}
