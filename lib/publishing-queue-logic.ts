/**
 * Sprint 365 — Publishing-Warteschlangen-Logik (rein, deterministisch).
 *
 * Datenfluss:
 *   Ein Kampagnenplan (lib/influencer-reach-logic.ts) wird in geplante
 *   Publishing-Jobs ueberfuehrt. Der Autopilot prueft, welche Jobs faellig
 *   sind, loest den Modus auf (live mit Credentials, sonst blockiert)
 *   und berechnet Retry-Zeiten mit exponentiellem Backoff.
 *
 * Ehrlichkeits-Grenzen:
 *   - Legacy-Zeilen mit "sandbox_veroeffentlicht" bleiben lesbar, neue Läufe erzeugen diesen Status nicht mehr.
 *   - Live-Publishing braucht Nutzer-Credentials in Env-Variablen; ohne
 *     sie wird nicht getan, als waeren sie da.
 *   - Instagram (Graph-API, 2-Schritt: Container -> media_publish) und TikTok
 *     (Content-Posting-API, PULL_FROM_URL) sind vollstaendig implementiert und
 *     gehen live, wenn Token + Asset-URL vorliegen; ohne Asset bleibt es
 *     ehrlicher Blockiermodus mit klar benanntem Grund.
 */

import type { CampaignPlan, InfluencerGoal } from "./influencer-reach-logic";
import { zonedCampaignSlot } from "./publishing-timezone-logic";

export const PUBLISHING_STATUSES = [
  "geplant",
  "sandbox_veroeffentlicht",
  "veroeffentlicht",
  "fehlgeschlagen",
  "abgebrochen",
] as const;
export type PublishingStatus = (typeof PUBLISHING_STATUSES)[number];

export const MAX_PUBLISH_ATTEMPTS = 3;
export const RETRY_BACKOFF_MINUTES = [10, 60, 360] as const;
export const TEXT_PLATFORMS = ["linkedin", "x", "threads", "bluesky"] as const;
export const MEDIA_PLATFORMS = ["instagram", "tiktok"] as const;

/** Plattform-Credentials (aus Env, niemals aus der DB). */
export type PlatformCredentials = Partial<
  Record<"linkedin" | "x" | "threads" | "bluesky" | "instagram" | "tiktok", { token: string; endpointUserId?: string }>
>;

export type PlannedPublishJob = {
  product: string;
  goal: InfluencerGoal;
  persona: string;
  platform: string;
  campaignDay: number;
  dedupeKey: string;
  scheduledFor: Date;
};

/** Kampagnen-Slots -> geplante Jobs (deterministisch, ab startAt). */
export function campaignToPlannedJobs(
  plan: CampaignPlan,
  options: { startAt?: Date; slotOffsetHours?: number; timeZone?: string } = {}
): PlannedPublishJob[] {
  const startAt = options.startAt ?? new Date();
  const offsetHours = Math.max(options.slotOffsetHours ?? 9, 0); // Standard: 09:00 lokale Zeit
  const startOfDay = new Date(startAt);
  startOfDay.setHours(offsetHours, 0, 0, 0);

  return plan.slots.map((slot) => {
    const scheduledFor = options.timeZone
      ? zonedCampaignSlot(startAt,slot.day,Math.floor(offsetHours),options.timeZone)
      : new Date(startOfDay.getTime() + (slot.day - 1) * 86_400_000);
    return {
      product: plan.product,
      goal: plan.goal,
      persona: slot.persona,
      platform: slot.platform,
      campaignDay: slot.day,
      dedupeKey: buildDedupeKey(plan.product, slot.persona, slot.platform, slot.day),
      scheduledFor,
    };
  });
}

/** Eindeutiger Job-Schluessel (Produkt x Persona x Plattform x Kampagnentag). */
export function buildDedupeKey(product: string, persona: string, platform: string, campaignDay: number): string {
  return `${product.trim().toLowerCase().slice(0, 60)}|${persona}|${platform}|${campaignDay}`;
}

/** Ist ein Job faellig (geplant und Zeitpunkt erreicht)? */
export function isJobDue(job: { status: string; scheduledFor: Date }, now = new Date()): boolean {
  return job.status === "geplant" && job.scheduledFor.getTime() <= now.getTime();
}

/** Naechster Retry-Zeitpunkt (exponentiell) oder null nach max. Versuchen. */
export function nextRetryAt(attempts: number, from = new Date()): Date | null {
  if (attempts >= MAX_PUBLISH_ATTEMPTS) return null;
  const minutes = RETRY_BACKOFF_MINUTES[Math.min(attempts, RETRY_BACKOFF_MINUTES.length - 1)];
  return new Date(from.getTime() + minutes * 60_000);
}

export type PublishingMode = "live" | "blocked";

export type ModeResolution = {
  mode: PublishingMode;
  platform: string;
  reason: string;
};

/**
 * Löst den Publishing-Modus pro Plattform auf — ehrlich statt optimistisch:
 * live nur mit vollstaendigen Credentials. Text-Plattformen (X, LinkedIn,
 * Threads) brauchen nur den Token; Medien-Plattformen (Instagram, TikTok)
 * brauchen zusaetzlich ein Asset (Bild-URL bzw. gehostetes Video), sonst
 * Blockade mit klar benanntem Grund — kein Live ohne Asset.
 */
export function resolvePublishingMode(
  platform: string,
  credentials: PlatformCredentials,
  options: { hasAsset?: boolean } = {}
): ModeResolution {
  const cred = credentials[platform as keyof PlatformCredentials];
  const isMedia = (MEDIA_PLATFORMS as readonly string[]).includes(platform);
  const isText = (TEXT_PLATFORMS as readonly string[]).includes(platform);

  if (!isMedia && !isText) {
    return { mode: "blocked", platform, reason: `Unbekannte Plattform "${platform}" — Blockade statt Blindflug.` };
  }
  if (!cred?.token) {
    const envName = isMedia
      ? `${platform === "instagram" ? "INSTAGRAM" : "TIKTOK"}_PUBLISH_TOKEN`
      : `${platform.toUpperCase()}_PUBLISH_TOKEN`;
    return {
      mode: "blocked",
      platform,
      reason: `Kein ${platform}-Token in der Umgebung (Env ${envName}) — Blockade statt Vortaeuschung.`,
    };
  }
  if (platform === "linkedin" && !cred.endpointUserId) {
    return {
      mode: "blocked",
      platform,
      reason: "LinkedIn braucht neben dem Token die Autorisierungs-Person (Env LINKEDIN_PUBLISH_USER_URN) — Blockade.",
    };
  }
  if (platform === "bluesky" && !cred.endpointUserId) {
    return {
      mode: "blocked",
      platform,
      reason: "Bluesky braucht neben dem App-Passwort den Handle (Env BLUESKY_IDENTIFIER) — Blockade.",
    };
  }
  if (platform === "threads" && !cred.endpointUserId) {
    return {
      mode: "blocked",
      platform,
      reason: "Threads braucht neben dem Token die User-ID (Env THREADS_PUBLISH_USER_ID) — Blockade.",
    };
  }
  if (isMedia && !cred.endpointUserId && platform === "instagram") {
    return {
      mode: "blocked",
      platform,
      reason: "Instagram braucht neben dem Token die IG-User-ID (Env INSTAGRAM_PUBLISH_USER_ID) — Blockade.",
    };
  }
  if (isMedia) {
    if (!options.hasAsset) {
      return {
        mode: "blocked",
        platform,
        reason: `${platform} ist ein Medien-Post ohne Asset-URL — Blockade statt Blind-Post; Asset per enqueueCampaign oder Job-Update setzen.`,
      };
    }
    return { mode: "live", platform, reason: `Credentials und Asset vorhanden — Live-Publishing auf ${platform}.` };
  }
  return { mode: "live", platform, reason: `Credentials vollstaendig — Live-Publishing auf ${platform}.` };
}

/** Autopilot an/aus (Env-Deckel, Default: an). */
export function isAutopilotEnabled(envFlag: string | undefined): boolean {
  return String(envFlag ?? "").toLowerCase() !== "off";
}


export const PUBLISHING_CIRCUIT_MIN_SAMPLE = 5;
export const PUBLISHING_CIRCUIT_FAILURE_PCT = 50;

/** Sprint 8/10 — Reliability-Circuit-Breaker fuer Live-Publishing.
 * Eine klare Fehlerwelle pausiert weitere externe Posts, statt einen
 * reproduzierbaren Defekt auf weitere Plattformen zu vervielfaeltigen.
 */
export function evaluatePublishingReliabilityCircuit(input:{
  published:number;
  failed:number;
}):{open:boolean;sample:number;failureRatePct:number|null;reason:string}{
  const published=Math.max(0,Math.floor(Number.isFinite(input.published)?input.published:0));
  const failed=Math.max(0,Math.floor(Number.isFinite(input.failed)?input.failed:0));
  const sample=published+failed;
  if(sample<PUBLISHING_CIRCUIT_MIN_SAMPLE){
    return {open:false,sample,failureRatePct:sample>0?Number((failed/sample*100).toFixed(1)):null,reason:"Noch zu wenig aktuelle Publishing-Evidenz fuer einen Circuit-Breaker."};
  }
  const failureRatePct=Number((failed/sample*100).toFixed(1));
  const open=failed>=3&&failureRatePct>=PUBLISHING_CIRCUIT_FAILURE_PCT;
  return {
    open,
    sample,
    failureRatePct,
    reason:open
      ? `Publishing pausiert: ${failed}/${sample} aktuelle Jobs fehlgeschlagen (${failureRatePct}%). Erst Ursache beheben, dann weiterpublizieren.`
      : `Publishing stabil genug: ${failed}/${sample} Fehler (${failureRatePct}%).`,
  };
}
