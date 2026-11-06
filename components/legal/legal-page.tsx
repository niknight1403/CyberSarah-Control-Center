/**
 * Darstellung einer Rechtsseite. Der Inhalt kommt aus lib/legal-texts.ts,
 * hier steht nur, wie er aussieht und wie man zurueckkommt.
 */
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard } from "@/components/glass/glass-primitives";
import { LegalFooter } from "@/components/legal/legal-footer";
import { ScreenContainer } from "@/components/screen-container";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";
import { impressumComplete, missingImpressumFields } from "@/lib/legal-company";
import type { LegalDocument } from "@/lib/legal-texts";

export function LegalPageView({ document }: { document: LegalDocument }) {
  const incompleteImpressum = document.id === "impressum" && !impressumComplete();
  const missing = incompleteImpressum ? missingImpressumFields() : [];

  return (
    <GlassBackdrop accent="purple">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.back} onPress={() => router.push("/" as never)}>
            ← zurück
          </Text>
          <Text style={styles.eyebrow}>{document.title.toUpperCase()}</Text>
          <Text style={styles.title}>{document.title}</Text>
          <Text style={styles.updated}>Stand: {document.updatedAt}</Text>
          {document.intro ? <Text style={styles.intro}>{document.intro}</Text> : null}

          {incompleteImpressum ? (
            <GlassCard accent="amber" style={styles.card}>
              <Text style={styles.warnTitle}>Diese Seite ist noch nicht vollständig</Text>
              <Text style={styles.warnText}>
                Es fehlen Pflichtangaben nach § 5 DDG: {missing.join(", ")}. Sie sind in
                <Text style={styles.mono}> lib/legal-company.ts </Text>
                einzutragen. Ohne diese Angaben ist das Impressum nicht abmahnfest — das wird hier
                lieber offen gesagt, als eine Lücke zu überdecken.
              </Text>
            </GlassCard>
          ) : null}

          {document.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.heading}>{section.heading}</Text>
              {(section.paragraphs ?? []).map((paragraph, index) => (
                <Text key={`${section.heading}-${index}`} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
              {section.list ? (
                <View style={styles.list}>
                  {section.list.map((item, index) => (
                    <Text key={`${section.heading}-li-${index}`} style={styles.listItem}>
                      · {item}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))}

          <LegalFooter context={document.title} />
        </ScrollView>
      </ScreenContainer>
    </GlassBackdrop>
  );
}

const styles = StyleSheet.create({
  content: { gap: 10, padding: 20, paddingBottom: 48 },
  back: { color: glassPalette.cyan, fontSize: 13, fontWeight: "700" },
  eyebrow: { color: glassPalette.magenta, fontSize: 10, letterSpacing: 1.6, fontWeight: "900", marginTop: 6 },
  title: { color: glassSurface.textPrimary, fontSize: 26, fontWeight: "900", lineHeight: 32 },
  updated: { color: glassSurface.textMuted, fontSize: 11 },
  intro: { color: glassSurface.textSecondary, fontSize: 13, lineHeight: 20 },
  card: { padding: 14, gap: 6 },
  warnTitle: { color: glassPalette.amber, fontSize: 13, fontWeight: "900" },
  warnText: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 18 },
  mono: { color: glassSurface.textPrimary },
  section: { gap: 5, paddingTop: 10, borderTopColor: glassSurface.border, borderTopWidth: 1 },
  heading: { color: glassSurface.textPrimary, fontSize: 15, fontWeight: "800" },
  paragraph: { color: glassSurface.textSecondary, fontSize: 13, lineHeight: 20 },
  list: { gap: 3, paddingTop: 2 },
  listItem: { color: glassSurface.textSecondary, fontSize: 13, lineHeight: 20 },
});
