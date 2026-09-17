import { StatusBadge, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { AiOrb } from "@/components/living/living-ui";
import { StudioErrorBoundary } from "@/components/studio/studio-error-boundary";
import { ChatBackground } from "@/components/chat/chat-background";
import { AgentManagerModal, AgentSwitcher, type SuperAgentView } from "@/components/chat/agent-switcher";
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
import { DevTracePanel } from "@/components/chat/dev-trace-panel";
import { useWorkspace } from "@/lib/workspace-context";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { rankProviders, type LatencySample, type ProviderScore } from "@/lib/provider-latency-logic";
import { DEFAULT_CONNECTOR_PREFERENCES, enabledConnectorCount, normalizeConnectorPreferences, CONNECTOR_PREFERENCE_STORAGE_KEY, toggleConnector, type ConnectorId, type ConnectorPreferences } from "@/lib/connector-preferences-logic";
import { DEFAULT_SKILL_PREFERENCES, enabledSkillCount, normalizeSkillPreferences, SKILL_PREFERENCE_STORAGE_KEY, toggleSkill, type SkillId, type SkillPreferences } from "@/lib/skill-preferences-logic";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, type ListRenderItemInfo } from "react-native";
import { darken, withAlpha } from "@/lib/theme-color-utils";
import { useColors } from "@/hooks/use-colors";

type ChatMessage = DevelopmentChatHistoryMessage & { proposal?: AgentProposal; timestampMs?: number };
type ChatAttachment = MediaAttachment;
type ConnectorTestStatus = "idle" | "testing" | "success" | "error";
type ConnectorTestState = { status: ConnectorTestStatus; message?: string };
type InnerTab = "chat" | "github" | "skills";

const ACTIVE_AGENT_STORAGE_KEY = "custom-ai-studio.superagents.active.v1";

const initialMessages: ChatMessage[] = [{ id: "agent-intro", role: "agent", content: "Willkommen im KI-Operations-Chat. Beschreibe eine Änderung, ein Problem oder ein Refactoring — ich kümmere mich darum." }];

export default function ChatScreen() {
    const colors = useColors();
    const s = useMemo(() => createStyles(colors), [colors]);
  const { loadRemoteFiles, selectedFile } = useWorkspace();
  const { attachRepository, listGithubRepositories, loadRepositoryDetails, loadWorkspaceHealth, settings } = useStudioSettings();
  const [activeTab, setActiveTab] = useState<InnerTab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [chatError, setChatError] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showRepositoryCard, setShowRepositoryCard] = useState(false);
  // Sprint 133 — Einklappbarer Chat-Kopf: Status-Karte und Schnellstart-
  // Chips lassen sich zusammenklappen, damit der Verlauf den Platz kriegt.
  const [statusCollapsed, setStatusCollapsed] = useState(false);
  const [skillPreferences, setSkillPreferences] = useState<SkillPreferences>(DEFAULT_SKILL_PREFERENCES);
  // Sprint 137 — Mehrere Superagenten: Verwaltung + aktiver Agent.
  const superAgentsQuery = trpc.superAgents.list.useQuery(undefined, { retry: false });
  const createAgentMutation = trpc.superAgents.create.useMutation();
  const updateAgentMutation = trpc.superAgents.update.useMutation();
  const setActiveAgentMutation = trpc.superAgents.setActive.useMutation();
  const removeAgentMutation = trpc.superAgents.remove.useMutation();
  const [agents, setAgents] = useState<SuperAgentView[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<number | null>(null);
  const [managerVisible, setManagerVisible] = useState(false);
  const [connectorPreferences, setConnectorPreferences] = useState<ConnectorPreferences>(DEFAULT_CONNECTOR_PREFERENCES);
  const [latencyScores, setLatencyScores] = useState<ProviderScore[]>([]);
  const [connectorTests, setConnectorTests] = useState<Record<ConnectorId, ConnectorTestState>>({ workspace: { status: "idle" }, github: { status: "idle" }, provider: { status: "idle" } });
  // Sprint 127 — Autonomer Administrator-Autopilot: GitHub-Token, Standard-
  // Router, Cyber-Neon-Design und Repository-Verbindung werden automatisch
  // hergestellt, sobald ein Administrator angemeldet ist — kein manueller
  // Klick in den Einstellungen mehr noetig.
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const listRef = useRef<FlatList<ChatMessage>>(null);
  // Sprint 139 — Robustes Auto-Scroll (Owner-Feedback 16.09.2026): Die Antwort
  // muss nach dem Senden sofort im sichtbaren Bereich erscheinen, wie in jedem
  // Messenger. onContentSizeChange allein war auf Android unzuverlaessig —
  // deshalb doppelt abgesichert: Effect auf jede Nachrichten-Aenderung (nach
  // dem Layout, via doppeltem requestAnimationFrame + Timer-Fallback) plus der
  // bestehende Content-Size-Hook.
  const scrollChatToEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated });
        // Late-Layout-Retry: Android streamt Layout-Aenderungen teils
        // erst nach dem Frame — ein zweiter Versuch nach 120 ms fängt
        // alle verspaeteten Frames zuverlaessig ein.
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 120);
      });
    });
  }, []);
  useEffect(() => {
    if (activeTab !== "chat") return;
    const timer = setTimeout(() => scrollChatToEnd(true), 40);
    return () => clearTimeout(timer);
  }, [messages, isThinking, activeTab, scrollChatToEnd]);
  const { busy: mediaPickerBusy, pickFiles: pickFilesFromDevice, pickPhotos, pickVideos } = useMediaPicker();
  const developmentChatMutation = trpc.developmentChat.send.useMutation();
  const chatWorkspaceId = settings.workspaceId;
  const providerLabel = getProviderLabel(settings.provider);
  const readyForChat = settings.provider === "managed" || settings.provider === "auto" || settings.hasProviderKey;
  const contextLabel = useMemo(() => selectedFile.name + " · " + settings.branch, [selectedFile.name, settings.branch]);
  const activeAgent = useMemo(() => agents.find((agent) => agent.id === activeAgentId) ?? null, [agents, activeAgentId]);
  const activeSessionId = activeAgent?.sessionId ?? "default";
  const isChatEmpty = useMemo(() => !messages.some((message) => message.role === "user"), [messages]);

  const requestDevelopmentChat = async (content: string) => {
    const conversation: { role: "user" | "assistant"; content: string }[] = messages
      .filter((message) => message.role === "user" || message.role === "agent")
      .slice(-10)
      .map((message) => ({ role: message.role === "agent" ? "assistant" as const : "user" as const, content: message.content }));
    const requestMessages: { role: "user" | "assistant"; content: string }[] = [...conversation, { role: "user" as const, content }].slice(-12);
    const request = developmentChatMutation.mutateAsync({
      provider: settings.provider,
      messages: requestMessages,
      // Sprint 88 — Workspace-ID aktiviert den autonomen Werkzeug-Modus.
      workspaceId: chatWorkspaceId || undefined,
      branch: settings.branch,
      sessionId: activeSessionId,
    });
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
    const rows = superAgentsQuery.data;
    if (!rows?.length) return;
    setAgents(rows as SuperAgentView[]);
    setActiveAgentId((current) => (current != null && rows.some((agent) => agent.id === current) ? current : rows[0]?.id ?? null));
  }, [superAgentsQuery.data]);

  useEffect(() => {
    let restoreActive = true;
    void AsyncStorage.getItem(ACTIVE_AGENT_STORAGE_KEY).then((stored) => {
      if (!restoreActive || !stored) return;
      const parsed = Number.parseInt(stored, 10);
      if (Number.isInteger(parsed)) setActiveAgentId(parsed);
    }).catch(() => undefined);
    return () => { restoreActive = false; };
  }, []);

  useEffect(() => {
    if (!chatWorkspaceId || activeSessionId !== "default") return;
    let active = true;
    void loadDevelopmentChatHistory(settings.protectChatContent, chatWorkspaceId).then((raw) => {
      if (!active) return;
      const parsed = parseDevelopmentChatHistory(raw);
      if (parsed.length) setMessages(parsed);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [chatWorkspaceId, settings.protectChatContent, activeSessionId]);

  // Sprint 54: Serverseitig persistierte Historie (PostgreSQL) laden —
  // nur als Hydration, wenn lokal keine Konversation existiert.
  const serverHistoryQuery = trpc.developmentChat.history.useQuery(
    { limit: 100, sessionId: activeSessionId },
    { retry: false },
  );
  useEffect(() => {
    const rows = serverHistoryQuery.data?.messages;
    if (!rows?.length) return;
    setMessages((current) => {
      if (current.some((message) => message.role === "user")) return current;
      return [...initialMessages, ...serverHistoryToChatRows(rows)];
    });
  }, [serverHistoryQuery.data]);

  // Sprint 137 — Agentenwechsel: Auswahl persistieren, Agent als "zuletzt
  // verwendet" markieren und den Chat auf den isolierten Verlauf des
  // Agenten zuruecksetzen (Server-Historie hydratisiert danach).
  const selectAgent = (agent: SuperAgentView) => {
    setActiveAgentId(agent.id);
    void AsyncStorage.setItem(ACTIVE_AGENT_STORAGE_KEY, String(agent.id)).catch(() => undefined);
    setActiveAgentMutation.mutate({ id: agent.id }, { onSuccess: () => void superAgentsQuery.refetch() });
    setPrompt("");
    setChatError("");
    setAttachments([]);
    setMessages([{ id: "agent-intro-" + agent.id, role: "agent", content: `Hallo, ich bin ${agent.name}.${agent.purpose ? ` ${agent.purpose}` : ""} Beschreibe eine Änderung, ein Problem oder ein Refactoring — ich kümmere mich darum.` }]);
  };

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
    } catch (error) {
      // Sprint 73: Praezise Rueckmeldung statt generischem "fehlgeschlagen" —
      // CORS-/API-Key-/Netzwerkfehler sind so im Frontend unterscheidbar.
      const detail = error instanceof Error ? error.message : String(error);
      setConnectorTests((c) => ({ ...c, [connector]: { status: "error", message: detail || "Verbindung fehlgeschlagen" } }));
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
      const agentMsg: ChatMessage = { id: "agent-" + Date.now(), role: "agent", content: result.content, state: "ready", timestampMs: Date.now(), devTrace: result.devTrace };
      setMessages((cur) => {
        const next = [...cur.filter((m) => !m.id.startsWith("thinking-")), agentMsg];
        if (activeSessionId === "default") {
          void saveDevelopmentChatHistory(serializeDevelopmentChatHistory(next), settings.protectChatContent, chatWorkspaceId).catch(() => undefined);
        }
        return next;
      });
      setAttachments([]);
      if (activeAgentId != null) setActiveAgentMutation.mutate({ id: activeAgentId }, { onSuccess: () => void superAgentsQuery.refetch() });
    } catch (error) {
      setMessages((cur) => cur.filter((m) => !m.id.startsWith("thinking-")));
      // Sprint 108 — Backend-Antwort "Please login (10001)" ist fuer den
      // Nutzer nicht als Sitzungsproblem erkennbar; hier entsteht Klarheit.
      const raw = error instanceof Error ? error.message : String(error);
      const unauthorized = raw.includes("10001") || /please login/i.test(raw);
      setChatError(
        unauthorized
          ? "Sitzung abgelaufen — bitte im Tab \u201eKonto\u201c neu anmelden."
          : raw || "Anfrage fehlgeschlagen.",
      );
    } finally {
      setIsThinking(false);
    }
  };

  const statusColor = (st: ConnectorTestStatus) => st === "success" ? colors.success : st === "error" ? colors.error : st === "testing" ? colors.tint : "#8294A8";
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
        {msg.role === "agent" && msg.devTrace?.length ? <DevTracePanel trace={msg.devTrace} /> : null}
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
                  <Ionicons name={icon as never} size={14} color={activeTab === tab ? colors.tint : "#6B7D90"} />
                  <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>{label}</Text>
                  {tab === "github" && settings.hasGitHubToken ? <View style={s.dot} /> : null}
                  {tab === "skills" ? <Text style={s.badge}>{enabledSkillCount(skillPreferences) + enabledConnectorCount(connectorPreferences)}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>

            {activeTab === "chat" && (
              <>
              <AgentSwitcher
                activeAgent={activeAgent}
                agents={agents}
                onSelect={selectAgent}
                onOpenManager={() => setManagerVisible(true)}
              />
              <FlatList
                ref={listRef}
                contentContainerStyle={s.content}
                data={messages}
                keyExtractor={(m) => m.id}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                onLayout={() => scrollChatToEnd(false)}
                ListHeaderComponent={isChatEmpty ? <>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={statusCollapsed ? "Chat-Status aufklappen" : "Chat-Status einklappen"}
                    activeOpacity={0.85}
                    onPress={() => setStatusCollapsed((value) => !value)}
                    style={[s.statusCard, readyForChat ? s.statusReady : s.statusWarn]}
                  >
                    <AiOrb state={!readyForChat ? "error" : isThinking ? "thinking" : "idle"} size={26} />
                    <View style={s.statusCopy}>
                      <Text style={[s.statusTitle, s.statusTitleMono]}>{readyForChat ? "Chat bereit" : "Verbindung fehlt"}</Text>
                      {!statusCollapsed ? (
                        <Text style={[s.statusText, s.statusTextMono]}>{readyForChat ? contextLabel + " · " + providerLabel : "Repository und Workspace in Einstellungen konfigurieren."}</Text>
                      ) : null}
                    </View>
                    <StatusBadge label={readyForChat ? "Bereit" : "Fehlt"} tone={readyForChat ? "ready" : "warning"} />
                    <Ionicons name={statusCollapsed ? "chevron-down" : "chevron-up"} size={16} color={colors.muted} style={s.statusChevron} />
                  </TouchableOpacity>
                  {showRepositoryCard && (
                    <RepositoryConnectCard
                      onClose={() => setShowRepositoryCard(false)}
                      onConnect={(input) => attachRepository({ workspaceUrl: settings.workspaceUrl, repositoryUrl: input.repositoryUrl, branch: input.branch, provider: settings.provider, localProviderEndpoints: settings.localProviderEndpoints, protectChatContent: settings.protectChatContent })
                        .then((result) => { loadRemoteFiles(result.files); setMessages((cur) => [...cur, { id: "repo-" + Date.now(), role: "agent", content: "Repository verbunden. " + result.files.length + " Dateien bereit." }]); return result; })}
                      onListRepositories={settings.hasGitHubToken ? listGithubRepositories : undefined}
                    />
                  )}
                  {!statusCollapsed ? (
                    <View style={s.chips}>
                      {["CyberSarah-revenue-os verbinden", "Analysiere die Architektur", "Verbessere die mobile UX"].map((t) => (
                        <TouchableOpacity key={t} onPress={() => { setPrompt(t); if (t.startsWith("Cyber")) setShowRepositoryCard(true); }} style={s.chip}>
                          <Text style={s.chipText}>{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </> : null}
                renderItem={renderMessage}
                ListFooterComponent={<>
                  {chatError ? (
                    <View style={s.errorRow}>
                      <Ionicons name="warning" size={14} color={colors.error} />
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
              </>
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
            <AgentManagerModal
              activeAgentId={activeAgentId}
              agents={agents}
              onClose={() => setManagerVisible(false)}
              onCreate={async (input) => {
                const created = await createAgentMutation.mutateAsync(input);
                await superAgentsQuery.refetch();
                selectAgent(created as SuperAgentView);
                setManagerVisible(false);
              }}
              onRemove={async (id) => {
                await removeAgentMutation.mutateAsync({ id });
                const refreshed = await superAgentsQuery.refetch();
                if (activeAgentId === id) {
                  const fallback = (refreshed.data ?? [])[0];
                  if (fallback) selectAgent(fallback as SuperAgentView);
                }
              }}
              onSelect={(agent) => {
                selectAgent(agent);
                setManagerVisible(false);
              }}
              onUpdate={async (id, patch) => {
                await updateAgentMutation.mutateAsync({ id, ...patch });
                await superAgentsQuery.refetch();
              }}
              visible={managerVisible}
            />
          </KeyboardAvoidingView>
        </StudioErrorBoundary>
      </ChatBackground>
    </ScreenContainer>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 28 },
  mono: { fontFamily: "monospace" },
  tabBar: { backgroundColor: "rgba(13, 21, 32, 0.85)", borderColor: "#1E2F47", borderRadius: 16, borderWidth: 1, flexDirection: "row", marginBottom: 12, padding: 4 },
  tab: { alignItems: "center", borderRadius: 12, flex: 1, flexDirection: "row", gap: 5, justifyContent: "center", paddingVertical: 9 },
  tabActive: { backgroundColor: withAlpha(colors.tint, 0.10), borderColor: withAlpha(colors.tint, 0.35), borderWidth: 1 },
  tabText: { color: "#6B7D90", fontFamily: "monospace", fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: colors.tint },
  statusTitleMono: { color: colors.tint, fontFamily: "monospace", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  statusTextMono: { color: colors.muted, fontFamily: "monospace", fontSize: 11 },
  dot: { backgroundColor: colors.success, borderRadius: 4, height: 6, width: 6 },
  badge: { backgroundColor: withAlpha(colors.tint, 0.14), borderRadius: 8, color: colors.tint, fontSize: 9, fontWeight: "900", overflow: "hidden", paddingHorizontal: 5, paddingVertical: 1 },
  statusCard: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, marginBottom: 12, overflow: "hidden", padding: 12 },
  statusChevron: { marginLeft: 4 },
  statusReady: { backgroundColor: withAlpha(colors.success, 0.1), borderColor: darken(colors.success, 0.6) },
  statusWarn: { backgroundColor: withAlpha(colors.warning, 0.12), borderColor: darken(colors.warning, 0.68) },
  statusGlow: { backgroundColor: colors.success, borderRadius: 3, height: 8, shadowColor: colors.success, shadowOpacity: 0.8, shadowRadius: 6, width: 8 },
  statusGlowWarn: { backgroundColor: colors.warning, borderRadius: 3, height: 8, width: 8 },
  statusCopy: { flex: 1 },
    statusTitle: { color: colors.foreground, fontSize: 13, fontWeight: "800" },
    statusText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
    chip: { backgroundColor: withAlpha(colors.surface, 0.92), borderColor: withAlpha(colors.tint, 0.35), borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontFamily: "monospace", color: "#9FBDD4", fontSize: 12, fontWeight: "700" },
  dayDividerRow: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 12, marginTop: 4 },
    dayDividerLine: { backgroundColor: withAlpha(colors.tint, 0.25), flex: 1, height: 1 },
    dayDividerText: { color: colors.muted, fontFamily: "monospace", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  errorRow: { alignItems: "center", backgroundColor: withAlpha(colors.error, 0.12), borderColor: darken(colors.error, 0.6), borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 7, marginBottom: 8, paddingHorizontal: 11, paddingVertical: 9 },
  error: { color: colors.error, flex: 1, fontSize: 11, lineHeight: 16 },
  connCard: { backgroundColor: "rgba(15, 22, 31, 0.9)", borderColor: "#243347", borderRadius: 16, borderWidth: 1, marginBottom: 12, padding: 14 },
  connRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  connInfo: { flex: 1, marginRight: 10 },
  connName: { color: "#DDE8F4", fontSize: 13, fontWeight: "800" },
  connDetail: { color: "#8294A8", fontSize: 11, marginTop: 2 },
  connActions: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 4 },
  testBtn: { alignItems: "center", backgroundColor: "#131F2E", borderColor: "#2B3E55", borderRadius: 10, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", paddingVertical: 9 },
  testBtnTxt: { color: "#9FBDD4", fontSize: 12, fontWeight: "700" },
  toggle: { backgroundColor: "#1A2433", borderRadius: 12, height: 24, justifyContent: "center", paddingHorizontal: 2, width: 44 },
  toggleOn: { backgroundColor: withAlpha(colors.tint, 0.3) },
  knob: { backgroundColor: "#4A6070", borderRadius: 10, height: 20, width: 20 },
  knobOn: { backgroundColor: "#ECFBFF", marginLeft: 20 },
  mgBtn: { alignItems: "center", backgroundColor: "#1A2433", borderColor: "#2B3C52", borderRadius: 10, borderWidth: 1, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 9 },
  mgBtnTxt: { color: "#9FBDD4", fontSize: 11, fontWeight: "700" },
  testResult: { fontSize: 11, lineHeight: 16, marginTop: 8 },
  skillRow: { alignItems: "center", borderTopColor: "#1E2B3B", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  settingsLink: { alignItems: "center", marginTop: 8, paddingVertical: 12 },
  settingsLinkTxt: { color: colors.tint, fontSize: 13, fontWeight: "700" },
  });
}
