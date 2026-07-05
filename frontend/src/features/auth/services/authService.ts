import * as SecureStore from 'expo-secure-store';

import { apiService } from '@/services/api';
import logger from '@/utils/logger';
import { API_ENDPOINTS, STORAGE_KEYS } from '@/constants/api';
import { sanitizeUserFacingErrorMessage } from '@/utils/errorParser';
import {
  AuthFieldErrors,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,
} from '@/features/auth/types/auth';

const AUTH_META_FIELDS = new Set(['code', 'status_code']);

const toFieldMessage = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) {
    const sanitized = sanitizeUserFacingErrorMessage(value);
    return sanitized === 'UNKNOWN_ERROR' ? null : sanitized;
  }
  if (Array.isArray(value) && value.length > 0) {
    const firstValue = value[0];
    if (typeof firstValue === 'string' && firstValue.trim()) {
      const sanitized = sanitizeUserFacingErrorMessage(firstValue);
      return sanitized === 'UNKNOWN_ERROR' ? null : sanitized;
    }
    return null;
  }
  return null;
};

export class AuthRequestError extends Error {
  fieldErrors: AuthFieldErrors;

  constructor(message: string, fieldErrors: AuthFieldErrors = {}) {
    super(message);
    this.name = 'AuthRequestError';
    this.fieldErrors = fieldErrors;
  }
}

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
      const responseMessage = typeof data?.detail === 'string' ? data.detail : typeof data?.message === 'string' ? data.message : '';
      const sanitizedResponseMessage = responseMessage ? sanitizeUserFacingErrorMessage(responseMessage) : 'UNKNOWN_ERROR';

      const HTTP_ERROR_CODES: Record<number, string> = {
        401: sanitizedResponseMessage !== 'UNKNOWN_ERROR' ? sanitizedResponseMessage : 'AUTH_INVALID_CREDENTIALS',
        403: 'AUTH_FORBIDDEN',
        404: 'AUTH_NOT_FOUND',
        429: 'AUTH_RATE_LIMITED',
        500: 'AUTH_SERVER_ERROR',
      };

      if (status === 400 && data && typeof data === 'object') {
        const fieldErrors: AuthFieldErrors = {};
        let generalMessage: string | null = null;

        for (const [field, value] of Object.entries(data)) {
          if (AUTH_META_FIELDS.has(field)) {
            continue;
          }

          const message = toFieldMessage(value);
          if (!message) {
            continue;
          }

          if (field === 'message') {
            generalMessage = message;
            continue;
          }

          if (field === 'non_field_errors') {
            generalMessage = generalMessage || message;
            continue;
          }

          fieldErrors[field] = message;
        }

        return new AuthRequestError(
          generalMessage || 'UNKNOWN_ERROR',
          fieldErrors
        );
      }

      if (status in HTTP_ERROR_CODES) {
        return new AuthRequestError(HTTP_ERROR_CODES[status]);
      }

      const fallbackMessage = typeof data?.message === 'string'
        ? sanitizeUserFacingErrorMessage(data.message)
        : `HTTP_${status}`;

      return new AuthRequestError(
        fallbackMessage === 'UNKNOWN_ERROR' ? `HTTP_${status}` : fallbackMessage
      );
    }

    if (axiosErr.request) {
      return new AuthRequestError('AUTH_NETWORK_ERROR');
    }

    const fallbackMessage = axiosErr.message ? sanitizeUserFacingErrorMessage(axiosErr.message) : 'AUTH_UNKNOWN_ERROR';
    return new AuthRequestError(fallbackMessage === 'UNKNOWN_ERROR' ? 'AUTH_UNKNOWN_ERROR' : fallbackMessage);
  }
}

export const authService = new AuthService();
