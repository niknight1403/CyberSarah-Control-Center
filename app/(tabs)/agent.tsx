import { PrimaryButton, StatusBadge, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { StudioErrorBoundary } from "@/components/studio/studio-error-boundary";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { clearDevelopmentChatHistory, loadDevelopmentChatHistory, parseDevelopmentChatHistory, saveDevelopmentChatHistory, serializeDevelopmentChatHistory, type DevelopmentChatHistoryMessage } from "@/lib/development-chat-history";
import { captureProposalSnapshots, getSelectedProposalChanges, type ProposalFileSnapshot } from "@/lib/proposal-application-logic";
import type { AgentProposal } from "@/lib/remote-workspace-client";
import { exportEncryptedSupportBackup, isValidSupportBackupPassword } from "@/lib/support-backup";
import { getSupportShareConfirmation } from "@/lib/support-backup-logic";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useStudioSettings } from "@/lib/studio-settings";
import { useWorkspace } from "@/lib/workspace-context";
import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SKILL_PREFERENCES, enabledSkillCount, normalizeSkillPreferences, SKILL_PREFERENCE_STORAGE_KEY, toggleSkill, type SkillId, type SkillPreferences } from "@/lib/skill-preferences-logic";
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type ChatMessage = DevelopmentChatHistoryMessage & { proposal?: AgentProposal };
type ChatAttachment = { id: string; name: string; uri: string; kind: "datei" | "foto" | "video"; mimeType?: string };

const attachmentKinds: Array<{ kind: ChatAttachment["kind"]; label: string; icon: "doc.text.fill" | "photo" | "video.fill" }> = [
  { kind: "datei", label: "Datei", icon: "doc.text.fill" },
  { kind: "foto", label: "Foto", icon: "photo" },
  { kind: "video", label: "Video", icon: "video.fill" },
];

const initialMessages: ChatMessage[] = [{
  id: "agent-intro",
  role: "agent",
  content: "Beschreibe eine Änderung, ein Problem oder ein Refactoring. Der Agent analysiert den verbundenen Workspace, erstellt einen begrenzten Änderungsvorschlag und überträgt Dateien erst nach deiner expliziten Freigabe.",
}];

export default function AgentScreen() {
  const { files, markFilesSynced, selectedFile, updateFile } = useWorkspace();
  const { requestDevelopmentProposal, settings, syncRemoteChanges } = useStudioSettings();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [chatError, setChatError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupPasswordRepeat, setBackupPasswordRepeat] = useState("");
  const [backupState, setBackupState] = useState<"idle" | "exporting" | "shared" | "error">("idle");
  const [backupMessage, setBackupMessage] = useState("");
  const [backupIntegrityVerified, setBackupIntegrityVerified] = useState(false);
  const [backupPreview, setBackupPreview] = useState<{ messageCount: number; excerpts: string[] } | null>(null);
  const [selectedProposalPaths, setSelectedProposalPaths] = useState<Record<string, string[]>>({});
  const [appliedSnapshots, setAppliedSnapshots] = useState<Record<string, ProposalFileSnapshot[]>>({});
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [skillPreferences, setSkillPreferences] = useState<SkillPreferences>(DEFAULT_SKILL_PREFERENCES);
  const hasRepository = Boolean(settings.workspaceId);
  const chatWorkspaceId = settings.workspaceId;
  const providerLabel = settings.provider === "managed" ? "On-Server" : settings.provider === "together" ? "Together AI" : settings.provider[0].toUpperCase() + settings.provider.slice(1);
  const readyForChat = hasRepository && (settings.provider === "managed" || settings.hasProviderKey);
  const contextLabel = useMemo(() => `${selectedFile.name} · ${settings.branch}`, [selectedFile.name, settings.branch]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(SKILL_PREFERENCE_STORAGE_KEY).then((stored) => {
      if (!active || !stored) return;
      try { setSkillPreferences(normalizeSkillPreferences(JSON.parse(stored))); } catch { setSkillPreferences(DEFAULT_SKILL_PREFERENCES); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const updateSkillPreference = (skill: SkillId) => {
    setSkillPreferences((current) => {
      const next = toggleSkill(current, skill);
      void AsyncStorage.setItem(SKILL_PREFERENCE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    setHistoryLoaded(false);
    setMessages(initialMessages);
    loadDevelopmentChatHistory(settings.protectChatContent, chatWorkspaceId)
      .then((raw) => {
        const restored = parseDevelopmentChatHistory(raw);
        if (active && restored.length) setMessages(restored);
      })
      .catch(() => active && setChatError("Der lokale Chat-Verlauf konnte nicht wiederhergestellt werden."))
      .finally(() => active && setHistoryLoaded(true));
    return () => { active = false; };
  }, [chatWorkspaceId, settings.protectChatContent]);

  useEffect(() => {
    if (!historyLoaded) return;
    void saveDevelopmentChatHistory(serializeDevelopmentChatHistory(messages), settings.protectChatContent, chatWorkspaceId).catch(() => setChatError("Der lokale Chat-Verlauf konnte nicht gespeichert werden."));
  }, [chatWorkspaceId, historyLoaded, messages, settings.protectChatContent]);

  const submitPrompt = async () => {
    const normalizedPrompt = prompt.trim();
    if ((!normalizedPrompt && attachments.length === 0) || !readyForChat || isThinking) return;
    const attachmentSummary = attachments.length ? `\n\nAnhänge: ${attachments.map((attachment) => `${attachment.kind} „${attachment.name}“`).join(", ")}` : "";
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: `${normalizedPrompt || "Bitte prüfe diese Anhänge."}${attachmentSummary}` }]);
    setPrompt("");
    setAttachments([]);
    setChatError("");
    setIsThinking(true);
    try {
      const enabledSkills = [skillPreferences.agent ? "Agent-Vorschläge" : "", skillPreferences.diff ? "Code-Diff-Prüfung" : "", skillPreferences.quality ? "CI-Qualitätsprüfung" : ""].filter(Boolean).join(", ");
      const contextualPrompt = enabledSkills ? `${normalizedPrompt}\n\nAktive Skills: ${enabledSkills}` : normalizedPrompt;
      const proposal = await requestDevelopmentProposal({ prompt: contextualPrompt, activeFile: selectedFile.remote ? selectedFile.path : undefined });
      const content = proposal.changes.length ? `${proposal.summary}\n\n${proposal.rationale}\n\n${proposal.changes.length} Datei(en) zur Überprüfung bereit.` : `${proposal.summary}\n\n${proposal.rationale}`;
      const proposalMessageId = `proposal-${Date.now()}`;
      setMessages((current) => [...current, {
        id: proposalMessageId,
        role: "agent",
        content,
        proposal,
        proposalPreview: { affectedFiles: proposal.affectedFiles, changes: proposal.changes.map(({ path, explanation }) => ({ path, explanation })) },
        state: "ready",
      }]);
      setSelectedProposalPaths((current) => ({ ...current, [proposalMessageId]: proposal.changes.map((change) => change.path) }));
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Der Entwicklungsauftrag konnte nicht verarbeitet werden.");
    } finally {
      setIsThinking(false);
    }
  };

  const toggleProposalFile = (messageId: string, path: string) => {
    setSelectedProposalPaths((current) => {
      const selected = current[messageId] ?? [];
      return { ...current, [messageId]: selected.includes(path) ? selected.filter((item) => item !== path) : [...selected, path] };
    });
  };

  const applyProposal = async (messageId: string, proposal: AgentProposal) => {
    const selectedChanges = getSelectedProposalChanges(proposal.changes, selectedProposalPaths[messageId] ?? proposal.changes.map((change) => change.path));
    if (!selectedChanges.length) return;
    const snapshots = captureProposalSnapshots(files, selectedChanges);
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, state: "applying" } : message));
    setChatError("");
    try {
      await syncRemoteChanges(selectedChanges.map(({ path, content }) => ({ path, content })));
      const syncedIds: string[] = [];
      selectedChanges.forEach((change) => {
        const file = files.find((entry) => entry.path === change.path);
        if (!file) return;
        updateFile(file.id, change.content);
        syncedIds.push(file.id);
      });
      if (syncedIds.length) markFilesSynced(syncedIds);
      setAppliedSnapshots((current) => ({ ...current, [messageId]: snapshots }));
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, state: "applied", content: `${message.content}\n\n${selectedChanges.length} ausgewählte Datei(en) wurden in den Remote-Workspace übernommen. Prüfe sie im Workspace und committe sie anschließend gezielt.` } : message));
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, state: "error" } : message));
      setChatError(error instanceof Error ? error.message : "Die vorgeschlagenen Änderungen konnten nicht übernommen werden.");
    }
  };

  const undoProposal = async (messageId: string) => {
    const snapshots = appliedSnapshots[messageId] ?? [];
    if (!snapshots.length) return;
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, state: "reverting" } : message));
    setChatError("");
    try {
      await syncRemoteChanges(snapshots.map(({ path, content }) => ({ path, content })));
      snapshots.forEach((snapshot) => updateFile(snapshot.id, snapshot.content));
      markFilesSynced(snapshots.map((snapshot) => snapshot.id));
      setAppliedSnapshots((current) => { const next = { ...current }; delete next[messageId]; return next; });
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, state: "reverted", content: `${message.content}\n\nDie vorherigen Datei-Inhalte wurden aus dem lokalen Snapshot wiederhergestellt.` } : message));
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, state: "applied" } : message));
      setChatError(error instanceof Error ? error.message : "Die Wiederherstellung der vorherigen Datei-Inhalte ist fehlgeschlagen.");
    }
  };

  const addAttachments = (next: ChatAttachment[]) => {
    setAttachments((current) => [...current, ...next].slice(-6));
  };

  const pickFiles = async () => {
    setShowAttachMenu(false);
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
    if (!result.canceled) addAttachments(result.assets.map((asset) => ({ id: `${asset.uri}-${asset.name}`, name: asset.name, uri: asset.uri, kind: "datei", mimeType: asset.mimeType })));
  };

  const pickMedia = async (kind: "foto" | "video") => {
    setShowAttachMenu(false);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: kind === "foto" ? ["images"] : ["videos"], allowsMultipleSelection: true, quality: 0.8 });
    if (!result.canceled) addAttachments(result.assets.map((asset) => ({ id: `${asset.assetId ?? asset.uri}-${asset.fileName ?? kind}`, name: asset.fileName ?? (kind === "foto" ? "Foto" : "Video"), uri: asset.uri, kind, mimeType: asset.mimeType })));
  };

  const removeAttachment = (id: string) => setAttachments((current) => current.filter((attachment) => attachment.id !== id));

  const clearHistory = async () => {
    await clearDevelopmentChatHistory(chatWorkspaceId).catch(() => setChatError("Der lokale Chat-Verlauf konnte nicht gelöscht werden."));
    setMessages(initialMessages);
  };

  const exportBackup = async () => {
    if (!historyLoaded || !isValidSupportBackupPassword(backupPassword) || backupPassword !== backupPasswordRepeat) return;
    setBackupState("exporting");
    setBackupMessage("");
    try {
      const history = serializeDevelopmentChatHistory(messages);
      const result = await exportEncryptedSupportBackup(history, backupPassword);
      setBackupPassword("");
      setBackupPasswordRepeat("");
      setBackupState("shared");
      setBackupIntegrityVerified(result.verification.valid);
      setBackupPreview(result.preview);
      setBackupMessage(`${result.filename} wurde verschlüsselt erzeugt, auf Integrität geprüft und an das System-Menü übergeben.`);
    } catch (error) {
      setBackupState("error");
      setBackupIntegrityVerified(false);
      setBackupPreview(null);
      setBackupMessage(error instanceof Error ? error.message : "Das verschlüsselte Support-Backup konnte nicht erstellt werden.");
    }
  };

  const confirmBackupExport = () => {
    if (!historyLoaded || !isValidSupportBackupPassword(backupPassword) || backupPassword !== backupPasswordRepeat || backupState === "exporting") return;
    const confirmation = getSupportShareConfirmation();
    Alert.alert(confirmation.title, confirmation.message, [
      { text: "Abbrechen", style: "cancel" },
      { text: "Für Support freigeben", onPress: () => void exportBackup() },
    ], { cancelable: true });
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <StudioErrorBoundary section="Agent"><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <FlatList
          contentContainerStyle={styles.content}
          data={messages}
          keyExtractor={(message) => message.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<>
            <StudioHeader eyebrow="KI-ENTWICKLUNGSFLUSS" title="Agent" />
            <View style={[styles.readinessCard, readyForChat ? styles.readinessReady : styles.readinessWaiting]}><View style={styles.readinessIcon}><IconSymbol name="sparkles" size={17} color={readyForChat ? "#B9B2FF" : "#F6BA5E"} /></View><View style={styles.readinessCopy}><Text style={styles.readinessTitle}>{readyForChat ? "Entwicklungs-Chat bereit" : "Verbindung für den Agenten fehlt"}</Text><Text style={styles.readinessText}>{readyForChat ? `Projektkontext aus ${contextLabel} · ${providerLabel}` : hasRepository ? "Hinterlege für das gewählte KI-Profil einen Schlüssel oder nutze ein konfiguriertes On-Server-Profil." : "Verbinde zuerst ein Repository und einen Workspace-Service in den Einstellungen."}</Text></View></View>
            <View style={styles.contextRow}><View style={styles.contextChip}><IconSymbol name="doc.text.fill" size={14} color="#8B7CFF" /><Text numberOfLines={1} style={styles.contextText}>{contextLabel}</Text></View><StatusBadge label={readyForChat ? "Kontrolliert" : "Offline"} tone={readyForChat ? "accent" : "warning"} /></View>
            <View style={styles.historyRow}><Text style={styles.historyText}>{historyLoaded ? settings.protectChatContent ? "Geschützt gespeichert · verschlüsselt und repository-spezifisch" : "Lokal gesichert · repository-spezifisch, ohne Tokens und Dateiinhalte" : "Verlauf wird wiederhergestellt …"}</Text><TouchableOpacity accessibilityRole="button" activeOpacity={0.75} onPress={() => void clearHistory()} style={styles.clearHistoryButton}><Text style={styles.clearHistoryText}>Verlauf löschen</Text></TouchableOpacity></View>
            <StudioSection label="Konversation" title="Reviewbarer Projektkontext" />
          </>}
          ListFooterComponent={<><View style={styles.composerCard}><View style={styles.composerToolbar}><TouchableOpacity accessibilityLabel="Anhänge hinzufügen" accessibilityRole="button" activeOpacity={0.75} onPress={() => { setShowAttachMenu((current) => !current); setShowToolsMenu(false); }} style={styles.plusButton}><Text style={styles.plusButtonText}>＋</Text><Text style={styles.toolbarButtonText}>Anhängen</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="Skills und Connectoren öffnen" accessibilityRole="button" activeOpacity={0.75} onPress={() => { setShowToolsMenu((current) => !current); setShowAttachMenu(false); }} style={styles.toolsButton}><Text style={styles.toolsButtonText}>✦ Skills & Connectoren</Text></TouchableOpacity></View>{showAttachMenu ? <View style={styles.attachMenu}>{attachmentKinds.map(({ kind, label }) => <TouchableOpacity accessibilityRole="button" key={kind} onPress={() => kind === "datei" ? void pickFiles() : void pickMedia(kind)} style={styles.attachOption}><Text style={styles.attachOptionIcon}>{kind === "datei" ? "＋" : kind === "foto" ? "▧" : "▶"}</Text><Text style={styles.attachOptionText}>{label} auswählen</Text></TouchableOpacity>)}</View> : null}{showToolsMenu ? <View style={styles.toolsMenu}><Text style={styles.toolsMenuLabel}>SKILLS & CONNECTOREN · {enabledSkillCount(skillPreferences)} AKTIV</Text><View style={styles.toolStatusRow}><Text style={styles.toolName}>Agent-Vorschläge</Text><TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: skillPreferences.agent }} onPress={() => updateSkillPreference("agent")} style={[styles.skillToggle, skillPreferences.agent && styles.skillToggleOn]}><View style={[styles.skillToggleKnob, skillPreferences.agent && styles.skillToggleKnobOn]} /></TouchableOpacity></View><View style={styles.toolStatusRow}><Text style={styles.toolName}>Code-Diff-Prüfung</Text><TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: skillPreferences.diff }} onPress={() => updateSkillPreference("diff")} style={[styles.skillToggle, skillPreferences.diff && styles.skillToggleOn]}><View style={[styles.skillToggleKnob, skillPreferences.diff && styles.skillToggleKnobOn]} /></TouchableOpacity></View><View style={styles.toolStatusRow}><Text style={styles.toolName}>CI-Qualitätsprüfung</Text><TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: skillPreferences.quality }} onPress={() => updateSkillPreference("quality")} style={[styles.skillToggle, skillPreferences.quality && styles.skillToggleOn]}><View style={[styles.skillToggleKnob, skillPreferences.quality && styles.skillToggleKnobOn]} /></TouchableOpacity></View><View style={styles.toolStatusRow}><Text style={styles.toolName}>GitHub-Connector</Text><Text style={settings.hasGitHubToken ? styles.toolStatusActive : styles.toolStatusMuted}>{settings.hasGitHubToken ? "VERBUNDEN" : "NICHT VERBUNDEN"}</Text></View><Text style={styles.toolsHint}>Connectoren nutzen die sichere Konfiguration aus den Einstellungen. Tokens werden hier nie angezeigt.</Text></View> : null}{attachments.length ? <View style={styles.attachmentList}>{attachments.map((attachment) => <View key={attachment.id} style={styles.attachmentChip}><Text numberOfLines={1} style={styles.attachmentName}>{attachment.kind} · {attachment.name}</Text><TouchableOpacity accessibilityLabel={`${attachment.name} entfernen`} accessibilityRole="button" onPress={() => removeAttachment(attachment.id)} style={styles.removeAttachment}><Text style={styles.removeAttachmentText}>×</Text></TouchableOpacity></View>)}</View> : null}<Text style={styles.composerLabel}>NÄCHSTER ENTWICKLUNGSAUFTRAG</Text><TextInput accessibilityLabel="Entwicklungsauftrag für den Agenten" editable={readyForChat && !isThinking} multiline onChangeText={setPrompt} placeholder="Beschreibe eine Änderung, einen Fehler oder ein Refactoring …" placeholderTextColor="#708095" style={styles.composerInput} textAlignVertical="top" value={prompt} /><PrimaryButton icon="arrow.up.circle.fill" label={isThinking ? "Agent analysiert …" : "Vorschlag erstellen"} onPress={() => void submitPrompt()} disabled={(!prompt.trim() && attachments.length === 0) || !readyForChat || isThinking} /><Text style={styles.composerHint}>Der Agent erzeugt nur einen überprüfbaren Vorschlag. Er commitet oder pusht niemals selbstständig.</Text>{chatError ? <Text style={styles.chatError}>{chatError}</Text> : null}</View><View style={styles.backupCard}><View style={styles.backupTitleRow}><IconSymbol name="lock.fill" size={16} color="#F2C979" /><Text style={styles.backupTitle}>VERSCHLÜSSELTES SUPPORT-BACKUP</Text></View><Text style={styles.backupHint}>Erzeugt eine passwortgeschützte Datei mit dem begrenzten Chat-Verlauf. Zugangsdaten und vollständige Datei-Inhalte sind ausgeschlossen. Das Passwort wird nicht gespeichert.</Text><TextInput accessibilityLabel="Passwort für verschlüsseltes Support-Backup" autoCapitalize="none" onChangeText={setBackupPassword} placeholder="Mindestens 12 Zeichen" placeholderTextColor="#708095" secureTextEntry style={styles.backupInput} value={backupPassword} /><TextInput accessibilityLabel="Passwort für verschlüsseltes Support-Backup wiederholen" autoCapitalize="none" onChangeText={setBackupPasswordRepeat} placeholder="Passwort wiederholen" placeholderTextColor="#708095" secureTextEntry style={styles.backupInput} value={backupPasswordRepeat} /><PrimaryButton icon="square.and.arrow.up" label={backupState === "exporting" ? "Backup wird verschlüsselt …" : "Freigabe prüfen und teilen"} onPress={confirmBackupExport} disabled={backupState === "exporting" || !historyLoaded || !isValidSupportBackupPassword(backupPassword) || backupPassword !== backupPasswordRepeat} />{backupMessage ? <Text style={backupState === "shared" ? styles.backupSuccess : styles.backupError}>{backupMessage}</Text> : null}{backupIntegrityVerified && backupPreview ? <View style={styles.backupVerification}><Text style={styles.backupVerificationTitle}>Integrität bestätigt · Wiederherstellungsvorschau</Text><Text style={styles.backupVerificationText}>{backupPreview.messageCount} Chat-Nachricht(en) im Backup; es werden nur die letzten zwei Ausschnitte angezeigt.</Text>{backupPreview.excerpts.map((excerpt, index) => <Text key={`${index}-${excerpt}`} numberOfLines={2} style={styles.backupPreviewExcerpt}>„{excerpt}“</Text>)}</View> : null}</View></>}
          renderItem={({ item }) => {
            const isUser = item.role === "user";
            const selectedPaths = selectedProposalPaths[item.id] ?? item.proposal?.changes.map((change) => change.path) ?? [];
            const canSelect = Boolean(item.proposal) && item.state !== "applying" && item.state !== "reverting" && item.state !== "applied";
            return <View style={[styles.messageRow, isUser && styles.userMessageRow]}>{!isUser ? <View style={styles.agentAvatar}><IconSymbol name="sparkles" size={16} color="#B9B2FF" /></View> : null}<View style={[styles.messageBubble, isUser ? styles.userBubble : styles.agentBubble]}><Text style={[styles.messageRole, isUser && styles.userMessageRole]}>{isUser ? "DU" : item.proposal ? "ÄNDERUNGSVORSCHLAG" : "AGENT"}</Text><Text style={styles.messageText}>{item.content}</Text>{item.proposalPreview?.changes.length ? <View style={styles.changeList}>{item.proposal ? <Text style={styles.selectionHint}>Wähle die Dateien, die übernommen werden dürfen.</Text> : null}{item.proposalPreview.changes.map((change) => { const selected = selectedPaths.includes(change.path); return <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: !canSelect }} activeOpacity={0.75} disabled={!canSelect} key={change.path} onPress={() => toggleProposalFile(item.id, change.path)} style={[styles.changeRow, selected && styles.changeRowSelected]}><View style={[styles.changeSelection, selected && styles.changeSelectionSelected]}>{selected ? <Text style={styles.changeSelectionMark}>✓</Text> : null}</View><View style={styles.changeCopy}><Text style={styles.changePath}>{change.path}</Text><Text numberOfLines={2} style={styles.changeExplanation}>{change.explanation}</Text></View></TouchableOpacity>; })}</View> : null}{item.proposal?.changes.length && item.state !== "applied" && item.state !== "reverting" ? <TouchableOpacity accessibilityRole="button" activeOpacity={0.75} disabled={item.state === "applying" || !selectedPaths.length} onPress={() => void applyProposal(item.id, item.proposal!)} style={[styles.applyButton, (item.state === "applying" || !selectedPaths.length) && styles.applyButtonDisabled]}><Text style={styles.applyText}>{item.state === "applying" ? "Übernimmt …" : item.state === "error" || item.state === "reverted" ? "Auswahl erneut übernehmen" : `${selectedPaths.length} Datei(en) übernehmen`}</Text><IconSymbol name="arrow.right" size={14} color="#DFF7FF" /></TouchableOpacity> : null}{item.state === "applied" ? <><Text style={styles.appliedText}>Übernommen · Commit und Push bleiben in deiner Kontrolle.</Text><TouchableOpacity accessibilityRole="button" activeOpacity={0.75} disabled={!appliedSnapshots[item.id]} onPress={() => void undoProposal(item.id)} style={[styles.undoButton, !appliedSnapshots[item.id] && styles.applyButtonDisabled]}><Text style={styles.undoText}>Rückgängig</Text></TouchableOpacity></> : null}{item.state === "reverting" ? <Text style={styles.restoredText}>Vorherige Inhalte werden wiederhergestellt …</Text> : null}{item.state === "reverted" ? <Text style={styles.restoredText}>Rückgängig gemacht · die ursprünglichen Datei-Inhalte sind wieder im Remote-Workspace.</Text> : null}{item.state === "restored" && item.proposalPreview?.changes.length ? <Text style={styles.restoredText}>Nach Neustart wiederhergestellt · bitte Auftrag erneut senden, bevor Dateien übernommen werden.</Text> : null}</View></View>;
          }}
          showsVerticalScrollIndicator={false}
        />
      </KeyboardAvoidingView></StudioErrorBoundary>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, content: { paddingBottom: 20 },
  readinessCard: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, marginBottom: 13, padding: 12 }, readinessReady: { backgroundColor: "#181A2F", borderColor: "#4D477A" }, readinessWaiting: { backgroundColor: "#211D16", borderColor: "#6A542A" }, readinessIcon: { alignItems: "center", backgroundColor: "#25233E", borderRadius: 11, height: 35, justifyContent: "center", width: 35 }, readinessCopy: { flex: 1 }, readinessTitle: { color: "#EDF4FC", fontSize: 13, fontWeight: "900", marginBottom: 3 }, readinessText: { color: "#9CAABD", fontSize: 11, lineHeight: 16 },
  contextRow: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between", marginBottom: 25 }, contextChip: { alignItems: "center", backgroundColor: "#171C29", borderColor: "#2A3449", borderRadius: 999, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, maxWidth: 220, paddingHorizontal: 11, paddingVertical: 8 }, contextText: { color: "#C9D4E2", flexShrink: 1, fontSize: 12, fontWeight: "700" }, historyRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 15, marginTop: -12 }, historyText: { color: "#8294A9", flex: 1, fontSize: 10, lineHeight: 14, marginRight: 8 }, clearHistoryButton: { alignItems: "center", borderColor: "#3A4659", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 8 }, clearHistoryText: { color: "#AAB8C8", fontSize: 10, fontWeight: "800" },
  messageRow: { alignItems: "flex-start", flexDirection: "row", gap: 9, marginBottom: 13 }, userMessageRow: { justifyContent: "flex-end" }, agentAvatar: { alignItems: "center", backgroundColor: "#25233E", borderRadius: 13, height: 27, justifyContent: "center", marginTop: 4, width: 27 }, messageBubble: { borderRadius: 17, maxWidth: "84%", paddingHorizontal: 14, paddingVertical: 12 }, agentBubble: { backgroundColor: "#151C29", borderTopLeftRadius: 5 }, userBubble: { backgroundColor: "#20354A", borderTopRightRadius: 5 }, messageRole: { color: "#B9B2FF", fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 5 }, userMessageRole: { color: "#78DCF7" }, messageText: { color: "#E5ECF5", fontSize: 14, lineHeight: 20 },
  changeList: { borderTopColor: "#2A3548", borderTopWidth: 1, marginTop: 11, paddingTop: 4 }, selectionHint: { color: "#9DACBD", fontSize: 10, lineHeight: 15, marginTop: 7 }, changeRow: { alignItems: "center", borderRadius: 9, flexDirection: "row", gap: 8, marginTop: 7, minHeight: 44, paddingHorizontal: 6, paddingVertical: 5 }, changeRowSelected: { backgroundColor: "#1B3142" }, changeSelection: { alignItems: "center", borderColor: "#63718A", borderRadius: 5, borderWidth: 1, height: 18, justifyContent: "center", width: 18 }, changeSelectionSelected: { backgroundColor: "#52D8FF", borderColor: "#52D8FF" }, changeSelectionMark: { color: "#071218", fontSize: 13, fontWeight: "900", lineHeight: 16 }, changeCopy: { flex: 1 }, changePath: { color: "#C9C0FF", fontFamily: "monospace", fontSize: 11, fontWeight: "800" }, changeExplanation: { color: "#9DACBD", fontSize: 11, lineHeight: 16, marginTop: 2 }, applyButton: { alignItems: "center", backgroundColor: "#206275", borderColor: "#52D8FF", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 5, justifyContent: "center", marginTop: 13, minHeight: 44, paddingVertical: 10 }, applyButtonDisabled: { opacity: 0.55 }, applyText: { color: "#E6FAFF", fontSize: 12, fontWeight: "900" }, undoButton: { alignItems: "center", borderColor: "#B49A5C", borderRadius: 10, borderWidth: 1, justifyContent: "center", marginTop: 8, minHeight: 44, paddingHorizontal: 12 }, undoText: { color: "#F2C979", fontSize: 12, fontWeight: "900" }, appliedText: { color: "#78DFA8", fontSize: 11, fontWeight: "800", marginTop: 12 }, restoredText: { color: "#F2C979", fontSize: 11, lineHeight: 16, marginTop: 12 },
  composerCard: { backgroundColor: "#121823", borderColor: "#2B3850", borderRadius: 20, borderWidth: 1, marginTop: 16, padding: 15 }, composerToolbar: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 12 }, plusButton: { alignItems: "center", borderColor: "#3D536B", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 4, justifyContent: "center", minHeight: 44, minWidth: 108, paddingHorizontal: 10 }, plusButtonText: { color: "#52D8FF", fontSize: 25, lineHeight: 28 }, toolbarButtonText: { color: "#C7D4E4", fontSize: 11, fontWeight: "800" }, toolsButton: { alignItems: "center", borderColor: "#493F70", borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 8 }, toolsButtonText: { color: "#C9BFFF", fontSize: 11, fontWeight: "800" }, attachMenu: { backgroundColor: "#0E151F", borderColor: "#33445B", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 7, marginBottom: 10, padding: 7 }, attachOption: { alignItems: "center", borderColor: "#2E4057", borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 58, paddingHorizontal: 5 }, attachOptionIcon: { color: "#52D8FF", fontSize: 20, marginBottom: 2 }, attachOptionText: { color: "#C9D6E5", fontSize: 10, fontWeight: "800", textAlign: "center" }, toolsMenu: { backgroundColor: "#111622", borderColor: "#493F70", borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 12 }, toolsMenuLabel: { color: "#9D91E8", fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 8 }, toolStatusRow: { alignItems: "center", borderBottomColor: "#2B3448", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 38 }, toolName: { color: "#D7E1EE", fontSize: 12, fontWeight: "700" }, toolStatusActive: { color: "#78DFA8", fontSize: 10, fontWeight: "900" }, skillToggle: { alignItems: "flex-start", backgroundColor: "#2A3548", borderColor: "#53627A", borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 30, padding: 3, width: 52 }, skillToggleOn: { alignItems: "flex-end", backgroundColor: "#1C6377", borderColor: "#52D8FF" }, skillToggleKnob: { backgroundColor: "#9EACBD", borderRadius: 11, height: 22, width: 22 }, skillToggleKnobOn: { backgroundColor: "#DFFAFF" }, toolStatusMuted: { color: "#8293A8", fontSize: 10, fontWeight: "900" }, toolsHint: { color: "#8798AD", fontSize: 10, lineHeight: 15, marginTop: 8 }, attachmentList: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }, attachmentChip: { alignItems: "center", backgroundColor: "#1B2B3C", borderColor: "#3A6A80", borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 4, maxWidth: "100%", minHeight: 32, paddingLeft: 10, paddingRight: 4 }, attachmentName: { color: "#BFEAF6", flexShrink: 1, fontSize: 10, fontWeight: "700" }, removeAttachment: { alignItems: "center", justifyContent: "center", minHeight: 28, minWidth: 28 }, removeAttachmentText: { color: "#9CB4C6", fontSize: 20, lineHeight: 22 }, composerLabel: { color: "#75859B", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 9 }, composerInput: { color: "#EEF4FC", fontSize: 14, lineHeight: 20, maxHeight: 120, minHeight: 88, padding: 0 }, composerHint: { color: "#8293A8", fontSize: 11, lineHeight: 16, marginTop: 10 }, chatError: { color: "#FF9AA4", fontSize: 11, lineHeight: 16, marginTop: 9 }, backupCard: { backgroundColor: "#191712", borderColor: "#62502D", borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 14 }, backupTitleRow: { alignItems: "center", flexDirection: "row", gap: 7, marginBottom: 7 }, backupTitle: { color: "#F2D48F", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 }, backupHint: { color: "#B5A987", fontSize: 11, lineHeight: 16, marginBottom: 11 }, backupInput: { backgroundColor: "#121823", borderColor: "#51442C", borderRadius: 10, borderWidth: 1, color: "#EDF4FC", fontSize: 13, marginBottom: 8, minHeight: 44, paddingHorizontal: 11 }, backupSuccess: { color: "#78DFA8", fontSize: 11, lineHeight: 16, marginTop: 9 }, backupError: { color: "#FF9AA4", fontSize: 11, lineHeight: 16, marginTop: 9 }, backupVerification: { borderTopColor: "#665632", borderTopWidth: 1, marginTop: 11, paddingTop: 10 }, backupVerificationTitle: { color: "#8DE3B6", fontSize: 11, fontWeight: "900", marginBottom: 4 }, backupVerificationText: { color: "#C4B993", fontSize: 10, lineHeight: 15 }, backupPreviewExcerpt: { color: "#E2D9C0", fontSize: 10, fontStyle: "italic", lineHeight: 15, marginTop: 6 },
});
