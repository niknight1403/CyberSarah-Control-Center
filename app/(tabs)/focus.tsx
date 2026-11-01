import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AiCore } from "@/components/glass/ai-core";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { ScreenContainer } from "@/components/screen-container";
import { useFocusReview } from "@/hooks/use-focus-review";
import {
  evaluateFocusDay,
  FOCUS_DISCLAIMER,
  FOCUS_LIMITS,
  focusStatusLabel,
  isoDayFromTimestamp,
  isoWeekStart,
  buildWeeklyReview,
  selectReflectionPrompts,
  type FocusItem,
} from "@/lib/focus-review-logic";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

const PROMPT_HINTS = [
  "Zeig alle Fokus-Punkte",
  "Plane Fokus: LinkedIn-Post finalisieren; Notiz: Kernaussage zuerst",
  "Status heute",
  'Erledige "Post finalisieren"',
  "Wochenrückblick",
];

/**
 * Sprint 240 — Fokus & Rückblick-Screen: ehrlicher Tagesfokus (max. 3 Punkte)
 * und Wochenrückblick ohne Noten. Jede Änderung läuft über die Bestätigungs-
 * Karte; der Screen stellt dar, der Hook entscheidet nichts.
 */
export default function FocusScreen() {
  const drawer = useNavDrawer();
  const { state, runPrompt, approvePending, dismissPending } = useFocusReview();
  const [prompt, setPrompt] = useState("");
  const styles = useMemo(() => createStyles(), []);
  const [today] = useState(() => isoDayFromTimestamp(Date.now()));
  const weekStart = useMemo(() => isoWeekStart(new Date(`${today}T12:00:00`).getTime()), [today]);
  const weekReview = useMemo(() => buildWeeklyReview(state.items, weekStart), [state.items, weekStart]);
  const reflection = useMemo(() => selectReflectionPrompts(weekReview), [weekReview]);

  const handlePrompt = () => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    runPrompt(trimmed);
  };

  const todayItems = state.items.filter((item) => item.day === today);
  const todayVerdict = evaluateFocusDay(state.items, today);

  return (
    <GlassBackdrop accent="amber">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <View style={styles.topBar}>
          <NavDrawerButton {...drawer.hamburgerProps} tint={glassPalette.amber} />
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>CYBERSARAH · FOKUS & RÜCKBLICK</Text>
            <Text style={styles.title}>Fokus</Text>
          </View>
          <StatusChip label="MAX. 3/TAG" accent="amber" />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <GlassCard accent="amber" glow={2} style={styles.hero}>
            <View style={styles.heroHeader}>
              <AiCore state={todayItems.length > 0 ? "thinking" : "idle"} size={38} />
              <View style={styles.headingCopy}>
                <Text style={styles.heroTitle}>{todayVerdict.headline}</Text>
                <Text style={styles.subtitle}>Ehrliche Tagesverpflichtung — klein zählt</Text>
              </View>
            </View>
            <Text style={styles.body}>
              Ein Fokus-Punkt ist eine bewusst kleine Verpflichtung für einen Tag. Maximal {FOCUS_LIMITS.maxPerDay} Punkte pro Tag, weil Kapazität endlich ist — verschobene und
              fallen gelassene Punkte bleiben sichtbar, damit der Rückblick die echte Geschichte erzählt.
            </Text>
          </GlassCard>

          {state.storeNote && <Text style={styles.noteText}>• {state.storeNote}</Text>}
          {state.saveError && <Text style={styles.errorNote}>• Speichern fehlgeschlagen: {state.saveError}</Text>}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Heute · {today}</Text>
            {state.loading ? <ActivityIndicator color={glassPalette.amber} size="small" /> : <StatusChip label={`${todayItems.length} Punkt(e)`} accent="amber" />}
          </View>

          {state.loading ? (
            <GlassCard accent="amber" style={styles.card}><Text style={styles.body}>Lade gespeicherte Fokus-Punkte …</Text></GlassCard>
          ) : todayItems.length === 0 ? (
            <GlassCard accent="amber" style={styles.card}>
              <Text style={styles.cardTitle}>Kein Fokus für heute</Text>
              <Text style={styles.body}>Der Tag ist bewusst leer — kein Punkt ist kein Versäumnis. Wenn das öfter passiert, ist das ein Planungshinweis, kein Vorwurf.</Text>
            </GlassCard>
          ) : (
            todayItems.map((item) => <FocusRow key={item.id} item={item} />)
          )}

          <GlassCard accent="purple" style={styles.card}>
            <Text style={styles.cardTitle}>Fokus-Prompt</Text>
            <TextInput
              accessibilityLabel="Fokus-Prompt"
              placeholder="z. B. Plane Fokus: Post finalisieren — oder: Erledige 'Post finalisieren'"
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
            <GlassCard accent="amber" style={styles.card}>
              <Text style={styles.cardTitle}>{state.result.headline}</Text>
              {state.result.lines.map((line, index) => (
                <Text key={`${index}-${line.slice(0, 12)}`} style={styles.resultLine}>{line}</Text>
              ))}
              <Text style={styles.disclaimer}>{state.result.disclaimer}</Text>
            </GlassCard>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Wochenrückblick</Text>
            <StatusChip label={weekReview.headline} accent="purple" />
          </View>
          <GlassCard accent="purple" style={styles.card}>
            <Text style={styles.body}>{weekReview.summary}</Text>
            {weekReview.observations.map((observation) => (
              <Text key={observation} style={styles.resultLine}>• {observation}</Text>
            ))}
            <Text style={styles.cardTitleSmall}>Reflexionsfragen</Text>
            {reflection.map((entry) => (
              <Text key={entry.id} style={styles.resultLine}>{entry.question}{"\n"}  ({entry.rationale})</Text>
            ))}
          </GlassCard>

          <Text style={styles.disclaimer}>{FOCUS_DISCLAIMER}</Text>
        </ScrollView>
      </ScreenContainer>
      <NavDrawer {...drawer.drawerProps} />
    </GlassBackdrop>
  );
}

function FocusRow({ item }: { item: FocusItem }) {
  const styles = useMemo(() => createStyles(), []);
  const done = item.status === "done";
  const accent = done ? "green" : item.status === "moved" || item.status === "dropped" ? "blue" : "amber";
  return (
    <GlassCard accent={accent} style={styles.focusRow}>
      <View style={styles.focusHeader}>
        <View style={[styles.focusDot, done && styles.focusDotDone]} />
        <View style={styles.headingCopy}>
          <Text style={styles.focusTitle}>{item.title}</Text>
          {item.note.length > 0 && <Text style={styles.focusNote}>{item.note}</Text>}
        </View>
        <StatusChip label={focusStatusLabel(item.status)} accent={accent} />
      </View>
    </GlassCard>
  );
}

function createStyles() {
  return StyleSheet.create({
    topBar: { alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
    headingCopy: { flex: 1 },
    eyebrow: { color: glassPalette.amber, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
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
    cardTitleSmall: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "900", marginTop: 4 },
    noteText: { color: glassSurface.textMuted, fontSize: 10 },
    errorNote: { color: glassPalette.amber, fontSize: 10 },
    focusRow: { gap: 10 },
    focusHeader: { alignItems: "center", flexDirection: "row", gap: 10 },
    focusDot: { backgroundColor: glassPalette.amber, borderRadius: 6, height: 12, width: 12 },
    focusDotDone: { backgroundColor: glassPalette.green },
    focusTitle: { color: glassSurface.textPrimary, fontSize: 15, fontWeight: "800" },
    focusNote: { color: glassSurface.textMuted, fontSize: 10, marginTop: 3 },
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
