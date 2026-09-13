import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CYBERSARAH_REVENUE_REPOSITORY_NAME, CYBERSARAH_REVENUE_REPOSITORY_URL, CYBERSARAH_REVENUE_DEFAULT_BRANCH, normalizeBranch, normalizeRepositoryUrl } from "@/lib/repository-intent-logic";
import { PrimaryButton } from "@/components/studio/primitives";
import { lighten, withAlpha } from "@/lib/theme-color-utils";
import { useColors } from "@/hooks/use-colors";

export type RepositoryConnectResult = { workspaceId: string; branch: string; files: string[] };

type RepositoryConnectCardProps = {
  onConnect: (input: { repositoryUrl: string; branch: string }) => Promise<RepositoryConnectResult>;
  onClose: () => void;
};

export function RepositoryConnectCard({ onConnect, onClose }: RepositoryConnectCardProps) {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
  const [repositoryUrl, setRepositoryUrl] = useState(CYBERSARAH_REVENUE_REPOSITORY_URL);
  const [branch, setBranch] = useState(CYBERSARAH_REVENUE_DEFAULT_BRANCH);
  const [state, setState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [message, setMessage] = useState("");
  const validUrl = normalizeRepositoryUrl(repositoryUrl);
  const normalizedBranch = normalizeBranch(branch);

  const connect = async () => {
    if (!validUrl) {
      setState("error");
      setMessage("Bitte verwende eine gültige HTTPS-GitHub-Repository-URL ohne Zugangsdaten.");
      return;
    }
    setState("connecting");
    setMessage("");
    try {
      const result = await onConnect({ repositoryUrl: validUrl, branch: normalizedBranch });
      setState("connected");
      setMessage(`${result.files.length} Dateien auf Branch ${result.branch} verfügbar.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Die Repository-Verbindung konnte nicht hergestellt werden.");
    }
  };

  return (
    <View style={styles.card} accessibilityLabel="CyberSarah-revenue-os Repository verbinden">
      <View style={styles.headerRow}><View style={styles.icon}><Text style={styles.iconText}>⌘</Text></View><View style={styles.headerCopy}><Text style={styles.eyebrow}>PROJEKT IM CHAT</Text><Text style={styles.title}>{CYBERSARAH_REVENUE_REPOSITORY_NAME}</Text></View><TouchableOpacity accessibilityLabel="Repository-Karte schließen" accessibilityRole="button" onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>×</Text></TouchableOpacity></View>
      <Text style={styles.description}>Verbinde das Repository mit dem Workspace-Service. Die Verbindung wird erst nach deiner Bestätigung hergestellt; Commits und Pushes bleiben separat geschützt.</Text>
      <Text style={styles.label}>REPOSITORY-URL</Text>
      <TextInput accessibilityLabel="Repository-URL" autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={(value) => { setRepositoryUrl(value); setState("idle"); }} style={[styles.input, !validUrl && styles.inputError]} value={repositoryUrl} />
      <Text style={styles.label}>BRANCH</Text>
      <TextInput accessibilityLabel="Repository-Branch" autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setBranch(value); setState("idle"); }} style={styles.input} value={branch} />
      {state === "connected" ? <View style={styles.success}><Text style={styles.successTitle}>Repository verbunden</Text><Text style={styles.successText}>{message}</Text></View> : null}
      {state === "error" ? <Text style={styles.error}>{message}</Text> : null}
      <PrimaryButton icon="link" label={state === "connecting" ? "Workspace wird verbunden …" : state === "connected" ? "Fertig" : "Repository verbinden"} onPress={state === "connected" ? onClose : () => void connect()} disabled={state === "connecting" || !validUrl} />
      <Text style={styles.footer}>Nur HTTPS · keine Secrets in der URL · Branch bleibt sichtbar</Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
  card: { backgroundColor: withAlpha(colors.tint, 0.1), borderColor: withAlpha(colors.tint, 0.4), borderRadius: 20, borderWidth: 1, marginBottom: 16, padding: 15 },
  headerRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  icon: { alignItems: "center", backgroundColor: withAlpha(colors.tint, 0.16), borderRadius: 16, height: 38, justifyContent: "center", width: 38 },
  iconText: { color: lighten(colors.tint, 0.35), fontSize: 20, fontWeight: "900" },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.tint, fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 3 },
  title: { color: lighten(colors.tint, 0.45), fontSize: 15, fontWeight: "900" },
  closeButton: { alignItems: "center", minHeight: 40, minWidth: 40, justifyContent: "center" },
  closeText: { color: "#A6B1C2", fontSize: 24, lineHeight: 26 },
  description: { color: "#B0AEC2", fontSize: 11, lineHeight: 16, marginBottom: 14, marginTop: 12 },
  label: { color: "#8E9CAF", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: "#101521", borderColor: "#34435B", borderRadius: 11, borderWidth: 1, color: "#EDF4FC", fontSize: 12, minHeight: 44, paddingHorizontal: 11 },
  inputError: { borderColor: "#B96872" },
  success: { backgroundColor: "#132D2C", borderColor: withAlpha(colors.success, 0.4), borderRadius: 11, borderWidth: 1, marginBottom: 10, marginTop: 12, padding: 10 },
  successTitle: { color: lighten(colors.success, 0.2), fontSize: 11, fontWeight: "900" },
  successText: { color: lighten(colors.success, 0.3), fontSize: 10, marginTop: 3 },
  error: { color: colors.error, fontSize: 10, lineHeight: 15, marginVertical: 10 },
  footer: { color: "#76869C", fontSize: 9, lineHeight: 14, marginTop: 9, textAlign: "center" },
  });
}
