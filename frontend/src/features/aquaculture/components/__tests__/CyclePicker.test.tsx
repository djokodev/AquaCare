import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import CyclePicker from '../CyclePicker';
import { ProductionCycle } from '@/types/aquaculture';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const cycle: ProductionCycle = {
  id: 'cycle-1',
  farm_profile: 'farm-1',
  cycle_name: 'Cycle Clarias',
  species: 'clarias',
  pond_identifier: 'Bac 1',
  pond_surface_m2: 100,
  start_date: '2026-01-01',
  initial_count: 1000,
  initial_average_weight: 10,
  initial_biomass: 10,
  current_count: 900,
  current_average_weight: 120,
  current_biomass: 108,
  total_feed_consumed: 120,
  survival_rate: 90,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

describe('features/aquaculture/components/CyclePicker', () => {
  it('affiche les informations de cycle et annonce la sélection', () => {
    const onSelectCycle = jest.fn();
    const { getByTestId, getByText, rerender } = render(
      <CyclePicker
        cycles={[cycle]}
        selectedCycleId={null}
        onSelectCycle={onSelectCycle}
      />,
    );

    expect(getByText('Cycle Clarias #1')).toBeTruthy();
    expect(getByText('Bac 1')).toBeTruthy();
    expect(getByText('108.0 kg')).toBeTruthy();
    expect(getByTestId('cycle-picker-cycle-1').props.accessibilityState).toMatchObject({
      selected: false,
      disabled: false,
    });

    fireEvent.press(getByTestId('cycle-picker-cycle-1'));
    expect(onSelectCycle).toHaveBeenCalledWith('cycle-1');

    rerender(
      <CyclePicker
        cycles={[cycle]}
        selectedCycleId="cycle-1"
        onSelectCycle={onSelectCycle}
      />,
    );

    expect(getByTestId('cycle-picker-cycle-1').props.accessibilityState.selected).toBe(true);
  });
});
