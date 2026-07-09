import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Ionicons } from '@expo/vector-icons';

import ProfileScreen from '../ProfileScreen';
import { useAuth } from '@/hooks/useAuth';
import { useProfileEditor } from '@/features/profile/hooks/useProfileEditor';

const navigation = {
  navigate: jest.fn(),
} as any;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/features/profile/hooks/useProfileEditor', () => ({
  useProfileEditor: jest.fn(),
}));

jest.mock('@/components/common/LocationSelector', () => ({
  __esModule: true,
  default: () => null,
}));

describe('features/profile/screens/ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useAuth as jest.Mock).mockReturnValue({
      user: {
        phone_number: '+237670000000',
        email: 'jean@example.com',
        first_name: 'Jean',
        last_name: 'Dupont',
        region: 'Littoral',
        intervention_zone: 'coastal',
        language_preference: 'fr',
        is_verified: true,
      },
      farmProfile: {
        farm_name: 'Ferme Test',
        certification_status: 'certified',
      },
      isLoading: false,
      error: null,
      updateProfile: jest.fn(),
      loadProfile: jest.fn(),
      logout: jest.fn(),
      displayName: 'Jean Dupont',
      isIndividual: true,
    });

    (useProfileEditor as jest.Mock).mockReturnValue({
      isEditing: false,
      setIsEditing: jest.fn(),
      isSaving: false,
      editData: {
        email: 'jean@example.com',
        intervention_zone: 'coastal',
      },
      updateEditField: jest.fn(),
      locationData: {},
      setLocationData: jest.fn(),
      save: jest.fn(),
    });
  });

  it('retire les informations ferme et conserve la navigation vers FarmProfile', () => {
    const { getByText, queryByText, UNSAFE_getAllByType } = render(
      <ProfileScreen navigation={navigation} />
    );

    expect(getByText('farmManagement')).toBeTruthy();
    expect(queryByText('farmInfo')).toBeNull();

    const iconNames = UNSAFE_getAllByType(Ionicons).map((icon) => icon.props.name);
    expect(iconNames).not.toContain('analytics');

    fireEvent.press(getByText('farmManagement'));

    expect(navigation.navigate).toHaveBeenCalledWith('FarmProfile');
  });
});
