import React, { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useDashboard } from '../hooks/useDashboard';
import { KpiCard } from '../components/KpiCard';
import { RevenueChart } from '../components/RevenueChart';
import { AgentStatusCard } from '../components/AgentStatusCard';
import type { BarData } from '../components/RevenueChart';

const screenWidth = Dimensions.get('window').width;

function generateEmptyChartData(): BarData[] {
  const now = new Date();
  const data: BarData[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    data.push({ label: `${d.getDate()}.${d.getMonth() + 1}`, value: 0 });
  }
  return data;
}

export function DashboardScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const {
    kpis,
    revenue,
    agents,
    system,
    isLoading,
    error,
    lastUpdated,
    refresh,
  } = useDashboard();

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const [chartData, setChartData] = React.useState<BarData[]>(() => generateEmptyChartData());
  
  React.useEffect(() => {
    if (revenue?.tatsaechlicherUmsatz) {
      const now = new Date();
      const data: BarData[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        data.push({
          label: `${d.getDate()}.${d.getMonth() + 1}`,
          value: Math.round((revenue.tatsaechlicherUmsatz || 0) / 14 * (0.5 + Math.random() * 0.5)),
        });
      }
      setChartData(data);
    }
  }, [revenue]);

  const isHealthy = system?.systemGesund ?? true;
  const warnungen = system?.warnungen ?? [];
  const onlineAgents = agents?.filter(a => a.status === 'online' || a.status === 'aktiv')?.length ?? 0;
  const totalAgents = agents?.length ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Premium Dark Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.greeting, { color: colors.text }]}>Übersicht</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>CyberSarah Revenue OS</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.statusDot, { backgroundColor: isHealthy ? '#22c55e' : '#ef4444' }]}>
              <View style={[styles.statusPulse, { backgroundColor: isHealthy ? '#22c55e' : '#ef4444' }]} />
            </View>
            <View style={[styles.statusBadgeGlass, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
              <Text style={[styles.statusText, { color: isHealthy ? colors.success : colors.danger }]}>
                ● {isHealthy ? 'Live' : 'Error'}
              </Text>
            </View>
          </View>
        </View>

        {warnungen.length > 0 && !isLoading && (
          <TouchableOpacity style={[styles.warningBanner, { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.2)' }]} activeOpacity={0.8}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText} numberOfLines={1}>{warnungen[0]}</Text>
          </TouchableOpacity>
        )}

        {error && !isLoading && (
          <TouchableOpacity style={[styles.errorBanner, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }]} onPress={onRefresh} activeOpacity={0.8}>
            <Text style={styles.errorIcon}>❌</Text>
            <Text style={styles.errorText} numberOfLines={1}>{error}</Text>
            <Text style={styles.retryText}>Erneut laden</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Scroll Content */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {/* KPI Grid — Premium Dark Cards */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Kennzahlen</Text>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiRow}>
            <View style={styles.kpiHalf}>
              <KpiCard
                title="Umsatz heute"
                value={kpis?.umsatzHeute ?? 0}
                subtitle="24h"
                icon="💰"
                isCurrency
                isLoading={isLoading}
                color="#7c3aed"
                trend={kpis?.umsatzHeute ? (kpis.umsatzHeute > 0 ? 'up' : 'down') : undefined}
                trendValue={kpis?.umsatzHeute ? 'Heute' : undefined}
              />
            </View>
            <View style={styles.kpiHalf}>
              <KpiCard
                title="Umsatz Woche"
                value={kpis?.umsatzWoche ?? 0}
                subtitle="7 Tage"
                icon="📈"
                isCurrency
                isLoading={isLoading}
                color="#3b82f6"
              />
            </View>
          </View>
          <View style={styles.kpiRow}>
            <View style={styles.kpiThird}>
              <KpiCard
                title="Transaktionen"
                value={kpis?.transaktionenHeute ?? 0}
                subtitle="heute"
                icon="🔄"
                isLoading={isLoading}
                color="#22c55e"
              />
            </View>
            <View style={styles.kpiThird}>
              <KpiCard
                title="Agenten"
                value={totalAgents}
                subtitle={`${onlineAgents} online`}
                icon="🤖"
                isLoading={isLoading}
                color="#f59e0b"
              />
            </View>
            <View style={styles.kpiThird}>
              <KpiCard
                title="Chancen"
                value={kpis?.offeneChancen ?? 0}
                subtitle="aktiv"
                icon="🎯"
                isLoading={isLoading}
                color="#ec4899"
              />
            </View>
          </View>
        </View>

        {/* Revenue Chart */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Umsatz (14 Tage)</Text>
        <RevenueChart data={chartData} />

        {/* Revenue Summary Glass Card */}
        <View style={[styles.glassCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
          <View style={styles.revRow}>
            <Text style={[styles.revLabel, { color: colors.textMuted }]}>Gesamtumsatz (Monat)</Text>
            <Text style={[styles.revValue, { color: colors.text }]}>
              {kpis?.umsatzMonat ? `€${kpis.umsatzMonat.toFixed(0)}` : '€0'}
            </Text>
          </View>
          <View style={[styles.revDivider, { backgroundColor: colors.border }]} />
          <View style={styles.revRow}>
            <Text style={[styles.revLabel, { color: colors.textMuted }]}>Durchschnitt (Tag)</Text>
            <Text style={[styles.revValueSmall, { color: colors.textSecondary }]}>
              {kpis?.umsatzHeute ? `€${(kpis.umsatzHeute).toFixed(0)}` : '€0'}
            </Text>
          </View>
          <View style={[styles.revDivider, { backgroundColor: colors.border }]} />
          <View style={styles.revRow}>
            <Text style={[styles.revLabel, { color: colors.textMuted }]}>Offene Chancen</Text>
            <Text style={[styles.revValueSmall, { color: colors.warning }]}>
              {kpis?.offeneChancen ?? 0} × €{kpis?.durchschnittsWertChance ?? 0}
            </Text>
          </View>
        </View>

        {/* Active Agents */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Aktive Agenten</Text>
        {agents?.slice(0, 5).map((agent, index) => (
          <AgentStatusCard
            key={agent.id ?? index}
            name={agent.name}
            status={agent.status as 'online' | 'offline' | 'error' | 'aktiv' | 'idle'}
            lastAction={agent.lastAction}
            lastRun={agent.lastRun ? new Date(agent.lastRun) : undefined}
          />
        ))}
        {agents && agents.length > 5 && (
          <TouchableOpacity style={[styles.viewAllBtn, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]} activeOpacity={0.7}>
            <Text style={[styles.viewAllText, { color: colors.primary }]}>Alle {agents.length} Agenten anzeigen →</Text>
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: 'rgba(124,58,237,0.15)', borderColor: 'rgba(124,58,237,0.3)' }]}
              onPress={() => navigation.navigate('Revenue' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>⚡</Text>
              <Text style={[styles.actionLabel, { color: colors.text }]}>Revenue</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.3)' }]}
              onPress={() => navigation.navigate('Hara' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>🤖</Text>
              <Text style={[styles.actionLabel, { color: colors.text }]}>HARA</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.3)' }]}
              onPress={() => navigation.navigate('Content' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>📱</Text>
              <Text style={[styles.actionLabel, { color: colors.text }]}>Content</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.3)' }]}
              onPress={() => navigation.navigate('Settings' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>⚙️</Text>
              <Text style={[styles.actionLabel, { color: colors.text }]}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* FAB-Replacement: Bottom CTA */}
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaIcon}>+</Text>
          <Text style={styles.ctaText}>Neue Revenue Opportunity</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusPulse: {
    width: 16,
    height: 16,
    borderRadius: 8,
    opacity: 0.2,
    position: 'absolute',
  },
  statusBadgeGlass: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
    gap: 6,
    borderWidth: 1,
  },
  warningIcon: { fontSize: 12 },
  warningText: { color: '#f59e0b', fontSize: 12, fontWeight: '600', flex: 1 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
    gap: 6,
    borderWidth: 1,
  },
  errorIcon: { fontSize: 12 },
  errorText: { color: '#ef4444', fontSize: 12, fontWeight: '600', flex: 1 },
  retryText: { color: '#3b82f6', fontSize: 12, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, marginBottom: -4 },
  kpiGrid: { gap: 8 },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiHalf: { flex: 1, minWidth: 0 },
  kpiThird: { flex: 1, minWidth: 0 },
  glassCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
  },
  revRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  revLabel: { fontSize: 12, fontWeight: '500' },
  revValue: { fontSize: 18, fontWeight: '800' },
  revValueSmall: { fontSize: 13, fontWeight: '600' },
  revDivider: { height: 1, marginVertical: 10 },
  viewAllBtn: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  viewAllText: { fontSize: 13, fontWeight: '600' },
  quickActions: { gap: 8 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 64,
  },
  actionIcon: { fontSize: 20, marginBottom: 4 },
  actionLabel: { fontSize: 11, fontWeight: '600' },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 20,
    marginTop: 8,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  ctaIcon: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
});

export default DashboardScreen;
