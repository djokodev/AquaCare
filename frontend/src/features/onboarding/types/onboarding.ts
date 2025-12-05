/**
 * Types TypeScript pour le module Onboarding
 * @module features/onboarding/types
 */

/**
 * Données d'un slide d'onboarding
 * Utilise des clés i18n pour internationalisation
 */
export interface OnboardingSlideData {
  /** Identifiant unique du slide */
  id: string;

  /** Nom de l'icône Ionicons (ex: 'fish-outline') */
  iconName: string;

  /** Clé de traduction du titre (ex: 'onboardingSlide1Title') */
  titleKey: string;

  /** Clé de traduction de la description */
  descriptionKey: string;
}

/**
 * Props pour le composant OnboardingSlide
 * Versions traduites des textes
 */
export interface OnboardingSlideProps {
  /** Nom de l'icône Ionicons */
  iconName: string;

  /** Titre traduit du slide */
  title: string;

  /** Description traduite du slide */
  description: string;
}

/**
 * Props pour le composant SlideIndicators
 */
export interface SlideIndicatorsProps {
  /** Index du slide actuel (0-2) */
  currentIndex: number;

  /** Nombre total de slides (3) */
  totalSlides: number;
}

/**
 * Props pour le composant OnboardingButton
 */
export interface OnboardingButtonProps {
  /** Texte du bouton traduit */
  title: string;

  /** Callback au clic */
  onPress: () => void;

  /** Désactiver le bouton (optionnel) */
  disabled?: boolean;
}
