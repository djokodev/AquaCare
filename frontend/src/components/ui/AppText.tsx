import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, typography, type TypographyVariant } from '@/theme';

type AppTextColor = keyof typeof colors.text | 'success' | 'warning' | 'error' | 'info';

interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: AppTextColor;
  style?: TextStyle | TextStyle[];
}

const semanticColors: Record<AppTextColor, string> = {
  ...colors.text,
  success: colors.status.success,
  warning: colors.status.warning,
  error: colors.status.error,
  info: colors.status.info,
};

export function AppText({ variant = 'body', color = 'primary', style, ...props }: AppTextProps) {
  return <Text {...props} style={[typography[variant], { color: semanticColors[color] }, style]} />;
}
