import { describe, expect, it } from "vitest";

import {
  AGENT_LEARNING_KINDS,
  buildLearningRecord,
  classifyLearningKind,
  deriveLearningFromTurn,
  extractLearningKeywords,
  formatLearningsForContext,
  isAgentLearningKind,
  learningRelevanceScore,
  MAX_LEARNING_KEYWORDS,
  selectRelevantLearnings,
  turnDeservesLearning,
  type RankedLearning,
} from "../lib/agent-memory-logic";

function learning(overrides: Partial<RankedLearning> = {}): RankedLearning {
  return {
    kind: "fehlerbehebung",
    title: "Lockfile-Reparatur",
    detail: "npm ci schlug fehl wegen Nesting-Ambiguitaet von esbuild.",
    keywords: "npm,lockfile,esbuild,ci",
    createdAt: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("agent-memory-logic (Sprint 94)", () => {
  it("klassifiziert Lerning-Arten mit klarer Prioritaet (Fix > Optimierung > Entscheidung)", () => {
    expect(classifyLearningKind("Build-Pipeline optimiert", "Deployment beschleunigt")).toBe("build-optimierung");
    expect(classifyLearningKind("Lockfile-Fix", "Fehler behoben: npm ci")).toBe("fehlerbehebung");
    expect(classifyLearningKind("Fix der Build-Pipeline", "Regression behoben")).toBe("fehlerbehebung");
    expect(classifyLearningKind("Konvention festgelegt", "Commits immer auf main")).toBe("entscheidung");
    expect(classifyLearningKind("Wie ist das Wetter?", "Einfach nur reden.")).toBe("interaktion");
    expect(AGENT_LEARNING_KINDS).toHaveLength(4);
    expect(isAgentLearningKind("fehlerbehebung")).toBe(true);
    expect(isAgentLearningKind("unsinn")).toBe(false);
  });

  it("extrahiert signifikante Schluesselwoerter (Stopwoerter raus, dedupliziert, gekappt)", () => {
    const keywords = extractLearningKeywords(
      "Die Stripe-Anbindung und die stripe-Zahlungen sind mit dem Stripe-SDK gebaut und laufen mit dem Server",
    );
    expect(keywords).toContain("stripe-anbindung");
    expect(keywords).toContain("server");
    expect(keywords.filter((word) => word === "server")).toHaveLength(1);
    expect(keywords).not.toContain("und");
    expect(keywords.every((word) => word.length >= 4)).toBe(true);
    expect(keywords.length).toBeLessThanOrEqual(MAX_LEARNING_KEYWORDS);
  });

  it("baut normalisierte Learning-Records mit Kappung und expliziter Art", () => {
    const record = buildLearningRecord({
      title: `${"x".repeat(200)} Lockfile`,
      detail: `${"y".repeat(1000)} fix`,
      kind: "fehlerbehebung",
      keywords: ["NPM", "ci"],
      sessionId: "s-1",
    });
    expect(record.title.length).toBeLessThanOrEqual(160);
    expect(record.detail.length).toBeLessThanOrEqual(900);
    expect(record.kind).toBe("fehlerbehebung"); // explizite Angabe gewinnt
    expect(record.keywords).toContain("npm");
    expect(record.keywords).toContain("ci");
    expect(record.sessionId).toBe("s-1");

    const auto = buildLearningRecord({ title: "Refactor der Pipeline", detail: "build beschleunigt" });
    expect(auto.kind).toBe("build-optimierung");
    expect(auto.sessionId).toBe("");
  });

  it("rankt Relevanz: Schluesselwort-Treffer zaehlen doppelt, Fehlerbehebung einmal extra", () => {
    const target = learning({ keywords: "npm,lockfile,esbuild", kind: "fehlerbehebung" });
    expect(learningRelevanceScore(target, "Warum schlaegt npm ci am lockfile wegen esbuild fehl?")).toBeGreaterThanOrEqual(5);
    expect(learningRelevanceScore(learning({ kind: "interaktion", keywords: "hund,katze" }), "npm ci Problem")).toBe(0);
    // Fehlerbehebungs-Bonus ohne Treffer reicht nicht fuer MIN-Quorum (2)
    expect(learningRelevanceScore(learning({ kind: "interaktion", keywords: "npm" }), "npm ci Problem")).toBe(2);
  });

  it("waehlt nur relevante Learnings, maximal drei, nach Score sortiert", () => {
    const pool: RankedLearning[] = [
      learning({ title: "Irrelevant", keywords: "hund,katze", kind: "interaktion" }),
      learning({ title: "Lockfile", keywords: "npm,lockfile", kind: "fehlerbehebung" }),
      learning({ title: "APK-Build", keywords: "apk,android,gradle", kind: "build-optimierung" }),
      learning({ title: "Gradle-Optimierung", keywords: "gradle,build,android", kind: "build-optimierung" }),
      learning({ title: "Weitere Lockfile-Geschichte", keywords: "npm,lockfile,ci", kind: "fehlerbehebung" }),
    ];
    const selected = selectRelevantLearnings(pool, "npm ci lockfile Problem");
    expect(selected.length).toBeLessThanOrEqual(3);
    expect(selected.some((entry) => entry.title === "Irrelevant")).toBe(false);
    expect(selected[0].title).toMatch(/Lockfile/);
    expect(selectRelevantLearnings([], "beliebig")).toEqual([]);
    expect(selectRelevantLearnings(pool, "Wie wird das Wetter in Berlin?")).toEqual([]);
  });

  it("bewertet nur werkzeuglastige Turns als learning-wuerdig", () => {
    expect(turnDeservesLearning(["read_repo_file", "list_repo_files"])).toBe(false);
    expect(turnDeservesLearning(["write_repo_file"])).toBe(true);
    expect(turnDeservesLearning(["commit_changes", "push_changes"])).toBe(true);
    expect(turnDeservesLearning([])).toBe(false);
  });

  it("leitet Auto-Learnings aus dem Turn ab (Kontext + Werkzeuge)", () => {
    const derived = deriveLearningFromTurn("Fix den Lockfile-Fehler", "esbuild vereinheitlicht, CI gruen", ["write_repo_file", "commit_changes"]);
    const record = buildLearningRecord(derived);
    expect(record.title).toContain("Lockfile");
    expect(record.detail).toContain("esbuild vereinheitlicht");
    expect(record.detail).toContain("write_repo_file");
    expect(record.kind).toBe("fehlerbehebung");
    // Leere Nutzeranfrage faellt auf neutralen Titel zurueck
    expect(buildLearningRecord(deriveLearningFromTurn("", "irgendwas", [])).title).toContain("Agent-Turn");
  });

  it("formatiert das Prompt-Snippet kompakt und bleibt leer ohne Relevanz", () => {
    expect(formatLearningsForContext([])).toBe("");
    const snippet = formatLearningsForContext([learning()]);
    expect(snippet).toContain("Langzeit-Gedächtnis");
    expect(snippet).toContain("[fehlerbehebung] Lockfile-Reparatur");
    expect(snippet.split("\n").length).toBeLessThanOrEqual(5);
  });
});
