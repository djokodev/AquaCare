import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/theme';
import { DashboardSyncStatus } from './DashboardSyncStatus';

interface DashboardSectionProps {
  title: string;
  subtitle?: string;
  lastSyncedAt: string | number | Date | null | undefined;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardSection({ title, subtitle, lastSyncedAt, action, children }: DashboardSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText variant="sectionTitle">{title}</AppText>
          {subtitle ? <AppText variant="helper" color="muted">{subtitle}</AppText> : null}
          <DashboardSyncStatus lastSyncedAt={lastSyncedAt} />
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing[4] },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing[3] },
  headingCopy: { flex: 1, gap: spacing[1] },
});
