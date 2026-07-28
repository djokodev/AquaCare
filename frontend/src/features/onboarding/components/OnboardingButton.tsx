/**
 * Composant bouton réutilisable pour l'onboarding
 * Respecte la charte graphique AquaCare
 * @module features/onboarding/components
 */

import React from 'react';
import { OnboardingButtonProps } from '../types/onboarding';
import { Button } from '@/components/ui';

/**
 * Bouton primaire AquaCare pour onboarding
 * Gère états normal, pressé, désactivé
 */
export default function OnboardingButton({
  title,
  onPress,
  disabled = false,
}: OnboardingButtonProps) {
  return <Button label={title} onPress={onPress} disabled={disabled} size="large" />;
}
