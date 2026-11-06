/**
 * Gemeinsamer Footer fuer den Funnel.
 *
 * Rechtstexte muessen ohne Suchen erreichbar sein: von der Verkaufsseite, aus
 * dem Checkout und aus der Danke-Seite. Deshalb ein Bauteil statt vier
 * Kopien — so kann keine Seite "vergessen" werden.
 */
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { glassPalette, glassSurface } from "@/lib/design/future-glass";
import { LEGAL_COPYRIGHT, LEGAL_FOOTER_LINKS } from "@/lib/legal-footer-logic";

export function LegalFooter({ context }: { context?: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.links}>
        {LEGAL_FOOTER_LINKS.map((entry) => (
          <Link key={entry.id} href={entry.href as never} style={styles.link}>
            {entry.label}
          </Link>
        ))}
      </View>
      <Text style={styles.copy}>
        {LEGAL_COPYRIGHT}
        {context ? ` · ${context}` : ""}
      </Text>
      <Text style={styles.copy}>
        Preise pro Monat, monatlich kündbar. Zahlung über Stripe. Keine Erfolgsgarantie, keine Mindestlaufzeit.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingTop: 18, paddingBottom: 8 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  link: { color: glassPalette.cyan, fontSize: 12, fontWeight: "700" },
  copy: { color: glassSurface.textMuted, fontSize: 10, lineHeight: 15 },
});
