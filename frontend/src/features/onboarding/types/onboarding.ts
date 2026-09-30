/**
 * Types du module Onboarding (introduction en 3 pages)
 * @module features/onboarding/types
 */

export type OnboardingSlideType = 'solution' | 'how' | 'action';

export interface BulletItem {
  iconName: string;
  textKey: string;
}

export interface HowStep {
  iconName: string;
  titleKey: string;
}

export interface ChipItem {
  iconName: string;
  textKey: string;
}

/** Données d'une page d'introduction (clés i18n uniquement). */
export interface OnboardingSlideData {
  id: string;
  type: OnboardingSlideType;
  /** Icône Ionicons affichée dans le visuel du haut. */
  iconName: string;
  titleKey: string;
  subtitleKey?: string;
  bulletItems?: BulletItem[];
  howSteps?: HowStep[];
  chips?: ChipItem[];
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
