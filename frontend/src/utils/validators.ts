/**
 * Utilitaires de validation UX pour le frontend.
 *
 * IMPORTANT: Ces validations sont UNIQUEMENT pour le feedback utilisateur immÃ©diat.
 * La validation mÃ©tier RÃ‰ELLE est faite par le backend Django.
 * Ces fonctions permettent d'amÃ©liorer l'UX en Ã©vitant des appels API inutiles.
 */

/**
 * Valide qu'un numÃ©ro de tÃ©lÃ©phone camerounais est bien formatÃ©.
 * Format attendu: +237 6XX XXX XXX ou 6XX XXX XXX
 *
 * @param phone - NumÃ©ro de tÃ©lÃ©phone
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
 * Valide qu'une adresse email est bien formatÃ©e.
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
 * Valide qu'un nombre est dans une plage donnÃ©e.
 *
 * @param value - Valeur Ã  valider
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
 * @param value - Valeur Ã  valider
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
 * Valide qu'une chaÃ®ne n'est pas vide.
 *
 * @param value - ChaÃ®ne Ã  valider
 * @returns true si la chaÃ®ne contient du texte
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
 * Valide qu'une date est dans le passÃ©.
 *
 * @param dateString - Date ISO 8601
 * @returns true si la date est passÃ©e
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
 * Valide les paramÃ¨tres de qualitÃ© de l'eau (ranges aquaculture).
 *
 * @param temperature - TempÃ©rature en Â°C
 * @returns true si la tempÃ©rature est dans une plage raisonnable (15-35Â°C)
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
 * Valide l'oxygÃ¨ne dissous.
 *
 * @param oxygen - OxygÃ¨ne en mg/L
 * @returns true si l'oxygÃ¨ne est dans une plage raisonnable (0-20 mg/L)
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




