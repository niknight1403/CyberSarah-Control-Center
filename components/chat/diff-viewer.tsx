import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { getDetailedFileDiffPreview, type FileDiffInput } from "@/lib/file-diff-logic";
import { tokenizeLine, type SyntaxTokenKind } from "@/lib/syntax-highlight-logic";

/**
 * Sprint 77 — Syntax-highlighted Diff-Viewer für das Chat-Entwicklungsfenster:
 * renderiert Datei-Änderungen zeilenweise (hinzugefügt/entfernt/Kontext) mit
 * leichter Syntax-Hervorhebung und Design-Theme-Farben.
 */
export function DiffViewer({ diff, maxChangedLines = 32 }: { diff: FileDiffInput; maxChangedLines?: number }) {
  const colors = useColors();
  const preview = getDetailedFileDiffPreview(diff, maxChangedLines);

  if (!preview) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.path, { color: colors.muted }]}>Ohne inhaltliche Änderung: {diff.path}</Text>
      </View>
    );
  }

  const tokenColor = (kind: SyntaxTokenKind): string => {
    if (kind === "keyword") return colors.tint;
    if (kind === "string") return colors.success;
    if (kind === "number") return colors.warning;
    if (kind === "comment") return colors.muted;
    return colors.text;
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.path, { color: colors.text }]} numberOfLines={1}>
          {preview.path}
        </Text>
        <Text style={[styles.summary, { color: preview.addedLines > 0 || preview.removedLines > 0 ? colors.warning : colors.muted }]}>
          +{preview.addedLines} −{preview.removedLines}
        </Text>
      </View>
      <View style={[styles.lines, { borderColor: colors.border }]}>
        {preview.lines.map((line) => {
          const bg = line.kind === "added" ? `${String(colors.success)}18` : line.kind === "removed" ? `${String(colors.error)}18` : "transparent";
          const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " ";
          const markerColor = line.kind === "added" ? colors.success : line.kind === "removed" ? colors.error : colors.muted;
          return (
            <View key={`${line.kind}-${line.lineNumber}`} style={[styles.line, { backgroundColor: bg }]}>
              <Text style={[styles.marker, { color: markerColor }]}>{marker}</Text>
              <Text style={styles.lineNumber}>{String(line.lineNumber).padStart(3, " ")}</Text>
              <Text style={styles.content}>
                {tokenizeLine(line.content).map((token, tokenIndex) => (
                  <Text key={tokenIndex} style={{ color: tokenColor(token.kind) }}>
                    {token.text}
                  </Text>
                ))}
              </Text>
            </View>
          );
        })}
        {preview.truncated ? (
          <Text style={[styles.truncated, { color: colors.muted }]}>… weitere Änderungen ausgeblendet</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    padding: 10,
  },
  path: { flex: 1, fontSize: 12, fontWeight: "700" },
  summary: { fontSize: 11, fontWeight: "800" },
  lines: { borderTopWidth: 1, paddingVertical: 4 },
  line: { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 1 },
  marker: { fontFamily: "monospace", width: 14 },
  lineNumber: { color: "#8A93A6", fontFamily: "monospace", fontSize: 10, marginRight: 8 },
  content: { color: "#F2F6FC", flex: 1, fontFamily: "monospace", fontSize: 11 },
  truncated: { fontSize: 10, fontStyle: "italic", padding: 6 },
});
