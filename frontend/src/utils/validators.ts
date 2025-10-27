/**
 * Utilitaires de validation UX pour le frontend.
 *
 * IMPORTANT: Ces validations sont UNIQUEMENT pour le feedback utilisateur immédiat.
 * La validation métier RÉELLE est faite par le backend Django.
 * Ces fonctions permettent d'améliorer l'UX en évitant des appels API inutiles.
 */

/**
 * Valide qu'un numéro de téléphone camerounais est bien formaté.
 * Format attendu: +237 6XX XXX XXX ou 6XX XXX XXX
 *
 * @param phone - Numéro de téléphone
 * @returns true si le format est valide
 */
export const isValidCameroonPhone = (phone: string): boolean => {
  if (!phone) return false;

  // Nettoyage des espaces
  const cleaned = phone.replace(/\s/g, '');

  // Format: +2376XXXXXXXX ou 6XXXXXXXX
  const regex = /^(\+237)?6[0-9]{8}$/;
  return regex.test(cleaned);
};

/**
 * Valide qu'une adresse email est bien formatée.
 *
 * @param email - Adresse email
 * @returns true si le format est valide
 */
export const isValidEmail = (email: string): boolean => {
  if (!email) return false;

  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

/**
 * Valide qu'un nombre est dans une plage donnée.
 *
 * @param value - Valeur à valider
 * @param min - Valeur minimale (inclusive)
 * @param max - Valeur maximale (inclusive)
 * @returns true si la valeur est dans la plage
 */
export const isInRange = (
  value: number | string | null | undefined,
  min: number,
  max: number
): boolean => {
  const numValue = typeof value === 'number' ? value : parseFloat(value as string);

  if (isNaN(numValue) || numValue === null || numValue === undefined) {
    return false;
  }

  return numValue >= min && numValue <= max;
};

/**
 * Valide qu'un nombre est positif (> 0).
 *
 * @param value - Valeur à valider
 * @returns true si la valeur est strictement positive
 */
export const isPositive = (value: number | string | null | undefined): boolean => {
  const numValue = typeof value === 'number' ? value : parseFloat(value as string);

  if (isNaN(numValue) || numValue === null || numValue === undefined) {
    return false;
  }

  return numValue > 0;
};

/**
 * Valide qu'une chaîne n'est pas vide.
 *
 * @param value - Chaîne à valider
 * @returns true si la chaîne contient du texte
 */
export const isNotEmpty = (value: string | null | undefined): boolean => {
  return !!value && value.trim().length > 0;
};

/**
 * Valide qu'une date est dans le futur.
 *
 * @param dateString - Date ISO 8601
 * @returns true si la date est future
 */
export const isFutureDate = (dateString: string | null | undefined): boolean => {
  if (!dateString) return false;

  try {
    const date = new Date(dateString);
    const now = new Date();
    return date > now;
  } catch (error) {
    return false;
  }
};

/**
 * Valide qu'une date est dans le passé.
 *
 * @param dateString - Date ISO 8601
 * @returns true si la date est passée
 */
export const isPastDate = (dateString: string | null | undefined): boolean => {
  if (!dateString) return false;

  try {
    const date = new Date(dateString);
    const now = new Date();
    return date < now;
  } catch (error) {
    return false;
  }
};

/**
 * Valide les paramètres de qualité de l'eau (ranges aquaculture).
 *
 * @param temperature - Température en °C
 * @returns true si la température est dans une plage raisonnable (15-35°C)
 */
export const isValidTemperature = (temperature: number | null | undefined): boolean => {
  return isInRange(temperature, 15, 35);
};

/**
 * Valide le pH de l'eau.
 *
 * @param ph - Niveau de pH
 * @returns true si le pH est dans une plage raisonnable (4-10)
 */
export const isValidPH = (ph: number | null | undefined): boolean => {
  return isInRange(ph, 4, 10);
};

/**
 * Valide l'oxygène dissous.
 *
 * @param oxygen - Oxygène en mg/L
 * @returns true si l'oxygène est dans une plage raisonnable (0-20 mg/L)
 */
export const isValidOxygen = (oxygen: number | null | undefined): boolean => {
  return isInRange(oxygen, 0, 20);
};

/**
 * Valide un poids de poisson.
 *
 * @param weight - Poids en grammes
 * @returns true si le poids est raisonnable (0.1g - 5000g)
 */
export const isValidFishWeight = (weight: number | null | undefined): boolean => {
  return isInRange(weight, 0.1, 5000);
};

/**
 * Valide un nombre de poissons.
 *
 * @param count - Nombre de poissons
 * @returns true si le nombre est raisonnable (1 - 1000000)
 */
export const isValidFishCount = (count: number | null | undefined): boolean => {
  return isInRange(count, 1, 1000000);
};
