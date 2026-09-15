import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import React from "react";

/**
 * Sprint 124 — Stylische, wiederverwendbare Paywall (Expo/React Native).
 *
 * Greift, wenn ein Nutzer erweiterte Agenten-Features oder Cloud-Ressourcen
 * jenseits seines Kontingents nutzen moechte. Vollkommen self-contained:
 * keine App-Theme-Abhaengigkeit, nur react-native Kernkomponenten.
 */

export interface PaywallBenefit {
  icon: string;
  title: string;
  detail: string;
}

export interface PaywallModalProps {
  visible: boolean;
  /** Ausloesender Grund, z. B. aus QuotaCheck.reason. */
  reason?: string;
  /** Empfohlener Plan fuer das Upgrade-CTA. */
  recommendedPlanLabel?: string;
  price?: string;
  benefits?: PaywallBenefit[];
  onSubscribe?: () => void;
  onBuyCredits?: () => void;
  onClose: () => void;
}

const DEFAULT_BENEFITS: PaywallBenefit[] = [
  { icon: "⚡", title: "Bis zu 3 Mio. Cloud-Tokens / Monat", detail: "Managed LLM-Pool mit Multi-Provider-Failover" },
  { icon: "🤖", title: "Multi-Agenten-Workflows", detail: "Bis zu 10 parallele Agenten im Orchestrator" },
  { icon: "🚀", title: "Prioritaet im Cloud-Pool", detail: "Deine Cloud-Aufrufe springen nach vorn" },
  { icon: "🛡️", title: "Sicher & DSGVO-konform", detail: "Europaeische Infrastruktur, keine Datenweitergabe" },
];

export function PaywallModal({
  visible,
  reason,
  recommendedPlanLabel = "Pro",
  price = "9,99 € / Monat",
  benefits = DEFAULT_BENEFITS,
  onSubscribe,
  onBuyCredits,
  onClose,
}: PaywallModalProps) {
  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.kicker}>CYBERSARAH {recommendedPlanLabel.toUpperCase()}</Text>
          <Text style={styles.headline}>Schalte das volle{"\n"}KI-Agenten-Potenzial frei</Text>
          {reason ? <Text style={styles.reason}>{reason}</Text> : null}

          <View style={styles.benefits}>
            {benefits.map((benefit) => (
              <View key={benefit.title} style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>{benefit.icon}</Text>
                <View style={styles.benefitText}>
                  <Text style={styles.benefitTitle}>{benefit.title}</Text>
                  <Text style={styles.benefitDetail}>{benefit.detail}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={onSubscribe}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{recommendedPlanLabel} abonnieren — {price}</Text>
          </Pressable>

          {onBuyCredits ? (
            <Pressable style={styles.secondaryCta} onPress={onBuyCredits} accessibilityRole="button">
              <Text style={styles.secondaryCtaText}>Oder Credit-Pack kaufen (ohne Abo)</Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.closeRow} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeText}>Später</Text>
          </Pressable>

          <Text style={styles.fineprint}>
            Jederzeit kündbar. Lokale Ausführung (eigene Provider/Ollama) bleibt immer kostenlos.
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(6, 8, 18, 0.82)",
    justifyContent: "flex-end",
    zIndex: 999,
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: "#10131f",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: "#2a2f4a",
    paddingHorizontal: 22,
    paddingBottom: 26,
  },
  content: { paddingTop: 26 },
  kicker: {
    color: "#8b9bff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 6,
  },
  headline: { color: "#ffffff", fontSize: 26, fontWeight: "800", lineHeight: 32, marginBottom: 8 },
  reason: { color: "#ffb4a2", fontSize: 14, lineHeight: 20, marginBottom: 14 },
  benefits: { gap: 14, marginBottom: 22 },
  benefitRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  benefitIcon: { fontSize: 20, marginTop: 1 },
  benefitText: { flex: 1 },
  benefitTitle: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  benefitDetail: { color: "#9aa0b8", fontSize: 13, lineHeight: 18, marginTop: 1 },
  cta: {
    backgroundColor: "#5b6cff",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaPressed: { backgroundColor: "#4956e0" },
  ctaText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  secondaryCta: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#3a4170",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryCtaText: { color: "#c6cbff", fontSize: 14, fontWeight: "600" },
  closeRow: { marginTop: 14, paddingVertical: 8, alignItems: "center" },
  closeText: { color: "#8a90a8", fontSize: 14 },
  fineprint: { marginTop: 14, color: "#6b7091", fontSize: 11, textAlign: "center", lineHeight: 16 },
});
