import { EmptySurface, PrimaryButton, StatusBadge, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStudioSettings } from "@/lib/studio-settings";
import { useWorkspace } from "@/lib/workspace-context";
import { router } from "expo-router";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function PreviewScreen() {
  const { events, lastRefreshLabel, refreshPreview } = useWorkspace();
  const { settings } = useStudioSettings();
  const hasWorkspaceService = Boolean(settings.workspaceUrl);

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <FlatList
        contentContainerStyle={styles.content}
        data={events}
        keyExtractor={(event) => event.id}
        ListHeaderComponent={
          <>
            <StudioHeader eyebrow="Remote Runtime" title="Vorschau" actionIcon="arrow.clockwise" actionLabel="Vorschau aktualisieren" onAction={refreshPreview} />
            <View style={styles.statusCard}>
              <View>
                <Text style={styles.statusLabel}>AUSFÜHRUNGSUMGEBUNG</Text>
                <Text style={styles.statusTitle}>{hasWorkspaceService ? "Service-Adresse gespeichert" : "Workspace-Service nicht verbunden"}</Text>
              </View>
              <StatusBadge label={hasWorkspaceService ? "Bereit zur Prüfung" : "Offline"} tone={hasWorkspaceService ? "ready" : "warning"} />
            </View>
            <View style={styles.previewFrame}>
              <View style={styles.previewBrowserBar}>
                <View style={styles.browserDots}>
                  <View style={styles.browserDot} />
                  <View style={styles.browserDot} />
                  <View style={styles.browserDot} />
                </View>
                <Text numberOfLines={1} style={styles.previewUrl}>
                  {hasWorkspaceService ? `${settings.workspaceUrl}/preview` : "Keine Preview-URL"}
                </Text>
              </View>
              <EmptySurface
                description={hasWorkspaceService ? "Die Service-Adresse ist gespeichert. Starte dort einen Preview-Prozess, um Hot Reload und Logs zu laden." : "Konfiguriere die HTTPS-Adresse deines Workspace-Service. Danach werden Hot Reload, Logs und die Live-Vorschau hier angezeigt."}
                icon="play.rectangle.fill"
                title={hasWorkspaceService ? "Preview-Prozess noch nicht gestartet" : "Bereit für deine Live-App"}
              />
            </View>
            <View style={styles.actionBlock}>
              <PrimaryButton icon="link" label="Workspace verbinden" onPress={() => router.push("/settings" as never)} />
              <Text style={styles.refreshCaption}>{lastRefreshLabel}</Text>
            </View>
            <StudioSection label="Console" title="Letzte Runtime-Ereignisse" />
          </>
        }
        renderItem={({ item }) => {
          const icon = item.level === "success" ? "checkmark.circle.fill" : item.level === "warning" ? "exclamationmark.triangle.fill" : "terminal.fill";
          const color = item.level === "success" ? "#45D996" : item.level === "warning" ? "#F6BA5E" : "#52D8FF";
          return (
            <TouchableOpacity activeOpacity={0.78} style={styles.logRow}>
              <IconSymbol name={icon} size={18} color={color} />
              <View style={styles.logTextArea}>
                <Text style={styles.logLabel}>{item.label}</Text>
                <Text style={styles.logDetail}>{item.detail}</Text>
              </View>
              <IconSymbol name="chevron.right" size={17} color="#617187" />
            </TouchableOpacity>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 20 },
  statusCard: {
    alignItems: "center",
    backgroundColor: "#151C28",
    borderColor: "#29384A",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    padding: 15,
  },
  statusLabel: { color: "#75859B", fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 4 },
  statusTitle: { color: "#EAF0F8", fontSize: 14, fontWeight: "800" },
  previewFrame: { backgroundColor: "#0E131B", borderColor: "#2A3950", borderRadius: 19, borderWidth: 1, overflow: "hidden" },
  previewBrowserBar: {
    alignItems: "center",
    backgroundColor: "#161E2B",
    borderBottomColor: "#29384A",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  browserDots: { flexDirection: "row", gap: 4 },
  browserDot: { backgroundColor: "#536175", borderRadius: 3, height: 6, width: 6 },
  previewUrl: { color: "#8090A4", flex: 1, fontSize: 11 },
  actionBlock: { marginBottom: 26, marginTop: 14 },
  refreshCaption: { color: "#718094", fontSize: 11, marginTop: 9, textAlign: "center" },
  logRow: {
    alignItems: "center",
    backgroundColor: "#121823",
    borderColor: "#202F44",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    marginBottom: 9,
    minHeight: 44,
    padding: 13,
  },
  logTextArea: { flex: 1 },
  logLabel: { color: "#DCE5F0", fontSize: 13, fontWeight: "800", marginBottom: 3 },
  logDetail: { color: "#8493A7", fontSize: 12, lineHeight: 17 },
});
