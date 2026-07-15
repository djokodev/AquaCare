import React from 'react';
import { render } from '@testing-library/react-native';

import { DashboardHeroCard } from '../DashboardHeroCard';
import { DashboardMetricCard } from '../DashboardMetricCard';
import { DashboardProgress } from '../DashboardProgress';

describe('dashboard cards', () => {
  it('renders a hero value, helper, progress and accessible announcement', () => {
    const { getByText, getByLabelText } = render(
      <DashboardHeroCard
        label="Market value"
        value="4,860,000"
        unit="FCFA"
        helper="Current estimate"
        unavailableLabel="Unavailable"
        progress={61}
        progressLabel="Cycle progress"
      />,
    );
    expect(getByText('4,860,000')).toBeTruthy();
    expect(getByText('Current estimate')).toBeTruthy();
    expect(getByText('61%')).toBeTruthy();
    expect(getByLabelText('Market value, 4,860,000 FCFA')).toBeTruthy();
    expect(getByText('4,860,000').props.numberOfLines).toBeUndefined();
  });

  it('keeps zero distinct from an unavailable hero value', () => {
    const zero = render(
      <DashboardHeroCard label="Value" value={0} unit="kg" unavailableLabel="Unavailable" />,
    );
    expect(zero.getByText('0')).toBeTruthy();
    expect(zero.queryByText('Unavailable')).toBeNull();
    zero.unmount();

    const missing = render(
      <DashboardHeroCard label="Value" value={null} unit="kg" unavailableLabel="Unavailable" />,
    );
    expect(missing.getByText('—')).toBeTruthy();
    expect(missing.getByText('Unavailable')).toBeTruthy();
  });

  it('renders metric value, unit, helper, tone and accessibility', () => {
    const { getByText, getByLabelText, getByTestId } = render(
      <DashboardMetricCard
        label="Biomass"
        value={0}
        unit="kg"
        helper="Measured today"
        tone="success"
        unavailableLabel="Unavailable"
      />,
    );
    expect(getByText('0')).toBeTruthy();
    expect(getByText('kg')).toBeTruthy();
    expect(getByText('Measured today')).toBeTruthy();
    expect(getByLabelText('Biomass, 0 kg. Measured today')).toBeTruthy();
    expect(getByTestId('dashboard-metric-card').props.style).toBeTruthy();
  });

  it('renders unavailable metric data for null', () => {
    const { getByText, queryByText } = render(
      <DashboardMetricCard label="Biomass" value={null} unit="kg" unavailableLabel="Unavailable" />,
    );
    expect(getByText('—')).toBeTruthy();
    expect(getByText('Unavailable')).toBeTruthy();
    expect(queryByText('kg')).toBeNull();
  });

  it.each([
    [-10, '0%'],
    [0, '0%'],
    [50, '50%'],
    [100, '100%'],
    [150, '100%'],
  ])('clamps progress %p to %s', (value, expected) => {
    const { getByText, getByLabelText } = render(
      <DashboardProgress value={value} label="Progress" unavailableLabel="Unavailable" />,
    );
    expect(getByText(expected)).toBeTruthy();
    expect(getByLabelText(`Progress, ${expected}`)).toBeTruthy();
  });

  it('announces unavailable progress', () => {
    const { getByText, getByLabelText } = render(
      <DashboardProgress value={null} label="Progress" unavailableLabel="Unavailable" />,
    );
    expect(getByText('—')).toBeTruthy();
    expect(getByLabelText('Progress, Unavailable')).toBeTruthy();
  });
});
