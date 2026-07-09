import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';

import FarmProfileScreen from '../FarmProfileScreen';
import { useAuth } from '@/hooks/useAuth';
import { fetchDashboardData } from '@/features/aquaculture/store/aquacultureSlice';

const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
const mockLoadProfile = jest.fn();
const mockUseEffect = React.useEffect;

let mockState: any;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
  useFocusEffect: (callback: () => void) => mockUseEffect(() => callback(), [callback]),
}));

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/features/aquaculture/store/aquacultureSlice', () => ({
  fetchDashboardData: jest.fn(() => ({ type: 'aquaculture/fetchDashboardData' })),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'fr',
    },
  }),
}));

jest.mock('@/features/profile/hooks/useFarmProfileEditor', () => ({
  useFarmProfileEditor: () => ({
    isEditing: false,
    setIsEditing: jest.fn(),
    isSaving: false,
    editData: {},
    updateEditField: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    saveLocation: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@/hooks/useFarmLocation', () => ({
  useFarmLocation: () => ({
    status: 'idle',
    requestLocation: jest.fn().mockResolvedValue(null),
  }),
}));

jest.mock('@/features/profile/utils/accountProfilePresentation', () => ({
  formatFarmName: (value: string) => value,
  getCertificationPresentation: () => ({
    color: '#10b981',
    icon: 'checkmark-circle',
    text: 'certificationPending',
  }),
}));

jest.mock('@/features/auth/utils/accountsErrorPresenter', () => ({
  getAccountErrorMessage: (error: unknown) => String(error),
}));

jest.mock('@/components/common/inputStyles', () => ({
  sharedTextInputStyles: {},
}));

describe('features/profile/screens/FarmProfileScreen', () => {
  const mockUseAuth = useAuth as jest.Mock;
  const mockUseSelector = useSelector as unknown as jest.Mock;
  const mockFetchDashboardData = fetchDashboardData as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockLoadProfile.mockResolvedValue(undefined);
    mockDispatch.mockImplementation(() => ({ type: 'dispatch-result' }));
    mockUseAuth.mockReturnValue({
      farmProfile: {
        id: 'farm-1',
        farm_name: 'Ferme Test',
        certification_status: 'pending',
        total_ponds: 2,
        total_area_m2: 1200,
        water_source: 'Riviere',
        main_species: 'tilapia',
        annual_production_kg: 500,
        latitude: null,
        longitude: null,
        location_address: '',
        is_certified: false,
      },
      isLoading: false,
      error: null,
      updateFarm: jest.fn(),
      loadProfile: mockLoadProfile,
      loadFarmProfile: mockLoadProfile,
    });
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          dashboardData: {
            active_cycles: [],
          },
        },
      })
    );
  });

  it('rafraichit le profil ferme au focus et au pull-to-refresh', async () => {
    const { UNSAFE_getByType } = render(<FarmProfileScreen />);

    await waitFor(() => {
      expect(mockLoadProfile).toHaveBeenCalledTimes(1);
    });

    expect(mockFetchDashboardData).toHaveBeenCalledWith(undefined);

    const scrollView = UNSAFE_getByType(ScrollView);

    await act(async () => {
      scrollView.props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(mockLoadProfile).toHaveBeenCalledTimes(2);
    });

    expect(mockFetchDashboardData).toHaveBeenCalledTimes(2);
  });

  it('affiche le badge de certification courant', async () => {
    const { getByText } = render(<FarmProfileScreen />);

    await waitFor(() => {
      expect(getByText('certificationPending')).toBeTruthy();
    });
  });
});
