import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";

import { avatarInitialsForRole, formatChatClock, senderLabelForRole } from "@/lib/chat-presentation-logic";
import { darken, withAlpha } from "@/lib/theme-color-utils";
import { useColors } from "@/hooks/use-colors";
import { parseMarkdownLite, type InlineSpan } from "@/lib/markdown-lite";

export type BubbleMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  timestampMs?: number;
  isThinking?: boolean;
};

type Palette = ReturnType<typeof useColors>;
type BubbleStyles = ReturnType<typeof createStyles>;

/**
 * Sprint 138 — RenderMarkdownLite: zeigt LLM-Antworten als formatierte
 * Bloecke (Ueberschriften, Listen, Code, Tabellen) statt als Roh-Markdown.
 * Theme-bewusst (Sprint 133/143): alle Farben kommen aus den Theme-Tokens.
 */
function SpanText({ span, base, styles }: { span: InlineSpan; base: object; styles: BubbleStyles }) {
  return (
    <Text style={[base, span.bold && styles.bold, span.italic && styles.italic, span.mono && styles.mono]}>
      {span.text}
    </Text>
  );
}

export function MarkdownLiteContent({ content }: { content: string }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const blocks = useMemo(() => parseMarkdownLite(content), [content]);
  return (
    <View>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "header":
            return (
              <Text key={index} style={styles.headerText}>
                {block.spans.map((span, spanIndex) => (
                  <SpanText key={spanIndex} span={span} base={styles.headerBase} styles={styles} />
                ))}
              </Text>
            );
          case "bullet":
            return (
              <View key={index} style={styles.bulletRow}>
                <Text style={styles.bulletMarker}>•</Text>
                <Text style={styles.contentAgent}>
                  {block.spans.map((span, spanIndex) => (
                    <SpanText key={spanIndex} span={span} base={styles.contentAgentBase} styles={styles} />
                  ))}
                </Text>
              </View>
            );
          case "code":
            return (
              <View key={index} style={styles.codeBox}>
                <Text style={styles.codeText} selectable>
                  {block.code}
                </Text>
              </View>
            );
          case "tableRow":
            return (
              <Text key={index} style={[styles.tableText, block.header && styles.bold]}>
                {block.cells.join("   |   ")}
              </Text>
            );
          case "quote":
            return (
              <Text key={index} style={styles.quoteText}>
                {block.spans.map((span, spanIndex) => (
                  <SpanText key={spanIndex} span={span} base={styles.quoteBase} styles={styles} />
                ))}
              </Text>
            );
          default:
            return (
              <Text key={index} style={styles.contentAgent}>
                {block.spans.map((span, spanIndex) => (
                  <SpanText key={spanIndex} span={span} base={styles.contentAgentBase} styles={styles} />
                ))}
              </Text>
            );
        }
      })}
    </View>
  );
}

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
          <Text style={styles.contentUser}>{message.content}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, styles.bubbleAgent]}>
          <View style={styles.agentAccent} />
          <View style={styles.bubbleHeader}>
            <Text style={styles.senderAgent}>{label}</Text>
            {showTimestamp && message.timestampMs != null ? <Text style={styles.time}>{formatChatClock(message.timestampMs)}</Text> : null}
          </View>
          {message.isThinking ? <Text style={[styles.contentAgent, styles.contentThinking]}>{message.content}</Text> : <MarkdownLiteContent content={message.content} />}
        </View>
      )}
    </Animated.View>
  );
}

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
    // Sprint 138 — Markdown-Lite-Renderer-Stile (Theme-Token-basiert).
    contentAgentBase: { color: colors.foreground, fontFamily: "monospace", fontSize: 13.5 },
    bold: { fontWeight: "800" },
    italic: { fontStyle: "italic" },
    mono: { fontFamily: "monospace", fontSize: 12.5 },
    headerBase: { color: colors.foreground, fontFamily: "monospace", fontSize: 13.5 },
    headerText: { color: colors.tint, fontFamily: "monospace", fontSize: 14.5, fontWeight: "800", marginBottom: 6, marginTop: 4 },
    bulletRow: { flexDirection: "row", gap: 6, marginBottom: 3 },
    bulletMarker: { color: colors.tint, fontSize: 13.5, lineHeight: 22 },
    codeBox: { backgroundColor: withAlpha(colors.foreground, 0.06), borderColor: colors.border, borderRadius: 4, borderWidth: 1, marginVertical: 6, paddingHorizontal: 10, paddingVertical: 8 },
    codeText: { color: colors.foreground, fontFamily: "monospace", fontSize: 12, lineHeight: 18 },
    tableText: { color: colors.foreground, fontFamily: "monospace", fontSize: 12.5, lineHeight: 19 },
    quoteBase: { color: colors.muted, fontFamily: "monospace", fontSize: 13.5 },
    quoteText: { borderLeftColor: colors.tint, borderLeftWidth: 2, color: colors.muted, fontFamily: "monospace", fontSize: 13.5, fontStyle: "italic", lineHeight: 22, marginBottom: 4, paddingLeft: 8 },
  });
}
