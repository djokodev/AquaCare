import { configureStore } from '@reduxjs/toolkit';
import aquacultureReducer, {
  ABORTED_UNAUTHENTICATED,
  addCreatedProductionCycle,
  clearError,
  setCurrentCycle,
  clearCurrentCycle,
  setCurrentCycleById,
  resetAquacultureState,
  updateProductionCycle,
  deleteProductionCycle,
  generateFeedingPlan,
  fetchDashboardData,
  fetchFeedingPlans,
  harvestCycle,
  synchronizeData,
} from '../aquacultureSlice';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { AquacultureState, ProductionCycle, SyncResponse } from '@/types/aquaculture';
import { logoutUser } from '@/features/auth/store/authSlice';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getDashboardData: jest.fn(),
    getProductionCycles: jest.fn(),
    getProductionCycle: jest.fn(),
    createProductionCycle: jest.fn(),
    updateProductionCycle: jest.fn(),
    deleteProductionCycle: jest.fn(),
    harvestCycle: jest.fn(),
    getCycleLogs: jest.fn(),
    createCycleLog: jest.fn(),
    updateCycleLog: jest.fn(),
    deleteCycleLog: jest.fn(),
    getFeedingPlans: jest.fn(),
    generateFeedingPlan: jest.fn(),
    getSanitaryLogs: jest.fn(),
    createSanitaryLog: jest.fn(),
    resolveSanitaryIssue: jest.fn(),
  },
}));

jest.mock('@/services/offlineService', () => ({
  offlineService: {
    syncAllOfflineData: jest.fn(),
  },
}));

describe('features/aquaculture/store/aquacultureSlice', () => {
  const mockService = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const mockOfflineService = offlineService as jest.Mocked<typeof offlineService>;

  const activeCycle: ProductionCycle = {
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
    current_count: 900,
    current_average_weight: 100,
    current_biomass: 90,
    total_feed_consumed: 120,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  // Reducer auth minimal pour satisfaire le pre-flight check de fetchDashboardData.
  // Defaut: isAuthenticated=true pour que les tests existants restent equivalents.
  const authReducer = (state = { isAuthenticated: true }) => state;

  const createStore = (
    preloadedState?: Partial<AquacultureState>,
    authState: { isAuthenticated: boolean } = { isAuthenticated: true }
  ) => {
    const initial = aquacultureReducer(undefined, { type: '@@INIT' }) as AquacultureState;
    return configureStore({
      reducer: { aquaculture: aquacultureReducer, auth: authReducer },
      preloadedState: {
        aquaculture: {
          ...initial,
          ...preloadedState,
        },
        auth: authState,
      },
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockOfflineService.syncAllOfflineData.mockResolvedValue({
      success: 0,
      failed: 0,
      details: {
        cycleLogs: { success: 0, failed: 0 },
        newCycles: { success: 0, failed: 0 },
        sanitaryLogs: { success: 0, failed: 0 },
      },
    });
  });

  it('clearError efface l\'erreur', () => {
    const state = {
      ...(aquacultureReducer(undefined, { type: '@@INIT' }) as AquacultureState),
      error: 'Erreur test',
    };

    const nextState = aquacultureReducer(state, clearError());

    expect(nextState.error).toBeNull();
  });

  it('setCurrentCycle met a jour le cycle courant', () => {
    const state = aquacultureReducer(undefined, setCurrentCycle(activeCycle));
    expect(state.currentCycle?.id).toBe('cycle-1');
  });

  it('setCurrentCycleById selectionne un cycle existant et clearCurrentCycle reinitialise', () => {
    const initialState: AquacultureState = {
      ...(aquacultureReducer(undefined, { type: '@@INIT' }) as AquacultureState),
      activeCycles: [activeCycle],
      cycles: [activeCycle],
    };

    const selected = aquacultureReducer(initialState, setCurrentCycleById(activeCycle.id));
    expect(selected.currentCycle?.id).toBe(activeCycle.id);

    const cleared = aquacultureReducer(selected, clearCurrentCycle());
    expect(cleared.currentCycle).toBeUndefined();
  });

  it('addCreatedProductionCycle ajoute le cycle en tete des listes locales', () => {
    const newCycle: ProductionCycle = {
      ...activeCycle,
      id: 'cycle-new',
      cycle_name: 'Cycle B',
    };

    const initialState: AquacultureState = {
      ...(aquacultureReducer(undefined, { type: '@@INIT' }) as AquacultureState),
      cycles: [activeCycle],
      activeCycles: [activeCycle],
    };

    const nextState = aquacultureReducer(initialState, addCreatedProductionCycle(newCycle));

    expect(nextState.cycles[0].id).toBe('cycle-new');
    expect(nextState.activeCycles[0].id).toBe('cycle-new');
  });

  it('resetAquacultureState restaure un etat propre', () => {
    const state = aquacultureReducer(undefined, resetAquacultureState());
    expect(state.cycles).toHaveLength(0);
    expect(state.error).toBeNull();
  });

  it('harvestCycle.fulfilled retire le cycle des actifs et met a jour le cycle courant', () => {
    const initialState: AquacultureState = {
      ...(aquacultureReducer(undefined, { type: '@@INIT' }) as AquacultureState),
      cycles: [activeCycle],
      activeCycles: [activeCycle],
      currentCycle: activeCycle,
    };

    const harvestedCycle: ProductionCycle = { ...activeCycle, status: 'harvested', end_date: '2026-05-01' };

    const action = harvestCycle.fulfilled(
      {
        message: 'Cycle recolte avec succes',
        cycle: harvestedCycle,
      },
      'request-id',
      {
        id: 'cycle-1',
        harvestData: {
          harvest_date: '2026-05-01',
          final_count: 850,
          final_average_weight: 250,
          total_harvested_weight: 212.5,
        },
      }
    );

    const nextState = aquacultureReducer(initialState, action);

    expect(nextState.cycles[0].status).toBe('harvested');
    expect(nextState.activeCycles).toHaveLength(0);
    expect(nextState.currentCycle?.status).toBe('harvested');
  });

  it('updateProductionCycle.fulfilled retire un cycle des actifs si son statut change', () => {
    const initialState: AquacultureState = {
      ...(aquacultureReducer(undefined, { type: '@@INIT' }) as AquacultureState),
      cycles: [activeCycle],
      activeCycles: [activeCycle],
      currentCycle: activeCycle,
    };

    const updatedCycle: ProductionCycle = { ...activeCycle, status: 'harvested' };

    const action = updateProductionCycle.fulfilled(
      updatedCycle,
      'request-id',
      { id: activeCycle.id, data: { status: 'harvested' } }
    );
    const nextState = aquacultureReducer(initialState, action);

    expect(nextState.activeCycles).toHaveLength(0);
    expect(nextState.currentCycle?.status).toBe('harvested');
  });

  it('deleteProductionCycle.fulfilled supprime le cycle et nettoie currentCycle', () => {
    const initialState: AquacultureState = {
      ...(aquacultureReducer(undefined, { type: '@@INIT' }) as AquacultureState),
      cycles: [activeCycle],
      activeCycles: [activeCycle],
      currentCycle: activeCycle,
    };

    const action = deleteProductionCycle.fulfilled(activeCycle.id, 'request-id', activeCycle.id);
    const nextState = aquacultureReducer(initialState, action);

    expect(nextState.cycles).toHaveLength(0);
    expect(nextState.activeCycles).toHaveLength(0);
    expect(nextState.currentCycle).toBeUndefined();
  });

  it('logoutUser.fulfilled remet le state aquaculture a son etat initial', () => {
    const initial = aquacultureReducer(undefined, { type: '@@INIT' }) as AquacultureState;
    const dirtyState: AquacultureState = {
      ...initial,
      currentCycle: activeCycle,
      cycles: [activeCycle],
      activeCycles: [activeCycle],
      dashboardData: { active_cycles: [activeCycle] } as any,
      loading: { ...initial.loading, dashboard: true },
      error: 'old-error',
    };

    const nextState = aquacultureReducer(
      dirtyState,
      logoutUser.fulfilled(true, 'request-id', undefined)
    );

    expect(nextState).toEqual(initial);
  });

  it('logoutUser.rejected remet egalement le state aquaculture a son etat initial', () => {
    const initial = aquacultureReducer(undefined, { type: '@@INIT' }) as AquacultureState;
    const dirtyState: AquacultureState = {
      ...initial,
      currentCycle: activeCycle,
      loading: { ...initial.loading, dashboard: true },
    };

    const nextState = aquacultureReducer(
      dirtyState,
      logoutUser.rejected(new Error('boom'), 'request-id', undefined, 'boom')
    );

    expect(nextState).toEqual(initial);
  });

  it('generateFeedingPlan.fulfilled met a jour un plan existant et ajoute un nouveau', () => {
    const existingPlan = {
      id: 'plan-1',
      cycle: 'cycle-1',
      week_number: 1,
      estimated_fish_count: 100,
      average_weight: 40,
      biomass: 4,
      daily_feed_amount: 0.2,
      feeding_rate: 5,
      meals_per_day: 2,
      feed_per_meal: 0.1,
      recommended_feed: 'initial',
      protein_percentage: 30,
      start_date: '2026-01-01',
      end_date: '2026-01-07',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    };

    const initialState: AquacultureState = {
      ...(aquacultureReducer(undefined, { type: '@@INIT' }) as AquacultureState),
      feedingPlans: [existingPlan],
    };

    const action = generateFeedingPlan.fulfilled(
      [
        { ...existingPlan, recommended_feed: 'updated' },
        { ...existingPlan, id: 'plan-2', week_number: 2, recommended_feed: 'new' },
      ],
      'request-id',
      { cycleId: 'cycle-1' }
    );

    const nextState = aquacultureReducer(initialState, action);
    expect(nextState.feedingPlans).toHaveLength(2);
    expect(nextState.feedingPlans.find((plan) => plan.id === 'plan-1')?.recommended_feed).toBe('updated');
    expect(nextState.feedingPlans.some((plan) => plan.id === 'plan-2')).toBe(true);
  });

  it('synchronizeData.fulfilled merge les updates serveur en succes', () => {
    const initialState: AquacultureState = {
      ...(aquacultureReducer(undefined, { type: '@@INIT' }) as AquacultureState),
      cycles: [{ ...activeCycle, id: 'existing-cycle' }],
      cycleLogs: [{ id: 'existing-log', cycle: 'existing-cycle', log_date: '2026-01-01', created_offline: false, created_at: '2026-01-01T00:00:00Z' }],
      feedingPlans: [{
        id: 'existing-plan',
        cycle: 'existing-cycle',
        week_number: 1,
        estimated_fish_count: 100,
        average_weight: 40,
        biomass: 4,
        daily_feed_amount: 0.2,
        feeding_rate: 5,
        meals_per_day: 2,
        feed_per_meal: 0.1,
        recommended_feed: 'test',
        protein_percentage: 30,
        start_date: '2026-01-01',
        end_date: '2026-01-07',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      }],
      sanitaryLogs: [{ id: 'existing-san', cycle: 'existing-cycle', event_date: '2026-01-01', event_type: 'other', symptoms: 'ok', resolved: false, created_at: '2026-01-01T00:00:00Z', created_offline: false }],
    };

    const response: SyncResponse = {
      status: 'success',
      timestamp: '2026-02-19T12:00:00Z',
      processed: {
        cycles: 1,
        cycle_logs: 1,
        sanitary_logs: 1,
      },
      errors: [],
      server_updates: {
        cycles: [{ ...activeCycle, id: 'server-cycle' }],
        cycle_logs: [{ id: 'server-log', cycle: 'server-cycle', log_date: '2026-02-01', created_offline: false, created_at: '2026-02-01T00:00:00Z' }],
        feeding_plans: [{
          id: 'server-plan',
          cycle: 'server-cycle',
          week_number: 1,
          estimated_fish_count: 100,
          average_weight: 40,
          biomass: 4,
          daily_feed_amount: 0.2,
          feeding_rate: 5,
          meals_per_day: 2,
          feed_per_meal: 0.1,
          recommended_feed: 'test',
          protein_percentage: 30,
          start_date: '2026-02-01',
          end_date: '2026-02-07',
          is_active: true,
          created_at: '2026-02-01T00:00:00Z',
        }],
        sanitary_logs: [{ id: 'server-san', cycle: 'server-cycle', event_date: '2026-02-01', event_type: 'other', symptoms: 'ok', resolved: false, created_at: '2026-02-01T00:00:00Z', created_offline: false }],
      },
    };

    const action = synchronizeData.fulfilled(response, 'request-id', undefined);
    const nextState = aquacultureReducer(initialState, action);

    expect(nextState.cycles.some((cycle) => cycle.id === 'server-cycle')).toBe(true);
    expect(nextState.cycleLogs.some((log) => log.id === 'server-log')).toBe(true);
    expect(nextState.feedingPlans.some((plan) => plan.id === 'server-plan')).toBe(true);
    expect(nextState.sanitaryLogs.some((log) => log.id === 'server-san')).toBe(true);
  });

  it('fetchFeedingPlans rejette si cycleId absent', async () => {
    const store = createStore();

    const action = await store.dispatch(fetchFeedingPlans(undefined));

    expect(action.type).toBe('aquaculture/fetchFeedingPlans/rejected');
    expect(action.payload).toBe('ID de cycle requis');
    expect(mockService.getFeedingPlans).not.toHaveBeenCalled();
  });

  it('fetchDashboardData rejette silencieusement quand isAuthenticated est false', async () => {
    const store = createStore(undefined, { isAuthenticated: false });

    const action = await store.dispatch(fetchDashboardData(undefined));

    expect(action.type).toBe('aquaculture/fetchDashboardData/rejected');
    expect(action.payload).toBe(ABORTED_UNAUTHENTICATED);
    expect(mockService.getDashboardData).not.toHaveBeenCalled();
    expect(store.getState().aquaculture.error).toBeNull();
  });

  it('fetchDashboardData propage detail depuis erreur API', async () => {
    const store = createStore();
    mockService.getDashboardData.mockRejectedValueOnce({ response: { data: { detail: 'Dashboard indisponible' } } });

    const action = await store.dispatch(fetchDashboardData(undefined));

    expect(action.type).toBe('aquaculture/fetchDashboardData/rejected');
    expect(action.payload).toBe('Dashboard indisponible');
  });

  it('fetchDashboardData utilise le cycle de session courant par defaut', async () => {
    const store = createStore({ currentCycle: activeCycle });
    mockService.getDashboardData.mockResolvedValueOnce({
      active_cycles: [],
    } as any);

    await store.dispatch(fetchDashboardData(undefined));

    expect(mockService.getDashboardData).toHaveBeenCalledWith(activeCycle.id, {
      lightweight: false,
    });
  });

  it('fetchDashboardData forceAllCycles ignore le cycle de session', async () => {
    const store = createStore({ currentCycle: activeCycle });
    mockService.getDashboardData.mockResolvedValueOnce({
      active_cycles: [],
    } as any);

    await store.dispatch(fetchDashboardData({ forceAllCycles: true }));

    expect(mockService.getDashboardData).toHaveBeenCalledWith(undefined, {
      lightweight: false,
    });
  });

  it('fetchDashboardData propage le mode lightweight au service', async () => {
    const store = createStore();
    mockService.getDashboardData.mockResolvedValueOnce({
      active_cycles: [],
    } as any);

    await store.dispatch(fetchDashboardData({ lightweight: true }));

    expect(mockService.getDashboardData).toHaveBeenCalledWith(undefined, {
      lightweight: true,
    });
  });

  it('fetchDashboardData utilise la chaine brute de l\'API si disponible', async () => {
    const store = createStore();
    mockService.getDashboardData.mockRejectedValueOnce({ response: { data: 'Service indisponible' } });

    const action = await store.dispatch(fetchDashboardData(undefined));

    expect(action.type).toBe('aquaculture/fetchDashboardData/rejected');
    expect(action.payload).toBe('Service indisponible');
  });

  it('fetchDashboardData fallback sur error.message puis message par defaut', async () => {
    const store = createStore();
    mockService.getDashboardData.mockRejectedValueOnce({ message: 'Erreur réseau temporaire' });
    const withMessage = await store.dispatch(fetchDashboardData(undefined));

    expect(withMessage.payload).toBe('Erreur réseau temporaire');

    mockService.getDashboardData.mockRejectedValueOnce(null);
    const fallback = await store.dispatch(fetchDashboardData(undefined));
    expect(fallback.payload).toBe('Erreur lors du chargement du dashboard');
  });

  it('synchronizeData utilise offlineService et met a jour le store', async () => {
    const store = createStore();
    mockOfflineService.syncAllOfflineData.mockResolvedValueOnce({
      success: 3,
      failed: 0,
      details: {
        cycleLogs: { success: 1, failed: 0 },
        newCycles: { success: 1, failed: 0 },
        sanitaryLogs: { success: 1, failed: 0 },
      },
    });

    const action = await store.dispatch(synchronizeData());

    expect(action.type).toBe('aquaculture/synchronizeData/fulfilled');
    expect(mockOfflineService.syncAllOfflineData).toHaveBeenCalled();

    const state = store.getState().aquaculture;
    expect(state.loading.sync).toBe(false);
  });

  it('synchronizeData.rejected remonte l\'erreur et coupe loading.sync', async () => {
    const store = createStore();
    mockOfflineService.syncAllOfflineData.mockRejectedValueOnce({ response: { data: { message: 'Sync impossible' } } });

    await store.dispatch(synchronizeData());

    const state = store.getState().aquaculture;
    expect(state.loading.sync).toBe(false);
    expect(state.error).toBe('Sync impossible');
  });
});
