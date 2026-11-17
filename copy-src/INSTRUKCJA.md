# Agenci: instalacja przez kopiowanie (bez npm)

Ten folder jest gotowy do skopiowania. Nie wymaga instalowania żadnej paczki ani uruchamiania skryptów: agenci pracują wyłącznie na rolach, skillach i komendach.

## 1. Skopiuj do katalogu głównego repo
- `AGENTS.md`
- `.agents/`: role, skille zespołu, komenda `/prd`, szablony, format zmian, `docs/workflow.md`
- `spec/`: tu agenci zapisują zmiany
- folder swojego narzędzia: `.kilo/` (Kilo), `.opencode/` (OpenCode) albo `.claude/` z `CLAUDE.md` (Claude Code)

Pomiń ten plik. Wszystko commitujesz. Jeśli masz już skille projektu (`.agents/skills/*-rules`), nie nadpisuj ich.

## 2. Ustaw modele (opcjonalnie)
W `.kilo/agents/*.md` (tak samo w `.opencode/agents/*.md`) dopisz w nagłówku linię `model:`, np. `model: anthropic/claude-sonnet-...`. Nazwy modeli pokaże `kilo models`. Bez tej linii agent działa na domyślnym modelu.

| Poziom | Agenci |
|---|---|
| high (mocny) | pm, tech-lead, code-reviewer |
| standard | implementer, qa |
| low (tani) | scout, clerk |

W `.claude/agents/` modele są już wpisane (opus, sonnet, haiku).

## 3. Start
1. Zrestartuj narzędzie.
2. Uruchom `/prd`: wywiad, PRD w `context/foundation/` i 5 skilli projektu (`workflow-rules`, `business-rules`, `engineering-rules`, `testing-rules`, `review-rules`), w tym ciche komendy testów.
3. W nowej sesji wybierz agenta `pm` (większy zakres) albo `tech-lead` (jedno zadanie).

Projekt po starszym `/prd`: dopisz w `workflow-rules` wiersz „Quiet tests” i cichą wersję „Default verification” (tylko błędy i podsumowanie) albo uruchom `/prd tech`.

## Zmiana roli
Role źródłowe są w `.agents/agents/`. Zmianę roli przenieś ręcznie do pliku w `.kilo/agents/` (albo innego narzędzia), bo narzędzie czyta tylko swój folder.
