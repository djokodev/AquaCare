/**
 * Configuration automatique de l'environnement
 *
 * ENVIRONNEMENTS :
 * - development : Expo Go local → backend local (IP auto-détectée)
 * - staging     : EAS build interne → api-staging.aquacare.tech
 * - production  : EAS build store  → api.aquacare.tech
 *
 * DÉTECTION :
 * - __DEV__ === true                         → development (Expo Go)
 * - EXPO_PUBLIC_APP_ENV === 'staging'        → staging (EAS internal build)
 * - sinon                                    → production (EAS store build)
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import logger from '@/utils/logger';

export type Environment = 'development' | 'staging' | 'production';

interface EnvironmentConfig {
  apiUrl: string;
  environment: Environment;
  debug: boolean;
}

const DEFAULT_DEV_HOST = '172.20.10.2'; // fallback si host Expo non détecté (à personnaliser)

const getDevHost = () => {
  // Surcharge optionnelle via extra ou variable Expo
  const overrideHost =
    (Constants.expoConfig as any)?.extra?.devHost ||
    process.env.EXPO_PUBLIC_DEV_HOST;
  if (overrideHost) {
    return String(overrideHost);
  }

  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoGo?.developer?.hostname ||
    (Constants as any)?.expoGo?.developer?.hostname;

  if (hostUri) {
    const cleaned = hostUri.replace(/^exp:\/\//, '').replace(/^https?:\/\//, '');
    return cleaned.split(':')[0];
  }

  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }

  return DEFAULT_DEV_HOST;
};

const API_BASE: Record<Environment, string> = {
  development: '', // calculé dynamiquement (IP Expo)
  staging: 'https://api-staging.aquacare.tech/api',
  production: 'https://api.aquacare.tech/api',
};

const getApiUrl = (env: Environment): string => {
  if (env === 'development') {
    return `http://${getDevHost()}:8000/api`;
  }
  return API_BASE[env];
};

export function getEnvironment(): Environment {
  if (__DEV__) return 'development';
  if (process.env.EXPO_PUBLIC_APP_ENV === 'staging') return 'staging';
  return 'production';
}

export function getEnvironmentConfig(): EnvironmentConfig {
  const environment = getEnvironment();

  return {
    apiUrl: getApiUrl(environment),
    environment,
    debug: environment === 'development',
  };
}

const config = getEnvironmentConfig();

if (config.debug) {
  logger.log('[Environment] Configuration:', {
    environment: config.environment,
    apiUrl: config.apiUrl,
    platform: Platform.OS,
    version: Constants.expoConfig?.version,
  });
}

export default config;
