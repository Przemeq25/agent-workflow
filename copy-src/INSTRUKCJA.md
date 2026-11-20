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

### Klucze do providerów (OpenCode)
Klucze API i adresy własnych providerów (np. firmowego gatewaya) trzymaj poza repo, w globalnym `~/.config/opencode/opencode.json`, a w samym configu tylko odwołanie do pliku albo zmiennej:

```jsonc
{
  "provider": {
    "firma": {
      "options": {
        "apiKey": "{file:~/.config/opencode/secrets/firma-key}",
        "baseURL": "{env:FIRMA_GATEWAY_URL}"
      }
    }
  }
}
```

Plik z kluczem ma jedną linię, bez końcowego entera: `printf '%s' 'KLUCZ' > ~/.config/opencode/secrets/firma-key`. Nigdy nie wpisuj klucza w `opencode.json` w repo ani w `.agents/`.

## 3. Start
1. Zrestartuj narzędzie.
2. Uruchom `/prd`: wywiad, PRD w `context/foundation/` i 5 skilli projektu (`workflow-rules`, `business-rules`, `engineering-rules`, `testing-rules`, `review-rules`), w tym ciche komendy testów.
3. W nowej sesji wybierz agenta `pm` (większy zakres) albo `tech-lead` (jedno zadanie).

Projekt po starszym `/prd`: dopisz w `workflow-rules` wiersz „Quiet tests” i cichą wersję „Default verification” (tylko błędy i podsumowanie) albo uruchom `/prd tech`.

Numer taska z Jiry: w `workflow-rules` wiersz „Tracker” (np. `Jira, key REM`). Wtedy ID zmiany zaczyna się od klucza (`REM-123-pokoje`), więc gałąź `task/REM-123-pokoje`, każdy commit `feat(REM-123-pokoje): …` i tytuł PR `REM-123 …` mają numer. Bez klucza agent pyta i nic nie wymyśla.

## 4. MCP: przeglądarka i Figma (opcjonalnie)
Pliki agentów mają już przypisane serwery MCP:

| Serwer | Kto może używać | Pozostali agenci |
|---|---|---|
| `chrome-devtools`, `playwright` | `qa` (sprawdzenie UI) | wyłączony |
| `figma` | `tech-lead` (plan ekranu, `/prd design`), `qa` (porównanie) | wyłączony |

Nazwa serwera w konfiguracji narzędzia (np. `mcp` w `kilo.jsonc`) musi być dokładnie taka jak w tabeli; inaczej zmień ją w nagłówkach plików agentów (`"figma_*": allow` w Kilo i OpenCode, `mcp__figma` w Claude Code). Bez tych serwerów agenci pomijają te kroki i piszą o tym w raporcie. Żeby `qa` mógł sprawdzić UI, uzupełnij w `workflow-rules` wiersze „Run the app” i „Test account”.

## Zmiana roli
Role źródłowe są w `.agents/agents/`. Zmianę roli przenieś ręcznie do pliku w `.kilo/agents/` (albo innego narzędzia), bo narzędzie czyta tylko swój folder.
