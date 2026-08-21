import { PrimaryButton, StatusBadge, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStudioSettings } from "@/lib/studio-settings";
import { getRepositoryLabel } from "@/lib/studio-settings-logic";
import { useWorkspace } from "@/lib/workspace-context";
import { router } from "expo-router";
import { FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function WorkspaceScreen() {
  const { changedFileCount, files, saveDraft, selectFile, selectedFile, selectedFileId, updateFile } = useWorkspace();
  const { settings } = useStudioSettings();
  const hasWorkspaceService = Boolean(settings.workspaceUrl);
  const repositoryLabel = getRepositoryLabel(settings.repositoryUrl);

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <FlatList
        contentContainerStyle={styles.content}
        data={files}
        keyExtractor={(file) => file.id}
        ListHeaderComponent={
          <>
            <StudioHeader eyebrow="Custom AI Studio" title="Workspace" actionIcon="gearshape.fill" actionLabel="Workspace-Einstellungen" onAction={() => router.push("/settings" as never)} />
            <View style={styles.projectCard}>
              <View style={styles.projectTopLine}>
                <View style={styles.projectIdentity}>
                  <View style={styles.projectIcon}>
                    <IconSymbol name="folder.fill" size={20} color="#52D8FF" />
                  </View>
                  <View>
                    <Text style={styles.projectName}>{repositoryLabel}</Text>
                    <Text style={styles.projectPath}>{hasWorkspaceService ? settings.workspaceUrl : "Lokaler Arbeitsbereich"}</Text>
                  </View>
                </View>
                <StatusBadge label="main" tone="accent" />
              </View>
              <View style={styles.projectFooter}>
                <Text style={styles.projectState}>{changedFileCount ? `${changedFileCount} Datei(en) geändert` : "Keine offenen Änderungen"}</Text>
                <StatusBadge label={hasWorkspaceService ? "Service konfiguriert" : "Remote ausstehend"} tone={hasWorkspaceService ? "ready" : "warning"} />
              </View>
            </View>
            <StudioSection label="Explorer" title="Projektdateien" />
          </>
        }
        ListFooterComponent={
          <>
            <View style={styles.editorHeader}>
              <View style={styles.editorFileIdentity}>
                <IconSymbol name="doc.text.fill" size={17} color="#8B7CFF" />
                <View>
                  <Text style={styles.editorFileName}>{selectedFile.name}</Text>
                  <Text style={styles.editorPath}>{selectedFile.path}</Text>
                </View>
              </View>
              {selectedFile.changed ? <StatusBadge label="Geändert" tone="warning" /> : <StatusBadge label="Gespeichert" tone="ready" />}
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
              <PrimaryButton icon="square.and.pencil" label="Entwurf speichern" onPress={saveDraft} disabled={!selectedFile.changed} />
            </View>
            <StudioSection label="Console" title="Aktiver Kontext" />
            <View style={styles.consoleCard}>
              <View style={styles.consolePrompt}>
                <IconSymbol name="terminal.fill" size={16} color="#45D996" />
                <Text style={styles.consolePromptText}>workspace:main</Text>
              </View>
              <Text style={styles.consoleText}>Sichere Remote-Verbindung noch nicht konfiguriert.</Text>
              <TouchableOpacity activeOpacity={0.75} onPress={() => router.push("/settings" as never)} style={styles.consoleLink}>
                <Text style={styles.consoleLinkText}>Verbindung einrichten</Text>
                <IconSymbol name="arrow.right" size={14} color="#52D8FF" />
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
              onPress={() => selectFile(item.id)}
              style={[styles.fileRow, isSelected && styles.fileRowSelected]}
            >
              <View style={[styles.fileIcon, isSelected && styles.fileIconSelected]}>
                <IconSymbol name="doc.text.fill" size={16} color={isSelected ? "#52D8FF" : "#8B9AAE"} />
              </View>
              <View style={styles.fileTextArea}>
                <Text style={[styles.fileName, isSelected && styles.fileNameSelected]}>{item.name}</Text>
                <Text numberOfLines={1} style={styles.filePath}>{item.path}</Text>
              </View>
              {item.changed ? <View style={styles.changedDot} /> : null}
              <IconSymbol name="chevron.right" size={17} color={isSelected ? "#52D8FF" : "#647388"} />
            </TouchableOpacity>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const codeFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const styles = StyleSheet.create({
  content: { paddingBottom: 20 },
  projectCard: { backgroundColor: "#121A26", borderColor: "#2A3B52", borderRadius: 18, borderWidth: 1, marginBottom: 26, padding: 15 },
  projectTopLine: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  projectIdentity: { alignItems: "center", flexDirection: "row", gap: 10, flex: 1, marginRight: 8 },
  projectIcon: { alignItems: "center", backgroundColor: "#153444", borderRadius: 12, height: 42, justifyContent: "center", width: 42 },
  projectName: { color: "#F1F5FA", fontSize: 15, fontWeight: "800", marginBottom: 2 },
  projectPath: { color: "#8493A7", fontSize: 12 },
  projectFooter: { alignItems: "center", borderTopColor: "#26364B", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingTop: 12 },
  projectState: { color: "#9BABBE", fontSize: 12 },
  fileRow: { alignItems: "center", borderRadius: 14, flexDirection: "row", gap: 10, marginBottom: 5, padding: 10 },
  fileRowSelected: { backgroundColor: "#172A39" },
  fileIcon: { alignItems: "center", backgroundColor: "#1A2433", borderRadius: 9, height: 33, justifyContent: "center", width: 33 },
  fileIconSelected: { backgroundColor: "#173B4B" },
  fileTextArea: { flex: 1 },
  fileName: { color: "#CCD7E4", fontSize: 13, fontWeight: "700", marginBottom: 2 },
  fileNameSelected: { color: "#F5FAFF" },
  filePath: { color: "#758499", fontSize: 11 },
  changedDot: { backgroundColor: "#F6BA5E", borderRadius: 4, height: 7, width: 7 },
  editorHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 11, marginTop: 21 },
  editorFileIdentity: { alignItems: "center", flexDirection: "row", flex: 1, gap: 9, marginRight: 8 },
  editorFileName: { color: "#EAF1F9", fontSize: 13, fontWeight: "800", marginBottom: 2 },
  editorPath: { color: "#758499", fontSize: 10 },
  editorShell: { backgroundColor: "#0C1118", borderColor: "#27364A", borderRadius: 16, borderWidth: 1, flexDirection: "row", minHeight: 178, overflow: "hidden" },
  lineRail: { backgroundColor: "#101923", paddingHorizontal: 11, paddingTop: 13 },
  lineNumber: { color: "#526275", fontFamily: codeFont, fontSize: 11, lineHeight: 19, textAlign: "right" },
  codeInput: { color: "#DDE8F4", flex: 1, fontFamily: codeFont, fontSize: 12, lineHeight: 19, minHeight: 176, padding: 13 },
  editorAction: { marginBottom: 29, marginTop: 12 },
  consoleCard: { backgroundColor: "#0F161F", borderColor: "#243347", borderRadius: 16, borderWidth: 1, padding: 14 },
  consolePrompt: { alignItems: "center", flexDirection: "row", gap: 7, marginBottom: 9 },
  consolePromptText: { color: "#6BE5A7", fontFamily: codeFont, fontSize: 11, fontWeight: "700" },
  consoleText: { color: "#A2B0C1", fontFamily: codeFont, fontSize: 12, lineHeight: 18 },
  consoleLink: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: 12 },
  consoleLinkText: { color: "#52D8FF", fontSize: 12, fontWeight: "800" },
});
