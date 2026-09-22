/**
 * Sprint 176 — Superagenten-Chat auf "CyberSarah Future Glass" umgebaut
 * (Fortsetzung der Sprints 168/173-175).
 *
 * Logik (Orchestrator-Run, Live-Polling, Optimistic Rows, Schritt-Details,
 * Secrets-Vault-Modal, Optimizer-Trigger, Chat-Composer mit Enter-Send)
 * bleibt unveraendert; nur die visuelle Schicht wechselt auf das
 * verbindliche Glass-System: GlassBackdrop statt Flachhintergrund,
 * GlassCard-Bubbles, Palette/Token aus lib/design/future-glass statt
 * cyber-theme/useColors-Hartkodierungen.
 */
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
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { MarkdownLiteContent } from "@/components/chat/message-bubble";
import { GlassCard } from "@/components/glass/glass-primitives";
import { AiCore } from "@/components/glass/ai-core";
import { accentAlpha, glassDepth, glassPalette, glassRadii, glassSpacing, glassSurface, glassType } from "@/lib/design/future-glass";
import { coerceLedgerTask, type LedgerTask } from "@/lib/task-ledger-logic";
import { buildConversationHistory, buildSuperagentChatRows, type SuperagentChatRow } from "@/lib/superagent-chat-logic";
import { describeLlmError } from "@/lib/llm-error-logic";
import { trpc } from "@/lib/trpc";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { SecretsPanel } from "@/components/secrets/secrets-panel";
import { useStudioSettings } from "@/lib/studio-settings";
import { addSoftBreakOpportunities } from "@/lib/text-wrap-logic";

type TaskStatus = "pending" | "running" | "success" | "failed" | "escalated";

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: "WARTE", color: glassPalette.blue },
  running: { label: "LÄUFT", color: glassPalette.cyan },
  success: { label: "GRÜN", color: glassPalette.green },
  failed: { label: "FEHLER", color: glassPalette.red },
  escalated: { label: "ESKALIERT", color: glassPalette.magenta },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function SuperagentScreen() {
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
  const { settings: studioSettings } = useStudioSettings();
  const [vaultOpen, setVaultOpen] = useState(false);
  const toolsQuery = trpc.orchestrator.tools.useQuery(undefined, { enabled: isAdmin });

  // Sprint 197 — Optimizer ist NICHT mehr in der UI vertreten. Er laeuft
  // rein im Hintergrund: einmal autonom pro App-Start (rate-limited, der
  // Server fuehrt den Zyklus nur aus, wenn der letzte laenger als 60 Min
  // zurueckliegt) plus im gewohnten Intervall-Loop.
  const optimizerEnsureOnce = trpc.orchestrator.optimizerEnsureOnce.useMutation();
  const optimizerEnsureOnceRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || optimizerEnsureOnceRef.current) return;
    optimizerEnsureOnceRef.current = true;
    // Feuer-und-vergessen: Ergebnis landet im Zyklus-Verlauf, nie im Chat.
    optimizerEnsureOnce.mutate(undefined, {
      onError: (e) => console.warn("[superagent] Optimizer-Start-Zyklus fehlgeschlagen:", e),
    });
  }, [isAdmin, optimizerEnsureOnce]);

  const listRef = useRef<FlatList<SuperagentChatRow> | null>(null);
  const stickToBottomRef = useRef(true);
  const rowsLengthRef = useRef(0);
  // Sprint 199 — Antwort-zum-Anfang: Y-Offset jeder Antwort-Zeile messen,
  // damit nach Abschluss an den ANFANG der Antwort gescrollt werden kann
  // (lange Ergebnisse sollen von oben lesbar sein, nicht am unteren Rand).
  const rowOffsetsRef = useRef<Map<string, number>>(new Map());
  // Ziel-Row des bevorstehenden Antwort-Sprungs (wird im Effect ausgefuehrt —
  // Refs sind im Render nicht lesbar, der ESLint-Rule verbietet das zurecht).
  const [scrollToAnswerKey, setScrollToAnswerKey] = useState<string | null>(null);

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
      // Sprint 199: Anfang der fertigen Antwort an den oberen Bildschirmrand
      // springen lassen — der Effect weiter unten liest die gemessenen
      // Offsets und fuehrt den Sprung nach dem Layout aus.
      setScrollToAnswerKey(`${activeTask.id}-answer`);
    }
  }

  const ledger = ((ledgerQuery.data ?? []) as unknown[]).map(coerceLedgerTask);
  const rows = useMemo(
    () => [...buildSuperagentChatRows(ledger, activeTask), ...optimisticRows],
    [ledger, activeTask, optimisticRows],
  );
  const toolCount = useMemo(() => toolsQuery.data?.tools?.length ?? 0, [toolsQuery.data]);

  // Sprint 199 — Antwort-zum-Anfang: Nach Abschluss einer Aufgabe an den
  // ANFANG der Antwort springen (der Nutzer liest vom Start des Ergebnisses,
  // nicht irgendwo im herausragenden Text). Doppelt rAF + Late-Retry fuer
  // verzoegerte Android-Layout-Frames.
  useEffect(() => {
    if (!scrollToAnswerKey) return;
    const jump = (animated: boolean) => {
      const y = rowOffsetsRef.current.get(scrollToAnswerKey);
      if (y == null) return;
      listRef.current?.scrollToOffset({ offset: Math.max(0, y - 12), animated });
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        jump(true);
        setTimeout(() => jump(false), 140);
      });
    });
    return () => setScrollToAnswerKey(null);
  }, [scrollToAnswerKey]);

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
      // Sprint 197: bisheriger Dialog-Verlauf als Kontext (wie im
      // Entwicklungs-Chat) — der Superagent kann auf Nachfragen eingehen.
      const record = (await runMutation.mutateAsync({
        objective: trimmed,
        history: buildConversationHistory(rows),
      })) as LedgerTask;
      setOptimisticRows([]);
      setActiveId(record.id);
      setExpandedIds((prev) => new Set(prev).add(`${record.id}-answer`));
      void ledgerQuery.refetch();
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Ausführung fehlgeschlagen.";
      const message = describeLlmError(raw);
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
      <GlassBackdrop accent="purple">
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <View style={styles.center}>
            <AiCore state="idle" size={44} />
            <Text style={styles.lockTitle}>Admin-Zugang erforderlich</Text>
            <Text style={styles.lockText}>
              Die autonome Ausführung (Git, Render, Infrastruktur) ist vertrauensvoll und nur für Administratoren freigeschaltet. Melde dich mit deinem Admin-Konto an.
            </Text>
          </View>
        </SafeAreaView>
      </GlassBackdrop>
    );
  }

  return (
    <GlassBackdrop accent="purple">
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
              <View style={styles.headerTitleRow}>
                <AiCore state={activeId != null ? "executing" : "idle"} size={24} />
                <Text style={styles.headerTitle}>
                  SUPER<Text style={styles.headerTitleAccent}>AGENT</Text>
                </Text>
              </View>
            </View>
            <Text style={styles.toolCountText} numberOfLines={1}>
              {toolCount > 0 ? `${toolCount} TOOLS BEREIT · OPTIMIZER IM HINTERGRUND` : "OPTIMIZER IM HINTERGRUND"}
            </Text>
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
            <View style={styles.vaultModal}>
              <View style={styles.vaultModalHeader}>
                <Text style={styles.vaultModalTitle}>
                  VAULT<Text style={styles.headerTitleAccent}>SECRETS</Text>
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
            <View style={styles.emptyBubbleWrap}>
              <GlassCard accent="purple" glow={1} style={styles.emptyBubble}>
                <Text style={styles.emptyTitle}>AUTONOME AUSFÜHRUNG BEREIT</Text>
                <Text style={styles.emptyText}>
                  Gib ein Ziel ein — der Superagent zerlegt es selbst in Schritte, nutzt seine Tools und korrigiert sich eigenständig. Der Verlauf läuft hier wie ein Chat.
                </Text>
              </GlassCard>
            </View>
          }
          renderItem={({ item }) =>
            item.kind === "objective" ? (
              <View style={styles.objectiveBubbleWrap}>
                <GlassCard accent="cyan" style={styles.objectiveBubble}>
                  <Text style={styles.objectiveTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.objectiveText}>{addSoftBreakOpportunities(item.objective)}</Text>
                  <Text style={styles.objectiveMeta}>{formatTime(item.createdAt)}</Text>
                </GlassCard>
              </View>
            ) : (
              <View
                style={styles.answerBubbleWrap}
                onLayout={(e) => {
                  rowOffsetsRef.current.set(item.key, e.nativeEvent.layout.y);
                }}
              >
                <GlassCard accent="purple" onPress={() => toggleExpanded(item.key)} style={styles.answerBubble} testID="superagent-answer-bubble">
                  <View style={styles.answerHead}>
                    <Text
                      style={[
                        styles.statusBadge,
                        {
                          color: STATUS_META[item.status].color,
                          borderColor: glassSurface.borderStrong,
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
                      <ActivityIndicator size="small" color={glassPalette.cyan} />
                      <Text style={styles.progressText}>
                        {addSoftBreakOpportunities(item.steps.length > 0 ? item.steps[item.steps.length - 1].name : "Ziel wird zerlegt …")}
                      </Text>
                    </View>
                  ) : null}

                  {expandedIds.has(item.key) && item.steps.length > 0 ? (
                    <View style={styles.stepBox}>
                      {item.steps.map((step) => {
                        const sm = step.status === "success"
                          ? { dot: "●", color: glassPalette.green }
                          : step.status === "failed"
                            ? { dot: "✕", color: glassPalette.red }
                            : step.status === "running"
                              ? { dot: "◐", color: glassPalette.cyan }
                              : { dot: "○", color: glassPalette.blue };
                        return (
                          <View key={step.id} style={styles.stepRow}>
                            <Text style={[styles.stepDot, { color: sm.color }]}>{sm.dot}</Text>
                            <View style={styles.stepMain}>
                              <Text style={styles.stepName}>{addSoftBreakOpportunities(step.name)}</Text>
                              {step.attempts > 1 ? (
                                <Text style={styles.stepMeta}>{step.attempts} Versuche</Text>
                              ) : null}
                              {step.error ? <Text style={styles.stepError}>{addSoftBreakOpportunities(step.error)}</Text> : null}
                              {step.logs.length > 0 ? (
                                <View style={styles.logBox}>
                                  {step.logs.slice(-4).map((line, i) => (
                                    <Text key={i} style={styles.logLine}>{addSoftBreakOpportunities(line)}</Text>
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
                      <MarkdownLiteContent content={item.answer} />
                    </View>
                  ) : item.status === "failed" || item.status === "escalated" ? (
                    <Text style={styles.noAnswerText}>
                      Kein finales Ergebnis — tippe für die Schritt-Details und Logs.
                    </Text>
                  ) : null}
                </GlassCard>
              </View>
            )
          }
        />

        {/* Fixierter Chat-Composer unten */}
        <View style={styles.composer}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.composerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="GitHub-Repository verbinden"
              onPress={() => router.push("/settings")}
              style={styles.githubButton}
            >
              <Ionicons name="logo-github" size={18} color={glassPalette.cyan} />
              {studioSettings.hasGitHubToken ? <View style={styles.githubConnectedDot} /> : null}
            </Pressable>
            <TextInput
              style={styles.composerInput}
              placeholder="Ziel eingeben — z. B. Prüfe den Produktiv-Deploy …"
              placeholderTextColor={glassSurface.textMuted}
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
              accessibilityRole="button"
              accessibilityLabel="Ziel an den Superagenten senden"
            >
              {runMutation.isPending ? (
                <ActivityIndicator color={glassDepth.void} size="small" />
              ) : (
                <Text style={styles.sendButtonText}>▶</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
      </GlassBackdrop>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  root: { flex: 1 },
  list: { flex: 1 },
  listContent: { padding: glassSpacing.lg, paddingBottom: glassSpacing.xxl, gap: glassSpacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: glassSpacing.xxxl, gap: glassSpacing.md },
  lockTitle: { ...glassType.title, color: glassSurface.textPrimary, textAlign: "center" },
  lockText: { ...glassType.body, color: glassSurface.textSecondary, lineHeight: 19, textAlign: "center" },
  header: { paddingHorizontal: glassSpacing.lg, paddingTop: glassSpacing.sm, paddingBottom: glassSpacing.sm, gap: 6, borderBottomWidth: 1, borderBottomColor: glassSurface.border },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  menuRow: { flexDirection: "row", alignItems: "center", gap: glassSpacing.sm },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: glassSpacing.sm },
  headerTitle: { ...glassType.headline, fontSize: 22, color: glassSurface.textPrimary },
  headerTitleAccent: { color: glassPalette.purple },
  toolCountText: { ...glassType.label, letterSpacing: 1.5, color: glassSurface.textMuted },
  objectiveBubbleWrap: { flexDirection: "row", justifyContent: "flex-end", minWidth: 0, maxWidth: "100%" },
  objectiveBubble: { borderBottomRightRadius: 4, padding: glassSpacing.md, maxWidth: "82%", minWidth: 0, gap: glassSpacing.xs },
  objectiveTitle: { ...glassType.label, color: glassPalette.cyan, letterSpacing: 1 },
  objectiveText: { ...glassType.body, color: glassSurface.textPrimary, lineHeight: 20, maxWidth: "100%" },
  objectiveMeta: { ...glassType.label, color: glassSurface.textMuted, alignSelf: "flex-end" },
  answerBubbleWrap: { flexDirection: "row", justifyContent: "flex-start", minWidth: 0, maxWidth: "100%", width: "100%" },
  answerBubble: { borderBottomLeftRadius: 4, padding: glassSpacing.md, maxWidth: "92%", minWidth: 0, flex: 1, gap: glassSpacing.sm },
  answerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: glassSpacing.sm, minWidth: 0, maxWidth: "100%" },
  statusBadge: { ...glassType.label, borderWidth: 1, borderRadius: 4, flexShrink: 0, paddingHorizontal: 6, paddingVertical: 2, letterSpacing: 1.5 },
  answerMeta: { ...glassType.caption, color: glassSurface.textMuted, fontSize: 11, flexShrink: 1, maxWidth: "100%", textAlign: "right" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: glassSpacing.md },
  progressText: { ...glassType.caption, color: glassPalette.cyan, flexShrink: 1, maxWidth: "100%" },
  stepBox: { gap: glassSpacing.sm, borderTopWidth: 1, borderTopColor: glassSurface.border, paddingTop: glassSpacing.sm },
  stepRow: { flexDirection: "row", gap: glassSpacing.sm },
  stepDot: { fontSize: 12, lineHeight: 18 },
  stepMain: { flex: 1, gap: 2 },
  stepName: { ...glassType.caption, color: glassSurface.textPrimary, fontWeight: "600", flexShrink: 1, maxWidth: "100%" },
  stepMeta: { ...glassType.label, color: glassSurface.textMuted, letterSpacing: 0 },
  stepError: { ...glassType.label, color: glassPalette.red, letterSpacing: 0, flexShrink: 1, maxWidth: "100%" },
  logBox: { backgroundColor: glassDepth.layer, borderRadius: 6, padding: 6, gap: 2 },
  logLine: { ...glassType.label, color: glassSurface.textMuted, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }), letterSpacing: 0, flexShrink: 1, maxWidth: "100%" },
  finalBox: { borderTopWidth: 1, borderTopColor: glassSurface.border, paddingTop: glassSpacing.sm, gap: 2, minWidth: 0, maxWidth: "100%", width: "100%" },
  finalLabel: { ...glassType.label, color: glassPalette.green, letterSpacing: 2 },
  finalText: { ...glassType.body, color: glassSurface.textPrimary, lineHeight: 19, fontSize: 13 },
  noAnswerText: { ...glassType.caption, color: glassSurface.textMuted, fontStyle: "italic" },
  emptyBubbleWrap: { marginTop: glassSpacing.xl },
  emptyBubble: { padding: glassSpacing.lg, gap: glassSpacing.xs },
  emptyTitle: { ...glassType.label, color: glassPalette.purple, letterSpacing: 2 },
  emptyText: { ...glassType.body, color: glassSurface.textSecondary, lineHeight: 19 },
  composer: { paddingHorizontal: glassSpacing.md, paddingTop: glassSpacing.sm, paddingBottom: 6, borderTopWidth: 1, borderTopColor: glassSurface.border, backgroundColor: glassDepth.void, gap: 6 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: glassSpacing.sm },
  composerInput: {
    flex: 1,
    backgroundColor: glassDepth.layer,
    color: glassSurface.textPrimary,
    borderRadius: glassRadii.md,
    borderWidth: 1,
    borderColor: accentAlpha("cyan", 0.32),
    paddingHorizontal: glassSpacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    maxHeight: 120,
    textAlignVertical: "top",
  },
  sendButton: { backgroundColor: accentAlpha("cyan", 0.92), borderRadius: glassRadii.md, width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  githubButton: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderWidth: 1, borderRadius: glassRadii.md, width: 46, height: 46, alignItems: "center", justifyContent: "center", position: "relative" },
  githubConnectedDot: { position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: glassPalette.green },
  sendButtonDisabled: { opacity: 0.45 },
  sendButtonText: { color: glassDepth.void, fontWeight: "900", fontSize: 16 },
  vaultChip: {
    alignSelf: "flex-start",
    borderRadius: glassRadii.pill,
    borderWidth: 1,
    borderColor: accentAlpha("purple", 0.5),
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
    marginLeft: 8,
  },
  vaultChipText: { ...glassType.label, color: glassPalette.purple, letterSpacing: 1 },
  vaultModal: { flex: 1, paddingTop: glassSpacing.lg, backgroundColor: glassDepth.void },
  vaultModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: glassSpacing.lg,
    paddingBottom: glassSpacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: glassSurface.border,
  },
  vaultModalTitle: { ...glassType.title, letterSpacing: 1, color: glassSurface.textPrimary },
  vaultClose: { paddingVertical: 6, paddingHorizontal: 10 },
  vaultCloseText: { ...glassType.body, color: glassPalette.cyan },
  vaultContent: { padding: glassSpacing.lg, paddingBottom: 40 },
  errorText: { ...glassType.caption, color: glassPalette.red },
});
