import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import NutritionalGuidesScreen from '../NutritionalGuidesScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { NutritionalGuide } from '@/types/aquaculture';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getAllNutritionalGuides: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

describe('features/aquaculture/screens/NutritionalGuidesScreen', () => {
  const mockService = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;

  const guides: NutritionalGuide[] = [
    {
      id: 'guide-tilapia',
      species: 'tilapia',
      growth_stage: 'juvenile',
      min_weight: 50,
      max_weight: 120,
      feeding_rate_percentage: 4,
      protein_requirement: 35,
      meals_per_day: 3,
      feed_size_mm: 2,
      recommended_products: ['Feed Tilapia Pro'],
      expected_fcr: 1.4,
      feeding_notes: 'Ration fractionnee',
    },
    {
      id: 'guide-clarias',
      species: 'clarias',
      growth_stage: 'finition',
      min_weight: 400,
      max_weight: 800,
      feeding_rate_percentage: 2,
      protein_requirement: 28,
      meals_per_day: 2,
      feed_size_mm: 6,
      recommended_products: ['Feed Clarias Max'],
      expected_fcr: 1.7,
      feeding_notes: 'Surveiller la temperature',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('charge et affiche les guides nutritionnels', async () => {
    mockService.getAllNutritionalGuides.mockResolvedValueOnce(guides);

    const { getByText } = render(<NutritionalGuidesScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('juvenile')).toBeTruthy();
      expect(getByText('finition')).toBeTruthy();
    });

    expect(mockService.getAllNutritionalGuides).toHaveBeenCalledTimes(1);
  });

  it('applique le filtre espece et la recherche texte', async () => {
    mockService.getAllNutritionalGuides.mockResolvedValueOnce(guides);

    const { getByText, getAllByText, getByPlaceholderText, queryByText } = render(
      <NutritionalGuidesScreen navigation={navigation} />
    );

    await waitFor(() => {
      expect(getByText('juvenile')).toBeTruthy();
    });

    fireEvent.press(getAllByText('clarias')[0]);

    await waitFor(() => {
      expect(queryByText('juvenile')).toBeNull();
      expect(getByText('finition')).toBeTruthy();
    });

    fireEvent.changeText(getByPlaceholderText('searchInGuides'), 'tilapia');
    await waitFor(() => {
      expect(getByText('noGuidesFound')).toBeTruthy();
    });
  });

  it('affiche une erreur puis permet de relancer via retry', async () => {
    mockService.getAllNutritionalGuides
      .mockRejectedValueOnce(new Error('Erreur API'))
      .mockResolvedValueOnce(guides);

    const { getByText } = render(<NutritionalGuidesScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('Erreur API')).toBeTruthy();
      expect(getByText('retry')).toBeTruthy();
    });

    fireEvent.press(getByText('retry'));

    await waitFor(() => {
      expect(getByText('juvenile')).toBeTruthy();
    });

    expect(mockService.getAllNutritionalGuides).toHaveBeenCalledTimes(2);
  });
});
