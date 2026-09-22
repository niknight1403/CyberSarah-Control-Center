import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AiCore } from "@/components/glass/ai-core";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { ScreenContainer } from "@/components/screen-container";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

const LOOPS = [
  { name: "Content-to-Lead", flow: "Content → Lead", value: "Newsletter, Demo oder Beratung", accent: "cyan" as const },
  { name: "SaaS-Conversion", flow: "Trial → Abo", value: "Onboarding, Aktivierung und Retention", accent: "purple" as const },
  { name: "Affiliate-Loop", flow: "Content → Empfehlung", value: "Transparente Affiliate-CTA mit Tracking", accent: "blue" as const },
  { name: "Referral-Loop", flow: "Kunde → Empfehlung", value: "Referral-Anreiz und wiederkehrende Nutzung", accent: "green" as const },
];

export default function LoopEngineeringScreen() {
  const drawer = useNavDrawer();
  return <GlassBackdrop accent="blue"><ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent"><View style={styles.topBar}><NavDrawerButton {...drawer.hamburgerProps} tint={glassPalette.blue} /><View style={styles.headingCopy}><Text style={styles.eyebrow}>CYBERSARAH · REVENUE ENGINEERING</Text><Text style={styles.title}>Loop Engineering</Text></View><StatusChip label="PLANUNG" accent="blue" /></View><ScrollView contentContainerStyle={styles.content}><GlassCard accent="blue" glow={2} style={styles.hero}><View style={styles.heroHeader}><AiCore state="idle" size={38} /><View style={styles.headingCopy}><Text style={styles.heroTitle}>Umsatzmöglichkeiten als messbare Schleifen</Text><Text style={styles.subtitle}>Hypothese → Experiment → Messwert → nächster Schritt</Text></View></View><Text style={styles.body}>Baue wiederholbare Revenue-Loops statt einzelner Aktionen. Jede Schleife bleibt zunächst ein Entwurf und benötigt einen manuellen Freigabepunkt.</Text></GlassCard><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Aktive Umsatzschleifen</Text><StatusChip label="4 Entwürfe" accent="blue" /></View>{LOOPS.map((loop) => <GlassCard key={loop.name} accent={loop.accent} style={styles.loopCard}><View style={styles.loopHeader}><View style={[styles.loopDot, { backgroundColor: glassPalette[loop.accent] }]} /><View style={styles.headingCopy}><Text style={styles.loopName}>{loop.name}</Text><Text style={[styles.loopFlow, { color: glassPalette[loop.accent] }]}>{loop.flow}</Text></View><StatusChip label="Entwurf" accent={loop.accent} /></View><Text style={styles.body}>{loop.value}</Text><View style={styles.steps}><Step label="Hypothese" /><Text style={styles.arrow}>›</Text><Step label="Test" /><Text style={styles.arrow}>›</Text><Step label="Messwert" /></View></GlassCard>)}</ScrollView></ScreenContainer><NavDrawer {...drawer.drawerProps} /></GlassBackdrop>;
}

function Step({ label }: { label: string }) { return <View style={styles.step}><Text style={styles.stepText}>{label}</Text></View>; }

const styles = StyleSheet.create({ topBar: { alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }, headingCopy: { flex: 1 }, eyebrow: { color: glassPalette.blue, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 }, title: { color: glassSurface.textPrimary, fontSize: 23, fontWeight: "900", marginTop: 2 }, content: { gap: 14, padding: 16, paddingBottom: 40 }, hero: { gap: 14, paddingVertical: 20 }, heroHeader: { alignItems: "center", flexDirection: "row", gap: 12 }, heroTitle: { color: glassSurface.textPrimary, fontSize: 20, fontWeight: "900" }, subtitle: { color: glassSurface.textSecondary, fontSize: 12, marginTop: 4 }, body: { color: glassSurface.textSecondary, fontSize: 13, lineHeight: 20 }, sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, sectionTitle: { color: glassSurface.textPrimary, fontSize: 18, fontWeight: "900" }, loopCard: { gap: 12 }, loopHeader: { alignItems: "center", flexDirection: "row", gap: 10 }, loopDot: { borderRadius: 6, height: 12, width: 12 }, loopName: { color: glassSurface.textPrimary, fontSize: 16, fontWeight: "900" }, loopFlow: { fontSize: 11, fontWeight: "800", marginTop: 3 }, steps: { alignItems: "center", flexDirection: "row", gap: 8 }, step: { backgroundColor: `${glassSurface.border}55`, borderRadius: 10, flex: 1, padding: 9 }, stepText: { color: glassSurface.textSecondary, fontSize: 10, fontWeight: "800", textAlign: "center" }, arrow: { color: glassPalette.blue, fontSize: 22 } });
