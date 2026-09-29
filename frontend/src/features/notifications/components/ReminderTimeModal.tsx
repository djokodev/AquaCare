import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, IconButton } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme';

interface ReminderTimeModalProps {
  visible: boolean;
  initialHour: number;
  initialMinute: number;
  title: string;
  onConfirm: (hour: number, minute: number) => void;
  onCancel: () => void;
}

const MINUTE_STEP = 5;

const pad = (value: number) => value.toString().padStart(2, '0');

interface StepperProps {
  label: string;
  value: string;
  onIncrement: () => void;
  onDecrement: () => void;
  incrementLabel: string;
  decrementLabel: string;
}

function Stepper({ label, value, onIncrement, onDecrement, incrementLabel, decrementLabel }: StepperProps) {
  return (
    <View style={styles.stepper}>
      <AppText variant="caption" color="muted">{label}</AppText>
      <IconButton icon="chevron-up" variant="ghost" accessibilityLabel={incrementLabel} onPress={onIncrement} />
      <AppText variant="metric" accessibilityLiveRegion="polite">{value}</AppText>
      <IconButton icon="chevron-down" variant="ghost" accessibilityLabel={decrementLabel} onPress={onDecrement} />
    </View>
  );
}

/** Sélecteur d'heure simple (heures et minutes par pas de 5), sans dépendance native. */
export function ReminderTimeModal({ visible, initialHour, initialMinute, title, onConfirm, onCancel }: ReminderTimeModalProps) {
  const { t } = useTranslation();
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);

  useEffect(() => {
    if (visible) {
      setHour(initialHour);
      setMinute(initialMinute - (initialMinute % MINUTE_STEP));
    }
  }, [initialHour, initialMinute, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <AppText variant="cardTitle">{title}</AppText>
          <View style={styles.row}>
            <Stepper
              label={t('reminderHours')}
              value={pad(hour)}
              onIncrement={() => setHour((current) => (current + 1) % 24)}
              onDecrement={() => setHour((current) => (current + 23) % 24)}
              incrementLabel={t('reminderIncreaseHour')}
              decrementLabel={t('reminderDecreaseHour')}
            />
            <AppText variant="metric">:</AppText>
            <Stepper
              label={t('reminderMinutes')}
              value={pad(minute)}
              onIncrement={() => setMinute((current) => (current + MINUTE_STEP) % 60)}
              onDecrement={() => setMinute((current) => (current + 60 - MINUTE_STEP) % 60)}
              incrementLabel={t('reminderIncreaseMinute')}
              decrementLabel={t('reminderDecreaseMinute')}
            />
          </View>
          <Button label={t('save')} onPress={() => onConfirm(hour, minute)} />
          <Button label={t('cancel')} variant="ghost" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing[5],
    backgroundColor: colors.overlay.default,
  },
  dialog: {
    gap: spacing[3],
    padding: spacing[5],
    borderRadius: radii.xl,
    backgroundColor: colors.surface.card,
    ...shadows.large,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  stepper: { alignItems: 'center' },
});
