/**
 * Utilitaires de formatage pour l'affichage des donnÃ©es.
 *
 * IMPORTANT: Ces fonctions NE CALCULENT PAS de logique mÃ©tier.
 * Elles formattent uniquement des valeurs dÃ©jÃ  calculÃ©es par le backend.
 */

/**
 * Formate un nombre avec gestion dÃ©fensive des valeurs nulles/undefined.
 *
 * @param value - Valeur numÃ©rique Ã  formatter
 * @param unit - UnitÃ© optionnelle Ã  ajouter
 * @param decimals - Nombre de dÃ©cimales (dÃ©faut: 1)
 * @returns ChaÃ®ne formatÃ©e (ex: "123.5 kg")
 */
export const formatNumber = (
  value: number | string | null | undefined,
  unit?: string,
  decimals: number = 1
): string => {
  // Conversion sÃ©curisÃ©e vers number
  const numValue = typeof value === 'number' ? value : parseFloat(value as string);

  // Gestion des valeurs invalides
  if (isNaN(numValue) || numValue === undefined || numValue === null) {
    return `0${unit ? ` ${unit}` : ''}`;
  }

  // Formatage avec dÃ©cimales
  const formatted = numValue.toFixed(decimals);

  return unit ? `${formatted} ${unit}` : formatted;
};

/**
 * Formate un pourcentage avec gestion dÃ©fensive.
 *
 * @param value - Valeur numÃ©rique (0-100)
 * @param decimals - Nombre de dÃ©cimales (dÃ©faut: 1)
 * @returns ChaÃ®ne formatÃ©e (ex: "85.5%")
 */
export const formatPercentage = (
  value: number | string | null | undefined,
  decimals: number = 1
): string => {
  const numValue = typeof value === 'number' ? value : parseFloat(value as string);

  if (isNaN(numValue) || numValue === undefined || numValue === null) {
    return '0%';
  }

  return `${numValue.toFixed(decimals)}%`;
};

/**
 * Formate une date selon la locale actuelle.
 *
 * @param dateString - ChaÃ®ne de date ISO 8601
 * @param locale - Locale (dÃ©faut: 'fr-FR')
 * @returns Date formatÃ©e (ex: "15 janv. 2025")
 */
export const formatDate = (
  dateString: string | null | undefined,
  locale: string = 'fr-FR'
): string => {
  if (!dateString) return '-';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (error) {
    return '-';
  }
};

/**
 * Formate une date avec l'heure.
 *
 * @param dateString - ChaÃ®ne de date ISO 8601
 * @param locale - Locale (dÃ©faut: 'fr-FR')
 * @returns Date et heure formatÃ©es (ex: "15 janv. 2025, 14:30")
 */
export const formatDateTime = (
  dateString: string | null | undefined,
  locale: string = 'fr-FR'
): string => {
  if (!dateString) return '-';

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return '-';
  }
};

/**
 * Formate une durÃ©e en jours depuis une date de dÃ©part.
 *
 * @param startDate - Date de dÃ©part (ISO 8601)
 * @param endDate - Date de fin (dÃ©faut: aujourd'hui)
 * @returns Nombre de jours (ex: "45")
 */
export const formatDaysSince = (
  startDate: string | null | undefined,
  endDate?: string
): string => {
  if (!startDate) return '0';

  try {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) return '0';
    const end = endDate ? new Date(endDate) : new Date();
    if (isNaN(end.getTime())) return '0';
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays.toString();
  } catch (error) {
    return '0';
  }
};

/**
 * Formate un montant en FCFA (devise camerounaise).
 *
 * @param amount - Montant en FCFA
 * @param decimals - Nombre de dÃ©cimales (dÃ©faut: 0)
 * @returns Montant formatÃ© (ex: "150 000 FCFA")
 */
export const formatCurrency = (
  amount: number | string | null | undefined,
  decimals: number = 0
): string => {
  const numValue = typeof amount === 'number' ? amount : parseFloat(amount as string);

  if (isNaN(numValue) || numValue === undefined || numValue === null) {
    return '0 FCFA';
  }

  // Format avec espaces pour les milliers
  const formatted = numValue.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${formatted} FCFA`;
};

// =================== FORMATTERS AQUACULTURE SPÃ‰CIFIQUES ===================

/**
 * Formate une biomasse avec unitÃ©.
 * @param biomassKg - Biomasse en kg (calculÃ©e par backend)
 * @param unit - UnitÃ© ('kg' ou 'tonnes')
 * @returns Biomasse formatÃ©e (ex: "250.50 kg")
 */
export const formatBiomass = (
  biomassKg: number | null | undefined,
  unit: 'kg' | 'tonnes' = 'kg'
): string => {
  if (biomassKg === null || biomassKg === undefined) return 'N/A';
  const value = unit === 'tonnes' ? biomassKg / 1000 : biomassKg;
  return `${value.toFixed(2)} ${unit}`;
};

/**
 * Formate une densitÃ© d'Ã©levage.
 * @param densityValue - DensitÃ© (calculÃ©e par backend)
 * @param unit - UnitÃ© ('kg/mÂ³' ou 'kg/mÂ²')
 * @returns DensitÃ© formatÃ©e (ex: "125.30 kg/mÂ³")
 */
export const formatDensity = (
  densityValue: number | null | undefined,
  unit: 'kg/mÂ³' | 'kg/mÂ²' = 'kg/mÂ³'
): string => {
  if (densityValue === null || densityValue === undefined) return 'N/A';
  return `${densityValue.toFixed(2)} ${unit}`;
};

/**
 * Formate un FCR (Feed Conversion Ratio).
 * @param fcr - FCR calculÃ© par backend
 * @returns FCR formatÃ© (ex: "1.85")
 */
export const formatFCR = (
  fcr: number | null | undefined
): string => {
  if (fcr === null || fcr === undefined) return 'N/A';
  return fcr.toFixed(2);
};

/**
 * Formate un taux de survie.
 * @param survivalRate - Taux en % (calculÃ© par backend)
 * @returns Taux formatÃ© (ex: "85.50%")
 */
export const formatSurvivalRate = (
  survivalRate: number | null | undefined
): string => {
  if (survivalRate === null || survivalRate === undefined) return 'N/A';
  return `${survivalRate.toFixed(2)}%`;
};

/**
 * Formate un taux de croissance journalier.
 * @param dailyGrowthRate - Taux en g/jour (calculÃ© par backend)
 * @returns Taux formatÃ© (ex: "2.30 g/jour")
 */
export const formatDailyGrowthRate = (
  dailyGrowthRate: number | null | undefined
): string => {
  if (dailyGrowthRate === null || dailyGrowthRate === undefined) return 'N/A';
  return `${dailyGrowthRate.toFixed(2)} g/jour`;
};

/**
 * Formate un taux de croissance spÃ©cifique (SGR).
 * @param specificGrowthRate - SGR en %/jour (calculÃ© par backend)
 * @returns SGR formatÃ© (ex: "1.50%/jour")
 */
export const formatSpecificGrowthRate = (
  specificGrowthRate: number | null | undefined
): string => {
  if (specificGrowthRate === null || specificGrowthRate === undefined) return 'N/A';
  return `${specificGrowthRate.toFixed(2)}%/jour`;
};

/**
 * Formate une quantitÃ© d'aliment.
 * @param feedAmount - QuantitÃ© en kg (calculÃ©e par backend)
 * @returns QuantitÃ© formatÃ©e (ex: "12.50 kg")
 */
export const formatFeedAmount = (
  feedAmount: number | null | undefined
): string => {
  if (feedAmount === null || feedAmount === undefined) return 'N/A';
  return `${feedAmount.toFixed(2)} kg`;
};

/**
 * Formate un score de performance.
 * @param score - Score 0-100 (calculÃ© par backend)
 * @returns Score formatÃ© (ex: "85.0/100")
 */
export const formatPerformanceScore = (
  score: number | null | undefined
): string => {
  if (score === null || score === undefined) return 'N/A';
  return `${score.toFixed(1)}/100`;
};




