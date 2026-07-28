import axios, { AxiosInstance, AxiosError } from 'axios';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { API_CONFIG, STORAGE_KEYS } from '@/constants/api';
import logger from '@/utils/logger';
import i18n from '@/i18n/i18n';

// Event listener pour la dÃ©connexion automatique
type LogoutCallback = () => void;
let logoutCallback: LogoutCallback | null = null;

export const setLogoutCallback = (callback: LogoutCallback) => {
  logoutCallback = callback;
};

class ApiService {
  private api: AxiosInstance;
  private refreshPromise: Promise<string | null> | null = null;
  private sessionExpiredAlertShown = false;

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
          logger.warn('Erreur lors de la rÃ©cupÃ©ration du token:', error);
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // Si erreur 401 et pas dÃ©jÃ  en train de refresh
        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const access = await this.getRefreshedAccessToken();
            if (access) {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${access}`;
              return this.api(originalRequest);
            }
            await this.handleSessionExpired();
          } catch (refreshError) {
            await this.handleSessionExpired();
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private async getRefreshedAccessToken(): Promise<string | null> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAccessToken().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private async refreshAccessToken(): Promise<string | null> {
    const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) return null;

    const response = await this.refreshToken(refreshToken);
    const { access, refresh: newRefresh } = response.data;

    if (!access) return null;

    await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, access);
    if (newRefresh) {
      await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, newRefresh);
    }
    this.sessionExpiredAlertShown = false;

    return access;
  }

  private async handleSessionExpired() {
    if (this.sessionExpiredAlertShown) return;

    this.sessionExpiredAlertShown = true;
    if (logoutCallback) {
      const cb = logoutCallback;
      Alert.alert(
        i18n.t('sessionExpiredTitle'),
        i18n.t('sessionExpiredMessage'),
        [{
          text: 'OK',
          onPress: async () => {
            await this.clearTokens();
            cb();
            this.sessionExpiredAlertShown = false;
          },
        }]
      );
    } else {
      await this.clearTokens();
      this.sessionExpiredAlertShown = false;
    }
  }

  private async refreshToken(refreshToken: string) {
    // Endpoint Simple JWT retourne directement { access, refresh }
    // PAS { tokens: { access, refresh } } comme le login custom
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
      logger.warn('Erreur lors de la suppression des tokens:', error);
    }
  }

  // MÃ©thodes HTTP gÃ©nÃ©riques
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

