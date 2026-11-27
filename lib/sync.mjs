// Sync of @przemeq25/agent-workflow.
//
// 1. Managed files: the package copies roles, team skills, the guard, templates, docs and AGENTS.md into the
//    project (committed). A manifest (.agents/.managed.json) records their hashes, so a local edit is never
//    overwritten silently.
// 2. Tool adapters: from the canonical roles in .agents/agents/ it generates the files each tool needs
//    (.claude/, CLAUDE.md, .codex/agents/, .opencode/agents/, .kilo/agents/). They are git-ignored and recorded in
//    .agents/.generated.json, so a hand-written file with the same name is never overwritten.
//
// Which tools get adapters: AGENT_WORKFLOW_TOOLS env > .agents/workflow.local.json (per developer)
// > .agents/workflow.json (project) > none. With no tools only .agents/ and AGENTS.md exist; tools that
// read AGENTS.md natively work with that alone.

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
export const TOOLS = ["claude", "codex", "opencode", "kilo"];
// Tools the agent loop can run as its runner.
export const RUNNERS = ["claude", "codex", "opencode"];
// Model tiers of a role (frontmatter `tier`), mapped per tool by models.<tool>.<tier>. `inherit` = no model,
// the tool's own default. `strong` is the old name of `high`.
export const TIERS = ["high", "standard", "low", "inherit"];
export const TIER_ALIASES = { strong: "high" };
export const SUGGESTED_MODELS = {
	claude: { high: "opus", standard: "sonnet", low: "haiku" },
	codex: {},
	opencode: {},
	kilo: {},
};
export const RULE_SKILLS = [
	"workflow-rules",
	"business-rules",
	"engineering-rules",
	"review-rules",
	"testing-rules",
];

const MANAGED = [
	["managed/agents", ".agents/agents"],
	["managed/commands", ".agents/commands"],
	["managed/skills", ".agents/skills"],
	["managed/hooks", ".agents/hooks"],
	["managed/templates", ".agents/templates"],
	["managed/docs", ".agents/docs"],
	["managed/AGENTS.md", "AGENTS.md"],
];
const MANAGED_MANIFEST = ".agents/.managed.json";
const GENERATED_MANIFEST = ".agents/.generated.json";

const DEFAULTS = {
	tools: [],
	defaultAgent: "tech-lead",
	models: { claude: {}, codex: {}, opencode: {}, kilo: {} },
	guard: {},
	claude: { skills: "auto", permissions: { allow: [], deny: [] } },
	codex: {},
	opencode: { bashDeny: [] },
	kilo: {},
	loop: {},
	// MCP servers per role: { "<server>": ["qa", "tech-lead"] }. A listed server is allowed for those roles and
	// switched off for every other role; servers not listed here are left to the tool's own configuration.
	mcp: {},
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
	for (const [server, roles] of Object.entries(cfg.mcp ?? {}))
		if (
			!/^[\w.-]+$/.test(server) ||
			!Array.isArray(roles) ||
			roles.some((r) => typeof r !== "string")
		)
			throw new Error(
				`mcp.${server} must be a list of role names (server names: letters, digits, . _ -)`,
			);
	for (const map of Object.values(cfg.models ?? {}))
		if (isObject(map))
			for (const [old, tier] of Object.entries(TIER_ALIASES))
				if (map[old] && !map[tier]) map[tier] = map[old];
	return cfg;
}

export function modelFor(cfg, tool, tier) {
	const t = TIER_ALIASES[tier] ?? tier;
	if (t === "inherit") return undefined;
	return cfg.models?.[tool]?.[t] || undefined;
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

// Commands (`.agents/commands/*.md`): slash commands such as /prd. Claude Code, OpenCode and Kilo get a command
// file; Codex has no project commands, so it gets an explicit-only skill invoked as $<name>.
export function readCommands(root, report) {
	const dir = join(root, ".agents", "commands");
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(".md"))
		.sort()
		.map((f) => {
			const parsed = parseFrontmatter(readFileSync(join(dir, f), "utf8"));
			if (!parsed) {
				report?.conflicts.push(
					`.agents/commands/${f}: missing frontmatter, skipped`,
				);
				return null;
			}
			const d = parsed.data;
			return {
				file: `.agents/commands/${f}`,
				name: String(d.name || f.replace(/\.md$/, "")),
				description: String(d.description ?? ""),
				argumentHint:
					typeof d["argument-hint"] === "string" ? d["argument-hint"] : "",
				tier: TIER_ALIASES[d.tier] ?? (d.tier || "high"),
				body: parsed.body,
			};
		})
		.filter(Boolean);
}

const commandNote = (cmd) =>
	`<!-- Generated by ${PKG.name} from ${cmd.file}. Do not edit: change the command and run \`agent-workflow sync\`. -->`;

function commandBody(cmd, tool) {
	const body =
		tool === "codex"
			? cmd.body.replaceAll(
					"`$ARGUMENTS`",
					`the text the user wrote after \`$${cmd.name}\``,
				)
			: cmd.body;
	return `${body.trimEnd()}\n\n## Asking the user (${tool})\n\n${ASK[tool].join("\n")}\n`;
}

function commandFile(cmd, cfg, tool) {
	const lines = ["---", `description: ${JSON.stringify(cmd.description)}`];
	if (tool === "claude") {
		if (cmd.argumentHint)
			lines.push(`argument-hint: ${JSON.stringify(cmd.argumentHint)}`);
		lines.push("disable-model-invocation: true");
	}
	const model = modelFor(cfg, tool, cmd.tier);
	if (model) lines.push(`model: ${model}`);
	lines.push(
		"---",
		"",
		commandNote(cmd),
		"",
		commandBody(cmd, tool).trimEnd(),
		"",
	);
	return lines.join("\n");
}

function codexCommandSkill(cmd) {
	return [
		"---",
		`name: ${cmd.name}`,
		`description: ${JSON.stringify(`${cmd.description} Run only when the user invokes $${cmd.name}.`)}`,
		"disable-model-invocation: true",
		"---",
		"",
		commandNote(cmd),
		"",
		commandBody(cmd, "codex").trimEnd(),
		"",
	].join("\n");
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
				tier: TIER_ALIASES[d.tier] ?? (d.tier || "inherit"),
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

// ---------- asking the user ----------

// How each tool shows a question to the user. Appended to every generated role, so the canonical roles stay
// tool-independent. Subagents cannot reach the user in these tools; they return questions in their report.
const ASK = {
	claude: [
		"Ask through the `AskUserQuestion` tool, never as questions buried in prose. One call holds up to 4 questions;",
		"each has a header of at most 12 characters, the full question and 2-4 options with a label and a one-line",
		'description. Put your recommended option first and end its label with "(Recommended)". The user can always',
		'type their own answer, so add no "Other" option. Set `multiSelect: true` only when several answers can apply.',
		"With more than 4 questions, ask the ones that block work first.",
	],
	opencode: [
		"Ask through the `question` tool, never as questions buried in prose. Each question has a header of at most",
		"30 characters, the full question and options with a label and a one-line description. Put your recommended",
		'option first and end its label with "(Recommended)". A custom answer is always possible, so add no "Other"',
		"option. Set `multiple: true` only when several answers can apply. Group related questions in one call.",
	],
	codex: [
		"Ask through `request_user_input` when it is available (Plan mode, or `features.default_mode_request_user_input`",
		"in the Codex config), with 2-3 options per question and your recommended option first. When it is not",
		"available, use the numbered format from Asking the user in `AGENTS.md` and stop until the user answers.",
	],
};
ASK.kilo = ASK.opencode;
const ASK_SUBAGENT = [
	"You run as a subagent and cannot ask the user. Put open questions at the top of your report, each with your",
	"recommendation and what is blocked until it is answered, and let the coordinator ask.",
];

const interactive = (role) =>
	role.mode !== "subagent" && role.name !== "autopilot";

function withAsk(role, tool) {
	const text = interactive(role) ? ASK[tool] : ASK_SUBAGENT;
	return `${role.body.trimEnd()}\n\n## Asking the user (${tool})\n\n${text.join("\n")}\n`;
}

// ---------- adapters ----------

const GUARD = '"$CLAUDE_PROJECT_DIR/.agents/hooks/guard.mjs"';
const HOOK_MATCHER = "Bash|Edit|Write|MultiEdit|NotebookEdit";

// MCP servers this role may use, and the ones switched off for it (only servers named in cfg.mcp).
export function mcpAccess(role, cfg) {
	const allow = [];
	const deny = [];
	for (const [server, roles] of Object.entries(cfg.mcp ?? {}))
		(roles.includes(role.name) ? allow : deny).push(server);
	return { allow, deny };
}

function claudeAgent(role, cfg) {
	const lines = [
		"---",
		`name: ${role.name}`,
		`description: ${JSON.stringify(role.description)}`,
	];
	const model = modelFor(cfg, "claude", role.tier);
	if (model) lines.push(`model: ${model}`);
	const mcp = mcpAccess(role, cfg);
	if (role.access === "read-only")
		lines.push(
			`tools: ${["Read", "Glob", "Grep", "Bash", ...mcp.allow.map((s) => `mcp__${s}`)].join(", ")}`,
		);
	else lines.push("permissionMode: acceptEdits");
	if (mcp.deny.length && role.access !== "read-only")
		lines.push(
			`disallowedTools: ${mcp.deny.map((s) => `mcp__${s}`).join(", ")}`,
		);
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
	lines.push("---", "", note(role), "", withAsk(role, "claude").trimEnd(), "");
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
	const model = modelFor(cfg, "codex", role.tier);
	if (model) lines.push(`model = ${JSON.stringify(model)}`);
	lines.push(
		`sandbox_mode = "${role.access === "read-only" ? "read-only" : "workspace-write"}"`,
		`developer_instructions = ${tomlMultiline(withAsk(role, "codex"))}`,
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
	"git push --force",
	"git push --force *",
	"git push -f*",
	"git push --force-with-lease",
	"gh pr merge*",
	"sudo *",
];

// The guard hook blocks pushes to the protected branches only in Claude Code. OpenCode and Kilo get the same
// rule as permission patterns (whole-value wildcards, last match wins): the branch as a separate argument,
// after a refspec colon or after a slash (origin/main, refs/heads/main), and a bare `git push`.
export function protectedPushDeny(cfg) {
	const branches = [
		...new Set([String(cfg.guard?.defaultBranch ?? "main"), "main", "master"]),
	];
	return [
		"git push",
		...branches.flatMap((b) => [
			`git push * ${b}`,
			`git push * ${b} *`,
			`git push *:${b}`,
			`git push *:${b} *`,
			`git push */${b}`,
			`git push */${b} *`,
			`git push * +${b}`,
			`git push * +${b} *`,
		]),
	];
}

// OpenCode and Kilo share the agent format (Kilo is built on OpenCode). Kilo asks for approval of every tool
// by default, including reading files and the question tool, so its agents allow those explicitly.
// OpenCode and Kilo name MCP tools <server>_<tool>; a denied server is removed from the agent.
function mcpPermission(role, cfg) {
	const { allow, deny } = mcpAccess(role, cfg);
	return [
		...allow.map((s) => `  ${JSON.stringify(`${s}_*`)}: allow`),
		...deny.map((s) => `  ${JSON.stringify(`${s}_*`)}: deny`),
	];
}

function opencodeAgent(role, cfg, tool = "opencode") {
	const bash = new Map();
	if (role.access === "read-only") {
		bash.set("*", "deny");
		for (const c of READ_ONLY_BASH) bash.set(c, "allow");
	} else {
		bash.set("*", "allow");
		if (role.access !== "full")
			for (const c of NO_COMMIT_DENY) bash.set(c, "deny");
		const extra = cfg[tool]?.bashDeny ?? cfg.opencode?.bashDeny ?? [];
		for (const c of [...ALWAYS_DENY, ...protectedPushDeny(cfg), ...extra])
			bash.set(c, "deny");
	}
	const lines = [
		"---",
		`description: ${JSON.stringify(role.description)}`,
		`mode: ${role.mode}`,
	];
	const model = modelFor(cfg, tool, role.tier);
	if (model) lines.push(`model: ${model}`);
	lines.push("permission:");
	if (tool === "kilo")
		lines.push(
			"  read: allow",
			"  glob: allow",
			"  grep: allow",
			"  list: allow",
			`  task: ${role.mode === "subagent" ? "deny" : "allow"}`,
		);
	// The question tool is the picker shown in the terminal; subagents cannot reach the user.
	lines.push(`  question: ${interactive(role) ? "allow" : "deny"}`);
	lines.push(
		`  edit: ${role.access === "read-only" ? "deny" : "allow"}`,
		"  bash:",
		...[...bash].map(([k, v]) => `    ${JSON.stringify(k)}: ${v}`),
		...mcpPermission(role, cfg),
		"---",
		"",
		note(role),
		"",
		withAsk(role, tool).trimEnd(),
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
			removeEmptyParents(root, dirname(dest));
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
				removeEmptyParents(root, dirname(dest));
			}
			writeFile(path, `${JSON.stringify({ files: next }, null, 2)}\n`);
		},
	};
}

// .claude/agents/ → .claude/ are removed once empty; the project root never is.
function removeEmptyParents(root, dir) {
	while (dir.startsWith(root + sep) && existsSync(dir)) {
		if (readdirSync(dir).length) return;
		rmSync(dir, { recursive: true });
		dir = dirname(dir);
	}
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
	"/.kilo/agents/",
	"/.claude/commands/",
	"/.opencode/commands/",
	"/.kilo/commands/",
	"/.agents/workflow.local.json",
	"/.agents/.generated.json",
	"/.agent-loop/",
];

function ensureGitignore(root, report, extra = []) {
	const path = join(root, ".gitignore");
	const text = existsSync(path) ? readFileSync(path, "utf8") : "";
	const block = [IGNORE_START, ...IGNORE_LINES, ...extra, IGNORE_END].join(
		"\n",
	);
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
	if (cfg.tools.includes("kilo"))
		for (const role of roles)
			gen.write(
				`.kilo/agents/${role.name}.md`,
				opencodeAgent(role, cfg, "kilo"),
				report,
				force,
			);

	const commands = readCommands(root, report);
	const COMMAND_DIRS = {
		claude: ".claude/commands",
		opencode: ".opencode/commands",
		kilo: ".kilo/commands",
	};
	for (const [tool, dir] of Object.entries(COMMAND_DIRS))
		if (cfg.tools.includes(tool))
			for (const cmd of commands)
				gen.write(
					`${dir}/${cmd.name}.md`,
					commandFile(cmd, cfg, tool),
					report,
					force,
				);
	if (cfg.tools.includes("codex"))
		for (const cmd of commands) {
			gen.write(
				`.agents/skills/${cmd.name}/SKILL.md`,
				codexCommandSkill(cmd),
				report,
				force,
			);
			gen.write(
				`.agents/skills/${cmd.name}/agents/openai.yaml`,
				"policy:\n  allow_implicit_invocation: false\n",
				report,
				force,
			);
		}
	gen.finish(report);
	// The Codex form of each command lives in .agents/skills/<name>/ and is generated, so it is ignored too.
	if (managed)
		ensureGitignore(
			root,
			report,
			commands.map((c) => `/.agents/skills/${c.name}/`),
		);

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
	const keep = join(root, "openspec", "changes", ".gitkeep");
	if (!existsSync(join(root, "openspec", "changes"))) {
		writeFile(keep, "");
		created.push("openspec/changes/.gitkeep");
	}
	return created;
}
