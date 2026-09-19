/**
 * Sprint 183 — Gedaechtnis-Screen: useColors/cyber-theme durch Glass-Tokens ersetzt. Logik (Statusfarben-Mapping, Kategorien) unveraendert.
 */
import { glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";
import { useMemo } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";

import { trpc } from "@/lib/trpc";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/projects-logic";
import { DrawerBodyText, DrawerCard, DrawerCardTitle, DrawerScreen } from "@/components/responsive/drawer-screen";

/**
 * Sprint 132 — "Gedaechtnis"-Tab (Drawer): dauerhaftes Projekt-Gedaechtnis.
 * Alle laufenden Vorhaben (Repos, Sub-Apps) mit Status, letzter Aktivitaet
 * und Repository-Link — einmal verbunden, von jeder Session aus einsehbar.
 * Basis: projects-router (Postgres, Drizzle), Seed beim ersten Aufruf.
 */
const STATUS_ACCENTS: Record<ProjectStatus, string> = {
  idee: glassSurface.textMuted,
  "in-arbeit": glassPalette.cyan,
  pausiert: glassPalette.amber,
  live: glassPalette.green,
  archiviert: glassSurface.textMuted,
};

export default function MemoryScreen() {
  const projectsQuery = trpc.projects.list.useQuery(undefined, { retry: false });

  return (
    <DrawerScreen kicker="LANGZEIT-GEDÄCHTNIS" title="Gedächtnis">
      <DrawerCard accent={`${glassPalette.cyan}66`}>
        <DrawerCardTitle>Was hier gespeichert wird</DrawerCardTitle>
        <DrawerBodyText>
          Laufende Projekte, Repos und Vorhaben — dauerhaft in der Datenbank statt nur im Kopf der aktuellen Chat-Session. Der Superagent greift beim Zielauftrag ebenfalls auf dieses Gedächtnis zurück.
        </DrawerBodyText>
      </DrawerCard>

      {projectsQuery.isLoading ? (
        <View style={styles.centerRow}><ActivityIndicator color={glassPalette.cyan} /><Text style={styles.muted}>Projekte werden geladen …</Text></View>
      ) : projectsQuery.isError ? (
        <DrawerCard accent={`${glassPalette.cyan}66`}>
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
              <View style={[styles.projectCard, { borderColor: `${STATUS_ACCENTS[item.status] ?? glassPalette.cyan}55` }]}>
                <View style={styles.projectHeader}>
                  <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
                  <View style={[styles.statusChip, { backgroundColor: `${STATUS_ACCENTS[item.status] ?? glassPalette.cyan}22`, borderColor: STATUS_ACCENTS[item.status] ?? glassPalette.cyan }]}>
                    <Text style={[styles.statusText, { color: STATUS_ACCENTS[item.status] ?? glassPalette.cyan }]}>{PROJECT_STATUS_LABELS[item.status as ProjectStatus] ?? item.status}</Text>
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

function createStyles() {
  return StyleSheet.create({
    centerRow: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 12 },
    muted: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 18 },
    sectionLabel: { color: glassSurface.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 10 },
    projectCard: { backgroundColor: glassDepth.glass, borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 14 },
    projectHeader: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
    projectName: { color: glassSurface.textPrimary, flex: 1, fontSize: 14, fontWeight: "800" },
    statusChip: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
    statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
    projectDescription: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 6 },
    projectMeta: { color: glassSurface.textSecondary, fontSize: 10, marginTop: 5 },
    hint: { color: glassSurface.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 8 },
    hintLink: { color: glassPalette.cyan, fontWeight: "700" },
  });
}

const styles = createStyles();
