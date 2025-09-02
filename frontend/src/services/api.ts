import axios, { AxiosInstance, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';

import { API_CONFIG, STORAGE_KEYS } from '@/constants/api';

// Event listener pour la déconnexion automatique
type LogoutCallback = () => void;
let logoutCallback: LogoutCallback | null = null;

export const setLogoutCallback = (callback: LogoutCallback) => {
  logoutCallback = callback;
};

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_CONFIG.baseURL,
      timeout: API_CONFIG.timeout,
      headers: API_CONFIG.headers,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.api.interceptors.request.use(
      async (config) => {
        try {
          const token = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        } catch (error) {
          console.warn('Erreur lors de la récupération du token:', error);
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // Si erreur 401 et pas déjà en train de refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
            if (refreshToken) {
              // Tenter de refresh le token
              const response = await this.refreshToken(refreshToken);
              const { access } = response.data.tokens;
              
              // Sauvegarder le nouveau token
              await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, access);
              
              // Retry la requête originale
              originalRequest.headers.Authorization = `Bearer ${access}`;
              return this.api(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed - déconnexion automatique
            await this.clearTokens();
            
            // Notifier l'app pour déconnexion automatique
            if (logoutCallback) {
              logoutCallback();
            }
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private async refreshToken(refreshToken: string) {
    return axios.post(`${API_CONFIG.baseURL}/accounts/token/refresh/`, {
      refresh: refreshToken,
    });
  }

  async clearTokens() {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
    } catch (error) {
      console.warn('Erreur lors de la suppression des tokens:', error);
    }
  }

  // Méthodes HTTP génériques
  get<T>(url: string, config?: any) {
    return this.api.get<T>(url, config);
  }

  post<T>(url: string, data?: any, config?: any) {
    return this.api.post<T>(url, data, config);
  }

  put<T>(url: string, data?: any, config?: any) {
    return this.api.put<T>(url, data, config);
  }

  patch<T>(url: string, data?: any, config?: any) {
    return this.api.patch<T>(url, data, config);
  }

  delete<T>(url: string, config?: any) {
    return this.api.delete<T>(url, config);
  }
}

export const apiService = new ApiService();