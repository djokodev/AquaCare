import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';

import { STORAGE_KEYS } from '@/constants/api';
import { fr } from './locales/fr';
import { en } from './locales/en';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
};

const initI18n = async () => {
  let savedLanguage = 'fr'; // Default to French
  
  try {
    // Try to get saved language preference
    const storedLang = await SecureStore.getItemAsync(STORAGE_KEYS.LANGUAGE);
    if (storedLang && ['en', 'fr'].includes(storedLang)) {
      savedLanguage = storedLang;
    } else {
      // Fallback to device language if supported
      const deviceLanguage = Localization.locale.slice(0, 2);
      if (['en', 'fr'].includes(deviceLanguage)) {
        savedLanguage = deviceLanguage;
      }
    }
  } catch (error) {
    console.warn('Error loading saved language, using default (fr):', error);
    savedLanguage = 'fr'; // Ensure we have a valid language
  }

  i18n.use(initReactI18next).init({
    resources,
    lng: savedLanguage,
    fallbackLng: 'fr',
    compatibilityJSON: 'v3', // Fix for Intl.PluralRules compatibility
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false, // Disable suspense for better performance
    },
  });
};

// Initialize i18n
initI18n();

export default i18n;