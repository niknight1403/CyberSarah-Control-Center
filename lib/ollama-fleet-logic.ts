/**
 * Sprint 349 — Ollama-Fleet: Ehrliche, reine Logik fuer den Betrieb eines
 * Remote-Ollama-Servers als primaere Inferenz-Instanz des CyberSarah
 * Control Centers (Handy = schlanker Client/Controller, Server = Rechenzentrale).
 *
 * Enthalten:
 *   - Qwen-2.5-Modellleiter (0.5b / 1.5b / 3b / 7b / 14b) mit Aufgaben-Tiers
 *   - Pull-Plan: fehlende Modelle werden identifiziert (fuer /api/pull)
 *   - Ehrliche Validierungs-Schwellen: gruen nur bei messbar stabiler Basis
 *   - Free-Tier-Dokumentation im Logik-Kommentar (kein Fake-Gruen)
 *
 * Alle Funktionen sind deterministisch und ohne IO — die Tests decken die
 * Leiter, den Pull-Plan und die Schwelle-Grenzen ab.
 */

/** Qwen-2.5-Modellleiter, aufsteigend nach Groesse. */
export type QwenLadderModel = "qwen2.5:0.5b" | "qwen2.5:1.5b" | "qwen2.5:3b" | "qwen2.5:7b" | "qwen2.5:14b";

export const QWEN_LADDER: readonly QwenLadderModel[] = [
  "qwen2.5:0.5b",
  "qwen2.5:1.5b",
  "qwen2.5:3b",
  "qwen2.5:7b",
  "qwen2.5:14b",
] as const;

/** Ungefaehre Modellgroesse in Milliarden Parametern (fuer Sortierung/Logs). */
const QWEN_SIZE: Record<QwenLadderModel, number> = {
  "qwen2.5:0.5b": 0.5,
  "qwen2.5:1.5b": 1.5,
  "qwen2.5:3b": 3,
  "qwen2.5:7b": 7,
  "qwen2.5:14b": 14,
};

/** Aufgaben-Tiers: kleine Aufgaben auf kleine Modelle — ehrlich schnell. */
export type QwenTaskTier = "micro" | "chat" | "reasoning" | "heavy";

export const TASK_TIER_LABEL: Record<QwenTaskTier, string> = {
  micro: "Mikro-Aufgaben (Label, Einordnung, Kurzantworten)",
  chat: "Chat und Assistant-Antworten",
  reasoning: "Schlussfolgerungen, Analysen, strukturierte Entwuerfe",
  heavy: "Schwere Ausarbeitungen (nur mit Server-Puffer)",
};

/** Empfohlene Modellgroesse pro Tier — bewusst konservativ. */
const TIER_TARGET_SIZE: Record<QwenTaskTier, number> = { micro: 0.5, chat: 1.5, reasoning: 3, heavy: 7 };

/** Waehlt das passende Modell aus der VERFUEGBAREN Leiter (nie groesser als noetig). */
export function pickQwenForTask(tier: QwenTaskTier, available: readonly QwenLadderModel[]): QwenLadderModel | null {
  const target = TIER_TARGET_SIZE[tier];
  const ascending = QWEN_LADDER.filter((model) => available.includes(model)).sort((a, b) => QWEN_SIZE[a] - QWEN_SIZE[b]);
  const smallestSufficient = ascending.find((model) => QWEN_SIZE[model] >= target);
  return smallestSufficient ?? (ascending.length > 0 ? ascending[ascending.length - 1] : null);
}

/** Pull-Plan: fehlende Modelle der Leiter, begrenzt auf eine Zielgroesse. */
export function planQwenPulls(
  installed: readonly string[],
  maxModel: QwenLadderModel = "qwen2.5:7b",
): { pulls: QwenLadderModel[]; skippedTooLarge: QwenLadderModel[] } {
  const maxSize = QWEN_SIZE[maxModel];
  const pulls: QwenLadderModel[] = [];
  const skippedTooLarge: QwenLadderModel[] = [];
  for (const model of QWEN_LADDER) {
    if (QWEN_SIZE[model] > maxSize) {
      skippedTooLarge.push(model);
      continue;
    }
    if (!installed.includes(model)) pulls.push(model);
  }
  return { pulls, skippedTooLarge };
}

/** Liest die installierten Modelle aus einer Ollama-/api/tags-Antwort. */
export function readInstalledModels(tagsResponse: { models?: { name?: string; model?: string }[] } | null | undefined): string[] {
  if (!tagsResponse || !Array.isArray(tagsResponse.models)) return [];
  return tagsResponse.models
    .map((entry) => (typeof entry.name === "string" ? entry.name : typeof entry.model === "string" ? entry.model : ""))
    .filter((name) => name.length > 0);
}

/** Normalisiert einen Modellnamen auf Leiter-Kandidaten (Tag-Präfixe zulässig, z. B. "qwen2.5:0.5b-instruct" bleibt 0.5b-Tier zugeordnet). */
export function normalizeQwenName(name: string): QwenLadderModel | null {
  const match = /^qwen2\.5:(0\.5b|1\.5b|3b|7b|14b)/.exec(name.trim().toLowerCase());
  return match ? (`qwen2.5:${match[1]}` as QwenLadderModel) : null;
}

export type InferenceProbe = {
  model: QwenLadderModel;
  latencyMs: number;
  tokensPerSecond: number | null;
  ok: boolean;
};

export type FleetHealth = {
  status: "green" | "yellow" | "red";
  headline: string;
  reasons: string[];
};

/**
 * Ehrliche Flotten-Health: gruen nur, wenn mindestens ein Modell der Leiter
 *stabil antwortet UND die Latenz im Rahmen liegt. Keine Ausrede fuer kaputte
 * Server — aber auch kein falsches Rot bei einmaligem langsamen Request.
 */
export function assessFleetHealth(probes: InferenceProbe[], minModelsOk = 1): FleetHealth {
  const ok = probes.filter((probe) => probe.ok);
  const reasons: string[] = [];
  if (probes.length === 0) {
    return { status: "red", headline: "Keine Messwerte — Server nicht geprüft.", reasons: ["Validierung lief nicht."] };
  }
  if (ok.length < minModelsOk) {
    reasons.push(`Nur ${ok.length}/${probes.length} Modell(e) antworteten korrekt.`);
  }
  const slow = ok.filter((probe) => probe.latencyMs > 12_000);
  if (slow.length === ok.length && ok.length > 0) {
    reasons.push(`Alle erfolgreichen Aufrufe über 12 s (${slow.map((probe) => probe.model).join(", ")}).`);
  }
  const status = reasons.length === 0 ? "green" : ok.length > 0 ? "yellow" : "red";
  const headline =
    status === "green"
      ? `Flotte stabil: ${ok.length} Modell(e) im Rahmen (${ok.map((probe) => probe.model).join(", ")}).`
      : status === "yellow"
        ? `Teilweise stabil: ${ok.length} Modell(e) ok, aber Einschränkungen.`
        : "Server rot: keine stabile Inferenz messbar.";
  return { status, headline, reasons };
}

/**
 * Rotator-Empfehlung Ollama vs. Cloud-Gratis-Routen: Ollama ist primaer,
 * wenn es stabil und schnell genug ist; sonst weicht der Rotator ehrlich
 * auf die Gratis-Kette (Groq > OpenRouter > Gemini) aus.
 */
export function recommendPrimaryRoute(fleet: FleetHealth, latencyMs: number, maxLocalLatencyMs = 8_000): "ollama" | "cloud" {
  if (fleet.status === "red") return "cloud";
  if (fleet.status === "yellow" && latencyMs > maxLocalLatencyMs) return "cloud";
  return "ollama";
}

/** Deutsch lesbarer Setup-Hinweis fuer den Remote-Server (ehrlich, ohne Fake-Versprechen). */
export function freeTierHint(): string {
  return [
    "Gratis-Server-Optionen (Account noetig — nur du kannst ihn anlegen):",
    "1. GitHub Codespaces (kostenloses Kontingent) — schnellster Start.",
    "2. Hugging Face Spaces (Free CPU) — dauerhaft gratis, aber CPU-langsam fuer 7B+.",
    "3. Oracle Cloud Always Free (ARM 24GB RAM) — beste Gratis-Basis fuer Qwen 7B/14B.",
    "Danach: scripts/ollama-server-setup.sh ausfuehren und AI_OLLAMA_BASE_URL auf Render setzen.",
  ].join("\n");
}
