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
import { KpiCard } from '../components/KpiCard';

export function RevenueScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { kpis, isLoading, refresh } = useDashboard();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.greeting, { color: colors.text }]}>Revenue</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>Umsatz & Transaktionen</Text>
          </View>
          <View style={[styles.glassBadge, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
            <Text style={[styles.badgeText, { color: colors.success }]}>● Live</Text>
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
        {/* KPI Cards */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Umsatz Übersicht</Text>
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
                title="Umsatz diese Woche"
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
                title="Kunden"
                value={kpis?.kundenGesamt ?? 0}
                subtitle="gesamt"
                icon="👥"
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
                trend={kpis?.offeneChancen ? 'up' : 'neutral'}
                trendValue={kpis?.offeneChancen ? `${kpis.offeneChancen}` : '0'}
              />
            </View>
          </View>
        </View>

        {/* Revenue Sources */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Einnahmequellen</Text>
        <View style={[styles.glassCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
          <View style={styles.sourceRow}>
            <View style={styles.sourceLeft}>
              <Text style={styles.sourceIcon}>🛒</Text>
              <View>
                <Text style={[styles.sourceName, { color: colors.text }]}>Produktverkäufe</Text>
                <Text style={[styles.sourceDesc, { color: colors.textMuted }]}>Direkte Stripe-Transaktionen</Text>
              </View>
            </View>
            <Text style={[styles.sourceValue, { color: colors.success }]}>
              {kpis?.umsatzHeute ? `€${kpis.umsatzHeute.toFixed(0)}` : '€0'}
            </Text>
          </View>
          <View style={[styles.sourceDivider, { backgroundColor: colors.border }]} />
          <View style={styles.sourceRow}>
            <View style={styles.sourceLeft}>
              <Text style={styles.sourceIcon}>🤝</Text>
              <View>
                <Text style={[styles.sourceName, { color: colors.text }]}>Affiliate</Text>
                <Text style={[styles.sourceDesc, { color: colors.textMuted }]}>Provisionen & Partner</Text>
              </View>
            </View>
            <Text style={[styles.sourceValue, { color: colors.warning }]}>€0</Text>
          </View>
          <View style={[styles.sourceDivider, { backgroundColor: colors.border }]} />
          <View style={styles.sourceRow}>
            <View style={styles.sourceLeft}>
              <Text style={styles.sourceIcon}>📊</Text>
              <View>
                <Text style={[styles.sourceName, { color: colors.text }]}>Trading</Text>
                <Text style={[styles.sourceDesc, { color: colors.textMuted }]}>Papier-Modus</Text>
              </View>
            </View>
            <Text style={[styles.sourceValue, { color: colors.info }]}>€0</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Aktionen</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: 'rgba(124,58,237,0.15)', borderColor: 'rgba(124,58,237,0.3)' }]}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>➕</Text>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Produkt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.3)' }]}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Report</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.3)' }]}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>📤</Text>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Export</Text>
          </TouchableOpacity>
        </View>

        {/* Empty state for future features */}
        <View style={[styles.emptyState, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
          <Text style={styles.emptyIcon}>🚀</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Revenue Optimierungen aktiv</Text>
          <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
            Der Monetization Agent optimiert automatisch Preise, erstellt Upsells und generiert Cross-Sell Produkte.
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
  kpiGrid: { gap: 8 },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiHalf: { flex: 1, minWidth: 0 },
  kpiThird: { flex: 1, minWidth: 0 },
  glassCard: { borderRadius: 20, padding: 16, borderWidth: 1, gap: 0 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  sourceLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  sourceIcon: { fontSize: 24 },
  sourceName: { fontSize: 15, fontWeight: '600' },
  sourceDesc: { fontSize: 11, marginTop: 2 },
  sourceDivider: { height: 1 },
  sourceValue: { fontSize: 18, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, borderWidth: 1, minHeight: 64 },
  actionIcon: { fontSize: 20, marginBottom: 4 },
  actionLabel: { fontSize: 11, fontWeight: '600' },
  emptyState: { borderRadius: 20, padding: 24, borderWidth: 1, alignItems: 'center', marginTop: 8 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});

export default RevenueScreen;
