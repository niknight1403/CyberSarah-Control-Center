import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';

export interface BarData {
  label: string;
  value: number;
  color?: string;
}

interface RevenueChartProps {
  data: BarData[];
  title?: string;
  height?: number;
  isLoading?: boolean;
}

const screenWidth = Dimensions.get('window').width;
const CHART_PADDING = 24;
const CHART_MARGIN = 16;

export function RevenueChart({
  data,
  title = 'Umsatz (30 Tage)',
  height = 200,
  isLoading = false,
}: RevenueChartProps): React.JSX.Element {
  const { colors } = useTheme();
  const chartWidth = screenWidth - CHART_PADDING * 2 - CHART_MARGIN * 2;
  const barWidth = Math.max(6, Math.min(20, (chartWidth - data.length * 4) / data.length));
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  const barChartHeight = height - 40;

  return (
    <View style={[styles.container, { backgroundColor: 'rgba(255,255,255,0.035)', borderColor: 'rgba(255,255,255,0.08)' }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {!isLoading && data.length > 0 && (
          <Text style={[styles.total, { color: colors.textMuted }]}>
            Ø {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
              data.reduce((s, d) => s + d.value, 0) / data.length
            )}
          </Text>
        )}
      </View>

      {/* Chart */}
      <View style={[styles.chartArea, { height }]}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <View style={[styles.skeleton, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
            <View style={[styles.skeleton, { backgroundColor: 'rgba(255,255,255,0.04)', width: '70%' }]} />
            <View style={[styles.skeleton, { backgroundColor: 'rgba(255,255,255,0.04)', width: '50%' }]} />
          </View>
        ) : data.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Keine Umsatzdaten</Text>
          </View>
        ) : (
          <Svg width={chartWidth} height={barChartHeight}>
            <Defs>
              <LinearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#7c3aed" stopOpacity="0.9" />
                <Stop offset="1" stopColor="#3b82f6" stopOpacity="0.6" />
              </LinearGradient>
            </Defs>
            {data.map((item, index) => {
              const barHeight = (item.value / maxValue) * (barChartHeight - 10);
              const x = index * (barWidth + 4) + CHART_MARGIN;
              const y = barChartHeight - barHeight;
              const barColor = item.color ?? 'url(#barGradient)';

              return (
                <Rect
                  key={index}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 2)}
                  rx={barWidth / 2}
                  ry={barWidth / 2}
                  fill={barColor}
                  opacity={0.85}
                />
              );
            })}
          </Svg>
        )}
      </View>

      {/* Labels */}
      {!isLoading && data.length > 0 && (
        <View style={styles.labelsRow}>
          {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 5)) === 0).map((item, i) => (
            <Text key={i} style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>
              {item.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  total: {
    fontSize: 12,
    fontWeight: '500',
  },
  chartArea: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  loadingContainer: {
    width: '100%',
    gap: 8,
  },
  skeleton: {
    height: 12,
    borderRadius: 6,
    width: '90%',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  emptyText: {
    fontSize: 13,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 9,
    fontWeight: '500',
  },
});

export default RevenueChart;
