/**
 * Danke-Seite nach dem Kauf — die `thankyou_url` fuer Digistore24.
 *
 * Aufgabe: dem Kaeufer in den ersten 30 Sekunden sagen, was jetzt passiert,
 * damit er nicht im Nichts landet. Bewusst ohne Tracking und ohne Upsell.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, GlowButton, StatusChip } from "@/components/glass/glass-primitives";
import { ScreenContainer } from "@/components/screen-container";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

const NAECHSTE_SCHRITTE: readonly { title: string; detail: string }[] = [
  {
    title: "1 · Bestätigung",
    detail: "Die Rechnung von Stripe ist unterwegs. Sie ist gleichzeitig dein Zahlungsbeleg für die Buchhaltung.",
  },
  {
    title: "2 · Zugang",
    detail: "Melde dich mit derselben E-Mail in der App an. Dein Paket wird automatisch zugeordnet, sobald die Zahlung verbucht ist.",
  },
  {
    title: "3 · Start",
    detail: "Im Dashboard startet die Marktanalyse. Die ersten Ergebnisse stehen dort als Auftragsschritte mit Zeitstempel.",
  },
];

export default function AiInfluenzaDanke() {
  const styles = useMemo(() => createStyles(), []);
  const params = useLocalSearchParams<{ order?: string }>();

  return (
    <GlassBackdrop accent="magenta">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <StatusChip label="Zahlung eingegangen" accent="magenta" live />
          <Text style={styles.title}>Willkommen im AI Influenza Team.</Text>
          <Text style={styles.lead}>
            Deine Buchung ist bei uns angekommen. Ab hier arbeitet das Team für dich — und du kannst jeden Schritt
            im Dashboard mitlesen.
          </Text>

          <GlassCard accent="magenta" style={styles.card}>
            <Text style={styles.kicker}>DIE NAECHSTEN MINUTEN</Text>
            {NAECHSTE_SCHRITTE.map((item) => (
              <View key={item.title} style={styles.row}>
                <Text style={styles.stepTitle}>{item.title}</Text>
                <Text style={styles.stepDetail}>{item.detail}</Text>
              </View>
            ))}
          </GlassCard>

          <GlassCard accent="purple" style={styles.card}>
            <Text style={styles.kicker}>DEINE BUCHUNG</Text>
            <Text style={styles.small}>
              {params.order
                ? `Auftragsreferenz: ${params.order}`
                : "Die Auftragsreferenz steht in der Bestätigungsmail."}
            </Text>
            <Text style={styles.small}>
              Fragen zur Rechnung oder zur Kündigung? Das Abo-Portal in der App erledigt beides ohne Rückfrage.
            </Text>
          </GlassCard>

          <GlowButton label="Zum Dashboard" accent="magenta" onPress={() => router.push("/ai-influenza-team")} />
        </ScrollView>
      </ScreenContainer>
    </GlassBackdrop>
  );
}

function createStyles() {
  return StyleSheet.create({
    content: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 48, gap: 14 },
    title: { color: glassSurface.textPrimary, fontSize: 28, fontWeight: "800", lineHeight: 34 },
    lead: { color: glassSurface.textMuted, fontSize: 15, lineHeight: 22 },
    card: { padding: 18, gap: 10 },
    kicker: { color: glassPalette.magenta, fontSize: 11, letterSpacing: 1.6, fontWeight: "700" },
    row: { gap: 2, paddingTop: 6 },
    stepTitle: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "700" },
    stepDetail: { color: glassSurface.textMuted, fontSize: 13, lineHeight: 19 },
    small: { color: glassSurface.textMuted, fontSize: 13, lineHeight: 20 },
  });
}
