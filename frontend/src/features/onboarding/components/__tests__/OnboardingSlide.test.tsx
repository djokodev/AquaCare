import React from 'react';
import { render } from '@testing-library/react-native';

import OnboardingSlide from '../OnboardingSlide';
import { OnboardingVisualType } from '../../types/onboarding';

describe('OnboardingSlide', () => {
  it.each<[OnboardingVisualType, string]>([
    ['welcome', 'onboardingWelcomeTagline'],
    ['track', 'onboardingTrackMockAlive'],
    ['feed', 'onboardingFeedMockAlarm'],
    ['shop', 'onboardingShopMockStatus'],
  ])('affiche le titre, le texte et l apercu %s', (visual, mockKey) => {
    const { getByText } = render(
      <OnboardingSlide slide={{ id: visual, visual, titleKey: `${visual}Title`, textKey: `${visual}Text` }} />,
    );
    expect(getByText(`${visual}Title`)).toBeTruthy();
    expect(getByText(`${visual}Text`)).toBeTruthy();
    expect(getByText(mockKey)).toBeTruthy();
  });
});
