import { EmptySurface, PrimaryButton, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { integrationFixture } from "@/constants/integration-fixture";
import { providerOptions, type ProviderId, useStudioSettings } from "@/lib/studio-settings";
import { getProviderKeyStatusLabel } from "@/lib/provider-key-logic";
import { type FieldValidation, validateServiceAccessToken, validateWorkspaceUrl } from "@/lib/settings-validation";
import { useWorkspace } from "@/lib/workspace-context";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function SettingsScreen() {
  const { attachRepository, clearGitHubToken, clearProviderKey, clearServiceAccessToken, loading, readAttachedFile, saveSettings, setProtectedChatContent, settings } = useStudioSettings();
  const { loadRemoteFiles } = useWorkspace();
  const [workspaceUrl, setWorkspaceUrl] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [provider, setProvider] = useState<ProviderId>("managed");
  const [serviceAccessToken, setServiceAccessToken] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [workspaceTouched, setWorkspaceTouched] = useState(false);
  const [serviceTokenTouched, setServiceTokenTouched] = useState(false);
  const [attachState, setAttachState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [attachMessage, setAttachMessage] = useState("");

  useEffect(() => {
    if (loading) return;
    setWorkspaceUrl(settings.workspaceUrl);
    setRepositoryUrl(settings.repositoryUrl);
    setBranch(settings.branch);
    setProvider(settings.provider);
  }, [loading, settings]);

  const workspaceValidation = validateWorkspaceUrl(workspaceUrl);
  const serviceTokenValidation = validateServiceAccessToken(serviceAccessToken, settings.hasServiceAccessToken);
  const canSave = workspaceValidation.valid && serviceTokenValidation.valid;
  const canAttach = canSave && Boolean(repositoryUrl.trim()) && Boolean(branch.trim());

  const persistSettings = async () => {
    setWorkspaceTouched(true);
    setServiceTokenTouched(true);
    if (!canSave) return;
    setSaveState("saving");
    await saveSettings({ workspaceUrl, repositoryUrl, branch, provider, serviceAccessToken, githubToken, providerApiKey });
    setServiceAccessToken("");
    setGithubToken("");
    setProviderApiKey("");
    setSaveState("saved");
  };

  const connectRepository = async () => {
    setWorkspaceTouched(true);
    setServiceTokenTouched(true);
    if (!canAttach) return;
    setAttachState("connecting");
    setAttachMessage("");
    try {
      const attached = await attachRepository({ workspaceUrl, repositoryUrl, branch, provider, serviceAccessToken, githubToken, providerApiKey });
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
              <TouchableOpacity key={option.id} activeOpacity={0.75} onPress={() => { setProvider(option.id); setProviderApiKey(""); setSaveState("idle"); }} style={[styles.providerRow, selected && styles.providerRowSelected]}>
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
              <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setProviderApiKey} placeholder={settings.providerKeyStatus[provider] ? "Gespeichert — neuen Key eingeben, um ihn zu ersetzen" : "API-Key eingeben"} placeholderTextColor="#697A90" secureTextEntry style={settings.providerKeyStatus[provider] ? [styles.input, styles.inputStored] : styles.input} value={providerApiKey} />
              {settings.providerKeyStatus[provider] ? <TouchableOpacity activeOpacity={0.7} onPress={() => void clearProviderKey()} style={styles.clearAction}><Text style={styles.clearActionText}>Provider-Key für {provider.toUpperCase()} entfernen</Text></TouchableOpacity> : null}
            </>
          ) : null}
        </View>
        <View style={styles.sectionSpacer}>
          <StudioSection label="Datenschutz" title="Chat-Inhalte auf diesem Gerät" />
          {Platform.OS === "web" ? <View style={styles.webWarning}><IconSymbol name="exclamationmark.triangle.fill" size={17} color="#F6BA5E" /><Text style={styles.webWarningText}>Die geschützte Chat-Ablage ist im Web-Build nicht verfügbar. Nutze für verschlüsselte lokale Gesprächsinhalte die native App.</Text></View> : <TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: settings.protectChatContent }} activeOpacity={0.75} onPress={() => void setProtectedChatContent(!settings.protectChatContent)} style={[styles.protectionRow, settings.protectChatContent && styles.protectionRowEnabled]}><View style={[styles.protectionIndicator, settings.protectChatContent && styles.protectionIndicatorEnabled]}><IconSymbol name={settings.protectChatContent ? "lock.fill" : "lock.open.fill"} size={16} color={settings.protectChatContent ? "#6FE2A9" : "#99A9BC"} /></View><View style={styles.providerText}><Text style={styles.providerLabel}>{settings.protectChatContent ? "Geschützte Chat-Ablage aktiv" : "Geschützte Chat-Ablage deaktiviert"}</Text><Text style={styles.providerDetail}>{settings.protectChatContent ? "Verlauf wird lokal über den geschützten Gerätespeicher verschlüsselt abgelegt. Bestehende Inhalte werden migriert." : "Aktiviere die geräteverschlüsselte Ablage für Gesprächsinhalte. Tokens und Dateiinhalte werden weiterhin nicht gespeichert."}</Text></View></TouchableOpacity>}
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
  validationRow: { alignItems: "flex-start", flexDirection: "row", gap: 7, marginTop: 8 },
  validationText: { flex: 1, fontSize: 12, lineHeight: 17 },
  validationTextSuccess: { color: "#70E4AA" },
  validationTextNeutral: { color: "#E5BD6D" },
  validationTextError: { color: "#FF8B96" },
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
