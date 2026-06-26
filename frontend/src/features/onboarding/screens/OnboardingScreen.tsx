/**
 * Écran principal d'onboarding avec 5 slides activation utilisateur
 * Flow: Problème → Solution → Comment → Preuve sociale → Action
 * @module features/onboarding/screens
 */

import React, { useState, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import OnboardingSlide from '../components/OnboardingSlide';
import SlideIndicators from '../components/SlideIndicators';
import OnboardingButton from '../components/OnboardingButton';
import OnboardingService from '../services/onboardingService';
import { OnboardingSlideData } from '../types/onboarding';
import { AQUACARE_COLORS } from '@/constants/colors';
import { AQUACARE_TYPOGRAPHY } from '@/constants/typography';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Données des 5 slides (activation utilisateur)
 * Slide 1: Problème (reconnaissance)
 * Slide 2: Solution (promesse)
 * Slide 3: Comment (demo rapide)
 * Slide 4: Preuve sociale (confiance)
 * Slide 5: Action (call to action)
 */
const SLIDES: OnboardingSlideData[] = [
  // Slide 1: Problème
  {
    id: '1',
    type: 'problem',
    iconName: 'alert-circle-outline',
    titleKey: 'onboarding_problem_title',
    bulletItems: [
      { iconName: 'skull-outline', textKey: 'onboarding_problem_item1' },
      { iconName: 'fast-food-outline', textKey: 'onboarding_problem_item2' },
      { iconName: 'eye-off-outline', textKey: 'onboarding_problem_item3' },
    ],
  },
  // Slide 2: Solution
  {
    id: '2',
    type: 'solution',
    iconName: 'trending-up-outline',
    titleKey: 'onboarding_solution_title',
    bulletItems: [
      { iconName: 'checkmark-circle', textKey: 'onboarding_solution_item1' },
      { iconName: 'checkmark-circle', textKey: 'onboarding_solution_item2' },
      { iconName: 'checkmark-circle', textKey: 'onboarding_solution_item3' },
    ],
  },
  // Slide 3: Comment
  {
    id: '3',
    type: 'how',
    titleKey: 'onboarding_how_title',
    howSteps: [
      {
        iconName: 'create-outline',
        titleKey: 'onboarding_how_step1_title',
        descKey: 'onboarding_how_step1_desc',
      },
      {
        iconName: 'notifications-outline',
        titleKey: 'onboarding_how_step2_title',
        descKey: 'onboarding_how_step2_desc',
      },
      {
        iconName: 'cash-outline',
        titleKey: 'onboarding_how_step3_title',
        descKey: 'onboarding_how_step3_desc',
      },
    ],
  },
  // Slide 4: Preuve sociale
  {
    id: '4',
    type: 'social_proof',
    titleKey: 'onboarding_social_title',
    testimonialNameKey: 'onboarding_testimonial_name',
    testimonialTextKey: 'onboarding_testimonial_text',
    stats: [
      { iconName: 'people-outline', textKey: 'onboarding_stat1' },
      { iconName: 'analytics-outline', textKey: 'onboarding_stat2' },
      { iconName: 'wallet-outline', textKey: 'onboarding_stat3' },
      { iconName: 'storefront-outline', textKey: 'onboarding_stat4' },
    ],
  },
  // Slide 5: Action
  {
    id: '5',
    type: 'action',
    titleKey: 'onboarding_action_title',
    subtitleKey: 'onboarding_action_subtitle',
  },
];

interface OnboardingScreenProps {
  onCompleted: () => void | Promise<void>;
}

/**
 * Écran d'onboarding avec FlatList horizontal
 */
export default function OnboardingScreen({ onCompleted }: OnboardingScreenProps) {
  const { t } = useTranslation();

  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Navigue vers le slide suivant
   */
  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    }
  };

  /**
   * Ignore l'onboarding (slides 1-4 uniquement)
   */
  const handleSkip = async () => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      await OnboardingService.setCompleted();
      await onCompleted();
    } catch (error) {
      Alert.alert(
        t('error'),
        t('errorOccurred'),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Commence l'utilisation de l'app (slide 5 uniquement)
   */
  const handleStart = async () => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      await OnboardingService.setCompleted();
      await onCompleted();
    } catch (error) {
      Alert.alert(
        t('error'),
        t('errorOccurred'),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Callback scroll FlatList pour tracker currentIndex
   */
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  /**
   * Render d'un slide individuel
   */
  const renderSlide = ({ item }: { item: OnboardingSlideData }) => {
    return <OnboardingSlide slide={item} />;
  };

  // Bouton affiché selon slide actuel
  const isLastSlide = currentIndex === SLIDES.length - 1;
  const buttonTitle = isLastSlide ? t('onboardingStart') : t('onboardingNext');
  const buttonAction = isLastSlide ? handleStart : handleNext;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Header avec bouton "Ignorer" (slides 1-4 uniquement) */}
        {!isLastSlide && (
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleSkip}
              disabled={isProcessing}
              style={styles.skipButton}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={t('onboardingSkip')}
            >
              <Text style={styles.skipText}>{t('onboardingSkip')}</Text>
            </TouchableOpacity>

            <Text style={styles.pageIndicator}>
              {currentIndex + 1}/{SLIDES.length}
            </Text>
          </View>
        )}

        {/* Espace réservé pour header sur dernier slide */}
        {isLastSlide && <View style={styles.headerPlaceholder} />}

        {/* FlatList horizontal avec slides */}
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          bounces={false}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
        />

        {/* Footer avec indicateurs et bouton */}
        <View style={styles.footer}>
          <SlideIndicators
            currentIndex={currentIndex}
            totalSlides={SLIDES.length}
          />

          <OnboardingButton
            title={buttonTitle}
            onPress={buttonAction}
            disabled={isProcessing}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AQUACARE_COLORS.WHITE,
  },

  container: {
    flex: 1,
    backgroundColor: AQUACARE_COLORS.WHITE,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },

  headerPlaceholder: {
    height: 52,
  },

  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  skipText: {
    ...AQUACARE_TYPOGRAPHY.bodyStrong,
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },

  pageIndicator: {
    ...AQUACARE_TYPOGRAPHY.small,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    fontWeight: '500',
  },

  footer: {
    paddingBottom: 40,
    paddingTop: 20,
    alignItems: 'center',
    backgroundColor: AQUACARE_COLORS.WHITE,
  },
});
