import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  AquacultureState,
  CycleFeedStatus,
  ProductionCycle,
  CycleLog,
  FeedingPlan,
  SanitaryLog,
  CreateCycleForm,
  DailyLogForm,
  SanitaryLogForm,
  HarvestData,
  SyncResponse,
  PartialHarvestData,
  PartialHarvest,
} from '@/types/aquaculture';
import { apiService } from '@/services/api';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { logoutUser } from '@/features/auth/store/authSlice';
import { getApiErrorMessage } from '@/utils/errorParser';

const extractErrorMessage = (error: unknown, fallback: string): string => {
  return getApiErrorMessage(error, fallback);
};

// =================== ETAT INITIAL ===================

const initialState: AquacultureState = {
  cycles: [],
  activeCycles: [],
  currentCycle: undefined,
  cycleLogs: [],
  feedingPlans: [],
  sanitaryLogs: [],
  dashboardData: undefined,
  cycleFeedStatus: {
    data: null,
    loading: false,
    error: null,
  },
  loading: {
    dashboard: false,
    cycles: false,
    logs: false,
    sync: false,
  },
  error: null,
};

// =================== ACTIONS ASYNC ===================

// Marker rejet silencieux : utilise quand un thunk est appele apres logout
// (tokens supprimes, isAuthenticated=false). Le reducer ignore ce payload pour
// ne pas afficher d'erreur a l'utilisateur post-deconnexion.
export const ABORTED_UNAUTHENTICATED = 'ABORTED_UNAUTHENTICATED';

export const fetchDashboardData = createAsyncThunk(
  'aquaculture/fetchDashboardData',
  async (
    options: { cycleId?: string; forceAllCycles?: boolean; lightweight?: boolean } | undefined,
    { getState, rejectWithValue }
  ) => {
    const state = getState() as {
      aquaculture: AquacultureState;
      auth: { isAuthenticated: boolean };
    };
    if (!state.auth.isAuthenticated) {
      return rejectWithValue(ABORTED_UNAUTHENTICATED);
    }
    try {
      const sessionCycleId = state.aquaculture.currentCycle?.id;
      const cycleIdToUse = options?.forceAllCycles
        ? undefined
        : options?.cycleId || sessionCycleId;
      const data = await aquacultureService.getDashboardData(cycleIdToUse, {
        lightweight: options?.lightweight === true,
      });
      return data;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors du chargement du dashboard'));
    }
  }
);

export const fetchProductionCycles = createAsyncThunk(
  'aquaculture/fetchProductionCycles',
  async (_, { rejectWithValue }) => {
    try {
      const cycles = await aquacultureService.getProductionCycles();
      return cycles;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors du chargement des cycles'));
    }
  }
);

export const fetchProductionCycle = createAsyncThunk(
  'aquaculture/fetchProductionCycle',
  async (id: string, { rejectWithValue }) => {
    try {
      const cycle = await aquacultureService.getProductionCycle(id);
      return cycle;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors du chargement du cycle'));
    }
  }
);

export const fetchCycleFeedStatus = createAsyncThunk(
  'aquaculture/fetchCycleFeedStatus',
  async (cycleId: string, { rejectWithValue }) => {
    try {
      const response = await apiService.get<CycleFeedStatus>(
        `/aquaculture/cycles/${cycleId}/feed-status/`
      );
      return response.data;
    } catch (error: unknown) {
      return rejectWithValue(
        extractErrorMessage(error, 'Erreur lors du chargement du statut des aliments')
      );
    }
  }
);

export const createProductionCycle = createAsyncThunk(
  'aquaculture/createProductionCycle',
  async (cycleData: CreateCycleForm, { rejectWithValue }) => {
    try {
      const cycle = await aquacultureService.createProductionCycle(cycleData);
      return cycle;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la creation du cycle'));
    }
  }
);

export const updateProductionCycle = createAsyncThunk(
  'aquaculture/updateProductionCycle',
  async ({ id, data }: { id: string; data: Partial<ProductionCycle> }, { rejectWithValue }) => {
    try {
      const cycle = await aquacultureService.updateProductionCycle(id, data);
      return cycle;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la mise a jour du cycle'));
    }
  }
);

export const deleteProductionCycle = createAsyncThunk(
  'aquaculture/deleteProductionCycle',
  async (id: string, { rejectWithValue }) => {
    try {
      await aquacultureService.deleteProductionCycle(id);
      return id;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la suppression du cycle'));
    }
  }
);

export const harvestCycle = createAsyncThunk(
  'aquaculture/harvestCycle',
  async ({ id, harvestData }: { id: string; harvestData: HarvestData }, { rejectWithValue }) => {
    try {
      const response = await aquacultureService.harvestCycle(id, harvestData);
      return response;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la recolte du cycle'));
    }
  }
);

export const createPartialHarvest = createAsyncThunk(
  'aquaculture/createPartialHarvest',
  async (
    { id, data }: { id: string; data: PartialHarvestData },
    { rejectWithValue }
  ) => {
    try {
      const result = await aquacultureService.partialHarvestCycle(id, data);
      return result;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la récolte partielle'));
    }
  }
);

export const fetchCycleLogs = createAsyncThunk(
  'aquaculture/fetchCycleLogs',
  async (cycleId: string | undefined, { rejectWithValue }) => {
    try {
      const logs = await aquacultureService.getCycleLogs(cycleId);
      return logs;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors du chargement des logs'));
    }
  }
);

export const createCycleLog = createAsyncThunk(
  'aquaculture/createCycleLog',
  async ({ cycleId, logData }: { cycleId: string; logData: DailyLogForm }, { rejectWithValue }) => {
    try {
      const log = await aquacultureService.createCycleLog(cycleId, logData);
      return log;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la creation du log'));
    }
  }
);

export const updateCycleLog = createAsyncThunk(
  'aquaculture/updateCycleLog',
  async ({ id, data }: { id: string; data: Partial<DailyLogForm> }, { rejectWithValue }) => {
    try {
      const log = await aquacultureService.updateCycleLog(id, data);
      return log;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la mise a jour du log'));
    }
  }
);

export const deleteCycleLog = createAsyncThunk(
  'aquaculture/deleteCycleLog',
  async (id: string, { rejectWithValue }) => {
    try {
      await aquacultureService.deleteCycleLog(id);
      return id;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la suppression du log'));
    }
  }
);

export const fetchFeedingPlans = createAsyncThunk(
  'aquaculture/fetchFeedingPlans',
  async (cycleId: string | undefined, { rejectWithValue }) => {
    try {
      if (!cycleId) {
        return rejectWithValue('ID de cycle requis');
      }
      const plans = await aquacultureService.getFeedingPlans(cycleId);
      return plans;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, "Erreur lors du chargement des plans d'alimentation"));
    }
  }
);

export const generateFeedingPlan = createAsyncThunk(
  'aquaculture/generateFeedingPlan',
  async ({ cycleId }: { cycleId: string }, { rejectWithValue }) => {
    try {
      const plans = await aquacultureService.generateFeedingPlan(cycleId);
      return plans;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, "Erreur lors de la generation du plan d'alimentation"));
    }
  }
);

export const fetchSanitaryLogs = createAsyncThunk(
  'aquaculture/fetchSanitaryLogs',
  async (cycleId: string | undefined, { rejectWithValue }) => {
    try {
      const logs = await aquacultureService.getSanitaryLogs(cycleId);
      return logs;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors du chargement des logs sanitaires'));
    }
  }
);

export const createSanitaryLog = createAsyncThunk(
  'aquaculture/createSanitaryLog',
  async ({ cycleId, logData }: { cycleId: string; logData: SanitaryLogForm }, { rejectWithValue }) => {
    try {
      const log = await aquacultureService.createSanitaryLog(cycleId, logData);
      return log;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la creation du log sanitaire'));
    }
  }
);

export const resolveSanitaryIssue = createAsyncThunk(
  'aquaculture/resolveSanitaryIssue',
  async (id: string, { rejectWithValue }) => {
    try {
      const log = await aquacultureService.resolveSanitaryIssue(id);
      return log;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la resolution du probleme'));
    }
  }
);

export const synchronizeData = createAsyncThunk(
  'aquaculture/synchronizeData',
  async (_, { rejectWithValue }) => {
    try {
      const syncResult = await offlineService.syncAllOfflineData();
      const status: SyncResponse['status'] =
        syncResult.failed === 0
          ? 'success'
          : syncResult.success > 0
            ? 'partial_success'
            : 'error';

      const response: SyncResponse = {
        status,
        timestamp: new Date().toISOString(),
        processed: {
          cycles: syncResult.details.newCycles.success,
          cycle_logs: syncResult.details.cycleLogs.success,
          sanitary_logs: syncResult.details.sanitaryLogs.success,
        },
        errors:
          syncResult.failed > 0
            ? [
                {
                  type: 'general',
                  error: extractErrorMessage(
                    null,
                    'Synchronisation partielle, certains éléments seront réessayés automatiquement'
                  ),
                },
              ]
            : [],
        server_updates: {
          cycles: [],
          cycle_logs: [],
          feeding_plans: [],
          sanitary_logs: [],
        },
      };
      return response;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la synchronisation'));
    }
  }
);

// =================== SLICE ===================

export const aquacultureSlice = createSlice({
  name: 'aquaculture',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },

    setCurrentCycle: (state, action: PayloadAction<ProductionCycle | undefined>) => {
      state.currentCycle = action.payload;
    },

    clearCurrentCycle: (state) => {
      state.currentCycle = undefined;
    },

    setCurrentCycleById: (state, action: PayloadAction<string | undefined>) => {
      const cycleId = action.payload;
      if (!cycleId) {
        state.currentCycle = undefined;
        return;
      }

      const cycle =
        state.activeCycles.find((item) => item.id === cycleId) ||
        state.cycles.find((item) => item.id === cycleId);

      state.currentCycle = cycle;
    },

    resetAquacultureState: () => initialState,
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardData.pending, (state) => {
        state.loading.dashboard = true;
        state.error = null;
      })
      .addCase(fetchDashboardData.fulfilled, (state, action) => {
        state.loading.dashboard = false;
        state.dashboardData = action.payload;
        state.activeCycles = action.payload.active_cycles;
      })
      .addCase(fetchDashboardData.rejected, (state, action) => {
        state.loading.dashboard = false;
        if (action.payload !== ABORTED_UNAUTHENTICATED) {
          state.error = action.payload as string;
        }
      })

      .addCase(fetchProductionCycles.pending, (state) => {
        state.loading.cycles = true;
        state.error = null;
      })
      .addCase(fetchProductionCycles.fulfilled, (state, action) => {
        state.loading.cycles = false;
        state.cycles = action.payload;
        state.activeCycles = action.payload.filter((cycle) => cycle.status === 'active');
      })
      .addCase(fetchProductionCycles.rejected, (state, action) => {
        state.loading.cycles = false;
        state.error = action.payload as string;
      })

      .addCase(fetchProductionCycle.fulfilled, (state, action) => {
        state.currentCycle = action.payload;
        const index = state.cycles.findIndex((cycle) => cycle.id === action.payload.id);
        if (index !== -1) {
          state.cycles[index] = action.payload;
        }
      })

      .addCase(createProductionCycle.fulfilled, (state, action) => {
        state.cycles.unshift(action.payload);
        if (action.payload.status === 'active') {
          state.activeCycles.unshift(action.payload);
        }
      })

      .addCase(updateProductionCycle.fulfilled, (state, action) => {
        const index = state.cycles.findIndex((cycle) => cycle.id === action.payload.id);
        if (index !== -1) {
          state.cycles[index] = action.payload;
        }

        const activeIndex = state.activeCycles.findIndex((cycle) => cycle.id === action.payload.id);
        if (activeIndex !== -1) {
          if (action.payload.status === 'active') {
            state.activeCycles[activeIndex] = action.payload;
          } else {
            state.activeCycles.splice(activeIndex, 1);
          }
        }

        if (state.currentCycle?.id === action.payload.id) {
          state.currentCycle = action.payload;
        }
      })

      .addCase(deleteProductionCycle.fulfilled, (state, action) => {
        state.cycles = state.cycles.filter((cycle) => cycle.id !== action.payload);
        state.activeCycles = state.activeCycles.filter((cycle) => cycle.id !== action.payload);
        if (state.currentCycle?.id === action.payload) {
          state.currentCycle = undefined;
        }
      })

      .addCase(harvestCycle.fulfilled, (state, action) => {
        const harvestedCycle = action.payload.cycle;

        const cycleIndex = state.cycles.findIndex((cycle) => cycle.id === harvestedCycle.id);
        if (cycleIndex !== -1) {
          state.cycles[cycleIndex] = harvestedCycle;
        }

        state.activeCycles = state.activeCycles.filter((cycle) => cycle.id !== harvestedCycle.id);

        if (state.currentCycle?.id === harvestedCycle.id) {
          state.currentCycle = harvestedCycle;
        }
      })

      .addCase(createPartialHarvest.fulfilled, (state, action) => {
        const { cycle: updatedCycle } = action.payload;
        // Met à jour le cycle dans les listes (il reste actif)
        const idx = state.cycles.findIndex((c) => c.id === updatedCycle.id);
        if (idx !== -1) state.cycles[idx] = updatedCycle;
        const activeIdx = state.activeCycles.findIndex((c) => c.id === updatedCycle.id);
        if (activeIdx !== -1) state.activeCycles[activeIdx] = updatedCycle;
        if (state.currentCycle?.id === updatedCycle.id) state.currentCycle = updatedCycle;
      })

      .addCase(fetchCycleLogs.pending, (state) => {
        state.loading.logs = true;
      })
      .addCase(fetchCycleLogs.fulfilled, (state, action) => {
        state.loading.logs = false;
        state.cycleLogs = action.payload;
      })
      .addCase(fetchCycleLogs.rejected, (state, action) => {
        state.loading.logs = false;
        state.error = action.payload as string;
      })

      .addCase(createCycleLog.fulfilled, (state, action) => {
        state.cycleLogs.unshift(action.payload);
      })

      .addCase(updateCycleLog.fulfilled, (state, action) => {
        const index = state.cycleLogs.findIndex((log) => log.id === action.payload.id);
        if (index !== -1) {
          state.cycleLogs[index] = action.payload;
        }
      })

      .addCase(deleteCycleLog.fulfilled, (state, action) => {
        state.cycleLogs = state.cycleLogs.filter((log) => log.id !== action.payload);
      })

      .addCase(fetchFeedingPlans.fulfilled, (state, action) => {
        state.feedingPlans = action.payload;
      })

      .addCase(generateFeedingPlan.fulfilled, (state, action) => {
        action.payload.forEach((plan) => {
          const existingIndex = state.feedingPlans.findIndex((currentPlan) => currentPlan.id === plan.id);
          if (existingIndex !== -1) {
            state.feedingPlans[existingIndex] = plan;
          } else {
            state.feedingPlans.push(plan);
          }
        });
      })

      .addCase(fetchSanitaryLogs.fulfilled, (state, action) => {
        state.sanitaryLogs = action.payload;
      })

      .addCase(createSanitaryLog.fulfilled, (state, action) => {
        state.sanitaryLogs.unshift(action.payload);
      })

      .addCase(resolveSanitaryIssue.fulfilled, (state, action) => {
        const index = state.sanitaryLogs.findIndex((log) => log.id === action.payload.id);
        if (index !== -1) {
          state.sanitaryLogs[index] = action.payload;
        }
      })

      .addCase(synchronizeData.pending, (state) => {
        state.loading.sync = true;
      })
      .addCase(synchronizeData.fulfilled, (state, action) => {
        state.loading.sync = false;

        const { server_updates } = action.payload;
        if (server_updates.cycles.length > 0) {
          server_updates.cycles.forEach((cycle) => {
            const index = state.cycles.findIndex((currentCycle) => currentCycle.id === cycle.id);
            if (index !== -1) {
              state.cycles[index] = cycle;
            } else {
              state.cycles.push(cycle);
            }
          });
        }

        const incomingCycleLogs = server_updates.cycle_logs || [];
        if (incomingCycleLogs.length > 0) {
          incomingCycleLogs.forEach((log) => {
            const index = state.cycleLogs.findIndex((currentLog) => currentLog.id === log.id);
            if (index !== -1) {
              state.cycleLogs[index] = log;
            } else {
              state.cycleLogs.push(log);
            }
          });
        }

        if (server_updates.feeding_plans.length > 0) {
          server_updates.feeding_plans.forEach((plan) => {
            const index = state.feedingPlans.findIndex((currentPlan) => currentPlan.id === plan.id);
            if (index !== -1) {
              state.feedingPlans[index] = plan;
            } else {
              state.feedingPlans.push(plan);
            }
          });
        }

        const incomingSanitaryLogs = server_updates.sanitary_logs || [];
        if (incomingSanitaryLogs.length > 0) {
          incomingSanitaryLogs.forEach((log) => {
            const index = state.sanitaryLogs.findIndex((currentLog) => currentLog.id === log.id);
            if (index !== -1) {
              state.sanitaryLogs[index] = log;
            } else {
              state.sanitaryLogs.push(log);
            }
          });
        }
      })
      .addCase(synchronizeData.rejected, (state, action) => {
        state.loading.sync = false;
        state.error = action.payload as string;
      })
      // Reset complet au logout : evite spinner fantome (loading.dashboard) et
      // donnees du compte precedent affichees apres re-login.
      .addCase(logoutUser.fulfilled, () => initialState)
      .addCase(logoutUser.rejected, () => initialState)

      .addCase(fetchCycleFeedStatus.pending, (state) => {
        state.cycleFeedStatus.loading = true;
        state.cycleFeedStatus.error = null;
      })
      .addCase(fetchCycleFeedStatus.fulfilled, (state, action) => {
        state.cycleFeedStatus.loading = false;
        state.cycleFeedStatus.data = action.payload;
      })
      .addCase(fetchCycleFeedStatus.rejected, (state, action) => {
        state.cycleFeedStatus.loading = false;
        state.cycleFeedStatus.error = action.payload as string;
      });
  },
});

// =================== EXPORTS ===================

export const {
  clearError,
  setCurrentCycle,
  clearCurrentCycle,
  setCurrentCycleById,
  resetAquacultureState,
} = aquacultureSlice.actions;

export default aquacultureSlice.reducer;
