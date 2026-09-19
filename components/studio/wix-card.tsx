/**
 * Sprint 187 — Admin-Karte „Wix-API".
 *
 * Server-gated (wix-Router ist admin-gated): zeigt den ehrlichen
 * Konfigurations-Status (Token maskiert, Konto, Site-ID), erlaubt das
 * Setzen der Site-ID zur Laufzeit (KV, ohne Redeploy) und ruft die
 * read-only-Endpunkte Site-Liste, Site-Properties und Orders ab.
 * Fehler erscheinen klassifiziert mit konkretem nächsten Schritt.
 */
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type WixStatus = {
  state: "not_configured" | "site_id_missing" | "site_id_invalid" | "ready";
  tokenConfigured: boolean;
  tokenMasked: string | null;
  accountId: string | null;
  siteId: string | null;
  nextStep: string;
};

const STATE_LABEL: Record<string, string> = {
  not_configured: "Nicht konfiguriert",
  site_id_missing: "Site-ID fehlt",
  site_id_invalid: "Site-ID ungültig",
  ready: "Bereit",
};

export function WixCard({ isAdmin }: { isAdmin: boolean }) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [siteIdInput, setSiteIdInput] = useState("");

  const statusQuery = trpc.wix.status.useQuery(undefined, { enabled: isAdmin, retry: false });
  const setSiteId = trpc.wix.setSiteId.useMutation();
  const sites = trpc.wix.sites.useMutation();
  const properties = trpc.wix.siteProperties.useMutation();
  const orders = trpc.wix.orders.useMutation();

  const refresh = () => void statusQuery.refetch();

  const runAction = async (action: () => Promise<unknown>, title: string) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert(title, error instanceof Error ? error.message : "Unbekannter Fehler.");
    } finally {
      setBusy(false);
    }
  };

  const saveSiteId = async (siteId: string) => {
    setBusy(true);
    try {
      await setSiteId.mutateAsync({ siteId });
      setSiteIdInput("");
      refresh();
      Alert.alert("Site-ID gespeichert", "Die Wix-Site ist ab jetzt für Properties und Orders aktiv.");
    } catch (error) {
      Alert.alert("Site-ID ungültig", error instanceof Error ? error.message : "Unbekannter Fehler.");
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) return null;
  const status = statusQuery.data as WixStatus | undefined;
  const siteRows = (sites.data ?? []) as { id: string; displayName: string | null; domain: string | null; published: boolean | null }[];
  const props = properties.data as
    | { businessName: string | null; siteName: string | null; language: string | null; currency: string | null; timeZone: string | null; email: string | null; phone: string | null }
    | undefined;
  const orderRows = (orders.data?.orders ?? []) as { id: string; number: number | null; createdDate: string | null; status: string | null; buyerEmail: string | null; currency: string | null; totalAmount: number | null }[];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Wix-API</Text>
        {statusQuery.isFetching ? <ActivityIndicator size="small" color={colors.tint} /> : null}
      </View>
      <Text style={[styles.cardHint, { color: colors.muted }]}>
        Read-only-Anbindung: Site-Liste, Site-Properties und eCommerce-Orders. Token bleibt serverseitig und wird nur maskiert angezeigt.
      </Text>

      <View style={styles.statusRow}>
        <Text style={[styles.statusLabel, { color: colors.muted }]}>
          Status: {status ? STATE_LABEL[status.state] : "…"}
        </Text>
        {status?.tokenMasked ? (
          <Text style={[styles.token, { color: colors.muted }]}>{status.tokenMasked}</Text>
        ) : null}
      </View>
      <Text style={[styles.nextStep, { color: colors.text }]}>{status?.nextStep ?? ""}</Text>

      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text }]}
        placeholder="Site-ID (UUID aus der Dashboard-URL)"
        placeholderTextColor={colors.muted}
        value={siteIdInput}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setSiteIdInput}
      />
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.button, { backgroundColor: colors.tint }]}
          disabled={busy || siteIdInput.trim().length === 0 || setSiteId.isPending}
          onPress={() => void saveSiteId(siteIdInput.trim())}
        >
          <Text style={styles.buttonText}>Site-ID speichern</Text>
        </Pressable>
        <Pressable
          style={[styles.buttonSecondary, { borderColor: colors.border }]}
          disabled={busy || sites.isPending}
          onPress={() =>
            void runAction(async () => {
              await sites.mutateAsync(undefined);
            }, "Site-Suche")
          }
        >
          <Text style={[styles.buttonSecondaryText, { color: colors.tint }]}>
            {sites.isPending ? "Suche…" : "Sites im Konto"}
          </Text>
        </Pressable>
      </View>

      {siteRows.length > 0 ? (
        <View>
          {siteRows.map((site) => (
            <Pressable
              key={site.id}
              style={[styles.siteRow, { borderColor: colors.border }]}
              disabled={busy}
              onPress={() => void saveSiteId(site.id)}
            >
              <Text style={[styles.siteName, { color: colors.text }]}>
                {site.displayName ?? site.domain ?? site.id}
                {site.published === false ? " (unveröffentlicht)" : ""}
              </Text>
              <Text style={[styles.siteId, { color: colors.muted }]}>{site.id}</Text>
            </Pressable>
          ))}
          <Text style={[styles.tapHint, { color: colors.muted }]}>
            Tippen, um eine Site als aktive Site-ID zu übernehmen.
          </Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.buttonSecondary, { borderColor: colors.border }]}
          disabled={busy || properties.isPending || status?.state !== "ready"}
          onPress={() =>
            void runAction(async () => {
              await properties.mutateAsync(undefined);
            }, "Site-Properties")
          }
        >
          <Text style={[styles.buttonSecondaryText, { color: colors.tint }]}>
            {properties.isPending ? "Lädt…" : "Site-Properties"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.buttonSecondary, { borderColor: colors.border }]}
          disabled={busy || orders.isPending || status?.state !== "ready"}
          onPress={() =>
            void runAction(async () => {
              await orders.mutateAsync({ limit: 20 });
            }, "Orders")
          }
        >
          <Text style={[styles.buttonSecondaryText, { color: colors.tint }]}>
            {orders.isPending ? "Lädt…" : "Orders (20)"}
          </Text>
        </Pressable>
      </View>

      {props ? (
        <View style={[styles.resultBox, { borderColor: colors.border }]}>
          <Text style={[styles.resultTitle, { color: colors.text }]}>
            {props.businessName ?? props.siteName ?? "Site"}
          </Text>
          <Text style={[styles.resultLine, { color: colors.muted }]}>
            {[props.language, props.currency, props.timeZone].filter(Boolean).join(" · ") || "keine Angaben"}
          </Text>
          {props.email ? <Text style={[styles.resultLine, { color: colors.muted }]}>{props.email}</Text> : null}
        </View>
      ) : null}

      {orderRows.length > 0 ? (
        <View>
          {orderRows.map((order) => (
            <View key={order.id} style={[styles.resultBox, { borderColor: colors.border }]}>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                #{order.number ?? order.id} — {order.status ?? "unbekannt"}
              </Text>
              <Text style={[styles.resultLine, { color: colors.muted }]}>
                {order.createdDate ?? ""}
                {order.totalAmount != null
                  ? ` · ${(order.totalAmount ?? 0).toFixed(2)} ${order.currency ?? ""}`
                  : ""}
                {order.buyerEmail ? ` · ${order.buyerEmail}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, gap: 10, padding: 14 },
  headerRow: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardHint: { fontSize: 12, lineHeight: 16 },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  statusLabel: { fontSize: 13, fontWeight: "600" },
  token: { fontSize: 11 },
  nextStep: { fontSize: 13, lineHeight: 18 },
  input: { borderRadius: 8, borderWidth: 1, fontSize: 13, paddingHorizontal: 10, paddingVertical: 8 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  buttonSecondary: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  buttonSecondaryText: { fontSize: 13, fontWeight: "600" },
  siteRow: { borderRadius: 8, borderWidth: 1, gap: 2, padding: 10 },
  siteName: { fontSize: 13, fontWeight: "600" },
  siteId: { fontSize: 11 },
  tapHint: { fontSize: 11 },
  resultBox: { borderRadius: 8, borderWidth: 1, gap: 2, padding: 10 },
  resultTitle: { fontSize: 13, fontWeight: "600" },
  resultLine: { fontSize: 12, lineHeight: 16 },
});
