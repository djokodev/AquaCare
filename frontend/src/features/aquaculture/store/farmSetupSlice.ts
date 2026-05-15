import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { farmSetupService } from '@/features/aquaculture/services/farmSetupService';
import type {
  AnnualSimulationInput,
  AnnualSimulationResult,
  FarmSetupData,
} from '@/features/aquaculture/types/farmSetup';

interface FarmSetupState {
  annualSimulation: {
    result: AnnualSimulationResult | null;
    loading: boolean;
    error: string | null;
  };
}

const initialState: FarmSetupState = {
  annualSimulation: {
    result: null,
    loading: false,
    error: null,
  },
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;

  const apiError = error as {
    response?: { data?: Record<string, unknown> | string };
    message?: string;
  };
  const data = apiError.response?.data;

  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    if (typeof data.detail === 'string') return data.detail;
    if (typeof data.message === 'string') return data.message;
    if (typeof data.error === 'string') return data.error;

    const firstFieldError = Object.values(data).find(Boolean);
    if (Array.isArray(firstFieldError) && firstFieldError.length > 0) {
      return String(firstFieldError[0]);
    }
    if (firstFieldError) return String(firstFieldError);
  }

  return apiError.message || 'UNKNOWN_ERROR';
};

export const completeFarmSetup = createAsyncThunk(
  'farmSetup/completeFarmSetup',
  async (setupData: FarmSetupData, { rejectWithValue }) => {
    try {
      return await farmSetupService.completeFarmSetup(setupData);
    } catch (error: unknown) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

export const runAnnualSimulation = createAsyncThunk(
  'farmSetup/runAnnualSimulation',
  async (params: AnnualSimulationInput, { rejectWithValue }) => {
    try {
      return await farmSetupService.simulateAnnualProduction(params);
    } catch (error: unknown) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

export const farmSetupSlice = createSlice({
  name: 'farmSetup',
  initialState,
  reducers: {
    clearAnnualSimulation: (state) => {
      state.annualSimulation.result = null;
      state.annualSimulation.error = null;
      state.annualSimulation.loading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runAnnualSimulation.pending, (state) => {
        state.annualSimulation.loading = true;
        state.annualSimulation.error = null;
      })
      .addCase(runAnnualSimulation.fulfilled, (state, action) => {
        state.annualSimulation.loading = false;
        state.annualSimulation.result = action.payload;
        state.annualSimulation.error = null;
      })
      .addCase(runAnnualSimulation.rejected, (state, action) => {
        state.annualSimulation.loading = false;
        state.annualSimulation.error = action.payload as string;
      });
  },
});

export const { clearAnnualSimulation } = farmSetupSlice.actions;
export default farmSetupSlice.reducer;
