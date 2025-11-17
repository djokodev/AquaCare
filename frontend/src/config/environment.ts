/**
 * Configuration automatique de l'environnement
 * Détecte si on est en DEV (Expo Dev Server) ou PRODUCTION (Build compilé)
 *
 * WORKFLOW :
 * - DEV : npm start → Backend Docker local (172.20.10.2:8000)
 * - PROD : eas build → API en ligne (77.237.241.223)
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Types d'environnement
 */
export type Environment = 'development' | 'production';

/**
 * Configuration par environnement
 */
interface EnvironmentConfig {
  apiUrl: string;
  environment: Environment;
  debug: boolean;
}

/**
 * URLs API selon environnement
 */
const API_URLS = {
  // Backend Docker local (développement)
  development: 'http://172.20.10.2:8000/api',

  // API en ligne (production)
  production: 'http://77.237.241.223/api',
};

/**
 * Détecte automatiquement l'environnement
 *
 * LOGIQUE :
 * - __DEV__ = true → Mode développement (Expo Dev Server)
 * - __DEV__ = false → Mode production (Build APK/IPA)
 */
export function getEnvironment(): Environment {
  // Constants.manifest2 existe uniquement en dev avec Expo Go
  const isExpoGo = Constants.appOwnership === 'expo';

  // __DEV__ est une variable React Native globale
  if (__DEV__) {
    return 'development';
  }

  return 'production';
}

/**
 * Retourne la configuration selon l'environnement actuel
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const environment = getEnvironment();

  return {
    apiUrl: API_URLS[environment],
    environment,
    debug: environment === 'development',
  };
}

/**
 * Configuration globale (export par défaut)
 */
const config = getEnvironmentConfig();

// Log au démarrage pour debug
if (config.debug) {
  console.log('🔧 [Environment] Configuration détectée:', {
    environment: config.environment,
    apiUrl: config.apiUrl,
    platform: Platform.OS,
    version: Constants.expoConfig?.version,
  });
}

export default config;
