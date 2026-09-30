/**
 * Introduction de l'app en 4 pages : accueil, suivi, alimentation, commandes et support.
 * @module features/onboarding/screens
 */

import React, { useState, useRef } from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import OnboardingSlide from '../components/OnboardingSlide';
import SlideIndicators from '../components/SlideIndicators';
import OnboardingButton from '../components/OnboardingButton';
import OnboardingService from '../services/onboardingService';
import { OnboardingSlideData } from '../types/onboarding';
import { AppText } from '@/components/ui';
import { colors, spacing } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES: OnboardingSlideData[] = [
  { id: 'welcome', visual: 'welcome', titleKey: 'onboardingWelcomeTitle', textKey: 'onboardingWelcomeText' },
  { id: 'track', visual: 'track', titleKey: 'onboardingTrackTitle', textKey: 'onboardingTrackText' },
  { id: 'feed', visual: 'feed', titleKey: 'onboardingFeedTitle', textKey: 'onboardingFeedText' },
  { id: 'shop', visual: 'shop', titleKey: 'onboardingShopTitle', textKey: 'onboardingShopText' },
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.circleLarge} pointerEvents="none" />
        <View style={styles.circleSmall} pointerEvents="none" />

        <View style={styles.header}>
          {currentIndex > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('onboardingBack')}
              onPress={() => flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: true })}
              disabled={isProcessing}
              hitSlop={12}
              style={styles.headerButton}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text.inverse} />
            </Pressable>
          ) : (
            <View style={styles.headerButton} />
          )}

          {!isLastSlide ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleSkip}
              disabled={isProcessing}
              hitSlop={12}
              style={styles.headerButton}
            >
              <AppText variant="label" style={styles.skipText}>{t('onboardingSkip')}</AppText>
            </Pressable>
          ) : null}
        </View>

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

        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <SlideIndicators currentIndex={currentIndex} totalSlides={SLIDES.length} />
          <OnboardingButton title={buttonTitle} onPress={buttonAction} disabled={isProcessing} />
        </SafeAreaView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.brand.dark },
  container: { flex: 1, backgroundColor: colors.brand.dark, overflow: 'hidden' },
  circleLarge: {
    position: 'absolute',
    top: -90,
    right: -110,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  circleSmall: {
    position: 'absolute',
    top: 150,
    left: -70,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    minHeight: 52,
  },
  headerButton: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  skipText: { color: colors.text.inverse, textAlign: 'right' },
  footer: {
    paddingBottom: spacing[6],
    paddingHorizontal: spacing[6],
    backgroundColor: colors.surface.card,
  },
});
