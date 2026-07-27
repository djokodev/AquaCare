import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useDispatch, useSelector } from 'react-redux';

import DailyLogScreen from '../DailyLogScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { CycleStore, ProductionCycle } from '@/types/aquaculture';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('react-redux', () => ({ useDispatch: jest.fn(), useSelector: jest.fn() }));

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    createCycleLog: jest.fn(),
    updateCycleLog: jest.fn(),
    getCycleLogs: jest.fn(),
    getCycleStore: jest.fn(),
  },
}));

jest.mock('@/services/offlineService', () => ({
  offlineService: {
    hasAnyPendingSync: jest.fn(),
    syncAllOfflineData: jest.fn(),
    saveCycleLogOffline: jest.fn(),
    findPendingCycleLogForScope: jest.fn(),
    getOfflineStockDeclarations: jest.fn(),
    getOfflineFeedReferences: jest.fn(),
    getPendingSyncLogs: jest.fn(),
  },
}));

jest.mock('@/components/modals/SuccessRewardModal', () => ({ __esModule: true, default: () => null }));

jest.mock('@/features/aquaculture/components/FeedingTimesField', () => ({
  __esModule: true,
  default: ({ onChange, error }: { onChange: (value: string[]) => void; error?: string }) => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    return (
      <>
        <Pressable accessibilityRole="button" onPress={() => onChange(['08:00', '12:30'])}>
          <Text>mock-add-time</Text>
        </Pressable>
        {error ? <Text>{error}</Text> : null}
      </>
    );
  },
}));

describe('features/aquaculture/screens/DailyLogScreen', () => {
  const mockDispatch = jest.fn();
  const mockUseSelector = useSelector as unknown as jest.Mock;
  const mockService = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const mockOffline = offlineService as jest.Mocked<typeof offlineService>;
  const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
  const route = {
    params: {
      cycleId: 'cycle-1',
      cycleUnitAllocationId: 'allocation-1',
      productionUnitId: 'unit-1',
      productionUnitName: 'Bac 1',
    },
  } as any;

  const activeCycle: ProductionCycle = {
    id: 'cycle-1',
    farm_profile: 'farm-1',
    cycle_name: 'Cycle 1',
    species: 'tilapia',
    pond_identifier: 'P1',
    start_date: '2026-01-01',
    initial_count: 1000,
    initial_average_weight: 10,
    initial_biomass: 10,
    current_count: 900,
    current_average_weight: 120,
    current_biomass: 108,
    total_feed_consumed: 130,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  const store: CycleStore = {
    cycle_id: 'cycle-1',
    calculation_status: 'available',
    calculation_source: 'current_cycle_reforecast',
    calculated_at: '2026-07-20T00:00:00Z',
    calculation_warnings: [],
    status: 'ok',
    summary: {
      manual_feed_kg: '50.00',
      received_order_feed_kg: '0.00',
      total_feed_added_kg: '50.00',
      feed_consumed_kg: '0.00',
      estimated_feed_remaining_kg: '50.00',
      feed_expenses_fcfa: '25000.00',
      pending_orders_count: 0,
      pending_order_amount_fcfa: '0.00',
      pending_order_feed_kg: '0.00',
      total_feed_needed_kg: '500.00',
      feed_need_remaining_kg: '370.00',
      secured_feed_kg: '50.00',
      feed_to_secure_kg: '320.00',
      stock_tracking_started_at: '2026-01-01',
      unclassified_stock_kg: '0.00',
    },
    stock_items: [{
      feed_reference_id: 'feed-1',
      source: 'external',
      species: 'tilapia',
      label: 'Dibaq',
      feed_size_mm: '2.50',
      quantity_added_kg: '50.00',
      quantity_consumed_kg: '0.00',
      quantity_available_kg: '50.00',
    }],
    pending_orders: [],
    stock_tracking_started_at: '2026-01-01',
    unclassified_entries: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) => selector({
      aquaculture: { dashboardData: { active_cycles: [activeCycle] } },
    }));
    mockService.getCycleLogs.mockResolvedValue([]);
    mockService.getCycleStore.mockResolvedValue(store);
    mockService.createCycleLog.mockResolvedValue({ id: 'log-1' } as any);
    mockOffline.hasAnyPendingSync.mockResolvedValue(false);
    mockOffline.findPendingCycleLogForScope.mockResolvedValue(null);
    mockOffline.getOfflineStockDeclarations.mockResolvedValue([]);
    mockOffline.getOfflineFeedReferences.mockResolvedValue([]);
    mockOffline.getPendingSyncLogs.mockResolvedValue([]);
    mockOffline.syncAllOfflineData.mockResolvedValue({
      success: 0,
      failed: 0,
      details: {
        cycleLogs: { success: 0, failed: 0 },
        newCycles: { success: 0, failed: 0 },
        sanitaryLogs: { success: 0, failed: 0 },
      },
    });
  });

  it('refuse la saisie globale et renvoie vers le choix d une unité', () => {
    const { getByText } = render(
      <DailyLogScreen navigation={navigation} route={{ params: { cycleId: 'cycle-1' } } as any} />
    );

    expect(getByText('dailyLogUnitRequiredTitle')).toBeTruthy();
    fireEvent.press(getByText('chooseProductionUnit'));
    expect(navigation.navigate).toHaveBeenCalledWith('ProductionUnitsHub', { cycleId: 'cycle-1' });
    expect(mockService.createCycleLog).not.toHaveBeenCalled();
  });

  it('enregistre explicitement une journée sans nourrissage', async () => {
    const { getByText, getByPlaceholderText } = render(
      <DailyLogScreen navigation={navigation} route={route} />
    );
    await waitFor(() => expect(getByText('Cycle 1')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('mortalityPlaceholder'), '0');
    fireEvent.press(getByText('feedingNotDone'));
    fireEvent.press(getByText('save'));

    await waitFor(() => expect(mockService.createCycleLog).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({
        cycle_unit_allocation: 'allocation-1',
        mortality_count: 0,
        feed_quantity: null,
        feeding_times: [],
      })
    ));
  });

  it('conserve les décimales saisies avec une virgule', async () => {
    const { getByText, getByPlaceholderText } = render(
      <DailyLogScreen navigation={navigation} route={route} />
    );
    await waitFor(() => expect(getByText('Cycle 1')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('mortalityPlaceholder'), '0');
    fireEvent.press(getByText('feedingDone'));
    fireEvent.press(getByText('feedStockItemOption'));
    fireEvent.changeText(getByPlaceholderText('feedQuantityPlaceholder'), '16,8');
    fireEvent.changeText(getByPlaceholderText('phLevelPlaceholder'), '7,2');
    fireEvent.changeText(getByPlaceholderText('ammoniaLevelPlaceholder'), '0,2');
    fireEvent.press(getByText('mock-add-time'));
    fireEvent.press(getByText('save'));

    await waitFor(() => expect(mockService.createCycleLog).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({
        feed_quantity: 16.8,
        feed_size_mm: 2.5,
        ph_level: 7.2,
        ammonia_level: 0.2,
        feeding_times: ['08:00', '12:30'],
      })
    ));
  });

  it('affiche une erreur dans le champ avant tout appel API', async () => {
    const { getByText, getByPlaceholderText } = render(
      <DailyLogScreen navigation={navigation} route={route} />
    );
    await waitFor(() => expect(getByText('Cycle 1')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('mortalityPlaceholder'), '0');
    fireEvent.press(getByText('feedingDone'));
    fireEvent.changeText(getByPlaceholderText('feedQuantityPlaceholder'), '0');

    expect(getByText('feedQuantityMinimum')).toBeTruthy();
    expect(mockService.createCycleLog).not.toHaveBeenCalled();
  });

  it('bloque une ration quand aucun stock n est déclaré', async () => {
    mockService.getCycleStore.mockResolvedValue({
      ...store,
      status: 'not_started',
      stock_tracking_started_at: null,
      summary: {
        ...store.summary,
        estimated_feed_remaining_kg: '0.00',
        stock_tracking_started_at: null,
      },
    });
    const { getByText, getByPlaceholderText } = render(
      <DailyLogScreen navigation={navigation} route={route} />
    );
    await waitFor(() => expect(getByText('Cycle 1')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('mortalityPlaceholder'), '0');
    fireEvent.press(getByText('feedingDone'));
    fireEvent.changeText(getByPlaceholderText('feedQuantityPlaceholder'), '5');

    expect(getByText('feedStockRequired')).toBeTruthy();
    expect(getByText('declareFeedStock')).toBeTruthy();
    expect(mockService.createCycleLog).not.toHaveBeenCalled();
  });

  it('ne propose pas un stock non classifié comme ration utilisable', async () => {
    mockService.getCycleStore.mockResolvedValue({
      ...store,
      status: 'check_stock',
      stock_items: [{
        feed_reference_id: null,
        source: null,
        species: null,
        label: 'Ancien aliment',
        feed_size_mm: '2.00',
        quantity_added_kg: '30.00',
        quantity_consumed_kg: '0.00',
        quantity_available_kg: '30.00',
      }],
      stock_by_size: [],
      available_pellet_sizes: ['2.00'],
      summary: {
        ...store.summary,
        estimated_feed_remaining_kg: '30.00',
        unclassified_stock_kg: '30.00',
      },
    });

    const { getByText, getByPlaceholderText, queryByText } = render(
      <DailyLogScreen navigation={navigation} route={route} />
    );
    await waitFor(() => expect(getByText('Cycle 1')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('mortalityPlaceholder'), '0');
    fireEvent.press(getByText('feedingDone'));

    expect(getByText('feedStockRequiresClassification')).toBeTruthy();
    expect(queryByText('feedStockItemRequired')).toBeNull();
    fireEvent.changeText(getByPlaceholderText('feedQuantityPlaceholder'), '5');
    expect(getByText('feedStockRequiresClassification')).toBeTruthy();
    expect(mockService.createCycleLog).not.toHaveBeenCalled();
  });

  it('préremplit puis remplace la saisie existante du jour', async () => {
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60_000;
    const localDate = new Date(today.getTime() - offset).toISOString().slice(0, 10);
    mockService.getCycleLogs.mockResolvedValue([{
      id: 'existing-log',
      cycle: 'cycle-1',
      cycle_unit_allocation: 'allocation-1',
      log_date: localDate,
      mortality_count: 0,
      feed_quantity: 16.8,
      feed_type: 'Dibaq',
      feed_size_mm: 2.5,
      feeding_times: ['08:00'],
      created_offline: false,
      created_at: `${localDate}T08:00:00Z`,
    }]);
    mockService.getCycleStore.mockResolvedValue({
      ...store,
      summary: { ...store.summary, estimated_feed_remaining_kg: '3.20', feed_consumed_kg: '16.80' },
    });

    const { getByText, getByDisplayValue } = render(
      <DailyLogScreen navigation={navigation} route={route} />
    );

    await waitFor(() => expect(getByText('dailyLogUpdatingToday')).toBeTruthy());
    expect(getByDisplayValue('16,8')).toBeTruthy();
    expect(getByText('updateTodayEntry')).toBeTruthy();
    expect(getByText('feedStockAvailable')).toBeTruthy();
  });

  it('crée un journal quand le brouillon local référence un journal serveur disparu', async () => {
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60_000;
    const localDate = new Date(today.getTime() - offset).toISOString().slice(0, 10);
    const staleLocalLog = {
      id: 'offline-log-stale',
      cycleId: 'cycle-1',
      logData: {
        cycle_unit_allocation: 'allocation-1',
        log_date: localDate,
        client_uuid: 'offline-client-stale',
        mortality_count: 0,
        mortality_reason: '',
        feed_quantity: null,
        feed_type: '',
        feed_size_mm: null,
        feed_reference: null,
        feeding_times: [],
        created_offline: true,
      },
      fingerprint: 'stale-fingerprint',
      timestamp: Date.now(),
      synced: false,
      server_log_id: 'missing-server-log',
    };
    mockOffline.findPendingCycleLogForScope.mockResolvedValue(staleLocalLog);

    const { getByText } = render(
      <DailyLogScreen navigation={navigation} route={route} />
    );
    await waitFor(() => expect(getByText('Cycle 1')).toBeTruthy());

    fireEvent.press(getByText('feedingNotDone'));
    fireEvent.press(getByText('updateTodayEntry'));

    await waitFor(() => expect(mockService.createCycleLog).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ client_uuid: 'offline-client-stale' }),
    ));
    expect(mockService.updateCycleLog).not.toHaveBeenCalled();
  });

  it('rouvre et modifie la saisie locale du jour sans accès serveur', async () => {
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60_000;
    const localDate = new Date(today.getTime() - offset).toISOString().slice(0, 10);
    const localLog = {
      id: 'offline-log-1',
      cycleId: 'cycle-1',
      logData: {
        cycle_unit_allocation: 'allocation-1',
        log_date: localDate,
        client_uuid: 'offline-client-uuid',
        mortality_count: 0,
        mortality_reason: '',
        feed_quantity: 5,
        feed_type: 'Dibaq',
        feed_size_mm: 2.5,
        feed_reference: 'feed-1',
        feeding_times: ['08:00'],
        created_offline: true,
      },
      fingerprint: 'fingerprint',
      timestamp: Date.now(),
      synced: false,
    };
    mockService.getCycleLogs.mockRejectedValue(new TypeError('Network request failed'));
    mockService.getCycleStore.mockRejectedValue(new TypeError('Network request failed'));
    mockService.createCycleLog.mockRejectedValue(new TypeError('Network request failed'));
    mockOffline.findPendingCycleLogForScope.mockResolvedValue(localLog);
    mockOffline.getPendingSyncLogs.mockResolvedValue([localLog]);
    mockOffline.getOfflineFeedReferences.mockResolvedValue([{
      id: 'offline-reference',
      clientUuid: 'offline-reference-uuid',
      serverId: 'feed-1',
      payload: {
        client_uuid: 'offline-reference-uuid',
        farm_profile: 'farm-1',
        source: 'external',
        name: 'Dibaq',
        species: 'tilapia',
        pellet_size_mm: '2.50',
      },
      fingerprint: 'reference-fingerprint',
      timestamp: Date.now(),
      synced: true,
    }]);
    mockOffline.getOfflineStockDeclarations.mockResolvedValue([{
      id: 'offline-stock',
      cycleId: 'cycle-1',
      clientUuid: 'offline-stock-uuid',
      feedReferenceClientUuid: 'offline-reference-uuid',
      payload: {
        client_uuid: 'offline-stock-uuid',
        feed_reference_client_uuid: 'offline-reference-uuid',
        quantity_kg: '10.00',
        total_cost_fcfa: '8000.00',
        entry_date: localDate,
      },
      fingerprint: 'stock-fingerprint',
      timestamp: Date.now(),
      synced: false,
    }]);

    const { getByText, getByDisplayValue, getByPlaceholderText } = render(
      <DailyLogScreen navigation={navigation} route={route} />
    );

    await waitFor(() => expect(getByText('dailyLogPendingLocalUpdate')).toBeTruthy());
    expect(getByDisplayValue('5')).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('feedQuantityPlaceholder'), '11');
    expect(getByText('feedStockInsufficient')).toBeTruthy();
    expect(mockOffline.saveCycleLogOffline).not.toHaveBeenCalled();
    fireEvent.changeText(getByPlaceholderText('feedQuantityPlaceholder'), '4');
    fireEvent.press(getByText('updateTodayEntry'));

    await waitFor(() => expect(mockOffline.saveCycleLogOffline).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({
        client_uuid: 'offline-client-uuid',
        feed_quantity: 4,
        feed_reference: null,
      }),
      { serverLogId: null },
    ));
  });

  it('affiche une validation serveur sous le champ concerné', async () => {
    mockService.createCycleLog.mockRejectedValue({
      response: {
        status: 400,
        data: { feed_quantity: ['Le stock a changé. Saisissez une ration plus faible.'] },
      },
    });
    const { getByText, getByPlaceholderText } = render(
      <DailyLogScreen navigation={navigation} route={route} />
    );
    await waitFor(() => expect(getByText('Cycle 1')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('mortalityPlaceholder'), '0');
    fireEvent.press(getByText('feedingDone'));
    fireEvent.press(getByText('feedStockItemOption'));
    fireEvent.changeText(getByPlaceholderText('feedQuantityPlaceholder'), '5');
    fireEvent.press(getByText('mock-add-time'));
    fireEvent.press(getByText('save'));

    await waitFor(() => expect(
      getByText('Le stock a changé. Saisissez une ration plus faible.'),
    ).toBeTruthy());
  });

  it('traduit une erreur métier de stock renvoyée après une vérification concurrente', async () => {
    mockService.createCycleLog.mockRejectedValue({
      response: {
        status: 400,
        data: {
          code: 'insufficient_feed_stock',
          field: 'feed_quantity',
          detail: 'Backend message',
          available_feed_kg: '3.20',
        },
      },
    });
    const { getByText, getByPlaceholderText, queryByText } = render(
      <DailyLogScreen navigation={navigation} route={route} />
    );
    await waitFor(() => expect(getByText('Cycle 1')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('mortalityPlaceholder'), '0');
    fireEvent.press(getByText('feedingDone'));
    fireEvent.press(getByText('feedStockItemOption'));
    fireEvent.changeText(getByPlaceholderText('feedQuantityPlaceholder'), '5');
    fireEvent.press(getByText('mock-add-time'));
    fireEvent.press(getByText('save'));

    await waitFor(() => expect(getByText('feedStockInsufficient')).toBeTruthy());
    expect(queryByText('Backend message')).toBeNull();
  });
});
