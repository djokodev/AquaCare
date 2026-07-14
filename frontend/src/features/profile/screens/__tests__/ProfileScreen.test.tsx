import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
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
  const loadProfile = jest.fn();
  const logout = jest.fn();
  const save = jest.fn();
  const setIsEditing = jest.fn();

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
      loadProfile,
      logout,
      displayName: 'Jean Dupont',
      isIndividual: true,
    });

    (useProfileEditor as jest.Mock).mockReturnValue({
      isEditing: false,
      setIsEditing,
      isSaving: false,
      editData: {
        email: 'jean@example.com',
        intervention_zone: 'coastal',
      },
      updateEditField: jest.fn(),
      locationData: {},
      setLocationData: jest.fn(),
      save,
    });
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => jest.restoreAllMocks());

  it('affiche le chargement', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null, farmProfile: null, isLoading: true, error: null, updateProfile: jest.fn(), loadProfile, logout, displayName: '', isIndividual: true });
    expect(render(<ProfileScreen navigation={navigation} />).getByText('loadingUserProfile')).toBeTruthy();
  });

  it('affiche erreur sans user et permet retry', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null, farmProfile: null, isLoading: false, error: 'boom', updateProfile: jest.fn(), loadProfile, logout, displayName: '', isIndividual: true });
    const screen = render(<ProfileScreen navigation={navigation} />);
    fireEvent.press(screen.getByText('retry'));
    expect(loadProfile).toHaveBeenCalled();
  });

  it('affiche un compte entreprise', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { phone_number: '+237670000000', email: 'aqua@example.com', business_name: 'Aqua SARL', legal_status: 'SARL', promoter_name: 'Alice', region: 'Littoral', intervention_zone: 'coastal', language_preference: 'fr', is_verified: true }, farmProfile: null, isLoading: false, error: null, updateProfile: jest.fn(), loadProfile, logout, displayName: 'Aqua SARL', isIndividual: false });
    const screen = render(<ProfileScreen navigation={navigation} />);
    expect(screen.getByText('companyInfo')).toBeTruthy();
    expect(screen.getAllByText('Aqua SARL')).toHaveLength(2);
  });

  it('active edition, sauvegarde et navigue vers paramètres', async () => {
    save.mockResolvedValue(undefined);
    const screen = render(<ProfileScreen navigation={navigation} />);
    fireEvent.press(screen.getByLabelText('edit'));
    expect(setIsEditing).toHaveBeenCalledWith(true);
    (useProfileEditor as jest.Mock).mockReturnValue({ isEditing: true, setIsEditing, isSaving: false, editData: { email: 'jean@example.com', intervention_zone: 'coastal' }, updateEditField: jest.fn(), locationData: {}, setLocationData: jest.fn(), save });
    screen.rerender(<ProfileScreen navigation={navigation} />);
    fireEvent.press(screen.getByText('saveChanges'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    fireEvent.press(screen.getByText('settings'));
    expect(navigation.navigate).toHaveBeenCalledWith('Settings');
  });

  it('configure le champ email sans correction ni majuscule', () => {
    (useProfileEditor as jest.Mock).mockReturnValue({ isEditing: true, setIsEditing, isSaving: false, editData: { email: 'jean@example.com', intervention_zone: 'coastal' }, updateEditField: jest.fn(), locationData: {}, setLocationData: jest.fn(), save });

    const emailField = render(<ProfileScreen navigation={navigation} />).getByLabelText('email');

    expect(emailField.props).toMatchObject({
      keyboardType: 'email-address',
      autoCapitalize: 'none',
      autoCorrect: false,
      textContentType: 'emailAddress',
    });
  });

  it('affiche erreur de sauvegarde et confirme logout', async () => {
    save.mockRejectedValue(new Error('save failed'));
    (useProfileEditor as jest.Mock).mockReturnValue({ isEditing: true, setIsEditing, isSaving: false, editData: { email: '', intervention_zone: '' }, updateEditField: jest.fn(), locationData: {}, setLocationData: jest.fn(), save });
    const screen = render(<ProfileScreen navigation={navigation} />);
    fireEvent.press(screen.getByText('saveChanges'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('error', expect.any(String)));
    fireEvent.press(screen.getByText('disconnect'));
    const actions = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as Array<{ style?: string; onPress?: () => void }>;
    actions.find((action) => action.style === 'destructive')?.onPress?.();
    expect(logout).toHaveBeenCalled();
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
