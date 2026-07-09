import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { useDispatch, useSelector } from 'react-redux';

import HarvestModal from '../HarvestModal';
import PartialHarvestModal from '../PartialHarvestModal';

const mockState = {
  auth: {
    farmProfile: {
      num_cycles_per_year: 1,
    },
  },
  aquaculture: {
    cycles: [],
  },
};

jest.mock('@/features/aquaculture/store/aquacultureSlice', () => ({
  harvestCycle: jest.fn(),
  harvestCycleUnitAllocation: jest.fn(),
  createPartialHarvest: jest.fn(),
  createPartialHarvestForUnit: jest.fn(),
}));

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn((selector) => selector(mockState)),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      switch (key) {
        case 'harvestThisUnitTitleWithName':
          return `Harvest ${String(options?.unitName ?? '')}`;
        case 'harvestThisUnitSubtitle':
          return 'This action will close this production unit.';
        case 'partialHarvestUnitTitleWithName':
          return `Partial harvest — ${String(options?.unitName ?? '')}`;
        case 'partialHarvestUnitSubtitle':
          return 'This unit stock will be reduced, but the unit will remain active.';
        case 'partialHarvestWouldEmptyUnit':
          return 'This quantity would empty the unit. Use the full unit harvest instead.';
        case 'confirmPartialHarvest':
          return 'Confirm partial harvest';
        case 'ok':
          return 'OK';
        case 'success':
          return 'Success';
        case 'error':
          return 'Error';
        case 'productionUnit':
          return 'Production unit';
        case 'productionUnitSummary':
          return 'Production unit summary';
        case 'harvestData':
          return 'Harvest data';
        case 'harvestDate':
          return 'Harvest date';
        case 'dateFormatPlaceholder':
          return 'YYYY-MM-DD';
        case 'countHarvested':
          return 'Count harvested';
        case 'maxValuePlaceholder':
          return `Max ${String(options?.max ?? '')}`;
        case 'averageWeightG':
          return 'Average weight (g)';
        case 'exampleAverageWeightG':
          return 'E.g. 350';
        case 'harvestNotes':
          return 'Harvest notes';
        case 'enterHarvestNotes':
          return 'Notes...';
        case 'finalWeightRequired':
          return 'Final weight required';
        case 'partialHarvestCountRequired':
          return 'Partial harvest count required';
        case 'partialHarvestCountExceedsAvailable':
          return 'Count exceeds available fish';
        case 'harvestDateRequired':
          return 'Harvest date required';
        case 'fishAvailableInThisUnit':
          return 'Fish available in this unit';
        case 'thisActionWillCloseThisProductionUnit':
          return 'This action will close this production unit.';
        case 'finalCount':
          return 'Final count';
        case 'finalAverageWeight':
          return 'Final average weight';
        case 'enterFinalCount':
          return 'Enter final count';
        case 'enterFinalWeight':
          return 'Enter final weight';
        case 'optional':
          return 'optional';
        case 'totalHarvestedWeight':
          return 'Total harvested weight';
        case 'unitSurvivalRate':
          return 'Unit survival rate';
        case 'unitWeightGain':
          return 'Unit weight gain';
        case 'performanceMetrics':
          return 'Performance metrics';
        default:
          return key;
      }
    },
  }),
}));

jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

describe('components/modals harvest flows', () => {
  const mockUseDispatch = useDispatch as unknown as jest.Mock;
  const mockUseSelector = useSelector as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDispatch.mockReturnValue(jest.fn());
    mockUseSelector.mockImplementation((selector: (state: typeof mockState) => unknown) =>
      selector(mockState)
    );
  });

  it('shows the unit name in the full harvest modal header', () => {
    const { getByText, queryByText } = render(
      <HarvestModal
        visible
        onClose={jest.fn()}
        cycle={null}
        scope="unit"
        productionUnitContext={{
          cycleId: 'cycle-1',
          cycleUnitAllocationId: 'allocation-1',
          productionUnitId: 'unit-1',
          productionUnitName: 'Bac 1',
        }}
        unitAllocation={{
          id: 'allocation-1',
          cycle: 'cycle-1',
          production_unit: 'unit-1',
          initial_fish_count: 900,
          current_fish_count: 900,
          initial_biomass_kg: 9,
          current_biomass_kg: 9,
        } as never}
      />
    );

    expect(getByText('Harvest Bac 1')).toBeTruthy();
    expect(getByText('This action will close this production unit.')).toBeTruthy();
    expect(queryByText('productionUnitSummary')).toBeNull();
  });

  it('blocks a partial harvest that would empty the unit', () => {
    const { getByText, getByPlaceholderText } = render(
      <PartialHarvestModal
        visible
        onClose={jest.fn()}
        cycle={null}
        scope="unit"
        productionUnitContext={{
          cycleId: 'cycle-1',
          cycleUnitAllocationId: 'allocation-1',
          productionUnitId: 'unit-1',
          productionUnitName: 'Bac 1',
        }}
        unitAllocation={{
          id: 'allocation-1',
          cycle: 'cycle-1',
          production_unit: 'unit-1',
          initial_fish_count: 900,
          current_fish_count: 880,
          initial_biomass_kg: 9,
          current_biomass_kg: 8.8,
        } as never}
      />
    );

    expect(getByText('Partial harvest — Bac 1')).toBeTruthy();
    expect(getByText('This unit stock will be reduced, but the unit will remain active.')).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('Max 880'), '880');
    fireEvent.press(getByText('Confirm partial harvest'));

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'This quantity would empty the unit. Use the full unit harvest instead.');
  });
});
