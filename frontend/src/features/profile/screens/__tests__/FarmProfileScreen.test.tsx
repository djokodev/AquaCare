import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ScrollView } from 'react-native';

import FarmProfileScreen from '../FarmProfileScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { useAuth } from '@/hooks/useAuth';

const mockNavigate = jest.fn();
const mockLoadProfile = jest.fn();
const mockUseEffect = React.useEffect;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
  useFocusEffect: (callback: () => void) => mockUseEffect(() => callback(), [callback]),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getProductionUnits: jest.fn(),
  },
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
  const mockAquacultureService = aquacultureService as jest.Mocked<typeof aquacultureService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadProfile.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      farmProfile: {
        id: 'farm-1',
        farm_name: 'Ferme Test',
        certification_status: 'pending',
        total_ponds: 50,
        setup_unit_count: 99,
        total_area_m2: 120,
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
    mockAquacultureService.getProductionUnits.mockResolvedValue([
      {
        id: 'unit-1',
        farm_profile: 'farm-1',
        name: 'Etang 1',
        unit_type: 'pond',
        surface_m2: 120,
        volume_m3: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'unit-2',
        farm_profile: 'farm-1',
        name: 'Bac 1',
        unit_type: 'tank',
        surface_m2: null,
        volume_m3: 3,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'unit-3',
        farm_profile: 'farm-1',
        name: 'Bac 2',
        unit_type: 'tank',
        surface_m2: null,
        volume_m3: 5,
        status: 'archived',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
  });

  it('rafraichit le profil ferme au focus et au pull-to-refresh', async () => {
    const { UNSAFE_getByType } = render(<FarmProfileScreen />);

    await waitFor(() => {
      expect(mockLoadProfile).toHaveBeenCalledTimes(1);
    });

    expect(mockAquacultureService.getProductionUnits).toHaveBeenCalledWith({ status: 'active' });

    const scrollView = UNSAFE_getByType(ScrollView);

    await act(async () => {
      scrollView.props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(mockLoadProfile).toHaveBeenCalledTimes(2);
    });
    expect(mockAquacultureService.getProductionUnits).toHaveBeenCalledTimes(2);
  });

  it('affiche le badge de certification courant', async () => {
    const { getByText } = render(<FarmProfileScreen />);

    await waitFor(() => {
      expect(getByText('certificationPending')).toBeTruthy();
    });
  });

  it("n'affiche plus le champ de production annuelle", async () => {
    const { queryByText } = render(<FarmProfileScreen />);

    await waitFor(() => {
      expect(queryByText('annualProduction')).toBeNull();
    });
  });

  it("n'affiche plus l'espèce principale", async () => {
    const { queryByText } = render(<FarmProfileScreen />);

    await waitFor(() => {
      expect(queryByText('mainSpecies')).toBeNull();
    });
  });

  it('affiche la surface, le volume et le compteur depuis les unités actives', async () => {
    const { getByText, queryByText } = render(<FarmProfileScreen />);

    await waitFor(() => {
      expect(getByText('120 m²')).toBeTruthy();
      expect(getByText('3 m³')).toBeTruthy();
      expect(getByText('2')).toBeTruthy();
      expect(queryByText('99')).toBeNull();
      expect(queryByText('50')).toBeNull();
    });
  });

  it("n'affiche plus la section des cycles en cours", async () => {
    const { queryByText } = render(<FarmProfileScreen />);

    await waitFor(() => {
      expect(queryByText('currentCycles')).toBeNull();
      expect(queryByText('viewDailyLogHistory')).toBeNull();
    });
  });
});
