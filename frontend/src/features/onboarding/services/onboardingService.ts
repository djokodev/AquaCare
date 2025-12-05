/**
 * Service de gestion de la persistance de l'onboarding
 * Utilise AsyncStorage pour stocker le flag de complétion
 * @module features/onboarding/services
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Service singleton pour gérer l'état d'onboarding
 * Stocke un flag simple : 'true' si complété, null sinon
 */
class OnboardingService {
  /** Clé de stockage dans AsyncStorage */
  private static readonly STORAGE_KEY = '@mavecam_onboarding_completed';

  /**
   * Vérifie si l'utilisateur a complété l'onboarding
   * @returns {Promise<boolean>} true si complété, false sinon
   */
  static async hasCompleted(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(this.STORAGE_KEY);
      return value === 'true';
    } catch (error) {
      console.error('[OnboardingService] Erreur lecture hasCompleted:', error);
      // En cas d'erreur, on considère l'onboarding non complété
      return false;
    }
  }

  /**
   * Marque l'onboarding comme complété
   * Appelé après clic sur "Ignorer" ou "Commencer"
   * @returns {Promise<void>}
   */
  static async setCompleted(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, 'true');
    } catch (error) {
      console.error('[OnboardingService] Erreur écriture setCompleted:', error);
      throw error; // Remonter l'erreur pour gestion UI
    }
  }

  /**
   * Réinitialise l'onboarding (pour testing/debug uniquement)
   * À exposer via SettingsScreen en mode dev
   * @returns {Promise<void>}
   */
  static async reset(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('[OnboardingService] Erreur reset:', error);
      throw error;
    }
  }

  /**
   * Efface toutes les données du service
   * Utile pour cleanup complet
   * @returns {Promise<void>}
   */
  static async clearAll(): Promise<void> {
    return this.reset();
  }
}

export default OnboardingService;
