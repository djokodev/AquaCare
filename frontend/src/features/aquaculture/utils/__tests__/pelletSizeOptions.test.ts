import {
  getOfflineCatalogPelletSizes,
  normalizePelletSizeOptions,
} from '../pelletSizeOptions';

describe('pelletSizeOptions', () => {
  it('fournit des replis distincts pour le tilapia et le silure', () => {
    expect(getOfflineCatalogPelletSizes('tilapia')).toEqual([
      '1.35',
      '2',
      '3.5',
      '4',
    ]);
    expect(getOfflineCatalogPelletSizes('clarias')).toEqual([
      '2',
      '3.5',
      '4',
      '6',
      '9',
    ]);
  });

  it('normalise, trie et déduplique les granulométries reçues', () => {
    expect(
      normalizePelletSizeOptions(['4.00', '2', '3,5', '2.00', '', null]),
    ).toEqual(['2', '3.5', '4']);
  });
});
