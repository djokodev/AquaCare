import { colors, typography } from '@/theme';

export const AQUACARE_TYPOGRAPHY = {
  h1: { ...typography.display, color: colors.text.primary },
  h2: { ...typography.screenTitle, color: colors.text.primary },
  h3: { ...typography.sectionTitle, color: colors.text.primary },
  h4: { ...typography.cardTitle, color: colors.text.primary },
  body: { ...typography.body, color: colors.text.primary },
  bodyStrong: { ...typography.bodyStrong, color: colors.text.primary },
  small: { ...typography.helper, color: colors.text.primary },
  smallStrong: { ...typography.label, color: colors.text.primary },
  caption: { ...typography.caption, color: colors.text.muted },
  button: { ...typography.button, color: colors.text.inverse },
  buttonSmall: { ...typography.label, color: colors.text.inverse },
} as const;
