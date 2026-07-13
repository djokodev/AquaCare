import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, opacity, radii, sizing, spacing } from '@/theme';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  accessibilityLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({ value, options, onChange, disabled = false }: SegmentedControlProps<T>) {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.option, selected && styles.selected, (pressed || disabled) && { opacity: disabled ? opacity.disabled : opacity.pressed }]}
          >
            <AppText variant="label" color={selected ? 'inverse' : 'muted'}>{option.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: colors.surface.page, borderRadius: radii.lg, padding: spacing[1] },
  option: { flex: 1, minHeight: sizing.touchTargetMinimum, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, paddingHorizontal: spacing[2] },
  selected: { backgroundColor: colors.brand.primary },
});
