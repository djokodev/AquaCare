import { AQUACARE_COLORS } from './colors';

export const AQUACARE_TYPOGRAPHY = {
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700' as const,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  h2: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700' as const,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  h3: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700' as const,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  h4: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600' as const,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  bodyStrong: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  smallStrong: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  button: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: 0.2,
    color: AQUACARE_COLORS.WHITE,
  },
  buttonSmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
    letterSpacing: 0.2,
    color: AQUACARE_COLORS.WHITE,
  },
} as const;
