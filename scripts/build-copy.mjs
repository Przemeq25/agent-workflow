#!/usr/bin/env node
// Builds copy/: the copy-ready workflow (no package, no scripts) for people who copy files instead of installing.
// Usage: node scripts/build-copy.mjs [--check]   (--check fails when copy/ is out of date)
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(PKG, "copy");
const LOOP_ONLY = ["autopilot.md"];

function walk(dir, out = []) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const f = join(dir, e.name);
		if (e.isSymbolicLink()) continue;
		if (e.isDirectory()) walk(f, out);
		else out.push(f);
	}
	return out;
}

function replaceOnce(text, from, to) {
	if (!text.includes(from))
		throw new Error(`copy build: AGENTS.md no longer contains: ${from}`);
	return text.replace(from, to);
}

export function buildCopy(target) {
	const tmp = mkdtempSync(join(tmpdir(), "aw-copy-"));
	spawnSync("git", ["init", "-q"], { cwd: tmp });
	writeFileSync(join(tmp, "package.json"), '{ "name": "copy" }\n');
	const r = spawnSync(
		process.execPath,
		[
			join(PKG, "bin", "agent-workflow.mjs"),
			"init",
			"--yes",
			"--tools",
			"kilo,opencode,claude",
			"--no-postinstall",
		],
		{ cwd: tmp, encoding: "utf8" },
	);
	if (r.status !== 0) throw new Error(`copy build: init failed\n${r.stderr}`);
	for (const p of [
		"package.json",
		".git",
		".gitignore",
		".agents/.managed.json",
		".agents/.generated.json",
	])
		rmSync(join(tmp, p), { recursive: true, force: true });
	for (const dir of [
		".agents/agents",
		".kilo/agents",
		".opencode/agents",
		".claude/agents",
	])
		for (const f of LOOP_ONLY) rmSync(join(tmp, dir, f), { force: true });
	for (const f of walk(tmp).filter((f) => f.endsWith(".md"))) {
		const t = readFileSync(f, "utf8");
		const n = t
			.split("\n")
			.filter(
				(l) => !/^<!-- (Generated|Managed) by .*agent-workflow.*-->$/.test(l),
			)
			.join("\n");
		if (n !== t) writeFileSync(f, n);
	}
	// The copy has no autopilot role and no installer: drop every mention so no agent looks for them.
	const COPY_TEXT = [
		[" The loop does the same through the `autopilot` role.", ""],
		[" (the optional unattended loop does the same through `autopilot`)", ""],
		[" (the optional unattended loop uses `autopilot`)", ""],
		[
			"- An unattended run (the loop, `autopilot`) asks nothing: it records the assumption or marks the subtask blocked.\n",
			"",
		],
		["`pm`, `autopilot`, `implementer`", "`pm`, `implementer`"],
		["(`tech-lead`, `pm`, `autopilot`, and", "(`tech-lead`, `pm`, and"],
		[
			"Read by `tech-lead`, `pm`, `autopilot` and",
			"Read by `tech-lead`, `pm` and",
		],
		["tech-lead and autopilot, always", "tech-lead, always"],
		["implementer, tech-lead, autopilot:", "implementer, tech-lead:"],
		["(tech-lead or autopilot)", "(tech-lead)"],
		[" Called by tech-lead or autopilot.", " Called by tech-lead."],
		[
			"Called by tech-lead, pm, autopilot or the /prd command",
			"Called by tech-lead, pm or the /prd command",
		],
		["Called by tech-lead, pm or autopilot;", "Called by tech-lead or pm;"],
		["autopilot reported a blocker", "the loop reported a blocker"],
		["the package installer (run by a human)", "a human"],
		[
			"are generated from `.agents/` by the package installer (a human runs it) for the tools each developer uses, and are not committed. Never edit them. Roles never run the installer or any workflow script: they work from the skills and documents.",
			"are copies of the roles and commands in `.agents/`, kept in step by a human. Never edit them. There are no workflow scripts: roles work only from skills, roles, commands and documents.",
		],
	];
	for (const f of walk(tmp).filter((f) => f.endsWith(".md"))) {
		let t = readFileSync(f, "utf8");
		for (const [from, to] of COPY_TEXT) t = t.split(from).join(to);
		writeFileSync(f, t);
	}
	let a = readFileSync(join(tmp, "AGENTS.md"), "utf8");
	a = replaceOnce(
		a,
		"Coordinating roles (`tech-lead`, `pm`, `autopilot`, `/prd`)",
		"Coordinating roles (`tech-lead`, `pm`, `/prd`)",
	);
	a = replaceOnce(a, " (the loop also `sub/<ID>/<ST>`)", "");
	a = replaceOnce(
		a,
		" An unattended run asks nothing and records the assumption.",
		"",
	);
	a = replaceOnce(
		a,
		"the tool adapters (`.claude/`, `.codex/`, `.opencode/`, `.kilo/`, `CLAUDE.md`)",
		"the tool folders (`.claude/`, `.opencode/`, `.kilo/`, `CLAUDE.md`; copies of the roles, kept in step by a human)",
	);
	writeFileSync(join(tmp, "AGENTS.md"), a);
	cpSync(join(PKG, "copy-src", "INSTRUKCJA.md"), join(tmp, "INSTRUKCJA.md"));
	// Claude Code reads skills from .claude/skills: a relative link to .agents/skills keeps one copy.
	const link = join(tmp, ".claude", "skills");
	if (existsSync(link) || lstatSync(link, { throwIfNoEntry: false }))
		rmSync(link, { recursive: true, force: true });
	symlinkSync("../.agents/skills", link);
	rmSync(target, { recursive: true, force: true });
	cpSync(tmp, target, { recursive: true, verbatimSymlinks: true });
	rmSync(tmp, { recursive: true, force: true });
	return target;
}

function snapshot(dir) {
	if (!existsSync(dir)) return new Map();
	return new Map(
		walk(dir).map((f) => [relative(dir, f), readFileSync(f, "utf8")]),
	);
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	if (process.argv.includes("--check")) {
		const fresh = buildCopy(mkdtempSync(join(tmpdir(), "aw-copy-check-")));
		const a = snapshot(OUT);
		const b = snapshot(fresh);
		const diff = [...new Set([...a.keys(), ...b.keys()])].filter(
			(k) => a.get(k) !== b.get(k),
		);
		if (diff.length) {
			console.error(
				`copy/ is out of date (${diff.length} file(s), e.g. ${diff[0]}). Run: npm run build:copy`,
			);
			process.exit(1);
		}
		console.log("copy/ is up to date");
	} else console.log(`built ${relative(PKG, buildCopy(OUT))}/`);
}
