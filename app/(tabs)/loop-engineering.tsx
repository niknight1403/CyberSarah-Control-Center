import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AiCore } from "@/components/glass/ai-core";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { ScreenContainer } from "@/components/screen-container";
import { useLoopEngineering } from "@/hooks/use-loop-engineering";
import { evaluateLoopProgress, loopProgressPercent, loopStatusLabel, LOOP_DISCLAIMER, recommendNextStep, type LoopDraft } from "@/lib/revenue-loop-logic";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

const PROMPT_HINTS = [
  "Zeig alle Schleifen",
  "Erstelle eine Schleife. Name: SaaS-Conversion; Fluss: Trial - Abo; Hypothese: Onboarding-Mails erhöhen die Abo-Umwandlung; Experiment: 4 Wochen gesteuerte Onboarding-Serie; Messgröße: Abo-Umwandlungen; Einheit: Abos; Ziel: 25",
  "Status von Content-to-Lead",
  "Starte Content-to-Lead",
  "Messpunkt für \"Content-to-Lead\": Wert 40",
];

/**
 * Sprint 230 — Loop-Engineering-Screen: echte Entwürfe statt statischer
 * Beispiel-Karten. Jede Änderung läuft über die Bestätigungs-Karte; der Screen
 * stellt dar, der Hook entscheidet nichts allein.
 */
export default function LoopEngineeringScreen() {
  const drawer = useNavDrawer();
  const { state, runPrompt, approvePending, dismissPending } = useLoopEngineering();
  const [prompt, setPrompt] = useState("");
  const styles = useMemo(() => createStyles(), []);

  const handlePrompt = () => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    runPrompt(trimmed);
  };

  return (
    <GlassBackdrop accent="blue">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <View style={styles.topBar}>
          <NavDrawerButton {...drawer.hamburgerProps} tint={glassPalette.blue} />
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>CYBERSARAH · REVENUE ENGINEERING</Text>
            <Text style={styles.title}>Loop Engineering</Text>
          </View>
          <StatusChip label="PLANUNG" accent="blue" />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <GlassCard accent="blue" glow={2} style={styles.hero}>
            <View style={styles.heroHeader}>
              <AiCore state="idle" size={38} />
              <View style={styles.headingCopy}>
                <Text style={styles.heroTitle}>Umsatzmöglichkeiten als messbare Schleifen</Text>
                <Text style={styles.subtitle}>Hypothese → Experiment → Messwert → nächster Schritt</Text>
              </View>
            </View>
            <Text style={styles.body}>
              Baue wiederholbare Revenue-Loops statt einzelner Aktionen. Jede Schleife bleibt ein Entwurf, bis du sie ausdrücklich startest — und
              nichts schließt oder löscht sich selbst.
            </Text>
          </GlassCard>

          {state.storeNote && <Text style={styles.noteText}>• {state.storeNote}</Text>}
          {state.saveError && <Text style={styles.errorNote}>• Speichern fehlgeschlagen: {state.saveError}</Text>}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Deine Umsatzschleifen</Text>
            {state.loading ? (
              <ActivityIndicator color={glassPalette.blue} size="small" />
            ) : (
              <StatusChip label={`${state.loops.length} ${state.loops.length === 1 ? "Entwurf" : "Entwürfe"}`} accent="blue" />
            )}
          </View>

          {state.loading ? (
            <GlassCard accent="blue" style={styles.card}><Text style={styles.body}>Lade gespeicherte Schleifen …</Text></GlassCard>
          ) : state.loops.length === 0 ? (
            <GlassCard accent="blue" style={styles.card}>
              <Text style={styles.cardTitle}>Noch keine Schleife</Text>
              <Text style={styles.body}>Der leere Zustand ist echt: Es gibt keine gespeicherten Entwürfe. Erstelle deine erste Schleife über den Prompt unten.</Text>
            </GlassCard>
          ) : (
            state.loops.map((loop) => <LoopCard key={loop.id} loop={loop} />)
          )}

          <GlassCard accent="purple" style={styles.card}>
            <Text style={styles.cardTitle}>Schleifen-Prompt</Text>
            <TextInput
              accessibilityLabel="Loop-Engineering-Prompt"
              placeholder="z. B. Erstelle eine Schleife mit Name, Fluss, Hypothese, Experiment, Messgröße, Einheit und Ziel"
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
            {PROMPT_HINTS.slice(0, 3).map((hint) => (
              <Pressable key={hint} style={styles.hint} onPress={() => setPrompt(hint)}>
                <Text style={styles.hintText} numberOfLines={1}>{hint.slice(0, 60)}{hint.length > 60 ? " …" : ""}</Text>
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
            <GlassCard accent="blue" style={styles.card}>
              <Text style={styles.cardTitle}>{state.result.headline}</Text>
              {state.result.lines.map((line, index) => (
                <Text key={`${index}-${line.slice(0, 12)}`} style={styles.resultLine}>{line}</Text>
              ))}
              <Text style={styles.disclaimer}>{state.result.disclaimer}</Text>
            </GlassCard>
          )}

          <Text style={styles.disclaimer}>{LOOP_DISCLAIMER}</Text>
        </ScrollView>
      </ScreenContainer>
      <NavDrawer {...drawer.drawerProps} />
    </GlassBackdrop>
  );
}

function LoopCard({ loop }: { loop: LoopDraft }) {
  const styles = useMemo(() => createStyles(), []);
  const verdict = useMemo(() => evaluateLoopProgress(loop), [loop]);
  const step = useMemo(() => recommendNextStep(loop), [loop]);
  return (
    <GlassCard accent="blue" style={styles.loopCard}>
      <View style={styles.loopHeader}>
        <View style={styles.loopDot} />
        <View style={styles.headingCopy}>
          <Text style={styles.loopName}>{loop.name}</Text>
          <Text style={styles.loopFlow}>{loop.flow}</Text>
        </View>
        <StatusChip label={loopStatusLabel(loop.status)} accent="blue" />
      </View>
      <Text style={styles.body} numberOfLines={3}>Hypothese: {loop.hypothesis}</Text>
      <Text style={styles.body} numberOfLines={2}>Experiment: {loop.experiment}</Text>
      <View style={styles.steps}>
        <Metric label={loop.metric} value={`${loop.currentValue} / ${loop.targetValue} ${loop.unit}`} />
        <Metric label="Fortschritt" value={`${loopProgressPercent(loop)} %`} />
      </View>
      <Text style={styles.resultLine}>{verdict.reason}</Text>
      <Text style={styles.resultLine}>Nächster Schritt: {step.title}{step.requiresApproval ? " — erfordert deine Freigabe" : ""}.</Text>
    </GlassCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const styles = useMemo(() => createStyles(), []);
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    topBar: { alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
    headingCopy: { flex: 1 },
    eyebrow: { color: glassPalette.blue, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
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
    loopCard: { gap: 12 },
    loopHeader: { alignItems: "center", flexDirection: "row", gap: 10 },
    loopDot: { backgroundColor: glassPalette.blue, borderRadius: 6, height: 12, width: 12 },
    loopName: { color: glassSurface.textPrimary, fontSize: 16, fontWeight: "900" },
    loopFlow: { color: glassPalette.blue, fontSize: 11, fontWeight: "800", marginTop: 3 },
    steps: { flexDirection: "row", gap: 8 },
    metric: { backgroundColor: `${glassSurface.border}55`, borderRadius: 12, flex: 1, padding: 10 },
    metricValue: { color: glassSurface.textPrimary, fontSize: 15, fontWeight: "900" },
    metricLabel: { color: glassSurface.textMuted, fontSize: 10, marginTop: 3 },
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
