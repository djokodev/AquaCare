import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/theme';

interface DashboardSyncStatusProps {
  lastSyncedAt: string | number | Date | null | undefined;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function toTimestamp(value: DashboardSyncStatusProps['lastSyncedAt']): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function DashboardSyncStatus({ lastSyncedAt }: DashboardSyncStatusProps) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const timestamp = toTimestamp(lastSyncedAt);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  const label = useMemo(() => {
    if (timestamp === null) {
      return t('dashboardSyncNever');
    }
    const elapsed = Math.max(now - timestamp, 0);
    if (elapsed < MINUTE_MS) {
      return t('dashboardSyncNow');
    }
    if (elapsed < HOUR_MS) {
      const count = Math.floor(elapsed / MINUTE_MS);
      return t(count === 1 ? 'dashboardSyncMinutesAgo_one' : 'dashboardSyncMinutesAgo_other', { count });
    }
    if (elapsed < DAY_MS) {
      const count = Math.floor(elapsed / HOUR_MS);
      return t(count === 1 ? 'dashboardSyncHoursAgo_one' : 'dashboardSyncHoursAgo_other', { count });
    }
    if (elapsed < 2 * DAY_MS) {
      return t('dashboardSyncYesterday');
    }
    const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
    return t('dashboardSyncOnDate', {
      date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(timestamp),
    });
  }, [i18n.language, now, t, timestamp]);

  const synced = timestamp !== null;
  return (
    <View accessible accessibilityLabel={label} style={styles.row} testID="dashboard-sync-status">
      <View style={[styles.dot, synced ? styles.syncedDot : styles.unsyncedDot]} />
      <AppText variant="caption" color="muted">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  dot: { width: spacing[2], height: spacing[2], borderRadius: radii.full },
  syncedDot: { backgroundColor: colors.status.success },
  unsyncedDot: { borderWidth: 1, borderColor: colors.text.muted },
});
