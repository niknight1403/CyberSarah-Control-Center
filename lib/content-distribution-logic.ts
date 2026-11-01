/**
 * Woechentliche Inhalte fuer Marketing: Case Study und Release Notes.
 * Entwuerfe werden erzeugt, aber nie ungeprueft veroeffentlicht - die
 * Freigabe bleibt eine bewusste Entscheidung eines Menschen.
 */

export type ContentKind = "case_study" | "release_notes";

export type ContentDraft = {
  kind: ContentKind;
  title: string;
  body: string;
  channels: string[];
  requiresApproval: true;
  publishAt: string | null;
};

export type ContentInput = {
  kind: ContentKind;
  customer?: string;
  metric?: string;
  improvement?: string;
  features?: string[];
  version?: string;
  now?: Date;
};

export function buildContentDraft(input: ContentInput): { ok: boolean; reason: string | null; draft: ContentDraft | null } {
  const now = input.now ?? new Date();
  if (input.kind === "case_study") {
    const customer = String(input.customer || "").trim();
    const metric = String(input.metric || "").trim();
    if (!customer || !metric) return { ok: false, reason: "kunde-und-metrik-erforderlich", draft: null };
    return {
      ok: true,
      reason: null,
      draft: {
        kind: "case_study",
        title: `Wie ${customer} mit CyberSarah ${metric} erreicht`,
        body: [
          `Ausgangslage: ${customer} wollte ${String(input.improvement || "den manuellen Aufwand senken")}.`,
          `Ergebnis: ${metric}.`,
          "Vorgehen: Automatisierte Lead-Qualifizierung, gemessene API-Nutzung und abgestimmte Outreach-Kampagnen.",
          "Hinweis: Zahlenangaben vor Veroeffentlichung mit dem Kunden abstimmen.",
        ].join("\n\n"),
        channels: ["blog", "linkedin"],
        requiresApproval: true,
        publishAt: null,
      },
    };
  }
  const features = (input.features ?? []).map((item) => String(item).trim()).filter(Boolean);
  if (features.length === 0) return { ok: false, reason: "mindestens-ein-feature-erforderlich", draft: null };
  return {
    ok: true,
    reason: null,
    draft: {
      kind: "release_notes",
      title: `Release ${String(input.version || "aktuell")}: ${features[0]}`,
      body: features.map((feature) => `- ${feature}`).join("\n"),
      channels: ["changelog", "email"],
      requiresApproval: true,
      publishAt: null,
    },
  };
}

/** Naechster woechentlicher Lauf: kommender Montag, 09:00 UTC. */
export function nextWeeklyRun(now: Date = new Date()): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0));
  const daysUntilMonday = (8 - next.getUTCDay()) % 7 || 7;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  return next;
}

export function approveDraft(draft: ContentDraft, approvedBy: string, publishAt: Date): ContentDraft | null {
  if (!String(approvedBy || "").trim()) return null;
  if (Number.isNaN(publishAt.getTime())) return null;
  return { ...draft, publishAt: publishAt.toISOString() };
}
