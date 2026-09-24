import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AiCore } from "@/components/glass/ai-core";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { ScreenContainer } from "@/components/screen-container";
import { useIdeaInbox } from "@/hooks/use-idea-inbox";
import {
  describeIdeaAge,
  describeInboxAges,
  IDEA_DISCLAIMER,
  IDEA_LIMITS,
  buildTriagePlan,
  ideaStatusLabel,
  type IdeaItem,
} from "@/lib/idea-inbox-logic";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

const PROMPT_HINTS = [
  "Notiere Idee: HARA-Demo als Video-Serie; Notiz: 3 Teile; Quelle: chat",
  "Zeig alle Ideen",
  "Triage-Vorschläge bitte",
  'Pflanze "Video-Serie"',
  'Streiche "Uralt ohne Ziel"',
];

/**
 * Sprint 249 — Ideen-Inbox-Screen: Rohgedanken sammeln, ehrlich vergilben
 * lassen, mit Freigabe triagieren. Jede Änderung läuft über die Bestätigungs-
 * Karte; Pflanz-Vorschläge zeigen den Weg in den Fokus.
 */
export default function IdeasScreen() {
  const drawer = useNavDrawer();
  const { state, runPrompt, approvePending, dismissPending } = useIdeaInbox();
  const [prompt, setPrompt] = useState("");
  const styles = useMemo(() => createStyles(), []);
  const [snapshotAt] = useState(() => Date.now());

  const openItems = useMemo(() => state.items.filter((item) => item.status === "inbox"), [state.items]);
  const ages = useMemo(() => describeInboxAges(state.items, () => snapshotAt), [state.items, snapshotAt]);
  const plan = useMemo(() => buildTriagePlan(state.items, () => snapshotAt), [state.items, snapshotAt]);

  const handlePrompt = () => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    runPrompt(trimmed);
  };

  return (
    <GlassBackdrop accent="green">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <View style={styles.topBar}>
          <NavDrawerButton {...drawer.hamburgerProps} tint={glassPalette.green} />
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>CYBERSARAH · IDEEN-INBOX</Text>
            <Text style={styles.title}>Ideen</Text>
          </View>
          <StatusChip label={`${ages.openTotal}/${IDEA_LIMITS.maxInboxOpen}`} accent="green" />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <GlassCard accent="green" glow={2} style={styles.hero}>
            <View style={styles.heroHeader}>
              <AiCore state={openItems.length > 0 ? "thinking" : "idle"} size={38} />
              <View style={styles.headingCopy}>
                <Text style={styles.heroTitle}>
                  {ages.openTotal === 0 ? "Eingang leer" : `${ages.openTotal} offene Idee(n)`}
                </Text>
                <Text style={styles.subtitle}>Rohgedanken lagern ehrlich — nichts verschwindet von selbst</Text>
              </View>
            </View>
            <Text style={styles.body}>
              Eine Idee ist ein Rohgedanke, keine Verpflichtung. Offene Ideen vergilben sichtbar ({ages.fresh} frisch, {ages.aging} vergilbt,{" "}
              {ages.withering} verwelkend) statt still zu verrotten. Triage und Pflanzen passieren ausschließlich nach deiner Bestätigung.
            </Text>
          </GlassCard>

          {state.storeNote && <Text style={styles.noteText}>• {state.storeNote}</Text>}
          {state.saveError && <Text style={styles.errorNote}>• Speichern fehlgeschlagen: {state.saveError}</Text>}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Eingang</Text>
            {state.loading ? <ActivityIndicator color={glassPalette.green} size="small" /> : <StatusChip label={plan.suggestions.length > 0 ? "Triage reif" : "ruhig"} accent={plan.suggestions.some((s) => s.kind === "drop") ? "amber" : "green"} />}
          </View>

          {state.loading ? (
            <GlassCard accent="green" style={styles.card}><Text style={styles.body}>Lade gespeicherte Ideen …</Text></GlassCard>
          ) : openItems.length === 0 ? (
            <GlassCard accent="green" style={styles.card}>
              <Text style={styles.cardTitle}>Keine offenen Ideen</Text>
              <Text style={styles.body}>Der leere Stapel ist echt, kein Fehler. Ideen dürfen jederzeit in den Eingang — gesammelt wird erst nach deiner Bestätigung.</Text>
            </GlassCard>
          ) : (
            openItems.map((item) => <IdeaRow key={item.id} item={item} snapshotAt={snapshotAt} />)
          )}

          <GlassCard accent="purple" style={styles.card}>
            <Text style={styles.cardTitle}>Ideen-Prompt</Text>
            <TextInput
              accessibilityLabel="Ideen-Prompt"
              placeholder="z. B. Notiere Idee: Podcast mit Kundenstimmen — oder: Triage-Vorschläge"
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
            <GlassCard accent="green" style={styles.card}>
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

          {state.plantProposal && (
            <GlassCard accent="blue" style={styles.card}>
              <Text style={styles.cardTitle}>{state.plantProposal.label}</Text>
              <Text style={styles.body}>{state.plantProposal.detail}</Text>
              {state.plantProposal.verdict.plantable && (
                <Text style={styles.body}>
                  Anlegen im Fokus-Tab mit {"Plane Fokus: "} {state.plantProposal.verdict.draftTitle} und Bestätigung — die Idee wird danach hier als
                  gepflanzt markiert.
                </Text>
              )}
            </GlassCard>
          )}

          {state.result && (
            <GlassCard accent="green" style={styles.card}>
              <Text style={styles.cardTitle}>{state.result.headline}</Text>
              {state.result.lines.map((line, index) => (
                <Text key={`${index}-${line.slice(0, 12)}`} style={styles.resultLine}>{line}</Text>
              ))}
              <Text style={styles.disclaimer}>{state.result.disclaimer}</Text>
            </GlassCard>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Triage-Plan</Text>
            <StatusChip label={`${plan.suggestions.length} Vorschlag/Vorschläge`} accent="purple" />
          </View>
          <GlassCard accent="purple" style={styles.card}>
            <Text style={styles.body}>{plan.summary}</Text>
            {plan.suggestions.slice(0, 6).map((suggestion) => (
              <Text key={suggestion.ideaId} style={styles.resultLine}>
                • {suggestion.title} → {suggestion.kind === "plant" ? "pflanzen" : suggestion.kind === "keep" ? "behalten" : suggestion.kind === "drop" ? "fallen lassen" : "liegen lassen"}: {suggestion.reason}
              </Text>
            ))}
          </GlassCard>

          <Text style={styles.disclaimer}>{IDEA_DISCLAIMER}</Text>
        </ScrollView>
      </ScreenContainer>
      <NavDrawer {...drawer.drawerProps} />
    </GlassBackdrop>
  );
}

function IdeaRow({ item, snapshotAt }: { item: IdeaItem; snapshotAt: number }) {
  const styles = useMemo(() => createStyles(), []);
  const age = useMemo(() => describeIdeaAge(item, () => snapshotAt), [item, snapshotAt]);
  const accent = age.age === "withering" ? "amber" : age.age === "aging" ? "blue" : "green";
  return (
    <GlassCard accent={accent} style={styles.focusRow}>
      <View style={styles.focusHeader}>
        <View style={[styles.focusDot, { backgroundColor: age.age === "withering" ? glassPalette.amber : age.age === "aging" ? glassPalette.blue : glassPalette.green }]} />
        <View style={styles.headingCopy}>
          <Text style={styles.focusTitle}>{item.title}</Text>
          <Text style={styles.focusNote}>{age.label} · {age.daysInInbox} Tage · Quelle: {item.source}</Text>
          <Text style={styles.focusObservation}>{age.observation}</Text>
        </View>
        <StatusChip label={ideaStatusLabel(item.status)} accent={accent} />
      </View>
    </GlassCard>
  );
}

function createStyles() {
  return StyleSheet.create({
    topBar: { alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
    headingCopy: { flex: 1 },
    eyebrow: { color: glassPalette.green, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
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
