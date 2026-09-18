import { useColors } from "@/hooks/use-colors";
import { useMemo } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";

import { cyber } from "@/lib/cyber-theme";
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
  idee: cyber.textDim,
  "in-arbeit": cyber.cyan,
  pausiert: cyber.amber,
  live: cyber.green,
  archiviert: cyber.textDim,
};

export default function MemoryScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const projectsQuery = trpc.projects.list.useQuery(undefined, { retry: false });

  return (
    <DrawerScreen kicker="LANGZEIT-GEDÄCHTNIS" title="Gedächtnis">
      <DrawerCard accent={`${colors.tint}66`}>
        <DrawerCardTitle>Was hier gespeichert wird</DrawerCardTitle>
        <DrawerBodyText>
          Laufende Projekte, Repos und Vorhaben — dauerhaft in der Datenbank statt nur im Kopf der aktuellen Chat-Session. Der Superagent greift beim Zielauftrag ebenfalls auf dieses Gedächtnis zurück.
        </DrawerBodyText>
      </DrawerCard>

      {projectsQuery.isLoading ? (
        <View style={styles.centerRow}><ActivityIndicator color={colors.tint} /><Text style={styles.muted}>Projekte werden geladen …</Text></View>
      ) : projectsQuery.isError ? (
        <DrawerCard accent={`${colors.tint}66`}>
          <DrawerCardTitle>Projekt-Gedächtnis nicht verfügbar</DrawerCardTitle>
          <DrawerBodyText>
            Melde dich im Konto-Tab an, damit deine Projekte dauerhaft gespeichert werden können. {projectsQuery.error instanceof Error ? `(${projectsQuery.error.message})` : ""}
          </DrawerBodyText>
        </DrawerCard>
      ) : (
        <>
          <Text style={styles.sectionLabel}>LAUFENDE PROJEKTE ({projectsQuery.data?.length ?? 0})</Text>
          <FlatList
            data={projectsQuery.data ?? []}
            keyExtractor={(project) => String(project.id)}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.muted}>Noch keine Projekte — lege im Chat eines an.</Text>}
            renderItem={({ item }) => (
              <View style={[styles.projectCard, { borderColor: `${STATUS_ACCENTS[item.status] ?? colors.tint}55` }]}>
                <View style={styles.projectHeader}>
                  <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
                  <View style={[styles.statusChip, { backgroundColor: `${STATUS_ACCENTS[item.status] ?? colors.tint}22`, borderColor: STATUS_ACCENTS[item.status] ?? colors.tint }]}>
                    <Text style={[styles.statusText, { color: STATUS_ACCENTS[item.status] ?? colors.tint }]}>{PROJECT_STATUS_LABELS[item.status as ProjectStatus] ?? item.status}</Text>
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

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    centerRow: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 12 },
    muted: { color: colors.icon, fontSize: 12, lineHeight: 18 },
    sectionLabel: { color: colors.icon, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 10 },
    projectCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 14 },
    projectHeader: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
    projectName: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "800" },
    statusChip: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
    statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
    projectDescription: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
    projectMeta: { color: colors.icon, fontSize: 10, marginTop: 5 },
    hint: { color: colors.icon, fontSize: 10, lineHeight: 15, marginTop: 8 },
    hintLink: { color: colors.tint, fontWeight: "700" },
  });
}
