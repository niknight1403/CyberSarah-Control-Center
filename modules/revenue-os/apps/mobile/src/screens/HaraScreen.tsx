import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useDashboard } from '../hooks/useDashboard';
import { AgentStatusCard } from '../components/AgentStatusCard';

export function HarasScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { agents, isLoading, refresh } = useDashboard();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const onlineAgents = agents?.filter(a => a.status === 'online' || a.status === 'aktiv') ?? [];
  const errorAgents = agents?.filter(a => a.status === 'error' || a.status === 'fehler') ?? [];
  const idleAgents = agents?.filter(a => a.status === 'idle') ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.greeting, { color: colors.text }]}>HARA KI</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>Hyper-Autonomer Revenue Agent</Text>
          </View>
          <View style={[styles.glassBadge, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
            <Text style={[styles.badgeText, { color: colors.success }]}>● {onlineAgents.length} aktiv</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Status Summary */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)' }]}>
            <Text style={styles.summaryNumber}>{onlineAgents.length}</Text>
            <Text style={styles.summaryLabel}>Aktiv</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.2)' }]}>
            <Text style={styles.summaryNumber}>{idleAgents.length}</Text>
            <Text style={styles.summaryLabel}>Bereit</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }]}>
            <Text style={styles.summaryNumber}>{errorAgents.length}</Text>
            <Text style={styles.summaryLabel}>Fehler</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: 'rgba(124,58,237,0.1)', borderColor: 'rgba(124,58,237,0.2)' }]}>
            <Text style={styles.summaryNumber}>{agents?.length ?? 0}</Text>
            <Text style={styles.summaryLabel}>Gesamt</Text>
          </View>
        </View>

        {/* Agent List */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Agenten Status</Text>

        {agents?.map((agent, index) => (
          <AgentStatusCard
            key={agent.id ?? index}
            name={agent.name}
            status={agent.status as 'online' | 'offline' | 'error' | 'aktiv' | 'idle'}
            lastAction={agent.lastAction}
            lastRun={agent.lastRun ? new Date(agent.lastRun) : undefined}
          />
        ))}

        {(!agents || agents.length === 0) && (
          <View style={[styles.emptyState, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
            <Text style={styles.emptyIcon}>🤖</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Agenten werden geladen...</Text>
            <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
              Die HARA-Agenten arbeiten im Hintergrund. Ziehe zum Aktualisieren nach unten.
            </Text>
          </View>
        )}

        {/* HARA Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>⚡ HARA — Hyper-Autonomer Revenue Agent</Text>
          <Text style={[styles.infoDesc, { color: colors.textMuted }]}>
            HARA analysiert kontinuierlich alle Umsatzquellen, optimiert Preise dynamisch, 
            erstellt Cross-Sell Produkte und startet automatisch Revenue-Kampagnen.
            Läuft alle 5 Minuten im Hintergrund.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  glassBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, marginBottom: -4 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, borderRadius: 16, padding: 14, borderWidth: 1, alignItems: 'center' },
  summaryNumber: { fontSize: 28, fontWeight: '800', color: '#e8e8ed', marginBottom: 2 },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: '#88889a' },
  emptyState: { borderRadius: 20, padding: 24, borderWidth: 1, alignItems: 'center' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#e8e8ed', marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 13, color: '#88889a', textAlign: 'center', lineHeight: 20 },
  infoCard: { borderRadius: 20, padding: 20, borderWidth: 1, marginBottom: 8 },
  infoTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  infoDesc: { fontSize: 13, lineHeight: 20 },
});

export default HarasScreen;
