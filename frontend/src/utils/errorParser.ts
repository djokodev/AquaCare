/**
 * Utilitaire de parsing et formatage des erreurs API Django REST Framework.
 *
 * Parse les erreurs de validation 400 pour les rendre exploitables côté utilisateur
 * avec messages détaillés par champ et aide contextuelle.
 *
 * @module errorParser
 */

import logger from '@/utils/logger';

/**
 * Détails d'erreur pour un champ spécifique.
 */
export interface ApiErrorDetails {
  field: string;
  messages: string[];
}

/**
 * Erreur API parsée avec tous les détails.
 */
export interface ParsedApiError {
  status: number;
  message: string;
  code?: string;
  details: ApiErrorDetails[];
  rawError: unknown;
}

const META_FIELDS = new Set(['code', 'status_code']);

const toDisplayMessages = (value: unknown): string[] => {
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(toDisplayMessages);
  }
  if (value && typeof value === 'object') {
    const data = value as Record<string, unknown>;
    const directMessage = data.detail ?? data.message ?? data.error;
    if (directMessage) {
      return toDisplayMessages(directMessage);
    }
  }
  return [];
};

const getFirstApiMessage = (data: unknown): string | undefined => {
  if (typeof data === 'string' && data.trim()) {
    return data;
  }
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const responseData = data as Record<string, unknown>;
  for (const key of ['detail', 'message', 'error', 'non_field_errors']) {
    const messages = toDisplayMessages(responseData[key]);
    if (messages.length > 0) {
      return messages[0];
    }
  }

  for (const [field, value] of Object.entries(responseData)) {
    if (META_FIELDS.has(field)) {
      continue;
    }
    const messages = toDisplayMessages(value);
    if (messages.length > 0) {
      return `${getFieldLabel(field)} : ${messages[0]}`;
    }
  }

  return undefined;
};

/**
 * Parse les erreurs API Django REST Framework.
 *
 * Django retourne les erreurs 400 sous forme :
 * ```json
 * {
 *   "field_name": ["Error message 1", "Error message 2"],
 *   "another_field": ["Error message"]
 * }
 * ```
 *
 * @param error - Erreur Axios à parser
 * @returns Erreur parsée avec détails exploitables
 *
 * @example
 * ```typescript
 * try {
 *   await createCycle(data);
 * } catch (error) {
 *   const parsedError = parseApiError(error);
 *   console.log(parsedError.status); // 400
 *   console.log(parsedError.details); // [{field: 'initial_count', messages: [...]}]
 * }
 * ```
 */
export const parseApiError = (error: unknown): ParsedApiError => {
  // Cas 1 : Erreur réseau (pas de réponse du serveur)
  const candidate = error as ApiErrorLike;
  if (!candidate.response) {
    return {
      status: 0,
      message: 'Erreur de connexion au serveur. Vérifiez votre connexion internet.',
      code: candidate.code,
      details: [],
      rawError: error,
    };
  }

  const { status = 0, data } = candidate.response;
  const responseCode =
    data && typeof data === 'object' && typeof (data as Record<string, unknown>).code === 'string'
      ? String((data as Record<string, unknown>).code)
      : undefined;

  // Cas 2 : Erreur 400 avec détails de validation
  if (status === 400 && data && typeof data === 'object') {
    const details: ApiErrorDetails[] = [];

    Object.entries(data).forEach(([field, fieldErrors]) => {
      if (META_FIELDS.has(field)) {
        return;
      }
      const messages = toDisplayMessages(fieldErrors);
      if (messages.length > 0) {
        details.push({
          field,
          messages,
        });
      }
    });

    return {
      status,
      message: details.length > 0
        ? 'Erreur de validation des données'
        : getFirstApiMessage(data) ?? 'Erreur de validation des données',
      code: responseCode ?? candidate.code,
      details,
      rawError: data,
    };
  }

  // Cas 3 : Erreur 401 (non authentifié)
  if (status === 401) {
    return {
      status,
      message: 'Session expirée, veuillez vous reconnecter',
      code: responseCode ?? candidate.code,
      details: [],
      rawError: data,
    };
  }

  // Cas 4 : Erreur 403 (non autorisé)
  if (status === 403) {
    return {
      status,
      message: "Vous n'avez pas les permissions nécessaires pour cette action",
      code: responseCode ?? candidate.code,
      details: [],
      rawError: data,
    };
  }

  // Cas 5 : Erreur 404
  if (status === 404) {
    return {
      status,
      message: 'Ressource non trouvée',
      code: responseCode ?? candidate.code,
      details: [],
      rawError: data,
    };
  }

  // Cas 5 bis : Conflit métier ou synchronisation
  if (status === 409) {
    return {
      status,
      message: getFirstApiMessage(data) ?? 'Conflit de synchronisation, veuillez réessayer',
      code: responseCode ?? candidate.code,
      details: [],
      rawError: data,
    };
  }

  // Cas 6 : Erreur 500+ (erreur serveur)
  if (status >= 500) {
    return {
      status,
      message: 'Erreur serveur, veuillez réessayer plus tard',
      code: responseCode ?? candidate.code,
      details: [],
      rawError: data,
    };
  }

  // Cas par défaut
  return {
    status,
    message: getFirstApiMessage(data) ?? candidate.message ?? 'Une erreur est survenue',
    code: responseCode ?? candidate.code,
    details: [],
    rawError: data,
  };
};

/**
 * Formate une erreur parsée pour affichage utilisateur.
 *
 * Transforme les détails techniques en message lisible avec :
 * - Labels français pour les champs
 * - Messages d'erreur clairs
 * - Formatage multi-lignes si plusieurs champs
 *
 * @param parsedError - Erreur parsée
 * @returns Message formaté pour Alert.alert() ou console
 *
 * @example
 * ```typescript
 * const parsedError = parseApiError(error);
 * const message = formatErrorForDisplay(parsedError);
 * Alert.alert('Erreur', message);
 * ```
 */
export const formatErrorForDisplay = (parsedError: ParsedApiError): string => {
  if (parsedError.details.length === 0) {
    return parsedError.message;
  }

  const errorLines = parsedError.details.map((detail) => {
    const fieldLabel = getFieldLabel(detail.field);
    return `• ${fieldLabel} : ${detail.messages.join(', ')}`;
  });

  return `${parsedError.message}\n\n${errorLines.join('\n')}`;
};

/**
 * Mapping des noms de champs techniques (snake_case) vers labels utilisateur (français).
 *
 * Utilisé pour traduire les champs d'erreur Django en texte compréhensible.
 */
const getFieldLabel = (field: string): string => {
  const fieldLabels: Record<string, string> = {
    // Cycle de production
    cycle_name: 'Nom du cycle',
    species: 'Espèce',
    pond_identifier: 'Zone de production',
    pond_surface_m2: 'Surface totale (m²)',
    pond_volume_m3: 'Volume total (m³)',
    start_date: 'Date de début',
    end_date: 'Date de fin',
    initial_count: 'Nombre initial de poissons',
    initial_average_weight: 'Poids moyen initial (g)',
    target_weight: 'Poids cible (g)',
    status: 'Statut',

    // Log quotidien
    log_date: 'Date du log',
    mortality_count: 'Nombre de morts',
    water_temperature: 'Température eau (°C)',
    ph_level: 'Niveau pH',
    dissolved_oxygen: 'Oxygène dissous (mg/L)',
    feed_amount_kg: 'Quantité aliment (kg)',
    notes: 'Notes',

    // Journal sanitaire
    event_type: 'Type d\'événement',
    event_date: 'Date événement',
    affected_count: 'Nombre affecté',
    symptoms: 'Symptômes',
    treatment: 'Traitement',
    diagnosis: 'Diagnostic',
    veterinarian: 'Vétérinaire',
    photo: 'Photo',
    location: 'Localisation',

    // Action de récolte
    harvest_date: 'Date de récolte',
    harvested_count: 'Nombre récolté',
    total_weight_kg: 'Poids total (kg)',
    average_weight_g: 'Poids moyen (g)',
    selling_price_per_kg: 'Prix vente/kg',
    total_revenue: 'Revenu total',
    buyer_name: 'Nom acheteur',
    buyer_contact: 'Contact acheteur',

    // Commandes (commerce)
    delivery_address: 'Adresse livraison',
    delivery_city: 'Ville livraison',
    delivery_phone: 'Téléphone livraison',
    payment_method: 'Méthode paiement',
    items: 'Articles',
    quantity: 'Quantité',

    // Erreurs génériques
    non_field_errors: 'Erreur générale',
    detail: 'Détail',
  };

  return fieldLabels[field] || field.replace(/_/g, ' ');
};

/**
 * Log détaillé de l'erreur pour debugging (dev uniquement).
 *
 * Affiche dans la console :
 * - Code status HTTP
 * - Message principal
 * - Détails de validation par champ
 * - Erreur brute complète
 *
 * **Note** : Ne log que si `__DEV__` est true (environnement développement).
 *
 * @param error - Erreur Axios originale
 * @param context - Contexte de l'erreur (ex: "Création cycle")
 *
 * @example
 * ```typescript
 * try {
 *   await createCycle(data);
 * } catch (error) {
 *   logApiError(error, 'Création cycle de production');
 *   // En dev, affiche :
 *   // 🔴 API Error - Création cycle de production
 *   //   Status: 400
 *   //   Message: Erreur de validation
 *   //   Validation Errors:
 *   //     - initial_count: ["Densité initiale trop élevée"]
 * }
 * ```
 */
export const logApiError = (error: unknown, context: string): void => {
  if (__DEV__) {
    const parsedError = parseApiError(error);
    logger.log(`API Error: ${context}`);
    logger.log('Status:', parsedError.status);
    logger.log('Message:', parsedError.message);
    if (parsedError.details.length > 0) {
      logger.log('Validation Errors:');
      parsedError.details.forEach((detail) => {
        logger.log(`  - ${detail.field}:`, detail.messages);
      });
    }
    logger.log('Raw Error:', parsedError.rawError);
  }
};

/**
 * Interface commune pour les erreurs Axios-like dans les composants.
 */
export interface ApiErrorLike {
  code?: string;
  message?: string;
  response?: {
    status?: number;
    data?: Record<string, unknown> | string;
  };
}

/**
 * Détecte si une erreur est une erreur réseau (pas de réponse du serveur).
 * Centralisé ici pour éviter duplication dans chaque écran.
 */
export const isNetworkError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as ApiErrorLike;
  const message = candidate.message?.toLowerCase() ?? '';
  return (
    candidate.code === 'NETWORK_ERROR' ||
    candidate.code === 'ECONNABORTED' ||
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('timeout')
  );
};

/**
 * Extrait un message d'erreur lisible depuis une erreur API.
 * Centralisé ici pour éviter duplication dans chaque écran.
 *
 * @param error - Erreur attrapée
 * @param fallback - Message par défaut si aucun message trouvé
 */
export const getApiErrorMessage = (error: unknown, fallback = 'Une erreur est survenue'): string => {
  if (typeof error === 'string' && error.trim()) return error;
  if (!error || typeof error !== 'object') return fallback;
  const candidate = error as ApiErrorLike;
  if (!candidate.response && candidate.message && !isNetworkError(error)) {
    return candidate.message;
  }

  const parsedError = parseApiError(error);

  if (parsedError.details.length > 0) {
    return formatErrorForDisplay(parsedError);
  }

  if (parsedError.message) {
    return parsedError.message;
  }

  if (candidate.message) return candidate.message;
  return fallback;
};

/**
 * Vérifie si une erreur parsée contient un champ d'erreur spécifique.
 *
 * Utile pour afficher des aides contextuelles basées sur le champ en erreur.
 *
 * @param parsedError - Erreur parsée
 * @param fieldName - Nom du champ à chercher
 * @returns true si le champ a une erreur, false sinon
 *
 * @example
 * ```typescript
 * if (hasFieldError(parsedError, 'initial_count')) {
 *   // Afficher aide sur densité maximale
 * }
 * ```
 */
export const hasFieldError = (
  parsedError: ParsedApiError,
  fieldName: string
): boolean => {
  return parsedError.details.some((detail) => detail.field === fieldName);
};

/**
 * Extrait le premier message d'erreur pour un champ spécifique.
 *
 * @param parsedError - Erreur parsée
 * @param fieldName - Nom du champ
 * @returns Premier message d'erreur ou undefined
 *
 * @example
 * ```typescript
 * const error = getFieldErrorMessage(parsedError, 'initial_count');
 * console.log(error); // "Densité initiale trop élevée (max 500 poissons/m²)"
 * ```
 */
export const getFieldErrorMessage = (
  parsedError: ParsedApiError,
  fieldName: string
): string | undefined => {
  const fieldDetail = parsedError.details.find((d) => d.field === fieldName);
  return fieldDetail?.messages[0];
};
