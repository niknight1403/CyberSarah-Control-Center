import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: string;
  isLoading?: boolean;
  isCurrency?: boolean;
  onPress?: () => void;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendValue,
  color = '#7c3aed',
  isLoading = false,
  isCurrency = false,
  onPress,
}: KpiCardProps): React.JSX.Element {
  const { colors } = useTheme();

  const formatValue = (val: string | number): string => {
    if (isCurrency && typeof val === 'number') {
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: val < 100 ? 2 : 0,
        maximumFractionDigits: val < 100 ? 2 : 0,
      }).format(val);
    }
    if (typeof val === 'number') {
      return new Intl.NumberFormat('de-DE').format(val);
    }
    return val;
  };

  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendColor = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#88889a';

  return (
    <View
      style={[styles.card, { backgroundColor: 'rgba(255,255,255,0.035)', borderColor: 'rgba(255,255,255,0.08)' }]}
      onTouchEnd={onPress}
      activeOpacity={0.7}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      {/* Value */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={color} />
        </View>
      ) : (
        <Text style={[styles.value, { color: colors.text }]}>
          {formatValue(value)}
        </Text>
      )}

      {/* Title */}
      <Text style={[styles.title, { color: colors.textMuted }]} numberOfLines={1}>
        {title}
      </Text>

      {/* Footer: Subtitle + Trend */}
      <View style={styles.footer}>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {trend && trendValue ? (
          <View style={[styles.trendBadge, { backgroundColor: trendColor + '10' }]}>
            <Text style={[styles.trendText, { color: trendColor }]}>
              {trendIcon} {trendValue}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    minHeight: 130,
    justifyContent: 'space-between',
    backdropFilter: 'blur(24px)',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 18,
  },
  loadingContainer: {
    height: 36,
    justifyContent: 'center',
  },
  value: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subtitle: {
    fontSize: 11,
    flex: 1,
  },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '700',
  },
});

export default KpiCard;
