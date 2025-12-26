/**
 * Types TypeScript pour le module Onboarding
 * Support 5 types de slides différents pour activation utilisateur
 * @module features/onboarding/types
 */

/**
 * Types de slides disponibles
 */
export type OnboardingSlideType =
  | 'problem'      // Slide 1: Reconnaissance du problème
  | 'solution'     // Slide 2: Promesse de solution
  | 'how'          // Slide 3: Comment ça marche
  | 'social_proof' // Slide 4: Preuve sociale
  | 'action';      // Slide 5: Call to action

/**
 * Item d'une liste à puces (slides problem/solution)
 */
export interface BulletItem {
  iconName: string;
  textKey: string;
}

/**
 * Étape du processus (slide how)
 */
export interface HowStep {
  iconName: string;
  titleKey: string;
  descKey: string;
}

/**
 * Statistique (slide social_proof)
 */
export interface StatItem {
  iconName: string;
  textKey: string;
}

/**
 * Données d'un slide d'onboarding
 * Utilise des clés i18n pour internationalisation
 */
export interface OnboardingSlideData {
  /** Identifiant unique du slide */
  id: string;

  /** Type de slide déterminant le layout */
  type: OnboardingSlideType;

  /** Nom de l'icône Ionicons principale (optionnel selon type) */
  iconName?: string;

  /** Clé de traduction du titre */
  titleKey: string;

  /** Clé de traduction du sous-titre (optionnel) */
  subtitleKey?: string;

  /** Items de liste à puces (pour problem/solution) */
  bulletItems?: BulletItem[];

  /** Étapes du processus (pour how) */
  howSteps?: HowStep[];

  /** Clé de traduction du nom du témoignage */
  testimonialNameKey?: string;

  /** Clé de traduction du texte du témoignage */
  testimonialTextKey?: string;

  /** Statistiques (pour social_proof) */
  stats?: StatItem[];
}

/**
 * Props pour le composant OnboardingSlide
 * Versions traduites des textes
 */
export interface OnboardingSlideProps {
  /** Données du slide */
  slide: OnboardingSlideData;
}

/**
 * Props pour le composant SlideIndicators
 */
export interface SlideIndicatorsProps {
  /** Index du slide actuel (0-4) */
  currentIndex: number;

  /** Nombre total de slides (5) */
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
