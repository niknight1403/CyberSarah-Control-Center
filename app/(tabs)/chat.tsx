import { StatusBadge, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { StudioErrorBoundary } from "@/components/studio/studio-error-boundary";
import { loadDevelopmentChatHistory, parseDevelopmentChatHistory, saveDevelopmentChatHistory, serializeDevelopmentChatHistory, type DevelopmentChatHistoryMessage } from "@/lib/development-chat-history";
import type { AgentProposal } from "@/lib/remote-workspace-client";
import { getProviderLabel, getProviderStatusCopy, type ProviderActivity } from "@/lib/provider-status-logic";
import { useMediaPicker } from "@/hooks/use-media-picker";
import type { MediaAttachment } from "@/lib/media-picker";
import { formatProjectContext, readProjectContext } from "@/lib/project-upload-reader";
import { RepositoryConnectCard } from "@/components/studio/repository-connect-card";
import { useStudioSettings } from "@/lib/studio-settings";
import { useWorkspace } from "@/lib/workspace-context";
import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_CONNECTOR_PREFERENCES, enabledConnectorCount, normalizeConnectorPreferences, CONNECTOR_PREFERENCE_STORAGE_KEY, toggleConnector, type ConnectorId, type ConnectorPreferences } from "@/lib/connector-preferences-logic";
import { DEFAULT_SKILL_PREFERENCES, enabledSkillCount, normalizeSkillPreferences, SKILL_PREFERENCE_STORAGE_KEY, toggleSkill, type SkillId, type SkillPreferences } from "@/lib/skill-preferences-logic";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type ChatMessage = DevelopmentChatHistoryMessage & { proposal?: AgentProposal };
type ChatAttachment = MediaAttachment;
type ConnectorTestStatus = "idle" | "testing" | "success" | "error";
type ConnectorTestState = { status: ConnectorTestStatus; message?: string };
type InnerTab = "chat" | "github" | "skills";

const initialMessages: ChatMessage[] = [{ id: "agent-intro", role: "agent", content: "Beschreibe eine Aenderung, ein Problem oder ein Refactoring." }];

export default function ChatScreen() {
  const { loadRemoteFiles, selectedFile } = useWorkspace();
  const { attachRepository, loadRepositoryDetails, loadWorkspaceHealth, requestDevelopmentProposal, settings } = useStudioSettings();
  const [activeTab, setActiveTab] = useState<InnerTab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [providerActivity, setProviderActivity] = useState<ProviderActivity>("idle");
  const [lastProviderUsed, setLastProviderUsed] = useState(settings.provider);
  const [chatError, setChatError] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showRepositoryCard, setShowRepositoryCard] = useState(false);
  const [skillPreferences, setSkillPreferences] = useState<SkillPreferences>(DEFAULT_SKILL_PREFERENCES);
  const [connectorPreferences, setConnectorPreferences] = useState<ConnectorPreferences>(DEFAULT_CONNECTOR_PREFERENCES);
  const [connectorTests, setConnectorTests] = useState<Record<ConnectorId, ConnectorTestState>>({ workspace: { status: "idle" }, github: { status: "idle" }, provider: { status: "idle" } });
  const { busy: mediaPickerBusy, pickFiles: pickFilesFromDevice, pickPhotos, pickVideos } = useMediaPicker();
  const chatWorkspaceId = settings.workspaceId;
  const providerLabel = getProviderLabel(settings.provider);
  const providerStatus = getProviderStatusCopy(settings.provider, providerActivity, lastProviderUsed);
  const readyForChat = Boolean(settings.workspaceId) && (settings.provider === "managed" || settings.hasProviderKey);
  const contextLabel = useMemo(() => selectedFile.name + " - " + settings.branch, [selectedFile.name, settings.branch]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(CONNECTOR_PREFERENCE_STORAGE_KEY).then((stored) => {
      if (!active || !stored) return;
      try { setConnectorPreferences(normalizeConnectorPreferences(JSON.parse(stored))); } catch { setConnectorPreferences(DEFAULT_CONNECTOR_PREFERENCES); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(SKILL_PREFERENCE_STORAGE_KEY).then((stored) => {
      if (!active || !stored) return;
      try { setSkillPreferences(normalizeSkillPreferences(JSON.parse(stored))); } catch { setSkillPreferences(DEFAULT_SKILL_PREFERENCES); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!chatWorkspaceId) return;
    let active = true;
    void loadDevelopmentChatHistory(settings.protectChatContent, chatWorkspaceId).then((raw) => {
      if (!active) return;
      const parsed = parseDevelopmentChatHistory(raw);
      if (parsed.length) setMessages(parsed);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [chatWorkspaceId]);

  const updateConnectorPreference = (connector: ConnectorId) => {
    setConnectorPreferences((current) => {
      const next = toggleConnector(current, connector);
      void AsyncStorage.setItem(CONNECTOR_PREFERENCE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const updateSkillPreference = (skill: SkillId) => {
    setSkillPreferences((current) => {
      const next = toggleSkill(current, skill);
      void AsyncStorage.setItem(SKILL_PREFERENCE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const testConnector = async (connector: ConnectorId) => {
    setConnectorTests((c) => ({ ...c, [connector]: { status: "testing", message: "Pruefung laeuft ..." } }));
    try {
      if (connector === "workspace") await loadWorkspaceHealth();
      else if (connector === "github") {
        if (!settings.workspaceId) throw new Error("Kein Repository verbunden.");
        await loadRepositoryDetails();
      } else {
        if (!readyForChat) throw new Error("KI-Provider nicht konfiguriert.");
        await requestDevelopmentProposal({ prompt: "Verbindungstest: Antworte nur mit OK." });
      }
      setConnectorTests((c) => ({ ...c, [connector]: { status: "success", message: "Verbindung bestaetigt" } }));
    } catch {
      setConnectorTests((c) => ({ ...c, [connector]: { status: "error", message: "Verbindung fehlgeschlagen" } }));
    }
  };

  const sendMessage = async () => {
    const text = prompt.trim();
    if (!text || isThinking || !readyForChat) return;
    setPrompt("");
    setShowAttachMenu(false);
    setChatError("");
    const userMsg: ChatMessage = { id: "user-" + Date.now(), role: "user", content: text };
    const thinkingMsg: ChatMessage = { id: "thinking-" + Date.now(), role: "agent", content: "Analyse wird vorbereitet ..." };
    setMessages((cur) => [...cur, userMsg, thinkingMsg]);
    setIsThinking(true);
    setProviderActivity("requesting");
    setLastProviderUsed(settings.provider);
    try {
      const fileContext = attachments.length ? formatProjectContext((await readProjectContext(attachments)).files) : "";
      const result = await requestDevelopmentProposal({ prompt: fileContext ? text + "\n\n" + fileContext : text });
      setProviderActivity("idle");
      const agentMsg: ChatMessage = { id: "agent-" + Date.now(), role: "agent", content: result.summary, state: "ready", proposal: result };
      setMessages((cur) => {
        const next = [...cur.filter((m) => !m.id.startsWith("thinking-")), agentMsg];
        void saveDevelopmentChatHistory(serializeDevelopmentChatHistory(next), settings.protectChatContent, chatWorkspaceId).catch(() => undefined);
        return next;
      });
      setAttachments([]);
    } catch (error) {
      setProviderActivity("idle");
      setMessages((cur) => cur.filter((m) => !m.id.startsWith("thinking-")));
      setChatError(error instanceof Error ? error.message : "Anfrage fehlgeschlagen.");
    } finally {
      setIsThinking(false);
    }
  };

  const statusColor = (st: ConnectorTestStatus) => st === "success" ? "#6FE0A7" : st === "error" ? "#FF9AA4" : st === "testing" ? "#52D8FF" : "#8294A8";
  const statusIcon = (st: ConnectorTestStatus) => st === "success" ? "OK" : st === "error" ? "X" : st === "testing" ? "..." : "O";

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <StudioErrorBoundary section="Chat">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.flex}>
          <StudioHeader eyebrow="CYBERSARAH" title="Entwicklungs-Chat" />
          <View style={s.tabBar}>
            {(["chat", "github", "skills"] as InnerTab[]).map((tab) => (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[s.tab, activeTab === tab && s.tabActive]}>
                <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
                  {tab === "chat" ? "Chat" : tab === "github" ? "GitHub" : "Skills"}
                </Text>
                {tab === "github" && settings.hasGitHubToken && <View style={s.dot} />}
                {tab === "skills" && <Text style={s.badge}>{enabledSkillCount(skillPreferences) + enabledConnectorCount(connectorPreferences)}</Text>}
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === "chat" && (
            <FlatList
              contentContainerStyle={s.content}
              data={messages}
              keyExtractor={(m) => m.id}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={<>
                <View style={[s.statusCard, readyForChat ? s.statusReady : s.statusWarn]}>
                  <View style={s.statusCopy}>
                    <Text style={s.statusTitle}>{readyForChat ? "Chat bereit" : "Verbindung fehlt"}</Text>
                    <Text style={s.statusText}>{readyForChat ? contextLabel + " - " + providerLabel : "Repository und Workspace in Einstellungen konfigurieren."}</Text>
                  </View>
                  <StatusBadge label={readyForChat ? "Bereit" : "Fehlt"} tone={readyForChat ? "ready" : "warning"} />
                </View>
                {showRepositoryCard && (
                  <RepositoryConnectCard
                    onClose={() => setShowRepositoryCard(false)}
                    onConnect={(input) => attachRepository({ workspaceUrl: settings.workspaceUrl, repositoryUrl: input.repositoryUrl, branch: input.branch, provider: settings.provider, localProviderEndpoints: settings.localProviderEndpoints, protectChatContent: settings.protectChatContent })
                      .then((result) => { loadRemoteFiles(result.files); setMessages((cur) => [...cur, { id: "repo-" + Date.now(), role: "agent", content: "Repository verbunden. " + result.files.length + " Dateien bereit." }]); return result; })}
                  />
                )}
                <View style={s.chips}>
                  {["CyberSarah-revenue-os verbinden", "Analysiere die Architektur", "Verbessere die mobile UX"].map((t) => (
                    <TouchableOpacity key={t} onPress={() => { setPrompt(t); if (t.startsWith("Cyber")) setShowRepositoryCard(true); }} style={s.chip}>
                      <Text style={s.chipText}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>}
              renderItem={({ item: msg }) => (
                <View style={[s.bubble, msg.role === "user" ? s.bubbleUser : s.bubbleAgent]}>
                  <Text style={s.bubbleRole}>{msg.role === "user" ? "DU" : "SARAH"}</Text>
                  <Text style={[s.bubbleText, msg.id.startsWith("thinking-") && s.bubbleThinking]}>
                    {msg.id.startsWith("thinking-") ? "Analyse wird vorbereitet ..." : msg.content}
                  </Text>
                </View>
              )}
              ListFooterComponent={<>
                {chatError ? <Text style={s.error}>{chatError}</Text> : null}
                <View style={s.composer}>
                  <View style={s.toolbar}>
                    <TouchableOpacity disabled={mediaPickerBusy} onPress={() => setShowAttachMenu((v) => !v)} style={s.plusBtn}>
                      {mediaPickerBusy ? <ActivityIndicator color="#52D8FF" size="small" /> : <Text style={s.plusTxt}>+</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setActiveTab("github")} style={s.ghBtn}>
                      <Text style={s.ghTxt}>GitHub{settings.hasGitHubToken ? " OK" : ""}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setActiveTab("skills")} style={s.skBtn}>
                      <Text style={s.skTxt}>Skills {enabledSkillCount(skillPreferences)}</Text>
                    </TouchableOpacity>
                  </View>
                  {showAttachMenu && (
                    <View style={s.attachMenu}>
                      {[{k:"datei",l:"Datei"},{k:"foto",l:"Foto"},{k:"video",l:"Video"}].map(({k,l}) => (
                        <TouchableOpacity key={k} disabled={mediaPickerBusy} onPress={() => { void (k === "datei" ? pickFilesFromDevice() : k === "foto" ? pickPhotos() : pickVideos()).then((f: ChatAttachment[]) => setAttachments((a) => [...a, ...f].slice(-6))); setShowAttachMenu(false); }} style={s.attachOpt}>
                          <Text style={s.attachOptTxt}>{l}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {attachments.length > 0 && (
                    <View style={s.attachList}>
                      {attachments.map((a) => (
                        <View key={a.id} style={s.attachChip}>
                          <Text style={s.attachChipTxt} numberOfLines={1}>{a.name}</Text>
                          <TouchableOpacity onPress={() => setAttachments((cur) => cur.filter((x) => x.id !== a.id))}>
                            <Text style={s.removeTxt}>x</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  <Text style={s.composerLabel}>NAECHSTER AUFTRAG</Text>
                  <TextInput autoCapitalize="sentences" multiline onChangeText={setPrompt} placeholder="Aenderung beschreiben ..." placeholderTextColor="#5A6A7E" style={s.input} value={prompt} />
                  <TouchableOpacity disabled={!prompt.trim() || isThinking || !readyForChat} onPress={() => void sendMessage()} style={[s.sendBtn, (!prompt.trim() || isThinking || !readyForChat) && s.sendBtnDisabled]}>
                    {isThinking ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.sendTxt}>Senden</Text>}
                  </TouchableOpacity>
                </View>
              </>}
            />
          )}

          {activeTab === "github" && (
            <ScrollView contentContainerStyle={s.content}>
              <StudioSection label="Connectoren" title="GitHub und Workspace" />
              {([
                { id: "github" as ConnectorId, label: "GitHub", detail: settings.hasGitHubToken ? "Token hinterlegt" : "Kein Token" },
                { id: "workspace" as ConnectorId, label: "Workspace-Service", detail: settings.hasServiceAccessToken ? "Token hinterlegt" : "Nicht konfiguriert" },
                { id: "provider" as ConnectorId, label: "KI-Provider", detail: providerLabel },
              ]).map(({ id, label, detail }) => (
                <View key={id} style={s.connCard}>
                  <View style={s.connRow}>
                    <View style={s.connInfo}>
                      <Text style={s.connName}>{label}</Text>
                      <Text style={s.connDetail}>{detail}</Text>
                    </View>
                    <StatusBadge label={connectorPreferences[id] ? "Aktiv" : "Inaktiv"} tone={connectorPreferences[id] ? "ready" : "warning"} />
                  </View>
                  <View style={s.connActions}>
                    <TouchableOpacity onPress={() => void testConnector(id)} disabled={connectorTests[id].status === "testing"} style={s.testBtn}>
                      <Text style={{ color: statusColor(connectorTests[id].status) }}>{statusIcon(connectorTests[id].status)}</Text>
                      <Text style={s.testBtnTxt}>{connectorTests[id].status === "testing" ? "Pruefe ..." : "Testen"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => updateConnectorPreference(id)} style={[s.toggle, connectorPreferences[id] && s.toggleOn]}>
                      <View style={[s.knob, connectorPreferences[id] && s.knobOn]} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => router.push("/settings")} style={s.mgBtn}>
                      <Text style={s.mgBtnTxt}>Settings</Text>
                    </TouchableOpacity>
                  </View>
                  {connectorTests[id].message && <Text style={[s.testResult, { color: statusColor(connectorTests[id].status) }]}>{connectorTests[id].message}</Text>}
                </View>
              ))}
            </ScrollView>
          )}

          {activeTab === "skills" && (
            <ScrollView contentContainerStyle={s.content}>
              <StudioSection label="Skills" title={enabledSkillCount(skillPreferences) + " aktiv"} />
              <View style={s.connCard}>
                {([
                  { id: "agent" as SkillId, label: "Agent-Vorschlaege", detail: "KI erstellt reviewbare Code-Vorschlaege" },
                  { id: "diff" as SkillId, label: "Code-Diff-Pruefung", detail: "Vergleicht Aenderungen vor dem Commit" },
                  { id: "quality" as SkillId, label: "CI-Qualitaetspruefung", detail: "Prueft Build- und Teststatus" },
                ] as const).map(({ id, label, detail }) => (
                  <View key={id} style={s.skillRow}>
                    <View style={s.connInfo}>
                      <Text style={s.connName}>{label}</Text>
                      <Text style={s.connDetail}>{detail}</Text>
                    </View>
                    <TouchableOpacity onPress={() => updateSkillPreference(id)} style={[s.toggle, skillPreferences[id] && s.toggleOn]}>
                      <View style={[s.knob, skillPreferences[id] && s.knobOn]} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              <TouchableOpacity onPress={() => router.push("/settings")} style={s.settingsLink}>
                <Text style={s.settingsLinkTxt}>Alle Einstellungen oeffnen</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </StudioErrorBoundary>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 32 },
  tabBar: { backgroundColor: "#0D1520", borderRadius: 14, flexDirection: "row", marginBottom: 12, padding: 4 },
  tab: { alignItems: "center", borderRadius: 10, flex: 1, flexDirection: "row", gap: 5, justifyContent: "center", paddingVertical: 9 },
  tabActive: { backgroundColor: "#162232" },
  tabText: { color: "#6B7D90", fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: "#52D8FF" },
  dot: { backgroundColor: "#6FE0A7", borderRadius: 4, height: 6, width: 6 },
  badge: { backgroundColor: "#1E3A4A", borderRadius: 8, color: "#52D8FF", fontSize: 9, fontWeight: "900", paddingHorizontal: 5, paddingVertical: 1 },
  statusCard: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, marginBottom: 12, padding: 12 },
  statusReady: { backgroundColor: "#0F1E2E", borderColor: "#2B3E55" },
  statusWarn: { backgroundColor: "#1A1508", borderColor: "#5C4A1E" },
  statusCopy: { flex: 1 },
  statusTitle: { color: "#DDE8F4", fontSize: 13, fontWeight: "800" },
  statusText: { color: "#8294A8", fontSize: 11, lineHeight: 16, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
  chip: { backgroundColor: "#131F2E", borderColor: "#2B3E55", borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: "#9FBDD4", fontSize: 12, fontWeight: "700" },
  bubble: { borderRadius: 14, marginBottom: 10, padding: 12 },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: "#1A2E45", borderColor: "#2B4060", borderWidth: 1, maxWidth: "88%" },
  bubbleAgent: { alignSelf: "flex-start", backgroundColor: "#101A26", borderColor: "#243347", borderWidth: 1, maxWidth: "88%" },
  bubbleRole: { color: "#52D8FF", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 5 },
  bubbleText: { color: "#DDE8F4", fontSize: 13, lineHeight: 20 },
  bubbleThinking: { color: "#8294A8", fontStyle: "italic" },
  error: { color: "#FF9AA4", fontSize: 11, lineHeight: 16, marginBottom: 8 },
  composer: { backgroundColor: "#101A26", borderColor: "#2B3E55", borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 14 },
  toolbar: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 10 },
  plusBtn: { alignItems: "center", backgroundColor: "#1A2E45", borderColor: "#2B4060", borderRadius: 10, borderWidth: 1, height: 38, justifyContent: "center", width: 38 },
  plusTxt: { color: "#52D8FF", fontSize: 22, fontWeight: "300" },
  ghBtn: { alignItems: "center", backgroundColor: "#1A2433", borderColor: "#2B3C52", borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: "center", paddingVertical: 8 },
  ghTxt: { color: "#9FBDD4", fontSize: 12, fontWeight: "700" },
  skBtn: { alignItems: "center", backgroundColor: "#1A1E2E", borderColor: "#3B3A6A", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  skTxt: { color: "#B9B2FF", fontSize: 12, fontWeight: "700" },
  attachMenu: { backgroundColor: "#0D1520", borderColor: "#243347", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, marginBottom: 10, padding: 10 },
  attachOpt: { alignItems: "center", backgroundColor: "#131F2E", borderColor: "#2B3E55", borderRadius: 9, borderWidth: 1, flex: 1, paddingVertical: 9 },
  attachOptTxt: { color: "#9FBDD4", fontSize: 12, fontWeight: "700" },
  attachList: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  attachChip: { alignItems: "center", backgroundColor: "#131F2E", borderColor: "#2B3E55", borderRadius: 9, borderWidth: 1, flexDirection: "row", gap: 6, maxWidth: 160, paddingHorizontal: 9, paddingVertical: 5 },
  attachChipTxt: { color: "#9FBDD4", flex: 1, fontSize: 11, fontWeight: "700" },
  removeTxt: { color: "#FF9AA4", fontSize: 16, fontWeight: "700" },
  composerLabel: { color: "#7B90A8", fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 7 },
  input: { color: "#EEF4FC", fontSize: 14, lineHeight: 20, maxHeight: 120, minHeight: 60 },
  sendBtn: { alignItems: "center", backgroundColor: "#16728B", borderColor: "#52D8FF", borderRadius: 11, borderWidth: 1, justifyContent: "center", marginTop: 10, minHeight: 44 },
  sendBtnDisabled: { opacity: 0.4 },
  sendTxt: { color: "#ECFBFF", fontSize: 13, fontWeight: "800" },
  connCard: { backgroundColor: "#0F161F", borderColor: "#243347", borderRadius: 16, borderWidth: 1, marginBottom: 14, padding: 14 },
  connRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  connInfo: { flex: 1, marginRight: 10 },
  connName: { color: "#DDE8F4", fontSize: 13, fontWeight: "800" },
  connDetail: { color: "#8294A8", fontSize: 11, marginTop: 2 },
  connActions: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 4 },
  testBtn: { alignItems: "center", backgroundColor: "#131F2E", borderColor: "#2B3E55", borderRadius: 10, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", paddingVertical: 9 },
  testBtnTxt: { color: "#9FBDD4", fontSize: 12, fontWeight: "700" },
  toggle: { backgroundColor: "#1A2433", borderRadius: 12, height: 24, justifyContent: "center", paddingHorizontal: 2, width: 44 },
  toggleOn: { backgroundColor: "#16728B" },
  knob: { backgroundColor: "#4A6070", borderRadius: 10, height: 20, width: 20 },
  knobOn: { backgroundColor: "#ECFBFF", marginLeft: 20 },
  mgBtn: { alignItems: "center", backgroundColor: "#1A2433", borderColor: "#2B3C52", borderRadius: 10, borderWidth: 1, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 9 },
  mgBtnTxt: { color: "#9FBDD4", fontSize: 11, fontWeight: "700" },
  testResult: { fontSize: 11, lineHeight: 16, marginTop: 8 },
  skillRow: { alignItems: "center", borderTopColor: "#1E2B3B", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  settingsLink: { alignItems: "center", marginTop: 8, paddingVertical: 12 },
  settingsLinkTxt: { color: "#52D8FF", fontSize: 13, fontWeight: "700" },
});
