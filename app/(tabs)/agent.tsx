import { PrimaryButton, StatusBadge, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useWorkspace } from "@/lib/workspace-context";
import { useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function AgentScreen() {
  const { askAgent, messages, selectedFile } = useWorkspace();
  const [prompt, setPrompt] = useState("");

  const submitPrompt = () => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return;
    askAgent(normalizedPrompt);
    setPrompt("");
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <FlatList
          contentContainerStyle={styles.content}
          data={messages}
          keyExtractor={(message) => message.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              <StudioHeader eyebrow="KI-Entwicklungsfluss" title="Agent" />
              <View style={styles.contextRow}>
                <View style={styles.contextChip}>
                  <IconSymbol name="doc.text.fill" size={14} color="#8B7CFF" />
                  <Text numberOfLines={1} style={styles.contextText}>
                    {selectedFile.name}
                  </Text>
                </View>
                <StatusBadge label="Entwurfsmodus" tone="accent" />
              </View>
              <StudioSection label="Konversation" title="Projektkontext" />
            </>
          }
          ListFooterComponent={
            <View style={styles.composerCard}>
              <Text style={styles.composerLabel}>NÄCHSTER AUFTRAG</Text>
              <TextInput
                accessibilityLabel="Entwicklungsauftrag für den Agenten"
                multiline
                onChangeText={setPrompt}
                placeholder="Beschreibe eine Änderung, einen Fehler oder ein Refactoring …"
                placeholderTextColor="#708095"
                returnKeyType="send"
                style={styles.composerInput}
                value={prompt}
              />
              <PrimaryButton icon="arrow.up.circle.fill" label="An Agent senden" onPress={submitPrompt} disabled={!prompt.trim()} />
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.role === "user";
            return (
              <View style={[styles.messageRow, isUser && styles.userMessageRow]}>
                {!isUser ? (
                  <View style={styles.agentAvatar}>
                    <IconSymbol name="sparkles" size={16} color="#B9B2FF" />
                  </View>
                ) : null}
                <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.agentBubble]}>
                  <Text style={[styles.messageRole, isUser && styles.userMessageRole]}>
                    {isUser ? "DU" : item.kind === "proposal" ? "VORSCHLAG" : "AGENT"}
                  </Text>
                  <Text style={styles.messageText}>{item.content}</Text>
                  {item.kind === "proposal" ? (
                    <TouchableOpacity activeOpacity={0.75} style={styles.reviewButton}>
                      <Text style={styles.reviewText}>Überprüfung nach Verbindung</Text>
                      <IconSymbol name="arrow.right" size={14} color="#8B7CFF" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 20 },
  contextRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 25,
  },
  contextChip: {
    alignItems: "center",
    backgroundColor: "#171C29",
    borderColor: "#2A3449",
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    maxWidth: 210,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  contextText: { color: "#C9D4E2", flexShrink: 1, fontSize: 12, fontWeight: "700" },
  messageRow: { alignItems: "flex-start", flexDirection: "row", gap: 9, marginBottom: 13 },
  userMessageRow: { justifyContent: "flex-end" },
  agentAvatar: {
    alignItems: "center",
    backgroundColor: "#25233E",
    borderRadius: 13,
    height: 27,
    justifyContent: "center",
    marginTop: 4,
    width: 27,
  },
  messageBubble: { borderRadius: 17, maxWidth: "84%", paddingHorizontal: 14, paddingVertical: 12 },
  agentBubble: { backgroundColor: "#151C29", borderTopLeftRadius: 5 },
  userBubble: { backgroundColor: "#20354A", borderTopRightRadius: 5 },
  messageRole: { color: "#B9B2FF", fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 5 },
  userMessageRole: { color: "#78DCF7" },
  messageText: { color: "#E5ECF5", fontSize: 14, lineHeight: 20 },
  reviewButton: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 12 },
  reviewText: { color: "#B9B2FF", fontSize: 12, fontWeight: "800" },
  composerCard: {
    backgroundColor: "#121823",
    borderColor: "#2B3850",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 16,
    padding: 15,
  },
  composerLabel: { color: "#75859B", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 9 },
  composerInput: {
    color: "#EEF4FC",
    fontSize: 14,
    lineHeight: 20,
    maxHeight: 120,
    minHeight: 88,
    padding: 0,
    textAlignVertical: "top",
  },
});
