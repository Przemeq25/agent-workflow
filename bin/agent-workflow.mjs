#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseModels, parseTools, runInit } from "../lib/init.mjs";
import { PKG, printReport, syncProject } from "../lib/sync.mjs";

const HELP = `${PKG.name} ${PKG.version}

Setup
  agent-workflow init
      create .agents/ (roles, skills, AGENTS.md) and ask which tools get adapter files, which
      models the high/standard/low tiers use, the main role and the loop runner; then sync.
      No tools chosen = only .agents/ and AGENTS.md.
      Without questions: --yes [--tools claude,codex|none] [--models claude.high=opus,…]
      [--default-agent tech-lead] [--runner codex] [--local] [--no-postinstall] [--force]
  agent-workflow sync [--tools …] [--force] [--check]
      copy the managed roles, skills, guard, templates and AGENTS.md into the project
      and generate the adapters of the chosen tools (git-ignored)

Changes and loop
  agent-workflow validate            check .agents/, managed files and spec/changes
  agent-workflow render              write spec/BACKLOG.md and tasks.md
  agent-workflow status              delivery state from git and PRs
  agent-workflow approve <ID…>       approve changes (stores a fingerprint)
  agent-workflow publish             create tracker issues for approved changes
  agent-workflow loop [--max N] [--change ID] [--retry ID/ST] [--dry-run]
  agent-workflow watch [same flags]  loop without end

Tools for adapters: AGENT_WORKFLOW_TOOLS env > .agents/workflow.local.json > .agents/workflow.json > none.`;

function flag(args, name) {
	const i = args.indexOf(name);
	if (i === -1) return undefined;
	const v = args[i + 1];
	args.splice(i, v && !v.startsWith("--") ? 2 : 1);
	return v && !v.startsWith("--") ? v : true;
}

function addScripts(root, { postinstall = true } = {}) {
	const file = join(root, "package.json");
	if (!existsSync(file)) return [];
	const text = readFileSync(file, "utf8");
	const pkg = JSON.parse(text);
	pkg.scripts ??= {};
	const wanted = {
		"agents:sync": "agent-workflow sync",
		"agent:validate": "agent-workflow validate",
		"agent:render": "agent-workflow render",
		"agent:status": "agent-workflow status",
		"agent:approve": "agent-workflow approve",
		"agent:publish": "agent-workflow publish",
		"agent:loop": "agent-workflow loop",
		"agent:watch": "agent-workflow watch",
	};
	const added = [];
	for (const [k, v] of Object.entries(wanted))
		if (!pkg.scripts[k]) {
			pkg.scripts[k] = v;
			added.push(k);
		}
	const hook = `node -e "import('${PKG.name}/postinstall').catch(()=>{})"`;
	if (!postinstall) {
		// nothing: the developer runs `agent-workflow sync` by hand
	} else if (!pkg.scripts.postinstall) {
		pkg.scripts.postinstall = hook;
		added.push("postinstall");
	} else if (!pkg.scripts.postinstall.includes(PKG.name))
		console.log(
			`[agent-workflow] package.json already has a postinstall script; append: && ${hook}`,
		);
	if (added.length) {
		const indent = text.match(/^\s+/m)?.[0] ?? "  ";
		writeFileSync(file, `${JSON.stringify(pkg, null, indent)}\n`);
	}
	return added;
}

async function main() {
	const args = process.argv.slice(2);
	// `npm init agent-workflow` runs the `create-agent-workflow` bin: same as `init`.
	const asCreate = basename(process.argv[1] ?? "").startsWith("create-");
	const cmd =
		asCreate && (!args[0] || args[0].startsWith("--")) ? "init" : args.shift();
	const root = resolve(process.cwd());
	const toolsArg = flag(args, "--tools");
	const tools = parseTools(toolsArg === true ? "" : toolsArg);
	const force = Boolean(flag(args, "--force"));
	switch (cmd) {
		case "init": {
			const models = flag(args, "--models");
			const defaultAgent = flag(args, "--default-agent");
			const runner = flag(args, "--runner");
			return runInit(
				root,
				{
					tools,
					force,
					yes: Boolean(flag(args, "--yes") || flag(args, "-y")),
					models: parseModels(models),
					defaultAgent:
						typeof defaultAgent === "string" ? defaultAgent : undefined,
					runner: typeof runner === "string" ? runner : undefined,
					local: Boolean(flag(args, "--local")),
					postinstall: !flag(args, "--no-postinstall"),
				},
				addScripts,
			);
		}
		case "sync": {
			const check = Boolean(flag(args, "--check"));
			const report = syncProject(root, { tools, force, check, quiet: check });
			if (check) {
				if (report.drift.length || report.conflicts.length) {
					for (const d of report.drift)
						console.log(`[agent-workflow] out of date: ${d}`);
					printReport(report);
					process.exit(1);
				}
				console.log("[agent-workflow] managed files are up to date");
			}
			return;
		}
		case "validate": {
			const report = syncProject(root, { check: true, quiet: true });
			let failed = false;
			for (const d of report.drift) {
				console.log(
					`❌ managed file out of date: ${d} (run: agent-workflow sync)`,
				);
				failed = true;
			}
			for (const c of report.conflicts) {
				console.log(`❌ ${c}`);
				failed = true;
			}
			const { main: loop } = await import("../loop/loop.mjs");
			if (failed) process.exitCode = 1;
			return loop(["validate", ...args]);
		}
		case "render":
		case "status":
		case "approve":
		case "publish": {
			const { main: loop } = await import("../loop/loop.mjs");
			return loop([cmd, ...args]);
		}
		case "loop":
		case "run": {
			const { main: loop } = await import("../loop/loop.mjs");
			return loop(["run", ...args]);
		}
		case "watch": {
			const { main: loop } = await import("../loop/loop.mjs");
			return loop(["run", "--watch", ...args]);
		}
		case "--version":
		case "-v":
			console.log(PKG.version);
			return;
		default:
			console.log(HELP);
			process.exit(cmd && cmd !== "help" && cmd !== "--help" ? 1 : 0);
	}
}

main().catch((e) => {
	console.error(`[agent-workflow] ERROR: ${e.message}`);
	process.exit(1);
});
