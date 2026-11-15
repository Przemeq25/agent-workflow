#!/usr/bin/env node
// Generic PreToolUse guard of @przemeq25/agent-workflow (managed file, do not edit).
// Speaks the Claude Code hook protocol: JSON on stdin, exit code 2 blocks the call.
// stderr is shown to the agent as the reason.
//
// Always (settings.json):  common prohibitions for every role.
// --role no-commit:         also no commit/push/merge/branch switch and no gh (autopilot, implementer).
// --role qa:                like no-commit, and edits only test files.
// --role read-only:         only safe read commands, no edits (code-reviewer).
// --role prd:               like no-commit, and edits only the product documents.
// --role prd-tech:          like no-commit, and edits only the technical documents.
//
// Project-specific parts live in the "guard" section of .agents/workflow.json (protected):
//   defaultBranch            protected branch name, default "main" (master is always protected)
//   testFiles                regex of files qa may edit
//   docRoles.prd / prd-tech  regex of files each document role may edit
//   forbiddenCommands        [[regex, reason], ...] blocked for every role (deploy CLIs, shared-DB migrations)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const configPath = join(projectDir, ".agents", "workflow.json");
let config = {};
if (existsSync(configPath)) {
	try {
		config = JSON.parse(readFileSync(configPath, "utf8")).guard ?? {};
	} catch {
		process.stderr.write(`Blocked: ${configPath} is not valid JSON.\n`);
		process.exit(2);
	}
}
const defaultBranch = String(config.defaultBranch ?? "main");
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const roleIdx = process.argv.indexOf("--role");
const role = roleIdx > -1 ? process.argv[roleIdx + 1] : "base";

let input;
try {
	input = JSON.parse(readFileSync(0, "utf8"));
} catch {
	process.exit(0);
}
const tool = input.tool_name ?? "";
const args = input.tool_input ?? {};

const block = (reason) => {
	process.stderr.write(
		`Blocked by .claude/hooks/guard.mjs (${role}): ${reason}\n`,
	);
	process.exit(2);
};

// Files no agent changes: managed workflow files, configuration, tool adapters, rules files, secrets.
const PROTECTED = [
	/(^|\/)\.agents\/(agents|hooks|templates|docs)\//,
	/(^|\/)\.agents\/skills\/team-[^/]+\//,
	/(^|\/)\.agents\/(workflow(\.local)?|\.managed|\.generated)\.json$/,
	/(^|\/)\.claude\/(agents\/|hooks\/|settings(\.local)?\.json$)/,
	/(^|\/)\.claude\/skills\/team-[^/]+\//,
	/(^|\/)\.(codex|opencode)\/agents\//,
	/(^|\/)(AGENTS|CLAUDE)\.md$/,
	/(^|\/)\.env(\..+)?$/,
];
const isProtected = (p) =>
	PROTECTED.some((re) => re.test(p)) && !/\.env\.example$/.test(p);

// Document roles: allowed edit paths (defaults match the workflow layout).
const DOC_ROLES = {
	prd: new RegExp(
		config.docRoles?.prd ??
			"(^|/)context/foundation/(prd|roadmap|prd-notes)\\.md$",
	),
	"prd-tech": new RegExp(
		config.docRoles?.["prd-tech"] ??
			"(^|/)context/(foundation/(tech-prd|tech-notes)|engineering)\\.md$",
	),
};
const TEST_FILES = new RegExp(
	config.testFiles ??
		"(\\.(test|spec)\\.[cm]?[jt]sx?$|(^|/)tests?/|(^|/)__tests__/|/verify/)",
);

const EDIT_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

if (EDIT_TOOLS.includes(tool)) {
	const path = String(args.file_path ?? args.notebook_path ?? "");
	if (isProtected(path)) block(`edit of a protected file ${path}`);
	if (role === "read-only") block("this role does not edit files");
	if (role === "qa" && !TEST_FILES.test(path))
		block(`qa edits only test files, not ${path}`);
	if (role in DOC_ROLES && !DOC_ROLES[role].test(path))
		block(`role ${role} edits only its own documents, not ${path}`);
	process.exit(0);
}

if (tool !== "Bash") process.exit(0);

const cmd = String(args.command ?? "");
const has = (re) => re.test(cmd);

// --- common prohibitions ---
const branches = [...new Set([defaultBranch, "main", "master"])]
	.map(escapeRe)
	.join("|");
const COMMON = [
	[/\bsudo\b/, "sudo"],
	[/\bch(mod|own)\b/, "changing file permissions"],
	[/\bgit\s+push\b[^\n]*(\s-f\b|--force)/, "force push"],
	[
		new RegExp(`\\bgit\\s+push\\b[^\\n]*(\\s|:|/)(${branches})\\b`),
		`push to a protected branch (${defaultBranch}/main/master)`,
	],
	[/\bgit\s+push\b\s*$/m, "push without a branch (use origin task/<ID>)"],
	[/\bgit\s+reset\s+--hard\b/, "git reset --hard"],
	[/\bgit\s+clean\s+-[a-z]*f/, "git clean -f"],
	[/\bgh\s+pr\s+merge\b/, "merging a PR (a human or the loop script merges)"],
	[
		/\bgh\s+(repo|secret|variable|auth|ssh-key|gpg-key)\b/,
		"changing repository settings or secrets",
	],
	[
		/\bgh\s+api\b[^\n]*(-X|--method)\s*(PUT|PATCH|DELETE)/i,
		"modifying gh api call",
	],
	[
		/\bgh\s+api\b[^\n]*(-X|--method)\s*POST/i,
		"modifying gh api call (use gh pr create / gh pr comment)",
	],
	[
		/\bgh\s+api\b(?![^\n]*(-X|--method)\s*GET)[^\n]*\s(-f|-F|--field|--raw-field|--input)\b/,
		"gh api with fields sends POST by default (use gh pr create / gh pr comment)",
	],
	[
		/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME)(\s|$)/,
		"recursive delete of a system directory",
	],
];
for (const [re, reason] of COMMON) if (has(re)) block(reason);
for (const [re, reason] of config.forbiddenCommands ?? [])
	if (has(new RegExp(re))) block(reason);

// writing protected files from bash (sed -i, >, tee, mv, cp, rm)
const writesProtected =
	/(\bsed\s+-i|>{1,2}|\btee\b|\bmv\b|\bcp\b|\brm\b|\bperl\s+-[a-z]*i)/.test(
		cmd,
	) &&
	/(\.agents\/(agents|hooks|templates|docs|skills\/team-|workflow|\.managed|\.generated)|\.claude\/(agents|hooks|settings)|\.(codex|opencode)\/agents|(AGENTS|CLAUDE)\.md|(^|[\s'"/])\.env(?!\.example)\b)/.test(
		cmd,
	);
if (writesProtected)
	block(
		"writing protected files (.agents workflow files, tool adapters, AGENTS.md, CLAUDE.md, .env)",
	);

// --- roles ---
if (role === "no-commit" || role === "qa" || role in DOC_ROLES) {
	const NO_COMMIT = [
		[
			/\bgit\s+(commit|push|merge|rebase|cherry-pick|revert|tag)\b/,
			"commit/push/merge is done by the loop script or tech-lead",
		],
		[
			/\bgit\s+(checkout|switch|worktree|stash|branch\s+-[dDmM])\b/,
			"switching branch or worktree",
		],
		[/\bgh\b/, "gh"],
		[
			/\b(npm|pnpm|yarn|bun)\s+(install|i|add|uninstall|remove|rm)\b|\bnpx\s+(shadcn|create-)|\bpip\s+(install|uninstall)\b|\b(poetry|uv|cargo|go)\s+(add|remove|get)\b/,
			"changing dependencies (only when the design lists it; tech-lead does it)",
		],
	];
	for (const [re, reason] of NO_COMMIT) if (has(re)) block(reason);
}

if (role in DOC_ROLES) {
	// files are written only with Edit/Write (checked against the paths above)
	const stripped = cmd.replace(/\d?>&\d|\d?>\s*\/dev\/null/g, "");
	if (
		/(\bsed\s+-i|>{1,2}|\btee\b|\bmv\b|\bcp\b|\brm\b|\bperl\s+-[a-z]*i)/.test(
			stripped,
		)
	)
		block("writing through Bash; use Edit/Write on your own documents");
}

if (role === "read-only") {
	const SAFE =
		/^\s*(git\s+(diff|status|log|show|grep|blame|rev-parse|ls-files)\b|rg\b|grep\b|ls\b|cat\b|head\b|tail\b|wc\b|find\b[^\n]*$)/;
	const parts = cmd
		.split(/&&|\|\||;|\|/)
		.map((s) => s.trim())
		.filter(Boolean);
	if (parts.some((p) => !SAFE.test(p) || /\s-(exec|delete)\b/.test(p)))
		block(
			"the reviewer uses only read commands (git diff/log/show/status, rg, grep, ls, cat)",
		);
}

process.exit(0);
