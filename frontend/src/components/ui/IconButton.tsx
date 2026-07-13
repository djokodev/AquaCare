import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, opacity, radii, sizing } from '@/theme';
import { AppText } from './AppText';

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: 'surface' | 'ghost' | 'danger';
  tone?: 'default' | 'inverse' | 'danger';
  disabled?: boolean;
  badge?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'surface',
  tone = 'default',
  disabled = false,
  badge,
  style,
  testID,
}: IconButtonProps) {
  const danger = variant === 'danger';
  const surface = variant === 'surface';
  const color = tone === 'inverse'
    ? colors.text.inverse
    : tone === 'danger' || danger
      ? colors.status.error
      : surface
        ? colors.brand.primary
        : colors.text.primary;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        surface && styles.surface,
        danger && styles.danger,
        (pressed || disabled) && { opacity: disabled ? opacity.disabled : opacity.pressed },
        style,
      ]}
    >
      <Ionicons name={icon} size={sizing.iconLarge} color={color} />
      {badge && badge > 0 ? (
        <View style={styles.badge}>
          <AppText variant="caption" color="inverse">
            {badge > 99 ? '99+' : badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: sizing.touchTargetMinimum, minHeight: sizing.touchTargetMinimum, alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg },
  surface: { backgroundColor: colors.surface.card },
  danger: { backgroundColor: colors.status.errorSurface },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: radii.full, backgroundColor: colors.status.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
});
