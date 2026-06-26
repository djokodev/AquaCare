import * as SecureStore from 'expo-secure-store';

import { authService } from '@/features/auth/services/authService';
import { apiService } from '../api';
import { STORAGE_KEYS } from '@/constants/api';

jest.mock('../api');
jest.mock('expo-secure-store');

describe('services/authService', () => {
  const mockApiService = apiService as jest.Mocked<typeof apiService>;
  const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

  const mockCredentials = {
    phone_number: '+237670000000',
    password: 'password123',
  };

  const mockRegisterData = {
    phone_number: '+237670000000',
    first_name: 'John',
    last_name: 'Doe',
    account_type: 'individual' as const,
    language_preference: 'fr' as const,
    password: 'password123',
    password_confirm: 'password123',
  };

  const mockUser = {
    id: '123',
    phone_number: '+237670000000',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    account_type: 'individual' as const,
    language_preference: 'fr' as const,
    is_verified: false,
    display_name: 'John Doe',
    is_individual: true,
    is_company: false,
  };

  const mockAuthResponse = {
    tokens: {
      access: 'access-token-123',
      refresh: 'refresh-token-456',
    },
    user: mockUser,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSecureStore.getItemAsync.mockReset();
    mockSecureStore.setItemAsync.mockReset();
    mockApiService.post.mockReset();
    mockApiService.get.mockReset();
    mockApiService.patch.mockReset();
    mockApiService.clearTokens.mockReset();

    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockSecureStore.setItemAsync.mockResolvedValue();
    mockApiService.post.mockResolvedValue({ data: {} } as any);
    mockApiService.get.mockResolvedValue({ data: {} } as any);
    mockApiService.patch.mockResolvedValue({ data: {} } as any);
    mockApiService.clearTokens.mockResolvedValue();
  });

  describe('login', () => {
    it('authentifie utilisateur et sauvegarde tokens', async () => {
      mockApiService.post.mockResolvedValueOnce({ data: mockAuthResponse } as any);

      const result = await authService.login(mockCredentials);

      expect(mockApiService.post).toHaveBeenCalledWith(expect.stringContaining('/login/'), mockCredentials);
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.ACCESS_TOKEN, mockAuthResponse.tokens.access);
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.REFRESH_TOKEN, mockAuthResponse.tokens.refresh);
      expect(result).toEqual(mockAuthResponse);
    });

    it('propage erreur en cas échec authentification', async () => {
      const errorResponse = {
        response: {
          status: 401,
          data: { detail: 'Identifiants invalides' },
        },
      };
      mockApiService.post.mockRejectedValueOnce(errorResponse as any);

      await expect(authService.login(mockCredentials)).rejects.toThrow();
    });
  });

  describe('register', () => {
    it('inscrit utilisateur et sauvegarde tokens', async () => {
      mockApiService.post.mockResolvedValueOnce({ data: mockAuthResponse } as any);

      const result = await authService.register(mockRegisterData);

      expect(mockApiService.post).toHaveBeenCalledWith(expect.stringContaining('/register/'), mockRegisterData);
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.ACCESS_TOKEN, mockAuthResponse.tokens.access);
      expect(result).toEqual(mockAuthResponse);
    });

    it('propage erreur en cas échec inscription', async () => {
      const errorResponse = {
        response: {
          status: 400,
          data: { phone: ['Ce numéro existe déjà'] },
        },
      };
      mockApiService.post.mockRejectedValueOnce(errorResponse as any);

      await expect(authService.register(mockRegisterData)).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('envoie requête logout et nettoie tokens locaux', async () => {
      mockSecureStore.getItemAsync.mockResolvedValueOnce('refresh-token-456');
      mockApiService.post.mockResolvedValueOnce({ data: {} } as any);
      mockApiService.clearTokens.mockResolvedValueOnce(undefined);

      await authService.logout();

      expect(mockApiService.post).toHaveBeenCalledWith(expect.stringContaining('/logout/'), { refresh: 'refresh-token-456' });
      expect(mockApiService.clearTokens).toHaveBeenCalled();
    });

    it('nettoie tokens locaux même si API échoue', async () => {
      mockSecureStore.getItemAsync.mockResolvedValueOnce('refresh-token-456');
      mockApiService.post.mockRejectedValueOnce(new Error('Network error'));
      mockApiService.clearTokens.mockResolvedValueOnce(undefined);

      await authService.logout();

      expect(mockApiService.clearTokens).toHaveBeenCalled();
    });

    it('nettoie tokens même sans refresh token', async () => {
      mockSecureStore.getItemAsync.mockResolvedValueOnce(null);
      mockApiService.clearTokens.mockResolvedValueOnce(undefined);

      await authService.logout();

      expect(mockApiService.post).not.toHaveBeenCalled();
      expect(mockApiService.clearTokens).toHaveBeenCalled();
    });
  });

  describe('isAuthenticated', () => {
    it('retourne true si token est valide', async () => {
      const validToken = `h.${Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64')}.s`;
      mockSecureStore.getItemAsync.mockResolvedValueOnce(validToken);

      const result = await authService.isAuthenticated();

      expect(result).toBe(true);
      expect(mockApiService.post).not.toHaveBeenCalled();
    });

    it('retourne false si token manquant', async () => {
      mockSecureStore.getItemAsync.mockResolvedValueOnce(null);
      mockApiService.post.mockImplementation(() => {
        throw new Error('Ne doit pas être appelé');
      });

      const result = await authService.isAuthenticated();

      expect(result).toBe(false);
      expect(mockApiService.post).not.toHaveBeenCalled();
    });

    it('retourne true si token expire mais refresh reussit', async () => {
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce(`h.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64')}.s`)
        .mockResolvedValueOnce('refresh-token-456');
      mockApiService.post.mockResolvedValueOnce({
        data: { access: 'new-access-token', refresh: 'new-refresh-token' },
      } as any);

      const result = await authService.isAuthenticated();

      expect(result).toBe(true);
      expect(mockApiService.post).toHaveBeenCalledWith(
        expect.stringContaining('/token/refresh/'),
        { refresh: 'refresh-token-456' }
      );
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.ACCESS_TOKEN, 'new-access-token');
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.REFRESH_TOKEN, 'new-refresh-token');
    });

    it('retourne false si token invalide et refresh absent', async () => {
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce(`h.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64')}.s`)
        .mockResolvedValueOnce(null);
      mockApiService.clearTokens.mockResolvedValueOnce(undefined);

      const result = await authService.isAuthenticated();

      expect(result).toBe(false);
      expect(mockApiService.clearTokens).toHaveBeenCalled();
    });

    it('retourne false en cas erreur', async () => {
      mockSecureStore.getItemAsync.mockRejectedValueOnce(new Error('Storage error'));
      mockApiService.post.mockImplementation(() => {
        throw new Error('Ne doit pas être appelé');
      });

      const result = await authService.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('getCurrentUser', () => {
    it('retourne utilisateur depuis storage', async () => {
      mockSecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(mockUser));

      const result = await authService.getCurrentUser();

      expect(result).toEqual(mockUser);
    });

    it('retourne null si pas de données', async () => {
      mockSecureStore.getItemAsync.mockResolvedValueOnce(null);

      const result = await authService.getCurrentUser();

      expect(result).toBeNull();
    });

    it('retourne null en cas erreur parsing', async () => {
      mockSecureStore.getItemAsync.mockResolvedValueOnce('invalid-json');

      const result = await authService.getCurrentUser();

      expect(result).toBeNull();
    });
  });
});
