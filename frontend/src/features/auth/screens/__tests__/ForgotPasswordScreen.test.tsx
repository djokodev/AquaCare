import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import ForgotPasswordScreen from '../ForgotPasswordScreen';
import { authService, AuthRequestError } from '@/features/auth/services/authService';

jest.mock('@/features/auth/services/authService', () => ({
  authService: {
    requestPasswordReset: jest.fn(),
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

describe('features/auth/screens/ForgotPasswordScreen', () => {
  const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;
  const mockRequestPasswordReset = authService.requestPasswordReset as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exige un numero de telephone', () => {
    const { getByText } = render(<ForgotPasswordScreen navigation={mockNavigation} />);

    fireEvent.press(getByText('forgotPasswordSubmit'));

    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it('envoie la demande avec le numero formate puis affiche la confirmation', async () => {
    mockRequestPasswordReset.mockResolvedValueOnce(undefined);
    const { getByPlaceholderText, getByText } = render(
      <ForgotPasswordScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByPlaceholderText('placeholderPhoneExample'), '670000000');
    fireEvent.press(getByText('forgotPasswordSubmit'));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith('+237670000000');
    });
    expect(getByText('forgotPasswordSentMessage')).toBeTruthy();
  });

  it('affiche l erreur backend sans reveler l existence du compte', async () => {
    mockRequestPasswordReset.mockRejectedValueOnce(
      new AuthRequestError('AUTH_RATE_LIMITED')
    );
    const { getByPlaceholderText, getByText, queryByText } = render(
      <ForgotPasswordScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByPlaceholderText('placeholderPhoneExample'), '670000001');
    fireEvent.press(getByText('forgotPasswordSubmit'));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalled();
    });
    expect(queryByText('forgotPasswordSentMessage')).toBeNull();
  });

  it('revient a la connexion', () => {
    const { getByText } = render(<ForgotPasswordScreen navigation={mockNavigation} />);

    fireEvent.press(getByText('backToLogin'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('Login');
  });
});
