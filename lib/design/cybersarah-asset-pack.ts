/** CyberSarah Design 4: shared, lightweight UI asset pack.
 * Vector icons come from the already-installed IconSymbol component;
 * no remote images, tracking assets or additional runtime dependencies.
 */
export const CYBERSARAH_ASSET_PACK = {
  name: "CyberSarah Control Center — Design 4",
  version: 1,
  navigation: [
    { route: "dashboard", label: "Start", icon: "house.fill" },
    { route: "revenue-os", label: "Automatik", icon: "chart.bar.fill" },
    { route: "media-studio", label: "Studio", icon: "video.fill" },
    { route: "agent", label: "Agenten", icon: "sparkles" },
    { route: "account", label: "Mehr", icon: "person.crop.circle" },
  ],
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radii: { small: 10, card: 16, sheet: 24 },
  touchTargetMin: 44,
  motion: { quickMs: 120, standardMs: 200, reducedMotionMs: 0 },
} as const;
