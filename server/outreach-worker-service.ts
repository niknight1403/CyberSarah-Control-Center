/**
 * Autonomer Outreach — mit angezogener Handbremse.
 *
 * Was hier gebaut ist: eine Warteschlange, die aus den vorhandenen Anfragen die
 * aussichtsreichsten Kontakte zieht, den faelligen Sequenzschritt rendert und
 * ihn als Versandauftrag bereitstellt.
 *
 * Was hier ABSICHTLICH nicht passiert: ungefragtes Versenden.
 *
 * Warum: Kaltakquise per E-Mail ohne Einwilligung ist in Deutschland nach § 7
 * UWG unzulaessig und kostet mehr, als sie bringt (Abmahnungen, Domain-
 * Reputation). Deshalb gilt:
 *   1. Angeschrieben werden nur Kontakte, die selbst eine Anfrage gestellt
 *      haben. Das ist Kontaktpflege, nicht Kaltakquise.
 *   2. Versendet wird nur, wenn `OUTREACH_LIVE=1` gesetzt ist und ein
 *      Abmelde-Link konfiguriert ist. Ohne beides bleibt es ein Trockenlauf.
 *   3. Jede Mail traegt den Abmelde-Link. Wer ihn nutzt, fliegt aus der Liste.
 *   4. Tageslimit pro Lauf, damit ein Fehler nicht 500 Mails kostet.
 */
import { AI_INFLUENZA_OUTREACH_SEQUENCE, nextOutreachStep, renderOutreachStep } from "../lib/ai-influenza-outreach-sequence";
import { outreachQueueFromLeads, type PrioritizedLead } from "../lib/b2b-lead-priority-logic";
import { dispatchTransactionalEmail } from "./email-service";
import { listAiInfluenzaIntroRequests } from "./ai-influenza-intro-request-service";
import { readOptOutEmails } from "./outreach-optout-service";
import { toDispatchInput } from "../lib/transactional-email-templates";
import { buildUnsubscribeUrl } from "../lib/outreach-unsubscribe-link";

export const OUTREACH_DAILY_CAP = 20;

export type OutreachMode = "live" | "trockenlauf";

export type OutreachStatus = {
  mode: OutreachMode;
  liveEnabled: boolean;
  unsubscribeConfigured: boolean;
  dailyCap: number;
  reasons: string[];
};

/** Ist der Live-Versand freigeschaltet? Ohne beides: Trockenlauf. */
export function outreachStatus(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): OutreachStatus {
  const liveEnabled = ["1", "true", "yes"].includes((env.OUTREACH_LIVE ?? "").toLowerCase());
  const unsubscribeConfigured = Boolean((env.OUTREACH_UNSUBSCRIBE_BASE_URL ?? "").trim());
  const reasons: string[] = [];
  if (!liveEnabled) reasons.push("OUTREACH_LIVE ist nicht gesetzt: es wird nichts versendet, nur vorbereitet.");
  if (!unsubscribeConfigured) reasons.push("OUTREACH_UNSUBSCRIBE_BASE_URL fehlt: ohne Abmelde-Link kein Versand (Pflicht nach § 7 UWG).");
  return {
    mode: liveEnabled && unsubscribeConfigured ? "live" : "trockenlauf",
    liveEnabled,
    unsubscribeConfigured,
    dailyCap: OUTREACH_DAILY_CAP,
    reasons,
  };
}

export type OutreachDraft = {
  leadId: string;
  email: string;
  company: string | null;
  band: PrioritizedLead["band"];
  priorityScore: number;
  stepId: string;
  subject: string;
  body: string;
  /** Fehlende Pflicht-Platzhalter: dann wird dieser Entwurf NICHT versendet. */
  missing: string[];
  status: "bereit" | "unvollstaendig" | "gesendet" | "fehler";
  detail?: string;
};

function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

/** Baut die Versandauftraege fuer einen Lauf. Sendet nur im Live-Modus. */
export async function runOutreachCycle(input: { limit?: number; now?: Date } = {}): Promise<{
  status: OutreachStatus;
  drafts: OutreachDraft[];
  sent: number;
  skipped: number;
}> {
  const status = outreachStatus();
  const now = input.now ?? new Date();
  const limit = Math.min(OUTREACH_DAILY_CAP, Math.max(1, input.limit ?? 10));

  const { requests } = await listAiInfluenzaIntroRequests(200);
  const queue = outreachQueueFromLeads(
    requests.map((request) => ({
      id: request.id,
      email: request.email,
      company: request.company,
      domain: request.domain,
      goal: request.goal,
      packageId: request.packageId,
      leadScore: request.leadScore,
      receivedAt: request.receivedAt,
    })),
    limit,
  );

  const base = (process.env.OUTREACH_UNSUBSCRIBE_BASE_URL ?? "").trim();
  // Abgemeldete Adressen fliegen raus, bevor irgendetwas gerendert wird.
  const optedOut = await readOptOutEmails();
  const drafts: OutreachDraft[] = [];
  let sent = 0;
  let skipped = 0;

  for (const lead of queue) {
    if (optedOut.has(String(lead.email ?? "").toLowerCase())) {
      skipped += 1;
      continue;
    }
    const createdAt = lead.createdAt ? new Date(lead.createdAt) : now;
    const daysSince = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)));
    const step = nextOutreachStep(daysSince);
    if (!step) {
      skipped += 1;
      continue;
    }
    const unsubscribe = buildUnsubscribeUrl(base, {
      leadNodeKey: (lead as { leadNodeKey?: string | null }).leadNodeKey ?? null,
      email: String(lead.email ?? ""),
    });
    const rendered = renderOutreachStep(step, {
      vorname: firstNameFromEmail(String(lead.email ?? "")),
      firma: (lead.company ?? "").trim() || "dein Betrieb",
      befund: (lead.goal ?? "").trim() || "die Anfrage aus dem Funnel",
      absender: "Heinz-Nikola Oeben",
      abmelde_link: unsubscribe,
    });
    const missing = rendered.missing;
    const draft: OutreachDraft = {
      leadId: String(lead.id ?? ""),
      email: String(lead.email ?? ""),
      company: lead.company ?? null,
      band: lead.band,
      priorityScore: lead.priorityScore,
      stepId: step.id,
      subject: rendered.subject,
      body: rendered.body,
      missing,
      status: missing.length > 0 ? "unvollstaendig" : "bereit",
      detail: missing.length > 0 ? `Fehlende Pflichtangaben: ${missing.join(", ")}` : undefined,
    };

    if (status.mode === "live" && draft.status === "bereit") {
      const outcome = await dispatchTransactionalEmail(
        toDispatchInput(
          {
            kind: "outreach",
            subject: draft.subject,
            body: draft.body,
            idempotencyKey: `outreach:${draft.leadId}:${step.id}`,
          },
          draft.email,
          { documented: true, source: "bestehende Anfrage aus dem Funnel (Kontaktpflege, § 7 Abs. 2 UWG)" },
        ),
      ).catch((error: unknown) => ({
        status: "rejected" as const,
        reason: error instanceof Error ? error.message : String(error),
        configured: false,
      }));
      if (outcome.status === "sent") {
        draft.status = "gesendet";
        sent += 1;
      } else {
        draft.status = "fehler";
        draft.detail = outcome.status === "rejected" ? outcome.reason : outcome.status;
      }
    } else if (draft.status === "bereit") {
      draft.detail = "Trockenlauf: nicht versendet.";
      skipped += 1;
    } else {
      skipped += 1;
    }
    drafts.push(draft);
  }

  console.log(
    `[outreach] Modus ${status.mode} · Kandidaten ${queue.length} · gesendet ${sent} · uebersprungen ${skipped}`,
  );
  return { status, drafts, sent, skipped };
}

/** Sequenzuebersicht fuer die Admin-Anzeige. */
export function outreachSequenceOverview() {
  return AI_INFLUENZA_OUTREACH_SEQUENCE.map((step) => ({
    id: step.id,
    dayOffset: step.dayOffset,
    subject: step.subject,
  }));
}
