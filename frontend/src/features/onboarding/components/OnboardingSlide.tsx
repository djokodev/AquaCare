/**
 * Page d'introduction : visuel de marque en haut, feuille blanche arrondie
 * avec le contenu en bas (même structure sur toutes les pages).
 * @module features/onboarding/components
 */

import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { OnboardingSlideProps } from '../types/onboarding';
import { AppText } from '@/components/ui';
import { colors, radii, shadows, spacing, typography } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const APP_NAME = 'AquaCare';

export default function OnboardingSlide({ slide }: OnboardingSlideProps) {
  const { t } = useTranslation();

  /** Met le nom de l'app en vert dans le titre. */
  const renderTitle = () => {
    const title = t(slide.titleKey);
    const parts = title.split(APP_NAME);
    if (parts.length === 1) {
      return <AppText style={styles.title}>{title}</AppText>;
    }
    return (
      <AppText style={styles.title}>
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {part}
            {index < parts.length - 1 ? <AppText style={styles.titleAccent}>{APP_NAME}</AppText> : null}
          </React.Fragment>
        ))}
      </AppText>
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <View style={styles.ringOuter}>
          <View style={styles.ringInner}>
            <View style={styles.iconDisc}>
              <Ionicons name={slide.iconName as never} size={52} color={colors.brand.primary} />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.sheet}>
        {renderTitle()}

        {slide.subtitleKey ? <AppText style={styles.subtitle}>{t(slide.subtitleKey)}</AppText> : null}

        {slide.bulletItems?.map((item) => (
          <View key={item.textKey} style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name={item.iconName as never} size={18} color={colors.brand.primary} />
            </View>
            <AppText style={styles.rowText}>{t(item.textKey)}</AppText>
          </View>
        ))}

        {slide.howSteps?.map((step, index) => (
          <View key={step.titleKey} style={styles.stepCard}>
            <View style={styles.stepNumber}>
              <AppText style={styles.stepNumberText}>{index + 1}</AppText>
            </View>
            <AppText style={styles.stepText}>{t(step.titleKey)}</AppText>
            <Ionicons name={step.iconName as never} size={24} color={colors.brand.primary} />
          </View>
        ))}

        {slide.chips && slide.chips.length > 0 ? (
          <View style={styles.chips}>
            {slide.chips.map((chip) => (
              <View key={chip.textKey} style={styles.chip}>
                <Ionicons name={chip.iconName as never} size={20} color={colors.brand.primary} />
                <AppText style={styles.chipText}>{t(chip.textKey)}</AppText>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: SCREEN_WIDTH, flex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 170 },
  ringOuter: {
    width: 190,
    height: 190,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 150,
    height: 150,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDisc: {
    width: 108,
    height: 108,
    borderRadius: radii.full,
    backgroundColor: colors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.large,
  },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[8],
    paddingBottom: spacing[2],
  },
  title: { ...typography.display, fontSize: 28, lineHeight: 36, color: colors.text.primary, marginBottom: spacing[4] },
  titleAccent: { ...typography.display, fontSize: 28, lineHeight: 36, color: colors.brand.primary },
  subtitle: { ...typography.body, color: colors.text.muted, marginBottom: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: spacing[3] },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  rowText: { ...typography.bodyStrong, flex: 1, color: colors.text.primary },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[3],
    padding: spacing[4],
    borderRadius: radii.xl,
    backgroundColor: colors.surface.page,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: radii.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  stepNumberText: { ...typography.label, color: colors.text.inverse },
  stepText: { ...typography.bodyStrong, flex: 1, color: colors.text.primary },
  chips: { marginTop: spacing[4], gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: radii.xl,
    backgroundColor: colors.brand.subtle,
  },
  chipText: { ...typography.label, flex: 1, color: colors.brand.dark, marginLeft: spacing[3] },
});
