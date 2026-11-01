/**
 * Deterministic, side-effect-free rules for the publishing review desk.
 * A review is never equivalent to permission to resend a post.
 */
import {isConfirmedPublishingReceipt} from "./publishing-queue-logic";

export const REVIEW_PLATFORMS = ["x","linkedin","threads","bluesky","instagram","tiktok"] as const;
export type ReviewPlatform = (typeof REVIEW_PLATFORMS)[number];

export type ReviewUrgency = "fresh" | "urgent" | "critical" | "unknown";
export function reviewUrgency(updatedAt: Date | string, now: Date = new Date()): ReviewUrgency {
  const time = new Date(updatedAt).getTime();
  if (!Number.isFinite(time)) return "unknown";
  const age = Math.max(0, now.getTime() - time);
  if (age >= 24 * 60 * 60_000) return "critical";
  if (age >= 60 * 60_000) return "urgent";
  return "fresh";
}

export function reviewAgeLabel(updatedAt: Date | string, now: Date = new Date()): string {
  const time = new Date(updatedAt).getTime();
  if (!Number.isFinite(time)) return "Zeitpunkt unbekannt";
  const minutes = Math.max(0,Math.floor((now.getTime()-time)/60_000));
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `${minutes} Min. offen`;
  const hours=Math.floor(minutes/60);
  if (hours < 48) return `${hours} Std. offen`;
  return `${Math.floor(hours/24)} Tage offen`;
}

/**
 * Post receipts may be numeric IDs, LinkedIn URNs or Bluesky AT URIs.
 * Entire HTTP links, whitespace, control characters and placeholders are not
 * acceptable: the operator must extract the canonical provider identifier.
 */
export function validManualReviewReceipt(value: string): boolean {
  const id=value.trim();
  if (id.length < 4 || id.length > 300 || !isConfirmedPublishingReceipt(id)) return false;
  if (!/^[A-Za-z0-9_.:/-]+$/.test(id)) return false;
  if (/^https?:\/\//i.test(id) || /^www\./i.test(id)) return false;
  if (/^(unknown|pending|placeholder|undefined|test-id|none|null|not-found)$/i.test(id)) return false;
  return true;
}

export function reviewPlatformHome(platform: string): string | null {
  const origins: Record<ReviewPlatform,string> = {
    x: "https://x.com/",
    linkedin: "https://www.linkedin.com/feed/",
    threads: "https://www.threads.net/",
    bluesky: "https://bsky.app/",
    instagram: "https://www.instagram.com/",
    tiktok: "https://www.tiktok.com/",
  };
  return REVIEW_PLATFORMS.includes(platform as ReviewPlatform)
    ? origins[platform as ReviewPlatform] : null;
}

export function cleanReviewSearch(raw: string | undefined): string {
  return (raw ?? "").trim().slice(0,80);
}
