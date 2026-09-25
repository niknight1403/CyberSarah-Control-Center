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
 *   - Instagram/TikTok erfordern Medien-Uploads mehrstufiger APIs: diese
 *     Plattformen bleiben im Sandbox-Modus, bis ein Medien-Pfad konfiguriert
 *     ist, und melden das als ehrlichen Grund.
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
  Record<"linkedin" | "x" | "threads", { token: string; endpointUserId?: string }>
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
 * live nur mit vollstaendigen Credentials und nur fuer Text-Plattformen mit
 * einschrittiger API; sonst Sandbox mit klar benanntem Grund.
 */
export function resolvePublishingMode(
  platform: string,
  credentials: PlatformCredentials
): ModeResolution {
  const cred = credentials[platform as keyof PlatformCredentials];
  if ((MEDIA_PLATFORMS as readonly string[]).includes(platform)) {
    return {
      mode: "sandbox",
      platform,
      reason: `${platform} benoetigt mehrstufige Medien-Uploads (Asset-Pipeline) — bleibt im Sandbox-Modus, bis diese konfiguriert ist.`,
    };
  }
  if (!(TEXT_PLATFORMS as readonly string[]).includes(platform)) {
    return { mode: "sandbox", platform, reason: `Unbekannte Plattform "${platform}" — Sandbox statt Blindflug.` };
  }
  if (!cred?.token) {
    return {
      mode: "sandbox",
      platform,
      reason: `Kein ${platform.toUpperCase()}-Token in der Umgebung (Env ${platform.toUpperCase()}_PUBLISH_TOKEN) — Sandbox statt Vortaeuschung.`,
    };
  }
  if (platform === "linkedin" && !cred.endpointUserId) {
    return {
      mode: "sandbox",
      platform,
      reason: "LinkedIn braucht neben dem Token die Autorisierungs-Person (Env LINKEDIN_PUBLISH_USER_URN) — Sandbox.",
    };
  }
  return { mode: "live", platform, reason: `Credentials vollstaendig — Live-Publishing auf ${platform}.` };
}

/** Autopilot an/aus (Env-Deckel, Default: an). */
export function isAutopilotEnabled(envFlag: string | undefined): boolean {
  return String(envFlag ?? "").toLowerCase() !== "off";
}
