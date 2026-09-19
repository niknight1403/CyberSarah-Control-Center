import { accentAlpha, glassDepth, glassOverlay, glassPalette, glassSurface } from "@/lib/design/future-glass";
import { useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  SUPER_AGENT_COLORS,
  SUPER_AGENT_STATUS_LABELS,
  type SuperAgentStatus,
} from "@/lib/super-agents-logic";

/**
 * Sprint 137 — Superagenten-Verwaltung im Chat-Tab.
 *
 * AgentSwitcher: kompakte Leiste ueber dem Chatverlauf — zeigt den aktiven
 * Agenten, oeffnet die "Zuletzt verwendete Agenten"-Auswahl sowie die
 * Einstiege "Alle Agenten anzeigen" und "Neuen Agenten erstellen".
 * AgentManagerModal: alle Agenten ansehen, erstellen, umbenennen,
 * archivieren und loeschen (Standard-Agent nur archivierbar).
 *
 * Bewusst schlank gehalten: keine unnötigen Statusinformationen im
 * Chat-Display, damit der Verlauf der Agenten im Fokus bleibt.
 */

/** Serieller Agenten-Datensatz aus dem superAgents-Router. */
export type SuperAgentView = {
  id: number;
  name: string;
  purpose: string;
  color: string;
  sessionId: string;
  status: SuperAgentStatus;
  isDefault: boolean;
  lastActiveAt: string;
  createdAt: string;
};

type SwitcherProps = {
  agents: SuperAgentView[];
  activeAgent: SuperAgentView | null;
  onSelect: (agent: SuperAgentView) => void;
  onOpenManager: () => void;
};

export function AgentSwitcher({ agents, activeAgent, onSelect, onOpenManager }: SwitcherProps) {
  const [open, setOpen] = useState(false);
  const selectable = useMemo(() => agents.filter((agent) => agent.status !== "archiviert"), [agents]);
  const recent = selectable.slice(0, 5);

  return (
    <View style={styles.switcherWrap}>
      <TouchableOpacity
        accessibilityLabel="Superagenten wechseln"
        accessibilityRole="button"
        activeOpacity={0.8}
        onPress={() => setOpen((value) => !value)}
        style={styles.bar}
      >
        <View style={[styles.dot, { backgroundColor: activeAgent?.color ?? glassPalette.amber }]} />
        <Text style={styles.barName} numberOfLines={1}>
          {activeAgent?.name ?? "Superagent"}
        </Text>
        {activeAgent?.status === "pausiert" ? <Text style={styles.barHint}>PAUSIERT</Text> : null}
        <View style={styles.barSpacer} />
        <Text style={styles.barCount}>{selectable.length}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={accentAlpha("amber", 0.7)} />
      </TouchableOpacity>
      {open ? (
        <View style={styles.dropdown}>
          <Text style={styles.dropdownLabel}>ZULETZT VERWENDETE AGENTEN</Text>
          {recent.length === 0 ? <Text style={styles.emptyHint}>Noch keine Agenten.</Text> : null}
          {recent.map((agent) => (
            <TouchableOpacity
              key={agent.id}
              accessibilityLabel={`Agent ${agent.name} auswählen`}
              activeOpacity={0.8}
              onPress={() => {
                onSelect(agent);
                setOpen(false);
              }}
              style={[styles.agentRow, agent.id === activeAgent?.id && styles.agentRowActive]}
            >
              <View style={[styles.dot, { backgroundColor: agent.color }]} />
              <View style={styles.agentMeta}>
                <Text style={styles.agentName} numberOfLines={1}>
                  {agent.name}
                </Text>
                {agent.purpose ? (
                  <Text style={styles.agentPurpose} numberOfLines={1}>
                    {agent.purpose}
                  </Text>
                ) : null}
              </View>
              {agent.status === "pausiert" ? <Text style={styles.rowHint}>PAUSIERT</Text> : null}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            accessibilityLabel="Alle Agenten anzeigen"
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={() => {
              setOpen(false);
              onOpenManager();
            }}
            style={styles.dropdownAction}
          >
            <Ionicons name="grid-outline" size={13} color={glassPalette.cyan} />
            <Text style={styles.dropdownActionText}>Alle Agenten anzeigen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="Neuen Agenten erstellen"
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={() => {
              setOpen(false);
              onOpenManager();
            }}
            style={styles.dropdownAction}
          >
            <Ionicons name="add" size={14} color={glassPalette.green} />
            <Text style={styles.dropdownActionText}>Neuen Agenten erstellen</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

type ManagerProps = {
  visible: boolean;
  agents: SuperAgentView[];
  activeAgentId: number | null;
  onClose: () => void;
  onSelect: (agent: SuperAgentView) => void;
  onCreate: (input: { name: string; purpose: string; color?: string }) => Promise<unknown>;
  onUpdate: (id: number, patch: { name?: string; purpose?: string; status?: SuperAgentStatus }) => Promise<unknown>;
  onRemove: (id: number) => Promise<unknown>;
};

export function AgentManagerModal({
  visible,
  agents,
  activeAgentId,
  onClose,
  onSelect,
  onCreate,
  onUpdate,
  onRemove,
}: ManagerProps) {
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editId, setEditId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [armedRemoveId, setArmedRemoveId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [color, setColor] = useState<string>(SUPER_AGENT_COLORS[1]);

  const resetForm = () => {
    setMode("list");
    setEditId(null);
    setName("");
    setPurpose("");
    setError("");
  };

  const startCreate = () => {
    setMode("form");
    setEditId(null);
    setName("");
    setPurpose("");
    setColor(SUPER_AGENT_COLORS[(agents.length + 1) % SUPER_AGENT_COLORS.length]);
    setError("");
  };

  const startEdit = (agent: SuperAgentView) => {
    setMode("form");
    setEditId(agent.id);
    setName(agent.name);
    setPurpose(agent.purpose);
    setColor(agent.color);
    setError("");
  };

  const submitForm = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editId != null) {
        await onUpdate(editId, { name: trimmedName, purpose: purpose.trim() });
      } else {
        await onCreate({ name: trimmedName, purpose: purpose.trim(), color });
      }
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async (agent: SuperAgentView) => {
    setBusy(true);
    setError("");
    try {
      await onUpdate(agent.id, { status: agent.status === "archiviert" ? "aktiv" : "archiviert" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async (agent: SuperAgentView) => {
    if (armedRemoveId !== agent.id) {
      setArmedRemoveId(agent.id);
      return;
    }
    setArmedRemoveId(null);
    setBusy(true);
    setError("");
    try {
      await onRemove(agent.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Löschen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.eyebrow}>SUPERAGENTEN</Text>
              <Text style={styles.sheetTitle}>{mode === "form" ? (editId != null ? "Agenten bearbeiten" : "Neuen Agenten erstellen") : "Alle Agenten"}</Text>
            </View>
            <TouchableOpacity accessibilityLabel="Verwaltung schließen" accessibilityRole="button" onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={accentAlpha("amber", 0.7)} />
            </TouchableOpacity>
          </View>

          {mode === "list" ? (
            <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {agents.map((agent) => (
                <View key={agent.id} style={[styles.card, agent.id === activeAgentId && styles.cardActive]}>
                  <TouchableOpacity
                    accessibilityLabel={`Chat mit ${agent.name} öffnen`}
                    accessibilityRole="button"
                    activeOpacity={0.85}
                    onPress={() => {
                      onSelect(agent);
                      onClose();
                    }}
                    style={styles.cardMain}
                  >
                    <View style={[styles.cardDot, { backgroundColor: agent.color }]} />
                    <View style={styles.agentMeta}>
                      <View style={styles.cardTitleRow}>
                        <Text style={styles.cardName} numberOfLines={1}>
                          {agent.name}
                        </Text>
                        {agent.isDefault ? <Text style={styles.defaultBadge}>STANDARD</Text> : null}
                        {agent.status !== "aktiv" ? <Text style={styles.rowHint}>{SUPER_AGENT_STATUS_LABELS[agent.status].toUpperCase()}</Text> : null}
                      </View>
                      {agent.purpose ? (
                        <Text style={styles.agentPurpose} numberOfLines={2}>
                          {agent.purpose}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.cardActions}>
                    <TouchableOpacity disabled={busy} onPress={() => void toggleArchive(agent)} style={styles.actionBtn}>
                      <Text style={styles.actionBtnText}>{agent.status === "archiviert" ? "Aktivieren" : "Archivieren"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={busy} onPress={() => startEdit(agent)} style={styles.actionBtn}>
                      <Text style={styles.actionBtnText}>Bearbeiten</Text>
                    </TouchableOpacity>
                    {!agent.isDefault ? (
                      <TouchableOpacity disabled={busy} onPress={() => void confirmRemove(agent)} style={[styles.actionBtn, armedRemoveId === agent.id && styles.actionBtnDanger]}>
                        <Text style={[styles.actionBtnText, armedRemoveId === agent.id && styles.actionBtnTextDanger]}>
                          {armedRemoveId === agent.id ? "Wirklich?" : "Löschen"}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))}
              <TouchableOpacity accessibilityLabel="Neuen Agenten erstellen" accessibilityRole="button" disabled={busy} onPress={startCreate} style={styles.createBtn}>
                <Ionicons name="add" size={15} color={glassPalette.green} />
                <Text style={styles.createBtnText}>Neuen Agenten erstellen</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput
                autoCapitalize="sentences"
                onChangeText={setName}
                placeholder="z. B. Nova"
                placeholderTextColor={glassSurface.textMuted}
                style={styles.input}
                value={name}
              />
              <Text style={styles.fieldLabel}>AUFGABE / ZIEL</Text>
              <TextInput
                autoCapitalize="sentences"
                multiline
                onChangeText={setPurpose}
                placeholder="Wofür ist dieser Superagent zuständig?"
                placeholderTextColor={glassSurface.textMuted}
                style={[styles.input, styles.inputMultiline]}
                value={purpose}
              />
              <Text style={styles.fieldLabel}>FARBE</Text>
              <View style={styles.colorRow}>
                {SUPER_AGENT_COLORS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    accessibilityLabel={`Farbe ${option} wählen`}
                    accessibilityRole="button"
                    onPress={() => setColor(option)}
                    style={[styles.colorDot, { backgroundColor: option }, color === option && styles.colorDotActive]}
                  />
                ))}
              </View>
              {error ? <Text style={styles.formError}>{error}</Text> : null}
              <View style={styles.formActions}>
                <TouchableOpacity disabled={busy} onPress={resetForm} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => void submitForm()} style={[styles.saveBtn, busy && styles.btnDisabled]}>
                  <Text style={styles.saveBtnText}>{busy ? "Speichere …" : editId != null ? "Änderungen speichern" : "Agenten erstellen"}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
          {mode === "list" && error ? <Text style={[styles.formError, styles.formErrorList]}>{error}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  switcherWrap: { marginBottom: 10, position: "relative", zIndex: 30 },
  dot: { borderRadius: 5, height: 10, width: 10 },
  bar: { alignItems: "center", backgroundColor: glassOverlay.dark, borderColor: glassSurface.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  barName: { color: glassPalette.amber, flexShrink: 1, fontFamily: "monospace", fontSize: 12.5, fontWeight: "800" },
  barHint: { color: accentAlpha("amber", 0.7), fontFamily: "monospace", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  barSpacer: { flex: 1 },
  barCount: { color: accentAlpha("amber", 0.7), fontFamily: "monospace", fontSize: 11, fontWeight: "900" },
  dropdown: { backgroundColor: glassDepth.abyss, borderColor: glassSurface.border, borderRadius: 14, borderWidth: 1, left: 0, paddingHorizontal: 10, paddingVertical: 10, position: "absolute", right: 0, top: 44 },
  dropdownLabel: { color: glassSurface.textMuted, fontFamily: "monospace", fontSize: 9, fontWeight: "900", letterSpacing: 0.8, marginBottom: 8 },
  emptyHint: { color: glassSurface.textMuted, fontFamily: "monospace", fontSize: 11, marginBottom: 6 },
  agentRow: { alignItems: "center", borderRadius: 10, flexDirection: "row", gap: 9, paddingVertical: 8 },
  agentRowActive: { backgroundColor: accentAlpha("amber", 0.08) },
  agentMeta: { flex: 1, gap: 1 },
  agentName: { color: glassSurface.textPrimary, fontFamily: "monospace", fontSize: 12.5, fontWeight: "800" },
  agentPurpose: { color: glassSurface.textMuted, fontFamily: "monospace", fontSize: 10.5, lineHeight: 14 },
  rowHint: { color: accentAlpha("amber", 0.7), fontFamily: "monospace", fontSize: 8.5, fontWeight: "900", letterSpacing: 0.5 },
  dropdownAction: { alignItems: "center", borderTopColor: glassSurface.border, borderTopWidth: 1, flexDirection: "row", gap: 8, marginTop: 6, paddingTop: 10 },
  dropdownActionText: { color: glassSurface.textSecondary, fontFamily: "monospace", fontSize: 11.5, fontWeight: "800" },
  backdrop: { backgroundColor: glassDepth.glass, flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: glassDepth.void, borderColor: glassSurface.borderStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, maxHeight: "88%" },
  handle: { alignSelf: "center", backgroundColor: glassSurface.borderStrong, borderRadius: 99, height: 4, marginTop: 9, width: 44 },
  sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  eyebrow: { color: accentAlpha("amber", 0.7), fontFamily: "monospace", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  sheetTitle: { color: glassPalette.amber, fontFamily: "monospace", fontSize: 16, fontWeight: "900", marginTop: 3 },
  closeBtn: { alignItems: "center", borderColor: glassSurface.borderStrong, borderRadius: 12, borderWidth: 1, height: 34, justifyContent: "center", width: 34 },
  sheetContent: { paddingBottom: 26, paddingHorizontal: 16 },
  card: { backgroundColor: glassOverlay.dark, borderColor: glassSurface.borderStrong, borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 12 },
  cardActive: { borderColor: accentAlpha("amber", 0.45) },
  cardMain: { alignItems: "center", flexDirection: "row", gap: 10 },
  cardDot: { borderRadius: 7, height: 14, width: 14 },
  cardTitleRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  cardName: { color: glassSurface.textPrimary, flexShrink: 1, fontFamily: "monospace", fontSize: 13, fontWeight: "800" },
  defaultBadge: { backgroundColor: accentAlpha("amber", 0.14), color: glassPalette.amber, fontFamily: "monospace", fontSize: 8, fontWeight: "900", letterSpacing: 0.6, paddingHorizontal: 5, paddingVertical: 1 },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: { alignItems: "center", backgroundColor: glassDepth.void, borderColor: glassSurface.borderStrong, borderRadius: 9, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  actionBtnDanger: { borderColor: accentAlpha("red", 0.55) },
  actionBtnText: { color: glassSurface.textSecondary, fontFamily: "monospace", fontSize: 10.5, fontWeight: "800" },
  actionBtnTextDanger: { color: glassPalette.red },
  createBtn: { alignItems: "center", borderColor: accentAlpha("green", 0.4), borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, justifyContent: "center", paddingVertical: 12 },
  createBtnText: { color: glassPalette.green, fontFamily: "monospace", fontSize: 12, fontWeight: "900" },
  fieldLabel: { color: glassSurface.textMuted, fontFamily: "monospace", fontSize: 9.5, fontWeight: "900", letterSpacing: 0.8, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: glassOverlay.dark, borderColor: glassSurface.borderStrong, borderRadius: 10, borderWidth: 1, color: glassSurface.textPrimary, fontFamily: "monospace", fontSize: 13, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10 },
  inputMultiline: { minHeight: 84, textAlignVertical: "top" },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  colorDot: { borderRadius: 12, height: 24, width: 24 },
  colorDotActive: { borderWidth: 2, borderColor: glassPalette.amber },
  formError: { color: glassPalette.red, fontFamily: "monospace", fontSize: 11, lineHeight: 16, marginTop: 10 },
  formErrorList: { marginBottom: 14, marginHorizontal: 16 },
  formActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelBtn: { alignItems: "center", borderColor: glassSurface.borderStrong, borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 46 },
  cancelBtnText: { color: glassSurface.textSecondary, fontFamily: "monospace", fontSize: 12.5, fontWeight: "800" },
  saveBtn: { alignItems: "center", backgroundColor: glassPalette.amber, borderRadius: 12, flex: 1.25, justifyContent: "center", minHeight: 46 },
  saveBtnText: { color: glassDepth.void, fontFamily: "monospace", fontSize: 12.5, fontWeight: "900" },
  btnDisabled: { opacity: 0.55 },
});
