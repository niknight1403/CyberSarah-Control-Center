/**
 * AI Influenza Team — Dashboard-Ansichten (Sprint 7).
 *
 * Die zehn Ansichten aus dem Phase-7-Auftrag sind hier als eine Quelle
 * definiert, damit Navigation, Admin-Gating und Texte nicht zwischen Screen
 * und Tests auseinanderlaufen. Alle Zahlen bleiben "unbekannt", solange keine
 * Datenquelle existiert: formatEuroCents liefert dann "—" statt einer 0.
 */

export const AI_INFLUENZA_DASHBOARD_VIEWS = [
  { id: "revenue", title: "Revenue Dashboard", requiresAdmin: false, purpose: "Umsatz, Pakete und Zahlungsstatus je Auftrag." },
  { id: "agents", title: "AI Agent Team", requiresAdmin: true, purpose: "Acht Agenten mit Mission, Fähigkeiten und Freigabegrenzen." },
  { id: "leads", title: "Lead Pipeline", requiresAdmin: true, purpose: "Qualifizierte B2B-Leads, Opt-out und Kundenstatus." },
  { id: "customers", title: "Customer Management", requiresAdmin: true, purpose: "Aufträge, Workflow-Schritt und Lieferfortschritt." },
  { id: "content", title: "Content Factory", requiresAdmin: false, purpose: "Entwürfe, Medienpakete und Freigabestatus." },
  { id: "campaigns", title: "Campaign Manager", requiresAdmin: true, purpose: "Kampagnenplanung je Kunde und Kanal." },
  { id: "billing", title: "Stripe & Subscriptions", requiresAdmin: false, purpose: "Abo-Verwaltung, Kundenportal und Rechnungen." },
  { id: "profit", title: "Profit Analytics", requiresAdmin: true, purpose: "Umsatz, Kosten und Deckungsbeitrag getrennt." },
  { id: "autopilot", title: "Autopilot Control", requiresAdmin: true, purpose: "Betriebsmodus und autonom erlaubte Schritte." },
  { id: "health", title: "System Health & QA", requiresAdmin: true, purpose: "Datenbank, Lieferstau und offene Freigaben." },
] as const;

export type AiInfluenzaDashboardView = (typeof AI_INFLUENZA_DASHBOARD_VIEWS)[number];
export type AiInfluenzaDashboardViewId = AiInfluenzaDashboardView["id"];

export const DEFAULT_AI_INFLUENZA_DASHBOARD_VIEW: AiInfluenzaDashboardViewId = "revenue";

export function resolveAiInfluenzaDashboardView(id: string | null | undefined): AiInfluenzaDashboardView {
  const found = AI_INFLUENZA_DASHBOARD_VIEWS.find((view) => view.id === id);
  return found ?? AI_INFLUENZA_DASHBOARD_VIEWS.find((view) => view.id === DEFAULT_AI_INFLUENZA_DASHBOARD_VIEW)!;
}

/** Blaettert zyklisch durch die Ansichten (mobile Wisch-/Pfeil-Navigation). */
export function stepAiInfluenzaDashboardView(
  id: string | null | undefined,
  direction: 1 | -1,
): AiInfluenzaDashboardView {
  const current = resolveAiInfluenzaDashboardView(id);
  const index = AI_INFLUENZA_DASHBOARD_VIEWS.indexOf(current);
  const nextIndex = (index + direction + AI_INFLUENZA_DASHBOARD_VIEWS.length) % AI_INFLUENZA_DASHBOARD_VIEWS.length;
  return AI_INFLUENZA_DASHBOARD_VIEWS[nextIndex];
}

/** "—" bedeutet: keine belegte Zahl. Bewusst nicht 0, damit nichts erfunden wird. */
export function formatEuroCents(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value)} %`;
}

/** Liest eine Zahl aus unbekannten API-Daten, ohne NaN weiterzureichen. */
export function readNumber(source: unknown, key: string): number | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type AiInfluenzaHealthLevel = "ok" | "warn" | "critical";

export type AiInfluenzaHealthVerdict = {
  level: AiInfluenzaHealthLevel;
  label: string;
  notes: string[];
};

/**
 * Ehrliche Systembewertung: eine fehlende Datenbank ist kritisch, ein Lieferstau
 * oder eine offene Freigabe ist Warnung, alles andere ist ok.
 */
export function buildAiInfluenzaHealthVerdict(input: {
  databaseAvailable: boolean;
  openOrders: number | null;
  waitingApprovals: number | null;
  failedTasks?: number | null;
}): AiInfluenzaHealthVerdict {
  const notes: string[] = [];
  if (!input.databaseAvailable) {
    return { level: "critical", label: "Datenbank nicht erreichbar", notes: ["Ohne Datenbank sind weder Aufträge noch Kosten belegbar."] };
  }
  const openOrders = input.openOrders ?? 0;
  const waiting = input.waitingApprovals ?? 0;
  const failed = input.failedTasks ?? 0;
  if (failed > 0) notes.push(`${failed} fehlgeschlagene Aufgabe(n) prüfen`);
  if (waiting > 0) notes.push(`${waiting} Auftrag/Aufträge warten auf Freigabe`);
  if (openOrders > 0) notes.push(`${openOrders} offene(r) Auftrag/Aufträge in Bearbeitung`);
  if (failed > 0 || waiting > 0) return { level: "warn", label: "Beobachtung nötig", notes };
  return { level: "ok", label: "Betriebsbereit", notes: notes.length ? notes : ["Keine offenen Freigaben, keine fehlgeschlagenen Aufgaben."] };
}
