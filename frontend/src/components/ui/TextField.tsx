import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  secureTextEntry,
  style,
  ...props
}: TextFieldProps) {
  const { t } = useTranslation();
  const [isSecure, setIsSecure] = useState(Boolean(secureTextEntry));
  const isPasswordField = Boolean(secureTextEntry);
  const input = (
      <View style={[styles.inputContainer, multiline && styles.multiline, error && styles.error, !editable && styles.disabled]}>
        {prefix}
        <TextInput
          {...props}
          editable={editable}
          multiline={multiline}
          secureTextEntry={isPasswordField ? isSecure : secureTextEntry}
          accessibilityLabel={label ?? props.accessibilityLabel}
          accessibilityState={
            editable
              ? props.accessibilityState
              : { ...props.accessibilityState, disabled: true }
          }
          placeholderTextColor={colors.text.muted}
          style={[
            styles.input,
            !multiline && styles.centeredInput,
            !multiline && !isSecure && styles.iosPlainTextOffset,
            multiline && styles.multilineInput,
            style,
          ]}
        />
        {isPasswordField ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(isSecure ? 'showPassword' : 'hidePassword')}
            onPress={() => setIsSecure((previous) => !previous)}
            style={styles.visibilityButton}
            hitSlop={8}
          >
            <Ionicons
              name={isSecure ? 'eye-outline' : 'eye-off-outline'}
              size={sizing.iconMedium}
              color={colors.text.muted}
            />
          </Pressable>
        ) : null}
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
  input: { flex: 1, ...typography.body, color: colors.text.primary },
  centeredInput: {
    height: sizing.inputHeight - spacing[3],
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  iosPlainTextOffset: Platform.select({
    ios: { transform: [{ translateY: -3 }] },
    default: {},
  }),
  visibilityButton: { minWidth: sizing.iconLarge, minHeight: sizing.iconLarge, alignItems: 'center', justifyContent: 'center' },
  multiline: { minHeight: 96, alignItems: 'flex-start', paddingVertical: spacing[3] },
  multilineInput: { textAlignVertical: 'top' },
  error: { borderColor: colors.status.error },
  disabled: { backgroundColor: colors.surface.disabled },
});
