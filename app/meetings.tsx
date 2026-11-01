/**
 * Sprint 183 — Meetings-Screen: useColors durch Glass-Tokens ersetzt. Logik unveraendert.
 */
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DrawerBodyText, DrawerCard, DrawerCardTitle, DrawerScreen } from "@/components/responsive/drawer-screen";

/**
 * Sprint 132 — "Meetings"-Tab (Drawer): Einstiegspunkt des anstehenden
 * Meeting-/Voice-Moduls. Ehrlicher Status-Screen: keine vorgetäu-
 * schte Funktionalitaet, sondern Status und Roadmap des geplanten Moduls
 * (Agenten-Zusammenfassungen von Terminen, Voice-Bridge).
 */
export default function MeetingsScreen() {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  const roadmap = [
    { phase: "Phase 1", title: "Termin-Einbindung", detail: "Google-Calendar-Anschluss: der Agent fasst kommende Meetings zusammen und bereitet Talking Points vor." },
    { phase: "Phase 2", title: "Meeting-Notizen", detail: "Aufzeichnungen transkribieren (Whisper), Aktionspunkte extrahieren und ins Projekt-Gedächtnis schreiben." },
    { phase: "Phase 3", title: "Voice-Bridge", detail: "Direkte Agenten-Teilnahme über den Phone-Kanal des Superagenten." },
  ];

  return (
    <DrawerScreen kicker="KOMMENDE MODULE" title="Meetings">
      <DrawerCard accent={`${glass.glassPalette.cyan}66`}>
        <View style={styles.badgeRow}>
          <Text style={styles.badge}>NEU</Text>
          <Text style={styles.badgeText}>Modul in Vorbereitung</Text>
        </View>
        <DrawerCardTitle>Der Agent geht in deine Meetings</DrawerCardTitle>
        <DrawerBodyText>
          Meetings wird die nächste große Erweiterung des Control Centers: Kalender verbinden, Meetings vorbereiten, Notizen auswerten und Aktionspunkte automatisch ins Projekt-Gedächtnis übernehmen. Der Drawer-Eintrag ist bereits fest verdrahtet — das Modul wird per Update aktiviert, ohne Neuinstallation.
        </DrawerBodyText>
      </DrawerCard>

      {roadmap.map((item) => (
        <View key={item.phase} style={[styles.roadmapCard, { borderColor: `${glass.glassPalette.cyan}44` }]}>
          <Text style={styles.phase}>{item.phase}</Text>
          <Text style={styles.phaseTitle}>{item.title}</Text>
          <Text style={styles.phaseDetail}>{item.detail}</Text>
        </View>
      ))}
    </DrawerScreen>
  );
}

function createStyles(glass: RuntimeGlassTheme) {
  return StyleSheet.create({
    badgeRow: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 8 },
    badge: { backgroundColor: `${glass.glassPalette.cyan}22`, borderColor: glass.glassPalette.cyan, borderRadius: 8, borderWidth: 1, color: glass.glassPalette.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 0.6, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { color: glass.glassSurface.textSecondary, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
    roadmapCard: { backgroundColor: glass.glassDepth.glass, borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 14 },
    phase: { color: glass.glassPalette.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
    phaseTitle: { color: glass.glassSurface.textPrimary, fontSize: 13, fontWeight: "800", marginTop: 3 },
    phaseDetail: { color: glass.glassSurface.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4 },
  });
}
