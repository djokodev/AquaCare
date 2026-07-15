import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/theme';
import type { DashboardTone } from './DashboardMetricCard';

interface DashboardStatusProps {
  title: string;
  description?: string;
  tone?: Exclude<DashboardTone, 'default'>;
}

const toneStyles = {
  success: { surface: colors.status.successSurface },
  warning: { surface: colors.status.warningSurface },
  error: { surface: colors.status.errorSurface },
  info: { surface: colors.status.infoSurface },
};

export function DashboardStatus({ title, description, tone = 'info' }: DashboardStatusProps) {
  const selectedTone = toneStyles[tone];
  return (
    <Card variant="outlined" style={[styles.card, { backgroundColor: selectedTone.surface }]}>
      <View accessible accessibilityLabel={description ? `${title}. ${description}` : title} style={styles.copy}>
        <AppText variant="bodyStrong">{title}</AppText>
        {description ? <AppText variant="helper" color="muted">{description}</AppText> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing[1] },
  copy: { flex: 1, gap: spacing[1] },
});
