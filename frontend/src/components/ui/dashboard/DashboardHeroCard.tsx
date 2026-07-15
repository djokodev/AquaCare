import { Ionicons } from '@expo/vector-icons';
import React, { type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/theme';
import { DashboardProgress } from './DashboardProgress';
import { DASHBOARD_UNAVAILABLE_VALUE } from './formatters';

interface DashboardHeroCardProps {
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  helper?: string;
  unavailableLabel: string;
  accessibilityLabel?: string;
  progress?: number | null;
  progressLabel?: string;
}

export function DashboardHeroCard({
  icon,
  label,
  value,
  unit,
  helper,
  unavailableLabel,
  accessibilityLabel,
  progress,
  progressLabel,
}: DashboardHeroCardProps) {
  const unavailable = value === null || value === undefined || value === '' || value === DASHBOARD_UNAVAILABLE_VALUE ||
    (typeof value === 'number' && !Number.isFinite(value));
  const displayValue = unavailable ? '—' : String(value);
  const announcement = accessibilityLabel ??
    `${label}, ${unavailable ? unavailableLabel : `${displayValue}${unit ? ` ${unit}` : ''}`}`;

  return (
    <Card variant="outlined" style={styles.card} testID="dashboard-hero-card">
      <View accessible accessibilityLabel={announcement} style={styles.header}>
        <View style={styles.labelRow}>
          {icon ? <Ionicons name={icon} size={22} color={colors.brand.dark} importantForAccessibility="no" /> : null}
          <AppText variant="overline" color="link" style={styles.label}>{label}</AppText>
        </View>
        <View style={styles.valueRow}>
          <AppText variant="display" style={styles.value}>{displayValue}</AppText>
          {!unavailable && unit ? <AppText variant="bodyStrong" color="link">{unit}</AppText> : null}
        </View>
        {helper ? <AppText variant="helper" color="muted">{helper}</AppText> : null}
        {unavailable && !helper ? <AppText variant="helper" color="muted">{unavailableLabel}</AppText> : null}
      </View>
      {progressLabel ? (
        <DashboardProgress value={progress} label={progressLabel} unavailableLabel={unavailableLabel} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', gap: spacing[4], backgroundColor: colors.brand.subtle, borderColor: colors.brand.light },
  header: { gap: spacing[2] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  label: { flex: 1 },
  valueRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing[2] },
  value: { flexShrink: 1 },
});
