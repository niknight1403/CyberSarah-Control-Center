import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { StudioHeader, StudioSection } from "@/components/studio/primitives";
import { useColors } from "@/hooks/use-colors";
import { useAdminAutonomousAgent } from "@/lib/use-admin-autonomous-agent";
import { AdminLiveStatusCard } from "@/components/studio/admin-live-status-card";
import { trpc } from "@/lib/trpc";
import {
  canAccess,
  ROLE_TIER_LABELS,
  resolveAccessTier,
  TIER_QUOTA_CAPS,
  applyAdminQuotaOverride,
  type QuotaCaps,
} from "@/lib/access-control-logic";

/**
 * Sprint 81 — Admin-Dashboard: Subscription-Verwaltung, Token-Quota-Overrides
 * und Key-Pool-Konfiguration. Der Zugang ist server-seitig ueber die Admin-
 * Rolle geprueft (enforceServerAccess); hier wird die Rolle nur angezeigt,
 * nicht verhandelt.
 */
export default function AdminDashboardScreen() {
  const colors = useColors();
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const agentState = useAdminAutonomousAgent(accountQuery.data ?? null);
  const role = accountQuery.data?.role ?? null;
  const subscriptionTier = (accountQuery.data as { tier?: "lite" | "pro" | "expert" | null } | undefined)?.tier ?? null;
  const isAdmin = role === "admin";

  const tier = resolveAccessTier({ subscriptionTier, isAdmin });
  const dashboardAccess = canAccess("admin.dashboard", tier, { isAdmin });
  const baseCaps = TIER_QUOTA_CAPS[tier];

  const [tokenQuotaOverride, setTokenQuotaOverride] = useState("");
  const [maxKeys, setMaxKeys] = useState("");
  const [savedOverrides, setSavedOverrides] = useState<Partial<Record<keyof QuotaCaps, number>>>({});

  const effectiveCaps = useMemo(
    () => applyAdminQuotaOverride(baseCaps, savedOverrides, { isAdmin }),
    [baseCaps, savedOverrides, isAdmin],
  );

  if (!dashboardAccess.allowed) {
    return (
      <ScreenContainer>
        <StudioHeader eyebrow="Verwaltung" title="Admin-Dashboard" />
        <View style={[styles.lockCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="lock.fill" size={24} color={colors.muted} />
          <Text style={[styles.lockText, { color: colors.muted }]}>
            {dashboardAccess.reason} — dieser Bereich ist der Admin-Rolle vorbehalten.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const saveOverrides = () => {
    const overrides: Partial<Record<keyof QuotaCaps, number>> = {};
    const tokens = Number.parseInt(tokenQuotaOverride.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(tokens) && tokens > 0) overrides.maxTokensPerDay = tokens;
    const keys = Number.parseInt(maxKeys, 10);
    if (Number.isFinite(keys) && keys >= 0) overrides.maxCustomProviderKeys = keys;
    if (Object.keys(overrides).length === 0) {
      Alert.alert("Keine Overrides", "Bitte gültige Werte eingeben.");
      return;
    }
    setSavedOverrides(overrides);
    Alert.alert(
      "Overrides gesetzt",
      "Quota-Overrides gelten ab der nächsten Abfrage — gesenkt werden Caps nie (reine Anhebung).",
    );
  };

  const capRow = (label: string, value: string) => (
    <View key={label} style={[styles.capRow, { borderColor: colors.border }]}>
      <Text style={[styles.capLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.capValue, { color: colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <ScreenContainer>
      <StudioHeader eyebrow="Verwaltung" title="Admin-Dashboard" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <StudioSection label="Live" title="Backend-Live-Status" />
        <AdminLiveStatusCard isAdmin={isAdmin} />

        <StudioSection label="Autonomie" title="Autonomer System-Agent" />
        <View style={[styles.agentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.agentStatusRow}>
            <View
              accessibilityLabel={`Systemstatus: ${agentState.status}`}
              style={[
                styles.agentStatusDot,
                { backgroundColor: agentState.status === "red" ? "#FF007F" : agentState.status === "healing" ? "#F5A623" : "#00F2FE" },
              ]}
            />
            <Text style={[styles.agentStatusText, { color: colors.text }]}>
              {agentState.status === "red"
                ? "Kritisch — Agent arbeitet autonom an der Behebung"
                : agentState.status === "healing"
                  ? "Heilung läuft — Agent führt Maßnahmen aus"
                  : "Alles grün — keine offenen Incidents"}
            </Text>
          </View>
          <Text style={[styles.agentMeta, { color: colors.muted }]}>
            Offen: {agentState.openCount} · Kritisch: {agentState.criticalCount} · Auto-Redeploy:{" "}
            {agentState.autoRedeployEnabled ? "aktiv" : "inaktiv"} · Letzter Scan:{" "}
            {agentState.lastScanAt != null ? new Date(agentState.lastScanAt).toLocaleTimeString("de-DE") : "—"}
          </Text>
          {agentState.log.slice(0, 3).map((entry) => (
            <Text key={`${entry.at}-${entry.kind}`} style={[styles.agentLog, { color: colors.muted }]} numberOfLines={1}>
              · [{entry.kind}] {entry.reason}
            </Text>
          ))}
          <Text style={[styles.agentMeta, { color: colors.muted }]}>
            Der Agent scannt alle 60 s, analysiert Fehler, behebt autonom und bringt das System selbst auf grün — manuelle Einstellungen sind nicht nötig.
          </Text>
        </View>

        <StudioSection label="Abo" title="Subscription-Verwaltung" />
        <View style={[styles.tierCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.tierName, { color: colors.tint }]}>{ROLE_TIER_LABELS[tier]}</Text>
          <Text style={[styles.tierDetail, { color: colors.muted }]}>
            Rolle: {role ?? "unbekannt"} · Abo-Tier: {subscriptionTier ?? "keins"}
          </Text>
        </View>

        <StudioSection label="Caps" title="Token-Quota & Caps" />
        <View>
          {capRow("Tokens pro Tag", formatCap(effectiveCaps.maxTokensPerDay))}
          {capRow("Agent-Iterationen (max)", formatCap(effectiveCaps.maxAgentIterations))}
          {capRow("Eigene Provider-Keys (max)", formatCap(effectiveCaps.maxCustomProviderKeys))}
          {capRow("MCP-Connectoren (max)", formatCap(effectiveCaps.maxMcpConnectors))}
          {capRow("Anfragen pro Minute", formatCap(effectiveCaps.requestsPerMinute))}
        </View>

        <StudioSection label="Overrides" title="Quota-Overrides (nur anheben)" />
          <TextInput
            accessibilityLabel="Token-Quota-Override"
            keyboardType="number-pad"
            placeholder="z. B. 2000000 Tokens/Tag"
            placeholderTextColor={colors.muted}
            value={tokenQuotaOverride}
            onChangeText={setTokenQuotaOverride}
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
          />
          <TextInput
            accessibilityLabel="Key-Pool-Größen-Override"
            keyboardType="number-pad"
            placeholder="z. B. 8 eigene Keys"
            placeholderTextColor={colors.muted}
            value={maxKeys}
            onChangeText={setMaxKeys}
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Overrides übernehmen"
            onPress={saveOverrides}
            style={[styles.saveButton, { backgroundColor: colors.tint }]}
          >
            <Text style={[styles.saveButtonText, { color: colors.background }]}>Overrides übernehmen</Text>
          </TouchableOpacity>

        <StudioSection label="Navigation" title="Zurück" />
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.back()}
            style={[styles.backButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.backButtonText, { color: colors.tint }]}>Zurück</Text>
          </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

function formatCap(value: number): string {
  if (value >= Number.MAX_SAFE_INTEGER) return "unbegrenzt";
  return value.toLocaleString("de-DE");
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 40 },
  lockCard: { alignItems: "center", borderRadius: 12, borderWidth: 1, gap: 8, padding: 24 },
  agentCard: { borderRadius: 12, borderWidth: 1, gap: 8, padding: 14 },
  agentStatusRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  agentStatusDot: { borderRadius: 5, height: 10, width: 10 },
  agentStatusText: { fontSize: 14, fontWeight: "700" },
  agentMeta: { fontSize: 12 },
  agentLog: { fontSize: 11, opacity: 0.9 },
  lockText: { fontSize: 13, textAlign: "center" },
  tierCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  tierName: { fontSize: 18, fontWeight: "800" },
  tierDetail: { fontSize: 12, marginTop: 4 },
  capRow: { borderBottomWidth: 0.5, flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  capLabel: { fontSize: 12 },
  capValue: { fontSize: 12, fontWeight: "700" },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  saveButton: { borderRadius: 10, alignItems: "center", marginTop: 8, paddingVertical: 12 },
  saveButtonText: { fontWeight: "800" },
  backButton: { borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: "center" },
  backButtonText: { fontWeight: "700" },
});
