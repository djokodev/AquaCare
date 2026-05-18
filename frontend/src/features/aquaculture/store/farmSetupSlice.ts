import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { farmSetupService } from '@/features/aquaculture/services/farmSetupService';
import { getApiErrorMessage } from '@/utils/errorParser';
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

export const completeFarmSetup = createAsyncThunk(
  'farmSetup/completeFarmSetup',
  async (setupData: FarmSetupData, { rejectWithValue }) => {
    try {
      return await farmSetupService.completeFarmSetup(setupData);
    } catch (error: unknown) {
      return rejectWithValue(getApiErrorMessage(error, 'UNKNOWN_ERROR'));
    }
  }
);

export const runAnnualSimulation = createAsyncThunk(
  'farmSetup/runAnnualSimulation',
  async (params: AnnualSimulationInput, { rejectWithValue }) => {
    try {
      return await farmSetupService.simulateAnnualProduction(params);
    } catch (error: unknown) {
      return rejectWithValue(getApiErrorMessage(error, 'UNKNOWN_ERROR'));
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
