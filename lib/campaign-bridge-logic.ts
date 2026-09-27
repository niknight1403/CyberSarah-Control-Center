/**
 * Sprint 373 — Autonome Ideen→Influencer-Kampagnen-Bruecke (rein, testbar).
 *
 * Der Administrator erwartet nach dem Login, dass Produkte und Ideen
 * VON SELBST in das Influencer-Marketing fliessen: Die Bruecke nimmt die
 * offenen Ideen der Ideen-Inbox, leitet Kampagnenziel und Thema ab,
 * waehlt deterministisch die beste Persona + Plattform (Reichweiten-Engine,
 * Sprint 364) und erzeugt Content-Entwuerfe fuer die Freigabe-Queue.
 *
 * Ehrlichkeits-Grenzen (bewusst, keine Ausnahme):
 *   - Die Idee selbst bleibt unangetastet in der Inbox (Sprint 242:
 *     nichts verlaesst die Inbox von selbst) — die Bruecke erzeugt nur
 *     einen Verweis-Entwurf, keine Umwandlung.
 *   - Nothing publishes: Jeder Entwurf landet mit Status "pending" in
 *     der Freigabe-Queue (Sprint 346, HITL). Das Posting selbst macht
 *     erst die Publishing-Pipeline nach menschlicher Freigabe.
 *   - Kostenfrei: die Zuweisung ist rein deterministisch; der Content
 *     entsteht im bestehenden Free-Tier-LLM-Pool der Draft-Engine.
 *   - "Nacheinander": pro Zyklus maximal BRIDGE_MAX_PER_CYCLE Ideen —
 *     kein Batch-Feuerwerk, sondern eine nach der anderen.
 */

import { DRAFT_MAX_PENDING_PER_KIND, type DraftKind } from "@/lib/draft-engine-logic";
import type { IdeaItem } from "@/lib/idea-inbox-logic";
import { planInfluencerCampaign, type InfluencerGoal } from "@/lib/influencer-reach-logic";
import { validateInfluencerInput } from "@/lib/influencer-persona-logic";

/** Plattformen der Bruecke — inkl. Bluesky (AT Protocol, Sprint 372). */
export type BridgePlatform = "instagram" | "tiktok" | "linkedin" | "x" | "threads" | "bluesky";

/** Maximal Ideen pro Bruecken-Zyklus — bewusst klein, sequenziell. */
export const BRIDGE_MAX_PER_CYCLE = 2;

/** Maximale zu versendende Briefs pro tRPC-Aufruf (Server validiert erneut). */
export const BRIDGE_MAX_BRIEFS_PER_CALL = 3;

/** Ziele-Inferenz: Schluesselwoerter im Ideen-Text (kleingeschrieben). */
const GOAL_KEYWORDS: Array<{ goal: InfluencerGoal; pattern: RegExp }> = [
  { goal: "umsatz", pattern: /umsatz|verkauf|monetar|preis|abo|bezahl|revenue|kauf|kunde/i },
  { goal: "wachstum", pattern: /wachstum|reichweite|follower|community|growth|publikum|audience|bekannt/i },
];

/** Leitet das Kampagnenziel aus Titel + Notiz einer Idee ab. */
export function inferCampaignGoal(text: string): InfluencerGoal {
  for (const { goal, pattern } of GOAL_KEYWORDS) {
    if (pattern.test(text)) return goal;
  }
  return "aufmerksamkeit";
}

/** Baut das Kampagnen-Thema aus der Idee: Titel, ergänzt um die Notiz. */
export function buildCampaignTopic(idea: Pick<IdeaItem, "title" | "note">): { topic: string } | { error: string } {
  const title = idea.title.trim();
  const note = idea.note.trim();
  const raw = note.length > 0 ? `${title}: ${note}` : title;
  try {
    return { topic: validateInfluencerInput(raw) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Thema konnte nicht abgeleitet werden." };
  }
}

export type CampaignBrief = {
  /** Verweis auf die Ursprungs-Idee (bleibt in der Inbox unangetastet). */
  ideaId: string;
  ideaTitle: string;
  personaId: string;
  platform: BridgePlatform;
  goal: InfluencerGoal;
  topic: string;
  /** Titel des entstehenden Freigabe-Entwurfs. */
  draftTitle: string;
};

export type BridgeSkip = { ideaId: string; ideaTitle: string; reason: string };

export type BridgePlan = {
  /** Briefs, die in diesem Zyklus an die Server-Seite gehen — aelteste Idee zuerst. */
  briefs: CampaignBrief[];
  /** Uebersprungene Ideen mit ehrlichem Grund (z. B. zu kurzes Thema). */
  skipped: BridgeSkip[];
  /** Anzahl noch nicht verbrueckter offener Ideen nach diesem Zyklus. */
  remaining: number;
};

/** Ideen-Zustaende, die fuer eine Kampagne in Frage kommen. */
const BRIDGEABLE_STATUSES = new Set(["inbox", "kept"]);

export type BridgeInput = {
  ideas: IdeaItem[];
  /** Bereits verbrueckte Ideen-IDs (Ledger) — werden nie doppelt angefasst. */
  bridgedIdeaIds: ReadonlySet<string>;
  /** Offene content-Entwuerfe in der Freigabe-Queue (Budget-Schutz). */
  pendingContentCount: number;
  maxPerCycle?: number;
};

export function planCampaignBridges(input: BridgeInput): BridgePlan {
  const maxPerCycle = Math.max(1, input.maxPerCycle ?? BRIDGE_MAX_PER_CYCLE);
  const pendingBudget = Math.max(0, DRAFT_MAX_PENDING_PER_KIND - input.pendingContentCount);
  const limit = Math.min(maxPerCycle, pendingBudget);

  const skipped: BridgeSkip[] = [];
  const briefs: CampaignBrief[] = [];

  const candidates = input.ideas
    .filter((idea) => BRIDGEABLE_STATUSES.has(idea.status) && !input.bridgedIdeaIds.has(idea.id))
    .sort((a, b) => a.capturedAt - b.capturedAt || a.id.localeCompare(b.id));

  let processed = 0;
  for (const idea of candidates) {
    if (briefs.length >= limit) break;
    processed += 1;
    const topicResult = buildCampaignTopic(idea);
    if ("error" in topicResult) {
      skipped.push({ ideaId: idea.id, ideaTitle: idea.title, reason: topicResult.error });
      continue;
    }
    const goal = inferCampaignGoal(`${idea.title} ${idea.note}`);
    // planInfluencerCampaign leitet deterministisch Fokus-Persona + Plattform
    // ab (Match-Score x Plattform-Effektivitaet x Zielgewicht, Sprint 364).
    const campaign = planInfluencerCampaign(topicResult.topic, goal, { days: 1, personasPerDay: 1 });
    const platform = (campaign.platformMix[0] ?? "instagram") as BridgePlatform;
    briefs.push({
      ideaId: idea.id,
      ideaTitle: idea.title,
      personaId: campaign.focusPersona,
      platform,
      goal,
      topic: topicResult.topic,
      draftTitle: `Kampagne: ${idea.title}`,
    });
  }

  const remaining = candidates.length - processed;
  return { briefs, skipped, remaining };
}

/** Draft-Art, die die Bruecke erzeugt — fuer Typ-Konsistenz mit der Engine. */
export const BRIDGE_DRAFT_KIND: DraftKind = "content";

/** Plattform-Whitelist der Bruecke (Server validiert erneut). */
export const BRIDGE_PLATFORMS: readonly BridgePlatform[] = ["instagram", "tiktok", "linkedin", "x", "threads", "bluesky"] as const;
