import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { DashboardHeroCard } from '../DashboardHeroCard';
import { DashboardMetricCard } from '../DashboardMetricCard';
import { DashboardProgress } from '../DashboardProgress';
import { DashboardStatus } from '../DashboardStatus';
import { DashboardDataNotice } from '../DashboardDataNotice';

let mockWindowDimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindowDimensions,
}));

describe('dashboard cards', () => {
  beforeEach(() => {
    mockWindowDimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };
  });
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
        tone="aqua"
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

  it('uses a compact grid layout with vertically distributed content', () => {
    const { getByTestId } = render(
      <DashboardMetricCard label="Fish" value="2,700" unavailableLabel="Unavailable" />,
    );
    const cardStyle = StyleSheet.flatten(getByTestId('dashboard-metric-card').props.style);
    const contentStyle = StyleSheet.flatten(getByTestId('dashboard-metric-content').props.style);
    expect(cardStyle.minHeight).toBe(96);
    expect(contentStyle.flex).toBe(1);
    expect(contentStyle.justifyContent).toBe('space-between');
    expect(contentStyle.flexDirection).toBeUndefined();
  });

  it('renders fullWidthCompact horizontally on a standard display', () => {
    const { getByTestId } = render(
      <DashboardMetricCard label="Time remaining" value="103" unit="days" layout="fullWidthCompact" unavailableLabel="Unavailable" />,
    );
    const cardStyle = StyleSheet.flatten(getByTestId('dashboard-metric-card').props.style);
    const contentStyle = StyleSheet.flatten(getByTestId('dashboard-metric-content').props.style);
    expect(cardStyle.minHeight).toBe(76);
    expect(contentStyle.flexDirection).toBe('row');
    expect(contentStyle.justifyContent).toBe('space-between');
  });

  it.each([
    { width: 320, fontScale: 1 },
    { width: 390, fontScale: 1.3 },
  ])('stacks fullWidthCompact for responsive dimensions %p', ({ width, fontScale }) => {
    mockWindowDimensions = { width, height: 844, scale: 3, fontScale };
    const { getByTestId } = render(
      <DashboardMetricCard label="Time remaining" value="103" unit="days" layout="fullWidthCompact" unavailableLabel="Unavailable" />,
    );
    const contentStyle = StyleSheet.flatten(getByTestId('dashboard-metric-content').props.style);
    expect(contentStyle.flexDirection).toBeUndefined();
  });

  it('keeps DashboardStatus at its natural compact height', () => {
    const { getByTestId } = render(<DashboardStatus title="Replenishment required" tone="warning" />);
    const style = StyleSheet.flatten(getByTestId('dashboard-status').props.style);
    expect(style.minHeight).toBeUndefined();
    expect(style.paddingVertical).toBeGreaterThanOrEqual(12);
    expect(style.paddingVertical).toBeLessThanOrEqual(16);
  });

  it('renders an accessible data notice CTA and invokes it', () => {
    const onAction = jest.fn();
    const { getByLabelText, getByText } = render(
      <DashboardDataNotice title="Weighing required" description="Add a weighing." actionLabel="Add weighing" onAction={onAction} />,
    );
    expect(getByLabelText('Weighing required. Add a weighing.')).toBeTruthy();
    fireEvent.press(getByText('Add weighing'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('hides the data notice button without a complete action', () => {
    const { queryByRole } = render(
      <DashboardDataNotice title="Weighing required" description="Add a weighing." actionLabel="Add weighing" />,
    );
    expect(queryByRole('button')).toBeNull();
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
