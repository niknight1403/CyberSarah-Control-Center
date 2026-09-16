import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";

import { cyber } from "@/lib/cyber-theme";
import { useStudioSettings } from "@/lib/studio-settings";
import { DrawerBodyText, DrawerCard, DrawerCardTitle, DrawerScreen } from "@/components/responsive/drawer-screen";

/**
 * Sprint 132 — "Plugins"-Tab (Drawer): Anschluss-Status aller Integratio-
 * nen — AI-Provider (lokal + Cloud), Workspace-Service, GitHub-Token.
 * Alles live aus den gespeicherten Studio-Einstellungen, keine Secrets im
 * Klartext (nur booleans). Verwaltung bleibt im Einstellungs-Screen.
 */
export default function PluginsScreen() {
  const styles = useMemo(() => createStyles(), []);
  const { settings } = useStudioSettings();

  const plugins = [
    {
      key: "workspace",
      title: "Workspace-Service",
      detail: settings.workspaceUrl ? `Verbunden · ${settings.workspaceUrl.replace(/^https?:\/\//, "")}` : "Keine Workspace-URL gesetzt",
      connected: Boolean(settings.workspaceUrl) && settings.hasServiceAccessToken,
      badge: settings.hasServiceAccessToken ? "TOKEN AKTIV" : "TOKEN FEHLT",
    },
    {
      key: "github",
      title: "GitHub Connector",
      detail: settings.hasGitHubToken ? "Token hinterlegt — Repos können direkt im Chat gewählt werden" : "Kein Token — Repository-URL muss manuell eingetippt werden",
      connected: settings.hasGitHubToken,
      badge: settings.hasGitHubToken ? "AKTIV" : "INAKTIV",
    },
    {
      key: "llm",
      title: `AI-Provider · ${settings.provider}`,
      detail: settings.provider === "ollama" || settings.provider === "lmstudio"
        ? `Lokal · ${settings.localProviderEndpoints[settings.provider]}`
        : settings.hasProviderKey
          ? "Cloud-Provider mit API-Key konfiguriert"
          : "Cloud-Provider ohne API-Key",
      connected: settings.provider === "ollama" || settings.provider === "lmstudio" ? true : settings.hasProviderKey,
      badge: settings.provider === "ollama" || settings.provider === "lmstudio" ? "LOKAL" : settings.hasProviderKey ? "CLOUD" : "KEY FEHLT",
    },
  ];

  return (
    <DrawerScreen kicker="INTEGRATIONEN" title="Plugins">
      <DrawerCard accent={`${cyber.blue}55`}>
        <DrawerCardTitle>Anschlüsse des Control Centers</DrawerCardTitle>
        <DrawerBodyText>Status aller Integrationen auf einen Blick. Tokens werden verschlüsselt gespeichert und nie im Klartext angezeigt.</DrawerBodyText>
      </DrawerCard>

      {plugins.map((plugin) => (
        <View key={plugin.key} style={[styles.pluginCard, { borderColor: plugin.connected ? `${cyber.green}55` : `${cyber.amber}55` }]}>
          <View style={styles.pluginHeader}>
            <Text style={styles.pluginTitle}>{plugin.title}</Text>
            <View style={[styles.badge, { backgroundColor: plugin.connected ? `${cyber.green}22` : `${cyber.amber}22`, borderColor: plugin.connected ? cyber.green : cyber.amber }]}>
              <Text style={[styles.badgeText, { color: plugin.connected ? cyber.green : cyber.amber }]}>{plugin.badge}</Text>
            </View>
          </View>
          <Text style={styles.pluginDetail} numberOfLines={2}>{plugin.detail}</Text>
        </View>
      ))}

      <Text style={styles.hint}>
        Verwaltung: <Link href="/settings" style={styles.hintLink}>Agenteneinstellungen</Link> · Neue Anschlüsse (MCP-Transporte) sind im Admin-Bereich konfiguriert.
      </Text>
    </DrawerScreen>
  );
}

function createStyles() {
  return StyleSheet.create({
    pluginCard: { backgroundColor: cyber.surface, borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 14 },
    pluginHeader: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
    pluginTitle: { color: cyber.text, flex: 1, fontSize: 13, fontWeight: "800" },
    badge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
    pluginDetail: { color: cyber.textMuted, fontSize: 11, lineHeight: 16, marginTop: 6 },
    hint: { color: cyber.textDim, fontSize: 10, lineHeight: 15, marginTop: 8 },
    hintLink: { color: cyber.cyan, fontWeight: "700" },
  });
}
