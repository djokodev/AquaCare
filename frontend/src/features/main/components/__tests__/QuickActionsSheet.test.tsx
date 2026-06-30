import React from 'react';
import { render } from '@testing-library/react-native';

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
    expect(getByText('productionUnitReportAction')).toBeTruthy();
    expect(queryByText('dailyLog')).toBeNull();
    expect(queryByText('sanitaryLog')).toBeNull();
    expect(queryByText('notifications')).toBeNull();
    expect(queryByText('feedingPlan')).toBeNull();
    expect(queryByText('reports')).toBeNull();
    expect(queryByText('productCatalog')).toBeNull();
    expect(queryByText('cart')).toBeNull();
    expect(queryByText('ordersHistory')).toBeNull();
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
