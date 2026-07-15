import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { spacing } from '@/theme';

interface DashboardDataNoticeProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function DashboardDataNotice({ title, description, actionLabel, onAction }: DashboardDataNoticeProps) {
  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.content}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="helper" color="muted">{description}</AppText>
        {actionLabel && onAction ? (
          <Button label={actionLabel} variant="outline" size="small" fullWidth={false} onPress={onAction} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', padding: spacing[3] },
  content: { gap: spacing[2] },
});
