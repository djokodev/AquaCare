import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { colors, opacity, radii, sizing, spacing } from '@/theme';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  iconLeft?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const backgrounds: Record<ButtonVariant, string> = {
  primary: colors.brand.primary,
  outline: colors.surface.card,
  ghost: 'transparent',
  danger: colors.status.error,
};
const textColors: Record<ButtonVariant, 'inverse' | 'link'> = {
  primary: 'inverse', outline: 'link', ghost: 'link', danger: 'inverse',
};
const heights: Record<ButtonSize, number> = { small: sizing.controlSmall, medium: sizing.controlMedium, large: sizing.controlLarge };

export function Button({ label, onPress, variant = 'primary', size = 'medium', loading = false, disabled = false, fullWidth = true, iconLeft, iconRight, accessibilityHint, style, testID }: ButtonProps) {
  const inactive = disabled || loading;
  const textColor = inactive ? 'disabled' : textColors[variant];
  const iconColor = textColor === 'inverse' ? colors.text.inverse : textColor === 'disabled' ? colors.text.disabled : colors.text.link;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.base, { minHeight: heights[size], backgroundColor: backgrounds[variant] }, variant === 'outline' && styles.outline, inactive && styles.disabled, fullWidth && styles.fullWidth, pressed && styles.pressed, style]}
    >
      <View style={[styles.content, loading && styles.loadingContent]}>
        {iconLeft ? <Ionicons name={iconLeft} size={sizing.iconMedium} color={iconColor} /> : null}
        <AppText variant={size === 'small' ? 'label' : 'button'} color={textColor} style={iconLeft || iconRight ? styles.labelWithIcon : undefined}>{label}</AppText>
        {iconRight ? <Ionicons name={iconRight} size={sizing.iconMedium} color={iconColor} /> : null}
      </View>
      {loading ? <ActivityIndicator style={styles.loader} color={iconColor} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, paddingHorizontal: spacing[4] },
  fullWidth: { alignSelf: 'stretch' }, outline: { borderWidth: 1, borderColor: colors.brand.primary },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  disabled: { backgroundColor: colors.surface.disabled, opacity: 1 },
  pressed: { opacity: opacity.pressed },
  loadingContent: { opacity: 0 },
  loader: { position: 'absolute' },
  labelWithIcon: { marginHorizontal: spacing[2] },
});
