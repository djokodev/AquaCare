import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RegisterScreen from '../RegisterScreen';
import { useAuth } from '@/hooks/useAuth';

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/components/SelectField', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return ({ label, onChange }: { label: string; onChange: (v: string) => void }) => (
    <TouchableOpacity testID={`select-${label}`} onPress={() => onChange(`${label}-value`)}>
      <Text>{label}</Text>
    </TouchableOpacity>
  );
});

describe('features/auth/screens/RegisterScreen', () => {
  const mockRegister = jest.fn();
  const mockClearAuthError = jest.fn();
  const mockNavigation = {
    navigate: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      register: mockRegister,
      isLoading: false,
      error: null,
      clearAuthError: mockClearAuthError,
    });
  });

  it('affiche les erreurs requises sur formulaire vide', async () => {
    const { getByText, findAllByText } = render(<RegisterScreen navigation={mockNavigation} />);

    fireEvent.press(getByText('signUp'));

    const errors = await findAllByText('required');
    expect(errors.length).toBeGreaterThan(0);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('soumet un compte individuel valide', async () => {
    mockRegister.mockResolvedValueOnce({} as any);
    const { getByPlaceholderText, getByTestId, getByText, getAllByPlaceholderText } = render(
      <RegisterScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByPlaceholderText('placeholderPhoneExample'), '670000000');
    fireEvent.changeText(getByPlaceholderText('placeholderFirstName'), 'Jean');
    fireEvent.changeText(getByPlaceholderText('placeholderLastName'), 'Dupont');
    fireEvent.press(getByTestId('select-ageGroup'));

    fireEvent.changeText(getByPlaceholderText('placeholderEmail'), 'jean@example.com');
    const passwordInputs = getAllByPlaceholderText('********');
    fireEvent.changeText(passwordInputs[0], 'password123');
    fireEvent.changeText(passwordInputs[1], 'password123');

    fireEvent.press(getByText('signUp'));

    await waitFor(() => {
      expect(mockClearAuthError).toHaveBeenCalled();
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          account_type: 'individual',
          phone_number: '+237670000000',
          first_name: 'Jean',
          last_name: 'Dupont',
          age_group: 'ageGroup-value',
          password: 'password123',
          password_confirm: 'password123',
        })
      );
    });
  });

  it('soumet un compte entreprise valide', async () => {
    mockRegister.mockResolvedValueOnce({} as any);
    const { getByText, getByPlaceholderText, getAllByPlaceholderText, getByTestId } = render(
      <RegisterScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('company'));

    fireEvent.changeText(getByPlaceholderText('placeholderPhoneExample'), '680111222');
    fireEvent.changeText(getByPlaceholderText('placeholderBusinessName'), 'Aqua Entreprise');
    fireEvent.press(getByTestId('select-legalStatus'));
    fireEvent.changeText(getByPlaceholderText('placeholderPromoterName'), 'Mme Promoteur');

    const passwordInputs = getAllByPlaceholderText('********');
    fireEvent.changeText(passwordInputs[0], 'password123');
    fireEvent.changeText(passwordInputs[1], 'password123');

    fireEvent.press(getByText('signUp'));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          account_type: 'company',
          phone_number: '+237680111222',
          business_name: 'Aqua Entreprise',
          legal_status: 'legalStatus-value',
          promoter_name: 'Mme Promoteur',
        })
      );
    });
  });

  it('navigue vers Login via le lien signIn', () => {
    const { getByText } = render(<RegisterScreen navigation={mockNavigation} />);

    fireEvent.press(getByText('signIn'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('Login');
  });
});
