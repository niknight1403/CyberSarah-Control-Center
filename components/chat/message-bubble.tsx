import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";

import { avatarInitialsForRole, formatChatClock, senderLabelForRole } from "@/lib/chat-presentation-logic";

export type BubbleMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  timestampMs?: number;
  isThinking?: boolean;
};

/**
 * Sprint 49 — Hochwertige Nachrichten-Blase mit Avatar, Absender, Zeit
 * und sanfter Einblend-Animation.
 */
export function MessageBubble({ message, showTimestamp }: { message: BubbleMessage; showTimestamp: boolean }) {
  const isUser = message.role === "user";
  const initials = avatarInitialsForRole(message.role);
  const label = senderLabelForRole(message.role);

  return (
    <Animated.View entering={FadeInDown.duration(260).springify().damping(18)} style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.avatar, isUser ? styles.avatarUser : styles.avatarAgent]}>
        <Text style={[styles.avatarText, isUser && styles.avatarTextUser]}>{initials}</Text>
      </View>
      {isUser ? (
        <LinearGradient colors={["#4D3A00", "#241A00"]} end={{ x: 1, y: 0 }} start={{ x: 0, y: 1 }} style={[styles.bubble, styles.bubbleUser]}>
          <View style={styles.bubbleHeader}>
            <Text style={styles.senderUser}>{label}</Text>
            {showTimestamp && message.timestampMs != null ? <Text style={styles.time}>{formatChatClock(message.timestampMs)}</Text> : null}
          </View>
          <Text style={styles.contentUser}>{message.isThinking ? message.content : message.content}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, styles.bubbleAgent]}>
          <View style={styles.agentAccent} />
          <View style={styles.bubbleHeader}>
            <Text style={styles.senderAgent}>{label}</Text>
            {showTimestamp && message.timestampMs != null ? <Text style={styles.time}>{formatChatClock(message.timestampMs)}</Text> : null}
          </View>
          <Text style={[styles.contentAgent, message.isThinking && styles.contentThinking]}>{message.content}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 9, marginBottom: 12, maxWidth: "100%" },
  rowUser: { alignSelf: "flex-end", flexDirection: "row-reverse", maxWidth: "92%" },
  avatar: { alignItems: "center", borderRadius: 13, height: 26, justifyContent: "center", marginTop: 2, width: 26 },
  avatarAgent: { backgroundColor: "#000000", borderColor: "#FFB000", borderWidth: 1 },
  avatarUser: { backgroundColor: "#1A1400", borderColor: "#8A6D1F", borderWidth: 1 },
  avatarText: { color: "#FFB000", fontFamily: "monospace", fontSize: 9, fontWeight: "900" },
  avatarTextUser: { color: "#FFD98A" },
  bubble: { borderRadius: 6, flex: 1, flexShrink: 1, paddingBottom: 11, paddingHorizontal: 13, paddingTop: 9 },
  bubbleUser: { borderTopRightRadius: 2 },
  bubbleAgent: { backgroundColor: "#000000", borderColor: "#4D3A00", borderWidth: 1, borderTopLeftRadius: 2 },
  agentAccent: { backgroundColor: "#FFB000", borderRadius: 0, height: 10, left: -1, opacity: 0.85, position: "absolute", top: 12, width: 3 },
  bubbleHeader: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 4 },
  senderAgent: { color: "#FFB000", flexShrink: 1, fontFamily: "monospace", fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  senderUser: { color: "#FFD98A", flexShrink: 1, fontFamily: "monospace", fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  time: { color: "#8A6D1F", fontFamily: "monospace", fontSize: 10 },
  contentAgent: { color: "#FFD98A", fontFamily: "monospace", fontSize: 13.5, lineHeight: 22 },
  contentUser: { color: "#FFF3D6", fontFamily: "monospace", fontSize: 13.5, lineHeight: 22 },
  contentThinking: { color: "#8A6D1F", fontStyle: "italic" },
});
