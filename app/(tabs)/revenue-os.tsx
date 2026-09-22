import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { AiCore } from "@/components/glass/ai-core";
import { GlassCard, GlowButton, StatusChip } from "@/components/glass/glass-primitives";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";
import { INFLUENCER_PERSONAS, type InfluencerPersonaId, type InfluencerPlatform } from "@/lib/influencer-persona-logic";
import { trpc } from "@/lib/trpc";

type Section = "influencer" | "hara" | "saas" | "loop" | "trading";
type Accent = "cyan" | "purple" | "magenta" | "blue" | "green" | "amber";

const PERSONA_ACCENTS: Record<InfluencerPersonaId, Accent> = {
  nova: "cyan", mira: "purple", juno: "magenta", lina: "blue", kaya: "green", zara: "amber",
};

const SECTIONS: { key: Section; label: string; icon: string; accent: "cyan" | "purple" | "magenta" | "blue" | "green" }[] = [
  { key: "influencer", label: "6 Personas", icon: "✦", accent: "cyan" },
  { key: "hara", label: "HARA", icon: "⚡", accent: "purple" },
  { key: "saas", label: "SaaS", icon: "▦", accent: "magenta" },
  { key: "loop", label: "Loop Revenue", icon: "↻", accent: "blue" },
  { key: "trading", label: "Micro Trading", icon: "⌁", accent: "green" },
];

const PLATFORMS: { value: InfluencerPlatform; label: string }[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "x", label: "X" },
  { value: "threads", label: "Threads" },
];

function SectionButton({ item, active, onPress }: { item: (typeof SECTIONS)[number]; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.sectionButton, active && { borderColor: glassPalette[item.accent], backgroundColor: `${glassPalette[item.accent]}20` }]}><Text style={[styles.sectionIcon, { color: active ? glassPalette[item.accent] : glassSurface.textMuted }]}>{item.icon}</Text><Text style={[styles.sectionLabel, active && { color: glassPalette[item.accent] }]}>{item.label}</Text></Pressable>;
}

function InfluencerSection() {
  const [selectedId, setSelectedId] = useState<InfluencerPersonaId>("nova");
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState<InfluencerPlatform>("linkedin");
  const [generatedContent, setGeneratedContent] = useState("");
  const generateMutation = trpc.influencer.generate.useMutation({
    onSuccess: (result) => setGeneratedContent(result.content),
  });
  const selected = INFLUENCER_PERSONAS.find((persona) => persona.id === selectedId) ?? INFLUENCER_PERSONAS[0];
  const accent = PERSONA_ACCENTS[selected.id];

  return <>
    <View style={styles.sectionHeading}><View style={styles.headingCopy}><Text style={styles.sectionTitle}>KI-Influencer-Persönlichkeiten</Text><Text style={styles.sectionDescription}>Persona wählen, Thema eingeben und direkt einen Content-Entwurf generieren.</Text></View><StatusChip label="6 verfügbar" accent="green" live /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.personaRow}>
      {INFLUENCER_PERSONAS.map((persona) => {
        const personaAccent = PERSONA_ACCENTS[persona.id];
        const isSelected = persona.id === selectedId;
        return <GlassCard key={persona.id} accent={personaAccent} glow={isSelected ? 2 : 1} style={{ ...styles.personaCard, ...(isSelected ? { borderColor: glassPalette[personaAccent], borderWidth: 2 } : {}) }} testID={`persona-${persona.id}`} onPress={() => { setSelectedId(persona.id); setGeneratedContent(""); }}>
          <AiCore state={isSelected ? "thinking" : "idle"} size={30} /><Text style={styles.personaName}>{persona.name}</Text><Text style={[styles.personaNiche, { color: glassPalette[personaAccent] }]}>{persona.niche}</Text><Text style={styles.personaTone}>{persona.tonality} · Persona</Text><Text style={styles.personaStatus}>{isSelected ? "Ausgewählt · bereit" : "Tippen zum Auswählen"}</Text>
        </GlassCard>;
      })}
    </ScrollView>
    <GlassCard accent={accent} style={styles.formCard}>
      <View style={styles.formHeader}><View style={styles.headingCopy}><Text style={styles.detailTitle}>{selected.name} generiert Content</Text><Text style={styles.detailText}>{selected.niche} · {selected.tonality}</Text></View><StatusChip label="ausgewählt" accent={accent} /></View>
      <Text style={styles.inputLabel}>Thema oder Kampagnenbriefing</Text>
      <TextInput value={topic} onChangeText={setTopic} placeholder="z. B. 3 Wege, wie KI kleine Teams produktiver macht" placeholderTextColor={glassSurface.textMuted} multiline maxLength={500} style={styles.topicInput} accessibilityLabel="Thema für Content-Generierung" />
      <Text style={styles.inputLabel}>Plattform</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformRow}>{PLATFORMS.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: item.value === platform }} onPress={() => setPlatform(item.value)} style={[styles.platformPill, item.value === platform && { borderColor: glassPalette[accent], backgroundColor: `${glassPalette[accent]}22` }]}><Text style={[styles.platformText, item.value === platform && { color: glassPalette[accent] }]}>{item.label}</Text></Pressable>)}</ScrollView>
      {generateMutation.error ? <Text style={styles.errorText}>{generateMutation.error.message}</Text> : null}
      <GlowButton label={generateMutation.isPending ? "Generierung läuft …" : `${selected.name}-Content generieren`} accent={accent} onPress={() => { if (topic.trim().length >= 3) generateMutation.mutate({ personaId: selected.id, topic: topic.trim(), platform }); }} disabled={generateMutation.isPending || topic.trim().length < 3} />
      {generatedContent ? <View style={styles.resultBox}><View style={styles.resultHeader}><Text style={styles.resultTitle}>Generierter Entwurf</Text><StatusChip label="Entwurf" accent="green" /></View><Text selectable style={styles.resultText}>{generatedContent}</Text><Text style={styles.resultNote}>Noch nicht veröffentlicht. Veröffentlichung bleibt ein separater Freigabeschritt.</Text></View> : null}
    </GlassCard>
  </>;
}

function FeatureCard({ accent, title, subtitle, body, cta, metrics }: { accent: Accent; title: string; subtitle: string; body: string; cta: string; metrics: [string, string][] }) {
  return <GlassCard accent={accent} glow={1} style={styles.featureCard}><View style={styles.featureHeader}><AiCore state="idle" size={34} /><View style={styles.headingCopy}><Text style={styles.featureTitle}>{title}</Text><Text style={styles.featureSubtitle}>{subtitle}</Text></View><StatusChip label="bereit" accent="green" /></View><Text style={styles.detailText}>{body}</Text><View style={styles.metricRow}>{metrics.map(([label, value]) => <View key={label} style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>)}</View><GlowButton label={cta} accent={accent} variant="secondary" onPress={() => undefined} /></GlassCard>;
}

function OtherSection({ section }: { section: Exclude<Section, "influencer"> }) {
  if (section === "hara") return <FeatureCard accent="purple" title="HARA" subtitle="Hyper-Autonomer Revenue Agent" body="Findet Revenue-Chancen, priorisiert Cross-Sell-Ideen und erstellt Kampagnenentwürfe zur Freigabe." cta="HARA-Konsole öffnen" metrics={[["Chancen", "12"], ["Kampagnen", "4"], ["Nächster Lauf", "09:00"]]} />;
  if (section === "saas") return <FeatureCard accent="magenta" title="SaaS-System" subtitle="Produkte, Funnels und Subscriptions" body="Verwalte Produktideen, Pricing-Experimente, Trial-to-Paid-Funnel und aktive Subscriptions." cta="SaaS-Workspace öffnen" metrics={[["Produkte", "8"], ["Trials", "26"], ["MRR-Entwurf", "€ 2.480"]]} />;
  if (section === "loop") return <FeatureCard accent="blue" title="Loop Engineering" subtitle="Umsatzschleifen systematisch bauen" body="Mappe Content → Lead → Produkt → Retention → Referral. Jede Schleife erhält Hypothese und Messgröße." cta="Revenue-Loops planen" metrics={[["Loops", "4"], ["Hypothesen", "11"], ["Aktive Tests", "3"]]} />;
  return <FeatureCard accent="green" title="Micro Trading" subtitle="Analyse und Paper-Simulation" body="Marktbeobachtung, Signale und Backtests bleiben auf Analyse und Paper-Simulation beschränkt. Keine Broker-Anbindung und keine Orderausführung." cta="Trading-Analyse öffnen" metrics={[["Watchlist", "6"], ["Paper-Signale", "3"], ["Risiko", "simuliert"]]} />;
}

export default function RevenueOsScreen() {
  const [section, setSection] = useState<Section>("influencer");
  const navDrawer = useNavDrawer();
  const active = useMemo(() => SECTIONS.find((item) => item.key === section) ?? SECTIONS[0], [section]);
  return <GlassBackdrop accent={active.accent}><ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent"><View style={styles.topBar}><NavDrawerButton {...navDrawer.hamburgerProps} tint={glassPalette.cyan} /><View style={styles.titleBlock}><Text style={styles.eyebrow}>CYBERSARAH · REVENUE OS</Text><Text style={styles.title}>Revenue Hub</Text></View><StatusChip label="verbunden" accent="green" live /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionRow} accessibilityLabel="Revenue-OS-Bereiche">{SECTIONS.map((item) => <SectionButton key={item.key} item={item} active={item.key === section} onPress={() => setSection(item.key)} />)}</ScrollView><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><GlassCard accent={active.accent} glow={2} style={styles.heroCard}><Text style={styles.heroKicker}>INTEGRIERTES REVENUE-OS</Text><Text style={styles.heroTitle}>Alle Umsatzsysteme an einem Ort.</Text><Text style={styles.heroText}>Persona auswählen, Briefing eingeben und Content sicher als Entwurf generieren.</Text></GlassCard>{section === "influencer" ? <InfluencerSection /> : <OtherSection section={section} />}</ScrollView></ScreenContainer><NavDrawer {...navDrawer.drawerProps} /></GlassBackdrop>;
}

const styles = StyleSheet.create({
  topBar: { alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }, titleBlock: { flex: 1 }, eyebrow: { color: glassPalette.cyan, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 }, title: { color: glassSurface.textPrimary, fontSize: 23, fontWeight: "900", marginTop: 2 }, sectionRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 }, sectionButton: { alignItems: "center", borderColor: glassSurface.border, borderRadius: 14, borderWidth: 1, minWidth: 92, paddingHorizontal: 12, paddingVertical: 9 }, sectionIcon: { fontSize: 18, fontWeight: "900" }, sectionLabel: { color: glassSurface.textSecondary, fontSize: 11, fontWeight: "800", marginTop: 4 }, content: { gap: 14, padding: 16, paddingBottom: 40 }, heroCard: { paddingVertical: 20 }, heroKicker: { color: glassPalette.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }, heroTitle: { color: glassSurface.textPrimary, fontSize: 24, fontWeight: "900", lineHeight: 29, marginTop: 8 }, heroText: { color: glassSurface.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 8 }, sectionHeading: { alignItems: "flex-start", flexDirection: "row", gap: 10 }, headingCopy: { flex: 1 }, sectionTitle: { color: glassSurface.textPrimary, fontSize: 18, fontWeight: "900" }, sectionDescription: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 }, personaRow: { gap: 10, paddingVertical: 4 }, personaCard: { minHeight: 170, padding: 14, width: 168 }, personaName: { color: glassSurface.textPrimary, fontSize: 20, fontWeight: "900", marginTop: 10 }, personaNiche: { fontSize: 12, fontWeight: "800", marginTop: 3 }, personaTone: { color: glassSurface.textSecondary, fontSize: 11, marginTop: 8 }, personaStatus: { color: glassSurface.textMuted, fontSize: 10, lineHeight: 14, marginTop: 12 }, formCard: { gap: 12 }, formHeader: { alignItems: "center", flexDirection: "row", gap: 10 }, detailTitle: { color: glassSurface.textPrimary, fontSize: 16, fontWeight: "900" }, detailText: { color: glassSurface.textSecondary, fontSize: 13, lineHeight: 20 }, inputLabel: { color: glassSurface.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 }, topicInput: { backgroundColor: `${glassSurface.border}55`, borderColor: glassSurface.border, borderRadius: 12, borderWidth: 1, color: glassSurface.textPrimary, fontSize: 14, minHeight: 86, padding: 12, textAlignVertical: "top" }, platformRow: { gap: 8 }, platformPill: { borderColor: glassSurface.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 }, platformText: { color: glassSurface.textSecondary, fontSize: 11, fontWeight: "800" }, errorText: { color: glassPalette.red, fontSize: 12 }, resultBox: { backgroundColor: `${glassPalette.green}10`, borderColor: `${glassPalette.green}55`, borderRadius: 12, borderWidth: 1, gap: 8, padding: 12 }, resultHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, resultTitle: { color: glassPalette.green, fontSize: 14, fontWeight: "900" }, resultText: { color: glassSurface.textPrimary, fontSize: 14, lineHeight: 21 }, resultNote: { color: glassSurface.textMuted, fontSize: 10 }, featureCard: { gap: 16 }, featureHeader: { alignItems: "center", flexDirection: "row", gap: 12 }, featureTitle: { color: glassSurface.textPrimary, fontSize: 21, fontWeight: "900" }, featureSubtitle: { color: glassSurface.textSecondary, fontSize: 12, marginTop: 2 }, metricRow: { flexDirection: "row", gap: 8 }, metric: { backgroundColor: `${glassSurface.border}55`, borderRadius: 12, flex: 1, padding: 10 }, metricValue: { color: glassSurface.textPrimary, fontSize: 16, fontWeight: "900" }, metricLabel: { color: glassSurface.textMuted, fontSize: 10, marginTop: 3 },
});
