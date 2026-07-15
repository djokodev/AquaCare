import { Ionicons } from '@expo/vector-icons';
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
  success: { icon: 'checkmark-circle' as const, color: colors.status.success, surface: colors.status.successSurface },
  warning: { icon: 'warning' as const, color: colors.status.warning, surface: colors.status.warningSurface },
  error: { icon: 'alert-circle' as const, color: colors.status.error, surface: colors.status.errorSurface },
  info: { icon: 'information-circle' as const, color: colors.status.info, surface: colors.status.infoSurface },
};

export function DashboardStatus({ title, description, tone = 'info' }: DashboardStatusProps) {
  const selectedTone = toneStyles[tone];
  return (
    <Card variant="outlined" style={[styles.card, { backgroundColor: selectedTone.surface }]}>
      <Ionicons name={selectedTone.icon} size={24} color={selectedTone.color} importantForAccessibility="no" />
      <View accessible accessibilityLabel={description ? `${title}. ${description}` : title} style={styles.copy}>
        <AppText variant="bodyStrong">{title}</AppText>
        {description ? <AppText variant="helper" color="muted">{description}</AppText> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  copy: { flex: 1, gap: spacing[1] },
});
