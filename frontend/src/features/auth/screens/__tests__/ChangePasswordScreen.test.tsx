import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import ChangePasswordScreen from '../ChangePasswordScreen';
import { authService, AuthRequestError } from '@/features/auth/services/authService';

jest.mock('@/features/auth/services/authService', () => ({
  authService: {
    changePassword: jest.fn(),
  },
  AuthRequestError: class AuthRequestError extends Error {
    fieldErrors: Record<string, string> = {};
    constructor(message: string, fieldErrors: Record<string, string> = {}) {
      super(message);
      this.fieldErrors = fieldErrors;
    }
  },
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
}));

describe('features/auth/screens/ChangePasswordScreen', () => {
  const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;
  const mockChangePassword = authService.changePassword as jest.Mock;
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exige les champs et bloque un mot de passe trop court', () => {
    const { getAllByPlaceholderText, getByText } = render(
      <ChangePasswordScreen navigation={mockNavigation} />
    );

    const inputs = getAllByPlaceholderText('********');
    fireEvent.changeText(inputs[0], 'motdepasse123');
    fireEvent.changeText(inputs[1], 'court');
    fireEvent.changeText(inputs[2], 'court');

    fireEvent.press(getByText('changePasswordSubmit'));

    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('soumet le changement avec le payload attendu', async () => {
    mockChangePassword.mockResolvedValueOnce(undefined);
    const { getAllByPlaceholderText, getByText } = render(
      <ChangePasswordScreen navigation={mockNavigation} />
    );

    const inputs = getAllByPlaceholderText('********');
    fireEvent.changeText(inputs[0], 'motdepasse123');
    fireEvent.changeText(inputs[1], 'NouveauMotDePasse2026');
    fireEvent.changeText(inputs[2], 'NouveauMotDePasse2026');

    fireEvent.press(getByText('changePasswordSubmit'));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith({
        current_password: 'motdepasse123',
        password: 'NouveauMotDePasse2026',
        password_confirm: 'NouveauMotDePasse2026',
      });
    });
    expect(alertSpy).toHaveBeenCalled();
  });

  it('remonte les erreurs de champ du backend', async () => {
    mockChangePassword.mockRejectedValueOnce(
      new AuthRequestError('', { current_password: 'Le mot de passe actuel est incorrect.' })
    );
    const { getAllByPlaceholderText, getByText, findByText, queryByText } = render(
      <ChangePasswordScreen navigation={mockNavigation} />
    );

    const inputs = getAllByPlaceholderText('********');
    fireEvent.changeText(inputs[0], 'mauvais');
    fireEvent.changeText(inputs[1], 'NouveauMotDePasse2026');
    fireEvent.changeText(inputs[2], 'NouveauMotDePasse2026');

    fireEvent.press(getByText('changePasswordSubmit'));

    expect(await findByText('Le mot de passe actuel est incorrect.')).toBeTruthy();
    expect(queryByText('AUTH_UNKNOWN_ERROR')).toBeNull();
  });

  it('refuse une confirmation differente', () => {
    const { getAllByPlaceholderText, getByText } = render(
      <ChangePasswordScreen navigation={mockNavigation} />
    );

    const inputs = getAllByPlaceholderText('********');
    fireEvent.changeText(inputs[0], 'motdepasse123');
    fireEvent.changeText(inputs[1], 'NouveauMotDePasse2026');
    fireEvent.changeText(inputs[2], 'AutreMotDePasse2026');

    fireEvent.press(getByText('changePasswordSubmit'));

    expect(mockChangePassword).not.toHaveBeenCalled();
  });
});
