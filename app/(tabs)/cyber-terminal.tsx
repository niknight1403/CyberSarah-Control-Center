import React, { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { cyber, cyberTypography } from "@/lib/cyber-theme";
import { trpc } from "@/lib/trpc";

/**
 * Sprint 126 — Cyber-Terminal: Echtzeit-Log-Viewer mit farblich
 * hervorgehobenen Log-Leveln (Info=Cyan, Warn=Amber, Error=Pink,
 * Success=Gruen) und Emergency-Stop.
 *
 * Performance: Bewusst effizientes Polling (3 s, nur im Vordergrund)
 * statt WebSocket-Dauerverbindung — schont den Akku und funktioniert
 * auf allen Plattformen ohne native SSE-Abhaengigkeit. Der Emergency
 * Stop pausiert alle Live-Aktivitaeten dieser Ansicht sofort (Polling,
 * Agenten-Monitoring) und haelt sie so lange blockiert, bis aktiv
 * fortgesetzt wird.
 */

type LogLevelKey = "info" | "warn" | "error" | "success";

const LEVEL_COLORS: Record<LogLevelKey, string> = {
  info: cyber.cyan,
  warn: cyber.amber,
  error: cyber.pink,
  success: cyber.green,
};

interface LogEntry {
  id: string;
  level: LogLevelKey;
  source: string;
  message: string;
  atMs: number;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("de-DE", { hour12: false });
}

export default function CyberTerminalScreen() {
  const [stopped, setStopped] = useState(false);

  const logsQuery = trpc.appStatus.recentLogs.useQuery(
    { limit: 120 },
    {
      refetchInterval: 3_000,
      refetchIntervalInBackground: false,
      enabled: !stopped,
    },
  );

  const entries: LogEntry[] = (logsQuery.data?.entries ?? []) as unknown as LogEntry[];

  const stopScale = useSharedValue(1);
  const stopAnimated = useAnimatedStyle(() => ({ transform: [{ scale: stopScale.value }] }));

  const handleStopIn = useCallback(() => {
    stopScale.value = withSpring(0.94, { damping: 10, stiffness: 320 });
  }, [stopScale]);

  const handleStopOut = useCallback(() => {
    stopScale.value = withSpring(1, { damping: 14 });
  }, [stopScale]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerKicker}>ORCHESTRATOR</Text>
            <Text style={styles.headerTitle}>LIVE TERMINAL</Text>
          </View>
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: stopped ? cyber.pink : logsQuery.isFetching ? cyber.cyan : cyber.green },
              ]}
            />
            <Text style={[styles.statusText, { color: stopped ? cyber.pink : cyber.textMuted }]}>
              {stopped ? "ANGEHALTEN" : "STREAMING"}
            </Text>
          </View>
        </View>

        <ScrollView style={styles.terminal} contentContainerStyle={styles.terminalContent} showsVerticalScrollIndicator={false}>
          {stopped ? (
            <Text style={[styles.systemLine, { color: cyber.pink }]}>
              ⛔ EMERGENCY STOP AKTIV — Live-Aktivitaeten pausiert. Zum Fortsetzen "RESUME" druecken.
            </Text>
          ) : entries.length === 0 ? (
            <Text style={styles.systemLine}>Warte auf Agenten-Aktivitaet…</Text>
          ) : (
            entries.map((entry, index) => (
              <Animated.View key={entry.id ?? `${entry.atMs}-${index}`} entering={FadeInDown.duration(180)}>
                <Text style={styles.logLine}>
                  <Text style={styles.timeText}>[{formatTime(entry.atMs)}]</Text>
                  {"  "}
                  <Text style={{ color: LEVEL_COLORS[entry.level] ?? cyber.cyan }}>
                    {entry.level.toUpperCase().padEnd(7, " ")}
                  </Text>
                  {"  "}
                  <Text style={styles.sourceText}>{entry.source}</Text>
                  {"  "}
                  <Text style={styles.messageText}>{entry.message.trim()}</Text>
                </Text>
              </Animated.View>
            ))
          )}
        </ScrollView>

        <View style={styles.footer}>
          {stopped ? (
            <Pressable
              style={({ pressed }) => [styles.resumeButton, pressed && styles.buttonPressed]}
              onPress={() => setStopped(false)}
              accessibilityRole="button"
            >
              <Text style={styles.resumeText}>▶ RESUME</Text>
            </Pressable>
          ) : (
            <Animated.View style={stopAnimated}>
              <Pressable
                onPressIn={handleStopIn}
                onPressOut={handleStopOut}
                onPress={() => setStopped(true)}
                style={({ pressed }) => [styles.stopButton, pressed && styles.buttonPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.stopText}>■ EMERGENCY STOP</Text>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: cyber.bg },
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: cyber.border,
  },
  headerKicker: { ...cyberTypography.caption, color: cyber.pink },
  headerTitle: { ...cyberTypography.headline, color: cyber.text, letterSpacing: 2 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: cyber.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5 },
  statusText: { ...cyberTypography.mono, fontSize: 10, letterSpacing: 1 },
  terminal: { flex: 1, backgroundColor: "#05070D" },
  terminalContent: { padding: 14, gap: 4 },
  systemLine: { ...cyberTypography.mono, color: cyber.textDim },
  logLine: { ...cyberTypography.mono, lineHeight: 18, flexWrap: "wrap" },
  timeText: { color: cyber.textDim },
  sourceText: { color: cyber.textMuted },
  messageText: { color: cyber.text },
  footer: { padding: 14, paddingBottom: 18, borderTopWidth: 1, borderTopColor: cyber.border, backgroundColor: cyber.bg },
  stopButton: {
    backgroundColor: cyber.pink,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: cyber.pink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  resumeButton: {
    backgroundColor: cyber.surface,
    borderWidth: 1,
    borderColor: `${cyber.cyan}66`,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.85 },
  stopText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  resumeText: { color: cyber.cyan, fontSize: 15, fontWeight: "800", letterSpacing: 2 },
});
