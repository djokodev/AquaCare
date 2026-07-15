import { Ionicons } from '@expo/vector-icons';
import React, { type ComponentProps } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/theme';
import { DASHBOARD_UNAVAILABLE_VALUE } from './formatters';

export type DashboardTone = 'default' | 'success' | 'warning' | 'error' | 'info';

interface DashboardMetricCardProps {
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  tone?: DashboardTone;
  helper?: string;
  unavailableLabel: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

const toneColors: Record<DashboardTone, { icon: string; surface: string }> = {
  default: { icon: colors.brand.dark, surface: colors.surface.card },
  success: { icon: colors.status.success, surface: colors.status.successSurface },
  warning: { icon: colors.status.warning, surface: colors.status.warningSurface },
  error: { icon: colors.status.error, surface: colors.status.errorSurface },
  info: { icon: colors.status.info, surface: colors.status.infoSurface },
};

function isUnavailable(value: DashboardMetricCardProps['value']): boolean {
  return value === null || value === undefined || value === '' || value === DASHBOARD_UNAVAILABLE_VALUE ||
    (typeof value === 'number' && !Number.isFinite(value));
}

export function DashboardMetricCard({
  icon,
  label,
  value,
  unit,
  tone = 'default',
  helper,
  unavailableLabel,
  accessibilityLabel,
  style,
}: DashboardMetricCardProps) {
  const unavailable = isUnavailable(value);
  const displayValue = unavailable ? '—' : String(value);
  const announcement = accessibilityLabel ??
    `${label}, ${unavailable ? unavailableLabel : `${displayValue}${unit ? ` ${unit}` : ''}`}${helper ? `. ${helper}` : ''}`;
  const toneStyle = toneColors[tone];

  return (
    <Card
      variant="outlined"
      style={[styles.card, { backgroundColor: toneStyle.surface }, style]}
      testID="dashboard-metric-card"
    >
      <View accessible accessibilityLabel={announcement} style={styles.content}>
        {icon ? <Ionicons name={icon} size={20} color={toneStyle.icon} importantForAccessibility="no" /> : null}
        <AppText variant="caption" color="muted">{label}</AppText>
        <View style={styles.valueRow}>
          <AppText variant="metric" style={styles.value}>{displayValue}</AppText>
          {!unavailable && unit ? <AppText variant="caption" color="link">{unit}</AppText> : null}
        </View>
        {helper ? <AppText variant="helper" color="muted">{helper}</AppText> : null}
        {unavailable && !helper ? <AppText variant="helper" color="muted">{unavailableLabel}</AppText> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexGrow: 1, flexBasis: '46%', minWidth: 0, padding: spacing[3] },
  content: { gap: spacing[1] },
  valueRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing[1] },
  value: { flexShrink: 1 },
});
