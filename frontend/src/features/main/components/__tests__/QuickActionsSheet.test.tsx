import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import QuickActionsSheet from '../QuickActionsSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('features/main/components/QuickActionsSheet', () => {
  const navigation = {
    navigate: jest.fn(),
  } as any;

  const productionUnitContext = {
    cycleId: 'cycle-1',
    cycleUnitAllocationId: 'allocation-1',
    productionUnitId: 'unit-1',
    productionUnitName: 'Bac 1',
  };

  const incompleteProductionUnitContext = {
    cycleId: 'cycle-1',
    cycleUnitAllocationId: '',
    productionUnitId: 'unit-1',
    productionUnitName: 'Bac 1',
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('n affiche que des actions unit-scoped en mode unite', () => {
    const { getByText, queryByText } = render(
      <QuickActionsSheet
        visible
        onClose={jest.fn()}
        unreadCount={4}
        navigation={navigation}
        scope="unit"
        productionUnitContext={productionUnitContext}
      />
    );

    expect(getByText('productionUnitDailyLogAction')).toBeTruthy();
    expect(getByText('productionUnitSanitaryLogAction')).toBeTruthy();
    expect(getByText('productionUnitLogHistoryAction')).toBeTruthy();
    expect(getByText('feedingPlan')).toBeTruthy();
    expect(getByText('productionUnitReportAction')).toBeTruthy();
    expect(getByText('gradeFish')).toBeTruthy();
    expect(queryByText('calibrationTanksTitle')).toBeNull();
    expect(queryByText('dailyLog')).toBeNull();
    expect(queryByText('sanitaryLog')).toBeNull();
    expect(queryByText('notifications')).toBeNull();
    expect(queryByText('reports')).toBeNull();
    expect(queryByText('productCatalog')).toBeNull();
    expect(queryByText('cart')).toBeNull();
    expect(queryByText('ordersHistory')).toBeNull();
  });

  it('ouvre le calibrage avec la source unitaire précise', () => {
    const { getByText } = render(
      <QuickActionsSheet
        visible
        onClose={jest.fn()}
        unreadCount={0}
        navigation={navigation}
        scope="unit"
        productionUnitContext={productionUnitContext}
      />
    );

    fireEvent.press(getByText('gradeFish'));
    act(() => jest.runAllTimers());

    expect(navigation.navigate).toHaveBeenCalledWith('CalibrateCycle', {
      sourceCycleId: 'cycle-1',
      sourceCycleUnitAllocationId: 'allocation-1',
      sourceUnitName: 'Bac 1',
      sourceCurrentCount: undefined,
      sourceCurrentBiomassKg: undefined,
    });
  });

  it('navigue vers FeedingPlan avec le contexte unitaire', () => {
    const { getByText } = render(
      <QuickActionsSheet
        visible
        onClose={jest.fn()}
        unreadCount={4}
        navigation={navigation}
        scope="unit"
        productionUnitContext={productionUnitContext}
      />
    );

    fireEvent.press(getByText('feedingPlan'));
    act(() => {
      jest.runAllTimers();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('FeedingPlan', productionUnitContext);
  });

  it('retire Plan d alimentation du scope cycle', () => {
    const { queryByText } = render(
      <QuickActionsSheet
        visible
        onClose={jest.fn()}
        unreadCount={4}
        navigation={navigation}
        scope="cycle"
        cycleContext={{ cycleId: 'cycle-1' }}
      />
    );

    expect(queryByText('feedingPlan')).toBeNull();
  });

  it('masque les actions globales opérationnelles pour un cycle avec unités', () => {
    const { getByText, queryByText } = render(
      <QuickActionsSheet
        visible
        onClose={jest.fn()}
        unreadCount={4}
        navigation={navigation}
        scope="cycle"
        cycleContext={{ cycleId: 'cycle-1' }}
        hideGlobalCycleOperationalActions
        onHarvestCycle={jest.fn()}
      />
    );

    expect(queryByText('dailyLog')).toBeNull();
    expect(queryByText('sanitaryLog')).toBeNull();
    expect(queryByText('partialHarvestOption')).toBeNull();
    expect(getByText('harvestEntireCycleAction')).toBeTruthy();
  });

  it('refuse un contexte unitaire incomplet', () => {
    const { getByText, queryByText } = render(
      <QuickActionsSheet
        visible
        onClose={jest.fn()}
        unreadCount={4}
        navigation={navigation}
        scope="unit"
        productionUnitContext={incompleteProductionUnitContext}
      />
    );

    expect(queryByText('productionUnitDailyLogAction')).toBeNull();
    expect(queryByText('productionUnitSanitaryLogAction')).toBeNull();
    expect(queryByText('productionUnitLogHistoryAction')).toBeNull();
    expect(queryByText('productionUnitReportAction')).toBeNull();
  });
});
