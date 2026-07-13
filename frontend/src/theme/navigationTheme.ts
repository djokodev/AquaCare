import { DefaultTheme, type Theme } from '@react-navigation/native';
import { colors } from './colors';

export const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand.primary,
    background: colors.surface.page,
    card: colors.surface.card,
    text: colors.text.primary,
    border: colors.border.subtle,
    notification: colors.status.error,
  },
};
