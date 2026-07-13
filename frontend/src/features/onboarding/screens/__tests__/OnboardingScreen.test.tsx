import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import OnboardingScreen from '../OnboardingScreen';
import OnboardingService from '../../services/onboardingService';

jest.mock('../../components/OnboardingSlide', () => () => null);
jest.mock('../../components/SlideIndicators', () => () => null);

describe('features/onboarding/screens/OnboardingScreen', () => {
  beforeEach(() => {
    jest.spyOn(OnboardingService, 'setCompleted').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves the completion flow when the user skips onboarding', async () => {
    const onCompleted = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(<OnboardingScreen onCompleted={onCompleted} />);

    fireEvent.press(getByText('onboardingSkip'));

    await waitFor(() => {
      expect(OnboardingService.setCompleted).toHaveBeenCalledTimes(1);
      expect(onCompleted).toHaveBeenCalledTimes(1);
    });
  });
});
