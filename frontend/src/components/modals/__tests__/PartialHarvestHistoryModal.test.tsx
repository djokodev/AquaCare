import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import PartialHarvestHistoryModal from '../PartialHarvestHistoryModal';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: { getPartialHarvests: jest.fn() },
}));

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('PartialHarvestHistoryModal', () => {
  const cycle = { id: 'cycle-1', cycle_name: 'Cycle test' } as never;
  const getPartialHarvests = aquacultureService.getPartialHarvests as jest.Mock;

  beforeEach(() => jest.clearAllMocks());

  it('shows an error and retries instead of treating a failed request as empty', async () => {
    getPartialHarvests.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    const { getByText } = render(<PartialHarvestHistoryModal visible onClose={jest.fn()} cycle={cycle} />);

    await waitFor(() => expect(getByText('aquacultureErrorRetry')).toBeTruthy());
    fireEvent.press(getByText('retry'));
    await waitFor(() => expect(getPartialHarvests).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getByText('noPartialHarvests')).toBeTruthy());
  });

  it('shows totals and optional revenue for loaded harvests', async () => {
    getPartialHarvests.mockResolvedValueOnce([{
      id: 'harvest-1', harvest_date: '2026-07-14', count_harvested: 12,
      total_weight_kg: '4.5', estimated_revenue_fcfa: 15000, notes: 'Bon état',
    }]);
    const { getAllByText, getByText } = render(<PartialHarvestHistoryModal visible onClose={jest.fn()} cycle={cycle} />);

    await waitFor(() => expect(getAllByText('12').length).toBeGreaterThan(0));
    expect(getByText('4.50 kg')).toBeTruthy();
    expect(getByText('15,000 FCFA')).toBeTruthy();
    expect(getByText('Bon état')).toBeTruthy();
  });
});
