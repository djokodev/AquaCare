import tokens from './tokens.json';

export const colors = tokens.colors;

/** Legacy facade. Prefer semantic `colors` tokens in new UI code. */
export const AQUACARE_COLORS = {
  GREEN_PRIMARY: colors.brand.primary,
  GREEN_LIGHT: colors.brand.light,
  GREEN_DARK: colors.brand.dark,
  WHITE: colors.surface.card,
  CREAM: colors.surface.page,
  BLUE: colors.legacy.blue,
  SUCCESS: colors.status.success,
  WARNING: colors.status.warning,
  ERROR: colors.status.error,
  INFO: colors.status.info,
  GRAY_LIGHT: colors.text.muted,
  GRAY_DARK: colors.text.primary,
} as const;

export type AquacareColorKey = keyof typeof AQUACARE_COLORS;
export type AquacareColor = (typeof AQUACARE_COLORS)[AquacareColorKey];
