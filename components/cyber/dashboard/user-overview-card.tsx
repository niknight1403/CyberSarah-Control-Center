import { glassDepth,  glassPalette,  glassSurface } from "@/lib/design/future-glass";
/**
 * Sprint 156 — Benutzeruebersicht: Avatar mit Neon-Ring, Begruessung,
 * Rollen-Badge NUR bei serverseitig bestaetigter Rolle, Session-Status.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { greetName, roleBadge, sessionState, sessionStateCopy } from "@/lib/dashboard-view-model";
import { createNeonStyles } from "./neon-dashboard-styles";

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
    <View style={[themeStyles.neonCard, styles.card, themeStyles.neonCardGradient]}>
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
        style={({ pressed }) => [themeStyles.neonButton, styles.profileButton, pressed && styles.pressed]}
        onPress={() => router.push("/account")}
      >
        <Text style={styles.profileButtonText}>Profil</Text>
      </Pressable>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarWrap: { position: "relative" },
  avatarRing: {
    width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: glassPalette.cyan,
    shadowColor: glassPalette.cyan, shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  avatarRingOffline: { borderColor: glassSurface.textSecondary, shadowOpacity: 0 },
  avatar: {
    width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center",
    backgroundColor: glassDepth.void, borderWidth: 1, borderColor: glassSurface.border,
  },
  avatarText: { color: glassPalette.cyan, fontWeight: "900", fontSize: 20 },
  presenceDot: { position: "absolute", right: 2, bottom: 2, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: glassDepth.void },
  presenceOnline: { backgroundColor: glassPalette.green },
  textWrap: { flex: 1, gap: 3 },
  greeting: { color: glassSurface.textSecondary, fontSize: 13 },
  name: { color: glassSurface.textPrimary, fontSize: 20, fontWeight: "800" },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeAdmin: { borderColor: "rgba(168, 85, 247, 0.6)", backgroundColor: "rgba(168, 85, 247, 0.14)" },
  badgeAdminText: { color: glassPalette.cyan },
  badgeUser: { borderColor: glassSurface.border, backgroundColor: "rgba(25, 230, 255, 0.08)" },
  badgeUserText: { color: glassPalette.cyan },
  badgeOnline: { borderColor: "rgba(0, 245, 155, 0.5)", backgroundColor: "rgba(0, 245, 155, 0.1)" },
  badgeOnlineText: { color: glassPalette.green },
  badgeOffline: { borderColor: "rgba(255, 85, 119, 0.5)", backgroundColor: "rgba(255, 85, 119, 0.1)" },
  badgeOfflineText: { color: glassPalette.red },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  profileButton: { backgroundColor: "rgba(25, 230, 255, 0.14)", borderWidth: 1, borderColor: glassSurface.border },
  profileButtonText: { color: glassPalette.cyan, fontWeight: "700", fontSize: 13 },
  pressed: { opacity: 0.75 },
});

const styles = createStyles();
const themeStyles = createNeonStyles();
