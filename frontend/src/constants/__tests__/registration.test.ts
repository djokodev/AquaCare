import { REGIONS, ACTIVITY_TYPES, AGE_GROUPS, LEGAL_STATUS_OPTIONS } from '../registration';
import { CAMEROON_REGIONS } from '../cameroon';

describe('REGIONS', () => {
  it('has 10 regions (one per Cameroon region)', () => {
    expect(REGIONS.length).toBe(10);
  });

  it('contains every region from CAMEROON_REGIONS', () => {
    const regionCodes = REGIONS.map((r) => r.value);
    CAMEROON_REGIONS.forEach((r) => {
      expect(regionCodes).toContain(r.code);
    });
  });

  it('each entry has a non-empty value and label', () => {
    REGIONS.forEach((r) => {
      expect(r.value).toBeTruthy();
      expect(r.label).toBeTruthy();
    });
  });
});

describe('ACTIVITY_TYPES', () => {
  it('has 4 activity types', () => {
    expect(ACTIVITY_TYPES.length).toBe(4);
  });
});

describe('AGE_GROUPS', () => {
  it('has 6 age groups', () => {
    expect(AGE_GROUPS.length).toBe(6);
  });
});

describe('LEGAL_STATUS_OPTIONS', () => {
  it('has 12 legal status options', () => {
    expect(LEGAL_STATUS_OPTIONS.length).toBe(12);
  });
});
