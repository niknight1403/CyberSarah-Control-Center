/**
 * Faehigkeitsparitaet 6/6 — Capability-Registry: das ehrliche Paritaets-
 * register gegen den Base44-Superagenten.
 *
 * Datenfluss:
 *   Der Base44-Faehigkeitskatalog (Chat, Gedaechtnis, Skills, Workflows,
 *   Sub-Agenten, Tools, Entities, Connectors, Kanaele, Ziele) wird gegen
 *   EVIDENZ in der App geprueft: Jede Faehigkeit nennt die Module, die
 *   sie belegen — ohne Beleg ist der Zustand "grau", nie "gruen".
 *
 * Ehrlichkeits-Grenze: Paritaet wird nur behauptet, wo ein Modul existiert
 *   (Evidenz-Liste nicht leer). Der Bericht trennt scharf: gruen = belegt,
 *   grau = Grundlage da, aber nicht vollstaendig, rot = fehlt. Alles im
 *   Rahmen der Gratis-Spitze (Free-LLM-Kette, lokale Tools).
 */

export type CapabilityId =
  | "chat"
  | "gedaechtnis"
  | "skills"
  | "workflows"
  | "sub-agenten"
  | "tools"
  | "entities"
  | "connectors"
  | "kanaele"
  | "ziele";

export type CapabilityVerdict = "gruen" | "grau" | "rot";

export type CapabilityEntry = {
  id: CapabilityId;
  /** Was der Base44-Superagent in dieser Faehigkeit tut (Vergleichsmassstab). */
  base44Reference: string;
  /** App-Module, die diese Faehigkeit BELEGEN (Evidenz, keine Behauptung). */
  evidenceModules: string[];
  /** Ehrliche Einschraenkung der App-Fassung (leer = vollstaendig). */
  limitation: string | null;
};

/** Kanonischer Katalog: die Faehigkeiten des Base44-Superagenten. */
export const CAPABILITY_CATALOG: CapabilityEntry[] = [
  {
    id: "chat",
    base44Reference: "Mehrfach-Chat mit LLM (Streaming, Prompt-Pruning)",
    evidenceModules: ["lib/superagent-chat-logic.ts", "server/_core/llm.ts (Free-Kette Groq>OpenRouter>Gemini)"],
    limitation: null,
  },
  {
    id: "gedaechtnis",
    base44Reference: "Langzeit-Gedaechtnis + Konsolidierung + Session-Logs",
    evidenceModules: ["lib/agent-memory-logic.ts", "lib/agent-memory-consolidation-logic.ts", "lib/chat-session-logic.ts"],
    limitation: null,
  },
  {
    id: "skills",
    base44Reference: "Wiederverwendbare Skills mit Parameter-Schema, validiert ausgefuehrt",
    evidenceModules: ["lib/agent-skill-registry-logic.ts"],
    limitation: null,
  },
  {
    id: "workflows",
    base44Reference: "Geplante + getriggerte Automatisierungen, aktivierbar/pausierbar",
    evidenceModules: ["lib/agent-workflow-scheduler-logic.ts", "lib/webhook-ingest-logic.ts (Sprint 336: signierte Eingangs-Events)"],
    limitation: null,
  },
  {
    id: "sub-agenten",
    base44Reference: "Missionen mit Tasks, Abhaengigkeiten, Scopes, First-Success-Rennen",
    evidenceModules: ["lib/subagent-delegation-logic.ts", "lib/admin-autonomous-agent-logic.ts (Runtime)"],
    limitation: null,
  },
  {
    id: "tools",
    base44Reference: "Werkzeug-Routing: Suche, Dateien, Entities, Bild, Web, Browser, Audio",
    evidenceModules: ["lib/agent-tool-router-logic.ts", "lib/code-search-logic.ts", "lib/image-generation-logic.ts"],
    limitation: "Externe Tools nur mit konfigurierter (kostenloser) Anbindung",
  },
  {
    id: "entities",
    base44Reference: "Datenspeicher mit CRUD, Filter, Pagination",
    evidenceModules: ["Drizzle-Schema + Task-Ledger (lib/task-ledger-logic.ts)"],
    limitation: null,
  },
  {
    id: "connectors",
    base44Reference: "OAuth-Anbindungen an Drittanbieter",
    evidenceModules: ["lib/connector-preferences-logic.ts"],
    limitation: "Präferenzen-Logik vorhanden, echte OAuth-Flows bewusst nicht in der Gratis-Spitze",
  },
  {
    id: "kanaele",
    base44Reference: "WhatsApp, Telegram, iMessage, Slack, Phone",
    evidenceModules: ["lib/channel-parity-logic.ts", "lib/telegram-notify-logic.ts"],
    limitation: "Gratis betreibbar: Telegram, Slack; WhatsApp/iMessage/Phone brauchen bezahlte Anbindungen — ehrlich ausgeschlossen",
  },
  {
    id: "ziele",
    base44Reference: "Dauerhafte Ziele mit Task-Graphen und Fortschritt",
    evidenceModules: ["lib/goal-graph-logic.ts"],
    limitation: null,
  },
];

/** Urteil je Faehigkeit: ohne Evidenz rot, mit Einschraenkung grau, sonst gruen. */
export function verdict(entry: CapabilityEntry): CapabilityVerdict {
  if (entry.evidenceModules.length === 0) return "rot";
  return entry.limitation === null ? "gruen" : "grau";
}

/** Vollstaendige Paritaet nur, wenn KEINE Faehigkeit rot ist. */
export function parityVerdict(catalog: CapabilityEntry[] = CAPABILITY_CATALOG): {
  verdict: CapabilityVerdict;
  counts: Record<CapabilityVerdict, number>;
} {
  const counts: Record<CapabilityVerdict, number> = { gruen: 0, grau: 0, rot: 0 };
  for (const entry of catalog) counts[verdict(entry)] += 1;
  const overall: CapabilityVerdict =
    counts.rot > 0 ? "rot" : counts.grau > 0 ? "grau" : "gruen";
  return { verdict: overall, counts };
}

/** Paritaetsbericht fuer den Superagent-Tab: je Faehigkeit eine Zeile mit Urteil. */
export function buildParityReport(catalog: CapabilityEntry[] = CAPABILITY_CATALOG): string {
  const lines = ["Faehigkeitsparitaet gegen den Base44-Superagenten:"];
  for (const entry of catalog) {
    const v = verdict(entry);
    const mark = v === "gruen" ? "[GRUEN]" : v === "grau" ? "[GRAU — Einschraenkung benannt]" : "[ROT — fehlt]";
    lines.push(`- ${mark} ${entry.id}: ${entry.base44Reference}`);
    lines.push(`    Beleg: ${entry.evidenceModules.join(", ")}`);
    if (entry.limitation) lines.push(`    Einschraenkung: ${entry.limitation}`);
  }
  const { verdict: overall, counts } = parityVerdict(catalog);
  lines.push(
    `Gesamt: ${overall.toUpperCase()} (${counts.gruen} voll, ${counts.grau} mit Einschraenkung, ${counts.rot} fehlend). Alles innerhalb der Gratis-Spitze (Free-LLM-Kette, lokale Tools).`,
  );
  return lines.join("\n");
}
