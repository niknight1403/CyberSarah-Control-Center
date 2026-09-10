import { StatusBadge, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { StudioErrorBoundary } from "@/components/studio/studio-error-boundary";
import { ChatBackground } from "@/components/chat/chat-background";
import { ChatComposer } from "@/components/chat/chat-composer";
import { MessageBubble } from "@/components/chat/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { loadDevelopmentChatHistory, parseDevelopmentChatHistory, saveDevelopmentChatHistory, serializeDevelopmentChatHistory, type DevelopmentChatHistoryMessage } from "@/lib/development-chat-history";
import { formatChatDay, shouldShowDayDivider, shouldShowTimestamp } from "@/lib/chat-presentation-logic";
import { serverHistoryToChatRows } from "@/lib/chat-history-logic";
import type { AgentProposal } from "@/lib/remote-workspace-client";
import { getProviderLabel } from "@/lib/provider-status-logic";
import { useMediaPicker } from "@/hooks/use-media-picker";
import type { MediaAttachment } from "@/lib/media-picker";
import { formatProjectContext, readProjectContext } from "@/lib/project-upload-reader";
import { RepositoryConnectCard } from "@/components/studio/repository-connect-card";
import { useStudioSettings } from "@/lib/studio-settings";
import { trpc } from "@/lib/trpc";
import { useAdminAutoRouter } from "@/lib/use-admin-auto-router";
import { useWorkspace } from "@/lib/workspace-context";
import { useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { rankProviders, type LatencySample, type ProviderScore } from "@/lib/provider-latency-logic";
import { DEFAULT_CONNECTOR_PREFERENCES, enabledConnectorCount, normalizeConnectorPreferences, CONNECTOR_PREFERENCE_STORAGE_KEY, toggleConnector, type ConnectorId, type ConnectorPreferences } from "@/lib/connector-preferences-logic";
import { DEFAULT_SKILL_PREFERENCES, enabledSkillCount, normalizeSkillPreferences, SKILL_PREFERENCE_STORAGE_KEY, toggleSkill, type SkillId, type SkillPreferences } from "@/lib/skill-preferences-logic";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, type ListRenderItemInfo } from "react-native";

type ChatMessage = DevelopmentChatHistoryMessage & { proposal?: AgentProposal; timestampMs?: number };
type ChatAttachment = MediaAttachment;
type ConnectorTestStatus = "idle" | "testing" | "success" | "error";
type ConnectorTestState = { status: ConnectorTestStatus; message?: string };
type InnerTab = "chat" | "github" | "skills";

const initialMessages: ChatMessage[] = [{ id: "agent-intro", role: "agent", content: "Willkommen im KI-Operations-Chat. Beschreibe eine Änderung, ein Problem oder ein Refactoring — ich kümmere mich darum." }];

export default function ChatScreen() {
  const { loadRemoteFiles, selectedFile } = useWorkspace();
  const { attachRepository, loadRepositoryDetails, loadWorkspaceHealth, settings } = useStudioSettings();
  const [activeTab, setActiveTab] = useState<InnerTab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [chatError, setChatError] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showRepositoryCard, setShowRepositoryCard] = useState(false);
  const [skillPreferences, setSkillPreferences] = useState<SkillPreferences>(DEFAULT_SKILL_PREFERENCES);
  const [connectorPreferences, setConnectorPreferences] = useState<ConnectorPreferences>(DEFAULT_CONNECTOR_PREFERENCES);
  const [latencyScores, setLatencyScores] = useState<ProviderScore[]>([]);
  const [connectorTests, setConnectorTests] = useState<Record<ConnectorId, ConnectorTestState>>({ workspace: { status: "idle" }, github: { status: "idle" }, provider: { status: "idle" } });
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const { busy: mediaPickerBusy, pickFiles: pickFilesFromDevice, pickPhotos, pickVideos } = useMediaPicker();
  const developmentChatMutation = trpc.developmentChat.send.useMutation();
  const chatWorkspaceId = settings.workspaceId;
  const providerLabel = getProviderLabel(settings.provider);
  const readyForChat = settings.provider === "managed" || settings.hasProviderKey;
  const contextLabel = useMemo(() => selectedFile.name + " · " + settings.branch, [selectedFile.name, settings.branch]);

  const requestDevelopmentChat = async (content: string) => {
    const conversation: { role: "user" | "assistant"; content: string }[] = messages
      .filter((message) => message.role === "user" || message.role === "agent")
      .slice(-10)
      .map((message) => ({ role: message.role === "agent" ? "assistant" as const : "user" as const, content: message.content }));
    const requestMessages: { role: "user" | "assistant"; content: string }[] = [...conversation, { role: "user" as const, content }].slice(-12);
    const request = developmentChatMutation.mutateAsync({ provider: settings.provider, messages: requestMessages });
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Die KI-Anfrage hat das Zeitlimit überschritten. Bitte Provider oder Verbindung prüfen.")), 65_000);
      request.finally(() => clearTimeout(timer)).catch(() => undefined);
    });
    return Promise.race([request, timeout]);
  };

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
  }, [chatWorkspaceId, settings.protectChatContent]);

  // Sprint 54: Serverseitig persistierte Historie (PostgreSQL) laden —
  // nur als Hydration, wenn lokal keine Konversation existiert.
  const serverHistoryQuery = trpc.developmentChat.history.useQuery(
    { limit: 100 },
    { retry: false },
  );
  useEffect(() => {
    const rows = serverHistoryQuery.data;
    if (!rows?.length) return;
    setMessages((current) => {
      if (current.some((message) => message.role === "user")) return current;
      return [...initialMessages, ...serverHistoryToChatRows(rows)];
    });
  }, [serverHistoryQuery.data]);

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
    setConnectorTests((c) => ({ ...c, [connector]: { status: "testing", message: "Prüfung läuft …" } }));
    const startMs = Date.now();
    try {
      if (connector === "workspace") await loadWorkspaceHealth();
      else if (connector === "github") {
        if (!settings.workspaceId) throw new Error("Kein Repository verbunden.");
        await loadRepositoryDetails();
      } else {
        if (!readyForChat) throw new Error("KI-Provider nicht konfiguriert.");
        await requestDevelopmentChat("Verbindungstest: Antworte nur mit OK.");
      }
      const endMs = Date.now();
      const sample: LatencySample = { providerId: connector, latencyMs: endMs - startMs, timestampMs: endMs };
      const scores = rankProviders([sample], { nowMs: endMs, maxSampleAgeMs: 300000, degradedThresholdMs: 2000 });
      setLatencyScores(scores);
      const score = scores.find((s) => s.providerId === connector);
      const rec = score ? " (" + score.recommendation + ", " + Math.round(sample.latencyMs) + "ms)" : "";
      setConnectorTests((c) => ({ ...c, [connector]: { status: "success", message: "Verbindung bestätigt" + rec } }));
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
    const sentAt = Date.now();
    const userMsg: ChatMessage = { id: "user-" + sentAt, role: "user", content: text, timestampMs: sentAt };
    const thinkingMsg: ChatMessage = { id: "thinking-" + sentAt, role: "agent", content: "Analyse wird vorbereitet …", timestampMs: sentAt };
    setMessages((cur) => [...cur, userMsg, thinkingMsg]);
    setIsThinking(true);
    try {
      const fileContext = attachments.length ? formatProjectContext((await readProjectContext(attachments)).files) : "";
      const result = await requestDevelopmentChat(fileContext ? text + "\n\n" + fileContext : text);
      const agentMsg: ChatMessage = { id: "agent-" + Date.now(), role: "agent", content: result.content + "\n\nAntwort von " + result.providerUsed + " · " + result.model, state: "ready", timestampMs: Date.now() };
      setMessages((cur) => {
        const next = [...cur.filter((m) => !m.id.startsWith("thinking-")), agentMsg];
        void saveDevelopmentChatHistory(serializeDevelopmentChatHistory(next), settings.protectChatContent, chatWorkspaceId).catch(() => undefined);
        return next;
      });
      setAttachments([]);
    } catch (error) {
      setMessages((cur) => cur.filter((m) => !m.id.startsWith("thinking-")));
      setChatError(error instanceof Error ? error.message : "Anfrage fehlgeschlagen.");
    } finally {
      setIsThinking(false);
    }
  };

  const statusColor = (st: ConnectorTestStatus) => st === "success" ? "#4ADE9C" : st === "error" ? "#FF8A96" : st === "testing" ? "#38E1FF" : "#8294A8";
  const statusIcon = (st: ConnectorTestStatus) => st === "success" ? "OK" : st === "error" ? "X" : st === "testing" ? "…" : "○";
  const canSend = Boolean(prompt.trim()) && !isThinking && readyForChat;

  const renderMessage = ({ item: msg, index }: ListRenderItemInfo<ChatMessage>) => {
    if (msg.id.startsWith("thinking-")) {
      return <TypingIndicator />;
    }
    const previous = messages[index - 1] ?? null;
    const showDay = shouldShowDayDivider(previous, msg);
    return (
      <>
        {showDay && msg.timestampMs != null ? (
          <View style={s.dayDividerRow}>
            <View style={s.dayDividerLine} />
            <Text style={s.dayDividerText}>{formatChatDay(msg.timestampMs, Date.now())}</Text>
            <View style={s.dayDividerLine} />
          </View>
        ) : null}
        <MessageBubble message={{ id: msg.id, role: msg.role, content: msg.content, timestampMs: msg.timestampMs }} showTimestamp={shouldShowTimestamp(previous, { role: msg.role, timestampMs: msg.timestampMs })} />
      </>
    );
  };

  return (
    <ScreenContainer className="px-4" edges={["top", "left", "right", "bottom"]}>
      <ChatBackground>
        <StudioErrorBoundary section="Chat">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.flex}>
            <StudioHeader eyebrow="CYBERSARAH · KI-OPERATIONS" title="Chat" />
            <View style={s.tabBar}>
              {([["chat", "chatbubbles", "Chat"], ["github", "logo-github", "GitHub"], ["skills", "sparkles", "Skills"]] as const).map(([tab, icon, label]) => (
                <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[s.tab, activeTab === tab && s.tabActive]}>
                  <Ionicons name={icon as never} size={14} color={activeTab === tab ? "#38E1FF" : "#6B7D90"} />
                  <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>{label}</Text>
                  {tab === "github" && settings.hasGitHubToken ? <View style={s.dot} /> : null}
                  {tab === "skills" ? <Text style={s.badge}>{enabledSkillCount(skillPreferences) + enabledConnectorCount(connectorPreferences)}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>

            {activeTab === "chat" && (
              <FlatList
                ref={listRef}
                contentContainerStyle={s.content}
                data={messages}
                keyExtractor={(m) => m.id}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                ListHeaderComponent={<>
                  <View style={[s.statusCard, readyForChat ? s.statusReady : s.statusWarn]}>
                    <View style={readyForChat ? s.statusGlow : s.statusGlowWarn} />
                    <View style={s.statusCopy}>
                      <Text style={s.statusTitle}>{readyForChat ? "Chat bereit" : "Verbindung fehlt"}</Text>
                      <Text style={s.statusText}>{readyForChat ? contextLabel + " · " + providerLabel : "Repository und Workspace in Einstellungen konfigurieren."}</Text>
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
                renderItem={renderMessage}
                ListFooterComponent={<>
                  {chatError ? (
                    <View style={s.errorRow}>
                      <Ionicons name="warning" size={14} color="#FF8A96" />
                      <Text style={s.error}>{chatError}</Text>
                    </View>
                  ) : null}
                  <ChatComposer
                    value={prompt}
                    onChange={setPrompt}
                    onSend={() => void sendMessage()}
                    canSend={canSend}
                    isThinking={isThinking}
                    onToggleAttach={() => setShowAttachMenu((v) => !v)}
                    attachMenuOpen={showAttachMenu}
                    attachments={attachments}
                    onRemoveAttachment={(id) => setAttachments((cur) => cur.filter((x) => x.id !== id))}
                    onOpenGithub={() => setActiveTab("github")}
                    onOpenSkills={() => setActiveTab("skills")}
                    githubConnected={settings.hasGitHubToken}
                    skillCount={enabledSkillCount(skillPreferences)}
                    onAttach={(kind) => { void (kind === "datei" ? pickFilesFromDevice() : kind === "foto" ? pickPhotos() : pickVideos()).then((f: ChatAttachment[]) => setAttachments((a) => [...a, ...f].slice(-6))); setShowAttachMenu(false); }}
                    attachBusy={mediaPickerBusy}
                  />
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
                        <Text style={s.testBtnTxt}>{connectorTests[id].status === "testing" ? "Prüfe …" : "Testen"}</Text>
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
                    { id: "agent" as SkillId, label: "Agent-Vorschläge", detail: "KI erstellt reviewbare Code-Vorschläge" },
                    { id: "diff" as SkillId, label: "Code-Diff-Prüfung", detail: "Vergleicht Änderungen vor dem Commit" },
                    { id: "quality" as SkillId, label: "CI-Qualitätsprüfung", detail: "Prüft Build- und Teststatus" },
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
                  <Text style={s.settingsLinkTxt}>Alle Einstellungen öffnen</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </StudioErrorBoundary>
      </ChatBackground>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 28 },
  tabBar: { backgroundColor: "rgba(13, 21, 32, 0.85)", borderColor: "#1E2F47", borderRadius: 16, borderWidth: 1, flexDirection: "row", marginBottom: 12, padding: 4 },
  tab: { alignItems: "center", borderRadius: 12, flex: 1, flexDirection: "row", gap: 5, justifyContent: "center", paddingVertical: 9 },
  tabActive: { backgroundColor: "rgba(56, 225, 255, 0.10)", borderColor: "rgba(56, 225, 255, 0.35)", borderWidth: 1 },
  tabText: { color: "#6B7D90", fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: "#38E1FF" },
  dot: { backgroundColor: "#4ADE9C", borderRadius: 4, height: 6, width: 6 },
  badge: { backgroundColor: "#1E3A4A", borderRadius: 8, color: "#38E1FF", fontSize: 9, fontWeight: "900", overflow: "hidden", paddingHorizontal: 5, paddingVertical: 1 },
  statusCard: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, marginBottom: 12, overflow: "hidden", padding: 12 },
  statusReady: { backgroundColor: "rgba(11, 21, 34, 0.9)", borderColor: "#24503E" },
  statusWarn: { backgroundColor: "rgba(26, 21, 8, 0.9)", borderColor: "#5C4A1E" },
  statusGlow: { backgroundColor: "#4ADE9C", borderRadius: 3, height: 8, shadowColor: "#4ADE9C", shadowOpacity: 0.8, shadowRadius: 6, width: 8 },
  statusGlowWarn: { backgroundColor: "#F5C46B", borderRadius: 3, height: 8, width: 8 },
  statusCopy: { flex: 1 },
  statusTitle: { color: "#DDE8F4", fontSize: 13, fontWeight: "800" },
  statusText: { color: "#8294A8", fontSize: 11, lineHeight: 16, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
  chip: { backgroundColor: "rgba(19, 31, 46, 0.9)", borderColor: "#2B3E55", borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: "#9FBDD4", fontSize: 12, fontWeight: "700" },
  dayDividerRow: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 12, marginTop: 4 },
  dayDividerLine: { backgroundColor: "#1E2F47", flex: 1, height: 1 },
  dayDividerText: { color: "#5D7290", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  errorRow: { alignItems: "center", backgroundColor: "rgba(45, 18, 26, 0.85)", borderColor: "#6E2A3A", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 7, marginBottom: 8, paddingHorizontal: 11, paddingVertical: 9 },
  error: { color: "#FF8A96", flex: 1, fontSize: 11, lineHeight: 16 },
  connCard: { backgroundColor: "rgba(15, 22, 31, 0.9)", borderColor: "#243347", borderRadius: 16, borderWidth: 1, marginBottom: 12, padding: 14 },
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
  settingsLinkTxt: { color: "#38E1FF", fontSize: 13, fontWeight: "700" },
});
