/**
 * Point d'entrée centralisé pour le module Onboarding
 * Exports de tous les composants, services et types
 * @module features/onboarding
 */

// Screens
export { default as OnboardingScreen } from './screens/OnboardingScreen';

// Components
export { default as OnboardingButton } from './components/OnboardingButton';
export { default as OnboardingSlide } from './components/OnboardingSlide';
export { default as SlideIndicators } from './components/SlideIndicators';

// Services
export { default as OnboardingService } from './services/onboardingService';

// Types
export type {
  OnboardingSlideData,
  OnboardingSlideProps,
  SlideIndicatorsProps,
  OnboardingButtonProps,
} from './types/onboarding';
