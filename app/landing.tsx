/**
 * Sprint 265 — Öffentliche Landing-Page mit ehrlichem Pricing.
 *
 * Was du hier liest, ist absichtlich nüchtern: kein "revolutionär", keine
 * Erfolgsversprechen, keine Countdown-Timer. Preise kommen aus der ENV
 * (Cent-Beträge); ohne konfigurierten Preis steht "Preis auf Anfrage",
 * niemals "0 €". Checkout leitet in den Login (Stripe-Checkout braucht
 * einen Account) — sehen kann jeder, zahlen nur Eingeloggte.
 */
import { router } from "expo-router";
import { useEffect, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { buildTierPresentations, checkoutAvailability } from "@/lib/pricing-logic";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

const FEATURES: readonly { title: string; detail: string }[] = [
  { title: "App-Entwicklung im Chat", detail: "Der Dev-Agent liest und schreibt echte Repos: Dateien, Commits, Pull Requests, Issues. Jede Aktion sichtbar, nichts still." },
  { title: "Ehrliches Arbeitsgedächtnis", detail: "Entscheidungen, Fokus-Blöcke, Ideen und Lernkurven bleiben nachprüfbar gespeichert — rückwirkend schönen ist ausgeschlossen." },
  { title: "Kostenkontrolle statt Kostenfalle", detail: "Free-Tier-Modelle zuerst, Tagesquoten sichtbar, Upgrade nur wenn du es willst — ohne Druck-Fristen." },
];

export default function LandingScreen() {
  const styles = useMemo(() => createStyles(), []);
  const tiers = useMemo(() => buildTierPresentations(process.env as unknown as Record<string, string | undefined>), []);
  const trackView = trpc.analytics.track.useMutation();
  useEffect(() => {
    trackView.mutate({ kind: "landing_view" }, { onError: () => undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GlassBackdrop accent="blue">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>CYBERSARAH CONTROL CENTER</Text>
            <Text style={styles.title}>Dein Dev-Agent. Ehrlich gebaut.</Text>
            <Text style={styles.subtitle}>
              Apps im Chat entwickeln, Entscheidungen mit Erwartung festhalten, Ergebnisse ehrlich nachprüfen. Was nicht konfiguriert ist, sagen wir — und verkaufen es trotzdem nicht.
            </Text>
          </View>

          <View style={styles.featureColumn}>
            {FEATURES.map((feature) => (
              <GlassCard key={feature.title} accent="blue" style={styles.card}>
                <Text style={styles.cardTitle}>{feature.title}</Text>
                <Text style={styles.body}>{feature.detail}</Text>
              </GlassCard>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Preise</Text>
          {tiers.map((tier) => {
            const availability = checkoutAvailability(tier.tier, process.env as unknown as Record<string, string | undefined>);
            return (
              <GlassCard key={tier.tier} accent={tier.recommended ? "purple" : "blue"} style={styles.card}>
                <View style={styles.tierHeader}>
                  <Text style={styles.cardTitle}>{tier.label}</Text>
                  {tier.recommended ? <StatusChip label="Empfehlung" accent="purple" /> : null}
                </View>
                <Text style={styles.price}>{tier.priceLabel}</Text>
                <Text style={styles.body}>Enthält: {tier.entitlements.join(", ")}</Text>
                <Text style={styles.limit}>Nicht enthalten: {tier.limitations.join(", ")}</Text>
                <Pressable
                  accessibilityLabel={`${tier.label} wählen`}
                  style={availability.checkoutable ? styles.cta : styles.ctaDisabled}
                  onPress={() => router.push("/(tabs)/account")}
                >
                  <Text style={availability.checkoutable ? styles.ctaText : styles.ctaTextDisabled}>
                    {availability.checkoutable ? `${tier.label} wählen` : "Checkout noch nicht verfügbar"}
                  </Text>
                </Pressable>
                {!availability.checkoutable && <Text style={styles.limit}>{availability.reason}</Text>}
              </GlassCard>
            );
          })}

          <Text style={styles.honesty}>
            Hinweis: CyberSarah verspricht keinen Umsatz und keinen Erfolg — sie hält fest, was du entschieden hast, und prüft es ehrlich nach. Upgrade jederzeit kündbar.
          </Text>
        </ScrollView>
      </ScreenContainer>
    </GlassBackdrop>
  );
}

function createStyles() {
  return StyleSheet.create({
    content: { gap: 14, padding: 20, paddingBottom: 48, maxWidth: 680, alignSelf: "center" as const },
    header: { gap: 8, marginTop: 12 },
    eyebrow: { color: glassPalette.blue, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
    title: { color: glassSurface.textPrimary, fontSize: 30, fontWeight: "900", lineHeight: 36 },
    subtitle: { color: glassSurface.textSecondary, fontSize: 14, lineHeight: 21 },
    featureColumn: { gap: 12, marginTop: 8 },
    sectionTitle: { color: glassSurface.textPrimary, fontSize: 22, fontWeight: "900", marginTop: 14 },
    card: { gap: 10 },
    tierHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    cardTitle: { color: glassSurface.textPrimary, fontSize: 17, fontWeight: "900" },
    price: { color: glassSurface.textPrimary, fontSize: 20, fontWeight: "800" },
    body: { color: glassSurface.textSecondary, fontSize: 13, lineHeight: 19 },
    limit: { color: glassSurface.textMuted, fontSize: 11, lineHeight: 16 },
    cta: { alignItems: "center", borderColor: `${glassPalette.purple}88`, borderRadius: 12, borderWidth: 1, paddingVertical: 10, marginTop: 4 },
    ctaText: { color: glassPalette.purple, fontSize: 12, fontWeight: "800" },
    ctaDisabled: { alignItems: "center", borderColor: glassSurface.border, borderRadius: 12, borderWidth: 1, paddingVertical: 10, marginTop: 4 },
    ctaTextDisabled: { color: glassSurface.textMuted, fontSize: 12, fontWeight: "800" },
    honesty: { color: glassSurface.textMuted, fontSize: 10, lineHeight: 15, marginTop: 8 },
  });
}
