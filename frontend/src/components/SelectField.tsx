import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { AppText, FormField, SelectionModal } from "@/components/ui";
import { colors, radii, sizing, spacing } from "@/theme";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
interface SelectFieldProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

/** Cross-platform selection field backed by the shared accessible modal. */
export default function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  required = false,
  disabled = false,
}: SelectFieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <FormField label={label} required={required} error={error}>
      <View style={[
        styles.fieldContainer,
        visible && styles.expanded,
        error && styles.error,
        disabled && styles.disabled,
      ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled, expanded: visible }}
          disabled={disabled}
          onPress={() => setVisible(true)}
          style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
        >
          <View style={styles.fieldContent}>
            <AppText variant="body" color={selected ? "primary" : "muted"} style={styles.value}>
              {selected?.label ?? placeholder ?? t("selectOption")}
            </AppText>
            <Ionicons
              name="chevron-down"
              size={sizing.iconMedium}
              color={colors.text.muted}
            />
          </View>
        </Pressable>
      </View>
      <SelectionModal
        visible={visible}
        title={label}
        options={options}
        selectedValue={value}
        onSelect={(nextValue) => {
          onChange(nextValue);
          setVisible(false);
        }}
        onClose={() => setVisible(false)}
        closeLabel={t("cancel")}
        emptyLabel={t("noOptionsAvailable")}
      />
    </FormField>
  );
}
const styles = StyleSheet.create({
  fieldContainer: {
    width: "100%",
    minHeight: sizing.inputHeight,
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: radii.md,
    backgroundColor: colors.surface.card,
    paddingHorizontal: spacing[4],
  },
  pressable: { flex: 1, justifyContent: "center" },
  fieldContent: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  value: { flex: 1, minHeight: 24 },
  expanded: { borderColor: colors.brand.primary, backgroundColor: colors.surface.selected },
  error: { borderColor: colors.status.error },
  disabled: { backgroundColor: colors.surface.disabled },
  pressed: { opacity: 0.72 },
});
