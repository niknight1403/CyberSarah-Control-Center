import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { darken, withAlpha } from "@/lib/theme-color-utils";
import { glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";

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
 * (glassDepth.void/glassDepth.void/glassPalette.amber) war ein Retro-Rest und passte nicht zum
 * Cyber-Neon-Design. Farben kommen jetzt aus den Theme-Tokens und
 * folgen damit aktiv dem eingestellten Design-Theme.
 */
export function ChatComposer(props: ChatComposerProps) {
  return (
    <View style={styles.composer}>
      <View style={styles.toolbar}>
        <TouchableOpacity accessibilityLabel="Anhängen" disabled={props.attachBusy} onPress={props.onToggleAttach} style={[styles.toolButton, props.attachMenuOpen && styles.toolButtonActive]}>
          {props.attachBusy ? <ActivityIndicator color={glassPalette.cyan} size="small" /> : <Ionicons name="add" size={20} color={glassPalette.cyan} />}
        </TouchableOpacity>
        <TouchableOpacity accessibilityLabel="GitHub" onPress={props.onOpenGithub} style={[styles.toolButton, styles.toolWide]}>
          <Ionicons name="logo-github" size={15} color={glassSurface.textSecondary} />
          {props.githubConnected ? <View style={styles.connectedDot} /> : null}
        </TouchableOpacity>
        <TouchableOpacity accessibilityLabel="Skills" onPress={props.onOpenSkills} style={[styles.toolButton, styles.toolWide]}>
          <Ionicons name="sparkles" size={15} color={glassPalette.purple} />
          {props.skillCount > 0 ? <Text style={styles.toolBadge}>{props.skillCount}</Text> : null}
        </TouchableOpacity>
      </View>

      {props.attachMenuOpen ? (
        <View style={styles.attachMenu}>
          {([["datei", "document", "Datei"], ["foto", "image", "Foto"], ["video", "videocam", "Video"]] as const).map(([kind, icon, label]) => (
            <TouchableOpacity key={kind} disabled={props.attachBusy} onPress={() => props.onAttach(kind)} style={styles.attachOption}>
              <Ionicons name={icon} size={15} color={glassSurface.textSecondary} />
              <Text style={styles.attachOptionText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {props.attachments.length > 0 ? (
        <View style={styles.attachList}>
          {props.attachments.map((attachment) => (
            <View key={attachment.id} style={styles.attachChip}>
              <Ionicons name="attach" size={12} color={glassPalette.cyan} />
              <Text numberOfLines={1} style={styles.attachChipText}>{attachment.name}</Text>
              <TouchableOpacity accessibilityLabel={"Anhang entfernen: " + attachment.name} onPress={() => props.onRemoveAttachment(attachment.id)}>
                <Ionicons name="close" size={14} color={glassPalette.red} />
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
          placeholderTextColor={glassSurface.textSecondary}
          style={styles.input}
          value={props.value}
        />
        {props.isThinking ? (
          <View style={styles.sendThinking}>
            <ActivityIndicator color={glassDepth.deep} size="small" />
          </View>
        ) : (
          <TouchableOpacity accessibilityLabel="Senden" disabled={!props.canSend} onPress={props.onSend} style={styles.sendWrapper}>
            <LinearGradient colors={[glassPalette.cyan, darken(glassPalette.cyan, 0.25)]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={[styles.sendButton, !props.canSend && styles.sendDisabled]}>
              <Ionicons name="arrow-up" size={19} color={props.canSend ? glassDepth.void : withAlpha(glassDepth.void, 0.45)} />
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}


function createStyles() {
  return StyleSheet.create({
  composer: { backgroundColor: withAlpha(glassDepth.glass, 0.94), borderColor: glassSurface.border, borderRadius: 22, borderWidth: 1, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10 },
  toolbar: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 9 },
  toolButton: { alignItems: "center", backgroundColor: withAlpha(glassDepth.void, 0.7), borderColor: glassSurface.border, borderRadius: 13, height: 34, justifyContent: "center", width: 34 },
  toolButtonActive: { borderColor: glassPalette.cyan },
  toolWide: { paddingHorizontal: 12, width: "auto", flexDirection: "row", gap: 6 },
  connectedDot: { backgroundColor: glassPalette.green, borderRadius: 3, height: 6, width: 6 },
  toolBadge: { color: glassPalette.cyan, fontSize: 11, fontWeight: "800" },
  attachMenu: { backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 8, marginBottom: 9, padding: 8 },
  attachOption: { alignItems: "center", backgroundColor: glassDepth.layer, borderColor: glassSurface.borderStrong, borderRadius: 11, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", paddingVertical: 9 },
  attachOptionText: { color: glassSurface.textSecondary, fontSize: 12, fontWeight: "700" },
  attachList: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 9 },
  attachChip: { alignItems: "center", backgroundColor: glassDepth.layer, borderColor: glassSurface.borderStrong, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 6, maxWidth: 170, paddingHorizontal: 9, paddingVertical: 5 },
  attachChipText: { color: glassSurface.textSecondary, flexShrink: 1, fontSize: 11, fontWeight: "700" },
  inputRow: { alignItems: "flex-end", flexDirection: "row", gap: 9 },
  input: { backgroundColor: glassDepth.void, borderColor: withAlpha(glassPalette.cyan, 0.35), borderRadius: 12, borderWidth: 1, color: glassSurface.textPrimary, flex: 1, fontFamily: "monospace", fontSize: 14, lineHeight: 20, maxHeight: 120, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12 },
  sendWrapper: { borderRadius: 24, overflow: "hidden" },
  sendButton: { alignItems: "center", borderRadius: 24, height: 44, justifyContent: "center", width: 44 },
  sendDisabled: { opacity: 0.35 },
  sendThinking: { alignItems: "center", backgroundColor: withAlpha(glassPalette.cyan, 0.16), borderColor: withAlpha(glassPalette.cyan, 0.45), borderRadius: 24, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  });
}

const styles = createStyles();
