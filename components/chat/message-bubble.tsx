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
        <LinearGradient colors={["#0E3E58", "#0B2A44"]} end={{ x: 1, y: 0 }} start={{ x: 0, y: 1 }} style={[styles.bubble, styles.bubbleUser]}>
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
  row: { flexDirection: "row", gap: 9, marginBottom: 12, maxWidth: "88%" },
  rowUser: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  avatar: { alignItems: "center", borderRadius: 13, height: 26, justifyContent: "center", marginTop: 2, width: 26 },
  avatarAgent: { backgroundColor: "#0A1524", borderColor: "#38E1FF", borderWidth: 1 },
  avatarUser: { backgroundColor: "#12233A", borderColor: "#2E6F8E", borderWidth: 1 },
  avatarText: { color: "#9FDFF2", fontSize: 9, fontWeight: "900" },
  avatarTextUser: { color: "#B8D4E4" },
  bubble: { borderRadius: 16, flexShrink: 1, paddingBottom: 11, paddingHorizontal: 13, paddingTop: 9 },
  bubbleUser: { borderTopRightRadius: 5 },
  bubbleAgent: { backgroundColor: "#0B1522", borderColor: "#1C2C42", borderWidth: 1, borderTopLeftRadius: 5 },
  agentAccent: { backgroundColor: "#38E1FF", borderRadius: 2, height: 10, left: -1, opacity: 0.55, position: "absolute", top: 12, width: 3 },
  bubbleHeader: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 4 },
  senderAgent: { color: "#38E1FF", flexShrink: 1, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  senderUser: { color: "#9FDFF2", flexShrink: 1, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  time: { color: "#5D7290", fontSize: 10 },
  contentAgent: { color: "#DCE9F8", fontSize: 13.5, lineHeight: 21 },
  contentUser: { color: "#EAF6FF", fontSize: 13.5, lineHeight: 21 },
  contentThinking: { color: "#6E82A0", fontStyle: "italic" },
});
