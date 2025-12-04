/**
 * Tests unitaires pour domain/estimators.ts
 *
 * Ces tests vérifient les estimations UX temporaires.
 * Rappel : Backend recalcule TOUTES ces valeurs avec formules scientifiques.
 */

import {
  estimateBiomass,
  estimateSurvivalRate,
  estimateDensity,
  estimateDaysElapsed,
  estimateProjectedWeight,
  estimateDailyFeed,
  estimateDensityWithUnit,
  estimateAverageWeight,
} from '@/domain/aquaculture/estimators';

describe('domain/estimators', () => {
  describe('estimateBiomass', () => {
    it('calcule correctement la biomasse en kg', () => {
      // 1000 poissons × 150g = 150000g = 150kg
      expect(estimateBiomass(1000, 150)).toBe(150);
    });

    it('retourne 0 si fishCount <= 0', () => {
      expect(estimateBiomass(0, 150)).toBe(0);
      expect(estimateBiomass(-10, 150)).toBe(0);
    });

    it('retourne 0 si averageWeight <= 0', () => {
      expect(estimateBiomass(1000, 0)).toBe(0);
      expect(estimateBiomass(1000, -50)).toBe(0);
    });

    it('gère les valeurs décimales', () => {
      // 500 poissons × 125.5g = 62750g = 62.75kg
      expect(estimateBiomass(500, 125.5)).toBe(62.75);
    });
  });

  describe('estimateSurvivalRate', () => {
    it('calcule correctement le taux de survie en %', () => {
      // 850 survivants / 1000 initiaux = 85%
      expect(estimateSurvivalRate(1000, 850)).toBe(85);
    });

    it('retourne 100% si aucune mortalité', () => {
      expect(estimateSurvivalRate(1000, 1000)).toBe(100);
    });

    it('retourne 0% si mortalité totale', () => {
      expect(estimateSurvivalRate(1000, 0)).toBe(0);
    });

    it('retourne 0 si initialCount <= 0', () => {
      expect(estimateSurvivalRate(0, 500)).toBe(0);
      expect(estimateSurvivalRate(-100, 500)).toBe(0);
    });

    it('retourne 0 si currentCount < 0', () => {
      expect(estimateSurvivalRate(1000, -50)).toBe(0);
    });

    it('gère les valeurs décimales', () => {
      // 763 / 900 = 84.777...%
      expect(estimateSurvivalRate(900, 763)).toBeCloseTo(84.78, 2);
    });
  });

  describe('estimateDensity', () => {
    it('calcule correctement la densité en kg/m³', () => {
      // 150kg / 12m³ = 12.5 kg/m³
      expect(estimateDensity(150, 12)).toBe(12.5);
    });

    it('retourne 0 si volumeM3 <= 0', () => {
      expect(estimateDensity(150, 0)).toBe(0);
      expect(estimateDensity(150, -5)).toBe(0);
    });

    it('retourne 0 si biomassKg <= 0', () => {
      expect(estimateDensity(0, 12)).toBe(0);
      expect(estimateDensity(-50, 12)).toBe(0);
    });

    it('gère les hautes densités', () => {
      // 500kg / 2m³ = 250 kg/m³ (haute densité)
      expect(estimateDensity(500, 2)).toBe(250);
    });
  });

  describe('estimateDaysElapsed', () => {
    it('calcule correctement les jours écoulés', () => {
      // Il y a 30 jours
      const date30DaysAgo = new Date();
      date30DaysAgo.setDate(date30DaysAgo.getDate() - 30);

      const result = estimateDaysElapsed(date30DaysAgo.toISOString());
      expect(result).toBe(30);
    });

    it('retourne 0 pour une date invalide', () => {
      expect(estimateDaysElapsed('invalid-date')).toBe(0);
    });

    it('gère les dates futures (retourne valeur absolue)', () => {
      const dateFuture = new Date();
      dateFuture.setDate(dateFuture.getDate() + 10);

      const result = estimateDaysElapsed(dateFuture.toISOString());
      expect(result).toBe(10);
    });

    it('retourne 0 pour aujourd\'hui', () => {
      const today = new Date().toISOString();
      expect(estimateDaysElapsed(today)).toBe(0);
    });
  });

  describe('estimateProjectedWeight', () => {
    it('calcule correctement le poids projeté', () => {
      // 100g actuels + (2g/jour × 30 jours) = 160g
      expect(estimateProjectedWeight(100, 2, 30)).toBe(160);
    });

    it('retourne poids actuel si days <= 0', () => {
      expect(estimateProjectedWeight(100, 2, 0)).toBe(100);
      expect(estimateProjectedWeight(100, 2, -10)).toBe(100);
    });

    it('retourne poids actuel si currentWeight <= 0', () => {
      expect(estimateProjectedWeight(0, 2, 30)).toBe(0);
      expect(estimateProjectedWeight(-50, 2, 30)).toBe(-50);
    });

    it('gère les taux de croissance élevés', () => {
      // 50g + (5g/jour × 60 jours) = 350g
      expect(estimateProjectedWeight(50, 5, 60)).toBe(350);
    });

    it('gère les valeurs décimales', () => {
      // 100g + (1.5g/jour × 20 jours) = 130g
      expect(estimateProjectedWeight(100, 1.5, 20)).toBe(130);
    });
  });

  describe('estimateDailyFeed', () => {
    it('calcule correctement la quantité d\'aliment journalière', () => {
      // 150kg biomasse × 3% = 4.5kg/jour
      expect(estimateDailyFeed(150, 3)).toBe(4.5);
    });

    it('retourne 0 si biomassKg <= 0', () => {
      expect(estimateDailyFeed(0, 3)).toBe(0);
      expect(estimateDailyFeed(-50, 3)).toBe(0);
    });

    it('retourne 0 si feedingRatePercent <= 0', () => {
      expect(estimateDailyFeed(150, 0)).toBe(0);
      expect(estimateDailyFeed(150, -2)).toBe(0);
    });

    it('gère les taux d\'alimentation élevés', () => {
      // 200kg × 5% = 10kg/jour
      expect(estimateDailyFeed(200, 5)).toBe(10);
    });

    it('gère les valeurs décimales', () => {
      // 125.5kg × 2.5% = 3.1375kg/jour
      expect(estimateDailyFeed(125.5, 2.5)).toBeCloseTo(3.14, 2);
    });
  });

  describe('estimateDensityWithUnit', () => {
    it('retourne densité volumétrique si volume fourni', () => {
      // 150kg / 10m³ = 15 kg/m³
      const result = estimateDensityWithUnit(150, 10, 50);
      expect(result.value).toBe(15);
      expect(result.unit).toBe('kg/m3');
    });

    it('retourne densité superficielle si seulement surface fournie', () => {
      // 150kg / 50m² = 3 kg/m²
      const result = estimateDensityWithUnit(150, undefined, 50);
      expect(result.value).toBe(3);
      expect(result.unit).toBe('kg/m2');
    });

    it('retourne 0 si ni volume ni surface', () => {
      const result = estimateDensityWithUnit(150);
      expect(result.value).toBe(0);
      expect(result.unit).toBe('kg/m2');
    });

    it('prioritise volume sur surface', () => {
      // Volume prioritaire : 150kg / 10m³ = 15 kg/m³
      const result = estimateDensityWithUnit(150, 10, 50);
      expect(result.value).toBe(15);
      expect(result.unit).toBe('kg/m3');
    });

    it('retourne 0 si volume est 0', () => {
      const result = estimateDensityWithUnit(150, 0, 50);
      // Devrait fallback sur surface
      expect(result.value).toBe(3); // 150/50
      expect(result.unit).toBe('kg/m2');
    });

    it('retourne 0 si surface est 0', () => {
      const result = estimateDensityWithUnit(150, undefined, 0);
      expect(result.value).toBe(0);
      expect(result.unit).toBe('kg/m2');
    });
  });

  describe('estimateAverageWeight', () => {
    it('calcule correctement le poids moyen', () => {
      // 1500g / 10 poissons = 150g/poisson
      expect(estimateAverageWeight(1500, 10)).toBe(150);
    });

    it('retourne 0 si sampleCount <= 0', () => {
      expect(estimateAverageWeight(1500, 0)).toBe(0);
      expect(estimateAverageWeight(1500, -5)).toBe(0);
    });

    it('gère les valeurs décimales', () => {
      // 1256.7g / 8 poissons = 157.0875g
      expect(estimateAverageWeight(1256.7, 8)).toBeCloseTo(157.09, 2);
    });

    it('gère un échantillon d\'un seul poisson', () => {
      expect(estimateAverageWeight(200, 1)).toBe(200);
    });

    it('gère les poids très faibles (alevins)', () => {
      // 50g / 100 alevins = 0.5g/alevin
      expect(estimateAverageWeight(50, 100)).toBe(0.5);
    });
  });
});
