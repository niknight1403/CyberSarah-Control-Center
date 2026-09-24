/**
 * Sprint 181 — Einstellungs-Screen auf "CyberSarah Future Glass"
 * uebertragen. Logik (Attach, Provider-Keys, Backup/Restore, Theme-Picker)
 * unveraendert; visuelle Schicht auf Glass-System umgestellt: GlassBackdrop,
 * Glass-Typografie, GlowButton-Pendants, Farb-Token statt Hand-Hexes.
 * Der Design-Theme-Picker behaelt seine eigene Palette-Logik.
 */
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlowButton } from "@/components/glass/glass-primitives";
import { accentAlpha, glassDepth, glassPalette, glassSurface, glassType } from "@/lib/design/future-glass";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { integrationFixture } from "@/constants/integration-fixture";
import { providerOptions, type ProviderId, useStudioSettings } from "@/lib/studio-settings";
import { trpc } from "@/lib/trpc";
import { getProviderKeyStatusLabel } from "@/lib/provider-key-logic";
import { cloudProviderIds, defaultLocalProviderEndpoints, type CloudProviderId } from "@/lib/studio-settings-logic";
import { type FieldValidation, validateLocalProviderEndpoint, validateServiceAccessToken, validateWorkspaceUrl } from "@/lib/settings-validation";
import { useThemeContext } from "@/lib/theme-provider";
import { DESIGN_THEMES, designThemeDescription, designThemeIcon, designThemeLabel } from "@/lib/design-theme-logic";
import { getSettingsBackupRestoreConfirmation, getSettingsBackupShareConfirmation, isValidSettingsBackupPassword, pickEncryptedSettingsBackup, previewEncryptedSettingsBackup, type SettingsBackupImportCandidate, type SettingsBackupPreview } from "@/lib/settings-backup";
import { useWorkspace } from "@/lib/workspace-context";
import { resolveDesignPalette } from "@/lib/_core/design-theme-palettes";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type LocalProviderId = "ollama" | "lmstudio";
type EndpointTestState = "idle" | "checking" | "ready" | "error";

export default function SettingsScreen() {
  const { attachRepository, clearGitHubToken, clearProviderKey, clearServiceAccessToken, exportSettingsBackup, loading, restoreSettingsBackup, saveSettings, setProtectedChatContent, settings, testCloudProvider, testLocalProviderEndpoint } = useStudioSettings();
  const { loadRemoteFiles } = useWorkspace();
  const { colorScheme, designTheme, setDesignTheme, palette } = useThemeContext();
  const [workspaceUrl, setWorkspaceUrl] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const isAdmin = accountQuery.data?.role === "admin";
  const [provider, setProvider] = useState<ProviderId>("managed");
  const [serviceAccessToken, setServiceAccessToken] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [ollamaEndpoint, setOllamaEndpoint] = useState(defaultLocalProviderEndpoints.ollama);
  const [lmstudioEndpoint, setLmstudioEndpoint] = useState(defaultLocalProviderEndpoints.lmstudio);
  const [ollamaEndpointTouched, setOllamaEndpointTouched] = useState(false);
  const [lmstudioEndpointTouched, setLmstudioEndpointTouched] = useState(false);
  const [endpointTestState, setEndpointTestState] = useState<Record<LocalProviderId, EndpointTestState>>({ ollama: "idle", lmstudio: "idle" });
  const [endpointTestMessage, setEndpointTestMessage] = useState<Record<LocalProviderId, string>>({ ollama: "", lmstudio: "" });
  const [cloudTestState, setCloudTestState] = useState<EndpointTestState>("idle");
  const [cloudTestMessage, setCloudTestMessage] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [workspaceTouched, setWorkspaceTouched] = useState(false);
  const [serviceTokenTouched, setServiceTokenTouched] = useState(false);
  const [attachState, setAttachState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [attachMessage, setAttachMessage] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupState, setBackupState] = useState<"idle" | "exporting" | "shared" | "error">("idle");
  const [backupMessage, setBackupMessage] = useState("");
  const [importCandidate, setImportCandidate] = useState<SettingsBackupImportCandidate | null>(null);
  const [importPreview, setImportPreview] = useState<SettingsBackupPreview | null>(null);
  const [importPassphrase, setImportPassphrase] = useState("");
  const [importState, setImportState] = useState<"idle" | "picking" | "ready" | "importing" | "restored" | "error">("idle");
  const [importMessage, setImportMessage] = useState("");

  useEffect(() => {
    if (loading) return;
    setWorkspaceUrl(settings.workspaceUrl);
    setRepositoryUrl(settings.repositoryUrl);
    setBranch(settings.branch);
    setProvider(settings.provider);
    setOllamaEndpoint(settings.localProviderEndpoints.ollama);
    setLmstudioEndpoint(settings.localProviderEndpoints.lmstudio);
  }, [loading, settings]);

  const workspaceValidation = validateWorkspaceUrl(workspaceUrl);
  const serviceTokenValidation = validateServiceAccessToken(serviceAccessToken, settings.hasServiceAccessToken);
  const ollamaEndpointValidation = validateLocalProviderEndpoint(ollamaEndpoint, "Ollama");
  const lmstudioEndpointValidation = validateLocalProviderEndpoint(lmstudioEndpoint, "LM Studio");
  const canSave = workspaceValidation.valid && serviceTokenValidation.valid && ollamaEndpointValidation.valid && lmstudioEndpointValidation.valid;
  const canAttach = canSave && Boolean(repositoryUrl.trim()) && Boolean(branch.trim());
  const selectedCloudProvider = cloudProviderIds.includes(provider as CloudProviderId) ? (provider as CloudProviderId) : null;
  const configuredProviderKeyCount = Object.values(settings.providerKeyStatus).filter(Boolean).length;
  const configuredEndpointCount = Object.values(settings.localProviderEndpoints).filter(Boolean).length;

  const testEndpoint = async (localProvider: LocalProviderId, endpoint: string, validation: FieldValidation) => {
    if (!validation.valid) {
      setEndpointTestState((current) => ({ ...current, [localProvider]: "error" }));
      setEndpointTestMessage((current) => ({ ...current, [localProvider]: validation.message }));
      return;
    }
    setEndpointTestState((current) => ({ ...current, [localProvider]: "checking" }));
    setEndpointTestMessage((current) => ({ ...current, [localProvider]: "" }));
    try {
      const result = await testLocalProviderEndpoint(localProvider, endpoint);
      setEndpointTestState((current) => ({ ...current, [localProvider]: "ready" }));
      setEndpointTestMessage((current) => ({ ...current, [localProvider]: `${result.modelCount} Modell${result.modelCount === 1 ? "" : "e"} erreichbar.` }));
    } catch (error) {
      setEndpointTestState((current) => ({ ...current, [localProvider]: "error" }));
      setEndpointTestMessage((current) => ({ ...current, [localProvider]: error instanceof Error ? error.message : "Der lokale Endpoint ist nicht erreichbar." }));
    }
  };

  const testSelectedCloudProvider = async () => {
    if (!selectedCloudProvider) return;
    if (!settings.providerKeyStatus[selectedCloudProvider] && !providerApiKey.trim()) {
      setCloudTestState("error");
      setCloudTestMessage("Für diesen Cloud-Provider ist kein gespeicherter API-Key vorhanden.");
      return;
    }
    setCloudTestState("checking");
    setCloudTestMessage("");
    try {
      const result = await testCloudProvider(selectedCloudProvider, providerApiKey.trim() || undefined);
      setCloudTestState("ready");
      setCloudTestMessage(`${result.modelCount} Modell${result.modelCount === 1 ? "" : "e"} verfügbar; ${result.model} wurde erkannt.`);
    } catch (error) {
      setCloudTestState("error");
      setCloudTestMessage(error instanceof Error ? error.message : "Der Cloud-Provider konnte nicht bestätigt werden.");
    }
  };

  const persistSettings = async () => {
    setWorkspaceTouched(true);
    setServiceTokenTouched(true);
    if (!canSave) return;
    setSaveState("saving");
    await saveSettings({ workspaceUrl, repositoryUrl, branch, provider, serviceAccessToken, githubToken, providerApiKey, localProviderEndpoints: { ollama: ollamaEndpoint, lmstudio: lmstudioEndpoint } });
    setServiceAccessToken("");
    setGithubToken("");
    setProviderApiKey("");
    setSaveState("saved");
  };

  const confirmSettingsBackupExport = () => {
    if (Platform.OS === "web") {
      setBackupState("error");
      setBackupMessage("Verschlüsselte Settings-Backups können nur in der nativen App geteilt werden.");
      return;
    }
    if (!isValidSettingsBackupPassword(backupPassphrase)) {
      setBackupState("error");
      setBackupMessage("Das Backup-Passwort muss mindestens 12 Zeichen enthalten.");
      return;
    }
    const confirmation = getSettingsBackupShareConfirmation();
    Alert.alert(confirmation.title, confirmation.message, [
      { text: "Abbrechen", style: "cancel" },
      { text: "Backup erstellen & teilen", style: "destructive", onPress: () => void performSettingsBackupExport() },
    ]);
  };

  const performSettingsBackupExport = async () => {
    setBackupState("exporting");
    setBackupMessage("");
    try {
      const result = await exportSettingsBackup(backupPassphrase);
      setBackupState("shared");
      setBackupMessage(`${result.filename} wurde verschlüsselt erstellt und über das System-Menü geteilt.`);
    } catch (error) {
      setBackupState("error");
      setBackupMessage(error instanceof Error ? error.message : "Das Settings-Backup konnte nicht erstellt werden.");
    } finally {
      setBackupPassphrase("");
    }
  };

  const pickSettingsBackup = async () => {
    if (Platform.OS === "web") {
      setImportState("error");
      setImportMessage("Der Settings-Import ist für die native App vorgesehen.");
      return;
    }
    setImportState("picking");
    setImportMessage("");
    try {
      const candidate = await pickEncryptedSettingsBackup();
      if (!candidate) {
        setImportState("idle");
        return;
      }
      setImportCandidate(candidate);
      setImportPreview(null);
      setImportPassphrase("");
      setImportState("ready");
      setImportMessage("Datei ausgewählt. Gib jetzt das Backup-Passwort ein, um die Vorschau zu prüfen.");
    } catch (error) {
      setImportState("error");
      setImportMessage(error instanceof Error ? error.message : "Die Backup-Datei konnte nicht ausgewählt werden.");
    }
  };

  const inspectSettingsBackup = () => {
    if (!importCandidate) return;
    if (!isValidSettingsBackupPassword(importPassphrase)) {
      setImportState("error");
      setImportMessage("Das Backup-Passwort muss mindestens 12 Zeichen enthalten.");
      return;
    }
    try {
      const preview = previewEncryptedSettingsBackup(importCandidate.backup, importPassphrase);
      setImportPreview(preview);
      setImportState("ready");
      setImportMessage("Integrität bestätigt. Prüfe die Vorschau, bevor vorhandene Werte überschrieben werden.");
    } catch (error) {
      setImportPreview(null);
      setImportState("error");
      setImportMessage(error instanceof Error ? error.message : "Passwort oder Backup-Datei sind ungültig.");
    }
  };

  const confirmSettingsBackupImport = () => {
    if (!importCandidate || !importPreview) return;
    const confirmation = getSettingsBackupRestoreConfirmation(importPreview);
    Alert.alert(confirmation.title, confirmation.message, [
      { text: "Abbrechen", style: "cancel" },
      { text: "Jetzt wiederherstellen", style: "destructive", onPress: () => void performSettingsBackupImport() },
    ]);
  };

  const performSettingsBackupImport = async () => {
    if (!importCandidate || !importPreview) return;
    setImportState("importing");
    setImportMessage("");
    try {
      const result = await restoreSettingsBackup(importCandidate.backup, importPassphrase);
      setImportState("restored");
      setImportMessage(`${result.providerIds.length} Cloud-Key${result.providerIds.length === 1 ? "" : "s"} und ${result.endpointCount} lokale Endpoint${result.endpointCount === 1 ? "" : "s"} wurden wiederhergestellt. Service- und GitHub-Tokens blieben unverändert.`);
    } catch (error) {
      setImportState("error");
      setImportMessage(error instanceof Error ? error.message : "Das Settings-Backup konnte nicht wiederhergestellt werden.");
    } finally {
      setImportPassphrase("");
    }
  };

  const connectRepository = async () => {
    setWorkspaceTouched(true);
    setServiceTokenTouched(true);
    if (!canAttach) return;
    setAttachState("connecting");
    setAttachMessage("");
    try {
      const attached = await attachRepository({ workspaceUrl, repositoryUrl, branch, provider, serviceAccessToken, githubToken, providerApiKey, localProviderEndpoints: { ollama: ollamaEndpoint, lmstudio: lmstudioEndpoint } });
      loadRemoteFiles(attached.files);
      setServiceAccessToken("");
      setGithubToken("");
      setProviderApiKey("");
      setAttachState("connected");
      setAttachMessage(`${attached.files.length} Dateien sind auf Branch ${attached.branch} verfügbar.`);
    } catch (error) {
      setAttachState("error");
      setAttachMessage(error instanceof Error ? error.message : "Die Repository-Verbindung konnte nicht hergestellt werden.");
    }
  };

  return (
    <GlassBackdrop accent="cyan">
      <ScreenContainer className="px-5" containerClassName="bg-transparent" edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>STEUERZENTRALE</Text>
            <Text style={styles.screenTitle}>Verbindung</Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Zurück"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.headerAction}
          >
            <IconSymbol name="chevron.left" size={18} color={glassSurface.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.sectionSpacer}>
          <Text style={styles.sectionLabel}>DARSTELLUNG</Text>
          <Text style={styles.sectionTitle}>Erscheinungsbild</Text>
          <Text style={styles.fieldHint}>Das Design wirkt auf die gesamte App — Palette, Glow- und Glas-Effekte wechseln mit.</Text>
          <View style={styles.designOptionStack}>
            {DESIGN_THEMES.map((theme) => {
              const active = designTheme === theme;
              const preview = resolveDesignPalette(theme, colorScheme);
              return (
                <TouchableOpacity
                  accessibilityLabel={`Design ${designThemeLabel(theme)} aktivieren`}
                  accessibilityRole="button"
                  activeOpacity={0.75}
                  key={theme}
                  onPress={() => setDesignTheme(theme)}
                  style={[styles.designOption, active ? { borderColor: palette.primary } : null]}
                >
                  <IconSymbol name={designThemeIcon(theme)} size={17} color={palette.primary} />
                  <View style={styles.palettePreview} accessibilityLabel={`${designThemeLabel(theme)} Farbpalette`}>
                    {[preview.primary, preview.success, preview.warning, preview.error].map((color) => <View key={color} style={[styles.paletteSwatch, { backgroundColor: color }]} />)}
                  </View>
                  <View style={styles.designOptionTextArea}>
                    <Text style={styles.designOptionTitle}>{designThemeLabel(theme)}</Text>
                    <Text style={styles.designOptionDescription}>{designThemeDescription(theme)}</Text>
                  </View>
                  {active ? <IconSymbol name="checkmark.circle.fill" size={19} color={palette.success} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.emptyGlass}>
          <View style={styles.emptyGlassIcon}>
            <IconSymbol name="bolt.fill" size={23} color={glassPalette.cyan} />
          </View>
          <Text style={styles.emptyGlassTitle}>Workspace konfigurieren</Text>
          <Text style={styles.emptyGlassDescription}>Ein eigener Workspace-Service führt Repository-, Git- und Build-Operationen auf deiner Infrastruktur aus. Dieser Client bleibt der sichere Kontrollpunkt.</Text>
        </View>
        <View style={styles.sectionSpacer}>
          <Text style={styles.sectionLabel}>SERVICE</Text>
          <Text style={styles.sectionTitle}>Remote-Arbeitsbereich</Text>
          <Text style={styles.fieldLabel}>HTTPS-URL DES WORKSPACE-SERVICE</Text>
          <TextInput accessibilityHint="Erfordert eine öffentliche HTTPS-Adresse ohne Beispiel-Domain." accessibilityLabel="HTTPS-URL des Workspace-Service" autoCapitalize="none" autoCorrect={false} keyboardType="url" onBlur={() => setWorkspaceTouched(true)} onChangeText={(value) => { setWorkspaceUrl(value); setWorkspaceTouched(true); setSaveState("idle"); }} placeholder="https://studio.deine-domain.de" placeholderTextColor={glassSurface.textMuted} style={[styles.input, getInputStyle(workspaceValidation, workspaceTouched)]} value={workspaceUrl} />
          <ValidationMessage active={workspaceTouched || Boolean(workspaceUrl)} validation={workspaceValidation} />
          <Text style={styles.fieldHint}>Der Service stellt Git-Operationen, Dateizugriff, Prozess-Runner und die Vorschau bereit.</Text>
          <Text style={styles.fieldLabel}>SERVICE-ZUGRIFFSTOKEN</Text>
          <TextInput accessibilityHint="Füge nur den vollständigen Token ohne Bearer-Präfix, Leerzeichen oder Zeilenumbrüche ein." accessibilityLabel="Service-Zugriffstoken" autoCapitalize="none" autoCorrect={false} onBlur={() => setServiceTokenTouched(true)} onChangeText={(value) => { setServiceAccessToken(value); setServiceTokenTouched(true); setSaveState("idle"); }} placeholder={settings.hasServiceAccessToken ? "Gespeichert — neuen Token eingeben, um ihn zu ersetzen" : "Token aus der Service-Konfiguration"} placeholderTextColor={glassSurface.textMuted} secureTextEntry style={[styles.input, getInputStyle(serviceTokenValidation, serviceTokenTouched)]} value={serviceAccessToken} />
          <ValidationMessage active={serviceTokenTouched || settings.hasServiceAccessToken || Boolean(serviceAccessToken)} validation={serviceTokenValidation} />
          {settings.hasServiceAccessToken ? <TouchableOpacity activeOpacity={0.7} onPress={() => void clearServiceAccessToken()} style={styles.clearAction}><Text style={styles.clearActionText}>Service-Zugriffstoken entfernen</Text></TouchableOpacity> : null}
          <Text style={styles.fieldLabel}>REPOSITORY-URL</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={setRepositoryUrl} placeholder="https://github.com/owner/repository.git" placeholderTextColor={glassSurface.textMuted} style={styles.input} value={repositoryUrl} />
          <Text style={styles.fieldLabel}>BRANCH</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setBranch(value); setAttachState("idle"); }} placeholder="main" placeholderTextColor={glassSurface.textMuted} style={styles.input} value={branch} />
          <TouchableOpacity activeOpacity={0.75} onPress={() => { setRepositoryUrl(integrationFixture.repositoryUrl); setBranch(integrationFixture.branch); setAttachState("idle"); }} style={styles.fixtureButton}>
            <IconSymbol name="bolt.fill" size={16} color={glassPalette.cyan} />
            <View style={styles.fixtureTextArea}>
              <Text style={styles.fixtureTitle}>Test-Repository einsetzen</Text>
              <Text style={styles.fixtureDetail}>{integrationFixture.label}</Text>
            </View>
            <IconSymbol name="arrow.right" size={16} color={glassPalette.cyan} />
          </TouchableOpacity>
          <View style={styles.attachArea}>
            <GlowButton accent="cyan" label={attachState === "connecting" ? "Repository wird verbunden …" : "Repository verbinden"} onPress={() => void connectRepository()} disabled={!canAttach || attachState === "connecting"} />
            {attachState === "connected" ? <View style={styles.attachSuccess}><IconSymbol name="checkmark.circle.fill" size={17} color={glassPalette.green} /><Text style={styles.attachSuccessText}>{attachMessage}</Text></View> : null}
            {attachState === "error" ? <View style={styles.attachError}><IconSymbol name="exclamationmark.triangle.fill" size={17} color={glassPalette.red} /><Text style={styles.attachErrorText}>{attachMessage}</Text></View> : null}
          </View>
        </View>
        <View style={styles.sectionSpacer}>
          <Text style={styles.sectionLabel}>GITHUB</Text>
          <Text style={styles.sectionTitle}>Persönlicher Zugriffstoken</Text>
          <Text style={styles.fieldHint}>Der Token wird nur für die aktuelle Sitzung übertragen und auf iOS/Android verschlüsselt auf deinem Gerät verwahrt.</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setGithubToken} placeholder={settings.hasGitHubToken ? "Gespeichert — neuen Token eingeben, um ihn zu ersetzen" : "github_pat_…"} placeholderTextColor={glassSurface.textMuted} secureTextEntry style={styles.input} value={githubToken} />
          {settings.hasGitHubToken ? <TouchableOpacity activeOpacity={0.7} onPress={() => void clearGitHubToken()} style={styles.clearAction}><Text style={styles.clearActionText}>GitHub-Token entfernen</Text></TouchableOpacity> : null}
        </View>
        <View style={styles.sectionSpacer}>
          <Text style={styles.sectionLabel}>KI-AGENT</Text>
          <Text style={styles.sectionTitle}>Provider-Profil</Text>
          {isAdmin && provider === "auto" ? (
            <View style={[styles.providerRow, styles.providerRowSelected]}>
              <View style={[styles.radio, styles.radioSelected]}><View style={styles.radioDot} /></View>
              <View style={styles.providerText}>
                <Text style={styles.providerLabel}>Autonomes Routing aktiv</Text>
                <Text style={styles.providerDetail}>Optimale KI wird automatisch zugewiesen — du kannst darunter jederzeit manuell einen Provider wählen (z. B. Groq oder OpenRouter).</Text>
              </View>
            </View>
          ) : null}
          {providerOptions.map((option) => {
            const selected = option.id === provider;
            return (
              <TouchableOpacity key={option.id} activeOpacity={0.75} onPress={() => { setProvider(option.id); setProviderApiKey(""); setCloudTestState("idle"); setCloudTestMessage(""); setSaveState("idle"); }} style={[styles.providerRow, selected && styles.providerRowSelected]}>
                <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                <View style={styles.providerText}>
                  <Text style={styles.providerLabel}>{option.label}</Text>
                  <Text style={styles.providerDetail}>{option.detail}</Text>
                  <Text style={[styles.providerKeyStatus, settings.providerKeyStatus[option.id] && styles.providerKeyStatusConfigured]}>{getProviderKeyStatusLabel(option.id, Boolean(settings.providerKeyStatus[option.id]))}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {provider !== "managed" ? (
            <>
              <Text style={styles.fieldHint}>Tippe auf ein Provider-Profil, um dessen Key unabhängig zu hinterlegen, zu ersetzen oder zu löschen.</Text>
              <Text style={styles.fieldLabel}>API-KEY FÜR {provider.toUpperCase()}</Text>
              <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setProviderApiKey(value); setCloudTestState("idle"); setCloudTestMessage(""); }} placeholder={settings.providerKeyStatus[provider] ? "Gespeichert — neuen Key eingeben, um ihn zu ersetzen" : "API-Key eingeben"} placeholderTextColor={glassSurface.textMuted} secureTextEntry style={settings.providerKeyStatus[provider] ? [styles.input, styles.inputStored] : styles.input} value={providerApiKey} />
              {settings.providerKeyStatus[provider] ? <TouchableOpacity activeOpacity={0.7} onPress={() => void clearProviderKey()} style={styles.clearAction}><Text style={styles.clearActionText}>Provider-Key für {provider.toUpperCase()} entfernen</Text></TouchableOpacity> : null}
              {selectedCloudProvider ? <>
                <TouchableOpacity accessibilityLabel={`${provider} Verbindung testen`} accessibilityRole="button" activeOpacity={0.75} disabled={cloudTestState === "checking"} onPress={() => void testSelectedCloudProvider()} style={[styles.cloudTestButton, cloudTestState === "checking" && styles.endpointTestButtonDisabled]}><IconSymbol name={cloudTestState === "ready" ? "checkmark.circle.fill" : "bolt.fill"} size={15} color={glassPalette.cyan} /><Text style={styles.cloudTestButtonText}>{cloudTestState === "checking" ? "Cloud-Key wird geprüft …" : "Verbindung testen"}</Text></TouchableOpacity>
                <EndpointTestFeedback scope="cloud" state={cloudTestState} message={cloudTestMessage} />
              </> : null}
            </>
          ) : null}
        </View>
        <View style={styles.sectionSpacer}>
          <Text style={styles.sectionLabel}>LOKAL</Text>
          <Text style={styles.sectionTitle}>Provider-Endpoints</Text>
          <Text style={styles.fieldHint}>Lege die erreichbare Basisadresse für lokale KI fest. Auf Android zeigt localhost auf das Telefon – verwende für einen Rechner im Netzwerk dessen LAN-, VPN- oder Tailscale-Adresse.</Text>
          <Text style={styles.fieldLabel}>OLLAMA BASIS-URL</Text>
          <View style={styles.endpointFieldRow}>
            <TextInput accessibilityLabel="Ollama Basis-URL" autoCapitalize="none" autoCorrect={false} keyboardType="url" onBlur={() => setOllamaEndpointTouched(true)} onChangeText={(value) => { setOllamaEndpoint(value); setOllamaEndpointTouched(true); setEndpointTestState((current) => ({ ...current, ollama: "idle" })); setEndpointTestMessage((current) => ({ ...current, ollama: "" })); setSaveState("idle"); }} placeholder="http://192.168.1.20:11434/v1" placeholderTextColor={glassSurface.textMuted} style={[styles.input, styles.endpointInput, getInputStyle(ollamaEndpointValidation, ollamaEndpointTouched)]} value={ollamaEndpoint} />
            <TouchableOpacity accessibilityLabel="Ollama Endpoint testen" accessibilityRole="button" activeOpacity={0.75} disabled={endpointTestState.ollama === "checking"} onPress={() => void testEndpoint("ollama", ollamaEndpoint, ollamaEndpointValidation)} style={[styles.endpointTestButton, endpointTestState.ollama === "checking" && styles.endpointTestButtonDisabled]}><IconSymbol name={endpointTestState.ollama === "ready" ? "checkmark.circle.fill" : "bolt.fill"} size={15} color={glassDepth.deep} /><Text style={styles.endpointTestButtonText}>{endpointTestState.ollama === "checking" ? "Prüfe …" : "Endpoint testen"}</Text></TouchableOpacity>
          </View>
          <ValidationMessage active={ollamaEndpointTouched} validation={ollamaEndpointValidation} />
          <EndpointTestFeedback state={endpointTestState.ollama} message={endpointTestMessage.ollama} />
          <Text style={styles.fieldLabel}>LM STUDIO BASIS-URL</Text>
          <View style={styles.endpointFieldRow}>
            <TextInput accessibilityLabel="LM Studio Basis-URL" autoCapitalize="none" autoCorrect={false} keyboardType="url" onBlur={() => setLmstudioEndpointTouched(true)} onChangeText={(value) => { setLmstudioEndpoint(value); setLmstudioEndpointTouched(true); setEndpointTestState((current) => ({ ...current, lmstudio: "idle" })); setEndpointTestMessage((current) => ({ ...current, lmstudio: "" })); setSaveState("idle"); }} placeholder="http://192.168.1.20:1234/v1" placeholderTextColor={glassSurface.textMuted} style={[styles.input, styles.endpointInput, getInputStyle(lmstudioEndpointValidation, lmstudioEndpointTouched)]} value={lmstudioEndpoint} />
            <TouchableOpacity accessibilityLabel="LM Studio Endpoint testen" accessibilityRole="button" activeOpacity={0.75} disabled={endpointTestState.lmstudio === "checking"} onPress={() => void testEndpoint("lmstudio", lmstudioEndpoint, lmstudioEndpointValidation)} style={[styles.endpointTestButton, endpointTestState.lmstudio === "checking" && styles.endpointTestButtonDisabled]}><IconSymbol name={endpointTestState.lmstudio === "ready" ? "checkmark.circle.fill" : "bolt.fill"} size={15} color={glassDepth.deep} /><Text style={styles.endpointTestButtonText}>{endpointTestState.lmstudio === "checking" ? "Prüfe …" : "Endpoint testen"}</Text></TouchableOpacity>
          </View>
          <ValidationMessage active={lmstudioEndpointTouched} validation={lmstudioEndpointValidation} />
          <EndpointTestFeedback state={endpointTestState.lmstudio} message={endpointTestMessage.lmstudio} />
        </View>
        <View style={styles.sectionSpacer}>
          <Text style={styles.sectionLabel}>DATENSCHUTZ</Text>
          <Text style={styles.sectionTitle}>Chat-Inhalte auf diesem Gerät</Text>
          {Platform.OS === "web" ? <View style={styles.webWarning}><IconSymbol name="exclamationmark.triangle.fill" size={17} color={glassPalette.amber} /><Text style={styles.webWarningText}>Die geschützte Chat-Ablage ist im Web-Build nicht verfügbar. Nutze für verschlüsselte lokale Gesprächsinhalte die native App.</Text></View> : <TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: settings.protectChatContent }} activeOpacity={0.75} onPress={() => void setProtectedChatContent(!settings.protectChatContent)} style={[styles.protectionRow, settings.protectChatContent && styles.protectionRowEnabled]}><View style={[styles.protectionIndicator, settings.protectChatContent && styles.protectionIndicatorEnabled]}><IconSymbol name={settings.protectChatContent ? "lock.fill" : "lock.open.fill"} size={16} color={settings.protectChatContent ? glassPalette.green : glassSurface.textSecondary} /></View><View style={styles.providerText}><Text style={styles.providerLabel}>{settings.protectChatContent ? "Geschützte Chat-Ablage aktiv" : "Geschützte Chat-Ablage deaktiviert"}</Text><Text style={styles.providerDetail}>{settings.protectChatContent ? "Verlauf wird lokal über den geschützten Gerätespeicher verschlüsselt abgelegt. Bestehende Inhalte werden migriert." : "Aktiviere die geräteverschlüsselte Ablage für Gesprächsinhalte. Tokens und Dateiinhalte werden weiterhin nicht gespeichert."}</Text></View></TouchableOpacity>}
        </View>
        <View style={styles.sectionSpacer}>
          <Text style={styles.sectionLabel}>BACKUP</Text>
          <Text style={styles.sectionTitle}>Provider-Konfiguration sichern</Text>
          <View style={styles.backupOverview}>
            <View style={styles.backupOverviewRow}>
              <View style={styles.backupOverviewIcon}><IconSymbol name="lock.fill" size={18} color={glassPalette.purple} /></View>
              <View style={styles.backupOverviewCopy}>
                <Text style={styles.backupOverviewTitle}>Sicherer lokaler Tresor</Text>
                <Text style={styles.backupOverviewText}>Keys und lokale Endpoints bleiben verschlüsselt und werden erst nach deiner Bestätigung geteilt oder wiederhergestellt.</Text>
              </View>
            </View>
            <View style={styles.backupStatsRow}>
              <View style={styles.backupStat}><Text style={styles.backupStatValue}>{configuredProviderKeyCount}</Text><Text style={styles.backupStatLabel}>Cloud-Keys</Text></View>
              <View style={styles.backupStat}><Text style={styles.backupStatValue}>{configuredEndpointCount}</Text><Text style={styles.backupStatLabel}>lokale Endpoints</Text></View>
              <View style={styles.backupStat}><Text style={styles.backupStatValue}>HMAC</Text><Text style={styles.backupStatLabel}>Integrität</Text></View>
            </View>
          </View>
          <View style={styles.backupActionCard}>
            <View style={styles.backupActionHeader}>
              <View style={[styles.backupActionIcon, styles.backupActionIconExport]}><IconSymbol name="lock.fill" size={17} color={glassPalette.purple} /></View>
              <View style={styles.backupActionCopy}><Text style={styles.backupActionTitle}>Export erstellen</Text><Text style={styles.backupActionSubtitle}>Verschlüsselte Datei sicher teilen</Text></View>
            </View>
            <Text style={styles.backupActionHint}>Service- und GitHub-Tokens werden bewusst ausgeschlossen. Das Passwort wird nur für diesen Export verwendet und nie gespeichert.</Text>
            <Text style={styles.fieldLabel}>BACKUP-PASSWORT</Text>
            <TextInput accessibilityHint="Mindestens 12 Zeichen. Das Passwort nicht gemeinsam mit der Backup-Datei weitergeben." accessibilityLabel="Passwort für Settings-Backup" autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setBackupPassphrase(value); setBackupState("idle"); setBackupMessage(""); }} placeholder="Mindestens 12 Zeichen" placeholderTextColor={glassSurface.textMuted} secureTextEntry style={styles.input} value={backupPassphrase} />
            <TouchableOpacity accessibilityLabel="Verschlüsseltes Settings-Backup erstellen und teilen" accessibilityRole="button" activeOpacity={0.75} disabled={backupState === "exporting" || !isValidSettingsBackupPassword(backupPassphrase)} onPress={confirmSettingsBackupExport} style={[styles.backupButton, (backupState === "exporting" || !isValidSettingsBackupPassword(backupPassphrase)) && styles.endpointTestButtonDisabled]}><IconSymbol name="lock.fill" size={15} color={glassDepth.deep} /><Text style={styles.backupButtonText}>{backupState === "exporting" ? "Backup wird erstellt …" : "Verschlüsseltes Backup teilen"}</Text></TouchableOpacity>
            {backupState === "shared" || backupState === "error" ? <View style={[styles.backupFeedback, backupState === "shared" ? styles.backupFeedbackReady : styles.backupFeedbackError]}><IconSymbol name={backupState === "shared" ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"} size={15} color={backupState === "shared" ? glassPalette.green : glassPalette.red} /><Text style={[styles.backupFeedbackText, backupState === "shared" ? styles.backupFeedbackTextReady : styles.backupFeedbackTextError]}>{backupMessage}</Text></View> : null}
          </View>
          <View style={styles.importCard}>
            <View style={styles.backupActionHeader}>
              <View style={[styles.backupActionIcon, styles.backupActionIconImport]}><IconSymbol name="arrow.down.circle.fill" size={18} color={glassPalette.green} /></View>
              <View style={styles.backupActionCopy}><Text style={styles.backupActionTitle}>Import wiederherstellen</Text><Text style={styles.backupActionSubtitle}>Gesicherte Konfiguration zurückholen</Text></View>
            </View>
            <Text style={styles.backupActionHint}>Wähle eine verschlüsselte .csc-backup-Datei aus. Erst nach korrektem Passwort und deiner Bestätigung werden Werte übernommen.</Text>
            <TouchableOpacity accessibilityLabel="Verschlüsseltes Settings-Backup auswählen" accessibilityRole="button" activeOpacity={0.75} disabled={importState === "picking" || importState === "importing"} onPress={() => void pickSettingsBackup()} style={styles.importPickerButton}><IconSymbol name="folder.fill" size={15} color={glassPalette.purple} /><Text style={styles.importPickerButtonText}>{importState === "picking" ? "Datei wird ausgewählt …" : importCandidate ? "Andere Backup-Datei auswählen" : "Backup-Datei auswählen"}</Text></TouchableOpacity>
            {importCandidate ? <>
              <View style={styles.importFileRow}><IconSymbol name="doc.fill" size={15} color={glassPalette.purple} /><Text style={styles.importFileText} numberOfLines={1}>{importCandidate.filename}</Text></View>
              <Text style={styles.fieldLabel}>BACKUP-PASSWORT</Text>
              <TextInput accessibilityHint="Mindestens 12 Zeichen. Das Passwort wird nicht gespeichert." accessibilityLabel="Passwort für Backup-Import" autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setImportPassphrase(value); setImportPreview(null); setImportState("ready"); setImportMessage(""); }} placeholder="Passwort der Backup-Datei" placeholderTextColor={glassSurface.textMuted} secureTextEntry style={styles.input} value={importPassphrase} />
              <TouchableOpacity accessibilityLabel="Backup-Passwort prüfen" accessibilityRole="button" activeOpacity={0.75} disabled={!isValidSettingsBackupPassword(importPassphrase) || importState === "importing"} onPress={inspectSettingsBackup} style={[styles.importInspectButton, (!isValidSettingsBackupPassword(importPassphrase) || importState === "importing") && styles.endpointTestButtonDisabled]}><IconSymbol name="lock.open.fill" size={15} color={glassDepth.deep} /><Text style={styles.importInspectButtonText}>Backup prüfen</Text></TouchableOpacity>
              {importPreview ? <View style={styles.importPreviewCard}><Text style={styles.importPreviewTitle}>Vorschau bestätigt</Text><Text style={styles.importPreviewText}>{importPreview.providerIds.length} Cloud-Key{importPreview.providerIds.length === 1 ? "" : "s"} · {importPreview.endpointCount} lokale Endpoint{importPreview.endpointCount === 1 ? "" : "s"}</Text><Text style={styles.importPreviewHint}>Keine Service- oder GitHub-Tokens enthalten</Text><TouchableOpacity accessibilityLabel="Verifiziertes Settings-Backup wiederherstellen" accessibilityRole="button" activeOpacity={0.75} disabled={importState === "importing"} onPress={confirmSettingsBackupImport} style={[styles.restoreButton, importState === "importing" && styles.endpointTestButtonDisabled]}><IconSymbol name="arrow.down.circle.fill" size={15} color={glassDepth.deep} /><Text style={styles.restoreButtonText}>{importState === "importing" ? "Wird wiederhergestellt …" : "Jetzt wiederherstellen"}</Text></TouchableOpacity></View> : null}
            </> : null}
            {importMessage ? <View style={[styles.backupFeedback, importState === "restored" ? styles.backupFeedbackReady : importState === "error" ? styles.backupFeedbackError : styles.backupFeedbackChecking]}><IconSymbol name={importState === "restored" ? "checkmark.circle.fill" : importState === "error" ? "exclamationmark.triangle.fill" : "bolt.fill"} size={15} color={importState === "restored" ? glassPalette.green : importState === "error" ? glassPalette.red : glassPalette.cyan} /><Text style={[styles.backupFeedbackText, importState === "restored" ? styles.backupFeedbackTextReady : importState === "error" ? styles.backupFeedbackTextError : styles.backupFeedbackTextChecking]}>{importMessage}</Text></View> : null}
          </View>
        </View>
        {Platform.OS === "web" ? <View style={styles.webWarning}><IconSymbol name="exclamationmark.triangle.fill" size={17} color={glassPalette.amber} /><Text style={styles.webWarningText}>Im Web-Build werden eingegebene Schlüssel nur in der Browser-Sitzung gehalten. Nutze für produktive Schlüssel die native App oder die serverseitige Provider-Konfiguration.</Text></View> : null}
        <View style={styles.saveArea}>
          <View style={[styles.readinessCard, canSave ? styles.readinessCardReady : styles.readinessCardPending]}>
            <IconSymbol name={canSave ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"} size={17} color={canSave ? glassPalette.green : glassPalette.amber} />
            <Text style={[styles.readinessText, canSave ? styles.readinessTextReady : styles.readinessTextPending]}>{canSave ? "Service-Adresse und Zugriffstoken sind bereit zum Speichern." : "Vervollständige die beiden Service-Felder, um die Konfiguration zu speichern."}</Text>
          </View>
          <GlowButton accent="green" label={saveState === "saving" ? "Wird gespeichert …" : "Konfiguration speichern"} onPress={() => void persistSettings()} disabled={saveState === "saving" || !canSave} />
          {saveState === "saved" ? <Text style={styles.savedLabel}>Lokal gespeichert. Der Service kann jetzt über die definierte API angesprochen werden.</Text> : null}
        </View>
        <View style={styles.notice}>
          <IconSymbol name="checkmark.circle.fill" size={18} color={glassPalette.green} />
          <Text style={styles.noticeText}>Lokale Entwürfe bleiben verfügbar, auch wenn kein Remote-Service verbunden ist.</Text>
        </View>
      </ScrollView>
      </ScreenContainer>
    </GlassBackdrop>
  );
}

function getInputStyle(validation: FieldValidation, active: boolean) {
  if (!active) return undefined;
  if (validation.valid) return validation.tone === "stored" ? styles.inputStored : styles.inputValid;
  return styles.inputInvalid;
}

function EndpointTestFeedback({ scope = "local", state, message }: { scope?: "local" | "cloud"; state: EndpointTestState; message: string }) {
  if (state === "idle") return null;
  const ready = state === "ready";
  const checking = state === "checking";
  return (
    <View style={[styles.endpointFeedback, ready ? styles.endpointFeedbackReady : checking ? styles.endpointFeedbackChecking : styles.endpointFeedbackError]}>
      <IconSymbol name={ready ? "checkmark.circle.fill" : checking ? "bolt.fill" : "exclamationmark.triangle.fill"} size={15} color={ready ? glassPalette.green : checking ? glassPalette.cyan : glassPalette.red} />
      <Text style={[styles.endpointFeedbackText, ready ? styles.endpointFeedbackTextReady : checking ? styles.endpointFeedbackTextChecking : styles.endpointFeedbackTextError]}>{checking ? `${scope === "cloud" ? "Cloud-Key" : "Verbindung zum lokalen Provider"} wird geprüft …` : message}</Text>
    </View>
  );
}

function ValidationMessage({ active, validation }: { active: boolean; validation: FieldValidation }) {
  if (!active) return null;
  const icon = validation.valid ? "checkmark.circle.fill" : validation.tone === "neutral" ? "exclamationmark.triangle.fill" : "exclamationmark.triangle.fill";
  const color = validation.valid ? (validation.tone === "stored" ? glassPalette.purple : glassPalette.green) : validation.tone === "neutral" ? glassPalette.amber : glassPalette.red;
  return (
    <View style={styles.validationRow}>
      <IconSymbol name={icon} size={15} color={color} />
      <Text style={[styles.validationText, validation.valid ? styles.validationTextSuccess : validation.tone === "neutral" ? styles.validationTextNeutral : styles.validationTextError]}>{validation.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  headerCopy: { flex: 1 },
  eyebrow: { ...glassType.label, color: glassPalette.cyan },
  screenTitle: { ...glassType.display, color: glassSurface.textPrimary, marginTop: 4 },
  headerAction: { alignItems: "center", borderRadius: 10, height: 36, justifyContent: "center", width: 36 },
  sectionLabel: { ...glassType.label, color: glassSurface.textMuted, marginTop: 18 },
  sectionTitle: { ...glassType.headline, color: glassSurface.textPrimary, marginTop: 2 },
  emptyGlass: { alignItems: "center", paddingHorizontal: 18, paddingVertical: 22 },
  emptyGlassIcon: { alignItems: "center", backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 14, borderWidth: 1, height: 46, justifyContent: "center", marginBottom: 12, width: 46 },
  emptyGlassTitle: { color: glassSurface.textPrimary, fontSize: 13, fontWeight: "800", marginBottom: 5, textAlign: "center" },
  emptyGlassDescription: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 16, textAlign: "center" },
  content: { paddingBottom: 20 },
  sectionSpacer: { marginTop: 26 },
  fieldLabel: { color: glassSurface.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.05, marginBottom: 7, marginTop: 16 },
  fieldHint: { color: glassSurface.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 9 },
  input: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 13, borderWidth: 1, color: glassSurface.textPrimary, fontSize: 14, minHeight: 48, paddingHorizontal: 13, paddingVertical: 11 },
  inputValid: { borderColor: glassPalette.green },
  inputStored: { borderColor: glassPalette.purple },
  inputInvalid: { borderColor: glassPalette.red },
  endpointFieldRow: { alignItems: "stretch", flexDirection: "row", gap: 8 },
  endpointInput: { flex: 1, minWidth: 0 },
  endpointTestButton: { alignItems: "center", backgroundColor: glassPalette.cyan, borderRadius: 12, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 48, paddingHorizontal: 10 },
  endpointTestButtonDisabled: { opacity: 0.58 },
  endpointTestButtonText: { color: glassDepth.deep, fontSize: 11, fontWeight: "900" },
  cloudTestButton: { alignItems: "center", alignSelf: "flex-start", borderColor: glassSurface.border, borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 7, marginTop: 12, minHeight: 44, paddingHorizontal: 12 },
  cloudTestButtonText: { color: glassPalette.cyan, fontSize: 12, fontWeight: "800" },
  endpointFeedback: { alignItems: "flex-start", borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 7, marginTop: 8, paddingHorizontal: 10, paddingVertical: 9 },
  endpointFeedbackReady: { backgroundColor: accentAlpha("green", 0.1), borderColor: accentAlpha("green", 0.32) },
  endpointFeedbackChecking: { backgroundColor: accentAlpha("cyan", 0.09), borderColor: accentAlpha("cyan", 0.3) },
  endpointFeedbackError: { backgroundColor: accentAlpha("red", 0.1), borderColor: accentAlpha("red", 0.32) },
  endpointFeedbackText: { flex: 1, fontSize: 12, lineHeight: 17 },
  endpointFeedbackTextReady: { color: glassPalette.green },
  endpointFeedbackTextChecking: { color: glassPalette.cyan },
  endpointFeedbackTextError: { color: glassPalette.red },
  validationRow: { alignItems: "flex-start", flexDirection: "row", gap: 7, marginTop: 8 },
  validationText: { flex: 1, fontSize: 12, lineHeight: 17 },
  validationTextSuccess: { color: glassPalette.green },
  validationTextNeutral: { color: glassPalette.amber },
  validationTextError: { color: glassPalette.red },
  backupSummary: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 13, borderWidth: 1, marginTop: 12, padding: 12 },
  backupSummaryText: { color: glassSurface.textPrimary, fontSize: 12, fontWeight: "800" },
  backupSummaryHint: { color: glassSurface.textSecondary, fontFamily: "monospace", fontSize: 10, marginTop: 5 },
  backupOverview: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 13 },
  backupOverviewRow: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  backupOverviewIcon: { alignItems: "center", backgroundColor: glassDepth.layer, borderRadius: 11, height: 38, justifyContent: "center", width: 38 },
  backupOverviewCopy: { flex: 1 },
  backupOverviewTitle: { color: glassSurface.textPrimary, fontSize: 13, fontWeight: "900", marginBottom: 3 },
  backupOverviewText: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 17 },
  backupStatsRow: { borderColor: glassSurface.border, borderTopWidth: 1, flexDirection: "row", gap: 8, marginTop: 13, paddingTop: 11 },
  backupStat: { flex: 1, minWidth: 0 },
  backupStatValue: { color: glassPalette.purple, fontSize: 14, fontWeight: "900" },
  backupStatLabel: { color: glassSurface.textSecondary, fontSize: 10, lineHeight: 14, marginTop: 2 },
  backupActionCard: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 15, borderWidth: 1, marginTop: 12, padding: 13 },
  backupActionHeader: { alignItems: "center", flexDirection: "row", gap: 10 },
  backupActionIcon: { alignItems: "center", borderRadius: 11, height: 36, justifyContent: "center", width: 36 },
  backupActionIconExport: { backgroundColor: glassDepth.layer },
  backupActionIconImport: { backgroundColor: glassDepth.layer },
  backupActionCopy: { flex: 1 },
  backupActionTitle: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "900" },
  backupActionSubtitle: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 2 },
  backupActionHint: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 11 },
  backupButton: { alignItems: "center", backgroundColor: glassPalette.purple, borderRadius: 12, flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 12, minHeight: 48, paddingHorizontal: 12 },
  backupButtonText: { color: glassDepth.deep, fontSize: 12, fontWeight: "900" },
  backupFeedback: { alignItems: "flex-start", borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 7, marginTop: 8, paddingHorizontal: 10, paddingVertical: 9 },
  backupFeedbackReady: { backgroundColor: accentAlpha("green", 0.1), borderColor: accentAlpha("green", 0.32) },
  backupFeedbackError: { backgroundColor: accentAlpha("red", 0.1), borderColor: accentAlpha("red", 0.32) },
  backupFeedbackChecking: { backgroundColor: accentAlpha("cyan", 0.09), borderColor: accentAlpha("cyan", 0.3) },
  backupFeedbackText: { flex: 1, fontSize: 12, lineHeight: 17 },
  backupFeedbackTextReady: { color: glassPalette.green },
  backupFeedbackTextError: { color: glassPalette.red },
  backupFeedbackTextChecking: { color: glassPalette.cyan },
  importCard: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 15, borderWidth: 1, marginTop: 14, padding: 13 },
  importTitle: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "800", marginBottom: 6 },
  importPickerButton: { alignItems: "center", borderColor: glassSurface.borderStrong, borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 },
  importPickerButtonText: { color: glassPalette.purple, fontSize: 12, fontWeight: "800" },
  importFileRow: { alignItems: "center", backgroundColor: glassDepth.layer, borderRadius: 10, flexDirection: "row", gap: 7, marginTop: 10, paddingHorizontal: 10, paddingVertical: 9 },
  importFileText: { color: glassSurface.textPrimary, flex: 1, fontSize: 12, fontWeight: "700" },
  importInspectButton: { alignItems: "center", backgroundColor: glassPalette.purple, borderRadius: 11, flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 11, minHeight: 44, paddingHorizontal: 12 },
  importInspectButtonText: { color: glassDepth.deep, fontSize: 12, fontWeight: "900" },
  importPreviewCard: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 11 },
  importPreviewTitle: { color: glassPalette.green, fontSize: 12, fontWeight: "900" },
  importPreviewText: { color: glassSurface.textPrimary, fontSize: 12, fontWeight: "800", marginTop: 5 },
  importPreviewHint: { color: glassPalette.green, fontSize: 11, lineHeight: 16, marginTop: 4 },
  restoreButton: { alignItems: "center", backgroundColor: glassPalette.green, borderRadius: 10, flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 10, minHeight: 44, paddingHorizontal: 12 },
  restoreButtonText: { color: glassDepth.deep, fontSize: 12, fontWeight: "900" },
  clearAction: { alignSelf: "flex-start", marginTop: 10 },
  clearActionText: { color: glassPalette.red, fontSize: 12, fontWeight: "800" },
  providerRow: { alignItems: "center", backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 15, borderWidth: 1, flexDirection: "row", gap: 11, marginBottom: 8, padding: 12 },
  providerRowSelected: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border },
  radio: { alignItems: "center", borderColor: glassSurface.textSecondary, borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: "center", width: 20 },
  radioSelected: { borderColor: glassPalette.cyan },
  radioDot: { backgroundColor: glassPalette.cyan, borderRadius: 5, height: 10, width: 10 },
  providerText: { flex: 1 },
  providerLabel: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "800", marginBottom: 3 },
  providerDetail: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 17 },
  providerKeyStatus: { color: glassSurface.textSecondary, fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: 4 },
  providerKeyStatusConfigured: { color: glassPalette.green },
  protectionRow: { alignItems: "center", backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 15, borderWidth: 1, flexDirection: "row", gap: 11, padding: 12 },
  protectionRowEnabled: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border },
  protectionIndicator: { alignItems: "center", backgroundColor: glassDepth.layer, borderRadius: 10, height: 34, justifyContent: "center", width: 34 },
  protectionIndicatorEnabled: { backgroundColor: glassDepth.layer },
  webWarning: { alignItems: "flex-start", backgroundColor: accentAlpha("amber", 0.11), borderColor: accentAlpha("amber", 0.35), borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 9, marginTop: 26, padding: 13 },
  webWarningText: { color: glassPalette.amber, flex: 1, fontSize: 12, lineHeight: 18 },
  saveArea: { marginTop: 26 },
  readinessCard: { alignItems: "flex-start", borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 8, marginBottom: 11, padding: 12 },
  readinessCardReady: { backgroundColor: accentAlpha("green", 0.1), borderColor: accentAlpha("green", 0.36) },
  readinessCardPending: { backgroundColor: accentAlpha("amber", 0.1), borderColor: accentAlpha("amber", 0.32) },
  readinessText: { flex: 1, fontSize: 12, lineHeight: 18 },
  readinessTextReady: { color: glassPalette.green },
  readinessTextPending: { color: glassPalette.amber },
  attachArea: { marginTop: 16 },
  fixtureButton: { alignItems: "center", backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 9, marginTop: 13, padding: 12 },
  fixtureTextArea: { flex: 1 },
  fixtureTitle: { color: glassSurface.textPrimary, fontSize: 13, fontWeight: "800", marginBottom: 2 },
  fixtureDetail: { color: glassSurface.textSecondary, fontSize: 11 },
  attachSuccess: { alignItems: "flex-start", backgroundColor: accentAlpha("green", 0.1), borderColor: accentAlpha("green", 0.34), borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 8, marginTop: 10, padding: 12 },
  attachSuccessText: { color: glassPalette.green, flex: 1, fontSize: 12, lineHeight: 18 },
  attachError: { alignItems: "flex-start", backgroundColor: accentAlpha("red", 0.1), borderColor: accentAlpha("red", 0.32), borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 8, marginTop: 10, padding: 12 },
  attachErrorText: { color: glassPalette.red, flex: 1, fontSize: 12, lineHeight: 18 },
  savedLabel: { color: glassPalette.green, fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: "center" },
  notice: { alignItems: "flex-start", flexDirection: "row", gap: 9, marginTop: 20, paddingHorizontal: 5 },
  noticeText: { color: glassSurface.textSecondary, flex: 1, fontSize: 12, lineHeight: 18 },
  designOptionStack: { gap: 8 },
  designOption: { alignItems: "center", borderColor: glassSurface.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10 },
  palettePreview: { flexDirection: "row", gap: 4, marginLeft: "auto" },
  paletteSwatch: { borderRadius: 99, height: 10, width: 10 },
  designOptionTextArea: { flex: 1, gap: 2 },
  designOptionTitle: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "700" },
  designOptionDescription: { color: glassSurface.textSecondary, fontSize: 11, fontWeight: "500" },

});
