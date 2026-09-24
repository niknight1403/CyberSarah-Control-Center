import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AiCore } from "@/components/glass/ai-core";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";
import { TTS_VOICES, type TtsVoice } from "@/lib/tts-logic";

/**
 * Sprint 277 — Medien-Studio: Video-Generierung aus deutschem Text
 * (Szenen-Manuskript → Edge-TTS → ffmpeg-Assembly mit FLUX-Szenenbildern,
 * Rückfall: Farbverlauf-Bühne). Der Screen stellt dar und fragt — gerendert
 * wird nur mit ausdrücklicher Freigabe, Fehler werden ehrlich angezeigt.
 */
export default function MediaStudioScreen() {
  const drawer = useNavDrawer();
  const styles = useMemo(() => createStyles(), []);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<TtsVoice>("de-DE-KatjaNeural");
  const [approved, setApproved] = useState(false);

  const statusQuery = trpc.mediaPipeline.status.useQuery();
  const generateMutation = trpc.mediaPipeline.generate.useMutation({
    onSuccess: () => undefined,
  });

  const limits = statusQuery.data?.video.limits ?? null;
  const videoAvailable = statusQuery.data?.video.available ?? null;
  const result = generateMutation.data;
  const busy = generateMutation.isPending;

  const canSubmit = !busy && approved && text.trim().length >= 10 && videoAvailable !== false;

  const handleGenerate = () => {
    if (!canSubmit) return;
    generateMutation.mutate({ text: text.trim(), voice, approved: true });
  };

  return (
    <GlassBackdrop accent="purple">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <View style={styles.topBar}>
          <NavDrawerButton {...drawer.hamburgerProps} tint={glassPalette.purple} />
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>CYBERSARAH · MEDIEN-PIPELINE</Text>
            <Text style={styles.title}>Medien-Studio</Text>
          </View>
          <StatusChip
            label={videoAvailable === null ? "PRÜFEN" : videoAvailable ? "BEREIT" : "OHNE FFMPEG"}
            accent={videoAvailable === false ? "amber" : "purple"}
          />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <GlassCard accent="purple" glow={2} style={styles.hero}>
            <View style={styles.heroHeader}>
              <AiCore state={busy ? "thinking" : "idle"} size={38} />
              <View style={styles.headingCopy}>
                <Text style={styles.heroTitle}>Deutscher Text → 1080p-Video mit Stimme und Untertiteln</Text>
                <Text style={styles.subtitle}>Deterministisches Szenen-Manuskript, Edge-TTS, ffmpeg — synthetisch-only</Text>
              </View>
            </View>
            {limits ? (
              <Text style={styles.body}>
                Grenzen (ehrlich, nicht verhandelbar): max. {limits.maxScenes} Szenen, ~{limits.maxTotalSeconds}s Videodauer, {limits.maxDailyVideosPerUser} Videos/Tag.
                {videoAvailable ? "" : " ffmpeg fehlt in dieser Umgebung — Video ist hier ehrlich nicht verfügbar."}
              </Text>
            ) : (
              <Text style={styles.body}>Status der Pipeline wird geprüft…</Text>
            )}
          </GlassCard>

          <GlassCard accent="purple" style={styles.formCard}>
            <Text style={styles.label}>QUELLTEXT (DEUTSCH, {text.trim().length}/1200 ZEICHEN)</Text>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              multiline
              numberOfLines={5}
              placeholder="z.B. Drei Sätze über dein Produkt — jedes wird eine Szene."
              placeholderTextColor={glassSurface.textSecondary}
            />
            <Text style={styles.label}>STIMME (EDGE-TTS, KOSTENLOS)</Text>
            <View style={styles.voiceRow}>
              {TTS_VOICES.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setVoice(option)}
                  style={[styles.voiceChip, voice === option && styles.voiceChipActive]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.voiceChipText, voice === option && styles.voiceChipTextActive]}>{option.replace("de-DE-", "")}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => setApproved((value) => !value)}
              style={[styles.approvalRow, approved && styles.approvalRowActive]}
              accessibilityRole="button"
            >
              <View style={[styles.checkbox, approved && styles.checkboxActive]} />
              <Text style={styles.approvalText}>
                Freigabe: Ich will, dass dieser Text jetzt als Video gerendert wird (verbraucht Tagesquote).
              </Text>
            </Pressable>

            <Pressable
              onPress={handleGenerate}
              disabled={!canSubmit}
              style={[styles.generateButton, !canSubmit && styles.generateButtonDisabled]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={glassSurface.textPrimary} /> : <Text style={styles.generateButtonText}>Video rendern</Text>}
            </Pressable>

            {result && !result.ok && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Ehrlich fehlgeschlagen</Text>
                <Text style={styles.errorBody}>{result.reason}</Text>
                {result.retryHint ? <Text style={styles.errorHint}>Hinweis: {result.retryHint}</Text> : null}
              </View>
            )}

            {result && result.ok && (
              <View style={styles.resultBox}>
                <Text style={styles.resultTitle}>
                  {result.sceneCount} Szenen · ~{result.totalSeconds}s · {result.source === "cache" ? "aus dem Cache" : "frisch gerendert"}
                </Text>
                <Text style={styles.resultBody}>{result.note}</Text>
                {Platform.OS === "web" && (
                  <video src={result.dataUrl} controls style={{ width: "100%", borderRadius: 12, marginTop: 12, maxHeight: 420 }} />
                )}
                {Platform.OS !== "web" && (
                  <Text style={styles.errorHint}>Native-Apps zeigen das Video hier als Download — Web-Export spielt es direkt ab.</Text>
                )}
              </View>
            )}
          </GlassCard>

          <Text style={styles.disclaimer}>
            Ehrliche Grenzen: Szenenbilder kommen aus FLUX.1-schnell (Free-Tier) — fällt der Provider aus, rendert die
            Pipeline deterministische Farbverlauf-Bühnen und zählt das ehrlich mit. Timing ist eine Schätzung aus Textlänge.
          </Text>
        </ScrollView>
      </ScreenContainer>
    </GlassBackdrop>
  );
}

function createStyles() {
  return StyleSheet.create({
    topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, gap: 12 },
    headingCopy: { flex: 1 },
    eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: glassPalette.purple },
    title: { fontSize: 22, fontWeight: "800", color: glassSurface.textPrimary },
    hero: { marginBottom: 14 },
    heroHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
    heroTitle: { fontSize: 15, fontWeight: "800", color: glassSurface.textPrimary },
    subtitle: { fontSize: 12, color: glassSurface.textSecondary, marginTop: 2 },
    body: { fontSize: 12, color: glassSurface.textSecondary, lineHeight: 17 },
    formCard: { marginBottom: 14 },
    label: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: glassSurface.textSecondary, marginTop: 12, marginBottom: 6 },
    input: {
      borderWidth: 1, borderColor: glassSurface.border, borderRadius: 12, padding: 12,
      color: glassSurface.textPrimary, fontSize: 14, minHeight: 110, textAlignVertical: "top", backgroundColor: glassSurface.card,
    },
    voiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    voiceChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: glassSurface.border },
    voiceChipActive: { borderColor: glassPalette.purple, backgroundColor: `${glassPalette.purple}22` },
    voiceChipText: { fontSize: 12, fontWeight: "700", color: glassSurface.textSecondary },
    voiceChipTextActive: { color: glassPalette.purple },
    approvalRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: glassSurface.border },
    approvalRowActive: { borderColor: glassPalette.purple },
    checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: glassSurface.textSecondary },
    checkboxActive: { backgroundColor: glassPalette.purple, borderColor: glassPalette.purple },
    approvalText: { flex: 1, fontSize: 12, color: glassSurface.textPrimary },
    generateButton: { marginTop: 14, paddingVertical: 14, borderRadius: 14, backgroundColor: glassPalette.purple, alignItems: "center" },
    generateButtonDisabled: { opacity: 0.45 },
    generateButtonText: { color: glassSurface.textPrimary, fontWeight: "800", fontSize: 14 },
    errorBox: { marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#b91c1c55", backgroundColor: "#b91c1c18" },
    errorTitle: { fontSize: 12, fontWeight: "800", color: "#b91c1c", marginBottom: 4 },
    errorBody: { fontSize: 12, color: glassSurface.textPrimary, lineHeight: 17 },
    errorHint: { fontSize: 11, color: glassSurface.textSecondary, marginTop: 6 },
    resultBox: { marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: `${glassPalette.purple}55` },
    resultTitle: { fontSize: 13, fontWeight: "800", color: glassSurface.textPrimary, marginBottom: 6 },
    resultBody: { fontSize: 12, color: glassSurface.textSecondary, lineHeight: 17 },
    disclaimer: { fontSize: 11, color: glassSurface.textSecondary, lineHeight: 16, paddingHorizontal: 8, paddingBottom: 24 },
    content: { padding: 20, paddingTop: 8 },
  });
}
