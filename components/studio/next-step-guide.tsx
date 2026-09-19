import { useMemo } from "react";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { DevelopmentGuidanceAction, DevelopmentGuidanceStep } from "@/lib/development-guidance-logic";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { lighten } from "@/lib/theme-color-utils";
import { useColors } from "@/hooks/use-colors";
import { glassDepth, glassSurface } from "@/lib/design/future-glass";

export function NextStepGuide({ guidance, completion, actionMessage, onAction }: { guidance: { primary: DevelopmentGuidanceStep; secondary: DevelopmentGuidanceStep[] }; completion?: string; actionMessage?: string; onAction: (action: DevelopmentGuidanceAction) => void }) {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
  const firstSuggestion = guidance.secondary[0];
  const secondSuggestion = guidance.secondary[1];
  return <View style={styles.section}><Text style={styles.kicker}>ENTWICKLUNGSFÜHRUNG</Text><Text style={styles.heading}>Als nächste sinnvolle Schritte bieten sich diese Aktionen an.</Text><GuideCard step={guidance.primary} prominent onPress={onAction} />{completion ? <View style={styles.completion}><IconSymbol name="checkmark.circle.fill" size={18} color={colors.success} /><Text style={styles.completionText}>Aufgabe abgeschlossen · {completion}</Text></View> : null}{actionMessage ? <Text style={styles.actionMessage}>{actionMessage}</Text> : null}<View style={styles.suggestions}>{firstSuggestion ? <GuideCard step={firstSuggestion} compact onPress={onAction} /> : null}{secondSuggestion ? <GuideCard step={secondSuggestion} compact onPress={onAction} /> : null}</View></View>;
}

function GuideCard({ step, prominent = false, compact = false, onPress }: { step: DevelopmentGuidanceStep; prominent?: boolean; compact?: boolean; onPress: (action: DevelopmentGuidanceAction) => void }) {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
  const warning = step.tone === "warning";
  return <View style={[styles.card, prominent && styles.cardProminent, warning && styles.cardWarning, compact && styles.cardCompact]}><View style={styles.cardHeader}><View style={[styles.iconTile, warning && styles.iconTileWarning]}><IconSymbol name={warning ? "exclamationmark.triangle.fill" : step.tone === "ready" ? "checkmark.circle.fill" : "bolt.fill"} size={17} color={warning ? colors.warning : colors.tint} /></View><Text numberOfLines={1} style={styles.eyebrow}>{step.eyebrow}</Text></View><Text style={[styles.title, compact && styles.titleCompact]}>{step.title}</Text><Text numberOfLines={compact ? 3 : undefined} style={styles.description}>{step.description}</Text><TouchableOpacity accessibilityRole="button" activeOpacity={0.76} onPress={() => onPress(step.action)} style={[styles.action, warning && styles.actionWarning]}><Text style={[styles.actionText, warning && styles.actionTextWarning]}>{step.actionLabel}</Text><IconSymbol name="arrow.right" size={15} color={warning ? glassDepth.void : glassDepth.void} /></TouchableOpacity></View>;
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
  section: { marginBottom: 25 }, kicker: { color: glassSurface.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 6 }, heading: { color: glassSurface.textSecondary, fontSize: 20, fontWeight: "800", letterSpacing: -0.35, lineHeight: 28, marginBottom: 13 }, card: { backgroundColor: glassDepth.void, borderColor: glassSurface.borderStrong, borderRadius: 18, borderWidth: 1, flex: 1, padding: 13 }, cardProminent: { backgroundColor: glassDepth.void, borderColor: glassSurface.borderStrong, padding: 15 }, cardWarning: { backgroundColor: glassDepth.void, borderColor: glassSurface.borderStrong }, cardCompact: { minHeight: 214, minWidth: 245 }, cardHeader: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 11 }, iconTile: { alignItems: "center", backgroundColor: glassDepth.layer, borderRadius: 9, height: 30, justifyContent: "center", width: 30 }, iconTileWarning: { backgroundColor: glassDepth.layer }, eyebrow: { color: glassSurface.textMuted, flex: 1, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, title: { color: glassSurface.textSecondary, fontSize: 16, fontWeight: "900", lineHeight: 21, marginBottom: 6 }, titleCompact: { fontSize: 14, lineHeight: 19 }, description: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 18 }, action: { alignItems: "center", backgroundColor: colors.tint, borderRadius: 12, flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 14, minHeight: 44, paddingHorizontal: 12 }, actionWarning: { backgroundColor: colors.warning }, actionText: { color: glassDepth.void, fontSize: 12, fontWeight: "900" }, actionTextWarning: { color: glassDepth.void }, completion: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 13 }, completionText: { color: lighten(colors.success, 0.1), fontSize: 12, fontWeight: "800" }, actionMessage: { color: lighten(colors.success, 0.2), fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: 10 }, suggestions: { flexDirection: "row", gap: 10, marginTop: 13, overflow: "hidden" },
  });
}
