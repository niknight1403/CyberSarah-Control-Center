/** The publishing pipeline and approval reconciler must accept the same targets. */
export const PUBLISHING_PLATFORMS = [
  "instagram", "tiktok", "linkedin", "x", "threads", "bluesky",
] as const;
export const SUPPORTED_PUBLISHING_PLATFORMS: ReadonlySet<string> = new Set(PUBLISHING_PLATFORMS);
