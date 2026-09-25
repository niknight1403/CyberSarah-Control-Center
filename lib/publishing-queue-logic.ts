/**
 * Sprint 365 — Publishing-Warteschlangen-Logik (rein, deterministisch).
 *
 * Datenfluss:
 *   Ein Kampagnenplan (lib/influencer-reach-logic.ts) wird in geplante
 *   Publishing-Jobs ueberfuehrt. Der Autopilot prueft, welche Jobs faellig
 *   sind, loest den Modus auf (live mit Credentials, sonst ehrlich Sandbox)
 *   und berechnet Retry-Zeiten mit exponentiellem Backoff.
 *
 * Ehrlichkeits-Grenzen:
 *   - "sandbox_veroeffentlicht" ist KEINE echte Veroeffentlichung — der
 *     Modus steht in jedem Job und wird nie als Live-Erfolg ausgegeben.
 *   - Live-Publishing braucht Nutzer-Credentials in Env-Variablen; ohne
 *     sie wird nicht getan, als waeren sie da.
 *   - Instagram (Graph-API, 2-Schritt: Container -> media_publish) und TikTok
 *     (Content-Posting-API, PULL_FROM_URL) sind vollstaendig implementiert und
 *     gehen live, wenn Token + Asset-URL vorliegen; ohne Asset bleibt es
 *     ehrlicher Sandbox-Modus mit klar benanntem Grund.
 */

import type { CampaignPlan, InfluencerGoal } from "./influencer-reach-logic";

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
export const TEXT_PLATFORMS = ["linkedin", "x", "threads"] as const;
export const MEDIA_PLATFORMS = ["instagram", "tiktok"] as const;

/** Plattform-Credentials (aus Env, niemals aus der DB). */
export type PlatformCredentials = Partial<
  Record<"linkedin" | "x" | "threads" | "instagram" | "tiktok", { token: string; endpointUserId?: string }>
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
  options: { startAt?: Date; slotOffsetHours?: number } = {}
): PlannedPublishJob[] {
  const startAt = options.startAt ?? new Date();
  const offsetHours = Math.max(options.slotOffsetHours ?? 9, 0); // Standard: 09:00 lokale Zeit
  const startOfDay = new Date(startAt);
  startOfDay.setHours(offsetHours, 0, 0, 0);

  return plan.slots.map((slot) => {
    const scheduledFor = new Date(startOfDay.getTime() + (slot.day - 1) * 86_400_000);
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

export type PublishingMode = "live" | "sandbox";

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
 * Sandbox mit klar benanntem Grund — kein Live ohne Asset.
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
    return { mode: "sandbox", platform, reason: `Unbekannte Plattform "${platform}" — Sandbox statt Blindflug.` };
  }
  if (!cred?.token) {
    const envName = isMedia
      ? `${platform === "instagram" ? "INSTAGRAM" : "TIKTOK"}_PUBLISH_TOKEN`
      : `${platform.toUpperCase()}_PUBLISH_TOKEN`;
    return {
      mode: "sandbox",
      platform,
      reason: `Kein ${platform}-Token in der Umgebung (Env ${envName}) — Sandbox statt Vortaeuschung.`,
    };
  }
  if (platform === "linkedin" && !cred.endpointUserId) {
    return {
      mode: "sandbox",
      platform,
      reason: "LinkedIn braucht neben dem Token die Autorisierungs-Person (Env LINKEDIN_PUBLISH_USER_URN) — Sandbox.",
    };
  }
  if (platform === "threads" && !cred.endpointUserId) {
    return {
      mode: "sandbox",
      platform,
      reason: "Threads braucht neben dem Token die User-ID (Env THREADS_PUBLISH_USER_ID) — Sandbox.",
    };
  }
  if (isMedia && !cred.endpointUserId && platform === "instagram") {
    return {
      mode: "sandbox",
      platform,
      reason: "Instagram braucht neben dem Token die IG-User-ID (Env INSTAGRAM_PUBLISH_USER_ID) — Sandbox.",
    };
  }
  if (isMedia) {
    if (!options.hasAsset) {
      return {
        mode: "sandbox",
        platform,
        reason: `${platform} ist ein Medien-Post ohne Asset-URL — Sandbox statt Blind-Post; Asset per enqueueCampaign oder Job-Update setzen.`,
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
