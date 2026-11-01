export type PublishPlatform = "instagram" | "tiktok" | "facebook";

export type PublishItem = {
  platform: PublishPlatform;
  format: "reel" | "short" | "post";
  captionMaxChars: number;
  requiresReview: true;
  checklist: string[];
};

export function buildPublishingPlan(platforms: PublishPlatform[]): PublishItem[] {
  return [...new Set(platforms)].map((platform) => ({
    platform,
    format: platform === "facebook" ? "post" : platform === "instagram" ? "reel" : "short",
    captionMaxChars: platform === "tiktok" ? 2200 : platform === "instagram" ? 2200 : 5000,
    requiresReview: true as const,
    checklist: [
      "Health-Claim-Review bestanden",
      "Werbe-/Affiliate-Kennzeichnung geprüft",
      "Quellen und Datum geprüft",
      "Avatar-/Markenkonsistenz geprüft",
      "Manuelle Freigabe vor Veröffentlichung",
    ],
  }));
}
