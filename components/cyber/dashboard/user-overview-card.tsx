/**
 * Sprint 156 — Benutzeruebersicht: Avatar mit Neon-Ring, Begruessung,
 * Rollen-Badge NUR bei serverseitig bestaetigter Rolle, Session-Status.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { neonPulse as t } from "@/lib/neon-pulse-theme";
import { greetName, roleBadge, sessionState, sessionStateCopy } from "@/lib/dashboard-view-model";
import { neonStyles } from "./neon-dashboard-styles";

export function UserOverviewCard({
  name,
  role,
  authenticated,
  sessionExpired,
  avatarUrl,
}: {
  name: string | null;
  role: string | null;
  authenticated: boolean;
  sessionExpired: boolean;
  avatarUrl?: string | null;
}) {
  const badge = roleBadge(role);
  const state = sessionState(authenticated, sessionExpired);
  const online = state === "online";
  return (
    <View style={[neonStyles.neonCard, styles.card, neonStyles.neonCardGradient]}>
      <View style={styles.avatarWrap}>
        <View style={[styles.avatarRing, !online && styles.avatarRingOffline]} accessibilityLabel="Profilbild">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{greetName(name).slice(0, 1).toUpperCase()}</Text>
          </View>
        </View>
        {online ? <View style={[styles.presenceDot, styles.presenceOnline]} accessibilityLabel="Online-Indikator" /> : null}
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.greeting}>Willkommen zurück,</Text>
        <Text style={styles.name}>{greetName(name)}</Text>
        <View style={styles.badgeRow}>
          {badge ? (
            <View style={[styles.badge, badge === "Administrator" ? styles.badgeAdmin : styles.badgeUser]}>
              <Text style={[styles.badgeText, badge === "Administrator" ? styles.badgeAdminText : styles.badgeUserText]}>
                {badge}
              </Text>
            </View>
          ) : null}
          <View style={[styles.badge, online ? styles.badgeOnline : styles.badgeOffline]}>
            <Text style={[styles.badgeText, online ? styles.badgeOnlineText : styles.badgeOfflineText]}>
              {sessionStateCopy[state]}
            </Text>
          </View>
        </View>
      </View>
      <Pressable
        accessibilityLabel="Profil öffnen"
        accessibilityRole="button"
        style={({ pressed }) => [neonStyles.neonButton, styles.profileButton, pressed && styles.pressed]}
        onPress={() => router.push("/account")}
      >
        <Text style={styles.profileButtonText}>Profil</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarWrap: { position: "relative" },
  avatarRing: {
    width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: t.cyan,
    shadowColor: t.cyan, shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  avatarRingOffline: { borderColor: t.textMuted, shadowOpacity: 0 },
  avatar: {
    width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center",
    backgroundColor: t.backgroundElevated, borderWidth: 1, borderColor: t.border,
  },
  avatarText: { color: t.turquoise, fontWeight: "900", fontSize: 20 },
  presenceDot: { position: "absolute", right: 2, bottom: 2, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: t.backgroundElevated },
  presenceOnline: { backgroundColor: t.emerald },
  textWrap: { flex: 1, gap: 3 },
  greeting: { color: t.textSecondary, fontSize: 13 },
  name: { color: t.textPrimary, fontSize: 20, fontWeight: "800" },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeAdmin: { borderColor: "rgba(168, 85, 247, 0.6)", backgroundColor: "rgba(168, 85, 247, 0.14)" },
  badgeAdminText: { color: t.violet },
  badgeUser: { borderColor: t.border, backgroundColor: "rgba(25, 230, 255, 0.08)" },
  badgeUserText: { color: t.cyan },
  badgeOnline: { borderColor: "rgba(0, 245, 155, 0.5)", backgroundColor: "rgba(0, 245, 155, 0.1)" },
  badgeOnlineText: { color: t.emerald },
  badgeOffline: { borderColor: "rgba(255, 85, 119, 0.5)", backgroundColor: "rgba(255, 85, 119, 0.1)" },
  badgeOfflineText: { color: t.danger },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  profileButton: { backgroundColor: "rgba(25, 230, 255, 0.14)", borderWidth: 1, borderColor: t.border },
  profileButtonText: { color: t.cyan, fontWeight: "700", fontSize: 13 },
  pressed: { opacity: 0.75 },
});
