/**
 * Tests unitaires pour utils/formatters.ts
 *
 * Ces tests vérifient le formatage d'affichage uniquement.
 * Aucune logique métier n'est testée ici.
 */

import {
  formatNumber,
  formatPercentage,
  formatDate,
  formatDateTime,
  formatDaysSince,
  formatCurrency,
  formatBiomass,
  formatDensity,
  formatFCR,
  formatSurvivalRate,
  formatDailyGrowthRate,
  formatSpecificGrowthRate,
  formatFeedAmount,
  formatPerformanceScore,
} from '../formatters';

describe('utils/formatters', () => {
  describe('formatNumber', () => {
    it('formate un nombre avec 1 décimale par défaut', () => {
      expect(formatNumber(123.456)).toBe('123.5');
    });

    it('formate un nombre avec unité', () => {
      expect(formatNumber(123.456, 'kg')).toBe('123.5 kg');
    });

    it('formate avec nombre de décimales personnalisé', () => {
      expect(formatNumber(123.456, 'kg', 2)).toBe('123.46 kg');
    });

    it('retourne "0" pour valeurs nulles/undefined', () => {
      expect(formatNumber(null)).toBe('0');
      expect(formatNumber(undefined)).toBe('0');
    });

    it('retourne "0 unit" pour valeurs nulles avec unité', () => {
      expect(formatNumber(null, 'kg')).toBe('0 kg');
    });

    it('gère les strings numériques', () => {
      expect(formatNumber('123.456', 'kg')).toBe('123.5 kg');
    });

    it('retourne "0" pour strings non-numériques', () => {
      expect(formatNumber('abc')).toBe('0');
    });
  });

  describe('formatPercentage', () => {
    it('formate un pourcentage avec 1 décimale', () => {
      expect(formatPercentage(85.567)).toBe('85.6%');
    });

    it('formate avec nombre de décimales personnalisé', () => {
      expect(formatPercentage(85.567, 2)).toBe('85.57%');
    });

    it('retourne "0%" pour valeurs nulles/undefined', () => {
      expect(formatPercentage(null)).toBe('0%');
      expect(formatPercentage(undefined)).toBe('0%');
    });

    it('gère les strings numériques', () => {
      expect(formatPercentage('75.5')).toBe('75.5%');
    });

    it('gère les pourcentages 0 et 100', () => {
      expect(formatPercentage(0)).toBe('0.0%');
      expect(formatPercentage(100)).toBe('100.0%');
    });
  });

  describe('formatDate', () => {
    it('formate une date ISO 8601 en français', () => {
      const result = formatDate('2025-01-15');
      // Format attendu : "15 janv. 2025" ou similaire selon locale
      expect(result).toContain('15');
      expect(result).toContain('2025');
    });

    it('retourne "-" pour date nulle/undefined', () => {
      expect(formatDate(null)).toBe('-');
      expect(formatDate(undefined)).toBe('-');
    });

    it('retourne "-" pour date invalide', () => {
      expect(formatDate('invalid-date')).toBe('-');
    });

    it('gère différentes locales', () => {
      const result = formatDate('2025-01-15', 'en-US');
      expect(result).toContain('15');
      expect(result).toContain('2025');
    });
  });

  describe('formatDateTime', () => {
    it('formate une date avec heure', () => {
      const result = formatDateTime('2025-01-15T14:30:00');
      expect(result).toContain('15');
      expect(result).toContain('2025');
      expect(result).toContain('14');
      expect(result).toContain('30');
    });

    it('retourne "-" pour date nulle/undefined', () => {
      expect(formatDateTime(null)).toBe('-');
      expect(formatDateTime(undefined)).toBe('-');
    });
  });

  describe('formatDaysSince', () => {
    it('calcule et formate les jours écoulés', () => {
      const date30DaysAgo = new Date();
      date30DaysAgo.setDate(date30DaysAgo.getDate() - 30);

      expect(formatDaysSince(date30DaysAgo.toISOString())).toBe('30');
    });

    it('retourne "0" pour date nulle/undefined', () => {
      expect(formatDaysSince(null)).toBe('0');
      expect(formatDaysSince(undefined)).toBe('0');
    });

    it('gère une date de fin personnalisée', () => {
      const start = '2025-01-01';
      const end = '2025-01-31';
      expect(formatDaysSince(start, end)).toBe('30');
    });

    it('retourne "0" pour date invalide', () => {
      expect(formatDaysSince('invalid-date')).toBe('0');
    });
  });

  describe('formatCurrency', () => {
    it('formate un montant en FCFA', () => {
      const result = formatCurrency(150000);
      expect(result).toContain('150');
      expect(result).toContain('000');
      expect(result).toContain('FCFA');
    });

    it('formate avec 0 décimale par défaut', () => {
      const result = formatCurrency(150000.75);
      expect(result).toContain('150');
      expect(result).toContain('001');
      expect(result).toContain('FCFA');
    });

    it('formate avec décimales personnalisées', () => {
      const result = formatCurrency(150000.75, 2);
      expect(result).toContain('150');
      expect(result).toContain('000');
      expect(result).toContain('75');
      expect(result).toContain('FCFA');
    });

    it('retourne "0 FCFA" pour valeurs nulles', () => {
      expect(formatCurrency(null)).toBe('0 FCFA');
      expect(formatCurrency(undefined)).toBe('0 FCFA');
    });

    it('gère les montants négatifs', () => {
      const result = formatCurrency(-5000);
      expect(result).toContain('-5');
      expect(result).toContain('000');
      expect(result).toContain('FCFA');
    });
  });

  describe('formatBiomass', () => {
    it('formate biomasse en kg', () => {
      expect(formatBiomass(250.5)).toBe('250.50 kg');
    });

    it('formate biomasse en tonnes', () => {
      expect(formatBiomass(2500, 'tonnes')).toBe('2.50 tonnes');
    });

    it('retourne "N/A" pour valeurs nulles', () => {
      expect(formatBiomass(null)).toBe('N/A');
      expect(formatBiomass(undefined)).toBe('N/A');
    });

    it('gère les petites biomasses', () => {
      expect(formatBiomass(0.75)).toBe('0.75 kg');
    });
  });

  describe('formatDensity', () => {
    it('formate densité volumétrique', () => {
      expect(formatDensity(125.30)).toBe('125.30 kg/m³');
    });

    it('formate densité superficielle', () => {
      expect(formatDensity(15.75, 'kg/m²')).toBe('15.75 kg/m²');
    });

    it('retourne "N/A" pour valeurs nulles', () => {
      expect(formatDensity(null)).toBe('N/A');
      expect(formatDensity(undefined)).toBe('N/A');
    });
  });

  describe('formatFCR', () => {
    it('formate FCR avec 2 décimales', () => {
      expect(formatFCR(1.856)).toBe('1.86');
    });

    it('retourne "N/A" pour valeurs nulles', () => {
      expect(formatFCR(null)).toBe('N/A');
      expect(formatFCR(undefined)).toBe('N/A');
    });

    it('gère les FCR excellents', () => {
      expect(formatFCR(1.2)).toBe('1.20');
    });

    it('gère les FCR élevés', () => {
      expect(formatFCR(3.5)).toBe('3.50');
    });
  });

  describe('formatSurvivalRate', () => {
    it('formate taux de survie avec 2 décimales', () => {
      expect(formatSurvivalRate(85.567)).toBe('85.57%');
    });

    it('retourne "N/A" pour valeurs nulles', () => {
      expect(formatSurvivalRate(null)).toBe('N/A');
      expect(formatSurvivalRate(undefined)).toBe('N/A');
    });

    it('gère taux 100%', () => {
      expect(formatSurvivalRate(100)).toBe('100.00%');
    });

    it('gère taux 0%', () => {
      expect(formatSurvivalRate(0)).toBe('0.00%');
    });
  });

  describe('formatDailyGrowthRate', () => {
    it('formate taux de croissance journalier', () => {
      expect(formatDailyGrowthRate(2.35)).toBe('2.35 g/jour');
    });

    it('retourne "N/A" pour valeurs nulles', () => {
      expect(formatDailyGrowthRate(null)).toBe('N/A');
      expect(formatDailyGrowthRate(undefined)).toBe('N/A');
    });

    it('gère les faibles taux de croissance', () => {
      expect(formatDailyGrowthRate(0.5)).toBe('0.50 g/jour');
    });
  });

  describe('formatSpecificGrowthRate', () => {
    it('formate SGR avec 2 décimales', () => {
      expect(formatSpecificGrowthRate(1.56)).toBe('1.56%/jour');
    });

    it('retourne "N/A" pour valeurs nulles', () => {
      expect(formatSpecificGrowthRate(null)).toBe('N/A');
      expect(formatSpecificGrowthRate(undefined)).toBe('N/A');
    });
  });

  describe('formatFeedAmount', () => {
    it('formate quantité d\'aliment', () => {
      expect(formatFeedAmount(12.567)).toBe('12.57 kg');
    });

    it('retourne "N/A" pour valeurs nulles', () => {
      expect(formatFeedAmount(null)).toBe('N/A');
      expect(formatFeedAmount(undefined)).toBe('N/A');
    });

    it('gère les petites quantités', () => {
      expect(formatFeedAmount(0.25)).toBe('0.25 kg');
    });
  });

  describe('formatPerformanceScore', () => {
    it('formate score de performance', () => {
      expect(formatPerformanceScore(85.7)).toBe('85.7/100');
    });

    it('retourne "N/A" pour valeurs nulles', () => {
      expect(formatPerformanceScore(null)).toBe('N/A');
      expect(formatPerformanceScore(undefined)).toBe('N/A');
    });

    it('gère les scores parfaits', () => {
      expect(formatPerformanceScore(100)).toBe('100.0/100');
    });

    it('gère les scores faibles', () => {
      expect(formatPerformanceScore(25.3)).toBe('25.3/100');
    });
  });
});
