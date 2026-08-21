import { PrimaryButton, StatusBadge, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { clearDevelopmentChatHistory, loadDevelopmentChatHistory, parseDevelopmentChatHistory, saveDevelopmentChatHistory, serializeDevelopmentChatHistory, type DevelopmentChatHistoryMessage } from "@/lib/development-chat-history";
import type { AgentProposal } from "@/lib/remote-workspace-client";
import { useStudioSettings } from "@/lib/studio-settings";
import { useWorkspace } from "@/lib/workspace-context";
import { useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type ChatMessage = DevelopmentChatHistoryMessage & { proposal?: AgentProposal };

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
  const hasRepository = Boolean(settings.workspaceId);
  const providerLabel = settings.provider === "managed" ? "On-Server" : settings.provider === "together" ? "Together AI" : settings.provider[0].toUpperCase() + settings.provider.slice(1);
  const readyForChat = hasRepository && (settings.provider === "managed" || settings.hasProviderKey);
  const contextLabel = useMemo(() => `${selectedFile.name} · ${settings.branch}`, [selectedFile.name, settings.branch]);

  useEffect(() => {
    loadDevelopmentChatHistory(settings.protectChatContent)
      .then((raw) => {
        const restored = parseDevelopmentChatHistory(raw);
        if (restored.length) setMessages(restored);
      })
      .catch(() => setChatError("Der lokale Chat-Verlauf konnte nicht wiederhergestellt werden."))
      .finally(() => setHistoryLoaded(true));
  }, [settings.protectChatContent]);

  useEffect(() => {
    if (!historyLoaded) return;
    void saveDevelopmentChatHistory(serializeDevelopmentChatHistory(messages), settings.protectChatContent).catch(() => setChatError("Der lokale Chat-Verlauf konnte nicht gespeichert werden."));
  }, [historyLoaded, messages, settings.protectChatContent]);

  const submitPrompt = async () => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt || !readyForChat || isThinking) return;
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: normalizedPrompt }]);
    setPrompt("");
    setChatError("");
    setIsThinking(true);
    try {
      const proposal = await requestDevelopmentProposal({ prompt: normalizedPrompt, activeFile: selectedFile.remote ? selectedFile.path : undefined });
      const content = proposal.changes.length ? `${proposal.summary}\n\n${proposal.rationale}\n\n${proposal.changes.length} Datei(en) zur Überprüfung bereit.` : `${proposal.summary}\n\n${proposal.rationale}`;
      setMessages((current) => [...current, {
        id: `proposal-${Date.now()}`,
        role: "agent",
        content,
        proposal,
        proposalPreview: { affectedFiles: proposal.affectedFiles, changes: proposal.changes.map(({ path, explanation }) => ({ path, explanation })) },
        state: "ready",
      }]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Der Entwicklungsauftrag konnte nicht verarbeitet werden.");
    } finally {
      setIsThinking(false);
    }
  };

  const applyProposal = async (messageId: string, proposal: AgentProposal) => {
    if (!proposal.changes.length) return;
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, state: "applying" } : message));
    setChatError("");
    try {
      await syncRemoteChanges(proposal.changes.map(({ path, content }) => ({ path, content })));
      const syncedIds: string[] = [];
      proposal.changes.forEach((change) => {
        const file = files.find((entry) => entry.path === change.path);
        if (!file) return;
        updateFile(file.id, change.content);
        syncedIds.push(file.id);
      });
      if (syncedIds.length) markFilesSynced(syncedIds);
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, state: "applied", content: `${message.content}\n\nDie vorgeschlagenen Dateien wurden in den Remote-Workspace übernommen. Prüfe sie im Workspace und committe sie anschließend gezielt.` } : message));
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, state: "error" } : message));
      setChatError(error instanceof Error ? error.message : "Die vorgeschlagenen Änderungen konnten nicht übernommen werden.");
    }
  };

  const clearHistory = async () => {
    await clearDevelopmentChatHistory().catch(() => setChatError("Der lokale Chat-Verlauf konnte nicht gelöscht werden."));
    setMessages(initialMessages);
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <FlatList
          contentContainerStyle={styles.content}
          data={messages}
          keyExtractor={(message) => message.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<>
            <StudioHeader eyebrow="KI-ENTWICKLUNGSFLUSS" title="Agent" />
            <View style={[styles.readinessCard, readyForChat ? styles.readinessReady : styles.readinessWaiting]}><View style={styles.readinessIcon}><IconSymbol name="sparkles" size={17} color={readyForChat ? "#B9B2FF" : "#F6BA5E"} /></View><View style={styles.readinessCopy}><Text style={styles.readinessTitle}>{readyForChat ? "Entwicklungs-Chat bereit" : "Verbindung für den Agenten fehlt"}</Text><Text style={styles.readinessText}>{readyForChat ? `Projektkontext aus ${contextLabel} · ${providerLabel}` : hasRepository ? "Hinterlege für das gewählte KI-Profil einen Schlüssel oder nutze ein konfiguriertes On-Server-Profil." : "Verbinde zuerst ein Repository und einen Workspace-Service in den Einstellungen."}</Text></View></View>
            <View style={styles.contextRow}><View style={styles.contextChip}><IconSymbol name="doc.text.fill" size={14} color="#8B7CFF" /><Text numberOfLines={1} style={styles.contextText}>{contextLabel}</Text></View><StatusBadge label={readyForChat ? "Kontrolliert" : "Offline"} tone={readyForChat ? "accent" : "warning"} /></View>
            <View style={styles.historyRow}><Text style={styles.historyText}>{historyLoaded ? settings.protectChatContent ? "Geschützt gespeichert · verschlüsselt auf diesem Gerät" : "Lokal gesichert · ohne Tokens und Dateiinhalte" : "Verlauf wird wiederhergestellt …"}</Text><TouchableOpacity accessibilityRole="button" activeOpacity={0.75} onPress={() => void clearHistory()} style={styles.clearHistoryButton}><Text style={styles.clearHistoryText}>Verlauf löschen</Text></TouchableOpacity></View>
            <StudioSection label="Konversation" title="Reviewbarer Projektkontext" />
          </>}
          ListFooterComponent={<View style={styles.composerCard}><Text style={styles.composerLabel}>NÄCHSTER ENTWICKLUNGSAUFTRAG</Text><TextInput accessibilityLabel="Entwicklungsauftrag für den Agenten" editable={readyForChat && !isThinking} multiline onChangeText={setPrompt} placeholder="Beschreibe eine Änderung, einen Fehler oder ein Refactoring …" placeholderTextColor="#708095" style={styles.composerInput} textAlignVertical="top" value={prompt} /><PrimaryButton icon="arrow.up.circle.fill" label={isThinking ? "Agent analysiert …" : "Vorschlag erstellen"} onPress={() => void submitPrompt()} disabled={!prompt.trim() || !readyForChat || isThinking} /><Text style={styles.composerHint}>Der Agent erzeugt nur einen überprüfbaren Vorschlag. Er commitet oder pusht niemals selbstständig.</Text>{chatError ? <Text style={styles.chatError}>{chatError}</Text> : null}</View>}
          renderItem={({ item }) => {
            const isUser = item.role === "user";
            return <View style={[styles.messageRow, isUser && styles.userMessageRow]}>{!isUser ? <View style={styles.agentAvatar}><IconSymbol name="sparkles" size={16} color="#B9B2FF" /></View> : null}<View style={[styles.messageBubble, isUser ? styles.userBubble : styles.agentBubble]}><Text style={[styles.messageRole, isUser && styles.userMessageRole]}>{isUser ? "DU" : item.proposal ? "ÄNDERUNGSVORSCHLAG" : "AGENT"}</Text><Text style={styles.messageText}>{item.content}</Text>{item.proposalPreview?.changes.length ? <View style={styles.changeList}>{item.proposalPreview.changes.map((change) => <View key={change.path} style={styles.changeRow}><IconSymbol name="doc.text.fill" size={13} color="#8B7CFF" /><View style={styles.changeCopy}><Text style={styles.changePath}>{change.path}</Text><Text numberOfLines={2} style={styles.changeExplanation}>{change.explanation}</Text></View></View>)}</View> : null}{item.proposal?.changes.length && item.state !== "applied" ? <TouchableOpacity accessibilityRole="button" activeOpacity={0.75} disabled={item.state === "applying"} onPress={() => void applyProposal(item.id, item.proposal!)} style={[styles.applyButton, item.state === "applying" && styles.applyButtonDisabled]}><Text style={styles.applyText}>{item.state === "applying" ? "Übernimmt …" : item.state === "error" ? "Erneut übernehmen" : "Vorschlag übernehmen"}</Text><IconSymbol name="arrow.right" size={14} color="#DFF7FF" /></TouchableOpacity> : null}{item.state === "applied" ? <Text style={styles.appliedText}>Übernommen · Commit und Push bleiben in deiner Kontrolle.</Text> : null}{item.state === "restored" && item.proposalPreview?.changes.length ? <Text style={styles.restoredText}>Nach Neustart wiederhergestellt · bitte Auftrag erneut senden, bevor Dateien übernommen werden.</Text> : null}</View></View>;
          }}
          showsVerticalScrollIndicator={false}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, content: { paddingBottom: 20 },
  readinessCard: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, marginBottom: 13, padding: 12 }, readinessReady: { backgroundColor: "#181A2F", borderColor: "#4D477A" }, readinessWaiting: { backgroundColor: "#211D16", borderColor: "#6A542A" }, readinessIcon: { alignItems: "center", backgroundColor: "#25233E", borderRadius: 11, height: 35, justifyContent: "center", width: 35 }, readinessCopy: { flex: 1 }, readinessTitle: { color: "#EDF4FC", fontSize: 13, fontWeight: "900", marginBottom: 3 }, readinessText: { color: "#9CAABD", fontSize: 11, lineHeight: 16 },
  contextRow: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between", marginBottom: 25 }, contextChip: { alignItems: "center", backgroundColor: "#171C29", borderColor: "#2A3449", borderRadius: 999, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, maxWidth: 220, paddingHorizontal: 11, paddingVertical: 8 }, contextText: { color: "#C9D4E2", flexShrink: 1, fontSize: 12, fontWeight: "700" }, historyRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 15, marginTop: -12 }, historyText: { color: "#8294A9", flex: 1, fontSize: 10, lineHeight: 14, marginRight: 8 }, clearHistoryButton: { borderColor: "#3A4659", borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6 }, clearHistoryText: { color: "#AAB8C8", fontSize: 10, fontWeight: "800" },
  messageRow: { alignItems: "flex-start", flexDirection: "row", gap: 9, marginBottom: 13 }, userMessageRow: { justifyContent: "flex-end" }, agentAvatar: { alignItems: "center", backgroundColor: "#25233E", borderRadius: 13, height: 27, justifyContent: "center", marginTop: 4, width: 27 }, messageBubble: { borderRadius: 17, maxWidth: "84%", paddingHorizontal: 14, paddingVertical: 12 }, agentBubble: { backgroundColor: "#151C29", borderTopLeftRadius: 5 }, userBubble: { backgroundColor: "#20354A", borderTopRightRadius: 5 }, messageRole: { color: "#B9B2FF", fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 5 }, userMessageRole: { color: "#78DCF7" }, messageText: { color: "#E5ECF5", fontSize: 14, lineHeight: 20 },
  changeList: { borderTopColor: "#2A3548", borderTopWidth: 1, marginTop: 11, paddingTop: 4 }, changeRow: { flexDirection: "row", gap: 7, marginTop: 9 }, changeCopy: { flex: 1 }, changePath: { color: "#C9C0FF", fontFamily: "monospace", fontSize: 11, fontWeight: "800" }, changeExplanation: { color: "#9DACBD", fontSize: 11, lineHeight: 16, marginTop: 2 }, applyButton: { alignItems: "center", backgroundColor: "#206275", borderColor: "#52D8FF", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 5, justifyContent: "center", marginTop: 13, paddingVertical: 10 }, applyButtonDisabled: { opacity: 0.55 }, applyText: { color: "#E6FAFF", fontSize: 12, fontWeight: "900" }, appliedText: { color: "#78DFA8", fontSize: 11, fontWeight: "800", marginTop: 12 }, restoredText: { color: "#F2C979", fontSize: 11, lineHeight: 16, marginTop: 12 },
  composerCard: { backgroundColor: "#121823", borderColor: "#2B3850", borderRadius: 20, borderWidth: 1, marginTop: 16, padding: 15 }, composerLabel: { color: "#75859B", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 9 }, composerInput: { color: "#EEF4FC", fontSize: 14, lineHeight: 20, maxHeight: 120, minHeight: 88, padding: 0 }, composerHint: { color: "#8293A8", fontSize: 11, lineHeight: 16, marginTop: 10 }, chatError: { color: "#FF9AA4", fontSize: 11, lineHeight: 16, marginTop: 9 },
});
