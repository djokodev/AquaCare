import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useDispatch, useSelector } from 'react-redux';

import HarvestModal from '../HarvestModal';
import PartialHarvestModal from '../PartialHarvestModal';
import { harvestCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { offlineService } from '@/services/offlineService';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

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

jest.mock('@/services/offlineService', () => ({
  offlineService: {
    isOnline: jest.fn(),
    syncRelevantCalibrationOperationsForHarvest: jest.fn(),
    saveFinalHarvestOffline: jest.fn(),
  },
}));

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getCycleUnitAllocations: jest.fn(),
  },
}));

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn((selector) => selector(mockState)),
}));

jest.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
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
        case 'harvestDateInvalid':
          return 'Harvest date or time is invalid';
        case 'harvestDatetimeBeforeSession':
          return 'The harvest cannot be earlier than the start of this session.';
        case 'harvestTime':
          return 'Harvest time';
        case 'confirmHarvest':
          return 'Confirm harvest';
        case 'confirmUnitHarvest':
          return 'Confirm unit harvest';
        case 'finalHarvestPendingTitle':
          return 'Pending reconciliation';
        case 'finalHarvestPendingMessage':
          return 'The harvest is saved, but some offline operations still need to sync before the final stock can be confirmed.';
        case 'harvestSuccess':
          return 'Cycle harvested successfully!';
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
    (offlineService.isOnline as jest.Mock).mockResolvedValue(true);
    (offlineService.syncRelevantCalibrationOperationsForHarvest as jest.Mock).mockResolvedValue({ success: 0, failed: 0 });
    (aquacultureService.getCycleUnitAllocations as jest.Mock).mockResolvedValue([]);
  });

  it('shows the unit name in the full harvest modal header', () => {
    const { getByLabelText, getByTestId, getByText, queryByText } = render(
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
    expect(StyleSheet.flatten(getByTestId('harvest-actions').props.style)).toMatchObject({
      paddingBottom: 40,
      alignItems: 'center',
    });
    expect(StyleSheet.flatten(getByLabelText('cancel').props.style)).toMatchObject({ flex: 1 });
    expect(StyleSheet.flatten(getByTestId('harvest-submit').props.style)).toMatchObject({ flex: 2 });
  });

  it('rejects an invalid local harvest date without dispatching', () => {
    const dispatch = jest.fn();
    mockUseDispatch.mockReturnValue(dispatch);
    const { getByLabelText, getByTestId } = render(
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

    fireEvent.changeText(getByLabelText('Harvest date'), '2026-02-30');
    fireEvent.press(getByTestId('harvest-submit'));

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Harvest date or time is invalid');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', 'Pending reconciliation', 'The harvest is saved, but some offline operations still need to sync before the final stock can be confirmed.'],
    ['reconciled', 'Success', 'Cycle harvested successfully!'],
  ] as const)('uses the server %s status for a global online harvest', async (status, title, message) => {
    const dispatch = jest.fn(() => ({
      unwrap: jest.fn().mockResolvedValue({ reconciliation_status: status }),
    }));
    mockUseDispatch.mockReturnValue(dispatch);
    (harvestCycle as unknown as jest.Mock).mockReturnValue({ type: 'harvest-cycle' });
    const { getByTestId } = render(
      <HarvestModal
        visible
        onClose={jest.fn()}
        cycle={{
          id: 'cycle-1',
          cycle_name: 'Cycle 1',
          start_date: '2020-01-01',
          initial_count: 1000,
          current_count: 900,
          initial_average_weight: 10,
          current_average_weight: 300,
        } as never}
      />
    );

    fireEvent.press(getByTestId('harvest-submit'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      title,
      message,
      expect.any(Array),
    ));
  });

  it('validates the exact allocation session start and accepts its boundary', async () => {
    const dispatch = jest.fn(() => ({
      unwrap: jest.fn().mockResolvedValue({
        final_harvest: { reconciliation_status: 'reconciled' },
      }),
    }));
    mockUseDispatch.mockReturnValue(dispatch);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const { getByLabelText, getByTestId } = render(
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
          current_biomass_kg: 270,
          session_started_at: new Date(
            yesterday.getFullYear(),
            yesterday.getMonth(),
            yesterday.getDate(),
            8,
          ).toISOString(),
        } as never}
      />
    );
    fireEvent.changeText(getByLabelText('Harvest date'), date);
    fireEvent.changeText(getByLabelText('Harvest time'), '07:59');
    fireEvent.press(getByTestId('harvest-submit'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'The harvest cannot be earlier than the start of this session.',
    );
    dispatch.mockClear();

    fireEvent.changeText(getByLabelText('Harvest time'), '08:00');
    fireEvent.press(getByTestId('harvest-submit'));
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
  });

  it('keeps the harvest client UUID and offers offline save when a relevant calibration fails', async () => {
    const dispatch = jest.fn();
    mockUseDispatch.mockReturnValue(dispatch);
    (offlineService.syncRelevantCalibrationOperationsForHarvest as jest.Mock).mockResolvedValue({
      success: 0,
      failed: 1,
    });
    const { getByTestId } = render(
      <HarvestModal
        visible
        onClose={jest.fn()}
        cycle={{
          id: 'cycle-1',
          cycle_name: 'Cycle 1',
          start_date: '2020-01-01',
          initial_count: 1000,
          current_count: 900,
          initial_average_weight: 10,
          current_average_weight: 300,
        } as never}
      />
    );

    fireEvent.press(getByTestId('harvest-submit'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(dispatch).not.toHaveBeenCalled();
    const alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2];
    await alertButtons[1].onPress();
    expect(offlineService.saveFinalHarvestOffline).toHaveBeenCalledWith(
      '',
      'cycle-1',
      expect.objectContaining({
        cycle_id: 'cycle-1',
        client_uuid: expect.any(String),
      }),
    );
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
