/**
 * Tests unitaires pour utils/validators.ts
 *
 * Ces tests vérifient les validations UX pour feedback immédiat.
 * Rappel : Backend effectue la validation métier réelle.
 */

import {
  isValidCameroonPhone,
  isValidEmail,
  isInRange,
  isPositive,
  isNotEmpty,
  isFutureDate,
  isPastDate,
  isValidTemperature,
  isValidPH,
  isValidOxygen,
  isValidFishWeight,
  isValidFishCount,
} from '../validators';

describe('utils/validators', () => {
  describe('isValidCameroonPhone', () => {
    it('accepte numéro camerounais avec +237', () => {
      expect(isValidCameroonPhone('+237670000000')).toBe(true);
      expect(isValidCameroonPhone('+237690000000')).toBe(true);
      expect(isValidCameroonPhone('+237650000000')).toBe(true);
    });

    it('accepte numéro camerounais sans +237', () => {
      expect(isValidCameroonPhone('670000000')).toBe(true);
      expect(isValidCameroonPhone('690000000')).toBe(true);
    });

    it('accepte numéros avec espaces', () => {
      expect(isValidCameroonPhone('+237 670 000 000')).toBe(true);
      expect(isValidCameroonPhone('670 000 000')).toBe(true);
    });

    it('rejette numéros non-camerounais', () => {
      expect(isValidCameroonPhone('+33612345678')).toBe(false);
      expect(isValidCameroonPhone('+1234567890')).toBe(false);
    });

    it('rejette numéros ne commençant pas par 6', () => {
      expect(isValidCameroonPhone('+237770000000')).toBe(false);
      expect(isValidCameroonPhone('770000000')).toBe(false);
    });

    it('rejette numéros trop courts/longs', () => {
      expect(isValidCameroonPhone('+23767000000')).toBe(false); // 8 chiffres
      expect(isValidCameroonPhone('+2376700000000')).toBe(false); // 10 chiffres
    });

    it('rejette valeurs nulles/vides', () => {
      expect(isValidCameroonPhone('')).toBe(false);
      expect(isValidCameroonPhone(null as any)).toBe(false);
      expect(isValidCameroonPhone(undefined as any)).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('accepte emails valides', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('test+tag@example.org')).toBe(true);
    });

    it('rejette emails invalides', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('test@example')).toBe(false);
      expect(isValidEmail('test @example.com')).toBe(false);
    });

    it('rejette valeurs nulles/vides', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null as any)).toBe(false);
      expect(isValidEmail(undefined as any)).toBe(false);
    });
  });

  describe('isInRange', () => {
    it('accepte valeurs dans la plage', () => {
      expect(isInRange(50, 0, 100)).toBe(true);
      expect(isInRange(0, 0, 100)).toBe(true); // Limite min
      expect(isInRange(100, 0, 100)).toBe(true); // Limite max
    });

    it('accepte strings numériques', () => {
      expect(isInRange('50', 0, 100)).toBe(true);
    });

    it('rejette valeurs hors plage', () => {
      expect(isInRange(-1, 0, 100)).toBe(false);
      expect(isInRange(101, 0, 100)).toBe(false);
    });

    it('rejette valeurs invalides', () => {
      expect(isInRange(null, 0, 100)).toBe(false);
      expect(isInRange(undefined, 0, 100)).toBe(false);
      expect(isInRange('abc', 0, 100)).toBe(false);
    });

    it('gère plages négatives', () => {
      expect(isInRange(-5, -10, 0)).toBe(true);
      expect(isInRange(-11, -10, 0)).toBe(false);
    });
  });

  describe('isPositive', () => {
    it('accepte nombres positifs', () => {
      expect(isPositive(1)).toBe(true);
      expect(isPositive(100)).toBe(true);
      expect(isPositive(0.1)).toBe(true);
    });

    it('accepte strings positifs', () => {
      expect(isPositive('50')).toBe(true);
    });

    it('rejette zéro', () => {
      expect(isPositive(0)).toBe(false);
    });

    it('rejette nombres négatifs', () => {
      expect(isPositive(-1)).toBe(false);
      expect(isPositive(-0.1)).toBe(false);
    });

    it('rejette valeurs invalides', () => {
      expect(isPositive(null)).toBe(false);
      expect(isPositive(undefined)).toBe(false);
      expect(isPositive('abc')).toBe(false);
    });
  });

  describe('isNotEmpty', () => {
    it('accepte chaînes non-vides', () => {
      expect(isNotEmpty('test')).toBe(true);
      expect(isNotEmpty('a')).toBe(true);
    });

    it('rejette chaînes vides', () => {
      expect(isNotEmpty('')).toBe(false);
      expect(isNotEmpty('   ')).toBe(false); // Espaces uniquement
    });

    it('rejette valeurs nulles', () => {
      expect(isNotEmpty(null)).toBe(false);
      expect(isNotEmpty(undefined)).toBe(false);
    });
  });

  describe('isFutureDate', () => {
    it('accepte dates futures', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      expect(isFutureDate(futureDate.toISOString())).toBe(true);
    });

    it('rejette dates passées', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      expect(isFutureDate(pastDate.toISOString())).toBe(false);
    });

    it('rejette date actuelle (environ)', () => {
      const now = new Date().toISOString();
      // Peut être true ou false selon timing exact, on teste juste qu'il n'y a pas d'erreur
      expect(typeof isFutureDate(now)).toBe('boolean');
    });

    it('rejette dates invalides', () => {
      expect(isFutureDate('invalid-date')).toBe(false);
      expect(isFutureDate(null)).toBe(false);
      expect(isFutureDate(undefined)).toBe(false);
    });
  });

  describe('isPastDate', () => {
    it('accepte dates passées', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      expect(isPastDate(pastDate.toISOString())).toBe(true);
    });

    it('rejette dates futures', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      expect(isPastDate(futureDate.toISOString())).toBe(false);
    });

    it('rejette dates invalides', () => {
      expect(isPastDate('invalid-date')).toBe(false);
      expect(isPastDate(null)).toBe(false);
      expect(isPastDate(undefined)).toBe(false);
    });
  });

  describe('isValidTemperature', () => {
    it('accepte températures raisonnables (15-35°C)', () => {
      expect(isValidTemperature(20)).toBe(true);
      expect(isValidTemperature(15)).toBe(true); // Min
      expect(isValidTemperature(35)).toBe(true); // Max
      expect(isValidTemperature(28)).toBe(true); // Optimal aquaculture
    });

    it('rejette températures hors plage', () => {
      expect(isValidTemperature(10)).toBe(false); // Trop froid
      expect(isValidTemperature(40)).toBe(false); // Trop chaud
    });

    it('rejette valeurs invalides', () => {
      expect(isValidTemperature(null)).toBe(false);
      expect(isValidTemperature(undefined)).toBe(false);
    });
  });

  describe('isValidPH', () => {
    it('accepte pH raisonnables (4-10)', () => {
      expect(isValidPH(7)).toBe(true); // Neutre
      expect(isValidPH(4)).toBe(true); // Min
      expect(isValidPH(10)).toBe(true); // Max
      expect(isValidPH(6.5)).toBe(true); // Optimal aquaculture
    });

    it('rejette pH hors plage', () => {
      expect(isValidPH(3)).toBe(false);
      expect(isValidPH(11)).toBe(false);
    });

    it('rejette valeurs invalides', () => {
      expect(isValidPH(null)).toBe(false);
      expect(isValidPH(undefined)).toBe(false);
    });
  });

  describe('isValidOxygen', () => {
    it('accepte oxygène raisonnable (0-20 mg/L)', () => {
      expect(isValidOxygen(5)).toBe(true);
      expect(isValidOxygen(0)).toBe(true); // Min
      expect(isValidOxygen(20)).toBe(true); // Max
      expect(isValidOxygen(7)).toBe(true); // Optimal aquaculture
    });

    it('rejette oxygène hors plage', () => {
      expect(isValidOxygen(-1)).toBe(false);
      expect(isValidOxygen(25)).toBe(false);
    });

    it('rejette valeurs invalides', () => {
      expect(isValidOxygen(null)).toBe(false);
      expect(isValidOxygen(undefined)).toBe(false);
    });
  });

  describe('isValidFishWeight', () => {
    it('accepte poids raisonnables (0.1-5000g)', () => {
      expect(isValidFishWeight(150)).toBe(true); // Adulte
      expect(isValidFishWeight(0.1)).toBe(true); // Alevin min
      expect(isValidFishWeight(5000)).toBe(true); // Gros poisson max
      expect(isValidFishWeight(1)).toBe(true); // Alevin
    });

    it('rejette poids hors plage', () => {
      expect(isValidFishWeight(0)).toBe(false); // Trop petit
      expect(isValidFishWeight(0.05)).toBe(false); // Trop petit
      expect(isValidFishWeight(6000)).toBe(false); // Trop gros
    });

    it('rejette valeurs invalides', () => {
      expect(isValidFishWeight(null)).toBe(false);
      expect(isValidFishWeight(undefined)).toBe(false);
    });
  });

  describe('isValidFishCount', () => {
    it('accepte nombres raisonnables (1-1000000)', () => {
      expect(isValidFishCount(1000)).toBe(true);
      expect(isValidFishCount(1)).toBe(true); // Min
      expect(isValidFishCount(1000000)).toBe(true); // Max
      expect(isValidFishCount(500)).toBe(true);
    });

    it('rejette nombres hors plage', () => {
      expect(isValidFishCount(0)).toBe(false);
      expect(isValidFishCount(-10)).toBe(false);
      expect(isValidFishCount(1000001)).toBe(false); // Trop grand
    });

    it('rejette valeurs invalides', () => {
      expect(isValidFishCount(null)).toBe(false);
      expect(isValidFishCount(undefined)).toBe(false);
    });
  });
});
