/**
 * Tests unitaires pour utils/interpreters.ts
 *
 * Ces tests vÃ©rifient l'interprÃ©tation de valeurs backend pour affichage UI.
 * Logique lÃ©gÃ¨re de badges/couleurs uniquement.
 */

import {
  interpretFCR,
  interpretSurvivalRate,
  isDensityOptimal,
  interpretPerformanceScore,
  getFCRColor,
  getSurvivalRateColor,
  getPerformanceLevelColor,
  getFCRRecommendation,
  getSurvivalRateRecommendation,
} from '../interpreters';

describe('utils/interpreters', () => {
  describe('interpretFCR', () => {
    it('retourne "excellent" pour FCR <= 1.2', () => {
      expect(interpretFCR(1.0)).toBe('excellent');
      expect(interpretFCR(1.2)).toBe('excellent');
    });

    it('retourne "bon" pour FCR entre 1.2 et 1.5', () => {
      expect(interpretFCR(1.3)).toBe('bon');
      expect(interpretFCR(1.5)).toBe('bon');
    });

    it('retourne "acceptable" pour FCR entre 1.5 et 2.0', () => {
      expect(interpretFCR(1.6)).toBe('acceptable');
      expect(interpretFCR(2.0)).toBe('acceptable');
    });

    it('retourne "necessite amelioration" pour FCR > 2.0', () => {
      expect(interpretFCR(2.1)).toBe('necessite amelioration');
      expect(interpretFCR(3.5)).toBe('necessite amelioration');
    });

    it('retourne null pour valeurs nulles/undefined', () => {
      expect(interpretFCR(null)).toBeNull();
      expect(interpretFCR(undefined)).toBeNull();
    });
  });

  describe('interpretSurvivalRate', () => {
    it('retourne "excellent" pour taux >= 85%', () => {
      expect(interpretSurvivalRate(85)).toBe('excellent');
      expect(interpretSurvivalRate(95)).toBe('excellent');
    });

    it('retourne "bon" pour taux entre 70% et 85%', () => {
      expect(interpretSurvivalRate(70)).toBe('bon');
      expect(interpretSurvivalRate(80)).toBe('bon');
    });

    it('retourne "moyen" pour taux entre 50% et 70%', () => {
      expect(interpretSurvivalRate(50)).toBe('moyen');
      expect(interpretSurvivalRate(65)).toBe('moyen');
    });

    it('retourne "faible" pour taux < 50%', () => {
      expect(interpretSurvivalRate(30)).toBe('faible');
      expect(interpretSurvivalRate(49)).toBe('faible');
    });

    it('retourne null pour valeurs nulles/undefined', () => {
      expect(interpretSurvivalRate(null)).toBeNull();
      expect(interpretSurvivalRate(undefined)).toBeNull();
    });
  });

  describe('isDensityOptimal', () => {
    describe('pour tilapia', () => {
      it('retourne true si densitÃ© entre 100-300 kg/mÂ³', () => {
        expect(isDensityOptimal(100, 'tilapia')).toBe(true);
        expect(isDensityOptimal(200, 'tilapia')).toBe(true);
        expect(isDensityOptimal(300, 'tilapia')).toBe(true);
      });

      it('retourne false si densitÃ© hors plage optimale', () => {
        expect(isDensityOptimal(50, 'tilapia')).toBe(false);
        expect(isDensityOptimal(350, 'tilapia')).toBe(false);
      });
    });

    describe('pour clarias', () => {
      it('retourne true si densitÃ© entre 200-500 kg/mÂ³', () => {
        expect(isDensityOptimal(200, 'clarias')).toBe(true);
        expect(isDensityOptimal(350, 'clarias')).toBe(true);
        expect(isDensityOptimal(500, 'clarias')).toBe(true);
      });

      it('retourne false si densitÃ© hors plage optimale', () => {
        expect(isDensityOptimal(150, 'clarias')).toBe(false);
        expect(isDensityOptimal(600, 'clarias')).toBe(false);
      });
    });

    it('retourne false pour valeurs nulles/undefined', () => {
      expect(isDensityOptimal(null, 'tilapia')).toBe(false);
      expect(isDensityOptimal(undefined, 'clarias')).toBe(false);
    });
  });

  describe('interpretPerformanceScore', () => {
    it('retourne "excellent" pour score >= 80', () => {
      expect(interpretPerformanceScore(80)).toBe('excellent');
      expect(interpretPerformanceScore(95)).toBe('excellent');
    });

    it('retourne "bon" pour score entre 60 et 80', () => {
      expect(interpretPerformanceScore(60)).toBe('bon');
      expect(interpretPerformanceScore(75)).toBe('bon');
    });

    it('retourne "moyen" pour score entre 40 et 60', () => {
      expect(interpretPerformanceScore(40)).toBe('moyen');
      expect(interpretPerformanceScore(55)).toBe('moyen');
    });

    it('retourne "faible" pour score < 40', () => {
      expect(interpretPerformanceScore(20)).toBe('faible');
      expect(interpretPerformanceScore(39)).toBe('faible');
    });

    it('retourne null pour valeurs nulles/undefined', () => {
      expect(interpretPerformanceScore(null)).toBeNull();
      expect(interpretPerformanceScore(undefined)).toBeNull();
    });
  });

  describe('getFCRColor', () => {
    it('retourne vert MAVECAM pour "excellent"', () => {
      expect(getFCRColor('excellent')).toBe('#059669');
    });

    it('retourne vert clair pour "bon"', () => {
      expect(getFCRColor('bon')).toBe('#10b981');
    });

    it('retourne orange pour "acceptable"', () => {
      expect(getFCRColor('acceptable')).toBe('#f59e0b');
    });

    it('retourne rouge pour "necessite amelioration"', () => {
      expect(getFCRColor('necessite amelioration')).toBe('#dc2626');
    });

    it('retourne gris pour null', () => {
      expect(getFCRColor(null)).toBe('#64748b');
    });
  });

  describe('getSurvivalRateColor', () => {
    it('retourne vert MAVECAM pour "excellent"', () => {
      expect(getSurvivalRateColor('excellent')).toBe('#059669');
    });

    it('retourne vert clair pour "bon"', () => {
      expect(getSurvivalRateColor('bon')).toBe('#10b981');
    });

    it('retourne orange pour "moyen"', () => {
      expect(getSurvivalRateColor('moyen')).toBe('#f59e0b');
    });

    it('retourne rouge pour "faible"', () => {
      expect(getSurvivalRateColor('faible')).toBe('#dc2626');
    });

    it('retourne gris pour null', () => {
      expect(getSurvivalRateColor(null)).toBe('#64748b');
    });
  });

  describe('getPerformanceLevelColor', () => {
    it('retourne couleurs appropriÃ©es pour chaque niveau', () => {
      expect(getPerformanceLevelColor('excellent')).toBe('#059669');
      expect(getPerformanceLevelColor('bon')).toBe('#10b981');
      expect(getPerformanceLevelColor('moyen')).toBe('#f59e0b');
      expect(getPerformanceLevelColor('faible')).toBe('#dc2626');
    });

    it('retourne gris pour null', () => {
      expect(getPerformanceLevelColor(null)).toBe('#64748b');
    });
  });

  describe('getFCRRecommendation', () => {
    it('retourne recommandation pour FCR excellent', () => {
      const result = getFCRRecommendation(1.1);
      expect(result).toContain('optimal');
      expect(result).toContain('Continuez');
    });

    it('retourne recommandation pour FCR bon', () => {
      const result = getFCRRecommendation(1.4);
      expect(result).toContain('satisfaisant');
      expect(result).toContain('Maintenir');
    });

    it('retourne recommandation pour FCR acceptable', () => {
      const result = getFCRRecommendation(1.8);
      expect(result).toContain('acceptable');
      expect(result).toContain('Optimisation');
    });

    it('retourne recommandation pour FCR eleve', () => {
      const result = getFCRRecommendation(2.5);
      expect(result).toContain('eleve');
      expect(result).toContain('technicien MAVECAM');
    });

    it('retourne message par dÃ©faut pour valeurs nulles', () => {
      expect(getFCRRecommendation(null)).toBe('Donnees insuffisantes');
      expect(getFCRRecommendation(undefined)).toBe('Donnees insuffisantes');
    });
  });

  describe('getSurvivalRateRecommendation', () => {
    it('retourne recommandation pour taux excellent', () => {
      const result = getSurvivalRateRecommendation(90);
      expect(result).toContain('excellent');
      expect(result).toContain('Bonnes pratiques');
    });

    it('retourne recommandation pour taux bon', () => {
      const result = getSurvivalRateRecommendation(75);
      expect(result).toContain('satisfaisant');
    });

    it('retourne recommandation pour taux moyen', () => {
      const result = getSurvivalRateRecommendation(60);
      expect(result).toContain('moyen');
      expect(result).toContain('Surveillance');
    });

    it('retourne recommandation pour taux faible', () => {
      const result = getSurvivalRateRecommendation(40);
      expect(result).toContain('faible');
      expect(result).toContain('MAVECAM');
    });

    it('retourne message par dÃ©faut pour valeurs nulles', () => {
      expect(getSurvivalRateRecommendation(null)).toBe('Donnees insuffisantes');
      expect(getSurvivalRateRecommendation(undefined)).toBe('Donnees insuffisantes');
    });
  });
});




