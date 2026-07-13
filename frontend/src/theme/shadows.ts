import { Platform, type ViewStyle } from 'react-native';
import { colors } from './colors';

const shadow = (height: number, opacity: number, radius: number, elevation: number): ViewStyle => ({
  shadowColor: colors.black,
  shadowOffset: { width: 0, height },
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation: Platform.OS === 'android' ? elevation : 0,
});

export const shadows = {
  none: {} as ViewStyle,
  small: shadow(1, 0.08, 2, 2),
  medium: shadow(2, 0.12, 6, 4),
  large: shadow(4, 0.18, 12, 8),
} as const;
