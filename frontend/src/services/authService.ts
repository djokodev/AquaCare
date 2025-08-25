import * as SecureStore from 'expo-secure-store';

import { apiService } from './api';
import { API_ENDPOINTS, STORAGE_KEYS } from '@/constants/api';
import { 
  LoginRequest, 
  RegisterRequest, 
  AuthResponse, 
  User, 
  FarmProfile 
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
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Inscription utilisateur
   */
  async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      // Debug: Log des données envoyées
      console.log('🔍 DEBUG - Données d\'inscription envoyées:', userData);
      console.log('🔍 DEBUG - URL d\'inscription:', API_ENDPOINTS.AUTH.REGISTER);
      
      const response = await apiService.post<AuthResponse>(
        API_ENDPOINTS.AUTH.REGISTER, 
        userData
      );
      
      // Sauvegarder les tokens et données utilisateur
      await this.saveAuthData(response.data);
      
      return response.data;
    } catch (error: any) {
      console.error('❌ ERROR - Inscription échouée:', error.response?.data || error.message);
      throw this.handleAuthError(error);
    }
  }

  /**
   * Déconnexion
   */
  async logout(): Promise<void> {
    try {
      // Optionnel: Notifier le backend (blacklist du token)
      // await apiService.post(API_ENDPOINTS.AUTH.LOGOUT);
      
      // Supprimer les données locales
      await apiService.clearTokens();
    } catch (error) {
      // Even if backend call fails, clear local data
      await apiService.clearTokens();
      throw error;
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Vérifier si l'utilisateur est authentifié
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
      const user = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
      
      return !!(token && user);
    } catch (error) {
      return false;
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
  private handleAuthError(error: any): Error {
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 400:
          return new Error(data.message || 'Données invalides');
        case 401:
          return new Error('Identifiants incorrects');
        case 403:
          return new Error('Accès interdit');
        case 404:
          return new Error('Utilisateur non trouvé');
        case 500:
          return new Error('Erreur serveur. Veuillez réessayer.');
        default:
          return new Error(data.message || 'Une erreur est survenue');
      }
    } else if (error.request) {
      return new Error('Impossible de contacter le serveur. Vérifiez votre connexion internet.');
    } else {
      return new Error(error.message || 'Une erreur inattendue est survenue');
    }
  }
}

export const authService = new AuthService();