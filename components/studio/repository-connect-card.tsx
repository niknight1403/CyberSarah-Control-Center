import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CYBERSARAH_REVENUE_REPOSITORY_NAME, CYBERSARAH_REVENUE_REPOSITORY_URL, CYBERSARAH_REVENUE_DEFAULT_BRANCH, normalizeBranch, normalizeRepositoryUrl } from "@/lib/repository-intent-logic";
import { filterGithubRepositories, formatRelativeUpdatedAt, repositoryToConnectInput, type GithubRepositorySummary } from "@/lib/github-repository-picker-logic";
import { PrimaryButton } from "@/components/studio/primitives";
import { lighten, withAlpha } from "@/lib/theme-color-utils";
import { useColors } from "@/hooks/use-colors";

export type RepositoryConnectResult = { workspaceId: string; branch: string; files: string[] };

type RepositoryConnectCardProps = {
  onConnect: (input: { repositoryUrl: string; branch: string }) => Promise<RepositoryConnectResult>;
  onClose: () => void;
  /**
   * Sprint 132 — autonomer GitHub-Connector: mit dem hinterlegten Token
   * werden die eigenen Repos aufgelistet, sodass nur noch ausgewaehlt statt
   * URL + Branch von Hand eingetippt werden muss. Ohne Token (oder bei
   * Ladefehler) bleibt die manuelle Eingabe als Fallback bestehen.
   */
  onListRepositories?: () => Promise<GithubRepositorySummary[]>;
};

export function RepositoryConnectCard({ onConnect, onClose, onListRepositories }: RepositoryConnectCardProps) {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
  const [repositoryUrl, setRepositoryUrl] = useState(CYBERSARAH_REVENUE_REPOSITORY_URL);
  const [branch, setBranch] = useState(CYBERSARAH_REVENUE_DEFAULT_BRANCH);
  const [state, setState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [message, setMessage] = useState("");

  // Picker-Zustand: startet automatisch im "listing", solange onListRepositories
  // vorhanden ist — faellt bei Fehlschlag (kein Token, Netzwerkfehler) leise
  // auf die manuelle Eingabe zurueck.
  const [mode, setMode] = useState<"picker" | "manual">(onListRepositories ? "picker" : "manual");
  const [repoState, setRepoState] = useState<"loading" | "ready" | "error">("loading");
  const [repos, setRepos] = useState<GithubRepositorySummary[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const validUrl = normalizeRepositoryUrl(repositoryUrl);
  const filteredRepos = useMemo(() => filterGithubRepositories(repos, query), [repos, query]);

  const loadRepositories = useCallback(() => {
    if (!onListRepositories) return;
    setRepoState("loading");
    onListRepositories()
      .then((list) => {
        setRepos(list);
        setRepoState("ready");
      })
      .catch(() => {
        // Kein Token, Rate-Limit oder Netzwerkfehler — manuelle Eingabe bleibt nutzbar.
        setRepoState("error");
        setMode("manual");
      });
  }, [onListRepositories]);

  useEffect(() => {
    if (mode === "picker") loadRepositories();
  }, [mode, loadRepositories]);

  const connect = async (overrideUrl?: string, overrideBranch?: string) => {
    const targetUrl = normalizeRepositoryUrl(overrideUrl ?? repositoryUrl);
    const targetBranch = normalizeBranch(overrideBranch ?? branch);
    if (!targetUrl) {
      setState("error");
      setMessage("Bitte verwende eine gültige HTTPS-GitHub-Repository-URL ohne Zugangsdaten.");
      return;
    }
    setState("connecting");
    setMessage("");
    try {
      const result = await onConnect({ repositoryUrl: targetUrl, branch: targetBranch });
      setState("connected");
      setMessage(`${result.files.length} Dateien auf Branch ${result.branch} verfügbar.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Die Repository-Verbindung konnte nicht hergestellt werden.");
    }
  };

  const selectRepo = (repo: GithubRepositorySummary) => {
    const input = repositoryToConnectInput(repo);
    setSelectedId(repo.id);
    setRepositoryUrl(input.repositoryUrl);
    setBranch(input.branch);
    setState("idle");
    void connect(input.repositoryUrl, input.branch);
  };

  return (
    <View style={styles.card} accessibilityLabel="Repository verbinden">
      <View style={styles.headerRow}><View style={styles.icon}><Text style={styles.iconText}>⌘</Text></View><View style={styles.headerCopy}><Text style={styles.eyebrow}>PROJEKT IM CHAT</Text><Text style={styles.title}>{mode === "picker" ? "Workspace auswählen" : CYBERSARAH_REVENUE_REPOSITORY_NAME}</Text></View><TouchableOpacity accessibilityLabel="Repository-Karte schließen" accessibilityRole="button" onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>×</Text></TouchableOpacity></View>

      {mode === "picker" ? (
        <>
          <Text style={styles.description}>Dein GitHub-Token ist hinterlegt — wähle einfach das Repository, das du gerade weiterentwickeln willst.</Text>
          <TextInput
            accessibilityLabel="Repositories durchsuchen"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Repository suchen…"
            placeholderTextColor="#5C6B82"
            style={styles.input}
            value={query}
          />
          {repoState === "loading" ? (
            <View style={styles.loadingRow}><ActivityIndicator color={colors.tint} /><Text style={styles.loadingText}>Repositories werden geladen…</Text></View>
          ) : filteredRepos.length === 0 ? (
            <Text style={styles.emptyText}>Keine Repositories gefunden.</Text>
          ) : (
            <FlatList
              data={filteredRepos.slice(0, 25)}
              keyExtractor={(repo) => String(repo.id)}
              style={styles.repoList}
              scrollEnabled={filteredRepos.length > 4}
              renderItem={({ item }) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={state === "connecting"}
                  onPress={() => selectRepo(item)}
                  style={[styles.repoRow, selectedId === item.id && state === "connecting" && styles.repoRowActive]}
                >
                  <View style={styles.repoRowText}>
                    <Text style={styles.repoName} numberOfLines={1}>{item.fullName}{item.isPrivate ? " 🔒" : ""}</Text>
                    <Text style={styles.repoMeta} numberOfLines={1}>{item.defaultBranch} · {formatRelativeUpdatedAt(item.updatedAt)}</Text>
                  </View>
                  {selectedId === item.id && state === "connecting" ? <ActivityIndicator color={colors.tint} /> : <Text style={styles.repoArrow}>→</Text>}
                </TouchableOpacity>
              )}
            />
          )}
          <TouchableOpacity accessibilityRole="button" onPress={() => setMode("manual")} style={styles.manualLink}>
            <Text style={styles.manualLinkText}>Repository-URL manuell eingeben</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.description}>Verbinde das Repository mit dem Workspace-Service. Die Verbindung wird erst nach deiner Bestätigung hergestellt; Commits und Pushes bleiben separat geschützt.</Text>
          <Text style={styles.label}>REPOSITORY-URL</Text>
          <TextInput accessibilityLabel="Repository-URL" autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={(value) => { setRepositoryUrl(value); setState("idle"); }} style={[styles.input, !validUrl && styles.inputError]} value={repositoryUrl} />
          <Text style={styles.label}>BRANCH</Text>
          <TextInput accessibilityLabel="Repository-Branch" autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setBranch(value); setState("idle"); }} style={styles.input} value={branch} />
          {onListRepositories ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => { setMode("picker"); setState("idle"); }} style={styles.manualLink}>
              <Text style={styles.manualLinkText}>← Aus meinen Repositories wählen</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}

      {state === "connected" ? <View style={styles.success}><Text style={styles.successTitle}>Repository verbunden</Text><Text style={styles.successText}>{message}</Text></View> : null}
      {state === "error" ? <Text style={styles.error}>{message}</Text> : null}
      {mode === "manual" ? (
        <PrimaryButton icon="link" label={state === "connecting" ? "Workspace wird verbunden …" : state === "connected" ? "Fertig" : "Repository verbinden"} onPress={state === "connected" ? onClose : () => void connect()} disabled={state === "connecting" || !validUrl} />
      ) : state === "connected" ? (
        <PrimaryButton icon="link" label="Fertig" onPress={onClose} />
      ) : null}
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
  loadingRow: { alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 14 },
  loadingText: { color: "#8E9CAF", fontSize: 11 },
  emptyText: { color: "#8E9CAF", fontSize: 11, paddingVertical: 10, textAlign: "center" },
  repoList: { marginTop: 8, maxHeight: 260 },
  repoRow: { alignItems: "center", borderBottomColor: "#1E2733", borderBottomWidth: 1, flexDirection: "row", gap: 8, paddingVertical: 10 },
  repoRowActive: { opacity: 0.6 },
  repoRowText: { flex: 1 },
  repoName: { color: "#EDF4FC", fontSize: 12, fontWeight: "700" },
  repoMeta: { color: "#7C8AA0", fontSize: 10, marginTop: 2 },
  repoArrow: { color: colors.tint, fontSize: 14, fontWeight: "900" },
  manualLink: { alignSelf: "center", marginTop: 10, paddingVertical: 4 },
  manualLinkText: { color: colors.tint, fontSize: 11, fontWeight: "700" },
  success: { backgroundColor: "#132D2C", borderColor: withAlpha(colors.success, 0.4), borderRadius: 11, borderWidth: 1, marginBottom: 10, marginTop: 12, padding: 10 },
  successTitle: { color: lighten(colors.success, 0.2), fontSize: 11, fontWeight: "900" },
  successText: { color: lighten(colors.success, 0.3), fontSize: 10, marginTop: 3 },
  error: { color: colors.error, fontSize: 10, lineHeight: 15, marginVertical: 10 },
  footer: { color: "#76869C", fontSize: 9, lineHeight: 14, marginTop: 9, textAlign: "center" },
  });
}
