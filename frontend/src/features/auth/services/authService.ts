import * as SecureStore from 'expo-secure-store';

import { apiService } from '@/services/api';
import { API_ENDPOINTS, API_CONFIG, STORAGE_KEYS } from '@/constants/api';
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
      
      // Sauvegarder les tokens et donnÃ©es utilisateur
      await this.saveAuthData(response.data);
      
      return response.data;
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Inscription utilisateur
   */
  async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      // Debug: Log des donnÃ©es envoyÃ©es
      console.log('DEBUG - DonnÃ©es d\'inscription envoyÃ©es:', userData);
      console.log('DEBUG - URL d\'inscription:', API_ENDPOINTS.AUTH.REGISTER);
      console.log('DEBUG - Base URL:', API_CONFIG.baseURL);
      
      const response = await apiService.post<AuthResponse>(
        API_ENDPOINTS.AUTH.REGISTER, 
        userData
      );
      
      // Sauvegarder les tokens et donnÃ©es utilisateur
      await this.saveAuthData(response.data);
      
      return response.data;
    } catch (error: any) {
      console.error('ERROR - Inscription Ã©chouÃ©e:', error.response?.data || error.message);
      throw this.handleAuthError(error);
    }
  }

  /**
   * DÃ©connexion sÃ©curisÃ©e
   */
  async logout(): Promise<void> {
    try {
      // RÃ©cupÃ©rer le refresh token pour l'invalider cÃ´tÃ© serveur
      const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
      
      if (refreshToken) {
        // Notifier le backend pour blacklist du token
        await apiService.post(API_ENDPOINTS.AUTH.LOGOUT, { 
          refresh: refreshToken 
        });
      }
      
      // Supprimer les donnÃ©es locales
      await apiService.clearTokens();
    } catch (error) {
      // MÃªme en cas d'erreur API, on nettoie les donnÃ©es locales
      console.warn('Logout API failed, proceeding with local cleanup:', error);
      await apiService.clearTokens();
      // Ne pas propager l'erreur car la dÃ©connexion locale est rÃ©ussie
    }
  }

  /**
   * RÃ©cupÃ©rer le profil utilisateur
   */
  async getProfile(): Promise<User> {
    try {
      const response = await apiService.get<User>(API_ENDPOINTS.AUTH.PROFILE);
      
      // Mettre Ã  jour les donnÃ©es utilisateur stockÃ©es
      await SecureStore.setItemAsync(
        STORAGE_KEYS.USER_DATA, 
        JSON.stringify(response.data)
      );
      
      return response.data;
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Mettre Ã  jour le profil utilisateur
   */
  async updateProfile(profileData: Partial<User>): Promise<User> {
    try {
      const response = await apiService.patch<User>(
        API_ENDPOINTS.AUTH.PROFILE, 
        profileData
      );
      
      // Mettre Ã  jour les donnÃ©es utilisateur stockÃ©es
      await SecureStore.setItemAsync(
        STORAGE_KEYS.USER_DATA, 
        JSON.stringify(response.data)
      );
      
      return response.data;
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * RÃ©cupÃ©rer le profil ferme
   */
  async getFarmProfile(): Promise<FarmProfile> {
    try {
      const response = await apiService.get<FarmProfile>(API_ENDPOINTS.AUTH.FARM_PROFILE);
      return response.data;
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Mettre Ã  jour le profil ferme
   */
  async updateFarmProfile(farmData: Partial<FarmProfile>): Promise<FarmProfile> {
    try {
      const response = await apiService.patch<FarmProfile>(
        API_ENDPOINTS.AUTH.FARM_PROFILE, 
        farmData
      );
      return response.data;
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * VÃ©rifier si l'utilisateur est authentifiÃ©
   * IMPORTANT : Valide le token cÃ´tÃ© backend pour Ã©viter les tokens invalides/expirÃ©s
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
      if (!token) {
        return false;
      }

      // âœ… VALIDATION CÃ”TÃ‰ BACKEND : VÃ©rifier que le token est valide
      try {
        await apiService.post(API_ENDPOINTS.AUTH.TOKEN_VERIFY, { token });
        return true;
      } catch (verifyError: any) {
        // Token invalide/expirÃ© â†’ Tenter refresh
        const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
        if (!refreshToken) {
          // Pas de refresh token â†’ DÃ©connexion
          await apiService.clearTokens();
          return false;
        }

        try {
          // Tenter de refresh le token
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
        } catch (refreshError) {
          // Refresh Ã©chouÃ© â†’ DÃ©connexion
          await apiService.clearTokens();
          return false;
        }
      }
    } catch (error) {
      console.warn('[Auth] Erreur vÃ©rification authentification:', error);
      return false;
    }
  }

  /**
   * RÃ©cupÃ©rer les donnÃ©es utilisateur depuis le storage
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
   * Sauvegarder les donnÃ©es d'authentification
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
      throw new Error('Erreur lors de la sauvegarde des donnÃ©es d\'authentification');
    }
  }

  /**
   * Gestion des erreurs d'authentification
   */
  private handleAuthError(error: any): Error {
    // Log dÃ©taillÃ© pour le dÃ©veloppement
    console.error('AUTH ERROR DETAILS:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      stack: error.stack
    });

    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 400:
          // Traiter les erreurs de validation spÃ©cifiques
          if (data && typeof data === 'object') {
            // Si c'est un objet avec des erreurs de champs
            if (data.phone_number) {
              return new Error(`NumÃ©ro de tÃ©lÃ©phone : ${data.phone_number[0]}`);
            }
            if (data.email) {
              return new Error(`Email : ${data.email[0]}`);
            }
            if (data.password) {
              return new Error(`Mot de passe : ${data.password[0]}`);
            }
            if (data.non_field_errors) {
              return new Error(data.non_field_errors[0]);
            }
            // Si on a un message direct
            if (data.message) {
              return new Error(data.message);
            }
            // Sinon combiner tous les messages d'erreur
            const errorMessages = Object.entries(data)
              .map(([field, messages]: [string, any]) => {
                if (Array.isArray(messages)) {
                  return `${field}: ${messages[0]}`;
                }
                return `${field}: ${messages}`;
              })
              .join(', ');
            return new Error(errorMessages || 'DonnÃ©es invalides');
          }
          return new Error(data?.message || 'DonnÃ©es invalides');
          
        case 401:
          return new Error('Identifiants incorrects ou session expirÃ©e');
        case 403:
          return new Error('AccÃ¨s interdit');
        case 404:
          return new Error('Utilisateur non trouvÃ©');
        case 500:
          return new Error('Erreur serveur. Veuillez rÃ©essayer plus tard.');
        default:
          return new Error(data?.message || `Erreur ${status}: Une erreur est survenue`);
      }
    } else if (error.request) {
      return new Error('Impossible de contacter le serveur. Vérifiez votre connexion internet.');
    } else {
      return new Error(error.message || 'Une erreur inattendue est survenue');
    }
  }
}

export const authService = new AuthService();



