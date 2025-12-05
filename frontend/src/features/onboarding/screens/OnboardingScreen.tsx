/**
 * Écran principal d'onboarding avec 3 slides
 * Gère navigation, swipe, et persistance
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
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import OnboardingSlide from '../components/OnboardingSlide';
import SlideIndicators from '../components/SlideIndicators';
import OnboardingButton from '../components/OnboardingButton';
import OnboardingService from '../services/onboardingService';
import { OnboardingSlideData } from '../types/onboarding';
import { MAVECAM_COLORS } from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Données des 3 slides (clés i18n)
 */
const SLIDES: OnboardingSlideData[] = [
  {
    id: '1',
    iconName: 'fish-outline',
    titleKey: 'onboardingSlide1Title',
    descriptionKey: 'onboardingSlide1Description',
  },
  {
    id: '2',
    iconName: 'analytics-outline',
    titleKey: 'onboardingSlide2Title',
    descriptionKey: 'onboardingSlide2Description',
  },
  {
    id: '3',
    iconName: 'cart-outline',
    titleKey: 'onboardingSlide3Title',
    descriptionKey: 'onboardingSlide3Description',
  },
];

/**
 * Écran d'onboarding avec FlatList horizontal
 */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<StackNavigationProp<any>>();

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
   * Ignore l'onboarding (slides 1-2 uniquement)
   */
  const handleSkip = async () => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      await OnboardingService.setCompleted();
      // Reset de la navigation vers Main
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch (error) {
      console.error('[OnboardingScreen] Erreur handleSkip:', error);
      Alert.alert(
        t('error'),
        t('errorOccurred'),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Commence l'utilisation de l'app (slide 3 uniquement)
   */
  const handleStart = async () => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      await OnboardingService.setCompleted();
      // Reset de la navigation vers Main
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch (error) {
      console.error('[OnboardingScreen] Erreur handleStart:', error);
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
    return (
      <OnboardingSlide
        iconName={item.iconName}
        title={t(item.titleKey)}
        description={t(item.descriptionKey)}
      />
    );
  };

  // Bouton affiché selon slide actuel
  const isLastSlide = currentIndex === SLIDES.length - 1;
  const buttonTitle = isLastSlide ? t('onboardingStart') : t('onboardingNext');
  const buttonAction = isLastSlide ? handleStart : handleNext;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Header avec bouton "Ignorer" (slides 1-2 uniquement) */}
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
    backgroundColor: MAVECAM_COLORS.WHITE,
  },

  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.WHITE,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },

  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  skipText: {
    fontSize: 17,
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: '700',
  },

  pageIndicator: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontWeight: '500',
  },

  footer: {
    paddingBottom: 40,
    paddingTop: 20,
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.WHITE,
  },
});
