import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";

import { avatarInitialsForRole, formatChatClock, senderLabelForRole } from "@/lib/chat-presentation-logic";
import { darken, withAlpha } from "@/lib/theme-color-utils";
import { useColors } from "@/hooks/use-colors";

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
 *
 * Sprint 133 — Farbschema-Fix: Das alte Amber/Schwarz-Terminal-Schema
 * (#FFB000/#FFD98A/#4D3A00) war ein Retro-Rest und clachte mit dem
 * Cyber-Neon-Design. Alle Farben kommen jetzt aus den Theme-Tokens
 * (useColors) und folgen damit aktiv dem eingestellten Design-Theme.
 */
export function MessageBubble({ message, showTimestamp }: { message: BubbleMessage; showTimestamp: boolean }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isUser = message.role === "user";
  const initials = avatarInitialsForRole(message.role);
  const label = senderLabelForRole(message.role);

  return (
    <Animated.View entering={FadeInDown.duration(260).springify().damping(18)} style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.avatar, isUser ? styles.avatarUser : styles.avatarAgent]}>
        <Text style={[styles.avatarText, isUser && styles.avatarTextUser]}>{initials}</Text>
      </View>
      {isUser ? (
        <LinearGradient
          colors={[darken(colors.tint, 0.55), darken(colors.tint, 0.72)]}
          end={{ x: 1, y: 0 }}
          start={{ x: 0, y: 1 }}
          style={[styles.bubble, styles.bubbleUser]}
        >
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

type Palette = ReturnType<typeof useColors>;

function createStyles(colors: Palette) {
  return StyleSheet.create({
    row: { flexDirection: "row", gap: 9, marginBottom: 12, maxWidth: "100%" },
    rowUser: { alignSelf: "flex-end", flexDirection: "row-reverse", maxWidth: "92%" },
    avatar: { alignItems: "center", borderRadius: 13, height: 26, justifyContent: "center", marginTop: 2, width: 26 },
    avatarAgent: { backgroundColor: withAlpha(colors.tint, 0.14), borderColor: withAlpha(colors.tint, 0.55), borderWidth: 1 },
    avatarUser: { backgroundColor: withAlpha(colors.foreground, 0.10), borderColor: withAlpha(colors.tint, 0.30), borderWidth: 1 },
    avatarText: { color: colors.tint, fontFamily: "monospace", fontSize: 9, fontWeight: "900" },
    avatarTextUser: { color: colors.foreground },
    bubble: { borderRadius: 6, flex: 1, flexShrink: 1, paddingBottom: 11, paddingHorizontal: 13, paddingTop: 9 },
    // Sprint 143 — CyberSarah-Akzent: User-Bubbles mit subtiler
    // Cyan-Flaeche + Akzent-Border, klar vom Agent-Oberflaechen-Style.
    bubbleUser: {
      backgroundColor: withAlpha(colors.tint, 0.10),
      borderColor: withAlpha(colors.tint, 0.30),
      borderWidth: 1,
      borderTopRightRadius: 2,
    },
    bubbleAgent: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderTopLeftRadius: 2 },
    agentAccent: { backgroundColor: colors.tint, borderRadius: 0, height: 10, left: -1, opacity: 0.9, position: "absolute", top: 12, width: 3 },
    bubbleHeader: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 4 },
    senderAgent: { color: colors.tint, flexShrink: 1, fontFamily: "monospace", fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
    senderUser: { color: colors.foreground, flexShrink: 1, fontFamily: "monospace", fontSize: 11, fontWeight: "800", letterSpacing: 0.4, opacity: 0.9 },
    time: { color: colors.muted, fontFamily: "monospace", fontSize: 10 },
    contentAgent: { color: colors.foreground, fontFamily: "monospace", fontSize: 13.5, lineHeight: 22 },
    contentUser: { color: colors.foreground, fontFamily: "monospace", fontSize: 13.5, lineHeight: 22 },
    contentThinking: { color: colors.muted, fontStyle: "italic" },
  });
}
