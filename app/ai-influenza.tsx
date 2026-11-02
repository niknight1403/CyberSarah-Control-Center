/**
 * Oeffentliche Verkaufsseite des AI Influenza Teams.
 *
 * Diese Seite ist die `salespage_url` fuer Digistore24 und der Einstieg fuer
 * kalte Besucher. Sie ist absichtlich nuechtern: echte Preise aus den Paketen,
 * echte Lieferbestandteile, keine Erfolgsversprechen und keine Frist-Timer.
 *
 * Zahlen kann hier niemand ohne Konto: der Kauf laeuft ueber den Checkout in
 * der App (Stripe braucht einen Kunden). Diese Beschraenkung ist gewollt und
 * wird auf der Seite auch so gesagt, statt einen Button zu zeigen, der ins
 * Leere fuehrt.
 */
import { router } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, GlowButton, StatusChip } from "@/components/glass/glass-primitives";
import { ScreenContainer } from "@/components/screen-container";
import { AI_INFLUENZA_PACKAGES, type AiInfluenzaPackageId } from "@/lib/ai-influenza-team-logic";
import { buildPackageLoginPath } from "@/lib/post-login-navigation-logic";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

const PACKAGE_ORDER: readonly AiInfluenzaPackageId[] = ["starter", "growth", "business"];

function euro(cents: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const ABLAUF: readonly { step: string; detail: string }[] = [
  { step: "1 · Analyse", detail: "Wir lesen deinen Markt, deine Wettbewerber und deine bisherigen Kanaele. Ergebnis: eine belegte Ausgangslage statt Bauchgefuehl." },
  { step: "2 · Aufbau", detail: "Zielgruppe, Angebot und Preislogik werden festgelegt, die Kampagnen und Content-Pakete daraus abgeleitet." },
  { step: "3 · Betrieb", detail: "Content, Video und Ausspielung laufen im Tageszyklus. Jede Aktion und jeder Token-Verbrauch ist im Dashboard nachvollziehbar." },
  { step: "4 · Auswertung", detail: "Monatlicher Report: Umsatz, Kosten, Marge je Auftrag. Was nicht traegt, fliegt raus." },
];

export default function AiInfluenzaVerkaufsseite() {
  const styles = useMemo(() => createStyles(), []);

  return (
    <GlassBackdrop accent="magenta">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>CYBERSARAH · AI INFLUENZA TEAM</Text>
            <Text style={styles.title}>Ein KI-Marketing-Team, das seine Arbeit belegt.</Text>
            <Text style={styles.lead}>
              Acht spezialisierte Agenten arbeiten an Marktanalyse, CRM, Angeboten, Content, Video und Reporting.
              Du siehst jeden Schritt, jeden Kostenpunkt und jeden Umsatz im Dashboard. Keine Blackbox, keine
              Mindestlaufzeit.
            </Text>
            <StatusChip label="Monatlich kündbar" accent="magenta" />
          </View>

          <GlassCard accent="magenta" style={styles.card}>
            <Text style={styles.kicker}>SO LAEUFT ES</Text>
            {ABLAUF.map((item) => (
              <View key={item.step} style={styles.row}>
                <Text style={styles.stepLabel}>{item.step}</Text>
                <Text style={styles.stepDetail}>{item.detail}</Text>
              </View>
            ))}
          </GlassCard>

          <Text style={styles.sectionTitle}>Pakete</Text>
          {PACKAGE_ORDER.map((packageId) => {
            const pkg = AI_INFLUENZA_PACKAGES[packageId];
            return (
              <GlassCard key={pkg.id} accent="magenta" style={styles.card}>
                <View style={styles.packageHead}>
                  <Text style={styles.packageName}>{pkg.name}</Text>
                  <Text style={styles.price}>{euro(pkg.monthlyPriceCents)}</Text>
                </View>
                <Text style={styles.priceNote}>pro Monat, zzgl. USt. · monatlich kündbar</Text>
                <View style={styles.deliverables}>
                  {pkg.deliverables.map((item) => (
                    <Text key={item} style={styles.deliverable}>· {item}</Text>
                  ))}
                </View>
                <GlowButton
                  label="Paket wählen"
                  accent="magenta"
                  variant={pkg.id === "growth" ? "primary" : "secondary"}
                  // Paket bleibt erhalten: nach dem Login steht der Checkout bereit.
                  onPress={() => router.push(buildPackageLoginPath(pkg.id) as never)}
                />
              </GlassCard>
            );
          })}

          <GlassCard accent="purple" style={styles.card}>
            <Text style={styles.kicker}>WAS HIER NICHT PASSIERT</Text>
            <Text style={styles.small}>
              Keine Erfolgsgarantie, keine Reichweiten-Versprechen, keine versteckten Staffelpreise. Zahlungen laufen
              ausschliesslich über Stripe; der Kauf braucht ein Konto, weil jede Lieferung einer Rechnung zugeordnet
              werden muss. Rechnungen und Kündigung findest du im Abo-Portal.
            </Text>
          </GlassCard>
        </ScrollView>
      </ScreenContainer>
    </GlassBackdrop>
  );
}

function createStyles() {
  return StyleSheet.create({
    content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, gap: 16 },
    header: { gap: 12 },
    eyebrow: { color: glassPalette.magenta, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
    title: { color: glassSurface.textPrimary, fontSize: 30, fontWeight: "800", lineHeight: 36 },
    lead: { color: glassSurface.textMuted, fontSize: 15, lineHeight: 22 },
    card: { padding: 18, gap: 10 },
    kicker: { color: glassPalette.magenta, fontSize: 11, letterSpacing: 1.6, fontWeight: "700" },
    row: { gap: 2, paddingTop: 6 },
    stepLabel: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "700" },
    stepDetail: { color: glassSurface.textMuted, fontSize: 13, lineHeight: 19 },
    sectionTitle: { color: glassSurface.textPrimary, fontSize: 20, fontWeight: "800", paddingTop: 8 },
    packageHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    packageName: { color: glassSurface.textPrimary, fontSize: 18, fontWeight: "800" },
    price: { color: glassPalette.magenta, fontSize: 22, fontWeight: "800" },
    priceNote: { color: glassSurface.textMuted, fontSize: 12 },
    deliverables: { gap: 4, paddingVertical: 4 },
    deliverable: { color: glassSurface.textMuted, fontSize: 13, lineHeight: 19 },
    small: { color: glassSurface.textMuted, fontSize: 13, lineHeight: 20 },
  });
}
