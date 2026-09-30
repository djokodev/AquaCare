/**
 * Page d'introduction : aperçu de l'app sur fond vert en haut,
 * feuille blanche arrondie avec le titre et le texte en bas.
 * @module features/onboarding/components
 */

import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import OnboardingVisual from './OnboardingVisual';
import { OnboardingSlideProps } from '../types/onboarding';
import { AppText } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function OnboardingSlide({ slide }: OnboardingSlideProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <OnboardingVisual type={slide.visual} />
      </View>
      <View style={styles.sheet}>
        <AppText style={styles.title}>{t(slide.titleKey)}</AppText>
        <AppText style={styles.text}>{t(slide.textKey)}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: SCREEN_WIDTH, flex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[6], minHeight: 220 },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[8],
    paddingBottom: spacing[2],
  },
  title: { ...typography.screenTitle, fontSize: 26, lineHeight: 34, color: colors.text.primary, marginBottom: spacing[3] },
  text: { ...typography.body, color: colors.text.secondary },
});
