import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, IconButton } from '@/components/ui';
import { colors, radii, shadows, spacing, typography } from '@/theme';

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

/** Convertit la saisie en nombre borné (saisie vide ou invalide = 0). */
const clamp = (text: string, max: number): number => {
  const parsed = parseInt(text, 10);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Math.min(Math.max(parsed, 0), max);
};

interface StepperProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  incrementLabel: string;
  decrementLabel: string;
  testID: string;
}

function Stepper({ label, value, onChangeText, onBlur, onIncrement, onDecrement, incrementLabel, decrementLabel, testID }: StepperProps) {
  return (
    <View style={styles.stepper}>
      <AppText variant="caption" color="muted">{label}</AppText>
      <IconButton icon="chevron-up" variant="ghost" accessibilityLabel={incrementLabel} onPress={onIncrement} />
      <TextInput
        testID={testID}
        style={styles.timeInput}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, '').slice(0, 2))}
        onBlur={onBlur}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        accessibilityLabel={label}
      />
      <IconButton icon="chevron-down" variant="ghost" accessibilityLabel={decrementLabel} onPress={onDecrement} />
    </View>
  );
}

/**
 * Sélecteur d'heure : flèches (heures ±1, minutes ±5) ou saisie directe
 * des chiffres pour atteindre une valeur précise (ex. 02 ou 50 minutes).
 */
export function ReminderTimeModal({ visible, initialHour, initialMinute, title, onConfirm, onCancel }: ReminderTimeModalProps) {
  const { t } = useTranslation();
  const [hourText, setHourText] = useState(pad(initialHour));
  const [minuteText, setMinuteText] = useState(pad(initialMinute));

  useEffect(() => {
    if (visible) {
      setHourText(pad(initialHour));
      setMinuteText(pad(initialMinute));
    }
  }, [initialHour, initialMinute, visible]);

  const hour = clamp(hourText, 23);
  const minute = clamp(minuteText, 59);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <AppText variant="cardTitle">{title}</AppText>
          <View style={styles.row}>
            <Stepper
              testID="reminder-hour-input"
              label={t('reminderHours')}
              value={hourText}
              onChangeText={setHourText}
              onBlur={() => setHourText(pad(hour))}
              onIncrement={() => setHourText(pad((hour + 1) % 24))}
              onDecrement={() => setHourText(pad((hour + 23) % 24))}
              incrementLabel={t('reminderIncreaseHour')}
              decrementLabel={t('reminderDecreaseHour')}
            />
            <AppText variant="metric">:</AppText>
            <Stepper
              testID="reminder-minute-input"
              label={t('reminderMinutes')}
              value={minuteText}
              onChangeText={setMinuteText}
              onBlur={() => setMinuteText(pad(minute))}
              onIncrement={() => setMinuteText(pad((minute + MINUTE_STEP) % 60))}
              onDecrement={() => setMinuteText(pad((minute + 60 - MINUTE_STEP) % 60))}
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
  timeInput: {
    ...typography.metric,
    minWidth: 64,
    paddingVertical: spacing[1],
    textAlign: 'center',
    color: colors.text.primary,
    borderBottomWidth: 2,
    borderBottomColor: colors.brand.primary,
  },
});
