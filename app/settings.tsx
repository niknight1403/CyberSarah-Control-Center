import { EmptySurface, PrimaryButton, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { integrationFixture } from "@/constants/integration-fixture";
import { providerOptions, type ProviderId, useStudioSettings } from "@/lib/studio-settings";
import { getProviderKeyStatusLabel } from "@/lib/provider-key-logic";
import { cloudProviderIds, defaultLocalProviderEndpoints, type CloudProviderId } from "@/lib/studio-settings-logic";
import { type FieldValidation, validateLocalProviderEndpoint, validateServiceAccessToken, validateWorkspaceUrl } from "@/lib/settings-validation";
import { getSettingsBackupShareConfirmation, isValidSettingsBackupPassword } from "@/lib/settings-backup";
import { useWorkspace } from "@/lib/workspace-context";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type LocalProviderId = "ollama" | "lmstudio";
type EndpointTestState = "idle" | "checking" | "ready" | "error";

export default function SettingsScreen() {
  const { attachRepository, clearGitHubToken, clearProviderKey, clearServiceAccessToken, exportSettingsBackup, loading, readAttachedFile, saveSettings, setProtectedChatContent, settings, testCloudProvider, testLocalProviderEndpoint } = useStudioSettings();
  const { loadRemoteFiles } = useWorkspace();
  const [workspaceUrl, setWorkspaceUrl] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [branch, setBranch] = useState("main");
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
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <StudioHeader eyebrow="Steuerzentrale" title="Verbindung" actionIcon="chevron.left" actionLabel="Zurück" onAction={() => router.back()} />
        <EmptySurface
          description="Ein eigener Workspace-Service führt Repository-, Git- und Build-Operationen auf deiner Infrastruktur aus. Dieser Client bleibt der sichere Kontrollpunkt."
          icon="bolt.fill"
          title="Workspace konfigurieren"
        />
        <View style={styles.sectionSpacer}>
          <StudioSection label="Service" title="Remote-Arbeitsbereich" />
          <Text style={styles.fieldLabel}>HTTPS-URL DES WORKSPACE-SERVICE</Text>
          <TextInput accessibilityHint="Erfordert eine öffentliche HTTPS-Adresse ohne Beispiel-Domain." accessibilityLabel="HTTPS-URL des Workspace-Service" autoCapitalize="none" autoCorrect={false} keyboardType="url" onBlur={() => setWorkspaceTouched(true)} onChangeText={(value) => { setWorkspaceUrl(value); setWorkspaceTouched(true); setSaveState("idle"); }} placeholder="https://studio.deine-domain.de" placeholderTextColor="#697A90" style={[styles.input, getInputStyle(workspaceValidation, workspaceTouched)]} value={workspaceUrl} />
          <ValidationMessage active={workspaceTouched || Boolean(workspaceUrl)} validation={workspaceValidation} />
          <Text style={styles.fieldHint}>Der Service stellt Git-Operationen, Dateizugriff, Prozess-Runner und die Vorschau bereit.</Text>
          <Text style={styles.fieldLabel}>SERVICE-ZUGRIFFSTOKEN</Text>
          <TextInput accessibilityHint="Füge nur den vollständigen Token ohne Bearer-Präfix, Leerzeichen oder Zeilenumbrüche ein." accessibilityLabel="Service-Zugriffstoken" autoCapitalize="none" autoCorrect={false} onBlur={() => setServiceTokenTouched(true)} onChangeText={(value) => { setServiceAccessToken(value); setServiceTokenTouched(true); setSaveState("idle"); }} placeholder={settings.hasServiceAccessToken ? "Gespeichert — neuen Token eingeben, um ihn zu ersetzen" : "Token aus der Service-Konfiguration"} placeholderTextColor="#697A90" secureTextEntry style={[styles.input, getInputStyle(serviceTokenValidation, serviceTokenTouched)]} value={serviceAccessToken} />
          <ValidationMessage active={serviceTokenTouched || settings.hasServiceAccessToken || Boolean(serviceAccessToken)} validation={serviceTokenValidation} />
          {settings.hasServiceAccessToken ? <TouchableOpacity activeOpacity={0.7} onPress={() => void clearServiceAccessToken()} style={styles.clearAction}><Text style={styles.clearActionText}>Service-Zugriffstoken entfernen</Text></TouchableOpacity> : null}
          <Text style={styles.fieldLabel}>REPOSITORY-URL</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={setRepositoryUrl} placeholder="https://github.com/owner/repository.git" placeholderTextColor="#697A90" style={styles.input} value={repositoryUrl} />
          <Text style={styles.fieldLabel}>BRANCH</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setBranch(value); setAttachState("idle"); }} placeholder="main" placeholderTextColor="#697A90" style={styles.input} value={branch} />
          <TouchableOpacity activeOpacity={0.75} onPress={() => { setRepositoryUrl(integrationFixture.repositoryUrl); setBranch(integrationFixture.branch); setAttachState("idle"); }} style={styles.fixtureButton}>
            <IconSymbol name="bolt.fill" size={16} color="#52D8FF" />
            <View style={styles.fixtureTextArea}>
              <Text style={styles.fixtureTitle}>Test-Repository einsetzen</Text>
              <Text style={styles.fixtureDetail}>{integrationFixture.label}</Text>
            </View>
            <IconSymbol name="arrow.right" size={16} color="#52D8FF" />
          </TouchableOpacity>
          <View style={styles.attachArea}>
            <PrimaryButton icon="folder.fill" label={attachState === "connecting" ? "Repository wird verbunden …" : "Repository verbinden"} onPress={() => void connectRepository()} disabled={!canAttach || attachState === "connecting"} />
            {attachState === "connected" ? <View style={styles.attachSuccess}><IconSymbol name="checkmark.circle.fill" size={17} color="#45D996" /><Text style={styles.attachSuccessText}>{attachMessage}</Text></View> : null}
            {attachState === "error" ? <View style={styles.attachError}><IconSymbol name="exclamationmark.triangle.fill" size={17} color="#FF6B7A" /><Text style={styles.attachErrorText}>{attachMessage}</Text></View> : null}
          </View>
        </View>
        <View style={styles.sectionSpacer}>
          <StudioSection label="GitHub" title="Persönlicher Zugriffstoken" />
          <Text style={styles.fieldHint}>Der Token wird nur für die aktuelle Sitzung übertragen und auf iOS/Android verschlüsselt auf deinem Gerät verwahrt.</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setGithubToken} placeholder={settings.hasGitHubToken ? "Gespeichert — neuen Token eingeben, um ihn zu ersetzen" : "github_pat_…"} placeholderTextColor="#697A90" secureTextEntry style={styles.input} value={githubToken} />
          {settings.hasGitHubToken ? <TouchableOpacity activeOpacity={0.7} onPress={() => void clearGitHubToken()} style={styles.clearAction}><Text style={styles.clearActionText}>GitHub-Token entfernen</Text></TouchableOpacity> : null}
        </View>
        <View style={styles.sectionSpacer}>
          <StudioSection label="KI-Agent" title="Provider-Profil" />
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
              <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setProviderApiKey(value); setCloudTestState("idle"); setCloudTestMessage(""); }} placeholder={settings.providerKeyStatus[provider] ? "Gespeichert — neuen Key eingeben, um ihn zu ersetzen" : "API-Key eingeben"} placeholderTextColor="#697A90" secureTextEntry style={settings.providerKeyStatus[provider] ? [styles.input, styles.inputStored] : styles.input} value={providerApiKey} />
              {settings.providerKeyStatus[provider] ? <TouchableOpacity activeOpacity={0.7} onPress={() => void clearProviderKey()} style={styles.clearAction}><Text style={styles.clearActionText}>Provider-Key für {provider.toUpperCase()} entfernen</Text></TouchableOpacity> : null}
              {selectedCloudProvider ? <>
                <TouchableOpacity accessibilityLabel={`${provider} Verbindung testen`} accessibilityRole="button" activeOpacity={0.75} disabled={cloudTestState === "checking"} onPress={() => void testSelectedCloudProvider()} style={[styles.cloudTestButton, cloudTestState === "checking" && styles.endpointTestButtonDisabled]}><IconSymbol name={cloudTestState === "ready" ? "checkmark.circle.fill" : "bolt.fill"} size={15} color="#52D8FF" /><Text style={styles.cloudTestButtonText}>{cloudTestState === "checking" ? "Cloud-Key wird geprüft …" : "Verbindung testen"}</Text></TouchableOpacity>
                <EndpointTestFeedback scope="cloud" state={cloudTestState} message={cloudTestMessage} />
              </> : null}
            </>
          ) : null}
        </View>
        <View style={styles.sectionSpacer}>
          <StudioSection label="Lokal" title="Provider-Endpoints" />
          <Text style={styles.fieldHint}>Lege die erreichbare Basisadresse für lokale KI fest. Auf Android zeigt localhost auf das Telefon – verwende für einen Rechner im Netzwerk dessen LAN-, VPN- oder Tailscale-Adresse.</Text>
          <Text style={styles.fieldLabel}>OLLAMA BASIS-URL</Text>
          <View style={styles.endpointFieldRow}>
            <TextInput accessibilityLabel="Ollama Basis-URL" autoCapitalize="none" autoCorrect={false} keyboardType="url" onBlur={() => setOllamaEndpointTouched(true)} onChangeText={(value) => { setOllamaEndpoint(value); setOllamaEndpointTouched(true); setEndpointTestState((current) => ({ ...current, ollama: "idle" })); setEndpointTestMessage((current) => ({ ...current, ollama: "" })); setSaveState("idle"); }} placeholder="http://192.168.1.20:11434/v1" placeholderTextColor="#697A90" style={[styles.input, styles.endpointInput, getInputStyle(ollamaEndpointValidation, ollamaEndpointTouched)]} value={ollamaEndpoint} />
            <TouchableOpacity accessibilityLabel="Ollama Endpoint testen" accessibilityRole="button" activeOpacity={0.75} disabled={endpointTestState.ollama === "checking"} onPress={() => void testEndpoint("ollama", ollamaEndpoint, ollamaEndpointValidation)} style={[styles.endpointTestButton, endpointTestState.ollama === "checking" && styles.endpointTestButtonDisabled]}><IconSymbol name={endpointTestState.ollama === "ready" ? "checkmark.circle.fill" : "bolt.fill"} size={15} color="#061019" /><Text style={styles.endpointTestButtonText}>{endpointTestState.ollama === "checking" ? "Prüfe …" : "Endpoint testen"}</Text></TouchableOpacity>
          </View>
          <ValidationMessage active={ollamaEndpointTouched} validation={ollamaEndpointValidation} />
          <EndpointTestFeedback state={endpointTestState.ollama} message={endpointTestMessage.ollama} />
          <Text style={styles.fieldLabel}>LM STUDIO BASIS-URL</Text>
          <View style={styles.endpointFieldRow}>
            <TextInput accessibilityLabel="LM Studio Basis-URL" autoCapitalize="none" autoCorrect={false} keyboardType="url" onBlur={() => setLmstudioEndpointTouched(true)} onChangeText={(value) => { setLmstudioEndpoint(value); setLmstudioEndpointTouched(true); setEndpointTestState((current) => ({ ...current, lmstudio: "idle" })); setEndpointTestMessage((current) => ({ ...current, lmstudio: "" })); setSaveState("idle"); }} placeholder="http://192.168.1.20:1234/v1" placeholderTextColor="#697A90" style={[styles.input, styles.endpointInput, getInputStyle(lmstudioEndpointValidation, lmstudioEndpointTouched)]} value={lmstudioEndpoint} />
            <TouchableOpacity accessibilityLabel="LM Studio Endpoint testen" accessibilityRole="button" activeOpacity={0.75} disabled={endpointTestState.lmstudio === "checking"} onPress={() => void testEndpoint("lmstudio", lmstudioEndpoint, lmstudioEndpointValidation)} style={[styles.endpointTestButton, endpointTestState.lmstudio === "checking" && styles.endpointTestButtonDisabled]}><IconSymbol name={endpointTestState.lmstudio === "ready" ? "checkmark.circle.fill" : "bolt.fill"} size={15} color="#061019" /><Text style={styles.endpointTestButtonText}>{endpointTestState.lmstudio === "checking" ? "Prüfe …" : "Endpoint testen"}</Text></TouchableOpacity>
          </View>
          <ValidationMessage active={lmstudioEndpointTouched} validation={lmstudioEndpointValidation} />
          <EndpointTestFeedback state={endpointTestState.lmstudio} message={endpointTestMessage.lmstudio} />
        </View>
        <View style={styles.sectionSpacer}>
          <StudioSection label="Datenschutz" title="Chat-Inhalte auf diesem Gerät" />
          {Platform.OS === "web" ? <View style={styles.webWarning}><IconSymbol name="exclamationmark.triangle.fill" size={17} color="#F6BA5E" /><Text style={styles.webWarningText}>Die geschützte Chat-Ablage ist im Web-Build nicht verfügbar. Nutze für verschlüsselte lokale Gesprächsinhalte die native App.</Text></View> : <TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: settings.protectChatContent }} activeOpacity={0.75} onPress={() => void setProtectedChatContent(!settings.protectChatContent)} style={[styles.protectionRow, settings.protectChatContent && styles.protectionRowEnabled]}><View style={[styles.protectionIndicator, settings.protectChatContent && styles.protectionIndicatorEnabled]}><IconSymbol name={settings.protectChatContent ? "lock.fill" : "lock.open.fill"} size={16} color={settings.protectChatContent ? "#6FE2A9" : "#99A9BC"} /></View><View style={styles.providerText}><Text style={styles.providerLabel}>{settings.protectChatContent ? "Geschützte Chat-Ablage aktiv" : "Geschützte Chat-Ablage deaktiviert"}</Text><Text style={styles.providerDetail}>{settings.protectChatContent ? "Verlauf wird lokal über den geschützten Gerätespeicher verschlüsselt abgelegt. Bestehende Inhalte werden migriert." : "Aktiviere die geräteverschlüsselte Ablage für Gesprächsinhalte. Tokens und Dateiinhalte werden weiterhin nicht gespeichert."}</Text></View></TouchableOpacity>}
        </View>
        <View style={styles.sectionSpacer}>
          <StudioSection label="Backup" title="Provider-Konfiguration exportieren" />
          <Text style={styles.fieldHint}>Erstelle ein verschlüsseltes Backup der gespeicherten Cloud-Keys und lokalen Endpoint-URLs. Service- und GitHub-Tokens werden bewusst nicht exportiert. Das Passwort wird nur für diesen Export verwendet und nie gespeichert.</Text>
          <View style={styles.backupSummary}><Text style={styles.backupSummaryText}>{configuredProviderKeyCount} Cloud-Key{configuredProviderKeyCount === 1 ? "" : "s"} · {configuredEndpointCount} lokale Endpoint{configuredEndpointCount === 1 ? "" : "s"}</Text><Text style={styles.backupSummaryHint}>AES-256-CBC · PBKDF2-SHA256 · HMAC-Integrität</Text></View>
          <Text style={styles.fieldLabel}>BACKUP-PASSWORT</Text>
          <TextInput accessibilityHint="Mindestens 12 Zeichen. Das Passwort nicht gemeinsam mit der Backup-Datei weitergeben." accessibilityLabel="Passwort für Settings-Backup" autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setBackupPassphrase(value); setBackupState("idle"); setBackupMessage(""); }} placeholder="Mindestens 12 Zeichen" placeholderTextColor="#697A90" secureTextEntry style={styles.input} value={backupPassphrase} />
          <TouchableOpacity accessibilityLabel="Verschlüsseltes Settings-Backup erstellen und teilen" accessibilityRole="button" activeOpacity={0.75} disabled={backupState === "exporting" || !isValidSettingsBackupPassword(backupPassphrase)} onPress={confirmSettingsBackupExport} style={[styles.backupButton, (backupState === "exporting" || !isValidSettingsBackupPassword(backupPassphrase)) && styles.endpointTestButtonDisabled]}><IconSymbol name="lock.fill" size={15} color="#061019" /><Text style={styles.backupButtonText}>{backupState === "exporting" ? "Backup wird erstellt …" : "Verschlüsseltes Backup teilen"}</Text></TouchableOpacity>
          {backupState === "shared" || backupState === "error" ? <View style={[styles.backupFeedback, backupState === "shared" ? styles.backupFeedbackReady : styles.backupFeedbackError]}><IconSymbol name={backupState === "shared" ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"} size={15} color={backupState === "shared" ? "#45D996" : "#FF6B7A"} /><Text style={[styles.backupFeedbackText, backupState === "shared" ? styles.backupFeedbackTextReady : styles.backupFeedbackTextError]}>{backupMessage}</Text></View> : null}
        </View>
        {Platform.OS === "web" ? <View style={styles.webWarning}><IconSymbol name="exclamationmark.triangle.fill" size={17} color="#F6BA5E" /><Text style={styles.webWarningText}>Im Web-Build werden eingegebene Schlüssel nur in der Browser-Sitzung gehalten. Nutze für produktive Schlüssel die native App oder die serverseitige Provider-Konfiguration.</Text></View> : null}
        <View style={styles.saveArea}>
          <View style={[styles.readinessCard, canSave ? styles.readinessCardReady : styles.readinessCardPending]}>
            <IconSymbol name={canSave ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"} size={17} color={canSave ? "#45D996" : "#F6BA5E"} />
            <Text style={[styles.readinessText, canSave ? styles.readinessTextReady : styles.readinessTextPending]}>{canSave ? "Service-Adresse und Zugriffstoken sind bereit zum Speichern." : "Vervollständige die beiden Service-Felder, um die Konfiguration zu speichern."}</Text>
          </View>
          <PrimaryButton icon="checkmark.circle.fill" label={saveState === "saving" ? "Wird gespeichert …" : "Konfiguration speichern"} onPress={() => void persistSettings()} disabled={saveState === "saving" || !canSave} />
          {saveState === "saved" ? <Text style={styles.savedLabel}>Lokal gespeichert. Der Service kann jetzt über die definierte API angesprochen werden.</Text> : null}
        </View>
        <View style={styles.notice}>
          <IconSymbol name="checkmark.circle.fill" size={18} color="#45D996" />
          <Text style={styles.noticeText}>Lokale Entwürfe bleiben verfügbar, auch wenn kein Remote-Service verbunden ist.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
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
      <IconSymbol name={ready ? "checkmark.circle.fill" : checking ? "bolt.fill" : "exclamationmark.triangle.fill"} size={15} color={ready ? "#45D996" : checking ? "#52D8FF" : "#FF6B7A"} />
      <Text style={[styles.endpointFeedbackText, ready ? styles.endpointFeedbackTextReady : checking ? styles.endpointFeedbackTextChecking : styles.endpointFeedbackTextError]}>{checking ? `${scope === "cloud" ? "Cloud-Key" : "Verbindung zum lokalen Provider"} wird geprüft …` : message}</Text>
    </View>
  );
}

function ValidationMessage({ active, validation }: { active: boolean; validation: FieldValidation }) {
  if (!active) return null;
  const icon = validation.valid ? "checkmark.circle.fill" : validation.tone === "neutral" ? "exclamationmark.triangle.fill" : "exclamationmark.triangle.fill";
  const color = validation.valid ? (validation.tone === "stored" ? "#8B7CFF" : "#45D996") : validation.tone === "neutral" ? "#F6BA5E" : "#FF6B7A";
  return (
    <View style={styles.validationRow}>
      <IconSymbol name={icon} size={15} color={color} />
      <Text style={[styles.validationText, validation.valid ? styles.validationTextSuccess : validation.tone === "neutral" ? styles.validationTextNeutral : styles.validationTextError]}>{validation.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 20 },
  sectionSpacer: { marginTop: 26 },
  fieldLabel: { color: "#75859B", fontSize: 10, fontWeight: "900", letterSpacing: 1.05, marginBottom: 7, marginTop: 16 },
  fieldHint: { color: "#8796AA", fontSize: 12, lineHeight: 18, marginBottom: 9 },
  input: { backgroundColor: "#111925", borderColor: "#2B3B51", borderRadius: 13, borderWidth: 1, color: "#EDF4FC", fontSize: 14, minHeight: 48, paddingHorizontal: 13, paddingVertical: 11 },
  inputValid: { borderColor: "#45D996" },
  inputStored: { borderColor: "#8B7CFF" },
  inputInvalid: { borderColor: "#FF6B7A" },
  endpointFieldRow: { alignItems: "stretch", flexDirection: "row", gap: 8 },
  endpointInput: { flex: 1, minWidth: 0 },
  endpointTestButton: { alignItems: "center", backgroundColor: "#52D8FF", borderRadius: 12, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 48, paddingHorizontal: 10 },
  endpointTestButtonDisabled: { opacity: 0.58 },
  endpointTestButtonText: { color: "#061019", fontSize: 11, fontWeight: "900" },
  cloudTestButton: { alignItems: "center", alignSelf: "flex-start", borderColor: "#2B677E", borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 7, marginTop: 12, minHeight: 44, paddingHorizontal: 12 },
  cloudTestButtonText: { color: "#8EDDF0", fontSize: 12, fontWeight: "800" },
  endpointFeedback: { alignItems: "flex-start", borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 7, marginTop: 8, paddingHorizontal: 10, paddingVertical: 9 },
  endpointFeedbackReady: { backgroundColor: "rgba(69,217,150,0.10)", borderColor: "rgba(69,217,150,0.32)" },
  endpointFeedbackChecking: { backgroundColor: "rgba(82,216,255,0.09)", borderColor: "rgba(82,216,255,0.30)" },
  endpointFeedbackError: { backgroundColor: "rgba(255,107,122,0.10)", borderColor: "rgba(255,107,122,0.32)" },
  endpointFeedbackText: { flex: 1, fontSize: 12, lineHeight: 17 },
  endpointFeedbackTextReady: { color: "#70E4AA" },
  endpointFeedbackTextChecking: { color: "#86DFFF" },
  endpointFeedbackTextError: { color: "#FF9AA4" },
  validationRow: { alignItems: "flex-start", flexDirection: "row", gap: 7, marginTop: 8 },
  validationText: { flex: 1, fontSize: 12, lineHeight: 17 },
  validationTextSuccess: { color: "#70E4AA" },
  validationTextNeutral: { color: "#E5BD6D" },
  validationTextError: { color: "#FF8B96" },
  backupSummary: { backgroundColor: "#111925", borderColor: "#2B3B51", borderRadius: 13, borderWidth: 1, marginTop: 12, padding: 12 },
  backupSummaryText: { color: "#DCE8F4", fontSize: 12, fontWeight: "800" },
  backupSummaryHint: { color: "#8291A6", fontFamily: "monospace", fontSize: 10, marginTop: 5 },
  backupButton: { alignItems: "center", backgroundColor: "#B4A8FF", borderRadius: 12, flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 12, minHeight: 48, paddingHorizontal: 12 },
  backupButtonText: { color: "#0B0F18", fontSize: 12, fontWeight: "900" },
  backupFeedback: { alignItems: "flex-start", borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 7, marginTop: 8, paddingHorizontal: 10, paddingVertical: 9 },
  backupFeedbackReady: { backgroundColor: "rgba(69,217,150,0.10)", borderColor: "rgba(69,217,150,0.32)" },
  backupFeedbackError: { backgroundColor: "rgba(255,107,122,0.10)", borderColor: "rgba(255,107,122,0.32)" },
  backupFeedbackText: { flex: 1, fontSize: 12, lineHeight: 17 },
  backupFeedbackTextReady: { color: "#70E4AA" },
  backupFeedbackTextError: { color: "#FF9AA4" },
  clearAction: { alignSelf: "flex-start", marginTop: 10 },
  clearActionText: { color: "#FF8792", fontSize: 12, fontWeight: "800" },
  providerRow: { alignItems: "center", backgroundColor: "#121823", borderColor: "#243247", borderRadius: 15, borderWidth: 1, flexDirection: "row", gap: 11, marginBottom: 8, padding: 12 },
  providerRowSelected: { backgroundColor: "#152737", borderColor: "#3A849D" },
  radio: { alignItems: "center", borderColor: "#73839A", borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: "center", width: 20 },
  radioSelected: { borderColor: "#52D8FF" },
  radioDot: { backgroundColor: "#52D8FF", borderRadius: 5, height: 10, width: 10 },
  providerText: { flex: 1 },
  providerLabel: { color: "#EDF3FB", fontSize: 14, fontWeight: "800", marginBottom: 3 },
  providerDetail: { color: "#8291A6", fontSize: 12, lineHeight: 17 },
  providerKeyStatus: { color: "#8291A6", fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: 4 },
  providerKeyStatusConfigured: { color: "#70E4AA" },
  protectionRow: { alignItems: "center", backgroundColor: "#121823", borderColor: "#243247", borderRadius: 15, borderWidth: 1, flexDirection: "row", gap: 11, padding: 12 },
  protectionRowEnabled: { backgroundColor: "#12251F", borderColor: "#3B8E68" },
  protectionIndicator: { alignItems: "center", backgroundColor: "#202A38", borderRadius: 10, height: 34, justifyContent: "center", width: 34 },
  protectionIndicatorEnabled: { backgroundColor: "#173A2B" },
  webWarning: { alignItems: "flex-start", backgroundColor: "rgba(246,186,94,0.11)", borderColor: "rgba(246,186,94,0.35)", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 9, marginTop: 26, padding: 13 },
  webWarningText: { color: "#F0C982", flex: 1, fontSize: 12, lineHeight: 18 },
  saveArea: { marginTop: 26 },
  readinessCard: { alignItems: "flex-start", borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 8, marginBottom: 11, padding: 12 },
  readinessCardReady: { backgroundColor: "rgba(69,217,150,0.10)", borderColor: "rgba(69,217,150,0.36)" },
  readinessCardPending: { backgroundColor: "rgba(246,186,94,0.10)", borderColor: "rgba(246,186,94,0.32)" },
  readinessText: { flex: 1, fontSize: 12, lineHeight: 18 },
  readinessTextReady: { color: "#70E4AA" },
  readinessTextPending: { color: "#E5BD6D" },
  attachArea: { marginTop: 16 },
  fixtureButton: { alignItems: "center", backgroundColor: "#132534", borderColor: "#2B677E", borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 9, marginTop: 13, padding: 12 },
  fixtureTextArea: { flex: 1 },
  fixtureTitle: { color: "#D9F5FC", fontSize: 13, fontWeight: "800", marginBottom: 2 },
  fixtureDetail: { color: "#8FBCCA", fontSize: 11 },
  attachSuccess: { alignItems: "flex-start", backgroundColor: "rgba(69,217,150,0.10)", borderColor: "rgba(69,217,150,0.34)", borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 8, marginTop: 10, padding: 12 },
  attachSuccessText: { color: "#70E4AA", flex: 1, fontSize: 12, lineHeight: 18 },
  attachError: { alignItems: "flex-start", backgroundColor: "rgba(255,107,122,0.10)", borderColor: "rgba(255,107,122,0.32)", borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 8, marginTop: 10, padding: 12 },
  attachErrorText: { color: "#FF9AA4", flex: 1, fontSize: 12, lineHeight: 18 },
  savedLabel: { color: "#70E4AA", fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: "center" },
  notice: { alignItems: "flex-start", flexDirection: "row", gap: 9, marginTop: 20, paddingHorizontal: 5 },
  noticeText: { color: "#8B9AAE", flex: 1, fontSize: 12, lineHeight: 18 },
});
