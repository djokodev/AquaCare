import { aquacultureService } from '../aquacultureService';
import { apiService } from '@/services/api';
import { API_CONFIG } from '@/constants/api';
import logger from '@/utils/logger';
import {
  CycleHarvestResponse,
  CycleLog,
  ProductionCycle,
  SanitaryLogForm,
} from '@/types/aquaculture';

jest.mock('@/services/api', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
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

  it('compose correctement l URL dashboard avec ou sans cycle de session', async () => {
    mockApi.get.mockResolvedValue({ data: { active_cycles: [] } } as never);

    await aquacultureService.getDashboardData();
    await aquacultureService.getDashboardData('cycle-session-1');
    await aquacultureService.getDashboardData('cycle-session-1', { lightweight: true });

    expect(mockApi.get).toHaveBeenNthCalledWith(1, '/aquaculture/dashboard/');
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/aquaculture/dashboard/?cycle_id=cycle-session-1');
    expect(mockApi.get).toHaveBeenNthCalledWith(
      3,
      '/aquaculture/dashboard/?cycle_id=cycle-session-1&lightweight=true'
    );
  });

  it('dedoublonne les requetes dashboard concurrentes pour le meme scope et meme mode', async () => {
    const payload = { active_cycles: [], active_cycles_count: 0 };
    mockApi.get.mockReturnValueOnce(Promise.resolve({ data: payload }) as never);

    const firstPromise = aquacultureService.getDashboardData('cycle-session-42');
    const secondPromise = aquacultureService.getDashboardData('cycle-session-42');

    expect(mockApi.get).toHaveBeenCalledTimes(1);
    await expect(firstPromise).resolves.toEqual(payload);
    await expect(secondPromise).resolves.toEqual(payload);
  });

  it('ne dedoublonne pas entre mode full et lightweight', async () => {
    const payload = { active_cycles: [], active_cycles_count: 0 };
    mockApi.get.mockResolvedValue({ data: payload } as never);

    await aquacultureService.getDashboardData('cycle-session-42');
    await aquacultureService.getDashboardData('cycle-session-42', { lightweight: true });

    expect(mockApi.get).toHaveBeenCalledTimes(2);
  });

  it('utilise PATCH pour la mise a jour partielle d un cycle', async () => {
    mockApi.patch = jest.fn().mockResolvedValueOnce({ data: cycle } as never);

    const result = await aquacultureService.patchProductionCycle('cycle-1', {
      planned_cycle_duration_days: 140,
      planned_selling_price_per_kg_fcfa: 2600,
    } as any);

    expect(result).toEqual(cycle);
    expect(mockApi.patch).toHaveBeenCalledWith('/aquaculture/cycles/cycle-1/', {
      planned_cycle_duration_days: 140,
      planned_selling_price_per_kg_fcfa: 2600,
    });
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

  it('retourne la vraie forme API de recolte avec message et cycle', async () => {
    const harvestResponse: CycleHarvestResponse = {
      message: 'Cycle recolte avec succes',
      cycle: { ...cycle, status: 'harvested', end_date: '2026-05-01' },
    };
    mockApi.post.mockResolvedValueOnce({ data: harvestResponse } as never);

    const result = await aquacultureService.harvestCycle('cycle-1', {
      harvest_date: '2026-05-01',
      final_count: 850,
      final_average_weight: 250,
    });

    expect(result).toEqual(harvestResponse);
    expect(mockApi.post).toHaveBeenCalledWith('/aquaculture/cycles/cycle-1/harvest/', {
      harvest_date: '2026-05-01',
      final_count: 850,
      final_average_weight: 250,
    });
  });

  it('cree une unite de production avec le bon payload', async () => {
    const createdUnit = {
      id: 'unit-1',
      farm_profile: 'farm-1',
      name: 'Bac 1',
      unit_type: 'tank',
      volume_m3: 3,
      surface_m2: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApi.post.mockResolvedValueOnce({ data: createdUnit } as never);

    const result = await aquacultureService.createProductionUnit({
      name: 'Bac 1',
      unit_type: 'tank',
      volume_m3: 3,
      status: 'active',
    });

    expect(result).toEqual(createdUnit);
    expect(mockApi.post).toHaveBeenCalledWith('/aquaculture/production-units/', {
      name: 'Bac 1',
      unit_type: 'tank',
      volume_m3: 3,
      status: 'active',
    });
  });

  it('cree une allocation de cycle avec le bon payload', async () => {
    const createdAllocation = {
      id: 'allocation-1',
      cycle: 'cycle-1',
      production_unit: 'unit-1',
      initial_fish_count: 900,
      current_fish_count: 900,
      initial_biomass_kg: 0,
      current_biomass_kg: 0,
      expected_survival_rate_pct: 95,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApi.post.mockResolvedValueOnce({ data: createdAllocation } as never);

    const result = await aquacultureService.createCycleUnitAllocation({
      cycle: 'cycle-1',
      production_unit: 'unit-1',
      initial_fish_count: 900,
      current_fish_count: 900,
      expected_survival_rate_pct: 95,
    });

    expect(result).toEqual(createdAllocation);
    expect(mockApi.post).toHaveBeenCalledWith('/aquaculture/cycle-unit-allocations/', {
      cycle: 'cycle-1',
      production_unit: 'unit-1',
      initial_fish_count: 900,
      current_fish_count: 900,
      expected_survival_rate_pct: 95,
    });
  });

  it('charge les allocations de cycle avec le filtre cycle_id', async () => {
    const allocation = {
      id: 'allocation-1',
      cycle: 'cycle-1',
      production_unit: 'unit-1',
      initial_fish_count: 900,
      current_fish_count: 900,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApi.get.mockResolvedValueOnce({ data: { results: [allocation] } } as never);

    const result = await aquacultureService.getCycleUnitAllocations('cycle-1');

    expect(result).toEqual([allocation]);
    expect(mockApi.get).toHaveBeenCalledWith('/aquaculture/cycle-unit-allocations/?cycle_id=cycle-1');
  });

  it('charge le dashboard d une allocation via le bon endpoint', async () => {
    const dashboard = {
      allocation: {
        id: 'allocation-1',
        cycle: 'cycle-1',
        production_unit: 'unit-1',
      },
      summary: {
        estimated_current_fish_count: 892,
        total_mortality_count: 8,
        mortality_rate_pct: '0.89',
        total_feed_consumed_kg: '6.50',
        latest_average_weight_g: '20.00',
        estimated_current_biomass_kg: '17.84',
        last_daily_log_date: '2026-06-28',
        days_since_last_log: 0,
        has_today_daily_log: true,
        active_sanitary_issues_count: 1,
        last_sanitary_event_date: '2026-06-27',
        has_unresolved_sanitary_issue: true,
      },
      recent_daily_logs: [],
      recent_sanitary_logs: [],
    };
    mockApi.get.mockResolvedValueOnce({ data: dashboard } as never);

    const result = await aquacultureService.getProductionUnitDashboard('allocation-1');

    expect(result).toEqual(dashboard);
    expect(mockApi.get).toHaveBeenCalledWith('/aquaculture/cycle-unit-allocations/allocation-1/dashboard/');
  });

  it('retourne les rapports depuis une reponse paginee avec filtres', async () => {
    const report = { id: 'report-1', report_type: 'daily' };
    mockApi.get.mockResolvedValueOnce({ data: { results: [report] } } as never);

    const result = await aquacultureService.getReports({
      report_type: 'daily',
      status: 'draft',
    });

    expect(result).toEqual([report]);
    expect(mockApi.get).toHaveBeenCalledWith('/aquaculture/reports/?report_type=daily&status=draft');
  });

  it('ajoute cycle_id dans le filtre des rapports quand fourni', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { results: [] } } as never);

    await aquacultureService.getReports({ cycle_id: 'cycle-session-1' });

    expect(mockApi.get).toHaveBeenCalledWith('/aquaculture/reports/?cycle_id=cycle-session-1');
  });

  it('appelle les endpoints de rapport (generate, validate, send, whatsapp)', async () => {
    const reportPayload = { id: 'report-1', status: 'draft' };
    mockApi.post.mockResolvedValue({ data: reportPayload } as never);

    await aquacultureService.generateReport({ report_type: 'weekly' });
    await aquacultureService.validateReport('report-1');
    await aquacultureService.sendReportEmail('report-1');
    await aquacultureService.markReportWhatsAppShared('report-1', {
      recipient: '+237690000000',
      metadata: { source: 'test' },
    });

    expect(mockApi.post).toHaveBeenNthCalledWith(
      1,
      '/aquaculture/reports/generate/',
      { report_type: 'weekly' }
    );
    expect(mockApi.post).toHaveBeenNthCalledWith(2, '/aquaculture/reports/report-1/validate/');
    expect(mockApi.post).toHaveBeenNthCalledWith(3, '/aquaculture/reports/report-1/send-email/');
    expect(mockApi.post).toHaveBeenNthCalledWith(
      4,
      '/aquaculture/reports/report-1/mark-whatsapp-shared/',
      {
        recipient: '+237690000000',
        metadata: { source: 'test' },
      }
    );
  });

  it('compose correctement l URL de telechargement PDF', () => {
    const url = aquacultureService.getReportDownloadUrl('report-42');
    expect(url).toBe(`${API_CONFIG.baseURL}/aquaculture/reports/report-42/download/`);
  });

  it('retourne les recoltes partielles depuis une reponse paginee', async () => {
    const partialHarvest = {
      id: 'ph-1',
      harvest_date: '2026-02-10',
      count_harvested: 40,
      average_weight_g: 320,
      total_weight_kg: 12.8,
      created_at: '2026-02-10T08:00:00Z',
    };
    mockApi.get.mockResolvedValueOnce({ data: { count: 1, results: [partialHarvest] } } as never);

    const result = await aquacultureService.getPartialHarvests('cycle-1');

    expect(result).toEqual([partialHarvest]);
    expect(mockApi.get).toHaveBeenCalledWith('/aquaculture/cycles/cycle-1/partial-harvests/');
  });

  it('compose correctement l\'URL des cycle logs avec ou sans cycleId', async () => {
    mockApi.get.mockResolvedValue({ data: [] } as never);

    await aquacultureService.getCycleLogs();
    await aquacultureService.getCycleLogs('cycle-1');
    await aquacultureService.getCycleLogs('cycle-1', { cycleUnitAllocationId: 'allocation-1' });

    expect(mockApi.get).toHaveBeenNthCalledWith(1, '/aquaculture/cycle-logs/');
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/aquaculture/cycle-logs/?cycle_id=cycle-1');
    expect(mockApi.get).toHaveBeenNthCalledWith(
      3,
      '/aquaculture/cycle-logs/?cycle_id=cycle-1&cycle_unit_allocation=allocation-1'
    );
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

  it('ajoute cycle_unit_allocation lors de la creation d\'un cycle log unitaire', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'log-unit' } } as never);

    await aquacultureService.createCycleLog('cycle-1', {
      log_date: '2026-01-10',
      mortality_count: 2,
      cycle_unit_allocation: 'allocation-1',
    });

    expect(mockApi.post).toHaveBeenCalledWith(
      '/aquaculture/cycle-logs/',
      expect.objectContaining({
        cycle: 'cycle-1',
        cycle_unit_allocation: 'allocation-1',
        client_uuid: expect.any(String),
      })
    );
  });

  it('preserve le client_uuid fourni pour un retry de cycle log offline', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'log-retry' } } as never);

    await aquacultureService.createCycleLog('cycle-1', {
      log_date: '2026-01-10',
      mortality_count: 2,
      client_uuid: 'retry-uuid-1',
      created_offline: true,
    });

    expect(mockApi.post).toHaveBeenCalledWith(
      '/aquaculture/cycle-logs/',
      expect.objectContaining({
        client_uuid: 'retry-uuid-1',
        created_offline: true,
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
    expect(mockFormData.append).toHaveBeenCalledWith('client_uuid', expect.any(String));
    expect(mockFormData.append).toHaveBeenCalledWith('created_offline', 'false');
    expect(mockFormData.append).toHaveBeenCalledWith('event_type', 'disease');
    expect(mockFormData.append).toHaveBeenCalledWith('photo', payload.photo);
  });

  it('ajoute cycle_unit_allocation dans le FormData sanitaire', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'san-unit' } } as never);

    await aquacultureService.createSanitaryLog('cycle-1', {
      event_date: '2026-01-10',
      event_type: 'treatment',
      symptoms: 'Poissons observes avec lesions legeres',
      cycle_unit_allocation: 'allocation-1',
    });

    const [, formDataArg] = mockApi.post.mock.calls[0];
    const mockFormData = formDataArg as unknown as MockFormData;
    expect(mockFormData.append).toHaveBeenCalledWith('cycle_unit_allocation', 'allocation-1');
  });

  it('preserve les metadonnees offline dans le FormData sanitaire', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'san-offline' } } as never);

    await aquacultureService.createSanitaryLog('cycle-1', {
      event_date: '2026-01-10',
      event_type: 'treatment',
      symptoms: 'Poissons observes avec lesions legeres',
      client_uuid: 'sanitary-retry-uuid',
      created_offline: true,
    });

    const [, formDataArg] = mockApi.post.mock.calls[0];
    const mockFormData = formDataArg as unknown as MockFormData;
    expect(mockFormData.append).toHaveBeenCalledWith('client_uuid', 'sanitary-retry-uuid');
    expect(mockFormData.append).toHaveBeenCalledWith('created_offline', 'true');
  });

  it('compose correctement l\'URL des logs sanitaires avec filtre allocation', async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] } as never);

    await aquacultureService.getSanitaryLogs('cycle-1', {
      cycleUnitAllocationId: 'allocation-1',
    });

    expect(mockApi.get).toHaveBeenCalledWith(
      '/aquaculture/sanitary-logs/?cycle_id=cycle-1&cycle_unit_allocation=allocation-1'
    );
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

  it('propage les erreurs des phases aliments au lieu de retourner une liste vide', async () => {
    const error = new Error('feed phases failed');
    mockApi.get.mockRejectedValueOnce(error);

    await expect(aquacultureService.getCycleFeedPhases('cycle-1')).rejects.toThrow('feed phases failed');
    expect(mockLogger.error).toHaveBeenCalledWith('Erreur lors du chargement des phases aliments:', error);
  });

  it('rethrow les erreurs API et les log', async () => {
    const error = new Error('boom');
    mockApi.get.mockRejectedValueOnce(error);

    await expect(aquacultureService.getDashboardData()).rejects.toThrow('boom');
    expect(mockLogger.error).toHaveBeenCalledWith('Erreur lors de la recuperation du dashboard:', error);
  });
});
