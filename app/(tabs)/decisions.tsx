import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AiCore } from "@/components/glass/ai-core";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { ScreenContainer } from "@/components/screen-container";
import { useDecisionLog } from "@/hooks/use-decision-log";
import {
  DECISION_DISCLAIMER,
  DECISION_LIMITS,
  countOpenDecisions,
  decisionStatusLabel,
  describeSupersedeChain,
  findDueForReview,
  isoDayFromTimestamp,
  type DecisionItem,
} from "@/lib/decision-log-logic";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

const PROMPT_HINTS = [
  "Zeig das Journal",
  "Was ist zur Nachprüfung fällig?",
  "Entscheidung: Preis für Pro um 20% erhöht; Erwartung: Umsatz pro Kunde +10% bis Q4; Nachprüfen: 2026-12-31",
  'Nachprüfen für "Preis für Pro"; Ergebnis: Umsatz gestiegen, Erwartung erfüllt',
  'Ersetze "Preis für Pro"; Entscheidung: Preis um 15% erhöht; Erwartung: Umsatz +8%, Churn unter 5%',
];

/**
 * Sprint 259 — Entscheidungs-Journal-Screen: Entscheidungen mit prüfbarer
 * Erwartung festhalten, ehrlich nachprüfen, sichtbar ersetzen. Jede Änderung
 * läuft über die Bestätigungs-Karte; die Historie bleibt unangetastet.
 */
export default function DecisionsScreen() {
  const drawer = useNavDrawer();
  const { state, runPrompt, approvePending, dismissPending } = useDecisionLog();
  const [prompt, setPrompt] = useState("");
  const styles = useMemo(() => createStyles(), []);
  const [snapshotAt] = useState(() => Date.now());

  const today = useMemo(() => isoDayFromTimestamp(snapshotAt), [snapshotAt]);
  const openItems = useMemo(() => state.items.filter((item) => item.status === "open"), [state.items]);
  const dueItems = useMemo(() => findDueForReview(state.items, () => snapshotAt), [state.items, snapshotAt]);

  const handlePrompt = () => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    runPrompt(trimmed);
  };

  return (
    <GlassBackdrop accent="purple">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <View style={styles.topBar}>
          <NavDrawerButton {...drawer.hamburgerProps} tint={glassPalette.purple} />
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>CYBERSARAH · ENTSCHEIDUNGS-JOURNAL</Text>
            <Text style={styles.title}>Entscheidungen</Text>
          </View>
          <StatusChip label={`${countOpenDecisions(state.items)}/${DECISION_LIMITS.maxOpen}`} accent="purple" />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <GlassCard accent="purple" glow={2} style={styles.hero}>
            <View style={styles.heroHeader}>
              <AiCore state={dueItems.length > 0 ? "thinking" : "idle"} size={38} />
              <View style={styles.headingCopy}>
                <Text style={styles.heroTitle}>{dueItems.length > 0 ? `${dueItems.length} Nachprüfung(en) fällig` : "Journal aktuell"}</Text>
                <Text style={styles.subtitle}>Wetten auf die Zukunft — ehrlich nachgeprüft, nie rückwirkend gebogen</Text>
              </View>
            </View>
            <Text style={styles.body}>
              Jede Entscheidung wird mit einer prüfbaren Erwartung und einem Nachprüf-Tag festgehalten. Beim Nachprüfen zählt der Vergleich, nicht die
              Rechtfertigung: Eine Erwartung, die nicht eintrat, ist ein Ergebnis, kein Vorwurf. Ersetzte Entscheidungen bleiben als Verlauf lesbar.
            </Text>
          </GlassCard>

          {state.storeNote && <Text style={styles.noteText}>• {state.storeNote}</Text>}
          {state.saveError && <Text style={styles.errorNote}>• Speichern fehlgeschlagen: {state.saveError}</Text>}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Offene Entscheidungen · {today}</Text>
            {state.loading ? <ActivityIndicator color={glassPalette.purple} size="small" /> : <StatusChip label={dueItems.length > 0 ? "Nachprüfung fällig" : "ruhig"} accent={dueItems.length > 0 ? "amber" : "purple"} />}
          </View>

          {state.loading ? (
            <GlassCard accent="purple" style={styles.card}><Text style={styles.body}>Lade das Journal …</Text></GlassCard>
          ) : openItems.length === 0 ? (
            <GlassCard accent="purple" style={styles.card}>
              <Text style={styles.cardTitle}>Keine offenen Entscheidungen</Text>
              <Text style={styles.body}>Der leere Zustand ist echt: keine laufenden Wetten. Sobald du etwas entscheidest, gehört hierher auch die Erwartung, gegen die es sich prüfen lässt.</Text>
            </GlassCard>
          ) : (
            openItems.map((item) => <DecisionRow key={item.id} item={item} snapshotAt={snapshotAt} />)
          )}

          <GlassCard accent="blue" style={styles.card}>
            <Text style={styles.cardTitle}>Journal-Prompt</Text>
            <TextInput
              accessibilityLabel="Journal-Prompt"
              placeholder="z. B. Entscheidung: <Titel>; Erwartung: <prüfbare Aussage>; Nachprüfen: <ISO-Tag>"
              placeholderTextColor={glassSurface.textMuted}
              style={styles.input}
              value={prompt}
              onChangeText={setPrompt}
              onSubmitEditing={handlePrompt}
              multiline
            />
            <Pressable accessibilityLabel="Prompt auswerten" style={styles.analyzeButton} onPress={handlePrompt}>
              <Text style={styles.analyzeButtonText}>Auswerten</Text>
            </Pressable>
            {PROMPT_HINTS.map((hint) => (
              <Pressable key={hint} style={styles.hint} onPress={() => setPrompt(hint)}>
                <Text style={styles.hintText} numberOfLines={1}>{hint.slice(0, 58)}{hint.length > 58 ? " …" : ""}</Text>
              </Pressable>
            ))}
          </GlassCard>

          {state.pending && (
            <GlassCard accent="amber" style={styles.card}>
              <Text style={styles.cardTitle}>Freigabe erforderlich</Text>
              <Text style={styles.body}>{state.pending.label}: {state.pending.detail}</Text>
              <View style={styles.approvalRow}>
                <Pressable accessibilityLabel="Änderung bestätigen" style={styles.approveButton} onPress={() => void approvePending()}>
                  <Text style={styles.approveButtonText}>Bestätigen</Text>
                </Pressable>
                <Pressable accessibilityLabel="Änderung ablehnen" style={styles.declineButton} onPress={dismissPending}>
                  <Text style={styles.declineButtonText}>Abbrechen</Text>
                </Pressable>
              </View>
            </GlassCard>
          )}

          {state.result && (
            <GlassCard accent="purple" style={styles.card}>
              <Text style={styles.cardTitle}>{state.result.headline}</Text>
              {state.result.lines.map((line, index) => (
                <Text key={`${index}-${line.slice(0, 12)}`} style={styles.resultLine}>{line}</Text>
              ))}
              <Text style={styles.disclaimer}>{state.result.disclaimer}</Text>
            </GlassCard>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Verlauf</Text>
            <StatusChip label={`${state.items.length} Eintrag/Einträge`} accent="blue" />
          </View>
          <GlassCard accent="blue" style={styles.card}>
            {state.items.filter((item) => item.status !== "open").length === 0 ? (
              <Text style={styles.body}>Noch keine nachgeprüften oder ersetzten Entscheidungen — Verlauf entsteht durch ehrliches Prüfen, nicht durch Sammeln.</Text>
            ) : (
              state.items.filter((item) => item.status !== "open").slice(0, 8).map((item) => (
                <View key={item.id} style={styles.historyRow}>
                  <Text style={styles.resultLine}>
                    {decisionStatusLabel(item.status)}: {item.title} ({isoDayFromTimestamp(item.decidedAt)})
                  </Text>
                  {item.reviewNote && <Text style={styles.historyNote}>— {item.reviewNote}</Text>}
                  {item.status === "superseded" && describeSupersedeChain(state.items, item.id).length > 1 && (
                    <Text style={styles.historyNote}>Kette: {describeSupersedeChain(state.items, item.id).join(" → ")}</Text>
                  )}
                </View>
              ))
            )}
          </GlassCard>

          <Text style={styles.disclaimer}>{DECISION_DISCLAIMER}</Text>
        </ScrollView>
      </ScreenContainer>
      <NavDrawer {...drawer.drawerProps} />
    </GlassBackdrop>
  );
}

function DecisionRow({ item, snapshotAt }: { item: DecisionItem; snapshotAt: number }) {
  const styles = useMemo(() => createStyles(), []);
  const due = item.reviewBy <= isoDayFromTimestamp(snapshotAt);
  const accent = due ? "amber" : "purple";
  return (
    <GlassCard accent={accent} style={styles.focusRow}>
      <View style={styles.focusHeader}>
        <View style={[styles.focusDot, { backgroundColor: due ? glassPalette.amber : glassPalette.purple }]} />
        <View style={styles.headingCopy}>
          <Text style={styles.focusTitle}>{item.title}</Text>
          <Text style={styles.focusNote}>
            {item.status === "open" ? (due ? "Nachprüfung fällig" : `Nachprüfen bis ${item.reviewBy}`) : decisionStatusLabel(item.status)} ·{" "}
            entschieden {isoDayFromTimestamp(item.decidedAt)}
          </Text>
          <Text style={styles.focusObservation}>Erwartung: {item.expectation}</Text>
        </View>
        <StatusChip label={due ? "fällig" : "offen"} accent={accent} />
      </View>
    </GlassCard>
  );
}

function createStyles() {
  return StyleSheet.create({
    topBar: { alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
    headingCopy: { flex: 1 },
    eyebrow: { color: glassPalette.purple, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
    title: { color: glassSurface.textPrimary, fontSize: 23, fontWeight: "900", marginTop: 2 },
    content: { gap: 14, padding: 16, paddingBottom: 40 },
    hero: { gap: 14, paddingVertical: 20 },
    heroHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
    heroTitle: { color: glassSurface.textPrimary, fontSize: 20, fontWeight: "900" },
    subtitle: { color: glassSurface.textSecondary, fontSize: 12, marginTop: 4 },
    body: { color: glassSurface.textSecondary, fontSize: 13, lineHeight: 20 },
    card: { gap: 12 },
    sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
    sectionTitle: { color: glassSurface.textPrimary, fontSize: 18, fontWeight: "900" },
    cardTitle: { color: glassSurface.textPrimary, fontSize: 17, fontWeight: "900" },
    noteText: { color: glassSurface.textMuted, fontSize: 10 },
    errorNote: { color: glassPalette.amber, fontSize: 10 },
    focusRow: { gap: 10 },
    focusHeader: { alignItems: "center", flexDirection: "row", gap: 10 },
    focusDot: { borderRadius: 6, height: 12, width: 12 },
    focusTitle: { color: glassSurface.textPrimary, fontSize: 15, fontWeight: "800" },
    focusNote: { color: glassSurface.textMuted, fontSize: 10, marginTop: 3 },
    focusObservation: { color: glassSurface.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 3 },
    historyRow: { gap: 2, marginBottom: 8 },
    historyNote: { color: glassSurface.textMuted, fontSize: 10, lineHeight: 15 },
    input: { backgroundColor: `${glassSurface.border}55`, borderColor: glassSurface.border, borderRadius: 12, borderWidth: 1, color: glassSurface.textPrimary, minHeight: 48, padding: 12, fontSize: 13 },
    analyzeButton: { alignItems: "center", borderColor: `${glassPalette.purple}88`, borderRadius: 12, borderWidth: 1, marginTop: 10, paddingVertical: 10 },
    analyzeButtonText: { color: glassPalette.purple, fontSize: 12, fontWeight: "800" },
    hint: { backgroundColor: `${glassSurface.border}55`, borderColor: glassSurface.border, borderRadius: 10, borderWidth: 1, marginTop: 8, paddingHorizontal: 8, paddingVertical: 6 },
    hintText: { color: glassSurface.textSecondary, fontSize: 10 },
    approvalRow: { flexDirection: "row", gap: 10, marginTop: 6 },
    approveButton: { alignItems: "center", backgroundColor: `${glassPalette.green}22`, borderColor: `${glassPalette.green}88`, borderRadius: 12, borderWidth: 1, flex: 1, paddingVertical: 10 },
    approveButtonText: { color: glassPalette.green, fontSize: 12, fontWeight: "800" },
    declineButton: { alignItems: "center", borderColor: glassSurface.border, borderRadius: 12, borderWidth: 1, flex: 1, paddingVertical: 10 },
    declineButtonText: { color: glassSurface.textSecondary, fontSize: 12, fontWeight: "800" },
    resultLine: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 17, marginBottom: 3 },
    disclaimer: { color: glassSurface.textMuted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  });
}
