import { useMemo } from "react";
import { useColors } from "@/hooks/use-colors";
import { aiCoreStates as staticAiCoreStates, glassMotion, glassRadii, glassSpacing, glassType, type GlassAccent } from "@/lib/design/future-glass";

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

export function useGlassTheme() {
  const colors = useColors();
  return useMemo(() => {
    const glassPalette: Record<GlassAccent, string> = {
      cyan: colors.tint,
      purple: colors.accent,
      magenta: colors.accent,
      green: colors.success,
      blue: colors.tint,
      amber: colors.warning,
      red: colors.error,
    };
    const glassDepth = {
      void: colors.background,
      abyss: colors.backgroundElevated,
      deep: colors.surfaceStrong,
      layer: colors.surface,
      glass: withAlpha(colors.surface, 0.88),
      glassElevated: withAlpha(colors.surfaceStrong, 0.94),
    } as const;
    const glassSurface = {
      background: colors.background,
      card: glassDepth.glass,
      cardElevated: glassDepth.glassElevated,
      border: withAlpha(colors.border, 0.72),
      borderStrong: colors.border,
      highlightEdge: withAlpha(colors.tint, 0.18),
      textPrimary: colors.text,
      textSecondary: colors.muted,
      textMuted: colors.icon,
    } as const;
    const glassOverlay = {
      whiteSheen: withAlpha(colors.tint, 0.18),
      whiteStrong: colors.text,
      whiteBright: colors.text,
      gridLine: withAlpha(colors.border, 0.16),
      scrim: withAlpha(colors.background, 0.5),
      dark: withAlpha(colors.background, 0.9),
      track: withAlpha(colors.icon, 0.25),
      shadow: colors.shadow,
    } as const;
    const aiCoreStates = Object.fromEntries(Object.entries(staticAiCoreStates).map(([state, visual]) => [state, { ...visual, accent: visual.accent }])) as Record<keyof typeof staticAiCoreStates, (typeof staticAiCoreStates)[keyof typeof staticAiCoreStates] & { accent: string }>;
    const accentAlpha = (accent: GlassAccent, alpha: number) => withAlpha(glassPalette[accent], alpha);
    const glassGlow = (accent: GlassAccent, intensity: 0 | 1 | 2 = 1) => ({ shadowColor: glassPalette[accent], shadowOpacity: [0.18, 0.32, 0.46][intensity], shadowRadius: [6, 14, 22][intensity], shadowOffset: { width: 0, height: 0 }, elevation: intensity * 2 });
    return { glassPalette, glassDepth, glassSurface, glassOverlay, glassType, glassSpacing, glassRadii, glassMotion, aiCoreStates, accentAlpha, glassGlow };
  }, [colors]);
}

export type RuntimeGlassTheme = ReturnType<typeof useGlassTheme>;
