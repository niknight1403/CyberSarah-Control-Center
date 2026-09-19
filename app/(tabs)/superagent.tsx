import { useColors } from "@/hooks/use-colors";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cyber, cyberTypography } from "@/lib/cyber-theme";
import { coerceLedgerTask, type LedgerTask } from "@/lib/task-ledger-logic";
import { buildSuperagentChatRows, type SuperagentChatRow } from "@/lib/superagent-chat-logic";
import { trpc } from "@/lib/trpc";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { SecretsPanel } from "@/components/secrets/secrets-panel";

/**
 * Sprint 149 — Superagent-Tab als echtes Chatfenster.
 *
 * Vorher war der Tab ein langes Scroll-Formular: Ziel oben eingeben,
 * Antwort unten im Task-Ledger suchen. Jetzt funktioniert er wie ein
 * Messenger:
 *  - Ziel eintippen → erscheint als Nutzer-Nachricht (rechts)
 *  - Der Superagent antwortet direkt darunter im Chat-Strom (links):
 *    Live-Schritte, Selbstkorrektur-Runden und die finale Antwort —
 *    die Liste scrollt automatisch auf die neueste Nachricht.
 *  - Eingabefeld ist fixiert unten, Netz oben kompakt.
 *
 * Zugrundeliegende Runtime: server/orchestrator/superagent.ts —
 * Task-Decomposition, Tool-Ausfuehrung, Selbstkorrektur. Admin-gated.
 */

type TaskStatus = "pending" | "running" | "success" | "failed" | "escalated";

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: "WARTE", color: cyber.textDim },
  running: { label: "LÄUFT", color: cyber.cyan },
  success: { label: "GRÜN", color: cyber.green },
  failed: { label: "FEHLER", color: cyber.pink },
  escalated: { label: "ESKALIERT", color: cyber.pink },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function SuperagentScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const isAdmin = accountQuery.data?.role === "admin";

  const [objective, setObjective] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [optimisticRows, setOptimisticRows] = useState<SuperagentChatRow[]>([]);

  const ledgerQuery = trpc.orchestrator.tasks.useQuery({ limit: 25 }, {
    enabled: isAdmin,
    refetchInterval: activeId != null ? 3_000 : 15_000,
    refetchIntervalInBackground: false,
  });

  const activeQuery = trpc.orchestrator.task.useQuery(
    { id: activeId ?? "" },
    { enabled: isAdmin && activeId != null, refetchInterval: 2_000, refetchIntervalInBackground: false },
  );

  const runMutation = trpc.orchestrator.run.useMutation();
  const [vaultOpen, setVaultOpen] = useState(false);
  const toolsQuery = trpc.orchestrator.tools.useQuery(undefined, { enabled: isAdmin });

  const optimizerQuery = trpc.orchestrator.optimizerStatus.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const optimizerTrigger = trpc.orchestrator.optimizerTrigger.useMutation();

  const listRef = useRef<FlatList<SuperagentChatRow> | null>(null);
  const stickToBottomRef = useRef(true);
  const rowsLengthRef = useRef(0);

  // Aktiven Lauf nach Abschluss aus dem Live-Polling nehmen.
  // Sprint 171: Adjust-Pattern statt Effect — Schlüssel auf id:status, weil
  // coerceLedgerTask pro Render ein neues Objekt erzeugt (früher lief der
  // Effect dadurch bei jedem Render erneut, mit neuer Set-Referenz).
  const activeTask = activeQuery.data ? coerceLedgerTask(activeQuery.data) : undefined;
  const activeTaskKey = activeTask ? `${activeTask.id}:${activeTask.status}` : "";
  const [seenActiveTaskKey, setSeenActiveTaskKey] = useState("");
  if (activeTaskKey !== seenActiveTaskKey) {
    setSeenActiveTaskKey(activeTaskKey);
    if (activeTask && (activeTask.status === "success" || activeTask.status === "failed" || activeTask.status === "escalated")) {
      setActiveId(null);
      setExpandedIds((prev) => new Set(prev).add(`${activeTask.id}-answer`));
    }
  }

  const ledger = ((ledgerQuery.data ?? []) as unknown[]).map(coerceLedgerTask);
  const rows = useMemo(
    () => [...buildSuperagentChatRows(ledger, activeTask), ...optimisticRows],
    [ledger, activeTask, optimisticRows],
  );
  const toolCount = useMemo(() => toolsQuery.data?.tools?.length ?? 0, [toolsQuery.data]);

  // Chat-UX: Bei neuen Nachrichten (oder waehrend ein Lauf live tickt) an
  // das Listenende scrollen — aber nur, wenn der Nutzer nicht absichtlich
  // im Verlauf hochscrollt.
  useEffect(() => {
    const grew = rows.length !== rowsLengthRef.current;
    rowsLengthRef.current = rows.length;
    if ((grew && rows.length > 0) || (activeId != null && stickToBottomRef.current)) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: grew });
      });
    }
  }, [rows, activeId]);

  const onScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { y } = event.nativeEvent.contentOffset;
    const bottomDistance =
      event.nativeEvent.contentSize.height - event.nativeEvent.layoutMeasurement.height - y;
    stickToBottomRef.current = bottomDistance < 120;
  }, []);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const startRun = async () => {
    const trimmed = objective.trim();
    if (trimmed.length < 3 || runMutation.isPending) return;
    setError(null);
    stickToBottomRef.current = true;
    const optimisticId = `pending-${Date.now()}`;
    const now = new Date().toISOString();
    setOptimisticRows([
      {
        kind: "objective",
        key: `${optimisticId}-objective`,
        taskId: optimisticId,
        title: "Neue Superagent-Aufgabe",
        objective: trimmed,
        createdAt: now,
      },
      {
        kind: "answer",
        key: `${optimisticId}-answer`,
        taskId: optimisticId,
        status: "running",
        round: 1,
        stepCount: 0,
        steps: [],
        answer: null,
        finishedAt: now,
      },
    ]);
    setObjective("");
    try {
      const record = (await runMutation.mutateAsync({ objective: trimmed })) as LedgerTask;
      setOptimisticRows([]);
      setActiveId(record.id);
      setExpandedIds((prev) => new Set(prev).add(`${record.id}-answer`));
      void ledgerQuery.refetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Ausführung fehlgeschlagen.";
      setError(message);
      setOptimisticRows((current) => current.map((row) => row.kind === "answer" ? {
        ...row,
        status: "failed",
        answer: message,
        finishedAt: new Date().toISOString(),
      } : row));
    }
  };

  const navDrawer = useNavDrawer();

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <Text style={styles.lockTitle}>Admin-Zugang erforderlich</Text>
          <Text style={styles.lockText}>
            Die autonome Ausführung (Git, Render, Infrastruktur) ist vertrauensvoll und nur für Administratoren freigeschaltet. Melde dich mit deinem Admin-Konto an.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {/* Kompakter Netz-Kopf */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.menuRow}>
              <NavDrawer {...navDrawer.drawerProps} />
              <NavDrawerButton {...navDrawer.hamburgerProps} />
            </View>
            <Text style={styles.headerTitle}>
              SUPER<Text style={{ color: colors.tint }}>AGENT</Text>
            </Text>
          </View>
          <Pressable
            style={styles.optimizerChip}
            onPress={() => {
              void optimizerTrigger.mutateAsync().catch((e: unknown) =>
                setError(e instanceof Error ? e.message : "Optimizer-Start fehlgeschlagen."),
              );
            }}
          >
            {optimizerTrigger.isPending ? (
              <ActivityIndicator size="small" color={optimizerQuery.data?.enabled ? colors.success : colors.icon} />
            ) : (
              <Text
                style={[
                  styles.optimizerChipText,
                  { color: optimizerQuery.data?.enabled ? colors.success : colors.icon },
                ]}
              >
                ⟲ OPTIMIZER {optimizerQuery.data?.enabled ? "AKTIV" : "AUS"} · {toolCount > 0 ? `${toolCount} TOOLS` : "TOOLS"}
              </Text>
            )}
          </Pressable>
          {optimizerQuery.data?.lastError ? (
            <Text style={styles.optimizerError} numberOfLines={1}>{optimizerQuery.data.lastError}</Text>
          ) : null}
          <Pressable style={styles.vaultChip} onPress={() => setVaultOpen(true)}>
            <Text style={styles.vaultChipText}>VAULT · SECRETS</Text>
          </Pressable>
        </View>

        {/* Sprint 167: Secrets-Bereich des Superagenten-Chats */}
        <Modal
          visible={vaultOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setVaultOpen(false)}
        >
          <View style={[styles.vaultModal, { backgroundColor: colors.background }]}>
            <View style={styles.vaultModalHeader}>
              <Text style={styles.vaultModalTitle}>
                VAULT<Text style={{ color: colors.tint }}>SECRETS</Text>
              </Text>
              <Pressable onPress={() => setVaultOpen(false)} style={styles.vaultClose}>
                <Text style={styles.vaultCloseText}>Schließen</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.vaultContent}>
              <SecretsPanel />
            </ScrollView>
          </View>
        </Modal>

        {/* Chat-Strom */}
        <FlatList
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                windowSize={9}
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={rows}
          keyExtractor={(row) => row.key}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBubble}>
              <Text style={styles.emptyTitle}>AUTONOME AUSFÜHRUNG BEREIT</Text>
              <Text style={styles.emptyText}>
                Gib ein Ziel ein — der Superagent zerlegt es selbst in Schritte, nutzt seine Tools und korrigiert sich eigenständig. Der Verlauf läuft hier wie ein Chat.
              </Text>
            </View>
          }
          renderItem={({ item }) =>
            item.kind === "objective" ? (
              <View style={styles.objectiveBubbleWrap}>
                <View style={styles.objectiveBubble}>
                  <Text style={styles.objectiveTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.objectiveText}>{item.objective}</Text>
                  <Text style={styles.objectiveMeta}>{formatTime(item.createdAt)}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.answerBubbleWrap}>
                <Pressable style={styles.answerBubble} onPress={() => toggleExpanded(item.key)}>
                  <View style={styles.answerHead}>
                    <Text
                      style={[
                        styles.statusBadge,
                        {
                          color: STATUS_META[item.status].color,
                          borderColor: `${STATUS_META[item.status].color}66`,
                        },
                      ]}
                    >
                      {STATUS_META[item.status].label}
                    </Text>
                    <Text style={styles.answerMeta}>
                      Runde {item.round} · {item.stepCount} Schritte
                      {item.status === "running" ? " · Selbstkorrektur aktiv" : ""}
                    </Text>
                  </View>

                  {item.status === "running" || item.status === "pending" ? (
                    <View style={styles.progressRow}>
                      <ActivityIndicator size="small" color={colors.tint} />
                      <Text style={styles.progressText}>
                        {item.steps.length > 0 ? item.steps[item.steps.length - 1].name : "Ziel wird zerlegt …"}
                      </Text>
                    </View>
                  ) : null}

                  {expandedIds.has(item.key) && item.steps.length > 0 ? (
                    <View style={styles.stepBox}>
                      {item.steps.map((step) => {
                        const sm = step.status === "success"
                          ? { dot: "●", color: colors.success }
                          : step.status === "failed"
                            ? { dot: "✕", color: colors.tint }
                            : step.status === "running"
                              ? { dot: "◐", color: colors.tint }
                              : { dot: "○", color: colors.icon };
                        return (
                          <View key={step.id} style={styles.stepRow}>
                            <Text style={[styles.stepDot, { color: sm.color }]}>{sm.dot}</Text>
                            <View style={styles.stepMain}>
                              <Text style={styles.stepName}>{step.name}</Text>
                              {step.attempts > 1 ? (
                                <Text style={styles.stepMeta}>{step.attempts} Versuche</Text>
                              ) : null}
                              {step.error ? <Text style={styles.stepError}>{step.error}</Text> : null}
                              {step.logs.length > 0 ? (
                                <View style={styles.logBox}>
                                  {step.logs.slice(-4).map((line, i) => (
                                    <Text key={i} style={styles.logLine} numberOfLines={1}>{line}</Text>
                                  ))}
                                </View>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  {item.answer ? (
                    <View style={styles.finalBox}>
                      <Text style={styles.finalLabel}>ERGEBNIS</Text>
                      <Text style={styles.finalText}>{item.answer}</Text>
                    </View>
                  ) : item.status === "failed" || item.status === "escalated" ? (
                    <Text style={styles.noAnswerText}>
                      Kein finales Ergebnis — tippe für die Schritt-Details und Logs.
                    </Text>
                  ) : null}
                </Pressable>
              </View>
            )
          }
        />

        {/* Fixierter Chat-Composer unten */}
        <View style={styles.composer}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.composerRow}>
            <TextInput
              style={styles.composerInput}
              placeholder="Ziel eingeben — z. B. Prüfe den Produktiv-Deploy …"
              placeholderTextColor={colors.icon}
              value={objective}
              onChangeText={setObjective}
              multiline
              onKeyPress={(event) => {
                const nativeEvent = event.nativeEvent as typeof event.nativeEvent & { shiftKey?: boolean };
                if (Platform.OS === "web" && nativeEvent.key === "Enter" && !nativeEvent.shiftKey) {
                  event.preventDefault();
                  void startRun();
                }
              }}
              editable={!runMutation.isPending}
            />
            <Pressable
              style={[styles.sendButton, (objective.trim().length < 3 || runMutation.isPending) && styles.sendButtonDisabled]}
              disabled={objective.trim().length < 3 || runMutation.isPending}
              onPress={() => void startRun()}
            >
              {runMutation.isPending ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.sendButtonText}>▶</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  root: { flex: 1 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 24, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  lockTitle: { color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  lockText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: `${colors.tint}18` },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { ...cyberTypography.display, color: colors.text, fontSize: 22 },
  optimizerChip: { alignSelf: "flex-start", borderWidth: 1, borderColor: `${colors.tint}33`, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: colors.surface },
  optimizerChipText: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  optimizerError: { color: colors.tint, fontSize: 11 },
  objectiveBubbleWrap: { flexDirection: "row", justifyContent: "flex-end" },
  objectiveBubble: { backgroundColor: `${colors.tint}26`, borderWidth: 1, borderColor: `${colors.tint}55`, borderRadius: 14, borderBottomRightRadius: 4, padding: 12, maxWidth: "82%", gap: 4 },
  objectiveTitle: { color: colors.tint, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  objectiveText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  objectiveMeta: { color: colors.icon, fontSize: 10, alignSelf: "flex-end" },
  answerBubbleWrap: { flexDirection: "row", justifyContent: "flex-start" },
  answerBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: `${colors.tint}22`, borderRadius: 14, borderBottomLeftRadius: 4, padding: 12, maxWidth: "92%", flex: 1, gap: 8 },
  answerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statusBadge: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  answerMeta: { color: colors.icon, fontSize: 11 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressText: { color: colors.tint, fontSize: 12 },
  stepBox: { gap: 8, borderTopWidth: 1, borderTopColor: `${colors.tint}18`, paddingTop: 8 },
  stepRow: { flexDirection: "row", gap: 8 },
  stepDot: { fontSize: 12, lineHeight: 18 },
  stepMain: { flex: 1, gap: 2 },
  stepName: { color: colors.text, fontSize: 12, fontWeight: "600" },
  stepMeta: { color: colors.icon, fontSize: 10 },
  stepError: { color: colors.tint, fontSize: 10 },
  logBox: { backgroundColor: colors.surface, borderRadius: 6, padding: 6, gap: 2 },
  logLine: { color: colors.muted, fontSize: 10, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },
  finalBox: { borderTopWidth: 1, borderTopColor: `${colors.tint}18`, paddingTop: 8, gap: 2 },
  finalLabel: { color: colors.success, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  finalText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  noAnswerText: { color: colors.icon, fontSize: 11, fontStyle: "italic" },
  emptyBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: `${colors.tint}22`, borderRadius: 14, borderBottomLeftRadius: 4, padding: 14, gap: 6, marginTop: 24 },
  emptyTitle: { color: colors.tint, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  composer: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, borderTopWidth: 1, borderTopColor: `${colors.tint}18`, backgroundColor: colors.background, gap: 6 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  composerInput: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${colors.tint}33`,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    maxHeight: 120,
    textAlignVertical: "top",
  },
  sendButton: { backgroundColor: colors.tint, borderRadius: 12, width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  sendButtonDisabled: { opacity: 0.45 },
  vaultChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${colors.tint}55`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
    marginLeft: 8,
  },
  vaultChipText: { fontSize: 10, letterSpacing: 1, color: colors.tint, fontWeight: "700" },
  vaultModal: { flex: 1, paddingTop: 16 },
  vaultModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  vaultModalTitle: { fontSize: 16, fontWeight: "800", letterSpacing: 1, color: colors.text },
  vaultClose: { paddingVertical: 6, paddingHorizontal: 10 },
  vaultCloseText: { color: colors.tint, fontSize: 13, fontWeight: "600" },
  vaultContent: { padding: 16, paddingBottom: 40 },
  sendButtonText: { color: colors.background, fontWeight: "900", fontSize: 16 },
  errorText: { color: colors.tint, fontSize: 12 },
});
