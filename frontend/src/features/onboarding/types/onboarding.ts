/**
 * Types du module Onboarding (introduction en 4 pages)
 * @module features/onboarding/types
 */

/** Visuel affiché en haut de la page : aperçu réaliste d'un écran de l'app. */
export type OnboardingVisualType = 'welcome' | 'track' | 'feed' | 'shop';

/** Données d'une page d'introduction (clés i18n uniquement). */
export interface OnboardingSlideData {
  id: string;
  visual: OnboardingVisualType;
  titleKey: string;
  textKey: string;
}

export interface OnboardingSlideProps {
  slide: OnboardingSlideData;
}

export interface SlideIndicatorsProps {
  currentIndex: number;
  totalSlides: number;
}

export interface OnboardingButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}
