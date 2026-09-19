/**
 * GlassTabIcon (Sprint 168) — aktives Icon der schwebenden CyberGlass-
 * Navigation erhaelt Glow-Pille + leicht vergroessertes Icon (Referenz §14).
 * Rein visuell, keine Navigationslogik — wird als tabBarIcon eingesetzt.
 */

import React from "react";
import { StyleSheet, View } from "react-native";

import { accentAlpha, glassPalette, type GlassAccent } from "@/lib/design/future-glass";

interface GlassTabIconProps {
  focused: boolean;
  accent?: GlassAccent;
  children: React.ReactNode;
}

export function GlassTabIcon({ focused, accent = "cyan", children }: GlassTabIconProps) {
  if (!focused) return <View style={styles.idleWrap}>{children}</View>;
  return (
    <View
      style={[
        styles.activeWrap,
        {
          backgroundColor: accentAlpha(accent, 0.16),
          borderColor: accentAlpha(accent, 0.5),
          shadowColor: glassPalette[accent],
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  idleWrap: { width: 40, height: 30, alignItems: "center", justifyContent: "center" },
  activeWrap: {
    width: 46,
    height: 32,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
