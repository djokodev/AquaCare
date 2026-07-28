import React from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { colors, radii, sizing, spacing, typography } from '@/theme';

/** A token-based, auto-growing multiline field for compact composers. */
export function MultilineTextField({ style, accessibilityLabel, ...props }: TextInputProps) {
  return (
    <TextInput
      {...props}
      multiline
      accessibilityLabel={accessibilityLabel}
      placeholderTextColor={colors.text.muted}
      textAlignVertical="center"
      style={[styles.input, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: sizing.inputHeight,
    maxHeight: sizing.inputHeight * 2,
    flex: 1,
    borderRadius: radii.full,
    backgroundColor: colors.surface.page,
    color: colors.text.primary,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    ...typography.body,
  },
});
