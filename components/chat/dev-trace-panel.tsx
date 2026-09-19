import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";

import type { DevTraceEntry } from "@/lib/development-chat-history-logic";
import { glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";

/**
 * Sprint 127 — Superagent-Entwicklungsfenster.
 *
 * Zeigt die Werkzeugaufrufe hinter einer autonomen Agenten-Antwort
 * (Datei-Edits, Diagnosen, Business-Snapshots) — standardmaessig
 * eingeklappt, damit der Chat uebersichtlich bleibt, per Tap aufklappbar.
 * Macht den autonomen Werkzeug-Einsatz nachvollziehbar (Antwort auf: "kein
 * Entwicklungsfenster sichtbar").
 */
export function DevTracePanel({ trace }: { trace: DevTraceEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => setExpanded((value) => !value)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Entwicklungsfenster einklappen" : "Entwicklungsfenster aufklappen"}
      >
        <Ionicons name="terminal-outline" size={13} color={glassPalette.cyan} />
        <Text style={styles.headerText}>ENTWICKLUNGSFENSTER</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{trace.length}</Text>
        </View>
        <View style={styles.spacer} />
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={glassDepth.layer} />
      </TouchableOpacity>
      {expanded ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.body}>
          {trace.map((entry, index) => (
            <View key={`${entry.tool}-${index}`} style={styles.entry}>
              <Text style={styles.toolName}>▸ {entry.tool}</Text>
              {entry.args && entry.args !== "{}" ? <Text style={styles.args}>{entry.args}</Text> : null}
              <Text style={styles.result}>{entry.resultSummary}</Text>
            </View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: -6,
    marginBottom: 12,
    marginLeft: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: glassSurface.border,
    backgroundColor: glassDepth.abyss,
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  headerText: { color: glassPalette.cyan, fontFamily: "monospace", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  countBadge: { backgroundColor: glassSurface.textSecondary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  countText: { color: glassPalette.cyan, fontSize: 9, fontWeight: "900" },
  spacer: { flex: 1 },
  body: { borderTopWidth: 1, borderTopColor: glassSurface.border, paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  entry: { gap: 2 },
  toolName: { color: glassSurface.textSecondary, fontFamily: "monospace", fontSize: 11, fontWeight: "800" },
  args: { color: glassSurface.textMuted, fontFamily: "monospace", fontSize: 10, lineHeight: 15 },
  result: { color: glassSurface.textSecondary, fontFamily: "monospace", fontSize: 10.5, lineHeight: 16 },
});
