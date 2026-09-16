import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { darken, withAlpha } from "@/lib/theme-color-utils";
import { useColors } from "@/hooks/use-colors";

export type ComposerAttachment = { id: string; name: string };

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  isThinking: boolean;
  onToggleAttach: () => void;
  attachMenuOpen: boolean;
  attachments: ComposerAttachment[];
  onRemoveAttachment: (id: string) => void;
  onOpenGithub: () => void;
  onOpenSkills: () => void;
  githubConnected: boolean;
  skillCount: number;
  onAttach: (kind: "datei" | "foto" | "video") => void;
  attachBusy: boolean;
};

/**
 * Sprint 49 — Premium-Eingabebereich: runde Pill-Optik, klare Werkzeugleiste,
 * leuchtender Senden-Button.
 *
 * Sprint 133 — Farbschema-Fix: Das Amber/Schwarz-Eingabefeld
 * (#000/#4D3A00/#FFB000) war ein Retro-Rest und passte nicht zum
 * Cyber-Neon-Design. Farben kommen jetzt aus den Theme-Tokens und
 * folgen damit aktiv dem eingestellten Design-Theme.
 */
export function ChatComposer(props: ChatComposerProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.composer}>
      <View style={styles.toolbar}>
        <TouchableOpacity accessibilityLabel="Anhängen" disabled={props.attachBusy} onPress={props.onToggleAttach} style={[styles.toolButton, props.attachMenuOpen && styles.toolButtonActive]}>
          {props.attachBusy ? <ActivityIndicator color={colors.tint} size="small" /> : <Ionicons name="add" size={20} color={colors.tint} />}
        </TouchableOpacity>
        <TouchableOpacity accessibilityLabel="GitHub" onPress={props.onOpenGithub} style={[styles.toolButton, styles.toolWide]}>
          <Ionicons name="logo-github" size={15} color="#9FBDD4" />
          {props.githubConnected ? <View style={styles.connectedDot} /> : null}
        </TouchableOpacity>
        <TouchableOpacity accessibilityLabel="Skills" onPress={props.onOpenSkills} style={[styles.toolButton, styles.toolWide]}>
          <Ionicons name="sparkles" size={15} color="#B9B2FF" />
          {props.skillCount > 0 ? <Text style={styles.toolBadge}>{props.skillCount}</Text> : null}
        </TouchableOpacity>
      </View>

      {props.attachMenuOpen ? (
        <View style={styles.attachMenu}>
          {([["datei", "document", "Datei"], ["foto", "image", "Foto"], ["video", "videocam", "Video"]] as const).map(([kind, icon, label]) => (
            <TouchableOpacity key={kind} disabled={props.attachBusy} onPress={() => props.onAttach(kind)} style={styles.attachOption}>
              <Ionicons name={icon} size={15} color="#9FBDD4" />
              <Text style={styles.attachOptionText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {props.attachments.length > 0 ? (
        <View style={styles.attachList}>
          {props.attachments.map((attachment) => (
            <View key={attachment.id} style={styles.attachChip}>
              <Ionicons name="attach" size={12} color="#38E1FF" />
              <Text numberOfLines={1} style={styles.attachChipText}>{attachment.name}</Text>
              <TouchableOpacity accessibilityLabel={"Anhang entfernen: " + attachment.name} onPress={() => props.onRemoveAttachment(attachment.id)}>
                <Ionicons name="close" size={14} color="#FF8A96" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <TextInput
          autoCapitalize="sentences"
          multiline
          onChangeText={props.onChange}
          placeholder="> CyberSarah@ControlCenter: Befehl eingeben …"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={props.value}
        />
        {props.isThinking ? (
          <View style={styles.sendThinking}>
            <ActivityIndicator color="#04121A" size="small" />
          </View>
        ) : (
          <TouchableOpacity accessibilityLabel="Senden" disabled={!props.canSend} onPress={props.onSend} style={styles.sendWrapper}>
            <LinearGradient colors={[colors.tint, darken(colors.tint, 0.25)]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={[styles.sendButton, !props.canSend && styles.sendDisabled]}>
              <Ionicons name="arrow-up" size={19} color={props.canSend ? colors.background : withAlpha(colors.background, 0.45)} />
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

type Palette = ReturnType<typeof useColors>;

function createStyles(colors: Palette) {
  return StyleSheet.create({
  composer: { backgroundColor: withAlpha(colors.surface, 0.94), borderColor: colors.border, borderRadius: 22, borderWidth: 1, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10 },
  toolbar: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 9 },
  toolButton: { alignItems: "center", backgroundColor: withAlpha(colors.background, 0.7), borderColor: colors.border, borderRadius: 13, height: 34, justifyContent: "center", width: 34 },
  toolButtonActive: { borderColor: colors.tint },
  toolWide: { paddingHorizontal: 12, width: "auto", flexDirection: "row", gap: 6 },
  connectedDot: { backgroundColor: colors.success, borderRadius: 3, height: 6, width: 6 },
  toolBadge: { color: colors.tint, fontSize: 11, fontWeight: "800" },
  attachMenu: { backgroundColor: "#0A1420", borderColor: "#1C2C42", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 8, marginBottom: 9, padding: 8 },
  attachOption: { alignItems: "center", backgroundColor: "#0F1C2E", borderColor: "#24405C", borderRadius: 11, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", paddingVertical: 9 },
  attachOptionText: { color: "#9FBDD4", fontSize: 12, fontWeight: "700" },
  attachList: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 9 },
  attachChip: { alignItems: "center", backgroundColor: "#0F1C2E", borderColor: "#24405C", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 6, maxWidth: 170, paddingHorizontal: 9, paddingVertical: 5 },
  attachChipText: { color: "#9FBDD4", flexShrink: 1, fontSize: 11, fontWeight: "700" },
  inputRow: { alignItems: "flex-end", flexDirection: "row", gap: 9 },
  input: { backgroundColor: colors.background, borderColor: withAlpha(colors.tint, 0.35), borderRadius: 12, borderWidth: 1, color: colors.foreground, flex: 1, fontFamily: "monospace", fontSize: 14, lineHeight: 20, maxHeight: 120, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12 },
  sendWrapper: { borderRadius: 24, overflow: "hidden" },
  sendButton: { alignItems: "center", borderRadius: 24, height: 44, justifyContent: "center", width: 44 },
  sendDisabled: { opacity: 0.35 },
  sendThinking: { alignItems: "center", backgroundColor: withAlpha(colors.tint, 0.16), borderColor: withAlpha(colors.tint, 0.45), borderRadius: 24, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  });
}
