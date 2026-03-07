import environmentConfig from '@/config/environment';

/**
 * Configuration API avec dÃ©tection automatique d'environnement
 *
 * DÃ‰VELOPPEMENT (npm start) :
 *   â†’ Backend Docker local (172.20.10.2:8000)
 *
 * PRODUCTION (eas build) :
 *   â†’ API en ligne (77.237.241.223)
 *
 * Pas besoin de toucher au fichier .env !
 */
export const API_CONFIG = {
  baseURL: environmentConfig.apiUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
};

// Endpoints basÃ©s sur votre API Django
export const API_ENDPOINTS = {
  // Authentication (accounts module)
  AUTH: {
    REGISTER: '/accounts/register/',
    LOGIN: '/accounts/login/',
    LOGOUT: '/accounts/logout/',
    PROFILE: '/accounts/profile/',
    FARM_PROFILE: '/accounts/farm/',
    TOKEN_REFRESH: '/accounts/token/refresh/',
    TOKEN_VERIFY: '/accounts/token/verify/',
    DELETE_ACCOUNT: '/accounts/delete/',
  },
  
  // Aquaculture module (pour plus tard)
  AQUACULTURE: {
    CYCLES: '/aquaculture/cycles/',
    LOGS: '/aquaculture/cycle-logs/', 
    FEEDING_PLANS: '/aquaculture/feeding-plans/',
    SANITARY_LOGS: '/aquaculture/sanitary-logs/',
    DASHBOARD: '/aquaculture/dashboard/',
    SYNC: '/aquaculture/sync/',
  },
};

// Storage keys for SecureStore (alphanumeric, ".", "-", "_" only)
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'aquacare_access_token',
  REFRESH_TOKEN: 'aquacare_refresh_token',
  USER_DATA: 'aquacare_user_data',
  LANGUAGE: 'aquacare_language',
  PUSH_DEVICE_ID: 'aquacare_push_device_id',
};


