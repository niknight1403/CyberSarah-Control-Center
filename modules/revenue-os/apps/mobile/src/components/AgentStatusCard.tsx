import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface AgentStatusCardProps {
  name: string;
  status: 'online' | 'offline' | 'error' | 'aktiv' | 'idle' | string;
  lastAction?: string;
  lastRun?: Date;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  online: { label: 'Online', color: '#22c55e', icon: '●' },
  aktiv: { label: 'Aktiv', color: '#22c55e', icon: '●' },
  idle: { label: 'Bereit', color: '#f59e0b', icon: '○' },
  offline: { label: 'Offline', color: '#88889a', icon: '○' },
  error: { label: 'Fehler', color: '#ef4444', icon: '✕' },
  fehler: { label: 'Fehler', color: '#ef4444', icon: '✕' },
};

export function AgentStatusCard({
  name,
  status,
  lastAction,
  lastRun,
}: AgentStatusCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const cfg = STATUS_MAP[status] ?? { label: status, color: '#88889a', icon: '●' };

  const formatTime = (date?: Date): string => {
    if (!date) return '–';
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
      <View style={styles.left}>
        <View style={[styles.statusDot, { backgroundColor: cfg.color + '20' }]}>
          <Text style={[styles.statusIcon, { color: cfg.color }]}>{cfg.icon}</Text>
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          {lastAction ? (
            <Text style={[styles.action, { color: colors.textMuted }]} numberOfLines={1}>{lastAction}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.right}>
        <View style={[styles.badge, { backgroundColor: cfg.color + '15' }]}>
          <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <Text style={[styles.time, { color: colors.textMuted }]}>{formatTime(lastRun)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIcon: { fontSize: 14, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600' },
  action: { fontSize: 11, marginTop: 2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  time: { fontSize: 11, minWidth: 36, textAlign: 'right' },
});

export default AgentStatusCard;
