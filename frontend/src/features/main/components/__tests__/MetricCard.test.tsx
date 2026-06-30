import React from 'react';
import { render } from '@testing-library/react-native';

import MetricCard from '../MetricCard';

describe('features/main/components/MetricCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders value and label with the default props', () => {
    const { getByText } = render(
      <MetricCard
        value="3600"
        label="Total poissons"
      />
    );

    expect(getByText('3600')).toBeTruthy();
    expect(getByText('Total poissons')).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('renders value and label without scheduling timers', () => {
    const { getByText } = render(
      <MetricCard
        value="88%"
        label="Survie"
      />
    );

    expect(getByText('88%')).toBeTruthy();
    expect(getByText('Survie')).toBeTruthy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
