import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { AppText, Button, FormField } from '@/components/ui';
import { colors, radii, sizing, spacing } from '@/theme';

interface FeedingTimesFieldProps {
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
  required?: boolean;
}

const pad = (value: number) => String(value).padStart(2, '0');

export default function FeedingTimesField({
  value,
  onChange,
  error,
  required = false,
}: FeedingTimesFieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [hour, setHour] = useState('08');
  const [minute, setMinute] = useState('00');
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => pad(index)), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, index) => pad(index)), []);

  const addTime = () => {
    const nextTime = `${hour}:${minute}`;
    onChange([...new Set([...value, nextTime])].sort());
    setVisible(false);
  };

  const removeTime = (time: string) => {
    onChange(value.filter((item) => item !== time));
  };

  return (
    <FormField label={t('feedingTimes')} required={required} error={error}>
      <View style={styles.chips}>
        {value.map((time) => (
          <View key={time} style={styles.chip}>
            <AppText variant="label" color="link">{time}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('removeFeedingTime', { time })}
              hitSlop={8}
              onPress={() => removeTime(time)}
            >
              <Ionicons name="close-circle" size={sizing.iconMedium} color={colors.brand.dark} />
            </Pressable>
          </View>
        ))}
      </View>

      <Button
        label={t('addFeedingTime')}
        onPress={() => setVisible(true)}
        variant="outline"
        iconLeft="time-outline"
      />

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <AppText variant="cardTitle">{t('selectFeedingTime')}</AppText>
            <View style={styles.pickers}>
              <View style={styles.pickerColumn}>
                <AppText variant="label" color="muted">{t('hour')}</AppText>
                <Picker
                  testID="feeding-hour-picker"
                  selectedValue={hour}
                  onValueChange={(selectedValue: string) => setHour(selectedValue)}
                  style={styles.picker}
                >
                  {hours.map((item) => <Picker.Item key={item} label={item} value={item} />)}
                </Picker>
              </View>
              <View style={styles.pickerColumn}>
                <AppText variant="label" color="muted">{t('minute')}</AppText>
                <Picker
                  testID="feeding-minute-picker"
                  selectedValue={minute}
                  onValueChange={(selectedValue: string) => setMinute(selectedValue)}
                  style={styles.picker}
                >
                  {minutes.map((item) => <Picker.Item key={item} label={item} value={item} />)}
                </Picker>
              </View>
            </View>
            <View style={styles.actions}>
              <Button
                label={t('cancel')}
                onPress={() => setVisible(false)}
                variant="ghost"
                fullWidth={false}
              />
              <Button label={t('add')} onPress={addTime} fullWidth={false} />
            </View>
          </View>
        </View>
      </Modal>
    </FormField>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  chip: {
    minHeight: sizing.controlSmall,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radii.full,
    backgroundColor: colors.status.successSurface,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing[5],
    backgroundColor: colors.overlay.default,
  },
  modalCard: {
    gap: spacing[4],
    padding: spacing[5],
    borderRadius: radii.xl,
    backgroundColor: colors.surface.card,
  },
  pickers: { flexDirection: 'row', gap: spacing[3] },
  pickerColumn: { flex: 1, gap: spacing[1] },
  picker: { minHeight: 160 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[3] },
});
