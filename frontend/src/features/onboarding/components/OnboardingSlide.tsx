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
import { MAVECAM_COLORS } from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Slide individuel d'onboarding
 * Layout adaptatif selon le type de slide
 */
export default function OnboardingSlide({ slide }: OnboardingSlideProps) {
  const { t } = useTranslation();

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
   * Icône + titre + liste à puces
   */
  const renderProblemSlide = () => (
    <View style={styles.contentContainer}>
      {slide.iconName && (
        <View style={styles.iconContainer}>
          <Ionicons
            name={slide.iconName as any}
            size={80}
            color={MAVECAM_COLORS.ERROR}
          />
        </View>
      )}

      <Text style={styles.title}>{t(slide.titleKey)}</Text>

      {slide.bulletItems && (
        <View style={styles.bulletList}>
          {slide.bulletItems.map((item, index) => (
            <View key={index} style={styles.bulletItem}>
              <Ionicons
                name={item.iconName as any}
                size={22}
                color={MAVECAM_COLORS.ERROR}
                style={styles.bulletIcon}
              />
              <Text style={styles.bulletText}>{t(item.textKey)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  /**
   * Slide 2: Solution (promesse)
   * Icône + titre + liste avec checkmarks
   */
  const renderSolutionSlide = () => (
    <View style={styles.contentContainer}>
      {slide.iconName && (
        <View style={styles.iconContainer}>
          <Ionicons
            name={slide.iconName as any}
            size={80}
            color={MAVECAM_COLORS.GREEN_PRIMARY}
          />
        </View>
      )}

      <Text style={styles.title}>{t(slide.titleKey)}</Text>

      {slide.bulletItems && (
        <View style={styles.bulletList}>
          {slide.bulletItems.map((item, index) => (
            <View key={index} style={styles.bulletItem}>
              <Ionicons
                name="checkmark-circle"
                size={22}
                color={MAVECAM_COLORS.GREEN_PRIMARY}
                style={styles.bulletIcon}
              />
              <Text style={styles.bulletText}>{t(item.textKey)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  /**
   * Slide 3: Comment (demo rapide)
   * Titre + 3 étapes avec icônes et flèches
   */
  const renderHowSlide = () => (
    <View style={styles.contentContainer}>
      <Text style={styles.title}>{t(slide.titleKey)}</Text>

      {slide.howSteps && (
        <View style={styles.stepsContainer}>
          {slide.howSteps.map((step, index) => (
            <React.Fragment key={index}>
              <View style={styles.stepItem}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.stepIconContainer}>
                  <Ionicons
                    name={step.iconName as any}
                    size={32}
                    color={MAVECAM_COLORS.GREEN_PRIMARY}
                  />
                </View>
                <View style={styles.stepTextContainer}>
                  <Text style={styles.stepTitle}>{t(step.titleKey)}</Text>
                  <Text style={styles.stepDesc}>{t(step.descKey)}</Text>
                </View>
              </View>

              {index < (slide.howSteps?.length || 0) - 1 && (
                <View style={styles.arrowContainer}>
                  <Ionicons
                    name="arrow-down"
                    size={24}
                    color={MAVECAM_COLORS.GRAY_LIGHT}
                  />
                </View>
              )}
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );

  /**
   * Slide 4: Preuve sociale (confiance)
   * Témoignage + statistiques
   */
  const renderSocialProofSlide = () => (
    <View style={styles.socialProofContainer}>
      <Text style={styles.socialProofTitle}>{t(slide.titleKey)}</Text>

      {/* Témoignage */}
      {slide.testimonialNameKey && slide.testimonialTextKey && (
        <View style={styles.testimonialCard}>
          <View style={styles.testimonialHeader}>
            <Ionicons
              name="person-circle"
              size={36}
              color={MAVECAM_COLORS.GREEN_PRIMARY}
            />
            <Text style={styles.testimonialName}>{t(slide.testimonialNameKey)}</Text>
          </View>
          <Text style={styles.testimonialText}>"{t(slide.testimonialTextKey)}"</Text>
        </View>
      )}

      {/* Statistiques */}
      {slide.stats && (
        <View style={styles.statsContainer}>
          {slide.stats.map((stat, index) => (
            <View key={index} style={styles.statItem}>
              <Ionicons
                name={stat.iconName as any}
                size={22}
                color={MAVECAM_COLORS.GREEN_PRIMARY}
              />
              <Text style={styles.statText}>{t(stat.textKey)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

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
          color={MAVECAM_COLORS.GREEN_PRIMARY}
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
    backgroundColor: MAVECAM_COLORS.WHITE,
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
    color: MAVECAM_COLORS.GRAY_DARK,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
    lineHeight: 34,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: MAVECAM_COLORS.GRAY_LIGHT,
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
    color: MAVECAM_COLORS.GRAY_DARK,
  },

  // How steps styles
  stepsContainer: {
    width: '100%',
    paddingHorizontal: 8,
  },

  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },

  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  stepNumberText: {
    color: MAVECAM_COLORS.WHITE,
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
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 2,
  },

  stepDesc: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_LIGHT,
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
    color: MAVECAM_COLORS.GRAY_DARK,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
    lineHeight: 28,
  },

  // Testimonial styles
  testimonialCard: {
    width: '100%',
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },

  testimonialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  testimonialName: {
    fontSize: 15,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginLeft: 10,
  },

  testimonialText: {
    fontSize: 14,
    lineHeight: 20,
    color: MAVECAM_COLORS.GRAY_DARK,
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
    color: MAVECAM_COLORS.GRAY_DARK,
    marginLeft: 10,
    fontWeight: '500',
  },
});
