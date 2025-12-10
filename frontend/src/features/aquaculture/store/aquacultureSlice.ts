import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  AquacultureState,
  ProductionCycle,
  CycleLog,
  FeedingPlan,
  SanitaryLog,
  DashboardData,
  CreateCycleForm,
  DailyLogForm,
  SanitaryLogForm,
  HarvestData,
  SyncPayload,
  SyncResponse
} from '@/types/aquaculture';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

// =================== Ã‰TAT INITIAL ===================

const initialState: AquacultureState = {
  // DonnÃ©es principales
  cycles: [],
  activeCycles: [],
  currentCycle: undefined,

  // Logs et plans
  cycleLogs: [],
  feedingPlans: [],
  sanitaryLogs: [],

  // Dashboard
  dashboardData: undefined,

  // Ã‰tat de chargement
  loading: {
    dashboard: false,
    cycles: false,
    logs: false,
    sync: false,
  },

  // Erreurs
  error: null,

  // Synchronisation offline
  pendingSync: {
    cycleLogs: [],
    sanitaryLogs: [],
    newCycles: [],
  },
  lastSyncTime: undefined,
};

// =================== ACTIONS ASYNC ===================

/**
 * RÃ©cupÃ¨re les donnÃ©es du dashboard
 */
export const fetchDashboardData = createAsyncThunk(
  'aquaculture/fetchDashboardData',
  async (_, { rejectWithValue }) => {
    try {
      const data = await aquacultureService.getDashboardData();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors du chargement du dashboard');
    }
  }
);

/**
 * RÃ©cupÃ¨re tous les cycles de production
 */
export const fetchProductionCycles = createAsyncThunk(
  'aquaculture/fetchProductionCycles',
  async (_, { rejectWithValue }) => {
    try {
      const cycles = await aquacultureService.getProductionCycles();
      return cycles;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors du chargement des cycles');
    }
  }
);

/**
 * RÃ©cupÃ¨re un cycle spÃ©cifique
 */
export const fetchProductionCycle = createAsyncThunk(
  'aquaculture/fetchProductionCycle',
  async (id: string, { rejectWithValue }) => {
    try {
      const cycle = await aquacultureService.getProductionCycle(id);
      return cycle;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors du chargement du cycle');
    }
  }
);

/**
 * CrÃ©e un nouveau cycle de production
 */
export const createProductionCycle = createAsyncThunk(
  'aquaculture/createProductionCycle',
  async (cycleData: CreateCycleForm, { rejectWithValue }) => {
    try {
      const cycle = await aquacultureService.createProductionCycle(cycleData);
      return cycle;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la création du cycle');
    }
  }
);

/**
 * Met Ã  jour un cycle
 */
export const updateProductionCycle = createAsyncThunk(
  'aquaculture/updateProductionCycle',
  async ({ id, data }: { id: string; data: Partial<ProductionCycle> }, { rejectWithValue }) => {
    try {
      const cycle = await aquacultureService.updateProductionCycle(id, data);
      return cycle;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la mise Ã  jour du cycle');
    }
  }
);

/**
 * Supprime un cycle
 */
export const deleteProductionCycle = createAsyncThunk(
  'aquaculture/deleteProductionCycle',
  async (id: string, { rejectWithValue }) => {
    try {
      await aquacultureService.deleteProductionCycle(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la suppression du cycle');
    }
  }
);

/**
 * Finalise un cycle (rÃ©colte)
 */
export const harvestCycle = createAsyncThunk(
  'aquaculture/harvestCycle',
  async ({ id, harvestData }: { id: string; harvestData: HarvestData }, { rejectWithValue }) => {
    try {
      const cycle = await aquacultureService.harvestCycle(id, harvestData);
      return cycle;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la récolte du cycle');
    }
  }
);

/**
 * RÃ©cupÃ¨re les logs d'un cycle
 */
export const fetchCycleLogs = createAsyncThunk(
  'aquaculture/fetchCycleLogs',
  async (cycleId: string | undefined, { rejectWithValue }) => {
    try {
      const logs = await aquacultureService.getCycleLogs(cycleId);
      return logs;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors du chargement des logs');
    }
  }
);

/**
 * CrÃ©e un nouveau log quotidien
 */
export const createCycleLog = createAsyncThunk(
  'aquaculture/createCycleLog',
  async ({ cycleId, logData }: { cycleId: string; logData: DailyLogForm }, { rejectWithValue }) => {
    try {
      const log = await aquacultureService.createCycleLog(cycleId, logData);
      return log;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la création du log');
    }
  }
);

/**
 * Met Ã  jour un log
 */
export const updateCycleLog = createAsyncThunk(
  'aquaculture/updateCycleLog',
  async ({ id, data }: { id: string; data: Partial<DailyLogForm> }, { rejectWithValue }) => {
    try {
      const log = await aquacultureService.updateCycleLog(id, data);
      return log;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la mise Ã  jour du log');
    }
  }
);

/**
 * Supprime un log
 */
export const deleteCycleLog = createAsyncThunk(
  'aquaculture/deleteCycleLog',
  async (id: string, { rejectWithValue }) => {
    try {
      await aquacultureService.deleteCycleLog(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la suppression du log');
    }
  }
);

/**
 * RÃ©cupÃ¨re les plans d'alimentation
 */
export const fetchFeedingPlans = createAsyncThunk(
  'aquaculture/fetchFeedingPlans',
  async (cycleId: string | undefined, { rejectWithValue }) => {
    try {
      if (!cycleId) {
        return rejectWithValue('ID de cycle requis');
      }
      const plans = await aquacultureService.getFeedingPlans(cycleId);
      return plans;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors du chargement des plans d\'alimentation');
    }
  }
);

/**
 * GÃ©nÃ¨re un plan d'alimentation automatiquement
 */
export const generateFeedingPlan = createAsyncThunk(
  'aquaculture/generateFeedingPlan',
  async ({ cycleId }: { cycleId: string }, { rejectWithValue }) => {
    try {
      const plans = await aquacultureService.generateFeedingPlan(cycleId);
      return plans;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la génération du plan d\'alimentation');
    }
  }
);

/**
 * RÃ©cupÃ¨re les logs sanitaires
 */
export const fetchSanitaryLogs = createAsyncThunk(
  'aquaculture/fetchSanitaryLogs',
  async (cycleId: string | undefined, { rejectWithValue }) => {
    try {
      const logs = await aquacultureService.getSanitaryLogs(cycleId);
      return logs;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors du chargement des logs sanitaires');
    }
  }
);

/**
 * CrÃ©e un nouveau log sanitaire
 */
export const createSanitaryLog = createAsyncThunk(
  'aquaculture/createSanitaryLog',
  async ({ cycleId, logData }: { cycleId: string; logData: SanitaryLogForm }, { rejectWithValue }) => {
    try {
      const log = await aquacultureService.createSanitaryLog(cycleId, logData);
      return log;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la création du log sanitaire');
    }
  }
);

/**
 * Marque un problÃ¨me sanitaire comme rÃ©solu
 */
export const resolveSanitaryIssue = createAsyncThunk(
  'aquaculture/resolveSanitaryIssue',
  async (id: string, { rejectWithValue }) => {
    try {
      const log = await aquacultureService.resolveSanitaryIssue(id);
      return log;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la résolution du problème');
    }
  }
);

/**
 * Synchronisation offline
 */
export const synchronizeData = createAsyncThunk(
  'aquaculture/synchronizeData',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { aquaculture: AquacultureState };
      const { pendingSync, lastSyncTime } = state.aquaculture;

      const payload: SyncPayload = {
        cycle_logs: pendingSync.cycleLogs,
        sanitary_logs: pendingSync.sanitaryLogs,
        new_cycles: pendingSync.newCycles,
        last_sync: lastSyncTime,
        client_id: 'mobile-app', // Ã€ remplacer par un ID unique d'appareil
      };

      const response = await aquacultureService.synchronize(payload);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la synchronisation');
    }
  }
);

// =================== SLICE ===================

export const aquacultureSlice = createSlice({
  name: 'aquaculture',
  initialState,
  reducers: {
    // Gestion des erreurs
    clearError: (state) => {
      state.error = null;
    },

    // SÃ©lection du cycle actuel
    setCurrentCycle: (state, action: PayloadAction<ProductionCycle | undefined>) => {
      state.currentCycle = action.payload;
    },

    // Gestion des donnÃ©es offline
    addToPendingSync: (state, action: PayloadAction<{
      type: 'cycleLogs' | 'sanitaryLogs' | 'newCycles';
      data: any;
    }>) => {
      const { type, data } = action.payload;
      state.pendingSync[type].push(data);
    },

    clearPendingSync: (state) => {
      state.pendingSync = {
        cycleLogs: [],
        sanitaryLogs: [],
        newCycles: [],
      };
    },

    updateLastSyncTime: (state, action: PayloadAction<string>) => {
      state.lastSyncTime = action.payload;
    },

    // Reset complet de l'Ã©tat (utile lors de la dÃ©connexion)
    resetAquacultureState: () => initialState,
  },

  extraReducers: (builder) => {
    // ========== DASHBOARD ==========
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
        state.error = action.payload as string;
      })

      // ========== CYCLES ==========
      .addCase(fetchProductionCycles.pending, (state) => {
        state.loading.cycles = true;
        state.error = null;
      })
      .addCase(fetchProductionCycles.fulfilled, (state, action) => {
        state.loading.cycles = false;
        state.cycles = action.payload;
        state.activeCycles = action.payload.filter(cycle => cycle.status === 'active');
      })
      .addCase(fetchProductionCycles.rejected, (state, action) => {
        state.loading.cycles = false;
        state.error = action.payload as string;
      })

      .addCase(fetchProductionCycle.fulfilled, (state, action) => {
        state.currentCycle = action.payload;
        // Mettre Ã  jour dans la liste aussi
        const index = state.cycles.findIndex(cycle => cycle.id === action.payload.id);
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
        const index = state.cycles.findIndex(cycle => cycle.id === action.payload.id);
        if (index !== -1) {
          state.cycles[index] = action.payload;
        }

        const activeIndex = state.activeCycles.findIndex(cycle => cycle.id === action.payload.id);
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
        state.cycles = state.cycles.filter(cycle => cycle.id !== action.payload);
        state.activeCycles = state.activeCycles.filter(cycle => cycle.id !== action.payload);
        if (state.currentCycle?.id === action.payload) {
          state.currentCycle = undefined;
        }
      })

      .addCase(harvestCycle.fulfilled, (state, action) => {
        const harvestedCycle = action.payload;

        // Mettre Ã  jour dans la liste des cycles
        const cycleIndex = state.cycles.findIndex(cycle => cycle.id === harvestedCycle.id);
        if (cycleIndex !== -1) {
          state.cycles[cycleIndex] = harvestedCycle;
        }

        // Retirer des cycles actifs car il est maintenant rÃ©coltÃ©
        state.activeCycles = state.activeCycles.filter(cycle => cycle.id !== harvestedCycle.id);

        // Mettre Ã  jour le cycle actuel s'il correspond
        if (state.currentCycle?.id === harvestedCycle.id) {
          state.currentCycle = harvestedCycle;
        }
      })

      // ========== LOGS ==========
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
        const index = state.cycleLogs.findIndex(log => log.id === action.payload.id);
        if (index !== -1) {
          state.cycleLogs[index] = action.payload;
        }
      })

      .addCase(deleteCycleLog.fulfilled, (state, action) => {
        state.cycleLogs = state.cycleLogs.filter(log => log.id !== action.payload);
      })

      // ========== FEEDING PLANS ==========
      .addCase(fetchFeedingPlans.fulfilled, (state, action) => {
        state.feedingPlans = action.payload;
      })

      .addCase(generateFeedingPlan.fulfilled, (state, action) => {
        // Ajouter les nouveaux plans gÃ©nÃ©rÃ©s
        action.payload.forEach(plan => {
          const existingIndex = state.feedingPlans.findIndex(p => p.id === plan.id);
          if (existingIndex !== -1) {
            state.feedingPlans[existingIndex] = plan;
          } else {
            state.feedingPlans.push(plan);
          }
        });
      })

      // ========== SANITARY LOGS ==========
      .addCase(fetchSanitaryLogs.fulfilled, (state, action) => {
        state.sanitaryLogs = action.payload;
      })

      .addCase(createSanitaryLog.fulfilled, (state, action) => {
        state.sanitaryLogs.unshift(action.payload);
      })

      .addCase(resolveSanitaryIssue.fulfilled, (state, action) => {
        const index = state.sanitaryLogs.findIndex(log => log.id === action.payload.id);
        if (index !== -1) {
          state.sanitaryLogs[index] = action.payload;
        }
      })

      // ========== SYNCHRONISATION ==========
      .addCase(synchronizeData.pending, (state) => {
        state.loading.sync = true;
      })
      .addCase(synchronizeData.fulfilled, (state, action) => {
        state.loading.sync = false;

        // Vider la queue pending aprÃ¨s synchronisation rÃ©ussie
        if (action.payload.status === 'success') {
          state.pendingSync = {
            cycleLogs: [],
            sanitaryLogs: [],
            newCycles: [],
          };
          state.lastSyncTime = action.payload.timestamp;
        }

        // IntÃ©grer les mises Ã  jour du serveur
        const { server_updates } = action.payload;
        if (server_updates.cycles.length > 0) {
          server_updates.cycles.forEach(cycle => {
            const index = state.cycles.findIndex(c => c.id === cycle.id);
            if (index !== -1) {
              state.cycles[index] = cycle;
            } else {
              state.cycles.push(cycle);
            }
          });
        }

        if (server_updates.logs.length > 0) {
          server_updates.logs.forEach(log => {
            const index = state.cycleLogs.findIndex(l => l.id === log.id);
            if (index !== -1) {
              state.cycleLogs[index] = log;
            } else {
              state.cycleLogs.push(log);
            }
          });
        }

        if (server_updates.feeding_plans.length > 0) {
          server_updates.feeding_plans.forEach(plan => {
            const index = state.feedingPlans.findIndex(p => p.id === plan.id);
            if (index !== -1) {
              state.feedingPlans[index] = plan;
            } else {
              state.feedingPlans.push(plan);
            }
          });
        }
      })
      .addCase(synchronizeData.rejected, (state, action) => {
        state.loading.sync = false;
        state.error = action.payload as string;
      });
  },
});

// =================== EXPORTS ===================

export const {
  clearError,
  setCurrentCycle,
  addToPendingSync,
  clearPendingSync,
  updateLastSyncTime,
  resetAquacultureState,
} = aquacultureSlice.actions;

export default aquacultureSlice.reducer;
