import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radii, shadows, spacing } from "@/theme";

interface CardProps {
  children: React.ReactNode;
  variant?: "default" | "outlined" | "elevated" | "selected";
  style?: StyleProp<ViewStyle>;
}
interface SelectableCardProps extends CardProps {
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
  layout?: "row" | "column";
  primaryBorder?: boolean;
}

export function Card({ children, variant = "default", style }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        variant === "outlined" && styles.outlined,
        variant === "elevated" && shadows.medium,
        variant === "selected" && styles.selected,
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function SelectableCard({
  children,
  onPress,
  selected = false,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
  layout = "column",
  primaryBorder = false,
}: SelectableCardProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.outlined,
        layout === "row" && styles.row,
        primaryBorder && styles.primaryBorder,
        selected && styles.selected,
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.8 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.lg,
    padding: spacing[4],
  },
  outlined: { borderWidth: 1, borderColor: colors.border.default },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  primaryBorder: { borderColor: colors.brand.primary },
  selected: {
    backgroundColor: colors.surface.selected,
    borderColor: colors.border.focus,
  },
});
