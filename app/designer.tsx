import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Sprint 182 — Grafik-Designer auf "CyberSarah Future Glass" uebertragen:
 * cyber-theme/useColors durch Glass-Tokens ersetzt, GlassBackdrop mit
 * transparentem SafeArea-Container. Logik (Galerie, Generierung, Admin-Gate)
 * unveraendert.
 */
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
import { trpc } from "@/lib/trpc";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import {
  DESIGN_ASSET_TYPES,
  DESIGN_ASSET_TYPE_META,
  normalizeDesignAssetType,
  type DesignAssetType,
} from "@/lib/designer-logic";

/**
 * AI-Grafik-Designer-Tab (Sprint 133): Der Designer-Agent entwirft App-
 * Grafiken (Icons, Logos, Splash-Screens, Banner, Illustrationen) und
 * Design-Tokens — generiert, validiert und dauerhaft in der Galerie abgelegt.
 * Admin-gated wie der Rest der Autonomie-Flaeche.
 */
export default function DesignerScreen() {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const isAdmin = accountQuery.data?.role === "admin";

  const [assetType, setAssetType] = useState<DesignAssetType>("icon");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastAsset, setLastAsset] = useState<{ fileName: string; createdAt: string } | null>(null);

  const galleryQuery = trpc.design.gallery.useQuery({ includeContent: false, limit: 30 }, {
    enabled: isAdmin,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const generateMutation = trpc.design.generate.useMutation();
  const deleteMutation = trpc.design.delete.useMutation();

  const startGeneration = async () => {
    const trimmed = description.trim();
    if (trimmed.length < 3 || generateMutation.isPending) return;
    setError(null);
    try {
      const record = await generateMutation.mutateAsync({ type: assetType, description: trimmed });
      setLastAsset({ fileName: record.fileName, createdAt: record.createdAt });
      setDescription("");
      void galleryQuery.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generierung fehlgeschlagen.");
    }
  };

  const navDrawer = useNavDrawer();
  const gallery = galleryQuery.data ?? [];

  return (
    <GlassBackdrop accent="magenta">
      <SafeAreaView style={styles.safeTransparent} edges={["top"]}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={galleryQuery.isFetching} onRefresh={() => void galleryQuery.refetch()} tintColor={glass.glassPalette.cyan} />
        }
      >
        <View style={styles.header}>
          <View style={styles.menuRow}>
            <NavDrawer {...navDrawer.drawerProps} />
            <NavDrawerButton {...navDrawer.hamburgerProps} />
          </View>
          <Text style={styles.headerKicker}>AI GRAFIK-DESIGNER</Text>
          <Text style={styles.headerTitle}>
            DESIGNER<Text style={{ color: glass.glassPalette.cyan }}>AGENT</Text>
          </Text>
          <View style={[styles.headerLine, { backgroundColor: `${glass.glassPalette.cyan}55` }]} />
          <Text style={styles.headerSub}>
            Der Designer-Agent entwirft Icons, Logos, Splash-Screens, Banner, Illustrationen und Design-Tokens im Cyber-Design-System — validiert und in der Galerie gespeichert.
          </Text>
        </View>

        {!isAdmin ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Admin-Zugang erforderlich</Text>
            <Text style={styles.panelText}>Der Designer-Agent ist nur für Administratoren freigeschaltet. Melde dich mit deinem Admin-Konto an.</Text>
          </View>
        ) : (
          <>
            <View style={styles.panel}>
              <Text style={styles.inputLabel}>ASSET-TYP</Text>
              <View style={styles.typeRow}>
                {DESIGN_ASSET_TYPES.map((type) => {
                  const active = type === assetType;
                  return (
                    <Pressable key={type} onPress={() => setAssetType(type)} style={[styles.typeChip, active && styles.typeChipActive]}>
                      <Text style={[styles.typeChipText, active && { color: glass.glassDepth.void }]}>{DESIGN_ASSET_TYPE_META[type].label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.typeHint}>{DESIGN_ASSET_TYPE_META[assetType].beschreibung} · Format: {DESIGN_ASSET_TYPE_META[assetType].format.toUpperCase()}</Text>

              <Text style={styles.inputLabel}>BESCHREIBUNG / WUNSCH</Text>
              <TextInput
                style={styles.input}
                placeholder="z. B. Neon-Logo mit Hexagon-Rahmen und Claim 'Revenue OS' …"
                placeholderTextColor={glass.glassSurface.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                editable={!generateMutation.isPending}
              />
              <Pressable
                style={[styles.runButton, (description.trim().length < 3 || generateMutation.isPending) && styles.runButtonDisabled]}
                disabled={description.trim().length < 3 || generateMutation.isPending}
                onPress={() => void startGeneration()}
              >
                {generateMutation.isPending ? (
                  <ActivityIndicator color={glass.glassDepth.void} size="small" />
                ) : (
                  <Text style={styles.runButtonText}>✦ ENTWURF GENERIEREN</Text>
                )}
              </Pressable>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {lastAsset ? (
                <Text style={styles.successText}>
                  Gespeichert: {lastAsset.fileName}
                </Text>
              ) : null}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Galerie</Text>
              {gallery.length === 0 ? (
                <Text style={styles.panelText}>Noch keine Entwürfe vorhanden.</Text>
              ) : (
                gallery.map((asset) => (
                  <View key={asset.id} style={styles.galleryRow}>
                    <View style={styles.galleryRowMain}>
                      <Text style={styles.galleryTitle} numberOfLines={1}>{asset.name}</Text>
                      <Text style={styles.galleryMeta}>
                        {DESIGN_ASSET_TYPE_META[normalizeDesignAssetType(asset.type) ?? "icon"].label} · {asset.format.toUpperCase()} · {new Date(asset.createdAt).toLocaleString("de-DE")}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.deleteButton}
                      disabled={deleteMutation.isPending}
                      onPress={() => {
                        void deleteMutation.mutateAsync({ id: asset.id }).then(() => galleryQuery.refetch());
                      }}
                    >
                      <Text style={styles.deleteButtonText}>Löschen</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
      </SafeAreaView>
    </GlassBackdrop>
  );
}

const createStyles = (glass: RuntimeGlassTheme) =>
  StyleSheet.create({
    safe: { backgroundColor: glass.glassDepth.void, flex: 1 },
    safeTransparent: { backgroundColor: "transparent", flex: 1 },
    screen: { flex: 1 },
    content: { padding: 18, paddingBottom: 48 },
    header: { marginBottom: 18 },
    menuRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "flex-end" },
    headerKicker: { ...glass.glassType.label, color: glass.glassSurface.textSecondary, fontSize: 11, letterSpacing: 3 },
    headerTitle: { ...glass.glassType.display, color: glass.glassSurface.textPrimary, marginTop: 4 },
    headerLine: { height: 2, marginVertical: 8, width: 56 },
    headerSub: { color: glass.glassSurface.textSecondary, fontSize: 12, lineHeight: 17 },
    panel: { backgroundColor: glass.glassDepth.glass, borderColor: glass.glassSurface.border, borderRadius: 14, borderWidth: 1, marginBottom: 14, padding: 14 },
    panelTitle: { color: glass.glassSurface.textPrimary, fontSize: 13, fontWeight: "800", marginBottom: 4 },
    panelText: { color: glass.glassSurface.textSecondary, fontSize: 11, lineHeight: 16 },
    inputLabel: { color: glass.glassSurface.textSecondary, fontSize: 9, fontWeight: "800", letterSpacing: 0.6, marginBottom: 6, marginTop: 10 },
    typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    typeChip: { borderColor: glass.glassSurface.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
    typeChipActive: { backgroundColor: glass.glassPalette.cyan, borderColor: glass.glassPalette.cyan },
    typeChipText: { color: glass.glassSurface.textSecondary, fontSize: 10, fontWeight: "700" },
    typeHint: { color: glass.glassSurface.textSecondary, fontSize: 10, marginTop: 6 },
    input: { backgroundColor: `${glass.glassPalette.cyan}08`, borderColor: glass.glassSurface.border, borderRadius: 10, borderWidth: 1, color: glass.glassSurface.textPrimary, fontSize: 12, minHeight: 74, padding: 10, textAlignVertical: "top" },
    runButton: { alignItems: "center", backgroundColor: glass.glassPalette.cyan, borderRadius: 10, marginTop: 12, paddingVertical: 12 },
    runButtonDisabled: { opacity: 0.4 },
    runButtonText: { color: glass.glassDepth.void, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
    errorText: { color: glass.glassPalette.cyan, fontSize: 11, marginTop: 8 },
    successText: { color: glass.glassPalette.green, fontSize: 11, marginTop: 8 },
    galleryRow: { alignItems: "center", borderTopColor: glass.glassSurface.border, borderTopWidth: 1, flexDirection: "row", gap: 8, marginTop: 8, paddingTop: 8 },
    galleryRowMain: { flex: 1 },
    galleryTitle: { color: glass.glassSurface.textPrimary, fontSize: 12, fontWeight: "700" },
    galleryMeta: { color: glass.glassSurface.textSecondary, fontSize: 9, marginTop: 2 },
    deleteButton: { borderColor: `${glass.glassPalette.cyan}66`, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
    deleteButtonText: { color: glass.glassPalette.cyan, fontSize: 10, fontWeight: "700" },
  });
