import { Platform } from 'react-native';
import { AQUACARE_COLORS } from '@/constants/colors';

const androidCenterStyle =
  Platform.OS === 'android'
    ? {
        textAlignVertical: 'center' as const,
        includeFontPadding: false,
      }
    : null;

const androidTopStyle =
  Platform.OS === 'android'
    ? {
        includeFontPadding: false,
      }
    : null;

export const sharedTextInputStyles = {
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  base: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 20,
    color: AQUACARE_COLORS.GRAY_DARK,
    ...androidCenterStyle,
  },
  compact: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 20,
    color: AQUACARE_COLORS.GRAY_DARK,
    ...androidCenterStyle,
  },
  compactSmall: {
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 14,
    lineHeight: 18,
    color: AQUACARE_COLORS.GRAY_DARK,
    ...androidCenterStyle,
  },
  multiline: {
    minHeight: 96,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    lineHeight: 20,
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlignVertical: 'top' as const,
    ...androidTopStyle,
  },
  multilineCompact: {
    minHeight: 80,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    lineHeight: 20,
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlignVertical: 'top' as const,
    ...androidTopStyle,
  },
  prefixContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  prefixText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600' as const,
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    ...androidTopStyle,
  },
  suffixText: {
    fontSize: 14,
    lineHeight: 20,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    ...androidTopStyle,
  },
} as const;
