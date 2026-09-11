import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export type TerminalPreviewStatus = "preview" | "confirming" | "running" | "done" | "failed";

const STATUS_LABELS: Record<TerminalPreviewStatus, string> = {
  preview: "Vorschau — Befehl noch nicht ausgeführt",
  confirming: "Warte auf Freigabe",
  running: "Wird ausgeführt …",
  done: "Ausführung abgeschlossen",
  failed: "Ausführung fehlgeschlagen",
};

/**
 * Sprint 77 — Terminal-Befehlsvorschau mit interaktiver Auslöse-Freigabe:
 * Agent-Vorschläge für Shell-Befehge werden erst angezeigt, dann per
 * Auslöser explizit freigegeben (Human-in-the-Loop), danach mit Live-Status
 * und Ausgabe dargestellt.
 */
export function TerminalPreview({
  command,
  cwd,
  status,
  output,
  onExecute,
}: {
  command: string;
  cwd?: string;
  status: TerminalPreviewStatus;
  output?: readonly string[];
  onExecute?: () => void;
}) {
  const colors = useColors();
  const canExecute = status === "preview" || status === "confirming";

  return (
    <View
      accessibilityLabel={`Terminal-Befehl: ${command}`}
      style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}
    >
      <View style={styles.headerRow}>
        <IconSymbol name="terminal.fill" size={14} color={colors.tint} />
        <Text style={[styles.header, { color: colors.muted }]} numberOfLines={1}>
          {cwd ? `${cwd} $` : "$"}
        </Text>
        <Text
          style={[
            styles.status,
            { color: status === "failed" ? colors.error : status === "done" ? colors.success : colors.muted },
          ]}
        >
          {STATUS_LABELS[status]}
        </Text>
      </View>
      <Text selectable style={[styles.command, { color: colors.text }]}>
        {command}
      </Text>
      {output && output.length > 0 ? (
        <View style={[styles.output, { borderColor: colors.border }]}>
          {output.slice(-8).map((line, index) => (
            <Text key={index} style={[styles.outputLine, { color: colors.muted }]}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {canExecute && onExecute ? (
        <TouchableOpacity
          accessibilityLabel="Befehl jetzt ausführen"
          accessibilityRole="button"
          activeOpacity={0.75}
          onPress={onExecute}
          style={[styles.execute, { backgroundColor: colors.tint }]}
        >
          <Text style={[styles.executeText, { color: colors.background }]}>Jetzt ausführen</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, gap: 8, padding: 12 },
  headerRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  header: { flex: 1, fontFamily: "monospace", fontSize: 11 },
  status: { fontSize: 10, fontWeight: "700" },
  command: { fontFamily: "monospace", fontSize: 12, fontWeight: "700" },
  output: { borderRadius: 8, borderTopWidth: 1, paddingTop: 6 },
  outputLine: { fontFamily: "monospace", fontSize: 10 },
  execute: { alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  executeText: { fontSize: 12, fontWeight: "800" },
});
