import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard } from "@/components/glass/glass-primitives";
import { NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { trpc } from "@/lib/trpc";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

const money = (cents: number | null): string =>
  cents === null ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

type BusyKey = string | null;
export default function CommerceStudioScreen() {
  const drawer = useNavDrawer();
  const styles = useMemo(() => makeStyles(), []);
  const [busyKey, setBusyKey] = useState<BusyKey>(null);
  const [feedback, setFeedback] = useState("");
  const dashboard = trpc.commerceStudio.overview.useQuery({ days: 30 }, { retry: false });
  const bundle = trpc.commerceStudio.createBundle.useMutation();
  const price = trpc.commerceStudio.proposePriceTest.useMutation();
  const run = trpc.commerceStudio.runNow.useMutation();
  const importer = trpc.commerceStudio.importStripe.useMutation();
  const data = dashboard.data;
  async function execute(key: string, action: () => Promise<{ generated?: boolean; reason?: string }>) {
    setBusyKey(key);
    setFeedback("");
    try {
      const result = await action();
      setFeedback(result.reason ?? (result.generated ? "Entwurf in der Freigabe-Queue." : "Aktion abgeschlossen."));
      await dashboard.refetch();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Anfrage konnte nicht abgeschlossen werden.");
    } finally {
      setBusyKey(null);
    }
  }
  const pricePlan = (offerId: number) => data?.pricePlans.find(row => row.offerId === offerId)?.plan;
  return (
    <GlassBackdrop accent="cyan">
      <ScreenContainer containerClassName="bg-transparent" edges={["top", "left", "right"]}>
        <View style={styles.topbar}>
          <NavDrawerButton {...drawer.hamburgerProps} tint={glassPalette.cyan} />
          <View style={styles.headings}>
            <Text style={styles.eyebrow}>CYBERSARAH · REVENUE INTELLIGENCE</Text>
            <Text style={styles.title}>Commerce Studio</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <GlassCard accent="cyan" style={styles.hero}>
            <Text style={styles.eyebrow}>AUTOPILOT · ENTWURF & ANALYSE</Text>
            <Text style={styles.heroTitle}>Von Produkten zu Kampagnen.</Text>
            <Text style={styles.body}>
              Produktkarte, Reel-Skript und Landingpage aus einem Angebot erstellen.
              Umsatz, Kosten, Conversion und Preisoptionen gemeinsam analysieren.
            </Text>
            <Text style={styles.note}>
              Preisänderungen, Veröffentlichungen und Ausgaben bleiben gesperrt.
              Alle Inhalte landen zuerst in der Freigabe.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busyKey !== null}
              style={[styles.primaryButton, busyKey !== null && styles.disabled]}
              onPress={() => void execute("run", async () => {
                const value = await run.mutateAsync({ maxOffers: 2 });
                return { generated: value.generated > 0, reason:
                  value.generated + " Pakete erzeugt · " + value.created.map(v => v.reason).join(" · ") };
              })}
            >
              {busyKey === "run" ? <ActivityIndicator color="#FFFFFF" /> :
                <Text style={styles.primaryButtonText}>✦  AUTOPILOT JETZT STARTEN</Text>}
            </Pressable>
          </GlassCard>
          <Pressable
            accessibilityRole="button"
            disabled={busyKey !== null}
            style={[styles.outlineButton, busyKey !== null && styles.disabled]}
            onPress={() => void execute("import", async () => {
              const result = await importer.mutateAsync();
              return { generated: result.imported > 0, reason:
                result.imported + " Produkte als unveroeffentlichte Entwuerfe importiert; " +
                result.skipped + " bereits vorhanden. " +
                (result.remainingPages ? "Weitere Produkte folgen in einem spaeteren Import." : "") +
                (result.status === "not-configured" ? " Stripe nicht konfiguriert." : "") };
            })}
          >
            <Text style={styles.outlineText}>↧  STRIPE-PRODUKTE ALS ENTWURF IMPORTIEREN</Text>
          </Pressable>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data?.offers.length ?? "—"}</Text>
              <Text style={styles.statLabel}>PRODUKTE</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data?.pendingStudioDrafts ?? "—"}</Text>
              <Text style={styles.statLabel}>FREIGABEN</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data?.externalActionsExecuted ?? 0}</Text>
              <Text style={styles.statLabel}>EXTERNE AKTIONEN</Text>
            </View>
          </View>
          {feedback ? <View style={styles.feedback}><Text style={styles.feedbackText}>{feedback}</Text></View> : null}
          {dashboard.isLoading ? <ActivityIndicator color={glassPalette.cyan} /> : null}
          {dashboard.error ? <View style={styles.feedback}>
            <Text style={styles.error}>Daten konnten nicht geladen werden: {dashboard.error.message}</Text>
            <Pressable onPress={() => void dashboard.refetch()}><Text style={styles.link}>Erneut prüfen</Text></Pressable>
          </View> : null}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Produkte & Gewinnpotenzial</Text>
            <Pressable onPress={() => void dashboard.refetch()} accessibilityRole="button">
              <Text style={styles.link}>Aktualisieren ↻</Text>
            </Pressable>
          </View>
          {data && data.offers.length === 0 ? <GlassCard accent="blue">
            <Text style={styles.cardTitle}>Noch keine Produkte</Text>
            <Text style={styles.body}>Lege zuerst in Revenue OS ein Produktangebot an. Danach kann der Autopilot Content-Pakete erstellen.</Text>
          </GlassCard> : null}
          {data?.offers.map(offer => {
            const plan = pricePlan(offer.id);
            return (
              <GlassCard key={offer.id} accent="cyan" style={styles.offerCard}>
                <View style={styles.offerTitleRow}>
                  <Text style={styles.cardTitle}>{offer.name}</Text>
                  <Text style={styles.price}>{money(offer.priceCents)}</Text>
                </View>
                <Text style={styles.meta}>#{offer.id} · {offer.status.toUpperCase()} · Evidenz: {offer.evidence}</Text>
                <View style={styles.metrics}>
                  <View><Text style={styles.value}>{offer.clicks}</Text><Text style={styles.statLabel}>KLICKS</Text></View>
                  <View><Text style={styles.value}>{offer.purchases}</Text><Text style={styles.statLabel}>KÄUFE</Text></View>
                  <View><Text style={styles.value}>{money(offer.contributionCents)}</Text><Text style={styles.statLabel}>DECKUNGSBEITRAG*</Text></View>
                </View>
                <Text style={styles.body}>{offer.reason}</Text>
                <View style={styles.separator} />
                <Text style={styles.miniTitle}>PREIS-INTELLIGENZ</Text>
                <Text style={styles.body}>{plan?.reason ?? "Analyse noch nicht verfügbar."}</Text>
                {plan?.scenarios.length ? <Text style={styles.scenarios}>
                  Szenarien: {plan.scenarios.map(item => money(item.priceCents)).join("  ·  ")}
                </Text> : null}
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button" disabled={busyKey !== null}
                    style={[styles.actionButton, busyKey !== null && styles.disabled]}
                    onPress={() => void execute("bundle:" + offer.id,
                      () => bundle.mutateAsync({ offerId: offer.id, audience: "deutschsprachige Zielgruppe" }))}
                  >
                    <Text style={styles.actionText}>{busyKey === "bundle:" + offer.id ? "Erstelle …" : "Reel + Landing + Produkt"}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button" disabled={busyKey !== null || plan?.mode !== "experiment-proposal"}
                    style={[styles.outlineButton, (busyKey !== null || plan?.mode !== "experiment-proposal") && styles.disabled]}
                    onPress={() => void execute("price:" + offer.id,
                      () => price.mutateAsync({ offerId: offer.id }))}
                  >
                    <Text style={styles.outlineText}>Preistest vorschlagen</Text>
                  </Pressable>
                </View>
              </GlassCard>
            );
          })}
          <Text style={styles.footer}>
            *Nur zugeordnete Transaktionen und erfasste Kosten. Unbekannte Kosten werden nicht als 0 gezählt.
            Preise sind Simulationen ohne garantierte Conversion-Rate. Bestehende Freigaben: Revenue OS / Entwürfe.
          </Text>
        </ScrollView>
      </ScreenContainer>
    </GlassBackdrop>
  );
}
function makeStyles() {
  return StyleSheet.create({
    topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
    headings: { flex: 1 },
    eyebrow: { color: glassPalette.cyan, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
    title: { color: glassSurface.textPrimary, fontSize: 23, fontWeight: "800", marginTop: 3 },
    scroll: { paddingHorizontal: 15, gap: 15, paddingBottom: 105 },
    hero: { padding: 19, gap: 12 },
    heroTitle: { fontSize: 25, fontWeight: "800", color: glassSurface.textPrimary },
    body: { color: glassSurface.textSecondary, fontSize: 13, lineHeight: 20 },
    note: { color: glassPalette.cyan, fontSize: 12, lineHeight: 18 },
    primaryButton: { backgroundColor: glassPalette.cyan, paddingVertical: 15, paddingHorizontal: 12, borderRadius: 14, alignItems: "center", minHeight: 50 },
    primaryButtonText: { color: "#071626", fontSize: 13, fontWeight: "800" },
    statsRow: { flexDirection: "row", gap: 8 },
    stat: { flex: 1, borderWidth: 1, borderColor: glassSurface.border, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 9, backgroundColor: glassSurface.card },
    statValue: { color: glassSurface.textPrimary, fontSize: 23, fontWeight: "800" },
    statLabel: { color: glassSurface.textSecondary, fontSize: 9, marginTop: 4, letterSpacing: 0.3 },
    feedback: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: glassSurface.border, backgroundColor: glassSurface.card },
    feedbackText: { color: glassSurface.textPrimary, fontSize: 12, lineHeight: 18 },
    error: { color: glassPalette.red, fontSize: 12 },
    link: { color: glassPalette.cyan, fontSize: 12, fontWeight: "700" },
    sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    sectionTitle: { flex: 1, color: glassSurface.textPrimary, fontSize: 17, fontWeight: "800" },
    offerCard: { padding: 16, gap: 11 },
    offerTitleRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    cardTitle: { color: glassSurface.textPrimary, fontSize: 17, fontWeight: "800", flex: 1 },
    price: { color: glassPalette.cyan, fontSize: 15, fontWeight: "800" },
    meta: { color: glassSurface.textSecondary, fontSize: 10 },
    metrics: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    value: { color: glassSurface.textPrimary, fontWeight: "800", fontSize: 16 },
    separator: { height: 1, backgroundColor: glassSurface.border },
    miniTitle: { color: glassPalette.cyan, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
    scenarios: { color: glassSurface.textPrimary, fontSize: 12, fontWeight: "600" },
    actions: { gap: 8 },
    actionButton: { backgroundColor: glassPalette.cyan, minHeight: 44, borderRadius: 12, justifyContent: "center", alignItems: "center", padding: 10 },
    actionText: { color: "#061A22", fontWeight: "800", fontSize: 12 },
    outlineButton: { borderColor: glassPalette.cyan, borderWidth: 1, minHeight: 44, borderRadius: 12, justifyContent: "center", alignItems: "center", padding: 10 },
    outlineText: { color: glassPalette.cyan, fontWeight: "700", fontSize: 12 },
    disabled: { opacity: 0.4 },
    footer: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 18 },
  });
}
