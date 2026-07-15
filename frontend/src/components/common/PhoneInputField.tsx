import React from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatCameroonPhone } from "@/utils/phoneFormatter";
import { AppText, FormField } from "@/components/ui";
import { colors, radii, sizing, spacing, typography } from "@/theme";

interface PhoneInputFieldProps {
  value: string;
  onChange: (formatted: string) => void;
  error?: string;
  label?: string;
  required?: boolean;
  hint?: string;
}

/**
 * Champ de saisie téléphone camerounais avec préfixe +237 intégré.
 * Partagé entre LoginScreen et RegisterScreen.
 */
export default function PhoneInputField({
  value,
  onChange,
  error,
  label,
  required,
  hint,
}: PhoneInputFieldProps) {
  const { t } = useTranslation();

  const displayLabel = label ?? t("phoneNumber");

  return (
    <FormField
      label={displayLabel}
      required={required}
      hint={hint}
      error={error ? t(error, { defaultValue: error }) : undefined}
    >
      <View style={[styles.inputContainer, error && styles.error]}>
        <View style={styles.prefixContainer}>
          <AppText variant="bodyStrong">+237</AppText>
        </View>
        <TextInput
          accessibilityLabel={displayLabel}
          accessibilityHint={hint}
          style={styles.input}
          value={value.replace("+237", "")}
          onChangeText={(raw) => onChange(formatCameroonPhone(raw))}
          placeholder={t("placeholderPhoneExample")}
          keyboardType="phone-pad"
          maxLength={9}
          autoComplete="tel"
        />
      </View>
    </FormField>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    minHeight: sizing.inputHeight,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radii.md,
    backgroundColor: colors.surface.card,
    paddingHorizontal: spacing[3],
  },
  prefixContainer: {
    height: typography.body.lineHeight,
    justifyContent: "center",
    marginRight: spacing[2],
    paddingRight: spacing[2],
    borderRightWidth: 1,
    borderRightColor: colors.border.subtle,
  },
  input: {
    flex: 1,
    height: typography.body.lineHeight,
    ...typography.body,
    color: colors.text.primary,
    paddingVertical: 0,
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: "center",
    transform: [{ translateY: -3 }],
  },
  error: { borderColor: colors.status.error },
});
