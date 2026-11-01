/**
 * Sprint 196 — Skills-Einstellungs-Screen (/settings/skills).
 *
 * Zentrale Verwaltung der drei Superagent-Skills (Agent-Vorschläge,
 * Code-Diff-Prüfung, CI-Qualitätsprüfung): Uebersicht, Einzel-Toggles,
 * Sammelaktionen und persistente Speicherung ueber den gemeinsamen
 * Schluessel cybersarah.skill-preferences.v1 — derselbe Speicher wie im
 * Optimizer-Chat (Agent-Tab), dadurch wirken Aenderungen sofort ueberall.
 * Katalog und Praeferenz-Logik liegen rein und getestet in lib/
 * (skill-catalog.ts, skill-preferences-logic.ts).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { GlowButton } from "@/components/glass/glass-primitives";
import { DrawerBodyText, DrawerCard, DrawerCardTitle, DrawerScreen } from "@/components/responsive/drawer-screen";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
import { SKILL_CATALOG } from "@/lib/skill-catalog";
import {
  DEFAULT_SKILL_PREFERENCES,
  enabledSkillCount,
  normalizeSkillPreferences,
  SKILL_PREFERENCE_STORAGE_KEY,
  toggleSkill,
  type SkillPreferences,
} from "@/lib/skill-preferences-logic";

export default function SkillsSettingsScreen() {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  const [preferences, setPreferences] = useState<SkillPreferences>(DEFAULT_SKILL_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  // Gespeicherte Praeferenzen laden; beschaedigte Werte faellt die
  // Normalisierung sicher auf die Defaults zurueck.
  useEffect(() => {
    let disposed = false;
    void AsyncStorage.getItem(SKILL_PREFERENCE_STORAGE_KEY)
      .then((raw) => {
        if (disposed) return;
        setPreferences(normalizeSkillPreferences(raw ? JSON.parse(raw) : null));
        setLoaded(true);
      })
      .catch(() => {
        if (disposed) return;
        setPreferences(DEFAULT_SKILL_PREFERENCES);
        setLoaded(true);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const persist = useCallback((next: SkillPreferences) => {
    setPreferences(next);
    void AsyncStorage.setItem(SKILL_PREFERENCE_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const activeCount = enabledSkillCount(preferences);

  return (
    <DrawerScreen kicker="EINSTELLUNGEN" title="Skills" accent="cyan">
      <DrawerCard accent={`${glass.glassPalette.cyan}66`}>
        <DrawerCardTitle>{loaded ? `${activeCount} von ${SKILL_CATALOG.length} Skills aktiv` : "Skills werden geladen …"}</DrawerCardTitle>
        <DrawerBodyText>
          Diese Skills steuern, welche Prüfläufe der Superagent bei jedem Auftrag im Optimizer-Chat ausführt. Dieselbe Auswahl gilt auch für die Schnell-Toggles im Chat-Menü — Änderungen hier wirken sofort und werden auf dem Gerät gespeichert.
        </DrawerBodyText>
        <View style={styles.bulkRow}>
          <GlowButton
            accent="cyan"
            disabled={activeCount === SKILL_CATALOG.length}
            label="Alle aktivieren"
            onPress={() => persist({ agent: true, diff: true, quality: true })}
            variant="secondary"
          />
          <GlowButton
            accent="red"
            disabled={activeCount === 0}
            label="Alle deaktivieren"
            onPress={() => persist({ agent: false, diff: false, quality: false })}
            variant="secondary"
          />
        </View>
      </DrawerCard>

      {SKILL_CATALOG.map((skill) => {
        const enabled = preferences[skill.id];
        const accentColor = glass.glassPalette[skill.accent];
        return (
          <DrawerCard key={skill.id} accent={enabled ? `${accentColor}66` : undefined}>
            <View style={styles.skillRow}>
              <View style={[styles.skillIcon, enabled && { borderColor: `${accentColor}88`, backgroundColor: glass.accentAlpha(skill.accent, 0.14) }]}>
                <IconSymbol name={skill.icon} size={19} color={enabled ? accentColor : glass.glassSurface.textMuted} />
              </View>
              <View style={styles.skillCopy}>
                <Text style={styles.skillTitle}>{skill.label}</Text>
                <Text style={styles.skillDescription}>{skill.description}</Text>
                <Text style={[styles.skillStatus, enabled ? { color: accentColor } : null]}>
                  {enabled ? "Aktiv — läuft bei jedem Auftrag" : "Deaktiviert — läuft nicht"}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityHint={`${skill.label} ${enabled ? "deaktivieren" : "aktivieren"}`}
                accessibilityLabel={`${skill.label} ${enabled ? "deaktivieren" : "aktivieren"}`}
                accessibilityRole="switch"
                accessibilityState={{ checked: enabled }}
                activeOpacity={0.75}
                onPress={() => persist(toggleSkill(preferences, skill.id))}
                style={[styles.toggle, enabled && styles.toggleOn]}
              >
                <View style={[styles.toggleKnob, enabled && styles.toggleKnobOn]} />
              </TouchableOpacity>
            </View>
          </DrawerCard>
        );
      })}

      <DrawerCard>
        <DrawerCardTitle>Deaktivierte Skills</DrawerCardTitle>
        <DrawerBodyText>
          Ist ein Skill aus, bleibt der Chat voll nutzbar — der Superagent sendet dann schlicht ohne diesen Prüfschritt (z. B. keine Diff-Markierung oder keine CI-Rückmeldung). Die Auswahl betrifft nur künftige Aufträge.
        </DrawerBodyText>
      </DrawerCard>
    </DrawerScreen>
  );
}

function createStyles(glass: RuntimeGlassTheme) {
  return StyleSheet.create({
    bulkRow: { flexDirection: "row", gap: 10, marginTop: 14 },
    skillRow: { alignItems: "center", flexDirection: "row", gap: 12 },
    skillIcon: {
      alignItems: "center",
      borderColor: glass.glassSurface.border,
      borderRadius: 13,
      borderWidth: 1,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    skillCopy: { flex: 1 },
    skillTitle: { color: glass.glassSurface.textPrimary, fontSize: 14, fontWeight: "800" },
    skillDescription: { color: glass.glassSurface.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
    skillStatus: { color: glass.glassSurface.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginTop: 6, textTransform: "uppercase" },
    toggle: {
      backgroundColor: glass.glassDepth.layer,
      borderColor: glass.glassSurface.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 28,
      padding: 3,
      width: 50,
    },
    toggleOn: { backgroundColor: glass.accentAlpha("cyan", 0.22), borderColor: `${glass.glassPalette.cyan}88` },
    toggleKnob: { backgroundColor: glass.glassSurface.textMuted, borderRadius: 999, height: 20, width: 20 },
    toggleKnobOn: { backgroundColor: glass.glassPalette.cyan, transform: [{ translateX: 22 }] },
  });
}
