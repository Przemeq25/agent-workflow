# Agenci: instalacja przez kopiowanie (bez npm)

Ten folder jest gotowy do skopiowania. Nie wymaga instalowania żadnej paczki ani uruchamiania skryptów: agenci pracują wyłącznie na rolach, skillach i komendach.

## 1. Skopiuj do katalogu głównego repo
- `AGENTS.md`
- `.agents/`: role, skille zespołu, komenda `/prd`, szablony, format zmian, `docs/workflow.md`
- `openspec/`: tu agenci zapisują zmiany
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

Numer taska z Jiry: w `workflow-rules` wiersz „Tracker” (np. `Jira, key REM`). Wtedy ID zmiany zaczyna się od klucza (`REM-123-pokoje`), więc gałąź `REM-123-pokoje` (bez prefiksu `task/`), każdy commit `feat(REM-123-pokoje): …` i tytuł PR `REM-123 …` mają numer. Bez klucza agent pyta i nic nie wymyśla.

Ekrany 1:1 z obrazków (bez Figma MCP): wrzuć PNG do plików, nie do czatu: `openspec/changes/<ID>/screens/<ekran>-390.png` i `-1440.png` (eksport 1x, dokładnie ta szerokość). W `workflow-rules` uzupełnij wiersz „Visual check”. `tech-lead` wpisuje w designie „visual check: yes” tylko dla nowego ekranu albo zmiany układu; wtedy implementer porównuje zrzut z obrazkiem raz po zbudowaniu ekranu, najwyżej 2 poprawki.

Projekt bez Playwrighta, a chcesz porównywać ekrany z obrazkami: `/prd` zapyta o to raz i przygotuje konfigurację. Ręcznie to cztery kroki: `npm i -D @playwright/test` i `playwright install chromium`; plik `playwright.config.ts` z `testDir: 'tests/visual'`, `webServer` (komenda startu aplikacji), projektami o szerokości 390 i 1440 px oraz `expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } }`; pusty katalog `tests/visual`; w `workflow-rules` wiersz „Visual check” z komendą `playwright test tests/visual --reporter=dot`. Testy ekranów pisze potem implementer, tylko gdy design ma „visual check: yes”. Nie chcesz tego: wpisz w wierszu `none`.

Jedna funkcja w kilku zmianach (np. `quick-link`: API, assets, UI): `pm` nadaje im wspólne pole `group` i trzyma wszystkie w `openspec/changes/quick-link/<ID>/`, z plikiem `README.md` grupy (cel, lista zmian w kolejności, zależności, wspólne decyzje). Numery z Jiry, gałęzie i commity dalej używają samego ID. Gotowa grupa trafia do `openspec/changes/archive/` w całości. Roadmapa produktu zostaje w `context/foundation/roadmap.md`.

Nowa praca nad istniejącą funkcją: przed założeniem folderu agent szuka grupy i zmian o tym samym temacie i pyta raz (okienkiem): dodać nową zmianę do grupy (domyślnie, np. poprawki po scaleniu), poprawić istniejącą niezatwierdzoną albo założyć nową grupę. Zatwierdzonej i scalonej zmiany nie edytuje, poprawka to nowa zmiana w tej samej grupie.

Nazwy jak w OpenSpec: katalog `openspec/` z `changes/` (zmiany, grupy i `changes/archive/`) i opcjonalnym `specs/` (aktualne zachowanie, wpisuje człowiek). Projekt, który ma już `spec/`: `git mv spec openspec`, a gotowe zmiany z `spec/archive/` przenieś do `openspec/changes/archive/`.

Review i merge: PR idzie ze zwykłymi commitami, poprawki z review to kolejne commity. Rebase na `main` i squash do jednego commita agent robi dopiero, gdy PR jest zaakceptowany albo napiszesz „przygotuj do merge”.

`change.json` ma pole `$schema`: edytor (VS Code, Kilo) podkreśla błędne ID, brak AC czy zły `risk` od razu.

## 4. MCP: przeglądarka i Figma (opcjonalnie)
Pliki agentów mają już przypisane serwery MCP:

| Serwer | Kto może używać | Pozostali agenci |
|---|---|---|
| `chrome-devtools`, `playwright` | `qa` (sprawdzenie UI) | wyłączony |
| `figma` | `tech-lead` (plan ekranu, `/prd design`), `qa` (porównanie) | wyłączony |
| `atlassian` (Jira) | `pm` (czyta zadanie po kluczu, epic jako grupa; tylko odczyt) | wyłączony |
| `context7` (dokumentacja bibliotek) | `tech-lead` (tylko przy designie, gdy API mogło się zmienić) | wyłączony |

Nazwa serwera w konfiguracji narzędzia (np. `mcp` w `kilo.jsonc`) musi być dokładnie taka jak w tabeli; inaczej zmień ją w nagłówkach plików agentów (`"figma_*": allow` w Kilo i OpenCode, `mcp__figma` w Claude Code). Bez tych serwerów agenci pomijają te kroki i piszą o tym w raporcie. Żeby `qa` mógł sprawdzić UI, uzupełnij w `workflow-rules` wiersze „Run the app” i „Test account”.

## Zmiana roli
Role źródłowe są w `.agents/agents/`. Zmianę roli przenieś ręcznie do pliku w `.kilo/agents/` (albo innego narzędzia), bo narzędzie czyta tylko swój folder.
