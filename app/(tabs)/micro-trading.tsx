import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AiCore } from "@/components/glass/ai-core";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { ScreenContainer } from "@/components/screen-container";
import { useMicroTrading } from "@/hooks/use-micro-trading";
import { formatPercentGerman, formatPriceGerman, TRADING_DISCLAIMER } from "@/lib/micro-trading-logic";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

const PROMPT_HINTS = [
  "Zeig die Watchlist",
  "Analysiere BTC der letzten 30 Tage",
  "Signale für Ethereum",
  "Backtest SOL 90 Tage",
  "Positionsgröße BTC mit Stop bei 4 %",
];

/**
 * Sprint 220 — Micro-Trading-Screen: rein analytisch, live über CoinGecko.
 * Keine Order-Funktion, keine Broker-Anbindung, PAPER ONLY bleibt Pflicht.
 */
export default function MicroTradingScreen() {
  const drawer = useNavDrawer();
  const { state, refreshWatchlist, runPrompt } = useMicroTrading();
  const [prompt, setPrompt] = useState("");
  const styles = useMemo(() => createStyles(), []);

  useEffect(() => {
    void refreshWatchlist();
  }, [refreshWatchlist]);

  const handlePrompt = async () => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    await runPrompt(trimmed);
  };

  return (
    <GlassBackdrop accent="green">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <View style={styles.topBar}>
          <NavDrawerButton {...drawer.hamburgerProps} tint={glassPalette.green} />
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>CYBERSARAH · ANALYTICS</Text>
            <Text style={styles.title}>Micro Trading</Text>
          </View>
          <StatusChip label="PAPER ONLY" accent="amber" />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <GlassCard accent="green" glow={2} style={styles.hero}>
            <View style={styles.heroHeader}>
              <AiCore state="warning" size={38} />
              <View style={styles.headingCopy}>
                <Text style={styles.heroTitle}>Marktbeobachtung ohne Orderrisiko</Text>
                <Text style={styles.subtitle}>Live-Kurse, Signal-Beobachtungen und hypothetische Backtests</Text>
              </View>
            </View>
            <Text style={styles.body}>
              Dieses Modul arbeitet ausschließlich analytisch. Es besitzt keine Broker-Anbindung, keine Wallet-Verbindung und kann keine Orders
              platzieren, verändern oder stornieren. Alle Ergebnisse sind Simulationen auf historischen Daten — keine Anlageberatung.
            </Text>
          </GlassCard>

          <GlassCard accent="green" style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Watchlist (live)</Text>
              <Pressable accessibilityLabel="Watchlist aktualisieren" onPress={() => void refreshWatchlist()} disabled={state.refreshing} style={styles.refreshButton}>
                {state.refreshing ? (
                  <ActivityIndicator color={glassPalette.green} size="small" />
                ) : (
                  <Text style={styles.refreshText}>Aktualisieren</Text>
                )}
              </Pressable>
            </View>
            {state.watchlistNote && <Text style={styles.noteText}>• {state.watchlistNote}</Text>}
            {state.watchlist.map((entry) => (
              <View key={entry.symbolId} style={styles.row}>
                <Text style={styles.symbol}>{entry.label}</Text>
                <Text style={[styles.change, { color: (entry.changePercent ?? 0) >= 0 ? glassPalette.green : glassPalette.amber }]}>
                  {entry.status === "ok" && entry.changePercent !== null ? formatPercentGerman(entry.changePercent) : "–"}
                </Text>
                <Text style={styles.price} numberOfLines={1}>
                  {entry.status === "ok" && entry.lastPrice !== null ? formatPriceGerman(entry.lastPrice) : entry.status === "loading" ? "lädt …" : "n/a"}
                </Text>
                {entry.status === "error" && <Text style={styles.errorNote}>{entry.note}</Text>}
              </View>
            ))}
          </GlassCard>

          <GlassCard accent="purple" style={styles.card}>
            <Text style={styles.cardTitle}>Analyse-Prompt</Text>
            <TextInput
              accessibilityLabel="Trading-Analyse-Prompt"
              placeholder="z. B. Backtest BTC 30 Tage"
              placeholderTextColor={glassSurface.textMuted}
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
            <Pressable accessibilityLabel="Analyse ausführen" style={styles.analyzeButton} onPress={() => void handlePrompt()} disabled={state.analyzing}>
              {state.analyzing ? <ActivityIndicator color={glassPalette.purple} size="small" /> : <Text style={styles.analyzeButtonText}>Analysieren</Text>}
            </Pressable>
            {state.analyzeError && <Text style={styles.errorNote}>• {state.analyzeError}</Text>}
          </GlassCard>

          {state.result && (
            <GlassCard accent="blue" style={styles.card}>
              <Text style={styles.cardTitle}>{state.result.headline}</Text>
              {state.result.lines.map((line, index) => (
                <Text key={`${index}-${line.slice(0, 12)}`} style={styles.resultLine}>
                  {line}
                </Text>
              ))}
              <Text style={styles.disclaimer}>{state.result.disclaimer}</Text>
            </GlassCard>
          )}

          <Text style={styles.disclaimer}>{TRADING_DISCLAIMER}</Text>
        </ScrollView>
      </ScreenContainer>
      <NavDrawer {...drawer.drawerProps} />
    </GlassBackdrop>
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
    cardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    cardTitle: { color: glassSurface.textPrimary, fontSize: 17, fontWeight: "900" },
    refreshButton: { borderRadius: 10, borderWidth: 1, borderColor: `${glassPalette.green}66`, paddingHorizontal: 10, paddingVertical: 6 },
    refreshText: { color: glassPalette.green, fontSize: 11, fontWeight: "800" },
    row: { alignItems: "center", borderBottomColor: glassSurface.border, borderBottomWidth: 1, flexDirection: "row", gap: 8, paddingVertical: 12 },
    symbol: { color: glassSurface.textPrimary, flex: 1, fontSize: 14, fontWeight: "800" },
    change: { fontSize: 13, fontWeight: "800", width: 70 },
    price: { color: glassSurface.textPrimary, fontSize: 12, fontWeight: "700", textAlign: "right", width: 110 },
    noteText: { color: glassSurface.textMuted, fontSize: 10, marginBottom: 3 },
    errorNote: { color: glassPalette.amber, flex: 1, fontSize: 10 },
    input: { backgroundColor: glassSurface.border + "55", borderColor: glassSurface.border, borderRadius: 12, borderWidth: 1, color: glassSurface.textPrimary, minHeight: 48, padding: 12, fontSize: 13 },
    hints: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
    hint: { backgroundColor: glassSurface.border + "55", borderColor: glassSurface.border, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
    hintText: { color: glassSurface.textSecondary, fontSize: 10 },
    analyzeButton: { alignItems: "center", borderColor: `${glassPalette.purple}88`, borderRadius: 12, borderWidth: 1, marginTop: 10, paddingVertical: 10 },
    analyzeButtonText: { color: glassPalette.purple, fontSize: 12, fontWeight: "800" },
    resultLine: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 17, marginBottom: 3 },
    disclaimer: { color: glassSurface.textMuted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  });
}
