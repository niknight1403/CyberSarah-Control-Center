import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../store/AuthContext';

export function SettingsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors, theme, toggleTheme } = useTheme();
  const { logout, user } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [autoSync, setAutoSync] = useState(true);

  const handleLogout = () => {
    Alert.alert(
      'Abmelden',
      'Möchtest du dich wirklich abmelden?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Abmelden', style: 'destructive', onPress: () => logout() },
      ],
    );
  };

  const settingsSections = [
    {
      title: 'Allgemein',
      items: [
        { icon: '🎨', label: 'Dark Mode', type: 'switch', value: theme === 'dark', onToggle: toggleTheme },
        { icon: '🔔', label: 'Push-Benachrichtigungen', type: 'switch', value: pushEnabled, onToggle: () => setPushEnabled(!pushEnabled) },
        { icon: '🔄', label: 'Auto-Sync', type: 'switch', value: autoSync, onToggle: () => setAutoSync(!autoSync) },
      ],
    },
    {
      title: 'Account',
      items: [
        { icon: '👤', label: 'Profil', type: 'link', value: user?.email ?? 'Nicht angemeldet' },
        { icon: '🔐', label: 'Passwort ändern', type: 'link' },
        { icon: '💳', label: 'Zahlungsmethoden', type: 'link' },
      ],
    },
    {
      title: 'KI & Agenten',
      items: [
        { icon: '🤖', label: 'HARA Einstellungen', type: 'link' },
        { icon: '📊', label: 'Revenue Optimierung', type: 'link' },
        { icon: '📱', label: 'Social Media Posting', type: 'link' },
      ],
    },
    {
      title: 'Info',
      items: [
        { icon: '📋', label: 'Version', type: 'info', value: '3.0.0' },
        { icon: '📄', label: 'Lizenz', type: 'info', value: 'Commercial' },
        { icon: '🔗', label: 'Server', type: 'info', value: 'Hetzner Cloud' },
      ],
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
        <Text style={[styles.greeting, { color: colors.text }]}>Einstellungen</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>App & Account</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}
          activeOpacity={0.7}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>CS</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]}>
              {user?.email ?? 'CyberSarah Nutzer'}
            </Text>
            <Text style={[styles.profileStatus, { color: colors.success }]}>● Premium</Text>
          </View>
          <Text style={styles.profileArrow}>›</Text>
        </TouchableOpacity>

        {/* Settings Sections */}
        {settingsSections.map((section, sIndex) => (
          <View key={sIndex} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
              {section.items.map((item, iIndex) => (
                <TouchableOpacity
                  key={iIndex}
                  style={[styles.settingItem, iIndex < section.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  activeOpacity={item.type === 'switch' ? 1 : 0.7}
                  onPress={item.type === 'switch' ? undefined : undefined}
                >
                  <View style={styles.settingLeft}>
                    <Text style={styles.settingIcon}>{item.icon}</Text>
                    <Text style={[styles.settingLabel, { color: colors.text }]}>{item.label}</Text>
                  </View>
                  {item.type === 'switch' ? (
                    <Switch
                      value={item.value as boolean}
                      onValueChange={item.onToggle as (val: boolean) => void}
                      trackColor={{ false: colors.border, true: colors.primary + '60' }}
                      thumbColor={(item.value as boolean) ? colors.primary : '#666'}
                    />
                  ) : item.type === 'info' ? (
                    <Text style={[styles.settingValue, { color: colors.textMuted }]}>{item.value}</Text>
                  ) : (
                    <View style={styles.settingRight}>
                      {item.value && <Text style={[styles.settingValue, { color: colors.textMuted }]}>{item.value}</Text>}
                      <Text style={[styles.settingArrow, { color: colors.textMuted }]}>›</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Text style={styles.logoutIcon}>🚪</Text>
          <Text style={styles.logoutText}>Abmelden</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          CyberSarah Revenue OS v3.0.0
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  greeting: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 20 },
  profileCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 16, borderWidth: 1, gap: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#ffffff' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: '700' },
  profileStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  profileArrow: { fontSize: 24, color: '#88889a', fontWeight: '300' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginLeft: 4 },
  sectionCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: { fontSize: 18 },
  settingLabel: { fontSize: 15, fontWeight: '500' },
  settingValue: { fontSize: 13, fontWeight: '400' },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingArrow: { fontSize: 20, fontWeight: '300' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, padding: 16, borderWidth: 1, marginTop: 8 },
  logoutIcon: { fontSize: 18 },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
  footerText: { fontSize: 12, textAlign: 'center', paddingVertical: 16 },
});

export default SettingsScreen;
