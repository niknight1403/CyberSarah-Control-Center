import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cyber, cyberTypography } from "@/lib/cyber-theme";
import { trpc } from "@/lib/trpc";

/**
 * Sprint 129 — Superagent-Tab: Vollautonome Ausfuehrung von Zielen ueber
 * die Leitender-Superagent-Runtime (server/orchestrator/superagent.ts,
 * Sprint 123) — Task-Decomposition, Tool-Ausfuehrung und Selbstkorrektur.
 *
 * Der Tab ist die Benutzerflaeche zum Orchestrator-Router:
 *  - Ziel eingeben → orchestrator.run (autonome Ausfuehrung)
 *  - Live-Verlauf des aktiven Tasks (Schritte, Logs, Runden)
 *  - Task-Ledger mit Vollstuendiger Nachverfolgbarkeit (Audit-Charakter)
 * Admin-gated wie der Router selbst — Infrastruktur-Tools (Git, Render,
 * Docker) laufen nur im vertrauenswuerdigen Kontext.
 */

type TaskStatus = "pending" | "running" | "success" | "failed" | "escalated";
type StepStatus = "pending" | "running" | "success" | "failed";

interface StepRecord {
  id: string;
  name: string;
  status: StepStatus;
  attempts: number;
  error?: string;
  logs: string[];
  startedAt: string;
  finishedAt?: string;
}

interface TaskRecord {
  id: string;
  title: string;
  objective: string;
  status: TaskStatus;
  correctionIterations: number;
  steps: StepRecord[];
  finalAnswer?: unknown;
  createdAt: string;
  updatedAt: string;
}

const STATUS_META: Record<TaskStatus | StepStatus, { label: string; color: string }> = {
  pending: { label: "WARTE", color: cyber.textDim },
  running: { label: "LÄUFT", color: cyber.cyan },
  success: { label: "GRÜN", color: cyber.green },
  failed: { label: "FEHLER", color: cyber.pink },
  escalated: { label: "ESKALIERT", color: cyber.pink },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function formatAnswer(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function SuperagentScreen() {
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const isAdmin = accountQuery.data?.role === "admin";

  const [objective, setObjective] = useState("");
  const [title, setTitle] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const toolsQuery = trpc.orchestrator.tools.useQuery(undefined, { enabled: isAdmin });

  // Aktiven Task automatisch entExpandieren, sobald er endgueltig ist.
  const activeTask = activeQuery.data as TaskRecord | undefined;
  useEffect(() => {
    if (activeTask && (activeTask.status === "success" || activeTask.status === "failed" || activeTask.status === "escalated")) {
      setActiveId(null);
      setExpandedId(activeTask.id);
    }
  }, [activeTask]);

  const ledger = (ledgerQuery.data ?? []) as TaskRecord[];

  const startRun = async () => {
    const trimmed = objective.trim();
    if (trimmed.length < 3 || runMutation.isPending) return;
    setError(null);
    try {
      const record = (await runMutation.mutateAsync({
        objective: trimmed,
        title: title.trim() || undefined,
      })) as TaskRecord;
      setActiveId(record.id);
      setExpandedId(record.id);
      setObjective("");
      setTitle("");
      void ledgerQuery.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ausführung fehlgeschlagen.");
    }
  };

  const statusOf = (t: TaskRecord) => STATUS_META[t.status];
  const toolCount = useMemo(() => toolsQuery.data?.tools?.length ?? 0, [toolsQuery.data]);

  const detailTask = (activeTask && activeTask.id === expandedId ? activeTask : undefined) ?? ledger.find((t) => t.id === expandedId);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={ledgerQuery.isFetching && activeId == null}
            onRefresh={() => void ledgerQuery.refetch()}
            tintColor={cyber.cyan}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerKicker}>AUTONOME AUSFÜHRUNG</Text>
          <Text style={styles.headerTitle}>
            SUPER<Text style={{ color: cyber.cyan }}>AGENT</Text>
          </Text>
          <View style={[styles.headerLine, { backgroundColor: `${cyber.cyan}55` }]} />
          <Text style={styles.headerSub}>
            Ziel eingeben — der Superagent zerlegt es selbst in Schritte, nutzt {toolCount > 0 ? `${toolCount} Tools` : "seine Tools"} und korrigiert sich eigenständig.
          </Text>
        </View>

        {!isAdmin ? (
          <View style={[styles.panel, styles.gapPanel]}>
            <Text style={styles.panelTitle}>Admin-Zugang erforderlich</Text>
            <Text style={styles.panelText}>
              Die autonome Ausführung (Git, Render, Infrastruktur) ist vertrauensvoll und nur für Administratoren freigeschaltet. Melde dich mit deinem Admin-Konto an.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.panel}>
              <Text style={styles.inputLabel}>ZIEL</Text>
              <TextInput
                style={styles.inputObjective}
                placeholder="z. B. Prüfe den Produktiv-Deploy und berichte den Systemstatus …"
                placeholderTextColor={cyber.textDim}
                value={objective}
                onChangeText={setObjective}
                multiline
                editable={!runMutation.isPending}
              />
              <TextInput
                style={styles.inputTitle}
                placeholder="Titel (optional)"
                placeholderTextColor={cyber.textDim}
                value={title}
                onChangeText={setTitle}
                editable={!runMutation.isPending}
              />
              <Pressable
                style={[styles.runButton, (objective.trim().length < 3 || runMutation.isPending) && styles.runButtonDisabled]}
                disabled={objective.trim().length < 3 || runMutation.isPending}
                onPress={() => void startRun()}
              >
                {runMutation.isPending ? (
                  <ActivityIndicator color={cyber.bg} size="small" />
                ) : (
                  <Text style={styles.runButtonText}>▶ AUTONOM STARTEN</Text>
                )}
              </Pressable>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            {activeTask ? (
              <View style={styles.panel}>
                <View style={styles.panelHeader}>
                  <Text style={styles.panelTitle}>{activeTask.title}</Text>
                  <Text style={[styles.badge, { color: STATUS_META[activeTask.status].color, borderColor: `${STATUS_META[activeTask.status].color}66` }]}>
                    {STATUS_META[activeTask.status].label}
                  </Text>
                </View>
                <Text style={styles.objectiveText}>{activeTask.objective}</Text>
                <View style={styles.progressRow}>
                  <ActivityIndicator size="small" color={cyber.cyan} />
                  <Text style={styles.progressText}>
                    Runde {activeTask.correctionIterations + 1} · {activeTask.steps.length} Schritte · Selbstkorrektur aktiv
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Task-Ledger</Text>
              {ledger.length === 0 ? (
                <Text style={styles.panelText}>Noch keine autonomen Aufgaben ausgeführt.</Text>
              ) : (
                ledger.map((task) => {
                  const meta = statusOf(task);
                  const expanded = detailTask?.id === task.id;
                  return (
                    <View key={task.id} style={styles.ledgerEntry}>
                      <Pressable style={styles.ledgerRow} onPress={() => setExpandedId(expanded ? null : task.id)}>
                        <View style={styles.ledgerRowMain}>
                          <Text style={styles.ledgerTitle} numberOfLines={1}>{task.title}</Text>
                          <Text style={styles.ledgerMeta}>
                            {formatTime(task.createdAt)} · {task.steps.length} Schritte
                            {task.correctionIterations > 0 ? ` · ${task.correctionIterations}× korrigiert` : ""}
                          </Text>
                        </View>
                        <Text style={[styles.badge, { color: meta.color, borderColor: `${meta.color}66` }]}>{meta.label}</Text>
                      </Pressable>

                      {expanded && detailTask ? (
                        <View style={styles.detailBox}>
                          <Text style={styles.objectiveText}>{detailTask.objective}</Text>
                          {detailTask.steps.map((step) => {
                            const sm = STATUS_META[step.status];
                            return (
                              <View key={step.id} style={styles.stepRow}>
                                <Text style={[styles.stepDot, { color: sm.color }]}>
                                  {step.status === "success" ? "●" : step.status === "failed" ? "✕" : step.status === "running" ? "◐" : "○"}
                                </Text>
                                <View style={styles.stepMain}>
                                  <Text style={styles.stepName}>{step.name}</Text>
                                  {step.attempts > 1 ? (
                                    <Text style={styles.stepMeta}>{step.attempts} Versuche</Text>
                                  ) : null}
                                  {step.error ? <Text style={styles.stepError}>{step.error}</Text> : null}
                                  {step.logs.length > 0 ? (
                                    <View style={styles.logBox}>
                                      {step.logs.slice(-6).map((line, i) => (
                                        <Text key={i} style={styles.logLine}>{line}</Text>
                                      ))}
                                    </View>
                                  ) : null}
                                </View>
                              </View>
                            );
                          })}
                          {formatAnswer(detailTask.finalAnswer) ? (
                            <View style={styles.finalBox}>
                              <Text style={styles.finalLabel}>ERGEBNIS</Text>
                              <Text style={styles.finalText}>{formatAnswer(detailTask.finalAnswer)}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: cyber.bg },
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  header: { gap: 4 },
  headerKicker: { ...cyberTypography.caption, color: cyber.textDim, letterSpacing: 3, fontSize: 11 },
  headerTitle: { ...cyberTypography.display, color: cyber.text },
  headerLine: { height: 2, borderRadius: 1, marginTop: 6 },
  headerSub: { color: cyber.textMuted, fontSize: 13, marginTop: 8, lineHeight: 18 },
  gapPanel: { gap: 8 },
  panel: { backgroundColor: cyber.surface, borderRadius: 12, borderWidth: 1, borderColor: `${cyber.cyan}22`, padding: 14, gap: 10 },
  panelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  panelTitle: { color: cyber.text, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  panelText: { color: cyber.textMuted, fontSize: 13, lineHeight: 19 },
  inputLabel: { color: cyber.textDim, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  inputObjective: {
    backgroundColor: cyber.surfaceElevated,
    color: cyber.text,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${cyber.cyan}33`,
    padding: 12,
    fontSize: 14,
    minHeight: 84,
    textAlignVertical: "top",
  },
  inputTitle: {
    backgroundColor: cyber.surfaceElevated,
    color: cyber.text,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${cyber.cyan}22`,
    padding: 10,
    fontSize: 13,
  },
  runButton: { backgroundColor: cyber.cyan, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  runButtonDisabled: { opacity: 0.45 },
  runButtonText: { color: cyber.bg, fontWeight: "800", letterSpacing: 1.5, fontSize: 13 },
  errorText: { color: cyber.pink, fontSize: 12 },
  objectiveText: { color: cyber.textMuted, fontSize: 13, fontStyle: "italic" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressText: { color: cyber.cyan, fontSize: 12, letterSpacing: 0.5 },
  badge: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  ledgerEntry: { borderBottomWidth: 1, borderBottomColor: `${cyber.cyan}11`, paddingVertical: 8 },
  ledgerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  ledgerRowMain: { flex: 1 },
  ledgerTitle: { color: cyber.text, fontSize: 13, fontWeight: "600" },
  ledgerMeta: { color: cyber.textDim, fontSize: 11, marginTop: 2 },
  detailBox: { marginTop: 10, gap: 8 },
  stepRow: { flexDirection: "row", gap: 8 },
  stepDot: { fontSize: 12, marginTop: 2 },
  stepMain: { flex: 1, gap: 3 },
  stepName: { color: cyber.text, fontSize: 12, fontWeight: "600" },
  stepMeta: { color: cyber.textDim, fontSize: 10 },
  stepError: { color: cyber.pink, fontSize: 10 },
  logBox: { backgroundColor: cyber.bg, borderRadius: 6, padding: 8, gap: 2 },
  logLine: { color: cyber.textDim, fontSize: 10, fontFamily: "monospace" },
  finalBox: { backgroundColor: `${cyber.green}0D`, borderRadius: 8, borderWidth: 1, borderColor: `${cyber.green}44`, padding: 10, gap: 4 },
  finalLabel: { color: cyber.green, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  finalText: { color: cyber.text, fontSize: 12, lineHeight: 18 },
});
