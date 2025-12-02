/**
 * Tests unitaires pour authService.ts
 *
 * Tests des appels API et gestion du stockage sÃ©curisÃ©.
 */

import * as SecureStore from 'expo-secure-store';
import { authService } from '../authService';
import { apiService } from '@/services/api';
import { STORAGE_KEYS } from '@/constants/api';

// Mock des dÃ©pendances
jest.mock('@/services/api');
jest.mock('expo-secure-store');

describe('services/authService', () => {
  const mockApiService = apiService as jest.Mocked<typeof apiService>;
  const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

  // DonnÃ©es de test
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

  const mockFarmProfile = {
    id: '456',
    farm_name: 'Ferme Test',
    certification_status: 'pending' as const,
    total_ponds: 5,
    total_area_m2: 5000,
    is_certified: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('authentifie utilisateur et sauvegarde tokens', async () => {
      mockApiService.post.mockResolvedValue({ data: mockAuthResponse } as any);
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      const result = await authService.login(mockCredentials);

      expect(mockApiService.post).toHaveBeenCalledWith(
        expect.stringContaining('/login/'),
        mockCredentials
      );
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        STORAGE_KEYS.ACCESS_TOKEN,
        mockAuthResponse.tokens.access
      );
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        STORAGE_KEYS.REFRESH_TOKEN,
        mockAuthResponse.tokens.refresh
      );
      expect(result).toEqual(mockAuthResponse);
    });

    it('propage erreur en cas Ã©chec authentification', async () => {
      const errorResponse = {
        response: {
          status: 401,
          data: { detail: 'Identifiants invalides' },
        },
      };
      mockApiService.post.mockRejectedValue(errorResponse);

      await expect(authService.login(mockCredentials)).rejects.toThrow();
    });
  });

  describe('register', () => {
    it('inscrit utilisateur et sauvegarde tokens', async () => {
      mockApiService.post.mockResolvedValue({ data: mockAuthResponse } as any);
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      const result = await authService.register(mockRegisterData);

      expect(mockApiService.post).toHaveBeenCalledWith(
        expect.stringContaining('/register/'),
        mockRegisterData
      );
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        STORAGE_KEYS.ACCESS_TOKEN,
        mockAuthResponse.tokens.access
      );
      expect(result).toEqual(mockAuthResponse);
    });

    it('propage erreur en cas Ã©chec inscription', async () => {
      const errorResponse = {
        response: {
          status: 400,
          data: { phone: ['Ce numÃ©ro existe dÃ©jÃ '] },
        },
      };
      mockApiService.post.mockRejectedValue(errorResponse);

      await expect(authService.register(mockRegisterData)).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('envoie requÃªte logout et nettoie tokens locaux', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('refresh-token-456');
      mockApiService.post.mockResolvedValue({ data: {} } as any);
      mockApiService.clearTokens.mockResolvedValue(undefined);

      await authService.logout();

      expect(mockApiService.post).toHaveBeenCalledWith(
        expect.stringContaining('/logout/'),
        { refresh: 'refresh-token-456' }
      );
      expect(mockApiService.clearTokens).toHaveBeenCalled();
    });

    it('nettoie tokens locaux mÃªme si API Ã©choue', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('refresh-token-456');
      mockApiService.post.mockRejectedValue(new Error('Network error'));
      mockApiService.clearTokens.mockResolvedValue(undefined);

      await authService.logout();

      expect(mockApiService.clearTokens).toHaveBeenCalled();
    });

    it('nettoie tokens mÃªme sans refresh token', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      mockApiService.clearTokens.mockResolvedValue(undefined);

      await authService.logout();

      expect(mockApiService.post).not.toHaveBeenCalled();
      expect(mockApiService.clearTokens).toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('rÃ©cupÃ¨re profil utilisateur et met Ã  jour storage', async () => {
      mockApiService.get.mockResolvedValue({ data: mockUser } as any);
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      const result = await authService.getProfile();

      expect(mockApiService.get).toHaveBeenCalledWith(
        expect.stringContaining('/profile/')
      );
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        STORAGE_KEYS.USER_DATA,
        JSON.stringify(mockUser)
      );
      expect(result).toEqual(mockUser);
    });

    it('propage erreur en cas Ã©chec rÃ©cupÃ©ration', async () => {
      mockApiService.get.mockRejectedValue(new Error('Unauthorized'));

      await expect(authService.getProfile()).rejects.toThrow();
    });
  });

  describe('updateProfile', () => {
    it('met Ã  jour profil utilisateur', async () => {
      const updatedUser = { ...mockUser, first_name: 'Jane' };
      mockApiService.patch.mockResolvedValue({ data: updatedUser } as any);
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      const result = await authService.updateProfile({ first_name: 'Jane' });

      expect(mockApiService.patch).toHaveBeenCalledWith(
        expect.stringContaining('/profile/'),
        { first_name: 'Jane' }
      );
      expect(result).toEqual(updatedUser);
    });
  });

  describe('getFarmProfile', () => {
    it('rÃ©cupÃ¨re profil ferme', async () => {
      mockApiService.get.mockResolvedValue({ data: mockFarmProfile } as any);

      const result = await authService.getFarmProfile();

      expect(mockApiService.get).toHaveBeenCalledWith(
        expect.stringContaining('/farm/')
      );
      expect(result).toEqual(mockFarmProfile);
    });
  });

  describe('updateFarmProfile', () => {
    it('met Ã  jour profil ferme', async () => {
      const updatedFarm = { ...mockFarmProfile, farm_name: 'Nouvelle Ferme' };
      mockApiService.patch.mockResolvedValue({ data: updatedFarm } as any);

      const result = await authService.updateFarmProfile({
        farm_name: 'Nouvelle Ferme',
      });

      expect(mockApiService.patch).toHaveBeenCalledWith(
        expect.stringContaining('/farm/'),
        { farm_name: 'Nouvelle Ferme' }
      );
      expect(result).toEqual(updatedFarm);
    });
  });

  describe('isAuthenticated', () => {
    it('retourne true si token et user existent', async () => {
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce(JSON.stringify(mockUser));

      const result = await authService.isAuthenticated();

      expect(result).toBe(true);
    });

    it('retourne false si token manquant', async () => {
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify(mockUser));

      const result = await authService.isAuthenticated();

      expect(result).toBe(false);
    });

    it('retourne false si user manquant', async () => {
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce(null);

      const result = await authService.isAuthenticated();

      expect(result).toBe(false);
    });

    it('retourne false en cas erreur', async () => {
      mockSecureStore.getItemAsync.mockRejectedValue(new Error('Storage error'));

      const result = await authService.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('getCurrentUser', () => {
    it('retourne utilisateur depuis storage', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(mockUser));

      const result = await authService.getCurrentUser();

      expect(result).toEqual(mockUser);
    });

    it('retourne null si pas de donnÃ©es', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const result = await authService.getCurrentUser();

      expect(result).toBeNull();
    });

    it('retourne null en cas erreur parsing', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('invalid-json');

      const result = await authService.getCurrentUser();

      expect(result).toBeNull();
    });
  });
});







