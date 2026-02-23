import { aquacultureService } from '../aquacultureService';
import { apiService } from '@/services/api';
import logger from '@/utils/logger';
import { CycleLog, ProductionCycle, SanitaryLogForm } from '@/types/aquaculture';

jest.mock('@/services/api', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

class MockFormData {
  append = jest.fn();
}

describe('features/aquaculture/services/aquacultureService', () => {
  const mockApi = apiService as jest.Mocked<typeof apiService>;
  const mockLogger = logger as jest.Mocked<typeof logger>;
  const globalAny = global as any;

  const cycle: ProductionCycle = {
    id: 'cycle-1',
    farm_profile: 'farm-1',
    cycle_name: 'Cycle A',
    species: 'tilapia',
    pond_identifier: 'P1',
    pond_surface_m2: 100,
    start_date: '2026-01-01',
    initial_count: 1000,
    initial_average_weight: 10,
    initial_biomass: 10,
    current_count: 950,
    current_average_weight: 100,
    current_biomass: 95,
    total_feed_consumed: 120,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  let originalFormData: unknown;
  let originalFile: unknown;

  beforeAll(() => {
    originalFormData = globalAny.FormData;
    globalAny.FormData = MockFormData;

    originalFile = globalAny.File;
    if (typeof globalAny.File === 'undefined') {
      globalAny.File = class MockFile {};
    }
  });

  afterAll(() => {
    globalAny.FormData = originalFormData;
    if (originalFile === undefined) {
      delete globalAny.File;
    } else {
      globalAny.File = originalFile;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retourne les cycles depuis une reponse paginee', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { results: [cycle] } } as never);

    const result = await aquacultureService.getProductionCycles();

    expect(result).toEqual([cycle]);
    expect(mockApi.get).toHaveBeenCalledWith('/aquaculture/cycles/');
  });

  it('retourne une liste vide si les cycles n\'ont pas de champ results', async () => {
    mockApi.get.mockResolvedValueOnce({ data: {} } as never);

    const result = await aquacultureService.getProductionCycles();

    expect(result).toEqual([]);
  });

  it('retourne les plans d\'alimentation depuis une liste simple', async () => {
    const plan = { id: 'plan-1', cycle: 'cycle-1' };
    mockApi.get.mockResolvedValueOnce({ data: [plan] } as never);

    const result = await aquacultureService.getFeedingPlans('cycle-1');

    expect(result).toEqual([plan]);
    expect(mockApi.get).toHaveBeenCalledWith('/aquaculture/feeding-plans/?cycle=cycle-1');
  });

  it('compose correctement l\'URL des cycle logs avec ou sans cycleId', async () => {
    mockApi.get.mockResolvedValue({ data: [] } as never);

    await aquacultureService.getCycleLogs();
    await aquacultureService.getCycleLogs('cycle-1');

    expect(mockApi.get).toHaveBeenNthCalledWith(1, '/aquaculture/cycle-logs/');
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/aquaculture/cycle-logs/?cycle_id=cycle-1');
  });

  it('ajoute cycle et client_uuid lors de la creation d\'un cycle log', async () => {
    const log: CycleLog = {
      id: 'log-1',
      cycle: 'cycle-1',
      log_date: '2026-01-10',
      created_offline: false,
      created_at: '2026-01-10T00:00:00Z',
    };

    mockApi.post.mockResolvedValueOnce({ data: log } as never);

    await aquacultureService.createCycleLog('cycle-1', { log_date: '2026-01-10', mortality_count: 2 });

    expect(mockApi.post).toHaveBeenCalledWith(
      '/aquaculture/cycle-logs/',
      expect.objectContaining({
        cycle: 'cycle-1',
        mortality_count: 2,
        client_uuid: expect.any(String),
      })
    );
  });

  it('construit correctement un FormData pour un sanitary log avec photo RN', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'san-1' } } as never);

    const payload: SanitaryLogForm = {
      event_date: '2026-01-10',
      event_type: 'disease',
      symptoms: 'stress',
      affected_count: 4,
      treatment_applied: 'salt',
      treatment_duration_days: 3,
      notes: 'note',
      photo: {
        uri: 'file:///tmp/image.jpg',
        type: 'image/jpeg',
        name: 'image.jpg',
      },
    };

    await aquacultureService.createSanitaryLog('cycle-1', payload);

    expect(mockApi.post).toHaveBeenCalledTimes(1);
    const [url, formDataArg, config] = mockApi.post.mock.calls[0];

    expect(url).toBe('/aquaculture/sanitary-logs/');
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });

    const mockFormData = formDataArg as unknown as MockFormData;
    expect(mockFormData.append).toHaveBeenCalledWith('cycle', 'cycle-1');
    expect(mockFormData.append).toHaveBeenCalledWith('event_type', 'disease');
    expect(mockFormData.append).toHaveBeenCalledWith('photo', payload.photo);
  });

  it('preserve les accents et convertit les champs numeriques en texte dans le FormData', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'san-accents' } } as never);

    await aquacultureService.createSanitaryLog('cycle-1', {
      event_date: '2026-01-10',
      event_type: 'treatment',
      symptoms: 'Poissons affaiblis et décolorés',
      notes: 'Traitement appliqué: désinfection légère',
      affected_count: 12,
      treatment_duration_days: 5,
    });

    const [, formDataArg] = mockApi.post.mock.calls[0];
    const mockFormData = formDataArg as unknown as MockFormData;

    expect(mockFormData.append).toHaveBeenCalledWith('symptoms', 'Poissons affaiblis et décolorés');
    expect(mockFormData.append).toHaveBeenCalledWith('notes', 'Traitement appliqué: désinfection légère');
    expect(mockFormData.append).toHaveBeenCalledWith('affected_count', '12');
    expect(mockFormData.append).toHaveBeenCalledWith('treatment_duration_days', '5');
  });

  it('ajoute la photo lorsque le payload contient un objet File', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'san-file' } } as never);
    const file = new File(['binary'], 'photo.jpg', { type: 'image/jpeg' });

    await aquacultureService.createSanitaryLog('cycle-1', {
      event_date: '2026-01-10',
      event_type: 'other',
      symptoms: 'RAS',
      photo: file,
    });

    const [, formDataArg] = mockApi.post.mock.calls[0];
    const mockFormData = formDataArg as unknown as MockFormData;
    expect(mockFormData.append).toHaveBeenCalledWith('photo', file);
  });

  it('ignore un format de photo invalide et log un warning', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'san-2' } } as never);

    await aquacultureService.createSanitaryLog('cycle-1', {
      event_date: '2026-01-10',
      event_type: 'other',
      symptoms: 'none',
      photo: 'https://example.com/photo.jpg',
    });

    expect(mockLogger.warn).toHaveBeenCalledWith('Format photo non reconnu, photo ignoree.');

    const [, formDataArg] = mockApi.post.mock.calls[0];
    const mockFormData = formDataArg as unknown as MockFormData;
    expect(mockFormData.append).not.toHaveBeenCalledWith('photo', expect.anything());
  });

  it('trouve le guide correspondant au poids, ou fallback sur le dernier', async () => {
    mockApi.get.mockResolvedValueOnce({
      data: [
        { id: 'g2', species: 'tilapia', growth_stage: 'juvenile', min_weight: 50, max_weight: 120 },
        { id: 'g1', species: 'tilapia', growth_stage: 'alevin', min_weight: 1, max_weight: 49 },
      ],
    } as never);

    const match = await aquacultureService.findGuideForWeight('tilapia', 80);
    expect(match?.id).toBe('g2');

    mockApi.get.mockResolvedValueOnce({
      data: [
        { id: 'g3', species: 'tilapia', growth_stage: 'finition', min_weight: 120, max_weight: 180 },
      ],
    } as never);

    const fallback = await aquacultureService.findGuideForWeight('tilapia', 300);
    expect(fallback?.id).toBe('g3');
  });

  it('retourne null si aucun guide nutritionnel n\'est disponible', async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] } as never);

    const result = await aquacultureService.findGuideForWeight('tilapia', 50);
    expect(result).toBeNull();
  });

  it('prepareOfflineData ajoute les metadonnees minimales', () => {
    const prepared = aquacultureService.prepareOfflineData({ event: 'x' });

    expect(prepared.event).toBe('x');
    expect(prepared.created_offline).toBe(true);
    expect(typeof prepared.client_uuid).toBe('string');
    expect(prepared.client_uuid.length).toBeGreaterThan(10);
  });

  it('canSynchronize valide la presence de client_uuid', () => {
    expect(aquacultureService.canSynchronize([{ client_uuid: 'uuid-1' }, { client_uuid: 'uuid-2' }])).toBe(true);
    expect(aquacultureService.canSynchronize([{ client_uuid: 'uuid-1' }, {}])).toBe(false);
    expect(aquacultureService.canSynchronize([{ client_uuid: '' }, { client_uuid: 'uuid-2' }])).toBe(false);
    expect(aquacultureService.canSynchronize([{ client_uuid: 123 }])).toBe(false);
    expect(aquacultureService.canSynchronize([])).toBe(false);
  });

  it('rethrow les erreurs API et les log', async () => {
    const error = new Error('boom');
    mockApi.get.mockRejectedValueOnce(error);

    await expect(aquacultureService.getDashboardData()).rejects.toThrow('boom');
    expect(mockLogger.error).toHaveBeenCalledWith('Erreur lors de la recuperation du dashboard:', error);
  });
});
