import React from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { FormField } from './FormField';
import { colors, radii, sizing, spacing, typography } from '@/theme';
interface TextFieldProps extends TextInputProps {
  /** Omit when a surrounding FormField already supplies the accessible label. */
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export function TextField({
  label,
  required,
  hint,
  error,
  prefix,
  suffix,
  multiline,
  editable = true,
  style,
  ...props
}: TextFieldProps) {
  const input = (
      <View style={[styles.inputContainer, multiline && styles.multiline, error && styles.error, !editable && styles.disabled]}>
        {prefix}
        <TextInput
          {...props}
          editable={editable}
          multiline={multiline}
          accessibilityLabel={label ?? props.accessibilityLabel}
          accessibilityState={
            editable
              ? props.accessibilityState
              : { ...props.accessibilityState, disabled: true }
          }
          placeholderTextColor={colors.text.muted}
          style={[styles.input, multiline && styles.multilineInput, style]}
        />
        {suffix}
      </View>
  );

  return label ? (
    <FormField label={label} required={required} hint={hint} error={error}>
      {input}
    </FormField>
  ) : input;
}

const styles = StyleSheet.create({
  inputContainer: { minHeight: sizing.inputHeight, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border.default, borderRadius: radii.md, backgroundColor: colors.surface.card, paddingHorizontal: spacing[3] },
  input: { flex: 1, ...typography.body, color: colors.text.primary, paddingVertical: 0 },
  multiline: { minHeight: 96, alignItems: 'flex-start', paddingVertical: spacing[3] },
  multilineInput: { textAlignVertical: 'top' },
  error: { borderColor: colors.status.error },
  disabled: { backgroundColor: colors.surface.disabled },
});
