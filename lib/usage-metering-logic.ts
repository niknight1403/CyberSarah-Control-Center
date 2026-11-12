/**
 * Nutzungs-Messung und Monetarisierungs-Antworten (rein, ohne I/O).
 *
 * Grundsätze:
 *  - Kosten sind Schätzungen aus einer gepflegten Preistabelle, klar als
 *    Schätzung gekennzeichnet — keine erfundene Abrechnung.
 *  - Fehlende Messwerte bleiben null, statt 0 zu behaupten.
 *  - Die 402-Antwort sagt dem Client genau, was zu tun ist (Checkout, Paket,
 *    Upgrade) und enthält keinen internen Zustand.
 */

export type UsageProvider = "groq" | "openrouter" | "gemini" | "ollama" | "unknown";

/** Preis je 1 Mio. Token in Euro-Cent (Zahlungs-Wahrheit bleibt Euro). */
export interface ProviderPrice {
  /** Eingabe-Token, Euro je 1 Mio. Token. */
  inputEurPerMillion: number;
  /** Ausgabe-Token, Euro je 1 Mio. Token. */
  outputEurPerMillion: number;
}

/**
 * Öffentliche Listenpreise, Stand der Pflege: bewusst konservativ (eher zu
 * teuer als zu billig), damit die Marge nicht schöngerechnet wird. Lokales
 * Ollama läuft auf eigener Hardware und zählt mit 0.
 */
export const PROVIDER_PRICES: Record<UsageProvider, ProviderPrice> = {
  groq: { inputEurPerMillion: 0.05, outputEurPerMillion: 0.08 },
  openrouter: { inputEurPerMillion: 0.25, outputEurPerMillion: 0.85 },
  gemini: { inputEurPerMillion: 0.07, outputEurPerMillion: 0.3 },
  ollama: { inputEurPerMillion: 0, outputEurPerMillion: 0 },
  unknown: { inputEurPerMillion: 0.25, outputEurPerMillion: 0.85 },
};

/**
 * Ordnet einen Modellnamen seinem Abrechnungs-Provider zu.
 *
 * Eine einzige Wahrheit fuer Reservierung (`server/api-v1.ts`, entscheidet ob
 * ueberhaupt abgebucht wird) und Kostenzuordnung (`server/usage-metering.ts`).
 * Zuvor gab es zwei Kopien mit abweichender Reihenfolge: `llama-3.3-70b` galt
 * beim Buchen als `groq`, beim Messen aber als `unknown` (teuerster Satz) —
 * derselbe Lauf wurde also zu zwei Preisen gefuehrt.
 *
 * Reihenfolge ist bindend: explizite Router-Praefixe gewinnen gegen
 * Familien-Teilstrings, damit `openrouter/meta-llama/llama-3.1` nicht als
 * `groq` gilt. Rueckfall `unknown` ist bewusst der konservative Preissatz.
 */
export function resolveUsageProvider(model: string | null | undefined): UsageProvider {
  const value = String(model ?? "").trim().toLowerCase();
  if (!value) return "unknown";
  if (value.includes("openrouter")) return "openrouter";
  if (value.includes("ollama") || value.includes("local")) return "ollama";
  if (value.includes("gemini") || value.includes("google")) return "gemini";
  if (value.includes("groq") || value.includes("llama-3")) return "groq";
  // Pfadform `vendor/modell` ohne bekannten Anbieter laeuft ueber den Aggregator.
  if (value.includes("/")) return "openrouter";
  return "unknown";
}

/** Grobe Vorab-Schätzung der Token eines Auftrags (4 Zeichen ≈ 1 Token). */
export function estimatePromptTokens(text: string): number {
  const clean = typeof text === "string" ? text.trim() : "";
  if (!clean) return 0;
  return Math.max(1, Math.ceil(clean.length / 4));
}

/** Kosten einer Ausführung in Euro (auf 4 Nachkommastellen gerundet). */
export function estimateCostEur(input: {
  provider: UsageProvider;
  promptTokens: number | null;
  completionTokens: number | null;
}): number | null {
  const prompt = num(input.promptTokens);
  const completion = num(input.completionTokens);
  if (prompt === null && completion === null) return null;
  const price = PROVIDER_PRICES[input.provider] ?? PROVIDER_PRICES.unknown;
  const cost =
    ((prompt ?? 0) / 1_000_000) * price.inputEurPerMillion +
    ((completion ?? 0) / 1_000_000) * price.outputEurPerMillion;
  return Math.round(cost * 10_000) / 10_000;
}

export interface UsageRow {
  agentId?: string | null;
  provider: string;
  model?: string | null;
  status: "ok" | "error" | "blocked";
  promptTokens?: number | null;
  completionTokens?: number | null;
  costEur?: number | null;
  durationMs?: number | null;
  createdAt: number;
}

export interface UsageSummary {
  windowDays: number;
  runs: number;
  okRuns: number;
  errorRuns: number;
  blockedRuns: number;
  successRatePct: number | null;
  tokens: { prompt: number; completion: number; total: number };
  costEur: number;
  costPerRunEur: number | null;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  byProvider: Array<{ provider: string; runs: number; tokens: number; costEur: number }>;
  byAgent: Array<{ agentId: string; runs: number; tokens: number; costEur: number }>;
  daily: Array<{ date: string; runs: number; tokens: number; costEur: number }>;
  /** Was der Nutzer für diese Nutzung zahlt, sofern ein Planpreis bekannt ist. */
  roi: { valueEurPerMonth: number | null; costEurPerMonth: number | null; note: string };
}

/**
 * Fasst Ausführungen zu einem Nutzungsbericht zusammen. Zeitfenster in Tagen,
 * Tagesreihe immer vollständig (auch Tage ohne Lauf, mit 0 — das ist gemessen,
 * nicht geschätzt).
 */
export function aggregateUsage(
  rows: readonly UsageRow[],
  options: { now: number; windowDays: number; planValueEurPerMonth?: number | null },
): UsageSummary {
  const now = options.now;
  const requestedDays = Number.isFinite(options.windowDays) ? Math.floor(options.windowDays) : 30;
  const windowDays = Math.max(1, Math.min(365, requestedDays));
  const cutoff = now - windowDays * 86_400_000;
  const inWindow = rows.filter((row) => num(row.createdAt) !== null && (row.createdAt as number) >= cutoff);

  const providerMap = new Map<string, { runs: number; tokens: number; costEur: number }>();
  const agentMap = new Map<string, { runs: number; tokens: number; costEur: number }>();
  const dayMap = new Map<string, { runs: number; tokens: number; costEur: number }>();
  for (let index = windowDays - 1; index >= 0; index -= 1) {
    dayMap.set(dayKey(now - index * 86_400_000), { runs: 0, tokens: 0, costEur: 0 });
  }

  let okRuns = 0;
  let errorRuns = 0;
  let blockedRuns = 0;
  let prompt = 0;
  let completion = 0;
  let cost = 0;
  let durationSum = 0;
  let durationCount = 0;
  const durations: number[] = [];

  for (const row of inWindow) {
    const tokens = (num(row.promptTokens) ?? 0) + (num(row.completionTokens) ?? 0);
    const rowCost = num(row.costEur) ?? 0;
    prompt += num(row.promptTokens) ?? 0;
    completion += num(row.completionTokens) ?? 0;
    cost += rowCost;
    if (row.status === "ok") okRuns += 1;
    else if (row.status === "blocked") blockedRuns += 1;
    else errorRuns += 1;
    const duration = num(row.durationMs);
    if (duration !== null) {
      durationSum += duration;
      durationCount += 1;
      durations.push(duration);
    }
    addTo(providerMap, String(row.provider || "unknown"), tokens, rowCost);
    if (row.agentId) addTo(agentMap, String(row.agentId), tokens, rowCost);
    const bucket = dayMap.get(dayKey(row.createdAt));
    if (bucket) {
      bucket.runs += 1;
      bucket.tokens += tokens;
      bucket.costEur += rowCost;
    }
  }

  const runs = inWindow.length;
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  const costRounded = round(cost);
  const perMonthFactor = 30 / windowDays;
  const planValue = num(options.planValueEurPerMonth);

  return {
    windowDays,
    runs,
    okRuns,
    errorRuns,
    blockedRuns,
    successRatePct: runs === 0 ? null : Math.round((okRuns / runs) * 1000) / 10,
    tokens: { prompt, completion, total: prompt + completion },
    costEur: costRounded,
    costPerRunEur: runs === 0 ? null : round(costRounded / runs),
    avgDurationMs: durationCount === 0 ? null : Math.round(durationSum / durationCount),
    p95DurationMs: durations.length === 0 ? null : percentile(durations, 95),
    byProvider: [...providerMap.entries()]
      .map(([provider, value]) => ({ provider, runs: value.runs, tokens: value.tokens, costEur: round(value.costEur) }))
      .sort((a, b) => b.runs - a.runs),
    byAgent: [...agentMap.entries()]
      .map(([agentId, value]) => ({ agentId, runs: value.runs, tokens: value.tokens, costEur: round(value.costEur) }))
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 5),
    daily: [...dayMap.entries()]
      .map(([date, value]) => ({ date, runs: value.runs, tokens: value.tokens, costEur: round(value.costEur) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    roi: {
      // Bewusst konservativ: Kosten auf 30 Tage hochgerechnet, Nutzen nur wenn
      // ein Planpreis bekannt ist — sonst null statt einer Wunschzahl.
      costEurPerMonth: runs === 0 ? null : round(costRounded * perMonthFactor),
      valueEurPerMonth: planValue === null ? null : Math.round(planValue * 100) / 100,
      note:
        planValue === null
          ? "Kein Planpreis hinterlegt; Nutzen wird nicht geschätzt."
          : "Gegenüberstellung von Listenpreis-Wert und geschätzten Modellkosten.",
    },
  };
}

export interface PaymentRequiredInput {
  plan: string;
  reason: string;
  requiredTokens: number;
  remainingTokens: number | null;
  resetsAt?: number | null;
  checkoutUrl: string;
  creditPacks: ReadonlyArray<{ id: string; label: string; tokens: number; priceEur: number }>;
  upgradePlan?: string | null;
}

/** Strukturierte 402-Antwort: was fehlt, was hilft, wohin man gehen muss. */
export function buildPaymentRequiredPayload(input: PaymentRequiredInput) {
  return {
    error: "Zahlung erforderlich.",
    code: "payment_required",
    reason: input.reason,
    plan: input.plan,
    usage: {
      requiredTokens: Math.max(0, Math.ceil(input.requiredTokens)),
      remainingTokens: input.remainingTokens === null ? null : Math.max(0, Math.floor(input.remainingTokens)),
      resetsAt: input.resetsAt ?? null,
    },
    options: {
      checkoutUrl: input.checkoutUrl,
      creditPacks: input.creditPacks.map((pack) => ({
        id: pack.id,
        label: pack.label,
        tokens: pack.tokens,
        priceEur: pack.priceEur,
      })),
      upgradePlan: input.upgradePlan ?? null,
    },
    hint:
      input.remainingTokens === null
        ? "Guthaben unbekannt: bitte Paket wählen oder Plan prüfen."
        : "Guthaben aufladen oder auf einen höheren Plan wechseln; eigener Provider bleibt frei.",
  };
}

export interface TemplateAgent {
  key: string;
  name: string;
  purpose: string;
  prompt: string;
}

/** Drei sofort einsatzfähige Agenten, damit das Dashboard nie leer startet. */
export const TEMPLATE_AGENTS: readonly TemplateAgent[] = [
  {
    key: "lead-gen",
    name: "Lead-Gen-Agent",
    purpose: "Findet passende Firmen und Kontakte für ein Angebot und schlägt eine Ansprache vor.",
    prompt:
      "Du bist ein Lead-Gen-Agent. Für das Angebot des Nutzers: (1) benenne 5 passende Firmenprofile, (2) je Firma ein konkreter Anknüpfungspunkt mit Quelle, (3) ein Anschreiben von maximal 90 Wörtern, (4) keine erfundenen Kontaktdaten. Fehlt eine Quelle, schreibe 'Quelle fehlt'.",
  },
  {
    key: "content-automation",
    name: "Content-Automation-Agent",
    purpose: "Macht aus einem Thema wiederverwendbare Beiträge für die Kanäle des Nutzers.",
    prompt:
      "Du bist ein Content-Automation-Agent. Aus Thema und Zielgruppe erstellst du: einen Hauptbeitrag (max. 200 Wörter), daraus drei kurze Kanal-Varianten, dazu fünf Beitragsideen für die nächsten Wochen. Keine Fakten erfinden, keine Zahlen ohne Quelle.",
  },
  {
    key: "workflow-health",
    name: "Workflow-Health-Agent",
    purpose: "Prüft laufende Automatisierungen und meldet Auffälligkeiten mit Beleg.",
    prompt:
      "Du bist ein Workflow-Health-Agent. Prüfe die genannten Workflows auf: letzter Lauf, Fehlerrate, Dauer, blockierte Schritte. Melde je Workflow einen Status (grün/gelb/rot) mit Belegwerten. Fehlen Werte, sage 'nicht gemessen' statt zu schätzen.",
  },
];

/** Welche Vorlagen fehlen noch? Idempotent über den Namen. */
export function missingTemplateAgents(
  existingNames: readonly string[],
  templates: readonly TemplateAgent[] = TEMPLATE_AGENTS,
): TemplateAgent[] {
  const known = new Set(
    existingNames
      .filter((name): name is string => typeof name === "string")
      .map((name) => name.trim().toLowerCase()),
  );
  return templates.filter((template) => !known.has(template.name.trim().toLowerCase()));
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function addTo(map: Map<string, { runs: number; tokens: number; costEur: number }>, key: string, tokens: number, costEur: number) {
  const current = map.get(key) ?? { runs: 0, tokens: 0, costEur: 0 };
  current.runs += 1;
  current.tokens += tokens;
  current.costEur += costEur;
  map.set(key, current);
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index]);
}
