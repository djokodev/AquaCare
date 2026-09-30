import React, { useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';

import { AppHeader, AppText, Button, Card, IconButton, InlineAlert, LoadingState } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/MainNavigator';
import { colors, radii, spacing } from '@/theme';
import { ReminderTimeModal } from '../components/ReminderTimeModal';
import { formatReminderTime, ReminderTime } from '../reminders/feedingReminders';
import { useFeedingReminders } from '../reminders/useFeedingReminders';

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'FeedingReminders'>;
};

/** Jours affichés du lundi au dimanche (format Expo : 1 = dimanche). */
const DISPLAY_DAYS: { weekday: number; letterKey: string; labelKey: string }[] = [
  { weekday: 2, letterKey: 'weekdayLetterMon', labelKey: 'weekdayMon' },
  { weekday: 3, letterKey: 'weekdayLetterTue', labelKey: 'weekdayTue' },
  { weekday: 4, letterKey: 'weekdayLetterWed', labelKey: 'weekdayWed' },
  { weekday: 5, letterKey: 'weekdayLetterThu', labelKey: 'weekdayThu' },
  { weekday: 6, letterKey: 'weekdayLetterFri', labelKey: 'weekdayFri' },
  { weekday: 7, letterKey: 'weekdayLetterSat', labelKey: 'weekdaySat' },
  { weekday: 1, letterKey: 'weekdayLetterSun', labelKey: 'weekdaySun' },
];

type EditingState = { id?: string; hour: number; minute: number } | null;

export default function FeedingRemindersScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { settings, loading, status, canAddTime, setEnabled, saveTime, removeTime, toggleDay, setBypassDnd } = useFeedingReminders();
  const [editing, setEditing] = useState<EditingState>(null);

  const timesLabel = useMemo(() => settings.times.map(formatReminderTime).join(', '), [settings.times]);

  const statusAlert = (() => {
    if (status === 'permission_denied') {
      return <InlineAlert tone="error" message={t('remindersPermissionDenied')} />;
    }
    if (status === 'error') {
      return <InlineAlert tone="warning" message={t('remindersScheduleError')} />;
    }
    if (!settings.enabled) {
      return <InlineAlert tone="info" message={t('remindersDisabledInfo')} />;
    }
    if (settings.times.length === 0 || settings.days.length === 0) {
      return <InlineAlert tone="warning" message={t('remindersNothingToSchedule')} />;
    }
    return <InlineAlert tone="success" message={t('remindersActive', { times: timesLabel })} />;
  })();

  const confirmRemove = (time: ReminderTime) => {
    Alert.alert(t('reminderDeleteTitle'), t('reminderDeleteMessage', { time: formatReminderTime(time) }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('reminderDeleteConfirm'), style: 'destructive', onPress: () => void removeTime(time.id) },
    ]);
  };

  const header = (
    <AppHeader title={t('feedingRemindersTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} />
  );

  if (loading) {
    return <View style={styles.root}>{header}<LoadingState message={t('loading')} /></View>;
  }

  return (
    <View style={styles.root}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <View style={styles.switchRow}>
            <AppText variant="bodyStrong" style={styles.flex}>{t('remindersEnable')}</AppText>
            <Switch
              accessibilityLabel={t('remindersEnable')}
              value={settings.enabled}
              onValueChange={(value) => void setEnabled(value)}
              trackColor={{ true: colors.brand.primary, false: colors.border.default }}
            />
          </View>
          {statusAlert}
          {status === 'permission_denied' ? (
            <Button label={t('openSettings')} variant="outline" iconLeft="settings-outline" onPress={() => void Linking.openSettings()} />
          ) : null}
        </Card>

        <View style={styles.section}>
          <AppText variant="sectionTitle">{t('remindersTimes')}</AppText>
          <Card style={styles.card}>
            {settings.times.length === 0 ? (
              <AppText color="muted">{t('remindersNoTimes')}</AppText>
            ) : (
              settings.times.map((time) => (
                <View key={time.id} style={styles.timeRow}>
                  <AppText variant="cardTitle" style={styles.flex}>{formatReminderTime(time)}</AppText>
                  <IconButton
                    icon="create-outline"
                    variant="ghost"
                    accessibilityLabel={t('reminderEditTime', { time: formatReminderTime(time) })}
                    onPress={() => setEditing({ id: time.id, hour: time.hour, minute: time.minute })}
                  />
                  <IconButton
                    icon="trash-outline"
                    variant="danger"
                    accessibilityLabel={t('reminderDeleteTime', { time: formatReminderTime(time) })}
                    onPress={() => confirmRemove(time)}
                  />
                </View>
              ))
            )}
            <Button
              label={t('reminderAddTime')}
              variant="outline"
              iconLeft="add"
              disabled={!canAddTime}
              onPress={() => setEditing({ hour: 12, minute: 0 })}
            />
            {!canAddTime ? <AppText variant="caption" color="muted">{t('reminderMaxTimes')}</AppText> : null}
          </Card>
        </View>

        <View style={styles.section}>
          <AppText variant="sectionTitle">{t('remindersDays')}</AppText>
          <View style={styles.days}>
            {DISPLAY_DAYS.map(({ weekday, letterKey, labelKey }) => {
              const selected = settings.days.includes(weekday);
              return (
                <Pressable
                  key={weekday}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={t(labelKey)}
                  onPress={() => void toggleDay(weekday)}
                  style={[styles.dayChip, selected && styles.dayChipSelected]}
                >
                  <AppText variant="bodyStrong" color={selected ? 'inverse' : 'primary'}>{t(letterKey)}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {Platform.OS === 'android' ? (
          <Card style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{t('remindersBypassDnd')}</AppText>
                <AppText variant="caption" color="muted">{t('remindersBypassDndHelp')}</AppText>
              </View>
              <Switch
                accessibilityLabel={t('remindersBypassDnd')}
                value={settings.bypassDnd}
                onValueChange={(value) => void setBypassDnd(value)}
                trackColor={{ true: colors.brand.primary, false: colors.border.default }}
              />
            </View>
          </Card>
        ) : null}

      </ScrollView>

      <ReminderTimeModal
        visible={editing !== null}
        title={editing?.id ? t('reminderEditTitle') : t('reminderAddTime')}
        initialHour={editing?.hour ?? 12}
        initialMinute={editing?.minute ?? 0}
        onCancel={() => setEditing(null)}
        onConfirm={(hour, minute) => {
          const current = editing;
          setEditing(null);
          void saveTime({ id: current?.id, hour, minute });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  content: { padding: spacing[4], gap: spacing[4], paddingBottom: spacing[8] },
  card: { gap: spacing[3] },
  section: { gap: spacing[3] },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  // 7 pastilles rondes de même taille sur une seule ligne.
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[2] },
  dayChip: {
    flex: 1,
    maxWidth: 48,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.card,
  },
  dayChipSelected: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
});
