/**
 * Sprint 183 — Gedaechtnis-Screen: useColors/cyber-theme durch Glass-Tokens ersetzt. Logik (Statusfarben-Mapping, Kategorien) unveraendert.
 */
import { useMemo } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";

import { trpc } from "@/lib/trpc";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/projects-logic";
import { DrawerBodyText, DrawerCard, DrawerCardTitle, DrawerScreen } from "@/components/responsive/drawer-screen";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";

/**
 * Sprint 132 — "Gedaechtnis"-Tab (Drawer): dauerhaftes Projekt-Gedaechtnis.
 * Alle laufenden Vorhaben (Repos, Sub-Apps) mit Status, letzter Aktivitaet
 * und Repository-Link — einmal verbunden, von jeder Session aus einsehbar.
 * Basis: projects-router (Postgres, Drizzle), Seed beim ersten Aufruf.
 */
export default function MemoryScreen() {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  const statusAccents: Record<ProjectStatus, string> = {
    idee: glass.glassSurface.textMuted,
    "in-arbeit": glass.glassPalette.cyan,
    pausiert: glass.glassPalette.amber,
    live: glass.glassPalette.green,
    archiviert: glass.glassSurface.textMuted,
  };
  const projectsQuery = trpc.projects.list.useQuery(undefined, { retry: false });

  return (
    <DrawerScreen kicker="LANGZEIT-GEDÄCHTNIS" title="Gedächtnis">
      <DrawerCard accent={`${glass.glassPalette.cyan}66`}>
        <DrawerCardTitle>Was hier gespeichert wird</DrawerCardTitle>
        <DrawerBodyText>
          Laufende Projekte, Repos und Vorhaben — dauerhaft in der Datenbank statt nur im Kopf der aktuellen Chat-Session. Der Superagent greift beim Zielauftrag ebenfalls auf dieses Gedächtnis zurück.
        </DrawerBodyText>
      </DrawerCard>

      {projectsQuery.isLoading ? (
        <View style={styles.centerRow}><ActivityIndicator color={glass.glassPalette.cyan} /><Text style={styles.muted}>Projekte werden geladen …</Text></View>
      ) : projectsQuery.isError ? (
        <DrawerCard accent={`${glass.glassPalette.cyan}66`}>
          <DrawerCardTitle>Projekt-Gedächtnis nicht verfügbar</DrawerCardTitle>
          <DrawerBodyText>
            Melde dich im Konto-Tab an, damit deine Projekte dauerhaft gespeichert werden können. {projectsQuery.error instanceof Error ? `(${projectsQuery.error.message})` : ""}
          </DrawerBodyText>
        </DrawerCard>
      ) : (
        <>
          <Text style={styles.sectionLabel}>LAUFENDE PROJEKTE ({projectsQuery.data?.length ?? 0})</Text>
          <FlatList
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                windowSize={9}
            data={projectsQuery.data ?? []}
            keyExtractor={(project) => String(project.id)}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.muted}>Noch keine Projekte — lege im Chat eines an.</Text>}
            renderItem={({ item }) => (
              <View style={[styles.projectCard, { borderColor: `${statusAccents[item.status] ?? glass.glassPalette.cyan}55` }]}>
                <View style={styles.projectHeader}>
                  <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
                  <View style={[styles.statusChip, { backgroundColor: `${statusAccents[item.status] ?? glass.glassPalette.cyan}22`, borderColor: statusAccents[item.status] ?? glass.glassPalette.cyan }]}>
                    <Text style={[styles.statusText, { color: statusAccents[item.status] ?? glass.glassPalette.cyan }]}>{PROJECT_STATUS_LABELS[item.status as ProjectStatus] ?? item.status}</Text>
                  </View>
                </View>
                {item.description ? <Text style={styles.projectDescription} numberOfLines={3}>{item.description}</Text> : null}
                {item.repositoryUrl ? (
                  <Text style={styles.projectMeta} numberOfLines={1}>🔗 {item.repositoryUrl.replace("https://github.com/", "")}</Text>
                ) : null}
                <Text style={styles.projectMeta}>Letzte Aktivität: {new Date(item.lastActivityAt).toLocaleDateString("de-DE")}</Text>
              </View>
            )}
          />
          <Text style={styles.hint}>
            Status und neue Projekte verwaltet der Superagent automatisch beim Verbinden eines Repos —{" "}
            <Link href="/chat" style={styles.hintLink}>im Chat starten</Link>.
          </Text>
        </>
      )}
    </DrawerScreen>
  );
}

function createStyles(glass: RuntimeGlassTheme) {
  return StyleSheet.create({
    centerRow: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 12 },
    muted: { color: glass.glassSurface.textSecondary, fontSize: 12, lineHeight: 18 },
    sectionLabel: { color: glass.glassSurface.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 10 },
    projectCard: { backgroundColor: glass.glassDepth.glass, borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 14 },
    projectHeader: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
    projectName: { color: glass.glassSurface.textPrimary, flex: 1, fontSize: 14, fontWeight: "800" },
    statusChip: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
    statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
    projectDescription: { color: glass.glassSurface.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 6 },
    projectMeta: { color: glass.glassSurface.textSecondary, fontSize: 10, marginTop: 5 },
    hint: { color: glass.glassSurface.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 8 },
    hintLink: { color: glass.glassPalette.cyan, fontWeight: "700" },
  });
}
