# Sprint 116 — Tech-Scanner-Issue-Ableitung

**Datum:** 15.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, 738/738 Tests grün, Server-Build erfolgreich, Deriver-Lauf gegen den echten Report geprüft

## Ziel

Aus dem autonomen Tech-Scanner (Sprint 95) werden Vorschläge: erkannte relevante Major-Upgrades automatisch als Issue-Vorlagen mit Relevanzbegründung. Abhängigkeits-Matrix als pflegbare Datei, die der Scanner gegenprüft; Duplikate werden erkannt.

## Umsetzung

### Abhängigkeits-Matrix — `docs/DEPENDENCY_MATRIX.md`

Pflegbare Tabelle der Kern-Abhängigkeiten mit gepinnter Major-Version (expo 57, react-native 0, typescript 7, drizzle-orm 0, vitest 5, stripe 22, @capacitor/core 8, @trpc/server 11) samt Bereich und Upgrade-Hinweis. Der Tech-Scanner prüft npm-Funde gegen diese Matrix.

### Reine Logik — `lib/tech-issue-logic.ts`

- **`parseDependencyMatrix` / `formatDependencyMatrix`:** Parser und Serializer der Matrix-Datei, idempotent round-trip-getestet; ungültige Zeilen werden ignoriert statt abzustürzen.
- **`extractMajorFromVersion`:** Major-Anteil einer Version („58.1.0" → 58, „latest" → null).
- **`extractNpmFindings`:** extrahiert die npm-Fundzeilen aus dem Tech-Scan-Report im Sprint-95-Format; GitHub-/HF-Funde werden nicht verarbeitet.
- **`deriveMajorUpgrades`:** prüft npm-Funde gegen die Matrix — nur Funde ÜBER der gepinnten Major-Version erzeugen einen Entwurf; mehrere Funde zum selben Paket verdichten sich auf die höchste Major-Version. Jeder Entwurf trägt Titel, Quelle (URL), Bereich, gepinnte Version und eine vollständige deutsche Issue-Vorlage mit Begründung und Akzeptanz-Kriterien (Release Notes prüfen, eigene Branch mit tsc/Vitest/Build, Matrix aktualisieren, keine Secrets, CI grün).
- **`partitionByExisting`:** Duplikat-Erkennung über den stabilen Datei-Stamm (`major-upgrade-<paket>-v<major>`) — existiert ein Stamm, wird der Fund als Duplikat protokolliert und nicht erneut erzeugt.

### I/O-Seite — `scripts/tech-issue-deriver.mjs`

Liest `docs/DEPENDENCY_MATRIX.md` und `docs/research/LATEST_TECH_SCAN.md`, leitet Major-Upgrade-Entwürfe ab und schreibt neue Issue-Vorlagen nach `docs/research/tech-issues/`; Duplikate werden protokolliert und übersprungen. Leere Matrix bricht ehrlich ab statt still zu arbeiten.

### Workflow — `.github/workflows/tech-scanner.yml`

Nach dem Scan läuft die Issue-Ableitung im selben Job (esbuild-Bundle analog zum Scanner); der Commit-Schritt nimmt `docs/research/tech-issues/` und `docs/DEPENDENCY_MATRIX.md` mit auf.

## Gegen den echten Report geprüft

Der Deriver-Lauf gegen den heutigen Report (`drizzle-orm 0.45.2`, Major 0 = Matrix-Level) erzeugt korrekt **keine** Issue-Vorlage — kein Falsch-Alarm. Der Workflow führt denselben Pfad täglich aus.

## Tests (12 neu)

- Matrix: Parsing (Kopf-/Deck-Zeilen, ungültige Major-Felder), Idempotenz von Serializer und Parser.
- Versionen: Major-Extraktion inkl. Scoped-Paket-Sanitizing (`@modelcontextprotocol/sdk` → dateisystem-sicher).
- Report-Parsing: npm-Zeilen vollständig, andere Quellen ignoriert, leerer Report.
- Major-Ableitung: Entwurf mit Titel/Begründung/Akzeptanz-Kriterien, Stille bei Matrix-Level-Paketen und nicht beobachteten Paketen, Verdichtung mehrerer Funde auf die höchste Major-Version.
- Duplikat-Erkennung: existierende Stämme und Doppel-Eingänge werden als Duplikate erkannt.

## Nächste Schritte (Sprint 117)

Onboarding-Verbesserung: Willkommensflow mit Theme-Auswahl beim ersten Start (UI-Inspiration: liquid-glass-Welcome-Screens aus dem Tech-Scan).
