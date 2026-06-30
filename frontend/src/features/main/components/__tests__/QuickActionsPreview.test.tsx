import React from 'react';
import { render } from '@testing-library/react-native';

import QuickActionsPreview from '../QuickActionsPreview';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('features/main/components/QuickActionsPreview', () => {
  const navigation = {
    navigate: jest.fn(),
  } as any;

  const incompleteProductionUnitContext = {
    cycleId: 'cycle-1',
    cycleUnitAllocationId: '',
    productionUnitId: 'unit-1',
    productionUnitName: 'Bac 1',
  } as any;

  it('refuse un contexte unitaire incomplet', () => {
    const { queryByText, getByText } = render(
      <QuickActionsPreview
        onOpenSheet={jest.fn()}
        hasActiveCycles
        unreadCount={0}
        navigation={navigation}
        scope="unit"
        productionUnitContext={incompleteProductionUnitContext}
      />
    );

    expect(queryByText('dailyLog')).toBeNull();
    expect(queryByText('sanitaryLog')).toBeNull();
    expect(queryByText('productionUnitLogHistoryAction')).toBeNull();
    expect(getByText('viewAllActions')).toBeTruthy();
  });
});
