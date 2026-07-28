import { getProductDisplayName } from '../productPresentation';

describe('getProductDisplayName', () => {
  it('uses the localized silure label and removes the duplicated pellet size', () => {
    expect(getProductDisplayName('Catfish 2mm', 'Silure')).toBe('Silure');
  });

  it('preserves product names that do not embed a pellet size', () => {
    expect(getProductDisplayName('Aliment starter', 'Silure')).toBe('Aliment starter');
  });
});
