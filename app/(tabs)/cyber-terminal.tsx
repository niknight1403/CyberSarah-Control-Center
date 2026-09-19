import React, { useCallback, useEffect, useState } from "react";
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

import {
  backendReachable,
  listLogs,
  releaseEmergencyStop,
  triggerEmergencyStop,
  type BackendAgentLog,
} from "@/lib/cybersarah-backend-client";

/**
 * Sprint 180 — Cyber-Terminal auf "CyberSarah Future Glass" uebertragen:
 * cyber-theme-Palette durch Glass-Tokens ersetzt, Deep-Void-Hintergrund
 * und transparenter SafeArea-Container ueber GlassBackdrop. Logik
 * (Log-Streaming, Stop/Resume, SSE) unveraendert.
 */
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { glassDepth, glassPalette, glassSurface, glassType } from "@/lib/design/future-glass";
import { trpc } from "@/lib/trpc";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";

// Sprint 172: Stabile Identitaet fuer den leeren Log-Fallback (kein [] im Render).
const EMPTY_LOG_ENTRIES: LogEntry[] = [];

/**
 * Sprint 126 — Cyber-Terminal: Echtzeit-Log-Viewer mit farblich
 * hervorgehobenen Log-Leveln (Info=Cyan, Warn=Amber, Error=Pink,
 * Success=Gruen) und Emergency-Stop.
 *
 * Sprint 131 — Backend-Kopplung: Ist das autonome FastAPI-Backend
 * (cybersarah-backend) erreichbar, werden dessen Agenten-Logs in den
 * Stream gemischt und der Emergency Stop stoppt und
 * startet auch den Remote-Executor. Ist das Backend offline, laeuft das Terminal
 * wie gehabt nur auf den Studio-tRPC-Daten weiter.
 *
 * Performance: Bewusst effizientes Polling (3 s, nur im Vordergrund)
 * statt WebSocket-Dauerverbindung — schont den Akku und funktioniert
 * auf allen Plattformen ohne native SSE-Abhaengigkeit. Der Emergency
 * Stop pausiert alle Live-Aktivitaeten dieser Ansicht sofort (Polling,
 * Agenten-Monitoring, Backend-Sync) und haelt sie so lange blockiert,
 * bis aktiv fortgesetzt wird.
 */

type LogLevelKey = "info" | "warn" | "error" | "success";

const LEVEL_COLORS: Record<LogLevelKey, string> = {
  info: glassPalette.cyan,
  warn: glassPalette.amber,
  error: glassPalette.red,
  success: glassPalette.green,
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

/** Backend-Log-Zeile ins Terminal-Format uebersetzen. */
function backendLogToEntry(log: BackendAgentLog): LogEntry {
  const level: LogLevelKey =
    log.level === "warn" || log.level === "error" || log.level === "success" ? log.level : "info";
  return {
    id: `backend-${log.id}`,
    level,
    source: "autonomer-executor",
    message: log.message,
    atMs: new Date(log.created_at).getTime() || 0,
  };
}

export default function CyberTerminalScreen() {
  // Reanimated + React Compiler (Sprint 172): Shared-Value-Writes (stopScale)
  // sind sanktionierte Reanimated-Mutationen — "use no memo" ist die
  // dokumentierte Interop-Direktive; Verhalten unveraendert.
  "use no memo";
  const [stopped, setStopped] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [backendStopped, setBackendStopped] = useState(false);
  const [backendLogs, setBackendLogs] = useState<LogEntry[]>([]);

  const logsQuery = trpc.appStatus.recentLogs.useQuery(
    { limit: 120 },
    {
      refetchInterval: 3_000,
      refetchIntervalInBackground: false,
      enabled: !stopped,
    },
  );

  // Backend-Erreichbarkeit einmalig pruefen (3 s Timeout, kein Throw).
  useEffect(() => {
    let cancelled = false;
    void backendReachable(2_500).then((online) => {
      if (!cancelled) setBackendOnline(online);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Backend-Logs nur syncen, wenn Backend online und Ansicht nicht gestoppt.
  useEffect(() => {
    if (!backendOnline) return;
    let cancelled = false;
    const sync = (): void => {
      if (cancelled || stopped) return;
      listLogs(120)
        .then((logs) => {
          if (!cancelled) setBackendLogs(logs.map(backendLogToEntry));
        })
        .catch(() => {
          // Offline-Fallback: letzte Daten behalten, kein Crash.
        });
    };
    sync();
    const timer = setInterval(sync, 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [backendOnline, stopped]);

  const studioEntries = (logsQuery.data?.entries ?? EMPTY_LOG_ENTRIES) as unknown as LogEntry[];
  const merged = React.useMemo(() => {
    if (!backendOnline || backendLogs.length === 0) return studioEntries;
    const byId = new Map<string, LogEntry>();
    for (const entry of [...studioEntries, ...backendLogs]) byId.set(entry.id, entry);
    return Array.from(byId.values())
      .sort((a, b) => a.atMs - b.atMs)
      .slice(-120);
  }, [backendOnline, backendLogs, studioEntries]);
  const entries = stopped ? [] : merged;

  const stopScale = useSharedValue(1);
  const stopAnimated = useAnimatedStyle(() => ({ transform: [{ scale: stopScale.value }] }));

  const handleStopIn = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated Shared-Value-Write (sanktionierte API, keine React-State-Mutation).
    stopScale.value = withSpring(0.94, { damping: 10, stiffness: 320 });
  }, [stopScale]);

  const handleStopOut = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated Shared-Value-Write (sanktionierte API, keine React-State-Mutation).
    stopScale.value = withSpring(1, { damping: 14 });
  }, [stopScale]);

  /** Emergency Stop: lokal pausieren + Remote-Executor anhalten. */
  const handleStop = useCallback(() => {
    setStopped(true);
    if (!backendOnline) return;
    triggerEmergencyStop()
      .then((result) => setBackendStopped(result.stopped))
      .catch(() => {
        // Remote-Stop fehlgeschlagen — lokaler Stop bleibt aktiv.
      });
  }, [backendOnline]);

  /** Resume: lokale Ansicht fortsetzen + Remote-Executor reaktivieren. */
  const handleResume = useCallback(() => {
    setStopped(false);
    setBackendStopped(false);
    if (!backendOnline) return;
    releaseEmergencyStop().catch(() => {
      // Remote-Resume fehlgeschlagen — lokale Ansicht laeuft weiter.
    });
  }, [backendOnline]);

  const navDrawer = useNavDrawer();
  return (
    <GlassBackdrop accent="green">
      <SafeAreaView style={styles.safeTransparent} edges={["top"]}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <NavDrawer {...navDrawer.drawerProps} />
          <NavDrawerButton {...navDrawer.hamburgerProps} />
          <View>
            <Text style={styles.headerKicker}>ORCHESTRATOR</Text>
            <Text style={styles.headerTitle}>LIVE TERMINAL</Text>
          </View>
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: stopped ? glassPalette.cyan : logsQuery.isFetching ? glassPalette.cyan : glassPalette.green },
              ]}
            />
            <Text style={[styles.statusText, { color: stopped ? glassPalette.cyan : glassSurface.textSecondary }]}>
              {stopped ? "ANGEHALTEN" : "STREAMING"}
            </Text>
          </View>
        </View>

        <ScrollView style={styles.terminal} contentContainerStyle={styles.terminalContent} showsVerticalScrollIndicator={false}>
          {stopped ? (
            <Text style={[styles.systemLine, { color: glassPalette.cyan }]}>
              ⛔ EMERGENCY STOP AKTIV — Live-Aktivitaeten pausiert.
              {backendStopped ? " Remote-Executor gestoppt." : ""}
              Zum Fortsetzen &quot;RESUME&quot; druecken.
            </Text>
          ) : entries.length === 0 ? (
            <Text style={styles.systemLine}>Warte auf Agenten-Aktivitaet…</Text>
          ) : (
            entries.map((entry, index) => (
              <Animated.View key={entry.id ?? `${entry.atMs}-${index}`} entering={FadeInDown.duration(180)}>
                <Text style={styles.logLine}>
                  <Text style={styles.timeText}>[{formatTime(entry.atMs)}]</Text>
                  {"  "}
                  <Text style={{ color: LEVEL_COLORS[entry.level] ?? glassPalette.cyan }}>
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
          {backendOnline ? (
            <Text style={styles.backendHint}>
              {stopped
                ? "Autonomes Backend: gestoppt"
                : "Autonomes Backend: live — Stop greift auch remote"}
            </Text>
          ) : null}
          {stopped ? (
            <Pressable
              style={({ pressed }) => [styles.resumeButton, pressed && styles.buttonPressed]}
              onPress={handleResume}
              accessibilityRole="button"
            >
              <Text style={styles.resumeText}>▶ RESUME</Text>
            </Pressable>
          ) : (
            <Animated.View style={stopAnimated}>
              <Pressable
                onPressIn={handleStopIn}
                onPressOut={handleStopOut}
                onPress={handleStop}
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
    </GlassBackdrop>
  );
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: glassDepth.void },
  safeTransparent: { flex: 1, backgroundColor: "transparent" },
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: glassSurface.border,
  },
  headerKicker: { ...glassType.caption, color: glassPalette.cyan },
  headerTitle: { ...glassType.headline, color: glassSurface.textPrimary, letterSpacing: 2 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: glassSurface.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5 },
  statusText: { ...glassType.body, fontSize: 10, letterSpacing: 1 },
  terminal: { flex: 1, backgroundColor: "#05070D" },
  terminalContent: { padding: 14, gap: 4 },
  systemLine: { ...glassType.body, color: glassSurface.textSecondary },
  logLine: { ...glassType.body, lineHeight: 18, flexWrap: "wrap" },
  timeText: { color: glassSurface.textSecondary },
  sourceText: { color: glassSurface.textSecondary },
  messageText: { color: glassSurface.textPrimary },
  footer: { padding: 14, paddingBottom: 18, borderTopWidth: 1, borderTopColor: glassSurface.border, backgroundColor: glassDepth.void },
  backendHint: { ...glassType.body, fontSize: 10, color: glassSurface.textSecondary, textAlign: "center", marginBottom: 10 },
  stopButton: {
    backgroundColor: glassPalette.cyan,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: glassPalette.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  resumeButton: {
    backgroundColor: glassDepth.glass,
    borderWidth: 1,
    borderColor: `${glassPalette.cyan}66`,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.85 },
  stopText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  resumeText: { color: glassPalette.cyan, fontSize: 15, fontWeight: "800", letterSpacing: 2 },
});

const styles = createStyles();
