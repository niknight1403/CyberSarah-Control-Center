import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { AiCore } from "@/components/glass/ai-core";
import { GlassCard, GlowButton, StatusChip } from "@/components/glass/glass-primitives";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

type Section = "influencer" | "hara" | "saas" | "loop" | "trading";

type Persona = {
  name: string;
  niche: string;
  tone: string;
  accent: "cyan" | "purple" | "magenta" | "blue" | "green" | "amber";
  status: string;
};

const PERSONAS: Persona[] = [
  { name: "Nova", niche: "KI & Zukunft", tone: "Visionär", accent: "cyan", status: "Content-Pipeline bereit" },
  { name: "Mira", niche: "Mindset & Coaching", tone: "Empathisch", accent: "purple", status: "Engagement-Analyse aktiv" },
  { name: "Juno", niche: "Business & SaaS", tone: "Präzise", accent: "magenta", status: "Funnel-Entwürfe bereit" },
  { name: "Lina", niche: "Lifestyle & Produktivität", tone: "Motivierend", accent: "blue", status: "7 Ideen in Queue" },
  { name: "Kaya", niche: "Finance Education", tone: "Nüchtern", accent: "green", status: "Risiko-Guard aktiv" },
  { name: "Zara", niche: "Creator Economy", tone: "Mutig", accent: "amber", status: "Trend-Scan aktuell" },
];

const SECTIONS: { key: Section; label: string; icon: string; accent: "cyan" | "purple" | "magenta" | "blue" | "green" }[] = [
  { key: "influencer", label: "6 Personas", icon: "✦", accent: "cyan" },
  { key: "hara", label: "HARA", icon: "⚡", accent: "purple" },
  { key: "saas", label: "SaaS", icon: "▦", accent: "magenta" },
  { key: "loop", label: "Loop Revenue", icon: "↻", accent: "blue" },
  { key: "trading", label: "Micro Trading", icon: "⌁", accent: "green" },
];

function SectionButton({ item, active, onPress }: { item: (typeof SECTIONS)[number]; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.sectionButton, active && { borderColor: glassPalette[item.accent], backgroundColor: `${glassPalette[item.accent]}20` }]}>
      <Text style={[styles.sectionIcon, { color: active ? glassPalette[item.accent] : glassSurface.textMuted }]}>{item.icon}</Text>
      <Text style={[styles.sectionLabel, active && { color: glassPalette[item.accent] }]}>{item.label}</Text>
    </Pressable>
  );
}

function InfluencerSection() {
  return (
    <>
      <View style={styles.sectionHeading}>
        <View style={styles.headingCopy}>
          <Text style={styles.sectionTitle}>KI-Influencer-Persönlichkeiten</Text>
          <Text style={styles.sectionDescription}>Sechs getrennte Stimmen für Content, Community und Umsatz-Experimente.</Text>
        </View>
        <StatusChip label="6 aktiv" accent="green" live />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.personaRow}>
        {PERSONAS.map((persona) => (
          <GlassCard key={persona.name} accent={persona.accent} glow={1} style={styles.personaCard} testID={`persona-${persona.name.toLowerCase()}`}>
            <AiCore state="idle" size={30} />
            <Text style={styles.personaName}>{persona.name}</Text>
            <Text style={[styles.personaNiche, { color: glassPalette[persona.accent] }]}>{persona.niche}</Text>
            <Text style={styles.personaTone}>{persona.tone} · Persona</Text>
            <Text style={styles.personaStatus}>{persona.status}</Text>
          </GlassCard>
        ))}
      </ScrollView>
      <GlassCard accent="cyan" style={styles.detailCard}>
        <Text style={styles.detailTitle}>Persona-Orchestrierung</Text>
        <Text style={styles.detailText}>Wähle eine Persönlichkeit im Revenue-OS-Dashboard für Persona-Matrix, Tonalität, Catchphrases, Content-Plan und read-only Umsatzaktionen.</Text>
        <GlowButton label="Influencer-Workspace öffnen" accent="cyan" variant="secondary" onPress={() => undefined} />
      </GlassCard>
    </>
  );
}

function HaraSection() {
  return (
    <GlassCard accent="purple" glow={2} style={styles.featureCard}>
      <View style={styles.featureHeader}><AiCore state="thinking" size={34} /><View style={styles.headingCopy}><Text style={styles.featureTitle}>HARA</Text><Text style={styles.featureSubtitle}>Hyper-Autonomer Revenue Agent</Text></View><StatusChip label="bereit" accent="green" /></View>
      <Text style={styles.detailText}>Findet Revenue-Chancen, priorisiert Cross-Sell-Ideen, erstellt Kampagnenentwürfe und übergibt sie zur Freigabe. Keine Veröffentlichung oder Transaktion ohne Nutzerfreigabe.</Text>
      <View style={styles.metricRow}><Metric label="Chancen" value="12" /><Metric label="Kampagnen" value="4" /><Metric label="Nächster Lauf" value="09:00" /></View>
      <GlowButton label="HARA-Konsole öffnen" accent="purple" onPress={() => undefined} />
    </GlassCard>
  );
}

function SaaSSection() {
  return (
    <GlassCard accent="magenta" glow={1} style={styles.featureCard}>
      <View style={styles.featureHeader}><AiCore state="idle" size={34} /><View style={styles.headingCopy}><Text style={styles.featureTitle}>SaaS-System</Text><Text style={styles.featureSubtitle}>Produkte, Funnels und Subscriptions</Text></View><StatusChip label="integriert" accent="magenta" /></View>
      <Text style={styles.detailText}>Verwalte Produktideen, Pricing-Experimente, Trial-to-Paid-Funnel, aktive Subscriptions und den nächsten validierbaren Produkt-Schritt.</Text>
      <View style={styles.metricRow}><Metric label="Produkte" value="8" /><Metric label="Trials" value="26" /><Metric label="MRR-Entwurf" value="€ 2.480" /></View>
      <GlowButton label="SaaS-Workspace öffnen" accent="magenta" variant="secondary" onPress={() => undefined} />
    </GlassCard>
  );
}

function LoopSection() {
  return (
    <GlassCard accent="blue" glow={1} style={styles.featureCard}>
      <View style={styles.featureHeader}><AiCore state="idle" size={34} /><View style={styles.headingCopy}><Text style={styles.featureTitle}>Loop Engineering</Text><Text style={styles.featureSubtitle}>Umsatzschleifen systematisch bauen</Text></View><StatusChip label="aktiv" accent="blue" /></View>
      <Text style={styles.detailText}>Mappe Content → Lead → Produkt → Retention → Referral. Jede Schleife erhält eine Hypothese, Messgröße, nächste Aktion und einen manuellen Freigabepunkt.</Text>
      <View style={styles.loopRow}><LoopStep label="Content" /><Text style={styles.loopArrow}>›</Text><LoopStep label="Lead" /><Text style={styles.loopArrow}>›</Text><LoopStep label="Sale" /><Text style={styles.loopArrow}>›</Text><LoopStep label="Referral" /></View>
      <GlowButton label="Revenue-Loops planen" accent="blue" variant="secondary" onPress={() => undefined} />
    </GlassCard>
  );
}

function TradingSection() {
  return (
    <GlassCard accent="green" glow={1} style={styles.featureCard}>
      <View style={styles.featureHeader}><AiCore state="warning" size={34} /><View style={styles.headingCopy}><Text style={styles.featureTitle}>Micro Trading</Text><Text style={styles.featureSubtitle}>Analyse und Paper-Simulation</Text></View><StatusChip label="paper only" accent="amber" /></View>
      <Text style={styles.detailText}>Dieses Modul zeigt Marktbeobachtung, Signale, Backtests und hypothetische Positionen. Es verbindet sich nicht mit Brokern und platziert keine Orders.</Text>
      <View style={styles.metricRow}><Metric label="Watchlist" value="6" /><Metric label="Paper-Signale" value="3" /><Metric label="Risiko" value="simuliert" /></View>
      <GlowButton label="Trading-Analyse öffnen" accent="green" variant="secondary" onPress={() => undefined} />
    </GlassCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function LoopStep({ label }: { label: string }) {
  return <View style={styles.loopStep}><Text style={styles.loopStepDot}>●</Text><Text style={styles.loopStepText}>{label}</Text></View>;
}

export default function RevenueOsScreen() {
  const [section, setSection] = useState<Section>("influencer");
  const navDrawer = useNavDrawer();
  const active = useMemo(() => SECTIONS.find((item) => item.key === section) ?? SECTIONS[0], [section]);

  return (
    <GlassBackdrop accent={active.accent}>
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <View style={styles.topBar}><NavDrawerButton {...navDrawer.hamburgerProps} tint={glassPalette.cyan} /><View style={styles.titleBlock}><Text style={styles.eyebrow}>CYBERSARAH · REVENUE OS</Text><Text style={styles.title}>Revenue Hub</Text></View><StatusChip label="verbunden" accent="green" live /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionRow} accessibilityLabel="Revenue-OS-Bereiche">
          {SECTIONS.map((item) => <SectionButton key={item.key} item={item} active={item.key === section} onPress={() => setSection(item.key)} />)}
        </ScrollView>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <GlassCard accent={active.accent} glow={2} style={styles.heroCard}><Text style={styles.heroKicker}>INTEGRIERTES REVENUE-OS</Text><Text style={styles.heroTitle}>Alle Umsatzsysteme an einem Ort.</Text><Text style={styles.heroText}>Die bisher getrennte Revenue-OS-Funktion ist jetzt im Control Center sichtbar. Nutze die Bereichs-Tabs oben, um Personas, HARA, SaaS, Loops und Paper-Trading zu öffnen.</Text></GlassCard>
          {section === "influencer" ? <InfluencerSection /> : null}
          {section === "hara" ? <HaraSection /> : null}
          {section === "saas" ? <SaaSSection /> : null}
          {section === "loop" ? <LoopSection /> : null}
          {section === "trading" ? <TradingSection /> : null}
        </ScrollView>
      </ScreenContainer>
      <NavDrawer {...navDrawer.drawerProps} />
    </GlassBackdrop>
  );
}

const styles = StyleSheet.create({
  topBar: { alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  titleBlock: { flex: 1 },
  eyebrow: { color: glassPalette.cyan, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  title: { color: glassSurface.textPrimary, fontSize: 23, fontWeight: "900", marginTop: 2 },
  sectionRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  sectionButton: { alignItems: "center", borderColor: glassSurface.border, borderRadius: 14, borderWidth: 1, minWidth: 92, paddingHorizontal: 12, paddingVertical: 9 },
  sectionIcon: { fontSize: 18, fontWeight: "900" },
  sectionLabel: { color: glassSurface.textSecondary, fontSize: 11, fontWeight: "800", marginTop: 4 },
  content: { gap: 14, padding: 16, paddingBottom: 40 },
  heroCard: { paddingVertical: 20 },
  heroKicker: { color: glassPalette.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  heroTitle: { color: glassSurface.textPrimary, fontSize: 24, fontWeight: "900", lineHeight: 29, marginTop: 8 },
  heroText: { color: glassSurface.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 8 },
  sectionHeading: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  headingCopy: { flex: 1 },
  sectionTitle: { color: glassSurface.textPrimary, fontSize: 18, fontWeight: "900" },
  sectionDescription: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 },
  personaRow: { gap: 10, paddingVertical: 4 },
  personaCard: { minHeight: 170, padding: 14, width: 168 },
  personaName: { color: glassSurface.textPrimary, fontSize: 20, fontWeight: "900", marginTop: 10 },
  personaNiche: { fontSize: 12, fontWeight: "800", marginTop: 3 },
  personaTone: { color: glassSurface.textSecondary, fontSize: 11, marginTop: 8 },
  personaStatus: { color: glassSurface.textMuted, fontSize: 10, lineHeight: 14, marginTop: 12 },
  detailCard: { gap: 10 },
  detailTitle: { color: glassSurface.textPrimary, fontSize: 16, fontWeight: "900" },
  detailText: { color: glassSurface.textSecondary, fontSize: 13, lineHeight: 20 },
  featureCard: { gap: 16 },
  featureHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  featureTitle: { color: glassSurface.textPrimary, fontSize: 21, fontWeight: "900" },
  featureSubtitle: { color: glassSurface.textSecondary, fontSize: 12, marginTop: 2 },
  metricRow: { flexDirection: "row", gap: 8 },
  metric: { backgroundColor: `${glassSurface.border}55`, borderRadius: 12, flex: 1, padding: 10 },
  metricValue: { color: glassSurface.textPrimary, fontSize: 16, fontWeight: "900" },
  metricLabel: { color: glassSurface.textMuted, fontSize: 10, marginTop: 3 },
  loopRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  loopStep: { alignItems: "center", flex: 1, gap: 4 },
  loopStepDot: { color: glassPalette.blue, fontSize: 14 },
  loopStepText: { color: glassSurface.textSecondary, fontSize: 10, fontWeight: "800" },
  loopArrow: { color: glassPalette.blue, fontSize: 24 },
});
