/**
 * Sprint 179 — Workspace-Screen auf "CyberSarah Future Glass" uebertragen.
 * Logik unveraendert; visuelle Schicht auf das Glass-System umgestellt:
 * GlassBackdrop, Glass-Typografie (inkl. Einstellungs-Aktion im Header),
 * StatusChip, GlowButton, Farb-Token statt useColors und Hand-Hexes.
 */
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlowButton, StatusChip } from "@/components/glass/glass-primitives";
import { accentAlpha, glassDepth, glassPalette, glassSurface, glassType } from "@/lib/design/future-glass";
import { ScreenContainer } from "@/components/screen-container";
import { StudioErrorBoundary } from "@/components/studio/studio-error-boundary";
import { DiffConfirmationSheet } from "@/components/studio/diff-confirmation-sheet";
import { NextStepGuide } from "@/components/studio/next-step-guide";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { resolveAppVariant, showDevSurface } from "@/lib/app-variant-logic";
import { getDevelopmentGuidance, type DevelopmentGuidanceAction, type DevelopmentGuidanceStep } from "@/lib/development-guidance-logic";
import { getDetailedFileDiffPreviews, getFileDiffSummaries } from "@/lib/file-diff-logic";
import { getProtectedBranchWarning, isProtectedBranch } from "@/lib/protected-branch-logic";
import type { RemoteHealth, RepositoryQuality } from "@/lib/remote-workspace-client";
import { useStudioSettings } from "@/lib/studio-settings";
import { getRepositoryLabel } from "@/lib/studio-settings-logic";
import { useWorkspace } from "@/lib/workspace-context";
import { assessConflict } from "@/lib/conflict-resolution-logic";
import { getWorkspaceSyncState } from "@/lib/workspace-sync-logic";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { darken, lighten, withAlpha } from "@/lib/theme-color-utils";

export default function WorkspaceScreen() {
  const { changedFileCount, files, hydrateFile, loadRemoteFiles, markFilesSynced, saveDraft, selectFile, selectedFile, selectedFileId, updateFile } = useWorkspace();
  const { commitRepository, createRepositoryPullRequest, loadRepositoryDetails, loadRepositoryQuality, loadWorkspaceHealth, pushRepository, readAttachedFile, settings, switchRepositoryBranch, syncRemoteChanges } = useStudioSettings();
  const hasWorkspaceService = Boolean(settings.workspaceUrl);
  const hasAttachedRepository = Boolean(settings.workspaceId);
  const repositoryLabel = getRepositoryLabel(settings.repositoryUrl);
  const [branches, setBranches] = useState<string[]>([]);
  const [commits, setCommits] = useState<{ shortHash: string; author: string; committedAt: string; message: string }[]>([]);
  const [repositoryState, setRepositoryState] = useState<"idle" | "loading" | "ready" | "switching" | "error">("idle");
  const [repositoryError, setRepositoryError] = useState("");
  const [quality, setQuality] = useState<RepositoryQuality | null>(null);
  const [qualityState, setQualityState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [qualityError, setQualityError] = useState("");
  const [commitMessage, setCommitMessage] = useState("Update from Custom AI Studio");
  const [gitAction, setGitAction] = useState<"idle" | "saving" | "committing" | "committed" | "pushing" | "pushed" | "error">("idle");
  const [gitFeedback, setGitFeedback] = useState("");
  const [pullRequestTitle, setPullRequestTitle] = useState("");
  const [pullRequestBody, setPullRequestBody] = useState("");
  const [pullRequestBase, setPullRequestBase] = useState("main");
  const [pullRequestState, setPullRequestState] = useState<"idle" | "creating" | "created" | "error">("idle");
  const [pullRequestFeedback, setPullRequestFeedback] = useState("");
  const [serviceHealth, setServiceHealth] = useState<RemoteHealth | null>(null);
  const [healthState, setHealthState] = useState<"idle" | "checking" | "ready" | "error">("idle");
  const [healthError, setHealthError] = useState("");
  const [healthCheckedAt, setHealthCheckedAt] = useState<string | null>(null);
  const [remoteAhead, setRemoteAhead] = useState(false);
  const [remoteCheckAvailable, setRemoteCheckAvailable] = useState(true);
  const [guidanceFeedback, setGuidanceFeedback] = useState("");
  const [pendingGuidanceStep, setPendingGuidanceStep] = useState<DevelopmentGuidanceStep | null>(null);
  const changedRemoteFiles = useMemo(() => files.filter((file) => file.changed && file.remote), [files]);
  const diffSummaries = useMemo(() => getFileDiffSummaries(changedRemoteFiles.map((file) => ({ path: file.path, before: file.remoteContent ?? "", after: file.content }))), [changedRemoteFiles]);
  const detailedDiffPreviews = useMemo(() => getDetailedFileDiffPreviews(changedRemoteFiles.map((file) => ({ path: file.path, before: file.remoteContent ?? "", after: file.content }))), [changedRemoteFiles]);
  const currentBranchIsProtected = isProtectedBranch(settings.branch);
  const syncState = getWorkspaceSyncState(changedRemoteFiles.length, remoteAhead);
  const appVariant = resolveAppVariant(process.env.EXPO_PUBLIC_APP_VARIANT);
  const showGuidance = showDevSurface(appVariant, "developmentGuidance");
  const showDiagnosis = showDevSurface(appVariant, "serviceDiagnosis");
  const guidance = useMemo(() => getDevelopmentGuidance({ hasWorkspaceService, hasRepository: hasAttachedRepository, changedFileCount: changedRemoteFiles.length, hasConflictRisk: syncState.hasConflictRisk, serviceHealthy: healthState === "ready" && serviceHealth?.status === "ready", ciState: qualityState, ciFailed: quality?.ci.failed ?? 0, branch: settings.branch, lastGitAction: gitAction }), [changedRemoteFiles.length, gitAction, hasAttachedRepository, hasWorkspaceService, healthState, quality?.ci.failed, qualityState, serviceHealth?.status, settings.branch, syncState.hasConflictRisk]);

  const refreshHealth = useCallback(async () => {
    if (!hasWorkspaceService) return;
    setHealthState("checking");
    setHealthError("");
    try {
      const result = await loadWorkspaceHealth();
      setServiceHealth(result);
      setHealthState("ready");
      setHealthCheckedAt(new Date().toISOString());
    } catch (error) {
      setHealthState("error");
      setHealthError(error instanceof Error ? error.message : "Der Workspace-Service ist momentan nicht erreichbar.");
    }
  }, [hasWorkspaceService, loadWorkspaceHealth]);

  const refreshRepository = useCallback(async () => {
    if (!hasAttachedRepository) return;
    setRepositoryState("loading");
    setRepositoryError("");
    setQualityState("loading");
    setQualityError("");
    const [detailsResult, qualityResult] = await Promise.allSettled([loadRepositoryDetails(), loadRepositoryQuality()]);
    if (detailsResult.status === "fulfilled") {
      const details = detailsResult.value;
      setBranches(details.branches);
      setCommits(details.commits);
      setRemoteAhead(details.remoteAhead);
      setRemoteCheckAvailable(details.remoteCheckAvailable);
      setRepositoryState("ready");
    } else {
      setRepositoryState("error");
      setRepositoryError(detailsResult.reason instanceof Error ? detailsResult.reason.message : "Branch- und Commit-Daten konnten nicht geladen werden.");
    }
    if (qualityResult.status === "fulfilled") {
      setQuality(qualityResult.value);
      setQualityState("ready");
    } else {
      setQualityState("error");
      setQualityError(qualityResult.reason instanceof Error ? qualityResult.reason.message : "Merge- und CI-Status konnten nicht geladen werden.");
    }
  }, [hasAttachedRepository, loadRepositoryDetails, loadRepositoryQuality]);

  const refreshQuality = useCallback(async () => {
    if (!hasAttachedRepository) return;
    setQualityState("loading");
    setQualityError("");
    try {
      setQuality(await loadRepositoryQuality());
      setQualityState("ready");
    } catch (error) {
      setQualityState("error");
      setQualityError(error instanceof Error ? error.message : "Der CI-Status konnte nicht aktualisiert werden.");
    }
  }, [hasAttachedRepository, loadRepositoryQuality]);

  // Fetch-on-Mount: Refresh-Callbacks setzen synchron "loading" — das ist hier
  // gewollt (initialer Ladezustand), daher dokumentierte Ausnahme statt Refactor.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshRepository(); }, [refreshRepository]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshHealth(); }, [refreshHealth]);

  const chooseBranch = async (branch: string) => {
    if (branch === settings.branch || repositoryState === "switching") return;
    setRepositoryState("switching");
    setRepositoryError("");
    try {
      const result = await switchRepositoryBranch(branch);
      loadRemoteFiles(result.files);
      await refreshRepository();
    } catch (error) {
      setRepositoryState("error");
      setRepositoryError(error instanceof Error ? error.message : "Der Branch konnte nicht gewechselt werden.");
    }
  };

  const commitChanges = async () => {
    const changedFiles = changedRemoteFiles;
    if (!changedFiles.length || commitMessage.trim().length < 3) return;
    setGitFeedback("");
    try {
      setGitAction("saving");
      await syncRemoteChanges(changedFiles.map(({ path, content }) => ({ path, content })));
      setGitAction("committing");
      const result = await commitRepository(commitMessage);
      markFilesSynced(changedFiles.map((file) => file.id));
      setGitAction("committed");
      setGitFeedback(`Commit ${result.hash} erstellt. Jetzt kannst du den Branch hochladen.`);
      await refreshRepository();
    } catch (error) {
      setGitAction("error");
      setGitFeedback(error instanceof Error ? error.message : "Der Commit konnte nicht erstellt werden.");
    }
  };

  const executePush = async () => {
    if (gitAction !== "committed") return;
    setGitFeedback("");
    try {
      setGitAction("pushing");
      const result = await pushRepository();
      setGitAction("pushed");
      setGitFeedback(`Branch ${result.branch} wurde erfolgreich zu GitHub hochgeladen.`);
      setPullRequestTitle(commitMessage.trim());
      setPullRequestState("idle");
      setPullRequestFeedback("");
      await refreshRepository();
    } catch (error) {
      setGitAction("error");
      setGitFeedback(error instanceof Error ? error.message : "Der Push konnte nicht abgeschlossen werden.");
    }
  };

  const pushChanges = () => {
    if (gitAction !== "committed") return;
    if (!currentBranchIsProtected) {
      void executePush();
      return;
    }
    Alert.alert("Geschützter Branch", getProtectedBranchWarning(settings.branch), [
      { text: "Abbrechen", style: "cancel" },
      { text: "Weiter", onPress: () => Alert.alert("Push endgültig bestätigen", `Bestätige den Push auf „${settings.branch}“ ein zweites Mal. Der Vorgang kann nicht aus der App zurückgenommen werden.`, [{ text: "Abbrechen", style: "cancel" }, { text: "Push ausführen", style: "destructive", onPress: () => void executePush() }]) },
    ]);
  };

  const createPullRequest = async () => {
    if (gitAction !== "pushed" || pullRequestState === "creating" || pullRequestTitle.trim().length < 3 || pullRequestBase.trim() === settings.branch) return;
    setPullRequestState("creating");
    setPullRequestFeedback("");
    try {
      const result = await createRepositoryPullRequest({ baseBranch: pullRequestBase.trim(), title: pullRequestTitle.trim(), body: pullRequestBody.trim() });
      setPullRequestState("created");
      setPullRequestFeedback(`Pull Request #${result.number} erstellt: ${result.url}`);
    } catch (error) {
      setPullRequestState("error");
      setPullRequestFeedback(error instanceof Error ? error.message : "Der Pull Request konnte nicht erstellt werden.");
    }
  };

  const handleGuidanceAction = (action: DevelopmentGuidanceAction) => {
    setGuidanceFeedback("");
    if (action === "settings") {
      router.push("/settings" as never);
      return;
    }
    if (action === "agent") {
      router.push("/agent" as never);
      return;
    }
    if (action === "health") {
      void refreshHealth();
      setGuidanceFeedback("Die Service-Diagnose wird aktualisiert.");
      return;
    }
    if (action === "repository") {
      void refreshRepository();
      setGuidanceFeedback("Branch-, Commit- und Qualitätsdaten werden aktualisiert.");
      return;
    }
    if (action === "quality") {
      void refreshQuality();
      setGuidanceFeedback("Die CI-Qualität wird aktualisiert.");
      return;
    }
    if (action === "release") {
      Alert.alert("Release bereit", "Der Branch ist synchronisiert und die Qualitätsprüfung ist grün. Öffne jetzt die Publish-Oberfläche, um den verwalteten Android-APK-Build zu starten.", [{ text: "Schließen", style: "cancel" }]);
      setGuidanceFeedback("Der Release-Handoff ist bereit. Starte den APK-Build über Publish.");
      return;
    }
    const firstChangedFile = changedRemoteFiles[0];
    if (firstChangedFile) {
      selectFile(firstChangedFile.id);
      setGuidanceFeedback(`„${firstChangedFile.name}“ ist ausgewählt. Die Diff-Vorschau und Commit-Leiste folgen im Editorbereich.`);
    } else {
      setGuidanceFeedback("Keine lokalen Remote-Änderungen zum Prüfen vorhanden.");
    }
  };

  const requestGuidanceAction = (action: DevelopmentGuidanceAction) => {
    const step = [guidance.primary, ...guidance.secondary].find((candidate) => candidate.action === action);
    if (step) setPendingGuidanceStep(step);
  };

  const confirmGuidanceAction = () => {
    if (!pendingGuidanceStep) return;
    const action = pendingGuidanceStep.action;
    setPendingGuidanceStep(null);
    handleGuidanceAction(action);
  };

  return (
    <GlassBackdrop accent="blue">
      <ScreenContainer className="px-5" containerClassName="bg-transparent" edges={["top", "left", "right", "bottom"]}>
      <FlatList
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                windowSize={9}
        contentContainerStyle={styles.content}
        data={files}
        keyExtractor={(file) => file.id}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>CUSTOM AI STUDIO</Text>
                <Text style={styles.screenTitle}>Workspace</Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Workspace-Einstellungen"
                accessibilityRole="button"
                onPress={() => router.push("/settings" as never)}
                style={styles.headerAction}
              >
                <IconSymbol name="gearshape.fill" size={18} color={glassSurface.textSecondary} />
              </TouchableOpacity>
            </View>
            {showGuidance ? <NextStepGuide actionMessage={guidanceFeedback} completion={guidance.completion} guidance={guidance} onAction={requestGuidanceAction} /> : null}
            <View style={styles.projectCard}>
              <View style={styles.projectTopLine}>
                <View style={styles.projectIdentity}>
                  <View style={styles.projectIcon}>
                    <IconSymbol name="folder.fill" size={20} color={glassPalette.cyan} />
                  </View>
                  <View>
                    <Text style={styles.projectName}>{repositoryLabel}</Text>
                    <Text style={styles.projectPath}>{hasWorkspaceService ? settings.workspaceUrl : "Lokaler Arbeitsbereich"}</Text>
                  </View>
                </View>
                <StatusChip label={currentBranchIsProtected ? `${settings.branch} · geschützt` : settings.branch} accent={currentBranchIsProtected ? "amber" : "cyan"} />
              </View>
              <View style={styles.projectFooter}>
                <Text style={styles.projectState}>{syncState.offlineDraftCount ? `${syncState.offlineDraftCount} Offline-Entwurf(e)` : "Keine offenen Änderungen"}</Text>
                <StatusChip label={syncState.hasConflictRisk ? "Möglicher Konflikt" : hasAttachedRepository ? "Repository verbunden" : hasWorkspaceService ? "Service konfiguriert" : "Remote ausstehend"} accent={syncState.hasConflictRisk ? "amber" : hasAttachedRepository || hasWorkspaceService ? "green" : "amber"} />
              </View>
            </View>
            {hasWorkspaceService && showDiagnosis ? <View style={[styles.healthPanel, healthState === "error" && styles.healthPanelError]}><View style={styles.healthHeader}><View><Text style={styles.healthEyebrow}>SERVICE-DIAGNOSE</Text><Text style={styles.healthTitle}>{healthState === "checking" ? "Verbindung wird geprüft …" : healthState === "ready" && serviceHealth ? serviceHealth.status === "ready" ? "Workspace-Service erreichbar" : "Workspace-Service beschäftigt" : "Verbindungsstatus ausstehend"}</Text></View><TouchableOpacity accessibilityLabel="Workspace-Service prüfen" activeOpacity={0.75} disabled={healthState === "checking"} onPress={() => void refreshHealth()} style={[styles.refreshButton, healthState === "checking" && styles.healthButtonDisabled]}><Text style={styles.refreshButtonText}>{healthState === "checking" ? "Prüft …" : "Prüfen"}</Text></TouchableOpacity></View><Text style={[styles.healthDetail, healthState === "error" && styles.repositoryError]}>{healthState === "ready" && serviceHealth ? `Version ${serviceHealth.version}${serviceHealth.storage ? ` · ${serviceHealth.storage.mode === "postgres" ? "Persistenter Speicher aktiv (kostenloses Postgres-Backup)" : serviceHealth.storage.persistent ? "Persistenter Speicher aktiv" : "Ephemerer Speicher (Free-Tier)"}` : ""}${serviceHealth.previewUrl ? " · Vorschau verfügbar" : " · Keine Laufzeitvorschau gemeldet"}${healthCheckedAt ? ` · geprüft ${formatCommitDate(healthCheckedAt)}` : ""}` : healthState === "error" ? healthError : "Die Diagnose prüft Service-Erreichbarkeit ohne Repository-Daten zu verändern."}</Text></View> : null}
            <StudioErrorBoundary section="Repository-Ansicht">{hasAttachedRepository ? (
              <View style={styles.repositoryPanel}>
                <View style={styles.repositoryHeader}>
                  <View>
                    <Text style={styles.repositoryEyebrow}>REPOSITORY</Text>
                    <Text style={styles.repositoryTitle}>Branch & Commits</Text>
                  </View>
                  <TouchableOpacity accessibilityLabel="Branch- und Commit-Daten aktualisieren" activeOpacity={0.75} onPress={() => void refreshRepository()} style={styles.refreshButton}>
                    <Text style={styles.refreshButtonText}>{repositoryState === "loading" ? "Lädt …" : "Aktualisieren"}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.repositoryHint}>{repositoryState === "switching" ? "Branch wird sicher im Workspace-Service gewechselt …" : "Wähle einen Remote-Branch. Nicht gespeicherte lokale Änderungen werden nicht automatisch übertragen."}</Text>
                <View style={styles.branchList}>
                  {branches.length ? branches.map((branch) => {
                    const selected = branch === settings.branch;
                    return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} activeOpacity={0.75} disabled={repositoryState === "switching"} key={branch} onPress={() => void chooseBranch(branch)} style={[styles.branchChip, selected && styles.branchChipSelected]}><Text style={[styles.branchChipText, selected && styles.branchChipTextSelected]}>{branch}</Text></TouchableOpacity>;
                  }) : <Text style={styles.emptyRepositoryText}>{repositoryState === "loading" ? "Branch-Liste wird geladen …" : "Noch keine Remote-Branches verfügbar."}</Text>}
                </View>
                <View style={styles.commitDivider} />
                <Text style={styles.commitLabel}>LETZTE COMMITS</Text>
                {commits.length ? commits.slice(0, 5).map((commit) => (
                  <View key={commit.shortHash} style={styles.commitRow}>
                    <View style={styles.commitHash}><Text style={styles.commitHashText}>{commit.shortHash}</Text></View>
                    <View style={styles.commitTextArea}><Text numberOfLines={1} style={styles.commitMessage}>{commit.message}</Text><Text numberOfLines={1} style={styles.commitMeta}>{commit.author} · {formatCommitDate(commit.committedAt)}</Text></View>
                  </View>
                )) : <Text style={styles.emptyRepositoryText}>{repositoryState === "loading" ? "Commit-Historie wird geladen …" : "Noch keine Commits verfügbar."}</Text>}
                <View style={styles.qualityDivider} />
                <View style={styles.qualityHeader}><Text style={styles.qualityLabel}>BUILD-QUALITÄT</Text><TouchableOpacity accessibilityLabel="CI-Status aktualisieren" activeOpacity={0.75} disabled={qualityState === "loading"} onPress={() => void refreshQuality()} style={[styles.qualityRefreshButton, qualityState === "loading" && styles.gitActionDisabled]}><Text style={styles.qualityRefresh}>{qualityState === "loading" ? "Prüft …" : "CI aktualisieren"}</Text></TouchableOpacity></View>
                {qualityState === "ready" && quality ? <RepositoryQualityPanel quality={quality} /> : <Text style={[styles.emptyRepositoryText, qualityState === "error" && styles.repositoryError]}>{qualityState === "error" ? qualityError : "Merge- und CI-Status werden geladen …"}</Text>}
                {repositoryState === "error" ? <Text style={styles.repositoryError}>{repositoryError}</Text> : null}
              </View>
            ) : null}</StudioErrorBoundary>
            <Text style={styles.sectionLabel}>EXPLORER</Text>
            <Text style={styles.sectionTitle}>Projektdateien</Text>
          </>
        }
        ListFooterComponent={
          <>
            <View style={styles.editorHeader}>
              <View style={styles.editorFileIdentity}>
                <IconSymbol name="doc.text.fill" size={17} color={glassPalette.cyan} />
                <View>
                  <Text style={styles.editorFileName}>{selectedFile.name}</Text>
                  <Text style={styles.editorPath}>{selectedFile.path}</Text>
                </View>
              </View>
              {selectedFile.changed ? <StatusChip label="Geändert" accent="amber" /> : <StatusChip label="Gespeichert" accent="green" />}
            </View>
            <View style={styles.editorShell}>
              <View style={styles.lineRail}>
                <Text style={styles.lineNumber}>1</Text>
                <Text style={styles.lineNumber}>2</Text>
                <Text style={styles.lineNumber}>3</Text>
                <Text style={styles.lineNumber}>4</Text>
                <Text style={styles.lineNumber}>5</Text>
              </View>
              <TextInput
                accessibilityLabel={`Code für ${selectedFile.name}`}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                onChangeText={(content) => updateFile(selectedFile.id, content)}
                scrollEnabled={false}
                spellCheck={false}
                style={styles.codeInput}
                textAlignVertical="top"
                value={selectedFile.content}
              />
            </View>
            <View style={styles.editorAction}>
              <GlowButton accent="cyan" label="Entwurf speichern" onPress={saveDraft} disabled={!selectedFile.changed} />
            </View>
            {hasAttachedRepository ? (
                <View style={styles.gitBar}>
                  <View style={styles.gitBarHeader}><Text style={styles.gitBarEyebrow}>GIT-ÄNDERUNGEN</Text><Text style={styles.gitBarCount}>{changedFileCount ? `${changedFileCount} Datei(en) bereit` : "Keine lokalen Änderungen"}</Text></View>
                  {syncState.offlineDraftCount ? <Text style={[styles.gitHint, syncState.hasConflictRisk && styles.conflictWarning]}>{syncState.hasConflictRisk ? `Möglicher Konflikt: ${settings.branch} hat neue Remote-Commits. Prüfe Diff und ziehe den Branch vor dem Commit ab.` : remoteCheckAvailable ? "Offline-Entwürfe: Diese Änderungen wurden seit dem letzten Remote-Abgleich noch nicht synchronisiert." : "Offline-Entwürfe: Der Remote-Abgleich ist derzeit nicht verfügbar."}</Text> : null}
                  {diffSummaries.length ? <View style={styles.diffPreview}><Text style={styles.diffPreviewTitle}>SYNCHRONISIERUNGSVORSCHAU</Text>{diffSummaries.slice(0, 4).map((summary) => <View key={summary.path} style={styles.diffRow}><Text numberOfLines={1} style={styles.diffPath}>{summary.path}</Text><Text style={styles.diffCounts}>+{summary.addedLines} / −{summary.removedLines}</Text>{(() => { try { const a = assessConflict({ path: summary.path, localHash: summary.path + "-local", remoteHash: summary.path + "-remote", baseHash: null }); return a.safeAutoResolve ? null : <Text style={styles.conflictKind}>manuell</Text>; } catch { return null; } })()}</View>)}{diffSummaries.length > 4 ? <Text style={styles.diffMore}>+ {diffSummaries.length - 4} weitere Datei(en)</Text> : null}</View> : changedRemoteFiles.length ? <Text style={styles.gitHint}>Dateiinhalte werden geladen, bevor eine zeilenbasierte Vorschau möglich ist.</Text> : null}
                  <TextInput accessibilityLabel="Commit-Nachricht" autoCapitalize="sentences" autoCorrect onChangeText={(value) => { setCommitMessage(value); if (gitAction !== "pushing") setGitAction("idle"); }} placeholder="Beschreibe deine Änderung" placeholderTextColor={glassSurface.textMuted} style={styles.commitInput} value={commitMessage} />
                <View style={styles.gitActions}>
                  <TouchableOpacity accessibilityRole="button" activeOpacity={0.75} disabled={!changedFileCount || commitMessage.trim().length < 3 || gitAction === "saving" || gitAction === "committing" || gitAction === "pushing"} onPress={() => void commitChanges()} style={[styles.gitActionButton, styles.commitButton, (!changedFileCount || commitMessage.trim().length < 3 || gitAction === "saving" || gitAction === "committing" || gitAction === "pushing") && styles.gitActionDisabled]}><Text style={styles.commitButtonText}>{gitAction === "saving" ? "Speichert …" : gitAction === "committing" ? "Commit …" : "Commit erstellen"}</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" activeOpacity={0.75} disabled={gitAction !== "committed"} onPress={pushChanges} style={[styles.gitActionButton, styles.pushButton, gitAction !== "committed" && styles.gitActionDisabled]}><Text style={styles.pushButtonText}>{gitAction === "pushing" ? "Push …" : currentBranchIsProtected ? "Push bestätigen" : "Push zu GitHub"}</Text></TouchableOpacity>
                </View>
                {gitFeedback ? <Text style={[styles.gitFeedback, gitAction === "error" ? styles.gitFeedbackError : styles.gitFeedbackSuccess]}>{gitFeedback}</Text> : <Text style={styles.gitHint}>Commit speichert alle geänderten Remote-Dateien; Push veröffentlicht den Commit auf dem ausgewählten Branch.</Text>}
                {gitAction === "pushed" || pullRequestState === "created" ? (
                  <View style={styles.pullRequestBar}>
                    <Text style={styles.pullRequestEyebrow}>PULL REQUEST</Text>
                    <Text style={styles.pullRequestHint}>Erstelle aus <Text style={styles.branchInline}>{settings.branch}</Text> einen Pull Request in den Zielbranch.</Text>
                    <TextInput accessibilityLabel="Pull-Request-Titel" autoCapitalize="sentences" autoCorrect onChangeText={(value) => { setPullRequestTitle(value); if (pullRequestState !== "creating") setPullRequestState("idle"); }} placeholder="Pull-Request-Titel" placeholderTextColor={glassSurface.textMuted} style={styles.commitInput} value={pullRequestTitle} />
                    <TextInput accessibilityLabel="Zielbranch des Pull Requests" autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setPullRequestBase(value); if (pullRequestState !== "creating") setPullRequestState("idle"); }} placeholder="main" placeholderTextColor={glassSurface.textMuted} style={[styles.commitInput, styles.pullRequestInput]} value={pullRequestBase} />
                    <TextInput accessibilityLabel="Pull-Request-Beschreibung" autoCapitalize="sentences" multiline onChangeText={setPullRequestBody} placeholder="Optionale Beschreibung" placeholderTextColor={glassSurface.textMuted} style={[styles.commitInput, styles.pullRequestBody]} textAlignVertical="top" value={pullRequestBody} />
                    <TouchableOpacity accessibilityRole="button" activeOpacity={0.75} disabled={pullRequestState === "creating" || pullRequestState === "created" || pullRequestTitle.trim().length < 3 || pullRequestBase.trim() === settings.branch} onPress={() => void createPullRequest()} style={[styles.pullRequestButton, (pullRequestState === "creating" || pullRequestState === "created" || pullRequestTitle.trim().length < 3 || pullRequestBase.trim() === settings.branch) && styles.gitActionDisabled]}><Text style={styles.pullRequestButtonText}>{pullRequestState === "creating" ? "Pull Request wird erstellt …" : pullRequestState === "created" ? "Pull Request erstellt" : "Pull Request erstellen"}</Text></TouchableOpacity>
                    {pullRequestFeedback ? <Text style={[styles.gitFeedback, pullRequestState === "error" ? styles.gitFeedbackError : styles.gitFeedbackSuccess]}>{pullRequestFeedback}</Text> : null}
                  </View>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.sectionLabel}>CONSOLE</Text>
            <Text style={styles.sectionTitle}>Aktiver Kontext</Text>
            <View style={styles.consoleCard}>
              <View style={styles.consolePrompt}>
                <IconSymbol name="terminal.fill" size={16} color={glassPalette.green} />
                <Text style={styles.consolePromptText}>workspace:{settings.branch}</Text>
              </View>
              <Text style={styles.consoleText}>{hasAttachedRepository ? `Verbunden mit ${repositoryLabel} auf ${settings.branch}.` : "Sichere Remote-Verbindung noch nicht konfiguriert."}</Text>
              <TouchableOpacity activeOpacity={0.75} onPress={() => router.push("/settings" as never)} style={styles.consoleLink}>
                <Text style={styles.consoleLinkText}>Verbindung einrichten</Text>
                <IconSymbol name="arrow.right" size={14} color={glassPalette.cyan} />
              </TouchableOpacity>
            </View>
          </>
        }
        renderItem={({ item }) => {
          const isSelected = item.id === selectedFileId;
          return (
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.76}
              onPress={() => {
                selectFile(item.id);
                if (item.remote) {
                  void readAttachedFile(item.path).then((result) => hydrateFile(item.id, result.content)).catch(() => undefined);
                }
              }}
              style={[styles.fileRow, isSelected && styles.fileRowSelected]}
            >
              <View style={[styles.fileIcon, isSelected && styles.fileIconSelected]}>
                <IconSymbol name="doc.text.fill" size={16} color={isSelected ? glassPalette.cyan : glassSurface.textSecondary} />
              </View>
              <View style={styles.fileTextArea}>
                <Text style={[styles.fileName, isSelected && styles.fileNameSelected]}>{item.name}</Text>
                <Text numberOfLines={1} style={styles.filePath}>{item.path}</Text>
              </View>
              {item.changed ? <View style={styles.changedDot} /> : null}
              <IconSymbol name="chevron.right" size={17} color={isSelected ? glassPalette.cyan : glassSurface.textMuted} />
            </TouchableOpacity>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
      <DiffConfirmationSheet onCancel={() => setPendingGuidanceStep(null)} onConfirm={confirmGuidanceAction} previews={detailedDiffPreviews} step={pendingGuidanceStep} visible={Boolean(pendingGuidanceStep)} />
      </ScreenContainer>
    </GlassBackdrop>
  );
}

const codeFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function formatCommitDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function RepositoryQualityPanel({ quality }: { quality: RepositoryQuality }) {
  const mergeTone = getQualityTone(styles, quality.merge.state);
  const ciTone = getQualityTone(styles, quality.ci.state);
  return (
    <View style={styles.qualityPanel}>
      <View style={styles.qualityPillRow}>
        <View style={[styles.qualityPill, mergeTone.container]}><View style={[styles.qualityDot, mergeTone.dot]} /><Text style={[styles.qualityPillText, mergeTone.text]}>{quality.merge.label}</Text></View>
        <View style={[styles.qualityPill, ciTone.container]}><View style={[styles.qualityDot, ciTone.dot]} /><Text style={[styles.qualityPillText, ciTone.text]}>{quality.ci.label}</Text></View>
      </View>
      {quality.pullRequest ? <Text style={styles.qualityPrText}>PR #{quality.pullRequest.number}: {quality.pullRequest.headBranch} → {quality.pullRequest.baseBranch}</Text> : <Text style={styles.qualityPrText}>Für den aktuellen Branch ist kein offener Pull Request vorhanden.</Text>}
      {quality.pullRequest ? <View style={styles.reviewMetrics}><Text style={styles.reviewMetric}>Reviewer <Text style={styles.qualityMetricStrong}>{quality.reviews.reviewerCount}</Text></Text><Text style={styles.reviewMetricApproved}>Genehmigt <Text style={styles.qualityMetricStrong}>{quality.reviews.approvedCount}</Text></Text><Text style={styles.reviewMetricChanges}>Änderungen <Text style={styles.qualityMetricStrong}>{quality.reviews.requestedChangesCount}</Text></Text></View> : null}
      <View style={styles.qualityMetrics}><Text style={styles.qualityMetric}>Bestanden <Text style={styles.qualityMetricStrong}>{quality.ci.passed}</Text></Text><Text style={styles.qualityMetric}>Läuft <Text style={styles.qualityMetricStrong}>{quality.ci.pending}</Text></Text><Text style={styles.qualityMetric}>Fehler <Text style={styles.qualityMetricStrong}>{quality.ci.failed}</Text></Text></View>
      {quality.ci.checks.length ? quality.ci.checks.map((check) => <View key={`${check.name}-${check.status}`} style={styles.checkRow}><View style={[styles.checkDot, getQualityTone(styles, check.conclusion ?? check.status).dot]} /><Text numberOfLines={1} style={styles.checkName}>{check.name}</Text><Text style={styles.checkState}>{check.conclusion ?? check.status}</Text></View>) : <Text style={styles.qualityEmpty}>GitHub meldet für diesen Pull Request noch keine Check-Runs oder Commit-Status-Prüfungen.</Text>}
    </View>
  );
}

function getQualityTone(styles: ReturnType<typeof createStyles>, state: string) {
  if (["ready", "passed", "merged", "success"].includes(state)) return { container: styles.qualityReady, dot: styles.dotReady, text: styles.textReady };
  if (["failing", "blocked", "failure", "error", "cancelled", "timed_out"].includes(state)) return { container: styles.qualityFailure, dot: styles.dotFailure, text: styles.textFailure };
  if (["running", "checking", "attention", "draft"].includes(state)) return { container: styles.qualityWarning, dot: styles.dotWarning, text: styles.textWarning };
  return { container: styles.qualityNeutral, dot: styles.dotNeutral, text: styles.textNeutral };
}

function createStyles() {
  return StyleSheet.create({
  headerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  headerCopy: { flex: 1 },
  eyebrow: { ...glassType.label, color: glassPalette.cyan },
  screenTitle: { ...glassType.display, color: glassSurface.textPrimary, marginTop: 4 },
  headerAction: { alignItems: "center", borderRadius: 10, height: 36, justifyContent: "center", width: 36 },
  sectionLabel: { ...glassType.label, color: glassSurface.textMuted, marginTop: 18 },
  sectionTitle: { ...glassType.headline, color: glassSurface.textPrimary, marginTop: 2 },
  content: { paddingBottom: 20 },
  projectCard: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 18, borderWidth: 1, marginBottom: 26, padding: 15 },
  projectTopLine: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  projectIdentity: { alignItems: "center", flexDirection: "row", gap: 10, flex: 1, marginRight: 8 },
  projectIcon: { alignItems: "center", backgroundColor: withAlpha(glassPalette.cyan, 0.1), borderRadius: 12, height: 42, justifyContent: "center", width: 42 },
  projectName: { color: glassSurface.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 2 },
  projectPath: { color: glassSurface.textMuted, fontSize: 12 },
  projectFooter: { alignItems: "center", borderTopColor: glassSurface.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingTop: 12 },
  projectState: { color: glassSurface.textSecondary, fontSize: 12 },
  healthPanel: { backgroundColor: glassDepth.layer, borderColor: withAlpha(glassPalette.cyan, 0.2), borderRadius: 16, borderWidth: 1, marginBottom: 25, marginTop: -12, padding: 13 },
  healthPanelError: { backgroundColor: darken(glassPalette.red, 0.85), borderColor: darken(glassPalette.red, 0.62) },
  healthHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  healthEyebrow: { color: glassSurface.textSecondary, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 3 },
  healthTitle: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "800" },
  healthDetail: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 9 },
  healthButtonDisabled: { opacity: 0.55 },
  repositoryPanel: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 17, borderWidth: 1, marginBottom: 25, padding: 14 },
  repositoryHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  repositoryEyebrow: { color: glassSurface.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 3 },
  repositoryTitle: { color: glassSurface.textPrimary, fontSize: 16, fontWeight: "800" },
  refreshButton: { alignItems: "center", backgroundColor: withAlpha(glassPalette.cyan, 0.1), borderColor: withAlpha(glassPalette.cyan, 0.25), borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 10 },
  refreshButtonText: { color: lighten(glassPalette.cyan, 0.15), fontSize: 11, fontWeight: "800" },
  repositoryHint: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 10 },
  branchList: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  branchChip: { alignItems: "center", backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 10 },
  branchChipSelected: { backgroundColor: withAlpha(glassPalette.cyan, 0.1), borderColor: glassPalette.cyan },
  branchChipText: { color: glassSurface.textSecondary, fontFamily: codeFont, fontSize: 11, fontWeight: "700" },
  branchChipTextSelected: { color: lighten(glassPalette.cyan, 0.3) },
  commitDivider: { backgroundColor: glassSurface.border, height: 1, marginTop: 16 },
  commitLabel: { color: glassSurface.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 8, marginTop: 14 },
  commitRow: { alignItems: "center", flexDirection: "row", gap: 9, marginTop: 10 },
  commitHash: { backgroundColor: withAlpha(glassPalette.cyan, 0.12), borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 },
  commitHashText: { color: lighten(glassPalette.cyan, 0.12), fontFamily: codeFont, fontSize: 10, fontWeight: "800" },
  commitTextArea: { flex: 1 },
  commitMessage: { color: glassSurface.textPrimary, fontSize: 12, fontWeight: "700" },
  commitMeta: { color: glassSurface.textMuted, fontSize: 11, marginTop: 2 },
  emptyRepositoryText: { color: glassSurface.textMuted, fontSize: 12, marginTop: 7 },
  repositoryError: { color: glassPalette.red, fontSize: 12, lineHeight: 17, marginTop: 12 },
  qualityDivider: { backgroundColor: glassSurface.border, height: 1, marginTop: 17 },
  qualityHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 9, marginTop: 14 },
  qualityLabel: { color: glassSurface.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  qualityRefreshButton: { alignItems: "center", backgroundColor: withAlpha(glassPalette.cyan, 0.1), borderColor: withAlpha(glassPalette.cyan, 0.25), borderRadius: 9, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 10 },
  qualityRefresh: { color: lighten(glassPalette.cyan, 0.15), fontSize: 10, fontWeight: "800" },
  qualityPanel: { backgroundColor: glassDepth.deep, borderColor: glassSurface.border, borderRadius: 13, borderWidth: 1, padding: 11 },
  qualityPillRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  qualityPill: { alignItems: "center", borderRadius: 9, borderWidth: 1, flexDirection: "row", gap: 6, paddingHorizontal: 8, paddingVertical: 6 },
  qualityPillText: { fontSize: 11, fontWeight: "800" },
  qualityDot: { borderRadius: 4, height: 7, width: 7 },
  qualityReady: { backgroundColor: withAlpha(glassPalette.green, 0.11), borderColor: withAlpha(glassPalette.green, 0.4) },
  qualityFailure: { backgroundColor: accentAlpha("red", 0.1), borderColor: accentAlpha("red", 0.42) },
  qualityWarning: { backgroundColor: accentAlpha("amber", 0.1), borderColor: accentAlpha("amber", 0.38) },
  qualityNeutral: { backgroundColor: glassSurface.textSecondary, borderColor: glassSurface.textSecondary },
  dotReady: { backgroundColor: glassPalette.green },
  dotFailure: { backgroundColor: glassPalette.red },
  dotWarning: { backgroundColor: glassPalette.amber },
  dotNeutral: { backgroundColor: glassSurface.textSecondary },
  textReady: { color: glassPalette.green },
  textFailure: { color: glassPalette.red },
  textWarning: { color: glassPalette.amber },
  textNeutral: { color: glassSurface.textSecondary },
  qualityPrText: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 10 },
  qualityMetrics: { flexDirection: "row", gap: 13, marginTop: 10 },
  reviewMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 11, marginTop: 9 },
  qualityMetric: { color: glassSurface.textMuted, fontSize: 11 },
  reviewMetric: { color: glassSurface.textSecondary, fontSize: 11 },
  reviewMetricApproved: { color: glassPalette.green, fontSize: 11 },
  reviewMetricChanges: { color: glassPalette.amber, fontSize: 11 },
  qualityMetricStrong: { color: glassSurface.textPrimary, fontWeight: "800" },
  checkRow: { alignItems: "center", borderTopColor: glassSurface.border, borderTopWidth: 1, flexDirection: "row", gap: 7, marginTop: 9, paddingTop: 9 },
  checkDot: { borderRadius: 4, height: 7, width: 7 },
  checkName: { color: glassSurface.textSecondary, flex: 1, fontSize: 11, fontWeight: "700" },
  checkState: { color: glassSurface.textMuted, fontFamily: codeFont, fontSize: 10 },
  qualityEmpty: { color: glassSurface.textMuted, fontSize: 11, lineHeight: 16, marginTop: 10 },
  fileRow: { alignItems: "center", borderRadius: 14, flexDirection: "row", gap: 10, marginBottom: 5, padding: 10 },
  fileRowSelected: { backgroundColor: glassDepth.layer },
  fileIcon: { alignItems: "center", backgroundColor: glassDepth.layer, borderRadius: 9, height: 33, justifyContent: "center", width: 33 },
  fileIconSelected: { backgroundColor: withAlpha(glassPalette.cyan, 0.12) },
  fileTextArea: { flex: 1 },
  fileName: { color: glassSurface.textSecondary, fontSize: 13, fontWeight: "700", marginBottom: 2 },
  fileNameSelected: { color: glassSurface.textPrimary },
  filePath: { color: glassSurface.textMuted, fontSize: 11 },
  changedDot: { backgroundColor: glassPalette.amber, borderRadius: 4, height: 7, width: 7 },
  editorHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 11, marginTop: 21 },
  editorFileIdentity: { alignItems: "center", flexDirection: "row", flex: 1, gap: 9, marginRight: 8 },
  editorFileName: { color: glassSurface.textPrimary, fontSize: 13, fontWeight: "800", marginBottom: 2 },
  editorPath: { color: glassSurface.textMuted, fontSize: 10 },
  editorShell: { backgroundColor: glassDepth.deep, borderColor: glassSurface.border, borderRadius: 16, borderWidth: 1, flexDirection: "row", minHeight: 178, overflow: "hidden" },
  lineRail: { backgroundColor: glassDepth.layer, paddingHorizontal: 11, paddingTop: 13 },
  lineNumber: { color: glassSurface.textMuted, fontFamily: codeFont, fontSize: 11, lineHeight: 19, textAlign: "right" },
  codeInput: { color: glassSurface.textPrimary, flex: 1, fontFamily: codeFont, fontSize: 12, lineHeight: 19, minHeight: 176, padding: 13 },
  editorAction: { marginBottom: 29, marginTop: 12 },
  gitBar: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 16, borderWidth: 1, marginBottom: 28, padding: 13 },
  gitBarHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  gitBarEyebrow: { color: glassSurface.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.05 },
  gitBarCount: { color: glassSurface.textPrimary, fontSize: 11, fontWeight: "700" },
  diffPreview: { backgroundColor: glassDepth.deep, borderColor: withAlpha(glassPalette.cyan, 0.16), borderRadius: 11, borderWidth: 1, marginBottom: 10, padding: 10 },
  diffPreviewTitle: { color: glassSurface.textSecondary, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  diffRow: { alignItems: "center", borderTopColor: glassSurface.border, borderTopWidth: 1, flexDirection: "row", gap: 9, justifyContent: "space-between", paddingVertical: 6 },
  diffPath: { color: glassSurface.textSecondary, flex: 1, fontFamily: codeFont, fontSize: 10, fontWeight: "700" },
  diffCounts: { color: glassPalette.green, fontFamily: codeFont, fontSize: 10, fontWeight: "800" },
  diffMore: { color: glassSurface.textSecondary, fontSize: 10, marginTop: 4 }, conflictKind: { color: glassPalette.amber, fontSize: 9, fontWeight: "900", marginLeft: 6 },
  commitInput: { backgroundColor: glassDepth.deep, borderColor: glassSurface.border, borderRadius: 11, borderWidth: 1, color: glassSurface.textPrimary, fontSize: 13, minHeight: 44, paddingHorizontal: 11, paddingVertical: 9 },
  gitActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  gitActionButton: { alignItems: "center", borderRadius: 11, flex: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 8, paddingVertical: 11 },
  commitButton: { backgroundColor: glassDepth.layer, borderColor: glassSurface.textSecondary, borderWidth: 1 },
  pushButton: { backgroundColor: withAlpha(glassPalette.cyan, 0.3), borderColor: glassPalette.cyan, borderWidth: 1 },
  gitActionDisabled: { opacity: 0.45 },
  commitButtonText: { color: lighten(glassPalette.cyan, 0.35), fontSize: 12, fontWeight: "800" },
  pushButtonText: { color: glassSurface.textPrimary, fontSize: 12, fontWeight: "800" },
  gitFeedback: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  gitFeedbackSuccess: { color: glassPalette.green },
  gitFeedbackError: { color: glassPalette.red },
  gitHint: { color: glassSurface.textMuted, fontSize: 11, lineHeight: 16, marginTop: 10 },
  conflictWarning: { color: glassPalette.amber, fontWeight: "800" },
  pullRequestBar: { borderTopColor: glassSurface.border, borderTopWidth: 1, marginTop: 14, paddingTop: 14 },
  pullRequestEyebrow: { color: lighten(glassPalette.cyan, 0.12), fontSize: 10, fontWeight: "900", letterSpacing: 1.05, marginBottom: 5 },
  pullRequestHint: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 16, marginBottom: 9 },
  branchInline: { color: glassSurface.textPrimary, fontFamily: codeFont, fontWeight: "800" },
  pullRequestInput: { marginTop: 8 },
  pullRequestBody: { marginTop: 8, minHeight: 76 },
  pullRequestButton: { alignItems: "center", backgroundColor: withAlpha(glassPalette.cyan, 0.22), borderColor: glassPalette.cyan, borderRadius: 11, borderWidth: 1, justifyContent: "center", marginTop: 10, minHeight: 44, paddingHorizontal: 8, paddingVertical: 11 },
  pullRequestButtonText: { color: glassSurface.textPrimary, fontSize: 12, fontWeight: "900" },
  consoleCard: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 16, borderWidth: 1, padding: 14 },
  consolePrompt: { alignItems: "center", flexDirection: "row", gap: 7, marginBottom: 9 },
  consolePromptText: { color: glassPalette.green, fontFamily: codeFont, fontSize: 11, fontWeight: "700" },
  consoleText: { color: glassSurface.textSecondary, fontFamily: codeFont, fontSize: 12, lineHeight: 18 },
  consoleLink: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: 12, minHeight: 44 },
  consoleLinkText: { color: glassPalette.cyan, fontSize: 12, fontWeight: "800" },
  });
}

const styles = createStyles();
