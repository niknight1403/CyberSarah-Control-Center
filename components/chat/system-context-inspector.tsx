import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";
import { describeSystemContext, type SystemContextSnapshot } from "@/lib/prompt-optimization-logic";
import { LOOP_LIMITS } from "@/lib/loop-engineering-logic";

/**
 * Sprint 77 — System-Kontext-Inspektor für das Chat-Entwicklungsfenster:
 * zeigt auf einen Blick, in welchem Modell-/Design-/Loop-Kontext der Agent
 * gerade arbeitet. Props-basiert, damit die Einbindungstelle (Chat-Bildschirm)
 * die Runtime-Signale liefert.
 */
export function SystemContextInspector({
  provider,
  modelClass,
  iterationCount,
  loopState,
}: {
  provider: string;
  modelClass: string;
  iterationCount: number;
  loopState: string;
}) {
  const colors = useColors();
  const { designTheme, colorScheme } = useThemeContext();

  const snapshot: SystemContextSnapshot = {
    provider,
    modelClass,
    designTheme,
    colorScheme,
    iterationCount,
    maxIterations: LOOP_LIMITS.defaultMaxIterations,
    lastLoopState: loopState,
  };

  return (
    <View
      accessibilityLabel="System-Kontext"
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.row}>
        <View style={[styles.chip, { borderColor: colors.tint }]}>
          <Text style={[styles.chipText, { color: colors.tint }]}>{provider}</Text>
        </View>
        <View style={[styles.chip, { borderColor: colors.border }]}>
          <Text style={[styles.chipText, { color: colors.text }]}>{modelClass}</Text>
        </View>
        <View style={[styles.chip, { borderColor: colors.border }]}>
          <Text style={[styles.chipText, { color: colors.muted }]}>Iteration {iterationCount}</Text>
        </View>
      </View>
      <Text style={[styles.detail, { color: colors.muted }]} numberOfLines={2}>
        {describeSystemContext(snapshot)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 11, fontWeight: "700" },
  detail: { fontSize: 10 },
});
