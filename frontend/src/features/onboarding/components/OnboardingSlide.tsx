/**
 * Composant générique pour un slide d'onboarding
 * Supporte 5 types de layouts différents pour activation utilisateur
 * @module features/onboarding/components
 */

import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { OnboardingSlideProps } from '../types/onboarding';
import { AQUACARE_COLORS } from '@/constants/colors';

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
  const renderTextWithAppName = (text: string, baseStyle: any) => {
    const appName = 'AquaCare';
    const parts = text.split(appName);

    if (parts.length === 1) {
      // Pas de "AquaCare" dans le texte
      return <Text style={baseStyle}>{text}</Text>;
    }

    return (
      <Text style={baseStyle}>
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {part}
            {index < parts.length - 1 && (
              <Text style={styles.appNameHighlight}>{appName}</Text>
            )}
          </React.Fragment>
        ))}
      </Text>
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
            color={AQUACARE_COLORS.ERROR}
          />
        </View>
      )}

      <Text style={styles.title}>{t(slide.titleKey)}</Text>
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
              color={AQUACARE_COLORS.GREEN_PRIMARY}
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
                  color={AQUACARE_COLORS.GREEN_PRIMARY}
                  style={styles.bulletIcon}
                />
                <Text style={styles.bulletText}>{t(item.textKey)}</Text>
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
      <Text style={styles.title}>{t(slide.titleKey)}</Text>

      {slide.howSteps && (
        <View style={styles.stepsContainer}>
          {slide.howSteps.map((step, index) => {
            const hasDescription = t(step.descKey) !== '';
            return (
              <React.Fragment key={index}>
                <View style={styles.stepItem}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.stepIconContainer}>
                    <Ionicons
                      name={step.iconName as any}
                      size={32}
                      color={AQUACARE_COLORS.GREEN_PRIMARY}
                    />
                  </View>
                  <View style={[
                    styles.stepTextContainer,
                    !hasDescription && styles.stepTextContainerCentered
                  ]}>
                    <Text style={[
                      styles.stepTitle,
                      !hasDescription && styles.stepTitleCentered
                    ]}>
                      {t(step.titleKey)}
                    </Text>
                    {hasDescription && (
                      <Text style={styles.stepDesc}>{t(step.descKey)}</Text>
                    )}
                  </View>
                </View>

                {index < (slide.howSteps?.length || 0) - 1 && (
                  <View style={styles.arrowContainer}>
                    <Ionicons
                      name="arrow-down"
                      size={24}
                      color={AQUACARE_COLORS.GRAY_LIGHT}
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
          <Text style={styles.socialProofTitle}>{t(slide.titleKey)}</Text>
        )}

        {/* Mode minimaliste: afficher la stat principale en gros */}
        {isMinimalist && (
          <View style={styles.mainStatContainer}>
            <Ionicons
              name="people"
              size={80}
              color={AQUACARE_COLORS.GREEN_PRIMARY}
            />
            <Text style={styles.mainStatTextBlack}>
              <Text style={styles.mainStatNumber}>+200</Text>
              {' '}{t(nonEmptyStats[0].textKey).replace(/^\+200\s*/, '')}
            </Text>
          </View>
        )}

        {/* Mode normal: Témoignage */}
        {!isMinimalist && hasTestimonial && (
          <View style={styles.testimonialCard}>
            <View style={styles.testimonialHeader}>
              <Ionicons
                name="person-circle"
                size={36}
                color={AQUACARE_COLORS.GREEN_PRIMARY}
              />
              <Text style={styles.testimonialName}>{t(slide.testimonialNameKey!)}</Text>
            </View>
            <Text style={styles.testimonialText}>"{t(slide.testimonialTextKey!)}"</Text>
          </View>
        )}

        {/* Mode normal: Statistiques */}
        {!isMinimalist && nonEmptyStats.length > 0 && (
          <View style={styles.statsContainer}>
            {nonEmptyStats.map((stat, index) => (
              <View key={index} style={styles.statItem}>
                <Ionicons
                  name={stat.iconName as any}
                  size={22}
                  color={AQUACARE_COLORS.GREEN_PRIMARY}
                />
                <Text style={styles.statText}>{t(stat.textKey)}</Text>
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
          color={AQUACARE_COLORS.GREEN_PRIMARY}
        />
      </View>

      <Text style={styles.title}>{t(slide.titleKey)}</Text>

      {slide.subtitleKey && (
        <Text style={styles.subtitle}>{t(slide.subtitleKey)}</Text>
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
    paddingHorizontal: 24,
    backgroundColor: AQUACARE_COLORS.WHITE,
  },

  contentContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
  },

  iconContainer: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
    lineHeight: 34,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },

  // Bullet list styles
  bulletList: {
    width: '100%',
    paddingHorizontal: 8,
  },

  bulletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },

  bulletIcon: {
    marginRight: 12,
    width: 24,
  },

  bulletText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: AQUACARE_COLORS.GRAY_DARK,
  },

  // How steps styles
  stepsContainer: {
    width: '100%',
    paddingHorizontal: 8,
  },

  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AQUACARE_COLORS.CREAM,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },

  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  stepNumberText: {
    color: AQUACARE_COLORS.WHITE,
    fontSize: 14,
    fontWeight: 'bold',
  },

  stepIconContainer: {
    marginRight: 12,
  },

  stepTextContainer: {
    flex: 1,
  },

  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: AQUACARE_COLORS.GRAY_DARK,
    marginBottom: 2,
  },

  stepDesc: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },

  arrowContainer: {
    alignItems: 'center',
    paddingVertical: 4,
  },

  // Social proof specific styles
  socialProofContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
  },

  socialProofTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
    lineHeight: 28,
  },

  // Testimonial styles
  testimonialCard: {
    width: '100%',
    backgroundColor: AQUACARE_COLORS.CREAM,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: AQUACARE_COLORS.GREEN_PRIMARY,
  },

  testimonialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  testimonialName: {
    fontSize: 15,
    fontWeight: '600',
    color: AQUACARE_COLORS.GRAY_DARK,
    marginLeft: 10,
  },

  testimonialText: {
    fontSize: 14,
    lineHeight: 20,
    color: AQUACARE_COLORS.GRAY_DARK,
    fontStyle: 'italic',
  },

  // Stats styles
  statsContainer: {
    width: '100%',
  },

  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 8,
  },

  statText: {
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_DARK,
    marginLeft: 10,
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
    marginTop: 40,
    marginBottom: 20,
  },

  mainStatText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    textAlign: 'center',
    marginTop: 20,
  },

  mainStatTextBlack: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'center',
    marginTop: 20,
  },

  mainStatNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },

  // AquaCare highlighted in green
  appNameHighlight: {
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    fontWeight: 'bold',
  },

  // Guarantee section (Slide 1)
  guaranteeContainer: {
    marginTop: 32,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: AQUACARE_COLORS.CREAM,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: AQUACARE_COLORS.GREEN_PRIMARY,
    width: '100%',
  },

  guaranteeIcon: {
    marginBottom: 8,
    alignSelf: 'center',
  },

  guaranteeText: {
    fontSize: 14,
    lineHeight: 22,
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
});
