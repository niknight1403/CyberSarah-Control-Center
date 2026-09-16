/**
 * Sprint 95 — Autonomer Tech-Scanner: reine, deterministische Logik zur
 * Relevanz-Bewertung und Verdichtung gefundener Technologien.
 *
 * Die I/O-Seite (GitHub/HuggingFace/npm abfragen) liegt in
 * scripts/tech-scanner.mjs; dieses Modul entscheidet rein:
 *   - wie relevant ein Fund fuer das CyberSarah-Control-Center ist
 *   - welche Funde es in den Report schaffen (Top-N nach Relevanz)
 *   - wie der Report als Markdown formatiert wird
 */

/* ==================== Relevanz-Signale ==================== */

/**
 * Gewichtete Signale: trifft ein Fund ein Signal (Substring im
 * Kleinbuchstaben-Haystack), waechst sein Score um das Gewicht.
 * Ausgerichtet auf den Stack: Expo/React-Native + Capacitor-Android,
 * eigener Node-Server, Agenten/MCP, Billing, DevOps.
 */
export const RELEVANCE_SIGNALS: readonly { keyword: string; weight: number; area: string }[] = [
  { keyword: "expo", weight: 3, area: "Mobile-Stack" },
  { keyword: "react-native", weight: 3, area: "Mobile-Stack" },
  { keyword: "capacitor", weight: 3, area: "Mobile-Stack" },
  { keyword: "android", weight: 2, area: "Mobile-Stack" },
  { keyword: "apks", weight: 2, area: "Mobile-Stack" },
  { keyword: "model context protocol", weight: 3, area: "Agenten-Kern" },
  { keyword: "mcp", weight: 3, area: "Agenten-Kern" },
  { keyword: "agent", weight: 2, area: "Agenten-Kern" },
  { keyword: "llm", weight: 2, area: "Agenten-Kern" },
  { keyword: "tool-use", weight: 2, area: "Agenten-Kern" },
  { keyword: "tool calling", weight: 2, area: "Agenten-Kern" },
  { keyword: "reasoning", weight: 2, area: "Agenten-Kern" },
  { keyword: "drizzle", weight: 3, area: "Backend" },
  { keyword: "trpc", weight: 3, area: "Backend" },
  { keyword: "drizzle-orm", weight: 3, area: "Backend" },
  { keyword: "stripe", weight: 2, area: "Billing" },
  { keyword: "billing", weight: 2, area: "Billing" },
  { keyword: "drizzle-kit", weight: 3, area: "Backend" },
  { keyword: "vitest", weight: 2, area: "DevOps" },
  { keyword: "typescript", weight: 2, area: "DevOps" },
  { keyword: "neon", weight: 2, area: "Backend" },
  { keyword: "postgres", weight: 2, area: "Backend" },
  { keyword: "github actions", weight: 2, area: "DevOps" },
];

/** Mindest-Relevanz fuer den Report. */
export const MIN_REPORT_RELEVANCE = 3;

/** Maximale Funde je Bereich im Report. */
export const MAX_FINDINGS_PER_AREA = 4;

/* ==================== Funde ==================== */

export type TechFinding = {
  source: "github" | "huggingface" | "npm";
  title: string;
  url: string;
  description: string;
  /** Popularitaetssignal: Sterne, Downloads oder Likes. */
  stars?: number;
  /** npm-Paketversion bei registry-Funden. */
  version?: string;
};

export type ScoredFinding = TechFinding & {
  relevance: number;
  areas: string[];
};

/** Bewertet einen Fund: Summe der Signal-Gewichte plus Sterne-Bonus (max +2). */
export function scoreTechFinding(finding: TechFinding): ScoredFinding {
  const haystack = `${finding.title} ${finding.description}`.toLowerCase();
  let relevance = 0;
  const areas = new Set<string>();
  for (const signal of RELEVANCE_SIGNALS) {
    if (haystack.includes(signal.keyword)) {
      relevance += signal.weight;
      areas.add(signal.area);
    }
  }
  const stars = finding.stars ?? 0;
  relevance += Math.min(2, Math.floor(stars / 1000));
  return { ...finding, relevance, areas: [...areas] };
}

/**
 * Bewertet und filtert Funde: nur ueber der Mindest-Relevanz, absteigend
 * nach Relevanz, max. je Bereich, deterministisch stabil.
 */
export function selectReportFindings(findings: TechFinding[]): ScoredFinding[] {
  const scored = findings
    .map((finding) => scoreTechFinding(finding))
    .filter((entry) => entry.relevance >= MIN_REPORT_RELEVANCE)
    .sort((a, b) => b.relevance - a.relevance || a.title.localeCompare(b.title));
  const perArea = new Map<string, number>();
  const selected: ScoredFinding[] = [];
  for (const entry of scored) {
    const primaryArea = entry.areas[0] ?? "Allgemein";
    const used = perArea.get(primaryArea) ?? 0;
    if (used >= MAX_FINDINGS_PER_AREA) continue;
    perArea.set(primaryArea, used + 1);
    selected.push(entry);
  }
  return selected;
}

/* ==================== Report ==================== */

const SOURCE_LABELS: Record<TechFinding["source"], string> = {
  github: "GitHub",
  huggingface: "Hugging Face",
  npm: "npm",
};

/** Formatiert die Funde als kompakten Markdown-Report (deterministisch). */
export function formatTechScanReport(selected: ScoredFinding[], scanDate: string): string {
  if (selected.length === 0) {
    return `# 📡 Tech-Scan ${scanDate}\n\nKeine relevanten Neuerungen über der Mindest-Relevanz (${MIN_REPORT_RELEVANCE}) gefunden.`;
  }
  const lines = selected.map((entry) => {
    const stars = entry.stars ? ` (${entry.stars.toLocaleString("en-US")}★` + (entry.version ? `, v${entry.version}` : "") + ")" : entry.version ? ` (v${entry.version})` : "";
    return `- **[${SOURCE_LABELS[entry.source]}] [${entry.title}](${entry.url})**${stars} — Relevanz ${entry.relevance}, Bereich: ${entry.areas.join("/")}\n  ${entry.description.replace(/\s+/g, " ").trim().slice(0, 220)}`;
  });
  return `# 📡 Tech-Scan ${scanDate}\n\n${selected.length} relevante Funde (Mindest-Relevanz ${MIN_REPORT_RELEVANCE}, max. ${MAX_FINDINGS_PER_AREA} je Bereich):\n\n${lines.join("\n\n")}\n`;
}
