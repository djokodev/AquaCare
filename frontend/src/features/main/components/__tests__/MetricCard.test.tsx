import React from 'react';
import { render } from '@testing-library/react-native';

import { AQUACARE_COLORS } from '@/constants/colors';
import MetricCard from '../MetricCard';

describe('features/main/components/MetricCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders without timers with the default props', () => {
    const { getByText } = render(
      <MetricCard
        icon="analytics-outline"
        color={AQUACARE_COLORS.GREEN_PRIMARY}
        value="3600"
        label="Total poissons"
      />
    );

    expect(getByText('3600')).toBeTruthy();
    expect(getByText('Total poissons')).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('renders without timers when an animation type is provided', () => {
    const { getByText } = render(
      <MetricCard
        icon="refresh-outline"
        color={AQUACARE_COLORS.GREEN_PRIMARY}
        value="88%"
        label="Survie"
      />
    );

    expect(getByText('88%')).toBeTruthy();
    expect(getByText('Survie')).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
