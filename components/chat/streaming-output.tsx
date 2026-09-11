import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

/**
 * Fügt gestreamte Ausgabe-Chunks zu sichtbarem Text zusammen (rein, testbar).
 * Letzter Chunk wird unverändert übernommen (Token-Grenzen werden respektiert).
 */
export function accumulateStreamChunks(chunks: readonly string[]): string {
  return chunks.join("");
}

/**
 * Sprint 77 — Streaming-Ausgabe für das Chat-Entwicklungsfenster: zeigt die
 * laufende Modellantwort mit blinkendem Cursor; im Abschlusszustand (active
 * false) ohne Cursor als fertiger Block.
 */
export function StreamingOutput({ chunks, active }: { chunks: readonly string[]; active: boolean }) {
  const colors = useColors();
  const text = accumulateStreamChunks(chunks);
  if (text.length === 0 && !active) return null;

  return (
    <View
      accessibilityLabel={active ? "Modell antwortet gerade" : "Abgeschlossene Ausgabe"}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.text, { color: colors.text }]}>
        {text.length > 0 ? text : active ? "Verbindung wird aufgebaut …" : ""}
        {active ? <Text style={[styles.caret, { color: colors.tint }]}>▍</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: { fontFamily: "monospace", fontSize: 12 },
  caret: { fontWeight: "900" },
});
