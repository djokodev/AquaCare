import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/theme';

interface DashboardProgressProps {
  value: number | null | undefined;
  label: string;
  unavailableLabel: string;
}

export function DashboardProgress({ value, label, unavailableLabel }: DashboardProgressProps) {
  const isAvailable = typeof value === 'number' && Number.isFinite(value);
  const clampedValue = isAvailable ? Math.min(Math.max(value, 0), 100) : 0;
  const accessibilityLabel = isAvailable
    ? `${label}, ${Math.round(clampedValue)}%`
    : `${label}, ${unavailableLabel}`;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={isAvailable ? { min: 0, max: 100, now: clampedValue } : undefined}
      style={styles.container}
    >
      <View style={styles.labelRow}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="label" color={isAvailable ? 'link' : 'muted'}>
          {isAvailable ? `${Math.round(clampedValue)}%` : '—'}
        </AppText>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${clampedValue}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing[2] },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] },
  track: {
    height: spacing[2],
    overflow: 'hidden',
    borderRadius: radii.full,
    backgroundColor: colors.border.subtle,
  },
  fill: { height: '100%', borderRadius: radii.full, backgroundColor: colors.brand.primary },
});
