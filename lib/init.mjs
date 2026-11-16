// `agent-workflow init`: scaffold .agents/, ask which tools get adapter files and which models each tier
// uses, save the answers and sync. Without a terminal (CI) or with --yes it uses flags only, and no flags
// means no tools: just .agents/ and AGENTS.md.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import {
	loadConfig,
	PKG,
	PKG_ROOT,
	parseFrontmatter,
	RUNNERS,
	SUGGESTED_MODELS,
	scaffold,
	syncProject,
	TOOLS,
} from "./sync.mjs";

const MODEL_TIERS = ["high", "standard", "low"];

export function parseTools(value) {
	if (value === undefined || value === true) return undefined;
	const raw = String(value).trim().toLowerCase();
	if (!raw || raw === "none" || raw === "-") return [];
	const out = [];
	for (const part of raw.split(/[\s,]+/).filter(Boolean)) {
		const tool = /^\d+$/.test(part) ? TOOLS[Number(part) - 1] : part;
		if (!TOOLS.includes(tool))
			throw new Error(
				`unknown tool "${part}" (supported: ${TOOLS.join(", ")})`,
			);
		if (!out.includes(tool)) out.push(tool);
	}
	return out;
}

// "claude.high=opus,codex.standard=gpt-5.5" → { claude: { high: "opus" }, codex: { standard: "gpt-5.5" } }
export function parseModels(value) {
	const out = {};
	if (typeof value !== "string") return out;
	for (const item of value.split(",").filter(Boolean)) {
		const m = item.trim().match(/^(\w+)\.(\w+)=(.*)$/);
		if (!m || !TOOLS.includes(m[1]) || !MODEL_TIERS.includes(m[2]))
			throw new Error(
				`bad --models entry "${item}" (use <tool>.<high|standard|low>=<model>)`,
			);
		out[m[1]] ??= {};
		out[m[1]][m[2]] = m[3].trim();
	}
	return out;
}

// Roles a session can start as: the package's roles (not copied yet on the first init) plus project roles.
function primaryRoles(root) {
	const roles = new Map();
	for (const dir of [
		join(PKG_ROOT, "managed", "agents"),
		join(root, ".agents", "agents"),
	]) {
		if (!existsSync(dir)) continue;
		for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
			const data = parseFrontmatter(readFileSync(join(dir, f), "utf8"))?.data;
			if (!data) continue;
			const name = String(data.name || f.replace(/\.md$/, ""));
			roles.set(
				name,
				!data.mode || data.mode === "primary" || data.mode === "all",
			);
		}
	}
	const names = [...roles].filter(([, primary]) => primary).map(([n]) => n);
	return ["tech-lead", ...names.filter((n) => n !== "tech-lead").sort()].filter(
		(n) => roles.get(n),
	);
}

const pickTiers = (map = {}) =>
	Object.fromEntries(MODEL_TIERS.filter((t) => map[t]).map((t) => [t, map[t]]));

async function interview(root, current, existed) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const ask = async (q, def = "") => {
		const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
		return a || def;
	};
	try {
		console.log(`\n${PKG.name} ${PKG.version}\n`);
		console.log(
			"Roles and skills always live in .agents/ and AGENTS.md. Choose the tools that also get their own",
		);
		console.log(
			"adapter files (git-ignored). Leave empty for none: tools that read AGENTS.md need nothing more.",
		);
		for (const [i, t] of TOOLS.entries()) console.log(`  ${i + 1}) ${t}`);
		let tools;
		for (;;) {
			try {
				tools = parseTools(
					await ask(
						"Tools (names or numbers, comma-separated)",
						current.tools.join(",") || "none",
					),
				);
				break;
			} catch (e) {
				console.log(`  ${e.message}`);
			}
		}

		const models = {};
		for (const tool of tools) {
			console.log(
				`\nModels for ${tool} (empty = the tool's own default model):`,
			);
			models[tool] = {};
			for (const tier of MODEL_TIERS) {
				const def =
					current.models?.[tool]?.[tier] ??
					SUGGESTED_MODELS[tool]?.[tier] ??
					"";
				const value = await ask(`  ${tier}`, def);
				if (value && value !== "-") models[tool][tier] = value;
			}
		}

		let defaultAgent;
		let runner;
		if (tools.length) {
			const roles = primaryRoles(root);
			for (;;) {
				defaultAgent = await ask(
					`\nMain role of a session (${roles.join(", ")})`,
					current.defaultAgent ?? "tech-lead",
				);
				if (roles.includes(defaultAgent)) break;
				console.log(`  unknown role "${defaultAgent}"`);
			}
			const runners = tools.filter((t) => RUNNERS.includes(t));
			if (runners.length === 1) runner = runners[0];
			else if (runners.length > 1)
				runner = parseTools(
					await ask(
						`Tool that runs the agent loop (${runners.join(", ")})`,
						runners.includes(current.loop?.runner)
							? current.loop.runner
							: runners[0],
					),
				)[0];
			else
				console.log(
					`  ${tools.join(", ")} cannot run the agent loop; it uses claude unless you set loop.runner.`,
				);
		}

		const where = await ask(
			"\nSave for the whole project (p) or only for you (m)",
			existed ? "m" : "p",
		);
		const postinstall = await ask(
			"Refresh .agents/ and the adapters after every npm install? (y/n)",
			"y",
		);
		return {
			tools,
			models,
			defaultAgent,
			runner,
			local: where.toLowerCase().startsWith("m"),
			postinstall: !postinstall.toLowerCase().startsWith("n"),
		};
	} finally {
		rl.close();
	}
}

export function saveChoices(
	root,
	{ tools, models, defaultAgent, runner, local },
) {
	const file = join(
		root,
		".agents",
		local ? "workflow.local.json" : "workflow.json",
	);
	const text = existsSync(file) ? readFileSync(file, "utf8") : "";
	const data = text ? JSON.parse(text) : {};
	data.tools = tools;
	data.models ??= {};
	for (const [tool, map] of Object.entries(models ?? {})) {
		const kept = { ...(data.models[tool] ?? {}) };
		delete kept.strong;
		for (const tier of MODEL_TIERS) delete kept[tier];
		data.models[tool] = { ...kept, ...map };
	}
	if (defaultAgent) data.defaultAgent = defaultAgent;
	if (runner) {
		data.loop ??= {};
		data.loop.runner = runner;
	}
	writeFileSync(file, `${JSON.stringify(data, null, "\t")}\n`);
	return `.agents/${local ? "workflow.local.json" : "workflow.json"}`;
}

export async function runInit(root, opts, addScripts) {
	const existed = existsSync(join(root, ".agents", "workflow.json"));
	const created = scaffold(root);
	for (const f of created) console.log(`[agent-workflow] + ${f}`);
	const current = loadConfig(root);

	const interactive =
		!opts.yes && opts.tools === undefined && process.stdin.isTTY;
	const answers = interactive
		? await interview(root, current, existed)
		: {
				tools: opts.tools ?? (existed ? current.tools : []),
				models: opts.models ?? {},
				defaultAgent: opts.defaultAgent,
				runner: opts.runner,
				local: Boolean(opts.local),
				postinstall: opts.postinstall !== false,
			};
	for (const t of Object.keys(answers.models))
		if (!answers.tools.includes(t)) delete answers.models[t];
	if (!interactive)
		for (const t of answers.tools)
			answers.models[t] = {
				...SUGGESTED_MODELS[t],
				...pickTiers(current.models?.[t]),
				...answers.models[t],
			};

	const saved = saveChoices(root, answers);
	console.log(
		`[agent-workflow] ${saved}: tools ${answers.tools.join(", ") || "none"}`,
	);
	const scripts = addScripts(root, { postinstall: answers.postinstall });
	if (scripts.length)
		console.log(`[agent-workflow] package.json scripts: ${scripts.join(", ")}`);
	const report = syncProject(root, { force: opts.force });
	const effective = report.tools;
	if (effective.join() !== answers.tools.join()) {
		const why = process.env.AGENT_WORKFLOW_TOOLS
			? "AGENT_WORKFLOW_TOOLS"
			: ".agents/workflow.local.json";
		console.log(
			`[agent-workflow] ⚠️  ${why} overrides this choice for you: tools ${effective.join(", ") || "none"}. Run init again and save for you (m), or edit that file.`,
		);
	}
	console.log(
		effective.length
			? "[agent-workflow] next: fill the TODOs in .agents/skills/*-rules (or run the prd-tech-explore role), then `agent-workflow validate`."
			: "[agent-workflow] no tool adapters: point your tool at AGENTS.md. Add one later with `agent-workflow init` or `--tools`.",
	);
}
