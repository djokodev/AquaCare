import React from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/theme';
import { DASHBOARD_UNAVAILABLE_VALUE } from './formatters';

export type DashboardMetricTone = 'neutral' | 'slate' | 'aqua' | 'info' | 'attention';

interface DashboardMetricCardProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  tone?: DashboardMetricTone;
  helper?: string;
  unavailableLabel: string;
  showUnavailableLabel?: boolean;
  layout?: 'grid' | 'fullWidthCompact';
  accessibilityLabel?: string;
  style?: ViewStyle;
}

const toneColors: Record<DashboardMetricTone, { surface: string }> = {
  neutral: { surface: colors.surface.metricNeutral },
  slate: { surface: colors.surface.metricSlate },
  aqua: { surface: colors.surface.metricAqua },
  info: { surface: colors.surface.metricInfo },
  attention: { surface: colors.surface.metricAttention },
};

function isUnavailable(value: DashboardMetricCardProps['value']): boolean {
  return value === null || value === undefined || value === '' || value === DASHBOARD_UNAVAILABLE_VALUE ||
    (typeof value === 'number' && !Number.isFinite(value));
}

export function DashboardMetricCard({
  label,
  value,
  unit,
  tone = 'neutral',
  helper,
  unavailableLabel,
  showUnavailableLabel = true,
  layout = 'grid',
  accessibilityLabel,
  style,
}: DashboardMetricCardProps) {
  const { width, fontScale } = useWindowDimensions();
  const stackGrid = width < 350 || fontScale >= 1.3;
  const unavailable = isUnavailable(value);
  const displayValue = unavailable ? '—' : String(value);
  const announcement = accessibilityLabel ??
    `${label}, ${unavailable ? unavailableLabel : `${displayValue}${unit ? ` ${unit}` : ''}`}${helper ? `. ${helper}` : ''}`;
  const toneStyle = toneColors[tone];

  return (
    <Card
      variant="outlined"
      style={[styles.card, layout === 'fullWidthCompact' && styles.fullWidthCompact, stackGrid && layout === 'grid' && styles.stackGrid, { backgroundColor: toneStyle.surface }, style]}
      testID="dashboard-metric-card"
    >
      <View accessible accessibilityLabel={announcement} style={styles.content}>
        <AppText variant="caption" color="muted">{label}</AppText>
        <View style={styles.valueRow}>
          <AppText variant="metric" style={styles.value}>{displayValue}</AppText>
          {!unavailable && unit ? <AppText variant="caption" color="link">{unit}</AppText> : null}
        </View>
        {helper ? <AppText variant="helper" color="muted">{helper}</AppText> : null}
        {unavailable && !helper && showUnavailableLabel ? <AppText variant="helper" color="muted">{unavailableLabel}</AppText> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexGrow: 1, flexBasis: '46%', minWidth: 0, minHeight: 112, padding: spacing[3] },
  fullWidthCompact: { flexBasis: '100%', minHeight: 92, paddingVertical: spacing[3] },
  stackGrid: { flexBasis: '100%' },
  content: { gap: spacing[1] },
  valueRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing[1] },
  value: { flexShrink: 1 },
});
