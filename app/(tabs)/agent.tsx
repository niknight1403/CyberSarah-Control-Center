import {
  PrimaryButton,
  StatusBadge,
  StudioHeader,
  StudioSection,
} from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { StudioErrorBoundary } from "@/components/studio/studio-error-boundary";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  clearDevelopmentChatHistory,
  loadDevelopmentChatHistory,
  parseDevelopmentChatHistory,
  saveDevelopmentChatHistory,
  serializeDevelopmentChatHistory,
  type DevelopmentChatHistoryMessage,
} from "@/lib/development-chat-history";
import {
  captureProposalSnapshots,
  getSelectedProposalChanges,
  type ProposalFileSnapshot,
} from "@/lib/proposal-application-logic";
import type { AgentProposal } from "@/lib/remote-workspace-client";
import {
  getProviderLabel,
  getProviderStatusCopy,
  type ProviderActivity,
} from "@/lib/provider-status-logic";
import {
  exportEncryptedSupportBackup,
  isValidSupportBackupPassword,
} from "@/lib/support-backup";
import { getSupportShareConfirmation } from "@/lib/support-backup-logic";
import { useMediaPicker } from "@/hooks/use-media-picker";
import type { MediaAttachment } from "@/lib/media-picker";
import {
  formatProjectContext,
  readProjectContext,
} from "@/lib/project-upload-reader";
import { RepositoryConnectCard } from "@/components/studio/repository-connect-card";
import { parseRepositoryChatIntent } from "@/lib/repository-intent-logic";
import { useStudioSettings } from "@/lib/studio-settings";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/lib/workspace-context";
import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_CONNECTOR_PREFERENCES,
  enabledConnectorCount,
  normalizeConnectorPreferences,
  CONNECTOR_PREFERENCE_STORAGE_KEY,
  toggleConnector,
  type ConnectorId,
  type ConnectorPreferences,
} from "@/lib/connector-preferences-logic";
import {
  DEFAULT_SKILL_PREFERENCES,
  enabledSkillCount,
  normalizeSkillPreferences,
  SKILL_PREFERENCE_STORAGE_KEY,
  toggleSkill,
  type SkillId,
  type SkillPreferences,
} from "@/lib/skill-preferences-logic";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";

type ChatMessage = DevelopmentChatHistoryMessage & { proposal?: AgentProposal };
type ChatAttachment = MediaAttachment;

type ConnectorTestStatus = "idle" | "testing" | "success" | "error";
type ConnectorTestState = { status: ConnectorTestStatus; message?: string };

const attachmentKinds: {
  kind: ChatAttachment["kind"];
  label: string;
  icon: "doc.text.fill" | "photo" | "video.fill";
}[] = [
  { kind: "datei", label: "Projekt", icon: "doc.text.fill" },
  { kind: "foto", label: "Foto", icon: "photo" },
  { kind: "video", label: "Video", icon: "video.fill" },
];

const initialMessages: ChatMessage[] = [
  {
    id: "agent-intro",
    role: "agent",
    content:
      "Beschreibe eine Änderung, ein Problem oder ein Refactoring. Der Agent analysiert den verbundenen Workspace, erstellt einen begrenzten Änderungsvorschlag und überträgt Dateien erst nach deiner expliziten Freigabe.",
  },
];

export default function AgentScreen() {
  const { files, loadRemoteFiles, markFilesSynced, selectedFile, updateFile } =
    useWorkspace();
  const {
    attachRepository,
    loadRepositoryDetails,
    loadWorkspaceHealth,
    settings,
    syncRemoteChanges,
  } = useStudioSettings();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [providerActivity, setProviderActivity] =
    useState<ProviderActivity>("idle");
  const [lastProviderUsed, setLastProviderUsed] = useState(settings.provider);
  const [chatError, setChatError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupPasswordRepeat, setBackupPasswordRepeat] = useState("");
  const [backupState, setBackupState] = useState<
    "idle" | "exporting" | "shared" | "error"
  >("idle");
  const [backupMessage, setBackupMessage] = useState("");
  const [backupIntegrityVerified, setBackupIntegrityVerified] = useState(false);
  const [backupPreview, setBackupPreview] = useState<{
    messageCount: number;
    excerpts: string[];
  } | null>(null);
  const [selectedProposalPaths, setSelectedProposalPaths] = useState<
    Record<string, string[]>
  >({});
  const [appliedSnapshots, setAppliedSnapshots] = useState<
    Record<string, ProposalFileSnapshot[]>
  >({});
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [loadingPreviewIds, setLoadingPreviewIds] = useState<
    Record<string, boolean>
  >({});
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showRepositoryCard, setShowRepositoryCard] = useState(false);
  const [skillPreferences, setSkillPreferences] = useState<SkillPreferences>(
    DEFAULT_SKILL_PREFERENCES,
  );
  const [connectorPreferences, setConnectorPreferences] =
    useState<ConnectorPreferences>(DEFAULT_CONNECTOR_PREFERENCES);
  const [connectorTests, setConnectorTests] = useState<
    Record<ConnectorId, ConnectorTestState>
  >({
    workspace: { status: "idle" },
    github: { status: "idle" },
    provider: { status: "idle" },
  });
  const {
    busy: mediaPickerBusy,
    pickFiles: pickFilesFromDevice,
    pickPhotos,
    pickVideos,
  } = useMediaPicker();
  const developmentChatMutation = trpc.developmentChat.send.useMutation();
  const hasRepository = Boolean(settings.workspaceId);
  const chatWorkspaceId = settings.workspaceId;
  const providerLabel = getProviderLabel(settings.provider);
  const providerStatus = getProviderStatusCopy(
    settings.provider,
    providerActivity,
    lastProviderUsed,
  );
  const readyForChat =
    hasRepository &&
    (settings.provider === "managed" || settings.hasProviderKey);
  const contextLabel = useMemo(
    () => `${selectedFile.name} · ${settings.branch}`,
    [selectedFile.name, settings.branch],
  );

  useEffect(() => {
    setProviderActivity("idle");
    setLastProviderUsed(settings.provider);
  }, [settings.provider]);

  const requestDevelopmentChat = async (
    content: string,
  ): Promise<AgentProposal> => {
    const conversation: { role: "user" | "assistant"; content: string }[] =
      messages
        .filter(
          (message) => message.role === "user" || message.role === "agent",
        )
        .slice(-10)
        .map((message) => ({
          role:
            message.role === "agent"
              ? ("assistant" as const)
              : ("user" as const),
          content: message.content,
        }));
    const requestMessages: { role: "user" | "assistant"; content: string }[] = [
      ...conversation,
      { role: "user" as const, content },
    ].slice(-12);
    const result = await developmentChatMutation.mutateAsync({
      provider: settings.provider,
      messages: requestMessages,
    });
    return {
      summary: result.content,
      rationale: `Antwort von ${result.providerUsed} · Modell ${result.model}`,
      changes: [],
      affectedFiles: [],
      providerUsed: result.providerUsed,
      fallbackUsed: false,
    };
  };

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(CONNECTOR_PREFERENCE_STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        try {
          setConnectorPreferences(
            normalizeConnectorPreferences(JSON.parse(stored)),
          );
        } catch {
          setConnectorPreferences(DEFAULT_CONNECTOR_PREFERENCES);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(SKILL_PREFERENCE_STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        try {
          setSkillPreferences(normalizeSkillPreferences(JSON.parse(stored)));
        } catch {
          setSkillPreferences(DEFAULT_SKILL_PREFERENCES);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const updateConnectorPreference = (connector: ConnectorId) => {
    setConnectorPreferences((current) => {
      const next = toggleConnector(current, connector);
      void AsyncStorage.setItem(
        CONNECTOR_PREFERENCE_STORAGE_KEY,
        JSON.stringify(next),
      );
      return next;
    });
  };

  const updateSkillPreference = (skill: SkillId) => {
    setSkillPreferences((current) => {
      const next = toggleSkill(current, skill);
      void AsyncStorage.setItem(
        SKILL_PREFERENCE_STORAGE_KEY,
        JSON.stringify(next),
      );
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
      .catch(
        () =>
          active &&
          setChatError(
            "Der lokale Chat-Verlauf konnte nicht wiederhergestellt werden.",
          ),
      )
      .finally(() => active && setHistoryLoaded(true));
    return () => {
      active = false;
    };
  }, [chatWorkspaceId, settings.protectChatContent]);

  useEffect(() => {
    if (!historyLoaded) return;
    void saveDevelopmentChatHistory(
      serializeDevelopmentChatHistory(messages),
      settings.protectChatContent,
      chatWorkspaceId,
    ).catch(() =>
      setChatError("Der lokale Chat-Verlauf konnte nicht gespeichert werden."),
    );
  }, [chatWorkspaceId, historyLoaded, messages, settings.protectChatContent]);

  const submitPrompt = async () => {
    const normalizedPrompt = prompt.trim();
    const intent = parseRepositoryChatIntent(normalizedPrompt);
    if (intent.type === "connect_repository") {
      setMessages((current) => [
        ...current,
        {
          id: `user-${Date.now()}`,
          role: "user",
          content: normalizedPrompt || `Verbinde ${intent.repositoryUrl}.`,
        },
      ]);
      setPrompt("");
      setShowRepositoryCard(true);
      return;
    }
    if (
      (!normalizedPrompt && attachments.length === 0) ||
      !readyForChat ||
      isThinking
    )
      return;
    const attachmentSummary = attachments.length
      ? `\n\nAnhänge: ${attachments.map((attachment) => `${attachment.kind} „${attachment.name}“`).join(", ")}`
      : "";
    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: `${normalizedPrompt || "Bitte prüfe diese Anhänge."}${attachmentSummary}`,
      },
    ]);
    setPrompt("");
    setAttachments([]);
    setChatError("");
    setProviderActivity("requesting");
    setIsThinking(true);
    try {
      const projectContext = await readProjectContext(attachments);
      const enabledSkills = [
        skillPreferences.agent ? "Agent-Vorschläge" : "",
        skillPreferences.diff ? "Code-Diff-Prüfung" : "",
        skillPreferences.quality ? "CI-Qualitätsprüfung" : "",
      ]
        .filter(Boolean)
        .join(", ");
      const projectContextText = formatProjectContext(projectContext.files);
      const contextNotice = projectContext.skipped.length
        ? `\n\nNicht übernommen: ${projectContext.skipped.join(", ")}`
        : "";
      if (contextNotice)
        setChatError(
          `Einige Anhänge wurden aus Sicherheitsgründen übersprungen: ${projectContext.skipped.join(", ")}`,
        );
      const contextualPrompt = `${enabledSkills ? `Aktive Skills: ${enabledSkills}\n\n` : ""}${normalizedPrompt}${projectContextText}`;
      const proposal = await requestDevelopmentChat(contextualPrompt);
      setLastProviderUsed(proposal.providerUsed ?? settings.provider);
      setProviderActivity(proposal.fallbackUsed ? "fallback" : "active");
      const content = proposal.changes.length
        ? `${proposal.summary}\n\n${proposal.rationale}\n\n${proposal.changes.length} Datei(en) zur Überprüfung bereit.`
        : `${proposal.summary}\n\n${proposal.rationale}`;
      const proposalMessageId = `proposal-${Date.now()}`;
      setMessages((current) => [
        ...current,
        {
          id: proposalMessageId,
          role: "agent",
          content,
          proposal,
          proposalPreview: {
            affectedFiles: proposal.affectedFiles,
            changes: proposal.changes.map(({ path, explanation }) => ({
              path,
              explanation,
            })),
          },
          state: "ready",
        },
      ]);
      setSelectedProposalPaths((current) => ({
        ...current,
        [proposalMessageId]: proposal.changes.map((change) => change.path),
      }));
    } catch (error) {
      setProviderActivity("error");
      setChatError(
        error instanceof Error
          ? error.message
          : "Der Entwicklungsauftrag konnte nicht verarbeitet werden.",
      );
    } finally {
      setIsThinking(false);
    }
  };

  const toggleProposalFile = (messageId: string, path: string) => {
    setSelectedProposalPaths((current) => {
      const selected = current[messageId] ?? [];
      return {
        ...current,
        [messageId]: selected.includes(path)
          ? selected.filter((item) => item !== path)
          : [...selected, path],
      };
    });
  };

  const applyProposal = async (messageId: string, proposal: AgentProposal) => {
    const selectedChanges = getSelectedProposalChanges(
      proposal.changes,
      selectedProposalPaths[messageId] ??
        proposal.changes.map((change) => change.path),
    );
    if (!selectedChanges.length) return;
    const snapshots = captureProposalSnapshots(files, selectedChanges);
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, state: "applying" } : message,
      ),
    );
    setChatError("");
    try {
      await syncRemoteChanges(
        selectedChanges.map(({ path, content }) => ({ path, content })),
      );
      const syncedIds: string[] = [];
      selectedChanges.forEach((change) => {
        const file = files.find((entry) => entry.path === change.path);
        if (!file) return;
        updateFile(file.id, change.content);
        syncedIds.push(file.id);
      });
      if (syncedIds.length) markFilesSynced(syncedIds);
      setAppliedSnapshots((current) => ({
        ...current,
        [messageId]: snapshots,
      }));
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                state: "applied",
                content: `${message.content}\n\n${selectedChanges.length} ausgewählte Datei(en) wurden in den Remote-Workspace übernommen. Prüfe sie im Workspace und committe sie anschließend gezielt.`,
              }
            : message,
        ),
      );
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, state: "error" } : message,
        ),
      );
      setChatError(
        error instanceof Error
          ? error.message
          : "Die vorgeschlagenen Änderungen konnten nicht übernommen werden.",
      );
    }
  };

  const undoProposal = async (messageId: string) => {
    const snapshots = appliedSnapshots[messageId] ?? [];
    if (!snapshots.length) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, state: "reverting" } : message,
      ),
    );
    setChatError("");
    try {
      await syncRemoteChanges(
        snapshots.map(({ path, content }) => ({ path, content })),
      );
      snapshots.forEach((snapshot) =>
        updateFile(snapshot.id, snapshot.content),
      );
      markFilesSynced(snapshots.map((snapshot) => snapshot.id));
      setAppliedSnapshots((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                state: "reverted",
                content: `${message.content}\n\nDie vorherigen Datei-Inhalte wurden aus dem lokalen Snapshot wiederhergestellt.`,
              }
            : message,
        ),
      );
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, state: "applied" } : message,
        ),
      );
      setChatError(
        error instanceof Error
          ? error.message
          : "Die Wiederherstellung der vorherigen Datei-Inhalte ist fehlgeschlagen.",
      );
    }
  };

  const addAttachments = (next: ChatAttachment[]) => {
    setAttachments((current) => [...current, ...next].slice(-6));
  };

  const pickFiles = async () => {
    setShowAttachMenu(false);
    addAttachments(await pickFilesFromDevice());
  };

  const pickMedia = async (kind: "foto" | "video") => {
    setShowAttachMenu(false);
    addAttachments(await (kind === "foto" ? pickPhotos() : pickVideos()));
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) =>
      current.filter((attachment) => attachment.id !== id),
    );
    setLoadingPreviewIds((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const setPreviewLoading = (id: string, loading: boolean) => {
    setLoadingPreviewIds((current) => ({ ...current, [id]: loading }));
  };

  const testConnector = async (connector: ConnectorId) => {
    setConnectorTests((current) => ({
      ...current,
      [connector]: { status: "testing", message: "Prüfung läuft …" },
    }));
    try {
      if (connector === "workspace") {
        await loadWorkspaceHealth();
      } else if (connector === "github") {
        if (!settings.workspaceId)
          throw new Error("Kein Repository verbunden.");
        await loadRepositoryDetails();
      } else {
        if (!readyForChat)
          throw new Error(
            "Der KI-Provider ist noch nicht vollständig konfiguriert.",
          );
        await requestDevelopmentChat(
          "Verbindungstest: Antworte ausschließlich mit OK.",
        );
      }
      setConnectorTests((current) => ({
        ...current,
        [connector]: { status: "success", message: "Verbindung bestätigt" },
      }));
    } catch {
      setConnectorTests((current) => ({
        ...current,
        [connector]: {
          status: "error",
          message: "Verbindung konnte nicht bestätigt werden",
        },
      }));
    }
  };

  const clearHistory = async () => {
    await clearDevelopmentChatHistory(chatWorkspaceId).catch(() =>
      setChatError("Der lokale Chat-Verlauf konnte nicht gelöscht werden."),
    );
    setMessages(initialMessages);
  };

  const exportBackup = async () => {
    if (
      !historyLoaded ||
      !isValidSupportBackupPassword(backupPassword) ||
      backupPassword !== backupPasswordRepeat
    )
      return;
    setBackupState("exporting");
    setBackupMessage("");
    try {
      const history = serializeDevelopmentChatHistory(messages);
      const result = await exportEncryptedSupportBackup(
        history,
        backupPassword,
      );
      setBackupPassword("");
      setBackupPasswordRepeat("");
      setBackupState("shared");
      setBackupIntegrityVerified(result.verification.valid);
      setBackupPreview(result.preview);
      setBackupMessage(
        `${result.filename} wurde verschlüsselt erzeugt, auf Integrität geprüft und an das System-Menü übergeben.`,
      );
    } catch (error) {
      setBackupState("error");
      setBackupIntegrityVerified(false);
      setBackupPreview(null);
      setBackupMessage(
        error instanceof Error
          ? error.message
          : "Das verschlüsselte Support-Backup konnte nicht erstellt werden.",
      );
    }
  };

  const confirmBackupExport = () => {
    if (
      !historyLoaded ||
      !isValidSupportBackupPassword(backupPassword) ||
      backupPassword !== backupPasswordRepeat ||
      backupState === "exporting"
    )
      return;
    const confirmation = getSupportShareConfirmation();
    Alert.alert(
      confirmation.title,
      confirmation.message,
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Für Support freigeben", onPress: () => void exportBackup() },
      ],
      { cancelable: true },
    );
  };

  return (
    <ScreenContainer
      className="px-5"
      edges={["top", "left", "right", "bottom"]}
    >
      <StudioErrorBoundary section="Agent">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <FlatList
            contentContainerStyle={styles.content}
            data={messages}
            keyExtractor={(message) => message.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <>
                <StudioHeader
                  eyebrow="CYBERSARAH · ENTWICKLUNGSRAUM"
                  title="Chat"
                />
                <View style={styles.chatHero}>
                  <View style={styles.chatHeroIcon}>
                    <IconSymbol name="sparkles" size={19} color="#D8D3FF" />
                  </View>
                  <View style={styles.chatHeroCopy}>
                    <Text style={styles.chatHeroTitle}>
                      Was möchtest du weiterentwickeln?
                    </Text>
                    <Text style={styles.chatHeroText}>
                      Verbinde dein CyberSarah-revenue-os Repository oder teile
                      ausgewählte Projektdateien für einen reviewbaren
                      Vorschlag.
                    </Text>
                  </View>
                </View>
                <View style={styles.promptChips}>
                  {[
                    "CyberSarah-revenue-os verbinden",
                    "Analysiere die Architektur",
                    "Verbessere die mobile UX",
                    "Prüfe die nächsten Fehler",
                  ].map((suggestion) => (
                    <TouchableOpacity
                      key={suggestion}
                      accessibilityRole="button"
                      onPress={() => {
                        setPrompt(suggestion);
                        if (suggestion.startsWith("CyberSarah"))
                          setShowRepositoryCard(true);
                      }}
                      style={styles.promptChip}
                    >
                      <Text style={styles.promptChipText}>{suggestion}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {showRepositoryCard ? (
                  <RepositoryConnectCard
                    onClose={() => setShowRepositoryCard(false)}
                    onConnect={(input) =>
                      attachRepository({
                        workspaceUrl: settings.workspaceUrl,
                        repositoryUrl: input.repositoryUrl,
                        branch: input.branch,
                        provider: settings.provider,
                        localProviderEndpoints: settings.localProviderEndpoints,
                        protectChatContent: settings.protectChatContent,
                      }).then((result) => {
                        loadRemoteFiles(result.files);
                        setMessages((current) => [
                          ...current,
                          {
                            id: `repository-${Date.now()}`,
                            role: "agent",
                            content: `Repository verbunden. ${result.files.length} Dateien auf Branch ${result.branch} stehen jetzt als Projektkontext bereit.`,
                            state: "ready",
                          },
                        ]);
                        return result;
                      })
                    }
                  />
                ) : null}
                <View
                  style={[
                    styles.readinessCard,
                    readyForChat
                      ? styles.readinessReady
                      : styles.readinessWaiting,
                  ]}
                >
                  <View style={styles.readinessIcon}>
                    <IconSymbol
                      name="sparkles"
                      size={17}
                      color={readyForChat ? "#B9B2FF" : "#F6BA5E"}
                    />
                  </View>
                  <View style={styles.readinessCopy}>
                    <Text style={styles.readinessTitle}>
                      {readyForChat
                        ? "Entwicklungs-Chat bereit"
                        : "Verbindung für den Agenten fehlt"}
                    </Text>
                    <Text style={styles.readinessText}>
                      {readyForChat
                        ? `Projektkontext aus ${contextLabel} · ${providerLabel}`
                        : hasRepository
                          ? "Hinterlege für das gewählte KI-Profil einen Schlüssel oder nutze ein konfiguriertes On-Server-Profil."
                          : "Verbinde zuerst ein Repository und einen Workspace-Service in den Einstellungen."}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.providerStatusCard,
                    providerStatus.tone === "warning"
                      ? styles.providerStatusWarning
                      : providerStatus.tone === "ready"
                        ? styles.providerStatusLocal
                        : styles.providerStatusCloud,
                  ]}
                >
                  <View style={styles.providerStatusIcon}>
                    {providerActivity === "requesting" ? (
                      <ActivityIndicator color="#52D8FF" size="small" />
                    ) : (
                      <View
                        style={[
                          styles.providerStatusDot,
                          providerStatus.tone === "warning"
                            ? styles.providerStatusDotWarning
                            : providerStatus.tone === "ready"
                              ? styles.providerStatusDotLocal
                              : styles.providerStatusDotCloud,
                        ]}
                      />
                    )}
                  </View>
                  <View style={styles.providerStatusCopy}>
                    <Text style={styles.providerStatusEyebrow}>
                      AKTIVER KI-KANAL
                    </Text>
                    <Text style={styles.providerStatusTitle}>
                      {providerStatus.title}
                    </Text>
                    <Text numberOfLines={2} style={styles.providerStatusText}>
                      {providerStatus.detail}
                    </Text>
                  </View>
                  <StatusBadge
                    label={providerStatus.badge}
                    tone={providerStatus.tone}
                  />
                </View>
                <View style={styles.contextRow}>
                  <View style={styles.contextChip}>
                    <IconSymbol
                      name="doc.text.fill"
                      size={14}
                      color="#8B7CFF"
                    />
                    <Text numberOfLines={1} style={styles.contextText}>
                      {contextLabel}
                    </Text>
                  </View>
                  <StatusBadge
                    label={readyForChat ? "Kontrolliert" : "Offline"}
                    tone={readyForChat ? "accent" : "warning"}
                  />
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyText}>
                    {historyLoaded
                      ? settings.protectChatContent
                        ? "Geschützt gespeichert · verschlüsselt und repository-spezifisch"
                        : "Lokal gesichert · repository-spezifisch, ohne Tokens und Dateiinhalte"
                      : "Verlauf wird wiederhergestellt …"}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.75}
                    onPress={() => void clearHistory()}
                    style={styles.clearHistoryButton}
                  >
                    <Text style={styles.clearHistoryText}>Verlauf löschen</Text>
                  </TouchableOpacity>
                </View>
                <StudioSection
                  label="Konversation"
                  title="Reviewbarer Projektkontext"
                />
              </>
            }
            ListFooterComponent={
              <>
                <View style={styles.composerCard}>
                  <View style={styles.composerToolbar}>
                    <TouchableOpacity
                      accessibilityLabel="Anhänge hinzufügen"
                      accessibilityRole="button"
                      disabled={mediaPickerBusy}
                      activeOpacity={0.75}
                      onPress={() => {
                        setShowAttachMenu((current) => !current);
                        setShowToolsMenu(false);
                      }}
                      style={[
                        styles.plusButton,
                        mediaPickerBusy && styles.applyButtonDisabled,
                      ]}
                    >
                      {mediaPickerBusy ? (
                        <ActivityIndicator color="#52D8FF" size="small" />
                      ) : (
                        <Text style={styles.plusButtonText}>＋</Text>
                      )}
                      <Text style={styles.toolbarButtonText}>
                        {mediaPickerBusy ? "Auswahl …" : "Projektdateien"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityLabel="Skills und Connectoren öffnen"
                      accessibilityRole="button"
                      activeOpacity={0.75}
                      onPress={() => {
                        setShowToolsMenu((current) => !current);
                        setShowAttachMenu(false);
                      }}
                      style={styles.toolsButton}
                    >
                      <Text style={styles.toolsButtonText}>
                        ✦ Skills & Connectoren
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {showAttachMenu ? (
                    <View style={styles.attachMenu}>
                      {attachmentKinds.map(({ kind, label }) => (
                        <TouchableOpacity
                          accessibilityRole="button"
                          disabled={mediaPickerBusy}
                          key={kind}
                          onPress={() =>
                            kind === "datei"
                              ? void pickFiles()
                              : void pickMedia(kind)
                          }
                          style={[
                            styles.attachOption,
                            mediaPickerBusy && styles.applyButtonDisabled,
                          ]}
                        >
                          <Text style={styles.attachOptionIcon}>
                            {kind === "datei"
                              ? "＋"
                              : kind === "foto"
                                ? "▧"
                                : "▶"}
                          </Text>
                          <Text style={styles.attachOptionText}>
                            {label} auswählen
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                  {showToolsMenu ? (
                    <View style={styles.toolsMenu}>
                      <Text style={styles.toolsMenuLabel}>
                        SKILLS & CONNECTOREN ·{" "}
                        {enabledSkillCount(skillPreferences)} SKILLS ·{" "}
                        {enabledConnectorCount(connectorPreferences)}{" "}
                        CONNECTOREN
                      </Text>
                      <View style={styles.toolStatusRow}>
                        <Text style={styles.toolName}>Agent-Vorschläge</Text>
                        <TouchableOpacity
                          accessibilityRole="switch"
                          accessibilityState={{
                            checked: skillPreferences.agent,
                          }}
                          onPress={() => updateSkillPreference("agent")}
                          style={[
                            styles.skillToggle,
                            skillPreferences.agent && styles.skillToggleOn,
                          ]}
                        >
                          <View
                            style={[
                              styles.skillToggleKnob,
                              skillPreferences.agent &&
                                styles.skillToggleKnobOn,
                            ]}
                          />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.toolStatusRow}>
                        <Text style={styles.toolName}>Code-Diff-Prüfung</Text>
                        <TouchableOpacity
                          accessibilityRole="switch"
                          accessibilityState={{
                            checked: skillPreferences.diff,
                          }}
                          onPress={() => updateSkillPreference("diff")}
                          style={[
                            styles.skillToggle,
                            skillPreferences.diff && styles.skillToggleOn,
                          ]}
                        >
                          <View
                            style={[
                              styles.skillToggleKnob,
                              skillPreferences.diff && styles.skillToggleKnobOn,
                            ]}
                          />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.toolStatusRow}>
                        <Text style={styles.toolName}>CI-Qualitätsprüfung</Text>
                        <TouchableOpacity
                          accessibilityRole="switch"
                          accessibilityState={{
                            checked: skillPreferences.quality,
                          }}
                          onPress={() => updateSkillPreference("quality")}
                          style={[
                            styles.skillToggle,
                            skillPreferences.quality && styles.skillToggleOn,
                          ]}
                        >
                          <View
                            style={[
                              styles.skillToggleKnob,
                              skillPreferences.quality &&
                                styles.skillToggleKnobOn,
                            ]}
                          />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.toolStatusRow}>
                        <View style={styles.toolNameBlock}>
                          <Text style={styles.toolName}>Workspace-Service</Text>
                          <Text style={styles.toolDetail}>
                            {settings.hasServiceAccessToken
                              ? "Zugangsdaten hinterlegt"
                              : "Konfiguration fehlt"}
                          </Text>
                        </View>
                        <View style={styles.connectorActions}>
                          <TouchableOpacity
                            accessibilityRole="switch"
                            accessibilityState={{
                              checked: connectorPreferences.workspace,
                            }}
                            onPress={() =>
                              updateConnectorPreference("workspace")
                            }
                            style={[
                              styles.skillToggle,
                              connectorPreferences.workspace &&
                                styles.skillToggleOn,
                            ]}
                          >
                            <View
                              style={[
                                styles.skillToggleKnob,
                                connectorPreferences.workspace &&
                                  styles.skillToggleKnobOn,
                              ]}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            accessibilityRole="button"
                            disabled={
                              connectorTests.workspace.status === "testing"
                            }
                            onPress={() => void testConnector("workspace")}
                            style={styles.testButton}
                          >
                            <Text style={styles.testButtonText}>
                              {connectorTests.workspace.status === "testing"
                                ? "Prüfe …"
                                : "Testen"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            accessibilityRole="button"
                            onPress={() => router.push("/settings")}
                            style={styles.configureButton}
                          >
                            <Text style={styles.configureButtonText}>
                              Verwalten
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.connectorTestText}>
                          {connectorTests.workspace.message ??
                            "Noch nicht geprüft"}
                        </Text>
                      </View>
                      <View style={styles.toolStatusRow}>
                        <View style={styles.toolNameBlock}>
                          <Text style={styles.toolName}>GitHub-Connector</Text>
                          <Text style={styles.toolDetail}>
                            {settings.hasGitHubToken
                              ? "Token sicher hinterlegt"
                              : "Token nicht hinterlegt"}
                          </Text>
                        </View>
                        <View style={styles.connectorActions}>
                          <TouchableOpacity
                            accessibilityRole="switch"
                            accessibilityState={{
                              checked: connectorPreferences.github,
                            }}
                            onPress={() => updateConnectorPreference("github")}
                            style={[
                              styles.skillToggle,
                              connectorPreferences.github &&
                                styles.skillToggleOn,
                            ]}
                          >
                            <View
                              style={[
                                styles.skillToggleKnob,
                                connectorPreferences.github &&
                                  styles.skillToggleKnobOn,
                              ]}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            accessibilityRole="button"
                            disabled={
                              connectorTests.github.status === "testing"
                            }
                            onPress={() => void testConnector("github")}
                            style={styles.testButton}
                          >
                            <Text style={styles.testButtonText}>
                              {connectorTests.github.status === "testing"
                                ? "Prüfe …"
                                : "Testen"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            accessibilityRole="button"
                            onPress={() => router.push("/settings")}
                            style={styles.configureButton}
                          >
                            <Text style={styles.configureButtonText}>
                              Verwalten
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.connectorTestText}>
                          {connectorTests.github.message ??
                            "Noch nicht geprüft"}
                        </Text>
                      </View>
                      <View style={styles.toolStatusRow}>
                        <View style={styles.toolNameBlock}>
                          <Text style={styles.toolName}>KI-Provider</Text>
                          <Text style={styles.toolDetail}>{providerLabel}</Text>
                        </View>
                        <View style={styles.connectorActions}>
                          <TouchableOpacity
                            accessibilityRole="switch"
                            accessibilityState={{
                              checked: connectorPreferences.provider,
                            }}
                            onPress={() =>
                              updateConnectorPreference("provider")
                            }
                            style={[
                              styles.skillToggle,
                              connectorPreferences.provider &&
                                styles.skillToggleOn,
                            ]}
                          >
                            <View
                              style={[
                                styles.skillToggleKnob,
                                connectorPreferences.provider &&
                                  styles.skillToggleKnobOn,
                              ]}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            accessibilityRole="button"
                            disabled={
                              connectorTests.provider.status === "testing"
                            }
                            onPress={() => void testConnector("provider")}
                            style={styles.testButton}
                          >
                            <Text style={styles.testButtonText}>
                              {connectorTests.provider.status === "testing"
                                ? "Prüfe …"
                                : "Testen"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            accessibilityRole="button"
                            onPress={() => router.push("/settings")}
                            style={styles.configureButton}
                          >
                            <Text style={styles.configureButtonText}>
                              Verwalten
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.connectorTestText}>
                          {connectorTests.provider.message ??
                            "Noch nicht geprüft"}
                        </Text>
                      </View>
                      <Text style={styles.toolsHint}>
                        {mediaPickerBusy
                          ? "Auswahl wird geöffnet …"
                          : "Projektdateien werden lokal begrenzt gelesen; Tokens und Binärdaten werden nicht an den Agenten übergeben."}
                      </Text>
                    </View>
                  ) : null}
                  {attachments.length ? (
                    <View style={styles.attachmentList}>
                      {attachments.map((attachment) => {
                        const isPhoto = attachment.kind === "foto";
                        const isLoading = Boolean(
                          loadingPreviewIds[attachment.id],
                        );
                        return (
                          <View
                            key={attachment.id}
                            style={styles.attachmentPreviewCard}
                          >
                            {isPhoto ? (
                              <View style={styles.previewImageFrame}>
                                {isLoading ? (
                                  <View style={styles.previewLoading}>
                                    <ActivityIndicator
                                      color="#52D8FF"
                                      size="small"
                                    />
                                    <Text style={styles.previewLoadingText}>
                                      Vorschau wird geladen …
                                    </Text>
                                  </View>
                                ) : null}
                                <ExpoImage
                                  accessibilityLabel={`Vorschau von ${attachment.name}`}
                                  cachePolicy="disk"
                                  contentFit="cover"
                                  onError={() =>
                                    setPreviewLoading(attachment.id, false)
                                  }
                                  onLoadEnd={() =>
                                    setPreviewLoading(attachment.id, false)
                                  }
                                  onLoadStart={() =>
                                    setPreviewLoading(attachment.id, true)
                                  }
                                  source={{ uri: attachment.uri }}
                                  style={styles.previewImage}
                                  transition={200}
                                />
                              </View>
                            ) : (
                              <View style={styles.previewFallback}>
                                <Text style={styles.previewFallbackIcon}>
                                  {attachment.kind === "video" ? "▶" : "▤"}
                                </Text>
                                <Text style={styles.previewFallbackKind}>
                                  {attachment.kind === "video"
                                    ? "VIDEO"
                                    : "DATEI"}
                                </Text>
                              </View>
                            )}
                            <View style={styles.previewMeta}>
                              <Text
                                numberOfLines={1}
                                style={styles.attachmentName}
                              >
                                {attachment.name}
                              </Text>
                              <Text style={styles.previewKind}>
                                {attachment.kind} · bereit zur Überprüfung
                              </Text>
                            </View>
                            <TouchableOpacity
                              accessibilityLabel={`${attachment.name} entfernen`}
                              accessibilityRole="button"
                              onPress={() => removeAttachment(attachment.id)}
                              style={styles.removeAttachment}
                            >
                              <Text style={styles.removeAttachmentText}>×</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                  <Text style={styles.composerLabel}>
                    NÄCHSTER ENTWICKLUNGSAUFTRAG
                  </Text>
                  <TextInput
                    accessibilityLabel="Entwicklungsauftrag für den Agenten"
                    editable={readyForChat && !isThinking}
                    multiline
                    onChangeText={setPrompt}
                    placeholder="Beschreibe eine Änderung, einen Fehler oder ein Refactoring …"
                    placeholderTextColor="#708095"
                    style={styles.composerInput}
                    textAlignVertical="top"
                    value={prompt}
                  />
                  <PrimaryButton
                    icon="arrow.up.circle.fill"
                    label={
                      isThinking ? "Agent analysiert …" : "Vorschlag erstellen"
                    }
                    onPress={() => void submitPrompt()}
                    disabled={
                      (!prompt.trim() && attachments.length === 0) ||
                      !readyForChat ||
                      isThinking
                    }
                  />
                  <Text style={styles.composerHint}>
                    Der Agent erzeugt nur einen überprüfbaren Vorschlag. Er
                    commitet oder pusht niemals selbstständig.
                  </Text>
                  {chatError ? (
                    <Text style={styles.chatError}>{chatError}</Text>
                  ) : null}
                </View>
                <View style={styles.backupCard}>
                  <View style={styles.backupTitleRow}>
                    <IconSymbol name="lock.fill" size={16} color="#F2C979" />
                    <Text style={styles.backupTitle}>
                      VERSCHLÜSSELTES SUPPORT-BACKUP
                    </Text>
                  </View>
                  <Text style={styles.backupHint}>
                    Erzeugt eine passwortgeschützte Datei mit dem begrenzten
                    Chat-Verlauf. Zugangsdaten und vollständige Datei-Inhalte
                    sind ausgeschlossen. Das Passwort wird nicht gespeichert.
                  </Text>
                  <TextInput
                    accessibilityLabel="Passwort für verschlüsseltes Support-Backup"
                    autoCapitalize="none"
                    onChangeText={setBackupPassword}
                    placeholder="Mindestens 12 Zeichen"
                    placeholderTextColor="#708095"
                    secureTextEntry
                    style={styles.backupInput}
                    value={backupPassword}
                  />
                  <TextInput
                    accessibilityLabel="Passwort für verschlüsseltes Support-Backup wiederholen"
                    autoCapitalize="none"
                    onChangeText={setBackupPasswordRepeat}
                    placeholder="Passwort wiederholen"
                    placeholderTextColor="#708095"
                    secureTextEntry
                    style={styles.backupInput}
                    value={backupPasswordRepeat}
                  />
                  <PrimaryButton
                    icon="square.and.arrow.up"
                    label={
                      backupState === "exporting"
                        ? "Backup wird verschlüsselt …"
                        : "Freigabe prüfen und teilen"
                    }
                    onPress={confirmBackupExport}
                    disabled={
                      backupState === "exporting" ||
                      !historyLoaded ||
                      !isValidSupportBackupPassword(backupPassword) ||
                      backupPassword !== backupPasswordRepeat
                    }
                  />
                  {backupMessage ? (
                    <Text
                      style={
                        backupState === "shared"
                          ? styles.backupSuccess
                          : styles.backupError
                      }
                    >
                      {backupMessage}
                    </Text>
                  ) : null}
                  {backupIntegrityVerified && backupPreview ? (
                    <View style={styles.backupVerification}>
                      <Text style={styles.backupVerificationTitle}>
                        Integrität bestätigt · Wiederherstellungsvorschau
                      </Text>
                      <Text style={styles.backupVerificationText}>
                        {backupPreview.messageCount} Chat-Nachricht(en) im
                        Backup; es werden nur die letzten zwei Ausschnitte
                        angezeigt.
                      </Text>
                      {backupPreview.excerpts.map((excerpt, index) => (
                        <Text
                          key={`${index}-${excerpt}`}
                          numberOfLines={2}
                          style={styles.backupPreviewExcerpt}
                        >
                          „{excerpt}“
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              </>
            }
            renderItem={({ item }) => {
              const isUser = item.role === "user";
              const selectedPaths =
                selectedProposalPaths[item.id] ??
                item.proposal?.changes.map((change) => change.path) ??
                [];
              const canSelect =
                Boolean(item.proposal) &&
                item.state !== "applying" &&
                item.state !== "reverting" &&
                item.state !== "applied";
              return (
                <View
                  style={[styles.messageRow, isUser && styles.userMessageRow]}
                >
                  {!isUser ? (
                    <View style={styles.agentAvatar}>
                      <IconSymbol name="sparkles" size={16} color="#B9B2FF" />
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.messageBubble,
                      isUser ? styles.userBubble : styles.agentBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageRole,
                        isUser && styles.userMessageRole,
                      ]}
                    >
                      {isUser
                        ? "DU"
                        : item.proposal
                          ? "ÄNDERUNGSVORSCHLAG"
                          : "AGENT"}
                    </Text>
                    <Text style={styles.messageText}>{item.content}</Text>
                    {item.proposalPreview?.changes.length ? (
                      <View style={styles.changeList}>
                        {item.proposal ? (
                          <Text style={styles.selectionHint}>
                            Wähle die Dateien, die übernommen werden dürfen.
                          </Text>
                        ) : null}
                        {item.proposalPreview.changes.map((change) => {
                          const selected = selectedPaths.includes(change.path);
                          return (
                            <TouchableOpacity
                              accessibilityRole="checkbox"
                              accessibilityState={{
                                checked: selected,
                                disabled: !canSelect,
                              }}
                              activeOpacity={0.75}
                              disabled={!canSelect}
                              key={change.path}
                              onPress={() =>
                                toggleProposalFile(item.id, change.path)
                              }
                              style={[
                                styles.changeRow,
                                selected && styles.changeRowSelected,
                              ]}
                            >
                              <View
                                style={[
                                  styles.changeSelection,
                                  selected && styles.changeSelectionSelected,
                                ]}
                              >
                                {selected ? (
                                  <Text style={styles.changeSelectionMark}>
                                    ✓
                                  </Text>
                                ) : null}
                              </View>
                              <View style={styles.changeCopy}>
                                <Text style={styles.changePath}>
                                  {change.path}
                                </Text>
                                <Text
                                  numberOfLines={2}
                                  style={styles.changeExplanation}
                                >
                                  {change.explanation}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                    {item.proposal?.changes.length &&
                    item.state !== "applied" &&
                    item.state !== "reverting" ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        activeOpacity={0.75}
                        disabled={
                          item.state === "applying" || !selectedPaths.length
                        }
                        onPress={() =>
                          void applyProposal(item.id, item.proposal!)
                        }
                        style={[
                          styles.applyButton,
                          (item.state === "applying" ||
                            !selectedPaths.length) &&
                            styles.applyButtonDisabled,
                        ]}
                      >
                        <Text style={styles.applyText}>
                          {item.state === "applying"
                            ? "Übernimmt …"
                            : item.state === "error" ||
                                item.state === "reverted"
                              ? "Auswahl erneut übernehmen"
                              : `${selectedPaths.length} Datei(en) übernehmen`}
                        </Text>
                        <IconSymbol
                          name="arrow.right"
                          size={14}
                          color="#DFF7FF"
                        />
                      </TouchableOpacity>
                    ) : null}
                    {item.state === "applied" ? (
                      <>
                        <Text style={styles.appliedText}>
                          Übernommen · Commit und Push bleiben in deiner
                          Kontrolle.
                        </Text>
                        <TouchableOpacity
                          accessibilityRole="button"
                          activeOpacity={0.75}
                          disabled={!appliedSnapshots[item.id]}
                          onPress={() => void undoProposal(item.id)}
                          style={[
                            styles.undoButton,
                            !appliedSnapshots[item.id] &&
                              styles.applyButtonDisabled,
                          ]}
                        >
                          <Text style={styles.undoText}>Rückgängig</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                    {item.state === "reverting" ? (
                      <Text style={styles.restoredText}>
                        Vorherige Inhalte werden wiederhergestellt …
                      </Text>
                    ) : null}
                    {item.state === "reverted" ? (
                      <Text style={styles.restoredText}>
                        Rückgängig gemacht · die ursprünglichen Datei-Inhalte
                        sind wieder im Remote-Workspace.
                      </Text>
                    ) : null}
                    {item.state === "restored" &&
                    item.proposalPreview?.changes.length ? (
                      <Text style={styles.restoredText}>
                        Nach Neustart wiederhergestellt · bitte Auftrag erneut
                        senden, bevor Dateien übernommen werden.
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            }}
            showsVerticalScrollIndicator={false}
          />
        </KeyboardAvoidingView>
      </StudioErrorBoundary>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 20 },
  chatHero: {
    alignItems: "center",
    backgroundColor: "#171827",
    borderColor: "#37335C",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 16,
  },
  chatHeroIcon: {
    alignItems: "center",
    backgroundColor: "#302B5A",
    borderRadius: 17,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  chatHeroCopy: { flex: 1 },
  chatHeroTitle: {
    color: "#F5F2FF",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  chatHeroText: { color: "#A7A5BC", fontSize: 11, lineHeight: 16 },
  promptChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 16,
  },
  promptChip: {
    backgroundColor: "#121827",
    borderColor: "#2E3C55",
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  promptChipText: { color: "#B8C7DB", fontSize: 10, fontWeight: "800" },
  readinessCard: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 13,
    padding: 12,
  },
  readinessReady: { backgroundColor: "#181A2F", borderColor: "#4D477A" },
  readinessWaiting: { backgroundColor: "#211D16", borderColor: "#6A542A" },
  readinessIcon: {
    alignItems: "center",
    backgroundColor: "#25233E",
    borderRadius: 11,
    height: 35,
    justifyContent: "center",
    width: 35,
  },
  readinessCopy: { flex: 1 },
  readinessTitle: {
    color: "#EDF4FC",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 3,
  },
  readinessText: { color: "#9CAABD", fontSize: 11, lineHeight: 16 },
  providerStatusCard: {
    alignItems: "center",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 13,
    padding: 11,
  },
  providerStatusLocal: { backgroundColor: "#132B2D", borderColor: "#2F746B" },
  providerStatusCloud: { backgroundColor: "#17253A", borderColor: "#315D82" },
  providerStatusWarning: { backgroundColor: "#2A2118", borderColor: "#8A6330" },
  providerStatusIcon: {
    alignItems: "center",
    backgroundColor: "#0D151E",
    borderRadius: 12,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  providerStatusDot: { borderRadius: 6, height: 11, width: 11 },
  providerStatusDotLocal: { backgroundColor: "#78DFA8" },
  providerStatusDotCloud: { backgroundColor: "#52D8FF" },
  providerStatusDotWarning: { backgroundColor: "#F6BA5E" },
  providerStatusCopy: { flex: 1, minWidth: 0 },
  providerStatusEyebrow: {
    color: "#8E9CAF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  providerStatusTitle: { color: "#EFF6FF", fontSize: 12, fontWeight: "900" },
  providerStatusText: {
    color: "#AAB8C9",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  contextRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 25,
  },
  contextChip: {
    alignItems: "center",
    backgroundColor: "#171C29",
    borderColor: "#2A3449",
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    maxWidth: 220,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  contextText: {
    color: "#C9D4E2",
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  historyRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    marginTop: -12,
  },
  historyText: {
    color: "#8294A9",
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    marginRight: 8,
  },
  clearHistoryButton: {
    alignItems: "center",
    borderColor: "#3A4659",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  clearHistoryText: { color: "#AAB8C8", fontSize: 10, fontWeight: "800" },
  messageRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 9,
    marginBottom: 13,
  },
  userMessageRow: { justifyContent: "flex-end" },
  agentAvatar: {
    alignItems: "center",
    backgroundColor: "#25233E",
    borderRadius: 13,
    height: 27,
    justifyContent: "center",
    marginTop: 4,
    width: 27,
  },
  messageBubble: {
    borderRadius: 17,
    maxWidth: "84%",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  agentBubble: { backgroundColor: "#151C29", borderTopLeftRadius: 5 },
  userBubble: { backgroundColor: "#20354A", borderTopRightRadius: 5 },
  messageRole: {
    color: "#B9B2FF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  userMessageRole: { color: "#78DCF7" },
  messageText: { color: "#E5ECF5", fontSize: 14, lineHeight: 20 },
  changeList: {
    borderTopColor: "#2A3548",
    borderTopWidth: 1,
    marginTop: 11,
    paddingTop: 4,
  },
  selectionHint: {
    color: "#9DACBD",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 7,
  },
  changeRow: {
    alignItems: "center",
    borderRadius: 9,
    flexDirection: "row",
    gap: 8,
    marginTop: 7,
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  changeRowSelected: { backgroundColor: "#1B3142" },
  changeSelection: {
    alignItems: "center",
    borderColor: "#63718A",
    borderRadius: 5,
    borderWidth: 1,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  changeSelectionSelected: {
    backgroundColor: "#52D8FF",
    borderColor: "#52D8FF",
  },
  changeSelectionMark: {
    color: "#071218",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
  },
  changeCopy: { flex: 1 },
  changePath: {
    color: "#C9C0FF",
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "800",
  },
  changeExplanation: {
    color: "#9DACBD",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  applyButton: {
    alignItems: "center",
    backgroundColor: "#206275",
    borderColor: "#52D8FF",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    marginTop: 13,
    minHeight: 44,
    paddingVertical: 10,
  },
  applyButtonDisabled: { opacity: 0.55 },
  applyText: { color: "#E6FAFF", fontSize: 12, fontWeight: "900" },
  undoButton: {
    alignItems: "center",
    borderColor: "#B49A5C",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  undoText: { color: "#F2C979", fontSize: 12, fontWeight: "900" },
  appliedText: {
    color: "#78DFA8",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 12,
  },
  restoredText: {
    color: "#F2C979",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
  },
  composerCard: {
    backgroundColor: "#151A25",
    borderColor: "#303D53",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 8,
    padding: 14,
  },
  composerToolbar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  plusButton: {
    alignItems: "center",
    borderColor: "#3D536B",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 108,
    paddingHorizontal: 10,
  },
  plusButtonText: { color: "#52D8FF", fontSize: 25, lineHeight: 28 },
  toolbarButtonText: { color: "#C7D4E4", fontSize: 11, fontWeight: "800" },
  toolsButton: {
    alignItems: "center",
    borderColor: "#493F70",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  toolsButtonText: { color: "#C9BFFF", fontSize: 11, fontWeight: "800" },
  attachMenu: {
    backgroundColor: "#0E151F",
    borderColor: "#33445B",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    marginBottom: 10,
    padding: 7,
  },
  attachOption: {
    alignItems: "center",
    borderColor: "#2E4057",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 5,
  },
  attachOptionIcon: { color: "#52D8FF", fontSize: 20, marginBottom: 2 },
  attachOptionText: {
    color: "#C9D6E5",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  toolsMenu: {
    backgroundColor: "#111622",
    borderColor: "#493F70",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12,
  },
  toolsMenuLabel: {
    color: "#9D91E8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  toolStatusRow: {
    alignItems: "center",
    borderBottomColor: "#2B3448",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 38,
  },
  toolName: { color: "#D7E1EE", fontSize: 12, fontWeight: "700" },
  toolStatusActive: { color: "#78DFA8", fontSize: 10, fontWeight: "900" },
  toolNameBlock: { flex: 1, paddingVertical: 7 },
  toolDetail: { color: "#8798AD", fontSize: 10, marginTop: 2 },
  connectorActions: { alignItems: "center", flexDirection: "row", gap: 7 },
  configureButton: {
    alignItems: "center",
    borderColor: "#3D536B",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 8,
  },
  configureButtonText: { color: "#9FD9E8", fontSize: 10, fontWeight: "800" },
  testButton: {
    alignItems: "center",
    borderColor: "#27677D",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 8,
  },
  testButtonText: { color: "#66D9F3", fontSize: 10, fontWeight: "800" },
  connectorTestText: {
    color: "#8293A8",
    fontSize: 9,
    marginLeft: 8,
    marginTop: -1,
  },
  skillToggle: {
    alignItems: "flex-start",
    backgroundColor: "#2A3548",
    borderColor: "#53627A",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 30,
    padding: 3,
    width: 52,
  },
  skillToggleOn: {
    alignItems: "flex-end",
    backgroundColor: "#1C6377",
    borderColor: "#52D8FF",
  },
  skillToggleKnob: {
    backgroundColor: "#9EACBD",
    borderRadius: 11,
    height: 22,
    width: 22,
  },
  skillToggleKnobOn: { backgroundColor: "#DFFAFF" },
  toolStatusMuted: { color: "#8293A8", fontSize: 10, fontWeight: "900" },
  toolsHint: { color: "#8798AD", fontSize: 10, lineHeight: 15, marginTop: 8 },
  attachmentList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  attachmentPreviewCard: {
    backgroundColor: "#101925",
    borderColor: "#30445D",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 74,
    overflow: "hidden",
    width: "100%",
  },
  previewImageFrame: {
    backgroundColor: "#0A111B",
    height: 74,
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    width: 88,
  },
  previewImage: { height: "100%", width: "100%" },
  previewLoading: {
    alignItems: "center",
    backgroundColor: "#0A111B",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  },
  previewLoadingText: {
    color: "#A7B8CB",
    fontSize: 8,
    marginTop: 3,
    textAlign: "center",
  },
  previewFallback: {
    alignItems: "center",
    backgroundColor: "#16253A",
    height: 74,
    justifyContent: "center",
    width: 88,
  },
  previewFallbackIcon: { color: "#52D8FF", fontSize: 23, fontWeight: "900" },
  previewFallbackKind: {
    color: "#829DB8",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  previewMeta: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: 10,
  },
  previewKind: { color: "#8293A8", fontSize: 9, marginTop: 4 },
  attachmentChip: {
    alignItems: "center",
    backgroundColor: "#1B2B3C",
    borderColor: "#3A6A80",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    maxWidth: "100%",
    minHeight: 32,
    paddingLeft: 10,
    paddingRight: 4,
  },
  attachmentName: {
    color: "#BFEAF6",
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "700",
  },
  removeAttachment: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    minWidth: 28,
  },
  removeAttachmentText: { color: "#9CB4C6", fontSize: 20, lineHeight: 22 },
  composerLabel: {
    color: "#75859B",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 9,
  },
  composerInput: {
    color: "#EEF4FC",
    fontSize: 14,
    lineHeight: 20,
    maxHeight: 120,
    minHeight: 88,
    padding: 0,
  },
  composerHint: {
    color: "#8293A8",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
  },
  chatError: { color: "#FF9AA4", fontSize: 11, lineHeight: 16, marginTop: 9 },
  backupCard: {
    backgroundColor: "#191712",
    borderColor: "#62502D",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  backupTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginBottom: 7,
  },
  backupTitle: {
    color: "#F2D48F",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  backupHint: {
    color: "#B5A987",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 11,
  },
  backupInput: {
    backgroundColor: "#121823",
    borderColor: "#51442C",
    borderRadius: 10,
    borderWidth: 1,
    color: "#EDF4FC",
    fontSize: 13,
    marginBottom: 8,
    minHeight: 44,
    paddingHorizontal: 11,
  },
  backupSuccess: {
    color: "#78DFA8",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 9,
  },
  backupError: { color: "#FF9AA4", fontSize: 11, lineHeight: 16, marginTop: 9 },
  backupVerification: {
    borderTopColor: "#665632",
    borderTopWidth: 1,
    marginTop: 11,
    paddingTop: 10,
  },
  backupVerificationTitle: {
    color: "#8DE3B6",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 4,
  },
  backupVerificationText: { color: "#C4B993", fontSize: 10, lineHeight: 15 },
  backupPreviewExcerpt: {
    color: "#E2D9C0",
    fontSize: 10,
    fontStyle: "italic",
    lineHeight: 15,
    marginTop: 6,
  },
});
