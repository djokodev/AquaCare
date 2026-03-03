import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  AquacultureState,
  ProductionCycle,
  CycleLog,
  FeedingPlan,
  SanitaryLog,
  CreateCycleForm,
  DailyLogForm,
  SanitaryLogForm,
  HarvestData,
  SyncPayload,
} from '@/types/aquaculture';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { logoutUser } from '@/features/auth/store/authSlice';

interface ApiErrorPayload {
  detail?: string;
  message?: string;
}

interface ApiErrorShape {
  response?: {
    data?: ApiErrorPayload | string;
  };
  message?: string;
}

type PendingSyncAction =
  | { type: 'cycleLogs'; data: Partial<CycleLog> }
  | { type: 'sanitaryLogs'; data: Partial<SanitaryLog> }
  | { type: 'newCycles'; data: Partial<ProductionCycle> };

const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const candidate = error as ApiErrorShape;
  const responseData = candidate.response?.data;

  if (typeof responseData === 'string' && responseData.trim()) {
    return responseData;
  }

  if (responseData && typeof responseData === 'object') {
    if (responseData.detail) {
      return responseData.detail;
    }
    if (responseData.message) {
      return responseData.message;
    }
  }

  if (candidate.message) {
    return candidate.message;
  }

  return fallback;
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
  loading: {
    dashboard: false,
    cycles: false,
    logs: false,
    sync: false,
  },
  error: null,
  pendingSync: {
    cycleLogs: [],
    sanitaryLogs: [],
    newCycles: [],
  },
  lastSyncTime: undefined,
};

// =================== ACTIONS ASYNC ===================

export const fetchDashboardData = createAsyncThunk(
  'aquaculture/fetchDashboardData',
  async (
    options: { cycleId?: string; forceAllCycles?: boolean } | undefined,
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as { aquaculture: AquacultureState };
      const sessionCycleId = state.aquaculture.currentCycle?.id;
      const cycleIdToUse = options?.forceAllCycles
        ? undefined
        : options?.cycleId || sessionCycleId;
      const data = await aquacultureService.getDashboardData(cycleIdToUse);
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
      const cycle = await aquacultureService.harvestCycle(id, harvestData);
      return cycle;
    } catch (error: unknown) {
      return rejectWithValue(extractErrorMessage(error, 'Erreur lors de la recolte du cycle'));
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
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { aquaculture: AquacultureState };
      const { pendingSync, lastSyncTime } = state.aquaculture;

      const payload: SyncPayload = {
        cycle_logs: pendingSync.cycleLogs,
        sanitary_logs: pendingSync.sanitaryLogs,
        new_cycles: pendingSync.newCycles,
        last_sync: lastSyncTime,
        device_id: 'mobile-app',
      };

      const response = await aquacultureService.synchronize(payload);
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

    addToPendingSync: (state, action: PayloadAction<PendingSyncAction>) => {
      const payload = action.payload;
      switch (payload.type) {
        case 'cycleLogs':
          state.pendingSync.cycleLogs.push(payload.data);
          break;
        case 'sanitaryLogs':
          state.pendingSync.sanitaryLogs.push(payload.data);
          break;
        case 'newCycles':
          state.pendingSync.newCycles.push(payload.data);
          break;
      }
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
        state.error = action.payload as string;
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
        const harvestedCycle = action.payload;

        const cycleIndex = state.cycles.findIndex((cycle) => cycle.id === harvestedCycle.id);
        if (cycleIndex !== -1) {
          state.cycles[cycleIndex] = harvestedCycle;
        }

        state.activeCycles = state.activeCycles.filter((cycle) => cycle.id !== harvestedCycle.id);

        if (state.currentCycle?.id === harvestedCycle.id) {
          state.currentCycle = harvestedCycle;
        }
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

        if (action.payload.status === 'success') {
          state.pendingSync = {
            cycleLogs: [],
            sanitaryLogs: [],
            newCycles: [],
          };
          state.lastSyncTime = action.payload.timestamp;
        }

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
      .addCase(logoutUser.fulfilled, (state) => {
        state.currentCycle = undefined;
      })
      .addCase(logoutUser.rejected, (state) => {
        state.currentCycle = undefined;
      });
  },
});

// =================== EXPORTS ===================

export const {
  clearError,
  setCurrentCycle,
  clearCurrentCycle,
  setCurrentCycleById,
  addToPendingSync,
  clearPendingSync,
  updateLastSyncTime,
  resetAquacultureState,
} = aquacultureSlice.actions;

export default aquacultureSlice.reducer;
