/**
 * Sprint 116 — Tech-Scanner-Issue-Ableitung: deterministische Tests der reinen
 * Logik — Matrix-Parser/Serializer, Versions-Major-Extraktion, Report-Parsing,
 * Major-Ableitung gegen die Matrix, Duplikat-Erkennung ueber stabile Staemme.
 */
import { describe, expect, it } from "vitest";

import {
  deriveMajorUpgrades,
  extractMajorFromVersion,
  extractNpmFindings,
  formatDependencyMatrix,
  parseDependencyMatrix,
  partitionByExisting,
  sanitizePackageForFile,
  type NpmFinding,
} from "../lib/tech-issue-logic";

const MATRIX_MARKDOWN = [
  "# Abhaengigkeits-Matrix (Sprint 116)",
  "",
  "| Paket | Major | Bereich | Hinweis |",
  "|---|---|---|---|",
  "| expo | 57 | Mobile-Stack | Expo-SDK fuehrt RN mit. |",
  "| drizzle-orm | 0 | Backend | Kit-Verhalten pruefen. |",
  "",
].join("\n");

const REPORT_MARKDOWN = `# 📡 Tech-Scan 2026-09-15

2 relevante Funde:

- **[npm] [expo 58.1.0](https://www.npmjs.com/package/expo)** (v58.1.0) — Relevanz 6, Bereich: Mobile-Stack
  Aktuellste npm-Version. Lokal installiert: ~57.0.22.

- **[npm] [drizzle-orm 0.45.2](https://www.npmjs.com/package/drizzle-orm)** (v0.45.2) — Relevanz 6, Bereich: Backend
  Aktuellste npm-Version. Lokal installiert: ^0.45.2.

- **[GitHub] [irrelevant](https://github.com/x/y)** (39★) — Relevanz 14, Bereich: DevOps
  Kein npm-Fund.
`;

describe("Sprint 116: Abhaengigkeits-Matrix", () => {
  it("parst Tabellen-Zeilen und ignoriert Kopf/Deck-Zeilen", () => {
    const entries = parseDependencyMatrix(MATRIX_MARKDOWN);
    expect(entries).toEqual([
      { name: "expo", currentMajor: 57, area: "Mobile-Stack", note: "Expo-SDK fuehrt RN mit." },
      { name: "drizzle-orm", currentMajor: 0, area: "Backend", note: "Kit-Verhalten pruefen." },
    ]);
  });

  it("ungueltige Major-Felder werden ignoriert statt abzustuerzen", () => {
    const entries = parseDependencyMatrix("| paket | major | bereich | hinweis |\n| kaputt | abc | x | y |");
    expect(entries).toEqual([]);
  });

  it("Serializer und Parser sind idempotent", () => {
    const entries = parseDependencyMatrix(MATRIX_MARKDOWN);
    const roundTrip = parseDependencyMatrix(formatDependencyMatrix(entries));
    expect(roundTrip).toEqual(entries);
  });
});

describe("Sprint 116: Versions-Extraktion", () => {
  it("Major-Anteile werden erkannt, Muell liefert null", () => {
    expect(extractMajorFromVersion("58.1.0")).toBe(58);
    expect(extractMajorFromVersion("v58.1.0")).toBe(58);
    expect(extractMajorFromVersion("0.45.2")).toBe(0);
    expect(extractMajorFromVersion("latest")).toBeNull();
    expect(extractMajorFromVersion("")).toBeNull();
  });

  it("Scoped Paketnamen werden dateisystem-sicher", () => {
    expect(sanitizePackageForFile("@modelcontextprotocol/sdk")).toBe("modelcontextprotocol-sdk");
    expect(sanitizePackageForFile("drizzle-orm")).toBe("drizzle-orm");
  });
});

describe("Sprint 116: Report-Parsing", () => {
  it("npm-Fundzeilen werden vollstaendig extrahiert, andere Quellen ignoriert", () => {
    const findings = extractNpmFindings(REPORT_MARKDOWN);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      name: "expo",
      version: "58.1.0",
      url: "https://www.npmjs.com/package/expo",
      area: "Mobile-Stack",
    });
    expect(findings[1].name).toBe("drizzle-orm");
  });

  it("ohne npm-Funde bleibt das Ergebnis leer", () => {
    expect(extractNpmFindings("# Tech-Scan\n\nnichts relevantes.")).toEqual([]);
  });
});

describe("Sprint 116: Major-Ableitung", () => {
  const matrix = parseDependencyMatrix(MATRIX_MARKDOWN);

  it("Major-Sprung ueber der Matrix erzeugt einen Entwurf mit Begruendung", () => {
    const drafts = deriveMajorUpgrades(extractNpmFindings(REPORT_MARKDOWN), matrix);
    expect(drafts).toHaveLength(1);
    const draft = drafts[0];
    expect(draft.name).toBe("expo");
    expect(draft.currentMajor).toBe(57);
    expect(draft.latestMajor).toBe(58);
    expect(draft.fileStem).toBe("major-upgrade-expo-v58");
    expect(draft.title).toBe("Major-Upgrade: expo 57 → 58");
    expect(draft.body).toContain("### Begruendung");
    expect(draft.body).toContain("Expo-SDK fuehrt RN mit.");
    expect(draft.body).toContain("docs/DEPENDENCY_MATRIX.md");
    expect(draft.body).toContain("npx tsc --noEmit");
  });

  it("Pakete auf Matrix-Niveau und nicht beobachtete Pakete bleiben still", () => {
    const findings: NpmFinding[] = [
      { name: "drizzle-orm", version: "0.45.2", url: "https://www.npmjs.com/package/drizzle-orm", area: "Backend" },
      { name: "unbeobachtet", version: "9.0.0", url: "https://www.npmjs.com/package/unbeobachtet", area: "DevOps" },
    ];
    expect(deriveMajorUpgrades(findings, matrix)).toEqual([]);
  });

  it("mehrere Funde zum selben Paket verdichten sich auf die hoechste Major-Version", () => {
    const findings: NpmFinding[] = [
      { name: "expo", version: "58.0.0", url: "https://www.npmjs.com/package/expo", area: "Mobile-Stack" },
      { name: "expo", version: "58.2.1", url: "https://www.npmjs.com/package/expo", area: "Mobile-Stack" },
    ];
    const drafts = deriveMajorUpgrades(findings, matrix);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].fileStem).toBe("major-upgrade-expo-v58");
  });
});

describe("Sprint 116: Duplikat-Erkennung", () => {
  const matrix = parseDependencyMatrix(MATRIX_MARKDOWN);
  const draft = deriveMajorUpgrades(extractNpmFindings(REPORT_MARKDOWN), matrix)[0];

  it("existierende Staemme werden als Duplikate erkannt, nicht doppelt erzeugt", () => {
    const result = partitionByExisting([draft, draft], new Set(["major-upgrade-expo-v58"]));
    expect(result.newDrafts).toHaveLength(0);
    expect(result.duplicates).toHaveLength(2);
  });

  it("neue Staemme wandern in newDrafts", () => {
    const result = partitionByExisting([draft], new Set(["major-upgrade-drizzle-orm-v1"]));
    expect(result.newDrafts).toEqual([draft]);
    expect(result.duplicates).toEqual([]);
  });
});
