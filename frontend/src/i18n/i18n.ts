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

// Initialize i18n immediately with default configuration
i18n.use(initReactI18next).init({
  resources,
  lng: 'fr', // Default to French initially
  fallbackLng: 'fr',
  compatibilityJSON: 'v3', // Fix for Intl.PluralRules compatibility
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false, // Disable suspense for better performance
  },
});

// Load saved language asynchronously after initialization
const loadSavedLanguage = async () => {
  try {
    // Try to get saved language preference
    const storedLang = await SecureStore.getItemAsync(STORAGE_KEYS.LANGUAGE);
    if (storedLang && ['en', 'fr'].includes(storedLang)) {
      await i18n.changeLanguage(storedLang);
      return;
    }

    // Fallback to device language if supported
    const locales = Localization.getLocales();
    const deviceLanguage = locales[0]?.languageCode || 'fr';
    
    if (['en', 'fr'].includes(deviceLanguage) && deviceLanguage !== 'fr') {
      await i18n.changeLanguage(deviceLanguage);
      // Save device language to SecureStore for next time
      await SecureStore.setItemAsync(STORAGE_KEYS.LANGUAGE, deviceLanguage);
    }
  } catch (error) {
    console.warn('âš ï¸ Erreur lors du chargement de la langue, utilisation du franÃ§ais par dÃ©faut:', error);
  }
};

// Load saved language after a short delay to ensure SecureStore is ready
setTimeout(loadSavedLanguage, 100);

export default i18n;



