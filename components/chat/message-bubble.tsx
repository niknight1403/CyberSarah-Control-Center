import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";

import { avatarInitialsForRole, formatChatClock, senderLabelForRole } from "@/lib/chat-presentation-logic";
import { parseMarkdownLite, type InlineSpan } from "@/lib/markdown-lite";
import { accentAlpha, glassPalette, glassSurface } from "@/lib/design/future-glass";

export type BubbleMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  timestampMs?: number;
  isThinking?: boolean;
};

type BubbleStyles = ReturnType<typeof createStyles>;

/**
 * Sprint 138 — RenderMarkdownLite: zeigt LLM-Antworten als formatierte
 * Bloecke (Ueberschriften, Listen, Code, Tabellen) statt als Roh-Markdown.
 *
 * Sprint 168 — Future-Glass: Farben kommen jetzt aus dem zentralen
 * Glass-Token-System statt aus useColors (einheitlich mit dem Rest der
 * Neugestaltung, unabhaengig vom bisherigen Light/Dark-Theme-Umschalter).
 */
function SpanText({ span, base, styles }: { span: InlineSpan; base: object; styles: BubbleStyles }) {
  return (
    <Text style={[base, span.bold && styles.bold, span.italic && styles.italic, span.mono && styles.mono]}>
      {span.text}
    </Text>
  );
}

export function MarkdownLiteContent({ content }: { content: string }) {
  const styles = useMemo(() => createStyles(), []);
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
                <Text style={[styles.contentAgent, styles.bulletContent]}>
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
 * Sprint 168 — Glass-Chat-Bubble: Nachrichten als semi-transparente
 * Glasschichten statt flacher Farbflaechen (Referenz §16 "Message
 * Bubbles als Glass Layers"). User-Bubble: Cyan-Verlauf-Glow-Rand,
 * rechtsbuendig. Agent-Bubble: Purple-Akzentkante, CyberGlass-Flaeche.
 */
export function MessageBubble({
  message,
  showTimestamp,
  agentLabel,
  agentInitials,
}: {
  message: BubbleMessage;
  showTimestamp: boolean;
  /** Override fuer Label/Kuerzel der agent-Rolle (z. B. Superagent-Chat). */
  agentLabel?: string;
  agentInitials?: string;
}) {
  const styles = useMemo(() => createStyles(), []);
  const isUser = message.role === "user";
  const initials = avatarInitialsForRole(message.role, agentInitials);
  const label = senderLabelForRole(message.role, agentLabel);

  return (
    <Animated.View entering={FadeInDown.duration(260).springify().damping(18)} style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.avatar, isUser ? styles.avatarUser : styles.avatarAgent]}>
        <Text style={[styles.avatarText, isUser && styles.avatarTextUser]}>{initials}</Text>
      </View>
      {isUser ? (
        <LinearGradient
          colors={[accentAlpha("cyan", 0.16), accentAlpha("blue", 0.1)]}
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

function createStyles() {
  return StyleSheet.create({
    row: { flexDirection: "row", gap: 9, marginBottom: 12, maxWidth: "100%", minWidth: 0 },
    rowUser: { alignSelf: "flex-end", flexDirection: "row-reverse", maxWidth: "92%", minWidth: 0 },
    avatar: { alignItems: "center", borderRadius: 13, height: 26, justifyContent: "center", marginTop: 2, width: 26 },
    avatarAgent: { backgroundColor: accentAlpha("purple", 0.16), borderColor: accentAlpha("purple", 0.55), borderWidth: 1 },
    avatarUser: { backgroundColor: accentAlpha("cyan", 0.12), borderColor: accentAlpha("cyan", 0.4), borderWidth: 1 },
    avatarText: { color: glassPalette.purple, fontFamily: "monospace", fontSize: 9, fontWeight: "900" },
    avatarTextUser: { color: glassPalette.cyan },
    bubble: { borderRadius: 16, flex: 1, flexShrink: 1, minWidth: 0, paddingBottom: 11, paddingHorizontal: 13, paddingTop: 9, overflow: "hidden" },
    bubbleUser: {
      borderColor: accentAlpha("cyan", 0.35),
      borderWidth: 1,
      borderTopRightRadius: 4,
      shadowColor: glassPalette.cyan,
      shadowOpacity: 0.18,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
    },
    bubbleAgent: {
      backgroundColor: glassSurface.card,
      borderColor: glassSurface.border,
      borderWidth: 1,
      borderTopLeftRadius: 4,
      shadowColor: glassPalette.purple,
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
    },
    agentAccent: { backgroundColor: glassPalette.purple, borderRadius: 2, height: 10, left: -1, opacity: 0.9, position: "absolute", top: 12, width: 3 },
    bubbleHeader: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 4 },
    senderAgent: { color: glassPalette.purple, flexShrink: 1, fontFamily: "monospace", fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
    senderUser: { color: glassPalette.cyan, flexShrink: 1, fontFamily: "monospace", fontSize: 11, fontWeight: "800", letterSpacing: 0.4, opacity: 0.9 },
    time: { color: glassSurface.textMuted, fontFamily: "monospace", fontSize: 10 },
    contentAgent: { color: glassSurface.textPrimary, fontFamily: "monospace", fontSize: 13.5, lineHeight: 22, ...( { wordBreak: "break-word" } as object ) },
    contentUser: { color: glassSurface.textPrimary, fontFamily: "monospace", fontSize: 13.5, lineHeight: 22, ...( { wordBreak: "break-word" } as object ) },
    contentThinking: { color: glassSurface.textMuted, fontStyle: "italic" },
    contentAgentBase: { color: glassSurface.textPrimary, fontFamily: "monospace", fontSize: 13.5 },
    bold: { fontWeight: "800" },
    italic: { fontStyle: "italic" },
    mono: { fontFamily: "monospace", fontSize: 12.5 },
    headerBase: { color: glassSurface.textPrimary, fontFamily: "monospace", fontSize: 13.5 },
    headerText: { color: glassPalette.cyan, fontFamily: "monospace", fontSize: 14.5, fontWeight: "800", marginBottom: 6, marginTop: 4 },
    bulletRow: { flexDirection: "row", gap: 6, marginBottom: 3 },
    bulletContent: { flex: 1, flexShrink: 1, minWidth: 0 },
    bulletMarker: { color: glassPalette.cyan, fontSize: 13.5, lineHeight: 22 },
    codeBox: { backgroundColor: accentAlpha("purple", 0.08), borderColor: glassSurface.border, borderRadius: 8, borderWidth: 1, marginVertical: 6, minWidth: 0, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 8 },
    codeText: { color: glassSurface.textPrimary, flexShrink: 1, fontFamily: "monospace", fontSize: 12, lineHeight: 18, ...( { wordBreak: "break-word" } as object ) },
    tableText: { color: glassSurface.textPrimary, fontFamily: "monospace", fontSize: 12.5, lineHeight: 19 },
    quoteBase: { color: glassSurface.textSecondary, fontFamily: "monospace", fontSize: 13.5 },
    quoteText: { borderLeftColor: glassPalette.cyan, borderLeftWidth: 2, color: glassSurface.textSecondary, fontFamily: "monospace", fontSize: 13.5, fontStyle: "italic", lineHeight: 22, marginBottom: 4, paddingLeft: 8 },
  });
}
