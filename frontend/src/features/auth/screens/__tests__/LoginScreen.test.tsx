import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../LoginScreen';
import { useAuth } from '@/hooks/useAuth';

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

describe('features/auth/screens/LoginScreen', () => {
  const mockLogin = jest.fn();
  const mockClearAuthError = jest.fn();
  const mockNavigation = {
    navigate: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      login: mockLogin,
      isLoading: false,
      error: null,
      clearAuthError: mockClearAuthError,
    });
  });

  it('affiche des erreurs de validation si formulaire vide', async () => {
    const { getByText, findAllByText } = render(<LoginScreen navigation={mockNavigation} />);

    fireEvent.press(getByText('signIn'));

    const requiredErrors = await findAllByText('required');
    expect(requiredErrors.length).toBeGreaterThan(0);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('connecte en mode login_name avec payload attendu', async () => {
    mockLogin.mockResolvedValueOnce({} as any);
    const { getByPlaceholderText, getByText } = render(<LoginScreen navigation={mockNavigation} />);

    fireEvent.changeText(getByPlaceholderText('placeholderLoginName'), 'Jean Dupont');
    fireEvent.changeText(getByPlaceholderText('********'), 'password123');
    fireEvent.press(getByText('signIn'));

    await waitFor(() => {
      expect(mockClearAuthError).toHaveBeenCalled();
      expect(mockLogin).toHaveBeenCalledWith({
        login_name: 'Jean Dupont',
        password: 'password123',
      });
    });
  });

  it('bascule en mode telephone et envoie phone_number formate', async () => {
    mockLogin.mockResolvedValueOnce({} as any);
    const { getAllByText, getByPlaceholderText, getByText } = render(<LoginScreen navigation={mockNavigation} />);

    fireEvent.press(getAllByText('phoneNumber')[0]);
    fireEvent.changeText(getByPlaceholderText('placeholderPhoneExample'), '670000000');
    fireEvent.changeText(getByPlaceholderText('********'), 'password123');
    fireEvent.press(getByText('signIn'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        phone_number: '+237670000000',
        password: 'password123',
      });
    });
  });

  it('navigue vers Register depuis le lien signUp', () => {
    const { getByText } = render(<LoginScreen navigation={mockNavigation} />);

    fireEvent.press(getByText('signUp'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('Register');
  });
});
