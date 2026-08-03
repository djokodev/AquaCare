import type { FarmSetupSpecies } from './farmSetupForm';

const OFFLINE_CATALOG_PELLET_SIZES: Record<
  Exclude<FarmSetupSpecies, 'autre'>,
  readonly string[]
> = {
  tilapia: ['1.35', '2', '3.5', '4'],
  clarias: ['2', '3.5', '4', '6', '9'],
};

const normalizePelletSize = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const numericValue = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return String(numericValue);
};

export const getOfflineCatalogPelletSizes = (
  species: FarmSetupSpecies,
): string[] => {
  if (species !== 'tilapia' && species !== 'clarias') {
    return [];
  }

  return [...OFFLINE_CATALOG_PELLET_SIZES[species]];
};

export const normalizePelletSizeOptions = (
  values: Array<string | number | null | undefined>,
): string[] =>
  Array.from(
    new Set(
      values
        .map(normalizePelletSize)
        .filter((value): value is string => value !== null),
    ),
  ).sort((first, second) => Number(first) - Number(second));
