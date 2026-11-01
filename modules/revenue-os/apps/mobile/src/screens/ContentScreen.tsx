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

export function ContentScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 1000));
    setRefreshing(false);
  }, []);

  const contentTypes = [
    { icon: '📱', name: 'Social Media', desc: 'TikTok, Instagram, YouTube Shorts', status: 'Aktiv', color: '#ec4899' },
    { icon: '📧', name: 'E-Mail', desc: 'Newsletter & Automation', status: 'Aktiv', color: '#3b82f6' },
    { icon: '📝', name: 'Blog / SEO', desc: 'SEO-optimierte Artikel', status: 'Aktiv', color: '#22c55e' },
    { icon: '🎬', name: 'Video', desc: 'Faceless Video Content', status: 'Aktiv', color: '#f59e0b' },
    { icon: '🖼️', name: 'KI-Bilder', desc: 'DALL-E / MidJourney', status: 'Aktiv', color: '#7c3aed' },
    { icon: '📊', name: 'Infographics', desc: 'Datenvisualisierungen', status: 'Bald', color: '#88889a' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.greeting, { color: colors.text }]}>Content</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>KI-generierte Inhalte</Text>
          </View>
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.7}
          >
            <Text style={styles.createBtnText}>+ Neu</Text>
          </TouchableOpacity>
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
        {/* Content Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>47</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Beiträge heute</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
            <Text style={[styles.statNumber, { color: colors.secondary }]}>1.2k</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Gesamt</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
            <Text style={[styles.statNumber, { color: colors.success }]}>89%</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Auto-Post</Text>
          </View>
        </View>

        {/* Content Types */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Content Typen</Text>
        {contentTypes.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.contentCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}
            activeOpacity={0.7}
          >
            <View style={[styles.contentIcon, { backgroundColor: item.color + '20' }]}>
              <Text style={styles.contentIconText}>{item.icon}</Text>
            </View>
            <View style={styles.contentInfo}>
              <Text style={[styles.contentName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.contentDesc, { color: colors.textMuted }]}>{item.desc}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: item.status === 'Aktiv' ? 'rgba(34,197,94,0.15)' : 'rgba(136,136,154,0.15)' }]}>
              <Text style={[styles.statusText, { color: item.status === 'Aktiv' ? '#22c55e' : '#88889a' }]}>{item.status}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>🤖 KI-Content Factory</Text>
          <Text style={[styles.infoDesc, { color: colors.textMuted }]}>
            Der Trend Analyst Agent scannt täglich Trends, die Content Factory erstellt automatisch 
            Beiträge, und der Influencer Agent postet sie auf allen Plattformen.
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
  createBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  createBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, marginBottom: -4 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, borderRadius: 16, padding: 14, borderWidth: 1, alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 11, fontWeight: '500' },
  contentCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, borderWidth: 1, gap: 12 },
  contentIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  contentIconText: { fontSize: 20 },
  contentInfo: { flex: 1 },
  contentName: { fontSize: 15, fontWeight: '600' },
  contentDesc: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  infoCard: { borderRadius: 20, padding: 20, borderWidth: 1, marginBottom: 8 },
  infoTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  infoDesc: { fontSize: 13, lineHeight: 20 },
});

export default ContentScreen;
