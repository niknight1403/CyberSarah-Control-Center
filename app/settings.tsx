import { EmptySurface, PrimaryButton, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { providerOptions, type ProviderId, useStudioSettings } from "@/lib/studio-settings";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function SettingsScreen() {
  const { clearGitHubToken, clearProviderKey, clearServiceAccessToken, loading, saveSettings, settings } = useStudioSettings();
  const [workspaceUrl, setWorkspaceUrl] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [provider, setProvider] = useState<ProviderId>("managed");
  const [serviceAccessToken, setServiceAccessToken] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (loading) return;
    setWorkspaceUrl(settings.workspaceUrl);
    setRepositoryUrl(settings.repositoryUrl);
    setBranch(settings.branch);
    setProvider(settings.provider);
  }, [loading, settings]);

  const persistSettings = async () => {
    setSaveState("saving");
    await saveSettings({ workspaceUrl, repositoryUrl, branch, provider, serviceAccessToken, githubToken, providerApiKey });
    setServiceAccessToken("");
    setGithubToken("");
    setProviderApiKey("");
    setSaveState("saved");
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
          <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={setWorkspaceUrl} placeholder="https://studio.example.com" placeholderTextColor="#697A90" style={styles.input} value={workspaceUrl} />
          <Text style={styles.fieldHint}>Der Service stellt Git-Operationen, Dateizugriff, Prozess-Runner und die Vorschau bereit.</Text>
          <Text style={styles.fieldLabel}>SERVICE-ZUGRIFFSTOKEN</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setServiceAccessToken} placeholder={settings.hasServiceAccessToken ? "Gespeichert — neuen Token eingeben, um ihn zu ersetzen" : "Bearer-Token aus der Service-Konfiguration"} placeholderTextColor="#697A90" secureTextEntry style={styles.input} value={serviceAccessToken} />
          {settings.hasServiceAccessToken ? <TouchableOpacity activeOpacity={0.7} onPress={() => void clearServiceAccessToken()} style={styles.clearAction}><Text style={styles.clearActionText}>Service-Zugriffstoken entfernen</Text></TouchableOpacity> : null}
          <Text style={styles.fieldLabel}>REPOSITORY-URL</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={setRepositoryUrl} placeholder="https://github.com/owner/repository.git" placeholderTextColor="#697A90" style={styles.input} value={repositoryUrl} />
          <Text style={styles.fieldLabel}>BRANCH</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setBranch} placeholder="main" placeholderTextColor="#697A90" style={styles.input} value={branch} />
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
              <TouchableOpacity key={option.id} activeOpacity={0.75} onPress={() => setProvider(option.id)} style={[styles.providerRow, selected && styles.providerRowSelected]}>
                <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                <View style={styles.providerText}>
                  <Text style={styles.providerLabel}>{option.label}</Text>
                  <Text style={styles.providerDetail}>{option.detail}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {provider !== "managed" ? (
            <>
              <Text style={styles.fieldLabel}>API-KEY FÜR {provider.toUpperCase()}</Text>
              <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setProviderApiKey} placeholder={settings.hasProviderKey ? "Gespeichert — neuen Key eingeben, um ihn zu ersetzen" : "API-Key eingeben"} placeholderTextColor="#697A90" secureTextEntry style={styles.input} value={providerApiKey} />
              {settings.hasProviderKey ? <TouchableOpacity activeOpacity={0.7} onPress={() => void clearProviderKey()} style={styles.clearAction}><Text style={styles.clearActionText}>Provider-Key entfernen</Text></TouchableOpacity> : null}
            </>
          ) : null}
        </View>
        {Platform.OS === "web" ? <View style={styles.webWarning}><IconSymbol name="exclamationmark.triangle.fill" size={17} color="#F6BA5E" /><Text style={styles.webWarningText}>Im Web-Build werden eingegebene Schlüssel nur in der Browser-Sitzung gehalten. Nutze für produktive Schlüssel die native App oder die serverseitige Provider-Konfiguration.</Text></View> : null}
        <View style={styles.saveArea}>
          <PrimaryButton icon="checkmark.circle.fill" label={saveState === "saving" ? "Wird gespeichert …" : "Konfiguration speichern"} onPress={() => void persistSettings()} disabled={saveState === "saving"} />
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

const styles = StyleSheet.create({
  content: { paddingBottom: 20 },
  sectionSpacer: { marginTop: 26 },
  fieldLabel: { color: "#75859B", fontSize: 10, fontWeight: "900", letterSpacing: 1.05, marginBottom: 7, marginTop: 16 },
  fieldHint: { color: "#8796AA", fontSize: 12, lineHeight: 18, marginBottom: 9 },
  input: { backgroundColor: "#111925", borderColor: "#2B3B51", borderRadius: 13, borderWidth: 1, color: "#EDF4FC", fontSize: 14, minHeight: 48, paddingHorizontal: 13, paddingVertical: 11 },
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
  webWarning: { alignItems: "flex-start", backgroundColor: "rgba(246,186,94,0.11)", borderColor: "rgba(246,186,94,0.35)", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 9, marginTop: 26, padding: 13 },
  webWarningText: { color: "#F0C982", flex: 1, fontSize: 12, lineHeight: 18 },
  saveArea: { marginTop: 26 },
  savedLabel: { color: "#70E4AA", fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: "center" },
  notice: { alignItems: "flex-start", flexDirection: "row", gap: 9, marginTop: 20, paddingHorizontal: 5 },
  noticeText: { color: "#8B9AAE", flex: 1, fontSize: 12, lineHeight: 18 },
});
