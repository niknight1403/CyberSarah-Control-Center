/**
 * Sprint 201 — Speicher-Manager-Screen: per Prompt den App-eigenen
 * Speicher analysieren, sortieren, aufräumen (mit Bestätigung) und
 * Optimierungs-Vorschläge erhalten.
 *
 * Architektur: reine Logik in lib/storage-manager-logic.ts (getestet),
 * I/O in lib/storage-manager-device.ts, Orchestrierung in
 * hooks/use-storage-manager.ts. Alle Zustände sind ehrlich: nichts
 * wird als "aufgeräumt" angezeigt, was nicht gelöscht wurde.
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { DrawerBodyText, DrawerCard, DrawerCardTitle, DrawerScreen } from "@/components/responsive/drawer-screen";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStorageManager } from "@/hooks/use-storage-manager";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
import { formatBytesGerman } from "@/lib/storage-manager-logic";
import type { StorageSortKey } from "@/lib/storage-manager-logic";

const SORT_OPTIONS: Array<{ key: StorageSortKey; label: string }> = [
  { key: "size-desc", label: "Größe" },
  { key: "date-desc", label: "Neueste" },
  { key: "name-asc", label: "Name" },
  { key: "category", label: "Kategorie" },
];

const PROMPT_HINTS = [
  "Räume den Cache auf",
  "Zeig mir die größten Dateien und Vorschläge zur Optimierung",
  "Sortiere den Speicher nach Kategorie",
  "Lösche Logs älter als 7 Tage",
];

export default function StorageManagerScreen() {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  const { state, scanNow, runPrompt, sortEntries, applyPlan, sortedEntries, totalBytes } = useStorageManager();
  const [prompt, setPrompt] = useState("");

  const handlePrompt = async () => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    await runPrompt(trimmed);
  };

  const handleCleanupConfirm = () => {
    const plan = state.plan;
    if (!plan) return;
    const safePaths = plan.items.filter((item) => !item.requiresConfirmation).map((item) => item.path);
    if (safePaths.length === 0) {
      Alert.alert("Nichts gefahrlos löschbar", "Im Plan liegen nur Einträge mit Bestätigungspflicht — bitte gezielt auswählen.", [
        { text: "OK", style: "default" },
      ]);
      return;
    }
    Alert.alert(
      `${safePaths.length} Einträge löschen?`,
      `Das gibt ${formatBytesGerman(plan.automaticBytes)} frei. Bestätigungspflichtige Einträge (${formatBytesGerman(plan.confirmationBytes)}) bleiben unberührt.`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Jetzt aufräumen",
          style: "destructive",
          onPress: () => void applyPlan(safePaths, []),
        },
      ],
    );
  };

  return (
    <DrawerScreen kicker="SPRINT 201 — TEST" title="Speicher-Manager" accent="purple">
      <DrawerCard accent={`${glass.glassPalette.purple}66`}>
        <DrawerCardTitle>Was macht der Speicher-Manager?</DrawerCardTitle>
        <DrawerBodyText>
          Per Prompt den App-eigenen Speicher analysieren, sortieren und aufräumen: Datei-Verzeichnisse und WebStorage-Einträge der App werden
          gescannt, Kategorien (Cache, Logs, Backups, Dokumente, Medien) erkannt und Optimierungs-Vorschläge erzeugt. Löschen passiert nie ohne
          deine Bestätigung — Cache und veraltete Logs gelten als gefahrlos, alles andere bleibt geschützt.
        </DrawerBodyText>
      </DrawerCard>

      <DrawerCard>
        <DrawerCardTitle>Prompt</DrawerCardTitle>
        <TextInput
          accessibilityLabel="Speicher-Prompt"
          placeholder="z. B. Räume den Cache auf und zeig Vorschläge"
          placeholderTextColor={glass.glassSurface.textMuted}
          style={styles.input}
          value={prompt}
          onChangeText={setPrompt}
          onSubmitEditing={() => void handlePrompt()}
          multiline
        />
        <View style={styles.hints}>
          {PROMPT_HINTS.map((hint) => (
            <Pressable key={hint} style={styles.hint} onPress={() => setPrompt(hint)}>
              <Text style={styles.hintText}>{hint}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actionRow}>
          <Pressable
            accessibilityLabel="Prompt ausführen"
            style={[styles.button, styles.primaryButton]}
            onPress={() => void handlePrompt()}
            disabled={state.scanning || state.applying}
          >
            <IconSymbol name="wand.and.stars" size={16} color={glass.glassSurface.textPrimary} />
            <Text style={[styles.buttonText, { color: glass.glassSurface.textPrimary }]}>Ausführen</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Speicher scannen"
            style={styles.button}
            onPress={() => void scanNow()}
            disabled={state.scanning || state.applying}
          >
            <IconSymbol name="arrow.clockwise" size={16} color={glass.glassPalette.purple} />
            <Text style={[styles.buttonText, { color: glass.glassPalette.purple }]}>Scannen</Text>
          </Pressable>
        </View>
      </DrawerCard>

      {(state.scanning || state.applying) && (
        <DrawerCard>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={glass.glassPalette.purple} />
            <Text style={styles.bodyText}>{state.applying ? "Räume auf …" : "Scanne App-Speicher …"}</Text>
          </View>
        </DrawerCard>
      )}

      {state.applyMessage && (
        <DrawerCard accent={`${glass.glassPalette.green}55`}>
          <DrawerCardTitle>Aufräumen abgeschlossen</DrawerCardTitle>
          <DrawerBodyText>{state.applyMessage}</DrawerBodyText>
        </DrawerCard>
      )}

      {state.scan && (
        <DrawerCard>
          <DrawerCardTitle>Speicherbelegung — {formatBytesGerman(totalBytes)} total</DrawerCardTitle>
          {state.scan.notes.length > 0 && (
            <View style={styles.notes}>
              {state.scan.notes.slice(0, 4).map((note) => (
                <Text key={note} style={styles.noteText}>
                  • {note}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.actionRow}>
            {SORT_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                style={[styles.sortChip, state.sortKey === option.key && styles.sortChipActive]}
                onPress={() => sortEntries(option.key)}
              >
                <Text style={[styles.sortChipText, state.sortKey === option.key && styles.sortChipTextActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.listScroll}>
            <View>
              {sortedEntries.slice(0, 30).map((entry) => (
                <View key={entry.path} style={styles.entryRow}>
                  <Text style={styles.entryPath} numberOfLines={1}>
                    {entry.path}
                  </Text>
                  <Text style={styles.entrySize}>{formatBytesGerman(entry.sizeBytes)}</Text>
                </View>
              ))}
              {sortedEntries.length > 30 && <Text style={styles.noteText}>… und {sortedEntries.length - 30} weitere.</Text>}
              {sortedEntries.length === 0 && <Text style={styles.noteText}>Keine Einträge gefunden.</Text>}
            </View>
          </ScrollView>
        </DrawerCard>
      )}

      {state.lastResult && (
        <DrawerCard accent={`${glass.glassPalette.cyan}55`}>
          <DrawerCardTitle>{state.lastResult.headline}</DrawerCardTitle>
          <View>
            {state.lastResult.lines.map((line) => (
              <Text key={line} style={styles.resultLine}>
                {line}
              </Text>
            ))}
          </View>
        </DrawerCard>
      )}

      {state.plan && state.plan.items.length > 0 && (
        <DrawerCard accent={`${glass.glassPalette.amber}66`}>
          <DrawerCardTitle>Aufräum-Plan — {formatBytesGerman(state.plan.reclaimableBytes)} gewinnbar</DrawerCardTitle>
          {state.plan.items.slice(0, 12).map((item) => (
            <View key={item.path} style={styles.entryRow}>
              <Text style={styles.entryPath} numberOfLines={1}>
                {item.requiresConfirmation ? "🔒" : "✓"} {item.path} ({item.reason})
              </Text>
              <Text style={styles.entrySize}>{formatBytesGerman(item.sizeBytes)}</Text>
            </View>
          ))}
          {state.plan.items.length > 12 && <Text style={styles.noteText}>… und {state.plan.items.length - 12} weitere.</Text>}
          <Pressable
            accessibilityLabel="Aufräum-Plan bestätigen und ausführen"
            style={[styles.button, styles.primaryButton, styles.confirmButton]}
            onPress={handleCleanupConfirm}
            disabled={state.applying}
          >
            <IconSymbol name="arrow.trash" size={16} color={glass.glassSurface.textPrimary} />
            <Text style={[styles.buttonText, { color: glass.glassSurface.textPrimary }]}>Plan ausführen (nur gefahrlos)</Text>
          </Pressable>
        </DrawerCard>
      )}
    </DrawerScreen>
  );
}

function createStyles(glass: RuntimeGlassTheme) {
  return StyleSheet.create({
    input: {
      backgroundColor: glass.glassDepth.glass,
      borderColor: glass.glassSurface.border,
      borderRadius: 12,
      borderWidth: 1,
      color: glass.glassSurface.textPrimary,
      minHeight: 48,
      padding: 12,
      fontSize: 13,
    },
    hints: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
    hint: { backgroundColor: glass.glassDepth.glass, borderColor: glass.glassSurface.border, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
    hintText: { color: glass.glassSurface.textSecondary, fontSize: 10 },
    actionRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    button: {
      alignItems: "center",
      borderColor: glass.glassSurface.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 7,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    primaryButton: { backgroundColor: glass.glassDepth.glass, borderColor: `${glass.glassPalette.purple}88` },
    confirmButton: { marginTop: 10, alignSelf: "flex-start" },
    buttonText: { fontSize: 12, fontWeight: "800" },
    loadingRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    bodyText: { color: glass.glassSurface.textSecondary, fontSize: 12 },
    notes: { gap: 3, marginBottom: 8 },
    noteText: { color: glass.glassSurface.textMuted, fontSize: 10, marginBottom: 3 },
    sortChip: { borderColor: glass.glassSurface.border, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
    sortChipActive: { borderColor: `${glass.glassPalette.purple}99`, backgroundColor: `${glass.glassPalette.purple}18` },
    sortChipText: { color: glass.glassSurface.textSecondary, fontSize: 10, fontWeight: "700" },
    sortChipTextActive: { color: glass.glassPalette.purple },
    listScroll: { marginTop: 10 },
    entryRow: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between", paddingVertical: 3 },
    entryPath: { color: glass.glassSurface.textSecondary, flex: 1, fontSize: 11 },
    entrySize: { color: glass.glassSurface.textPrimary, fontSize: 11, fontWeight: "700" },
    resultLine: { color: glass.glassSurface.textSecondary, fontSize: 11, lineHeight: 17, marginBottom: 3 },
  });
}
