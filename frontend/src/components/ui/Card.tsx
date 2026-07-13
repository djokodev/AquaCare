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
  testID?: string;
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

interface InteractiveCardProps extends CardProps {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
  primaryBorder?: boolean;
}

export function Card({
  children,
  variant = "default",
  style,
  testID,
}: CardProps) {
  return (
    <View
      testID={testID}
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
      style={styles.pressable}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.card,
            styles.outlined,
            layout === "row" && styles.row,
            primaryBorder && styles.primaryBorder,
            selected && styles.selected,
            disabled && styles.disabledVisual,
            pressed && styles.pressedVisual,
            style,
          ]}
        >
          {children}
        </View>
      )}
    </Pressable>
  );
}

export function InteractiveCard({
  children,
  onPress,
  disabled = false,
  accessibilityLabel,
  testID,
  primaryBorder = false,
  style,
}: InteractiveCardProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.pressable}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.card,
            styles.row,
            styles.interactive,
            primaryBorder && styles.primaryBorder,
            disabled && styles.disabledVisual,
            pressed && styles.pressedVisual,
            style,
          ]}
        >
          {children}
        </View>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.lg,
    padding: spacing[4],
  },
  pressable: { alignSelf: "stretch", width: "100%" },
  outlined: { borderWidth: 1, borderColor: colors.border.default },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  interactive: { minHeight: 56 },
  primaryBorder: { borderColor: colors.brand.primary },
  disabledVisual: { opacity: 1 },
  pressedVisual: { opacity: 0.8 },
  selected: {
    backgroundColor: colors.surface.selected,
    borderColor: colors.border.focus,
  },
});
