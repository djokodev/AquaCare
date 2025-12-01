/**
 * Configuration automatique de l'environnement
 * Detecte si on est en DEV (Expo Dev Server) ou PRODUCTION (Build compile)
 *
 * WORKFLOW :
 * - DEV : Expo Go -> Backend local (auto IP derivee)
 * - PROD : build -> API en ligne (77.237.241.223)
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type Environment = 'development' | 'production';

interface EnvironmentConfig {
  apiUrl: string;
  environment: Environment;
  debug: boolean;
}

const DEFAULT_DEV_HOST = '172.20.10.2'; // fallback si host Expo non detecte

const getDevHost = () => {
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoGo?.developer?.hostname ||
    (Constants as any)?.expoGo?.developer?.hostname;

  if (hostUri) {
    const cleaned = hostUri.replace(/^exp:\/\//, '').replace(/^https?:\/\//, '');
    return cleaned.split(':')[0];
  }
  return DEFAULT_DEV_HOST;
};

const getApiUrl = (env: Environment) => {
  if (env === 'development') {
    const host = getDevHost();
    return `http://${host}:8000/api`;
  }
  return 'http://77.237.241.223/api';
};

export function getEnvironment(): Environment {
  if (__DEV__) return 'development';
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
  console.log('[Environment] Configuration:', {
    environment: config.environment,
    apiUrl: config.apiUrl,
    platform: Platform.OS,
    version: Constants.expoConfig?.version,
  });
}

export default config;
