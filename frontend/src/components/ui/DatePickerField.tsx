import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, radii, shadows, sizing, spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { FormField } from './FormField';

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  hint?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  testID?: string;
  showLabel?: boolean;
}

const parseIsoDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dayOnly = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const isSameDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate();

const isSelectable = (date: Date, minimumDate?: Date, maximumDate?: Date): boolean => {
  const value = dayOnly(date).getTime();
  return (!minimumDate || value >= dayOnly(minimumDate).getTime())
    && (!maximumDate || value <= dayOnly(maximumDate).getTime());
};

const shiftMonth = (date: Date, amount: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

export function DatePickerField({
  label,
  value,
  onChange,
  required = false,
  error,
  hint,
  minimumDate,
  maximumDate,
  testID,
  showLabel = true,
}: DatePickerFieldProps) {
  const { t, i18n } = useTranslation();
  const parsedValue = useMemo(() => parseIsoDate(value), [value]);
  const fallbackDate = useMemo(
    () => dayOnly(maximumDate ?? new Date()),
    [maximumDate?.getTime()],
  );
  const [visible, setVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(parsedValue ?? fallbackDate);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date((parsedValue ?? fallbackDate).getFullYear(), (parsedValue ?? fallbackDate).getMonth(), 1),
  );
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';

  useEffect(() => {
    if (visible) {
      const nextDate = parsedValue ?? fallbackDate;
      setDraftDate(nextDate);
      setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    }
  }, [fallbackDate, parsedValue, visible]);

  const displayedValue = parsedValue
    ? new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(parsedValue)
    : t('selectDate');

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(visibleMonth);
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
      new Date(2024, 0, 1 + index),
    ).replace('.', '').slice(0, 2),
  );
  const firstWeekday = (new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1,
  ).getDay() + 6) % 7;
  const daysInMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const calendarCells = Array.from(
    { length: firstWeekday + daysInMonth },
    (_, index) => index < firstWeekday ? null : index - firstWeekday + 1,
  );
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const canMoveToMonth = (amount: number): boolean => {
    const target = shiftMonth(visibleMonth, amount);
    const targetStart = target.getTime();
    const targetEnd = shiftMonth(target, 1).getTime() - 1;
    return (!minimumDate || targetEnd >= dayOnly(minimumDate).getTime())
      && (!maximumDate || targetStart <= dayOnly(maximumDate).getTime());
  };

  const handleConfirm = () => {
    onChange(formatIsoDate(draftDate));
    setVisible(false);
  };

  return (
    <FormField label={showLabel ? label : undefined} required={required} error={error} hint={hint}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('openDatePicker')}
        accessibilityValue={{ text: value || t('selectDate') }}
        onPress={() => setVisible(true)}
        style={styles.pressable}
      >
        {({ pressed }) => (
          <View style={[
            styles.input,
            error && styles.inputError,
            pressed && styles.pressed,
          ]}>
            <AppText
              color={parsedValue ? 'primary' : 'muted'}
              numberOfLines={1}
              style={styles.inputText}
            >
              {displayedValue}
            </AppText>
            <View style={styles.iconContainer}>
              <Ionicons
                name="calendar-outline"
                size={sizing.iconMedium}
                color={colors.brand.primary}
              />
            </View>
          </View>
        )}
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <SafeAreaView style={styles.sheet}>
            <View style={styles.modalContent}>
              <AppText variant="cardTitle">{label}</AppText>
              <View style={styles.monthHeader}>
                <Pressable
                  testID={`${testID ?? 'datePicker'}-previous-month`}
                  accessibilityRole="button"
                  accessibilityLabel={t('previousMonth')}
                  disabled={!canMoveToMonth(-1)}
                  onPress={() => setVisibleMonth((current) => shiftMonth(current, -1))}
                  style={styles.monthButton}
                >
                  <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
                </Pressable>
                <AppText variant="bodyStrong" style={styles.monthLabel}>{monthLabel}</AppText>
                <Pressable
                  testID={`${testID ?? 'datePicker'}-next-month`}
                  accessibilityRole="button"
                  accessibilityLabel={t('nextMonth')}
                  disabled={!canMoveToMonth(1)}
                  onPress={() => setVisibleMonth((current) => shiftMonth(current, 1))}
                  style={styles.monthButton}
                >
                  <Ionicons name="chevron-forward" size={22} color={colors.text.primary} />
                </Pressable>
              </View>
              <View style={styles.weekdayRow}>
                {weekdayLabels.map((weekday, index) => (
                  <AppText key={`${weekday}-${index}`} variant="caption" color="muted" style={styles.weekday}>
                    {weekday}
                  </AppText>
                ))}
              </View>
              <View style={styles.calendarGrid} testID={`${testID ?? 'datePicker'}-calendar`}>
                {calendarCells.map((day, index) => {
                  if (day === null) return <View key={`empty-${index}`} style={styles.dayCell} />;
                  const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
                  const selectable = isSelectable(date, minimumDate, maximumDate);
                  const selected = isSameDay(date, draftDate);
                  return (
                    <Pressable
                      key={date.toISOString()}
                      testID={`${testID ?? 'datePicker'}-day-${formatIsoDate(date)}`}
                      accessibilityRole="button"
                      accessibilityLabel={formatIsoDate(date)}
                      accessibilityState={{ selected, disabled: !selectable }}
                      disabled={!selectable}
                      onPress={() => setDraftDate(date)}
                      style={[styles.dayCell, selected && styles.selectedDay, !selectable && styles.disabledDay]}
                    >
                      <AppText color={selected ? 'inverse' : selectable ? 'primary' : 'muted'}>
                        {String(day)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.actions}>
                <View style={styles.action}>
                  <Button label={t('cancel')} variant="outline" onPress={() => setVisible(false)} />
                </View>
                <View style={styles.action}>
                  <Button label={t('confirm')} onPress={handleConfirm} />
                </View>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </FormField>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
    alignSelf: 'stretch',
  },
  input: {
    width: '100%',
    minHeight: sizing.inputHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radii.md,
    backgroundColor: colors.surface.card,
  },
  inputText: { flex: 1 },
  iconContainer: {
    minWidth: sizing.iconLarge,
    minHeight: sizing.iconLarge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputError: { borderColor: colors.status.error },
  pressed: { opacity: 0.72 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay.default },
  sheet: {
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    backgroundColor: colors.surface.card,
    overflow: 'hidden',
    ...shadows.large,
  },
  modalContent: { gap: spacing[4], paddingHorizontal: spacing[5], paddingTop: spacing[5], paddingBottom: spacing[3] },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthLabel: { textTransform: 'capitalize' },
  monthButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.full },
  weekdayRow: { flexDirection: 'row' },
  weekday: { width: '14.2857%', textAlign: 'center', textTransform: 'uppercase' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.full },
  selectedDay: { backgroundColor: colors.brand.primary },
  disabledDay: { opacity: 0.35 },
  actions: { flexDirection: 'row', gap: spacing[3] },
  action: { flex: 1 },
});
