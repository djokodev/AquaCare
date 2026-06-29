import React from 'react';
import { act, render } from '@testing-library/react-native';

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

  it('renders without crashing with the default animation', () => {
    const { getByText } = render(
      <MetricCard
        icon="analytics-outline"
        color={AQUACARE_COLORS.GREEN_PRIMARY}
        value="3600"
        label="Total poissons"
        index={0}
      />
    );

    expect(getByText('3600')).toBeTruthy();
    expect(getByText('Total poissons')).toBeTruthy();

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it('renders without crashing with the rotate animation', () => {
    const { getByText } = render(
      <MetricCard
        icon="refresh-outline"
        color={AQUACARE_COLORS.GREEN_PRIMARY}
        value="88%"
        label="Survie"
        index={1}
        animationType="rotate"
      />
    );

    expect(getByText('88%')).toBeTruthy();
    expect(getByText('Survie')).toBeTruthy();

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });
});
