/**
 * Composant générique pour un slide d'onboarding
 * Supporte 5 types de layouts différents pour activation utilisateur
 * @module features/onboarding/components
 */

import React from 'react';
import { View, StyleSheet, Dimensions, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { OnboardingSlideProps } from '../types/onboarding';
import { AppText, Card } from '@/components/ui';
import { colors, radii, spacing, typography } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Slide individuel d'onboarding
 * Layout adaptatif selon le type de slide
 */
export default function OnboardingSlide({ slide }: OnboardingSlideProps) {
  const { t } = useTranslation();

  /**
   * Rend un texte avec "AquaCare" coloré en vert
   */
  const renderTextWithAppName = (text: string, baseStyle: TextStyle) => {
    const appName = 'AquaCare';
    const parts = text.split(appName);

    if (parts.length === 1) {
      // Pas de "AquaCare" dans le texte
      return <AppText style={baseStyle}>{text}</AppText>;
    }

    return (
      <AppText style={baseStyle}>
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {part}
            {index < parts.length - 1 && (
              <AppText style={styles.appNameHighlight}>{appName}</AppText>
            )}
          </React.Fragment>
        ))}
      </AppText>
    );
  };

  const renderContent = () => {
    switch (slide.type) {
      case 'problem':
        return renderProblemSlide();
      case 'solution':
        return renderSolutionSlide();
      case 'how':
        return renderHowSlide();
      case 'social_proof':
        return renderSocialProofSlide();
      case 'action':
        return renderActionSlide();
      default:
        return null;
    }
  };

  /**
   * Slide 1: Problème (reconnaissance)
   * Icône + titre uniquement
   */
  const renderProblemSlide = () => (
    <View style={styles.contentContainer}>
      {slide.iconName && (
        <View style={styles.iconContainer}>
          <Ionicons
            name={slide.iconName as any}
            size={80}
            color={colors.status.error}
          />
        </View>
      )}

      <AppText style={styles.title}>{t(slide.titleKey)}</AppText>
    </View>
  );

  /**
   * Slide 2: Solution (promesse)
   * Icône + titre avec AquaCare en vert + liste avec checkmarks
   */
  const renderSolutionSlide = () => {
    // Filtrer les bullet items non-vides
    const nonEmptyItems = slide.bulletItems?.filter(item => t(item.textKey) !== '') || [];

    return (
      <View style={styles.contentContainer}>
        {slide.iconName && (
          <View style={styles.iconContainer}>
            <Ionicons
              name={slide.iconName as any}
              size={80}
              color={colors.brand.primary}
            />
          </View>
        )}

        {renderTextWithAppName(t(slide.titleKey), styles.title)}

        {nonEmptyItems.length > 0 && (
          <View style={styles.bulletList}>
            {nonEmptyItems.map((item, index) => (
              <View key={index} style={styles.bulletItem}>
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={colors.brand.primary}
                  style={styles.bulletIcon}
                />
                <AppText style={styles.bulletText}>{t(item.textKey)}</AppText>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  /**
   * Slide 3: Comment (demo rapide)
   * Titre + 3 étapes avec icônes et flèches
   */
  const renderHowSlide = () => (
    <View style={styles.contentContainer}>
      <AppText style={styles.title}>{t(slide.titleKey)}</AppText>

      {slide.howSteps && (
        <View style={styles.stepsContainer}>
          {slide.howSteps.map((step, index) => {
            const hasDescription = t(step.descKey) !== '';
            return (
              <React.Fragment key={index}>
                <Card variant="outlined" style={styles.stepItem}>
                  <View style={styles.stepNumber}>
                    <AppText style={styles.stepNumberText}>{index + 1}</AppText>
                  </View>
                  <View style={styles.stepIconContainer}>
                    <Ionicons
                      name={step.iconName as any}
                      size={32}
                      color={colors.brand.primary}
                    />
                  </View>
                  <View style={[
                    styles.stepTextContainer,
                    !hasDescription && styles.stepTextContainerCentered,
                  ]}>
                    <AppText style={
                      hasDescription
                        ? [styles.stepTitle]
                        : [styles.stepTitle, styles.stepTitleCentered]
                    }>
                      {t(step.titleKey)}
                    </AppText>
                    {hasDescription && (
                      <AppText style={styles.stepDesc}>{t(step.descKey)}</AppText>
                    )}
                  </View>
                </Card>

                {index < (slide.howSteps?.length || 0) - 1 && (
                  <View style={styles.arrowContainer}>
                    <Ionicons
                      name="arrow-down"
                      size={24}
                      color={colors.text.muted}
                    />
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </View>
      )}
    </View>
  );

  /**
   * Slide 4: Preuve sociale (confiance)
   * Version minimaliste: Titre + stat principale en gros
   */
  const renderSocialProofSlide = () => {
    // Filtrer les stats non-vides
    const nonEmptyStats = slide.stats?.filter(stat => t(stat.textKey) !== '') || [];
    const hasTestimonial = slide.testimonialNameKey &&
                           slide.testimonialTextKey &&
                           t(slide.testimonialNameKey) !== '' &&
                           t(slide.testimonialTextKey) !== '';
    const hasTitle = t(slide.titleKey) !== '';

    // Mode minimaliste: une seule stat sans témoignage
    const isMinimalist = nonEmptyStats.length === 1 && !hasTestimonial;

    return (
      <View style={styles.socialProofContainer}>
        {hasTitle && (
          <AppText style={styles.socialProofTitle}>{t(slide.titleKey)}</AppText>
        )}

        {/* Mode minimaliste: afficher la stat principale en gros */}
        {isMinimalist && (
          <View style={styles.mainStatContainer}>
            <Ionicons
              name="people"
              size={80}
              color={colors.brand.primary}
            />
            <AppText style={styles.mainStatTextBlack}>
              <AppText style={styles.mainStatNumber}>+200</AppText>
              {' '}{t(nonEmptyStats[0].textKey).replace(/^\+200\s*/, '')}
            </AppText>
          </View>
        )}

        {/* Mode normal: Témoignage */}
        {!isMinimalist && hasTestimonial && (
          <Card variant="outlined" style={styles.testimonialCard}>
            <View style={styles.testimonialHeader}>
              <Ionicons
                name="person-circle"
                size={36}
                color={colors.brand.primary}
              />
              <AppText style={styles.testimonialName}>{t(slide.testimonialNameKey!)}</AppText>
            </View>
            <AppText style={styles.testimonialText}>"{t(slide.testimonialTextKey!)}"</AppText>
          </Card>
        )}

        {/* Mode normal: Statistiques */}
        {!isMinimalist && nonEmptyStats.length > 0 && (
          <View style={styles.statsContainer}>
            {nonEmptyStats.map((stat, index) => (
              <View key={index} style={styles.statItem}>
                <Ionicons
                  name={stat.iconName as any}
                  size={22}
                  color={colors.brand.primary}
                />
                <AppText style={styles.statText}>{t(stat.textKey)}</AppText>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  /**
   * Slide 5: Action (call to action)
   * Titre + sous-titre + icône
   */
  const renderActionSlide = () => (
    <View style={styles.contentContainer}>
      <View style={styles.iconContainer}>
        <Ionicons
          name="rocket"
          size={80}
          color={colors.brand.primary}
        />
      </View>

      <AppText style={styles.title}>{t(slide.titleKey)}</AppText>

      {slide.subtitleKey && (
        <AppText style={styles.subtitle}>{t(slide.subtitleKey)}</AppText>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {renderContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[6],
    backgroundColor: colors.surface.card,
  },

  contentContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: spacing[5],
  },

  iconContainer: {
    marginBottom: spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    ...typography.screenTitle,
    textAlign: 'center',
    marginBottom: spacing[6],
    paddingHorizontal: spacing[2],
  },

  subtitle: {
    ...typography.body,
    color: colors.text.muted,
    textAlign: 'center',
    paddingHorizontal: spacing[4],
    marginTop: spacing[2],
  },

  // Bullet list styles
  bulletList: {
    width: '100%',
    paddingHorizontal: spacing[2],
  },

  bulletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
    paddingHorizontal: spacing[2],
  },

  bulletIcon: {
    marginRight: spacing[3],
    width: 24,
  },

  bulletText: {
    flex: 1,
    ...typography.body,
    color: colors.text.primary,
  },

  // How steps styles
  stepsContainer: {
    width: '100%',
    paddingHorizontal: spacing[2],
  },

  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.page,
    borderRadius: radii.lg,
    padding: spacing[4],
    marginBottom: spacing[2],
  },

  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },

  stepNumberText: {
    ...typography.caption,
    color: colors.text.inverse,
    fontWeight: '700',
  },

  stepIconContainer: {
    marginRight: spacing[3],
  },

  stepTextContainer: {
    flex: 1,
  },

  stepTitle: {
    ...typography.label,
    color: colors.text.primary,
    marginBottom: 2,
  },

  stepDesc: {
    ...typography.caption,
    color: colors.text.muted,
  },

  arrowContainer: {
    alignItems: 'center',
    paddingVertical: spacing[1],
  },

  // Social proof specific styles
  socialProofContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: spacing[2],
  },

  socialProofTitle: {
    ...typography.screenTitle,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing[4],
    paddingHorizontal: spacing[2],
  },

  // Testimonial styles
  testimonialCard: {
    width: '100%',
    backgroundColor: colors.surface.page,
    borderRadius: radii.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
    borderLeftWidth: 4,
    borderLeftColor: colors.brand.primary,
  },

  testimonialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[2],
  },

  testimonialName: {
    ...typography.label,
    color: colors.text.primary,
    marginLeft: spacing[2],
  },

  testimonialText: {
    ...typography.helper,
    color: colors.text.primary,
    fontStyle: 'italic',
  },

  // Stats styles
  statsContainer: {
    width: '100%',
  },

  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[2],
    paddingHorizontal: spacing[2],
  },

  statText: {
    ...typography.helper,
    color: colors.text.primary,
    marginLeft: spacing[2],
    fontWeight: '500',
  },

  // Centered step text (when no description)
  stepTextContainerCentered: {
    justifyContent: 'center',
  },

  stepTitleCentered: {
    marginBottom: 0,
  },

  // Main stat (minimalist social proof)
  mainStatContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[10],
    marginBottom: spacing[5],
  },

  mainStatText: {
    ...typography.display,
    color: colors.brand.primary,
    textAlign: 'center',
    marginTop: spacing[5],
  },

  mainStatTextBlack: {
    ...typography.screenTitle,
    color: colors.text.primary,
    textAlign: 'center',
    marginTop: spacing[5],
  },

  mainStatNumber: {
    ...typography.display,
    color: colors.brand.primary,
  },

  // AquaCare highlighted in green
  appNameHighlight: {
    ...typography.screenTitle,
    color: colors.brand.primary,
  },

  // Guarantee section (Slide 1)
  guaranteeContainer: {
    marginTop: spacing[8],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    backgroundColor: colors.surface.page,
    borderRadius: radii.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.brand.primary,
    width: '100%',
  },

  guaranteeIcon: {
    marginBottom: spacing[2],
    alignSelf: 'center',
  },

  guaranteeText: {
    ...typography.helper,
    color: colors.text.primary,
    textAlign: 'center',
  },
});
