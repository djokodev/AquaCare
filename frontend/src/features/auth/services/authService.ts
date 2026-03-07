import * as SecureStore from 'expo-secure-store';

import { apiService } from '@/services/api';
import logger from '@/utils/logger';
import { API_ENDPOINTS, STORAGE_KEYS } from '@/constants/api';
import {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,
  FarmProfile,
} from '@/types/auth';

class AuthService {
  /**
   * Connexion utilisateur
   */
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await apiService.post<AuthResponse>(
        API_ENDPOINTS.AUTH.LOGIN,
        credentials
      );

      // Sauvegarder les tokens et données utilisateur
      await this.saveAuthData(response.data);

      return response.data;
    } catch (error: unknown) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Inscription utilisateur
   */
  async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      const response = await apiService.post<AuthResponse>(
        API_ENDPOINTS.AUTH.REGISTER,
        userData
      );

      // Sauvegarder les tokens et données utilisateur
      await this.saveAuthData(response.data);

      return response.data;
    } catch (error: unknown) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Suppression définitive du compte
   */
  async deleteAccount(): Promise<void> {
    await apiService.post(API_ENDPOINTS.AUTH.DELETE_ACCOUNT, { confirm: true });
    await apiService.clearTokens();
  }

  /**
   * Déconnexion sécurisée
   */
  async logout(): Promise<void> {
    try {
      // Récupérer le refresh token pour l'invalider côté serveur
      const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);

      if (refreshToken) {
        // Notifier le backend pour blacklist du token
        await apiService.post(API_ENDPOINTS.AUTH.LOGOUT, {
          refresh: refreshToken
        });
      }

      // Supprimer les données locales
      await apiService.clearTokens();
    } catch (error) {
      // Même en cas d'erreur API, on nettoie les données locales
      if (__DEV__) {
        logger.warn('[Auth] Logout API failed, local cleanup only:', error);
      }
      await apiService.clearTokens();
      // Ne pas propager l'erreur car la déconnexion locale est réussie
    }
  }

  /**
   * Récupérer le profil utilisateur
   */
  async getProfile(): Promise<User> {
    try {
      const response = await apiService.get<User>(API_ENDPOINTS.AUTH.PROFILE);

      // Mettre à jour les données utilisateur stockées
      await SecureStore.setItemAsync(
        STORAGE_KEYS.USER_DATA,
        JSON.stringify(response.data)
      );

      return response.data;
    } catch (error: unknown) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Mettre à jour le profil utilisateur
   */
  async updateProfile(profileData: Partial<User>): Promise<User> {
    try {
      const response = await apiService.patch<User>(
        API_ENDPOINTS.AUTH.PROFILE,
        profileData
      );

      // Mettre à jour les données utilisateur stockées
      await SecureStore.setItemAsync(
        STORAGE_KEYS.USER_DATA,
        JSON.stringify(response.data)
      );

      return response.data;
    } catch (error: unknown) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Récupérer le profil ferme
   */
  async getFarmProfile(): Promise<FarmProfile> {
    try {
      const response = await apiService.get<FarmProfile>(API_ENDPOINTS.AUTH.FARM_PROFILE);
      return response.data;
    } catch (error: unknown) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Mettre à jour le profil ferme
   */
  async updateFarmProfile(farmData: Partial<FarmProfile>): Promise<FarmProfile> {
    try {
      const response = await apiService.patch<FarmProfile>(
        API_ENDPOINTS.AUTH.FARM_PROFILE,
        farmData
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Check if the user is authenticated.
   * Decodes the JWT payload locally first to avoid a network call when the token is still valid.
   * Only hits the network when the access token is expired (tries refresh).
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
      if (!token) return false;

      // Local expiry check — avoids a network round-trip on every app startup
      if (!this._isTokenExpired(token)) return true;

      // Access token expired → attempt silent refresh
      const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) {
        await apiService.clearTokens();
        return false;
      }

      try {
        const refreshResponse = await apiService.post<{ access: string; refresh?: string }>(
          API_ENDPOINTS.AUTH.TOKEN_REFRESH,
          { refresh: refreshToken }
        );
        const { access, refresh: newRefresh } = refreshResponse.data;
        await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, access);
        if (newRefresh) {
          await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, newRefresh);
        }
        return true;
      } catch {
        await apiService.clearTokens();
        return false;
      }
    } catch (error) {
      logger.warn('[Auth] isAuthenticated error:', error);
      return false;
    }
  }

  /** Returns true if the JWT access token is expired or within a 30-second buffer. */
  private _isTokenExpired(token: string): boolean {
    try {
      const payloadB64 = token.split('.')[1];
      if (!payloadB64) return true;
      const payload = JSON.parse(atob(payloadB64));
      const nowSeconds = Math.floor(Date.now() / 1000);
      return payload.exp < nowSeconds + 30;
    } catch {
      return true;
    }
  }

  /**
   * Récupérer les données utilisateur depuis le storage
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const userData = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Sauvegarder les données d'authentification
   */
  private async saveAuthData(authData: AuthResponse): Promise<void> {
    try {
      await Promise.all([
        SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, authData.tokens.access),
        SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, authData.tokens.refresh),
        SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(authData.user)),
        SecureStore.setItemAsync(STORAGE_KEYS.LANGUAGE, authData.user.language_preference),
      ]);
    } catch (error) {
      throw new Error('Erreur lors de la sauvegarde des données d\'authentification');
    }
  }

  /**
   * Gestion des erreurs d'authentification
   */
  private handleAuthError(error: unknown): Error {
    // Duck-typing de la shape AxiosError sans importer axios directement
    const axiosErr = error as {
      response?: { status: number; data: Record<string, unknown> };
      request?: unknown;
      message?: string;
    };

    if (axiosErr.response) {
      const { status, data } = axiosErr.response;

      const HTTP_ERROR_CODES: Record<number, string> = {
        401: data?.detail as string || data?.message as string || 'AUTH_INVALID_CREDENTIALS',
        403: 'AUTH_FORBIDDEN',
        404: 'AUTH_NOT_FOUND',
        429: 'AUTH_RATE_LIMITED',
        500: 'AUTH_SERVER_ERROR',
      };

      if (status === 400 && data && typeof data === 'object') {
        // Field-level errors — messages come from the backend in the user's language
        for (const field of ['phone_number', 'email', 'password', 'non_field_errors', 'message'] as const) {
          const val = data[field];
          if (val) return new Error(Array.isArray(val) ? String(val[0]) : String(val));
        }
        const errorMessages = Object.values(data)
          .map((v) => (Array.isArray(v) ? String(v[0]) : String(v)))
          .join(' ');
        return new Error(errorMessages || JSON.stringify(data));
      }

      if (status in HTTP_ERROR_CODES) {
        return new Error(HTTP_ERROR_CODES[status]);
      }

      return new Error(data?.message as string || `HTTP_${status}`);
    }

    if (axiosErr.request) {
      return new Error('AUTH_NETWORK_ERROR');
    }

    return new Error(axiosErr.message || 'AUTH_UNKNOWN_ERROR');
  }
}

export const authService = new AuthService();
