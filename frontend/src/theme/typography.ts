import type { TextStyle } from 'react-native';

export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  screenTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  cardTitle: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  helper: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8 },
  button: { fontSize: 16, lineHeight: 22, fontWeight: '600', letterSpacing: 0.2 },
  metric: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  currency: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
