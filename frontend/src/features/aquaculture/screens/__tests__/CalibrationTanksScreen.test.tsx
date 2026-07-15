import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

import CalibrationTanksScreen from '../CalibrationTanksScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: { getCalibrationTanks: jest.fn() },
}));
jest.mock('@/services/offlineService', () => ({
  offlineService: { getOfflineCalibrationTanks: jest.fn() },
}));

describe('CalibrationTanksScreen', () => {
  const service = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const local = offlineService as jest.Mocked<typeof offlineService>;
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn() } as any;
  const pending = {
    id: 'offline-1',
    tankData: { client_uuid: 'client-1', name: 'Bac local', volume_m3: 9 },
    timestamp: 1_700_000_000_000,
    synced: false,
  };

  beforeEach(() => jest.clearAllMocks());

  it('fusionne serveur et pending sans doublon client_uuid', async () => {
    service.getCalibrationTanks.mockResolvedValue([{
      id: 'server-1', client_uuid: 'client-1', name: 'Bac officiel', volume_m3: 9,
      is_active: true, is_occupied: false, created_at: '', updated_at: '', farm_profile: 'farm-1',
    }] as any);
    local.getOfflineCalibrationTanks.mockResolvedValue([pending] as any);
    const { getByText, queryByText } = render(
      <CalibrationTanksScreen navigation={navigation} route={{} as any} />,
    );
    await waitFor(() => expect(getByText('Bac officiel')).toBeTruthy());
    expect(queryByText('Bac local')).toBeNull();
  });

  it('garde le bac pending visible lorsque le serveur échoue', async () => {
    service.getCalibrationTanks.mockRejectedValue(new Error('offline'));
    local.getOfflineCalibrationTanks.mockResolvedValue([pending] as any);
    const { getByText } = render(<CalibrationTanksScreen navigation={navigation} route={{} as any} />);
    await waitFor(() => expect(getByText('Bac local')).toBeTruthy());
    expect(getByText('calibrationTankPending')).toBeTruthy();
  });
});
