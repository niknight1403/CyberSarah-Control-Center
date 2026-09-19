/**
 * GlassHeader (Sprint 168) — vereinheitlichter Future-Glass-Header.
 *
 * Ersetzt getrennten Logo-Header + separate User-Overview-Card durch EIN
 * zusammenhaengendes CyberGlass-Modul (Referenz §8):
 *   Logo + "CyberSarah" + "CONTROL CENTER"  →  Avatar + Begruessung +
 *   Rollen-Badge + Online-Status  →  Notification-Button.
 *
 * Verwendet ausschliesslich echte, vom Aufrufer uebergebene Daten (Name,
 * Rolle, Session-Status, Alert-Flag) — KEINE erfundenen Werte.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { AiCore } from "@/components/glass/ai-core";
import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { accentAlpha, glassPalette, glassSpacing, glassSurface, glassType } from "@/lib/design/future-glass";

interface GlassHeaderProps {
  name: string | null;
  roleBadge: string | null;
  online: boolean;
  hasAlerts: boolean;
  onPressNotifications?: () => void;
  onPressProfile?: () => void;
}

function initial(name: string | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed.slice(0, 1).toUpperCase() : "?";
}

export function GlassHeader({ name, roleBadge, online, hasAlerts, onPressNotifications, onPressProfile }: GlassHeaderProps) {
  return (
    <GlassCard accent="purple" glow={0} style={styles.card}>
      <View style={styles.brandRow}>
        <View style={styles.brandLeft}>
          <AiCore size={34} state={online ? "idle" : "warning"} />
          <View>
            <Text style={styles.brandTitle}>
              Cyber<Text style={{ color: glassPalette.cyan }}>Sarah</Text>
            </Text>
            <Text style={styles.brandSubtitle}>CONTROL CENTER</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hasAlerts ? "Meldungen öffnen — es gibt Systemmeldungen" : "Meldungen öffnen — keine offenen Meldungen"}
          onPress={onPressNotifications ?? (() => router.push("/quality" as never))}
          style={styles.iconButton}
        >
          <IconSymbol size={18} name="exclamationmark.triangle.fill" color={glassSurface.textSecondary} />
          {hasAlerts ? <View style={styles.alertDot} /> : null}
        </Pressable>
      </View>

      <View style={styles.divider} />

      <View style={styles.profileRow}>
        <View style={styles.avatarWrap}>
          <View style={[styles.avatarRing, { borderColor: accentAlpha(online ? "green" : "red", 0.7) }]}>
            <Text style={styles.avatarText}>{initial(name)}</Text>
          </View>
          {online ? <View style={styles.presenceDot} /> : null}
        </View>
        <View style={styles.profileText}>
          <Text style={styles.greeting}>Willkommen zurück,</Text>
          <Text style={styles.name} numberOfLines={1}>{name?.trim() || "Gast"}</Text>
          <View style={styles.chipRow}>
            {roleBadge ? <StatusChip label={roleBadge.toUpperCase()} accent="purple" /> : null}
            <StatusChip label={online ? "ONLINE" : "OFFLINE"} accent={online ? "green" : "red"} live={online} />
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profil öffnen"
          onPress={onPressProfile ?? (() => router.push("/account"))}
          style={styles.profileButton}
        >
          <Text style={styles.profileButtonText}>Profil</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: glassSpacing.md, gap: glassSpacing.md },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandTitle: { ...glassType.headline, color: glassSurface.textPrimary },
  brandSubtitle: { ...glassType.label, color: glassSurface.textMuted, marginTop: 1 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: accentAlpha("purple", 0.08),
    borderWidth: 1,
    borderColor: glassSurface.border,
  },
  alertDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: glassPalette.amber,
    shadowColor: glassPalette.amber,
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  divider: { height: 1, backgroundColor: glassSurface.border },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarWrap: { position: "relative" },
  avatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: glassSurface.cardElevated,
  },
  avatarText: { color: glassSurface.textPrimary, fontWeight: "900", fontSize: 18 },
  presenceDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: glassSurface.card,
    backgroundColor: glassPalette.green,
  },
  profileText: { flex: 1, gap: 2 },
  greeting: { ...glassType.caption, color: glassSurface.textSecondary, fontWeight: "500" },
  name: { ...glassType.title, color: glassSurface.textPrimary, fontSize: 17 },
  chipRow: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  profileButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: glassSurface.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: accentAlpha("cyan", 0.1),
  },
  profileButtonText: { color: glassPalette.cyan, fontWeight: "700", fontSize: 12 },
});
