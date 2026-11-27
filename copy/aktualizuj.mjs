#!/usr/bin/env node
// Aktualizacja plików zarządzanych (agenci, komendy, dokumenty, szablony, hook, skille team-*).
// Uruchom w katalogu głównym projektu:   node ŚCIEŻKA/DO/copy/aktualizuj.mjs            (podgląd)
//                                         node ŚCIEŻKA/DO/copy/aktualizuj.mjs --apply    (zapis)
// Źródło = katalog, w którym leży ten skrypt. Cel = bieżący katalog (lub --target <dir>).
// Nigdy nie rusza plików projektu: workflow.json, skilli *-rules i własnych, openspec/, .env.
// Plik edytowany lokalnie jest pomijany (chyba że --force). Linia `model:` w agentach zostaje.
import {
	chmodSync,
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
	const i = args.indexOf(n);
	return i >= 0 ? args[i + 1] : undefined;
};

const SRC = resolve(opt("--source") ?? dirname(SELF));
const DST = resolve(opt("--target") ?? process.cwd());
const APPLY = flag("--apply");
const FORCE = flag("--force");
const MANIFEST = ".agents/.installed.json";

// Zarządzane: ścieżki (prefiksy katalogów lub pojedyncze pliki).
const MANAGED = [
	"AGENTS.md",
	"CLAUDE.md",
	"INSTRUKCJA.md",
	".agents/agents/",
	".agents/commands/",
	".agents/docs/",
	".agents/hooks/",
	".agents/templates/",
	".agents/skills/team-",
	".claude/agents/",
	".claude/commands/",
	".claude/settings.json",
	".kilo/agents/",
	".kilo/commands/",
	".opencode/agents/",
	".opencode/commands/",
];
// Pliki projektu: kopiowane tylko gdy ich brakuje, potem nigdy nadpisywane.
const ONCE = [
	".agents/workflow.json",
	".agents/skills/",
	"openspec/",
];

const isManaged = (p) => MANAGED.some((m) => p === m || p.startsWith(m));
const isOnce = (p) => ONCE.some((m) => p === m || p.startsWith(m));

if (!existsSync(join(SRC, ".agents"))) {
	console.error(`Brak .agents/ w źródle: ${SRC}`);
	process.exit(2);
}
if (SRC === DST) {
	console.error(
		"Źródło i cel to ten sam katalog. Uruchom skrypt w katalogu głównym projektu.",
	);
	process.exit(2);
}

function walk(dir, base = dir, out = []) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const f = join(dir, e.name);
		if (e.isSymbolicLink()) continue;
		if (e.isDirectory()) walk(f, base, out);
		else out.push(relative(base, f).split(sep).join("/"));
	}
	return out;
}

// Zawartość bez linii `model:` we frontmatterze i z LF: porównujemy treść, nie wybór modelu.
function normalize(text) {
	let t = text.replace(/\r\n/g, "\n");
	const m = t.match(/^---\n([\s\S]*?)\n---\n/);
	if (m) {
		const fm = m[1]
			.split("\n")
			.filter((l) => !/^model:/.test(l))
			.join("\n");
		t = `---\n${fm}\n---\n${t.slice(m[0].length)}`;
	}
	return t;
}
const hash = (t) => createHash("sha256").update(normalize(t)).digest("hex");
const modelLine = (t) => {
	const m = t.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n/);
	return m?.[1].split("\n").find((l) => /^model:/.test(l));
};

// Nowa treść z zachowaniem `model:` z pliku docelowego.
function withModel(srcText, dstText) {
	const keep = dstText ? modelLine(dstText) : undefined;
	if (!keep) return srcText;
	const m = srcText.match(/^---\n([\s\S]*?)\n---\n/);
	if (!m) return srcText;
	const lines = m[1].split("\n").filter((l) => !/^model:/.test(l));
	lines.push(keep);
	return `---\n${lines.join("\n")}\n---\n${srcText.slice(m[0].length)}`;
}

const readManifest = () => {
	try {
		return JSON.parse(readFileSync(join(DST, MANIFEST), "utf8")).files ?? {};
	} catch {
		return null;
	}
};
const manifest = readManifest();
const known = manifest ?? {};

const srcFiles = walk(SRC).filter(
	(p) => join(SRC, p) !== SELF && p !== "aktualizuj.mjs",
);
const plan = []; // { path, action, note }
const next = { ...known };

for (const p of srcFiles) {
	const s = join(SRC, p);
	const d = join(DST, p);
	const srcText = readFileSync(s, "utf8");
	const sh = hash(srcText);
	const present = existsSync(d);
	if (isOnce(p)) {
		if (!present) plan.push({ path: p, action: "dodaj", note: "plik projektu (tylko raz)" });
		continue;
	}
	if (!isManaged(p)) continue;
	if (!present) {
		plan.push({ path: p, action: "dodaj" });
		next[p] = sh;
		continue;
	}
	const cur = hash(readFileSync(d, "utf8"));
	if (cur === sh) {
		next[p] = sh;
		plan.push({ path: p, action: "bez zmian" });
		continue;
	}
	const base = known[p];
	if (FORCE || (base && base === cur)) {
		plan.push({ path: p, action: "zaktualizuj" });
		next[p] = sh;
	} else {
		plan.push({
			path: p,
			action: "pomiń",
			note: base
				? "edytowany lokalnie (użyj --force, by nadpisać)"
				: "brak punktu odniesienia (pierwsze uruchomienie): --force nadpisze",
		});
	}
}

// Pliki, które zniknęły ze źródła: usuwamy tylko nieedytowane.
for (const p of Object.keys(known)) {
	if (srcFiles.includes(p)) continue;
	const d = join(DST, p);
	if (!existsSync(d)) {
		delete next[p];
		continue;
	}
	if (FORCE || hash(readFileSync(d, "utf8")) === known[p]) {
		plan.push({ path: p, action: "usuń", note: "nie istnieje już w nowej wersji" });
		delete next[p];
	} else plan.push({ path: p, action: "pomiń", note: "przestarzały, ale edytowany lokalnie" });
}

const skillsLink = join(DST, ".claude", "skills");
const needLink =
	existsSync(join(SRC, ".claude")) && !lstatSync(skillsLink, { throwIfNoEntry: false });
if (needLink) plan.push({ path: ".claude/skills", action: "dodaj", note: "link do .agents/skills" });

const count = (a) => plan.filter((x) => x.action === a).length;
for (const x of plan.filter((y) => y.action !== "bez zmian"))
	console.log(`${x.action.padEnd(11)} ${x.path}${x.note ? `  (${x.note})` : ""}`);
console.log(
	`\nDodaj: ${count("dodaj")} · zaktualizuj: ${count("zaktualizuj")} · usuń: ${count("usuń")} · pomiń: ${count("pomiń")} · bez zmian: ${count("bez zmian")}`,
);

if (!APPLY) {
	console.log("To był podgląd, nic nie zapisano. Dodaj --apply, żeby zastosować.");
	process.exit(0);
}

for (const x of plan) {
	const s = join(SRC, x.path);
	const d = join(DST, x.path);
	if (x.action === "dodaj" && x.path !== ".claude/skills") {
		mkdirSync(dirname(d), { recursive: true });
		copyFileSync(s, d);
	} else if (x.action === "zaktualizuj") {
		const out = withModel(readFileSync(s, "utf8"), readFileSync(d, "utf8"));
		writeFileSync(d, out);
		chmodSync(d, statSync(s).mode);
	} else if (x.action === "usuń") rmSync(d, { force: true });
}
if (needLink) {
	mkdirSync(dirname(skillsLink), { recursive: true });
	symlinkSync("../.agents/skills", skillsLink);
}
mkdirSync(join(DST, ".agents"), { recursive: true });
writeFileSync(
	join(DST, MANIFEST),
	`${JSON.stringify({ files: Object.fromEntries(Object.entries(next).sort()) }, null, "\t")}\n`,
);
console.log("Gotowe. Przejrzyj `git diff`, zacommituj zmiany.");
