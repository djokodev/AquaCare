import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { farmSetupService } from '@/features/aquaculture/services/farmSetupService';
import { getApiErrorMessage } from '@/utils/errorParser';
import type {
  CycleSimulationInput,
  CycleSimulationResult,
  FarmSetupData,
} from '@/features/aquaculture/types/farmSetup';

interface FarmSetupState {
  cycleSimulation: {
    result: CycleSimulationResult | null;
    loading: boolean;
    error: string | null;
  };
}

const initialState: FarmSetupState = {
  cycleSimulation: {
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

export const runCycleSimulation = createAsyncThunk(
  'farmSetup/runCycleSimulation',
  async (params: CycleSimulationInput, { rejectWithValue }) => {
    try {
      return await farmSetupService.simulateCycle(params);
    } catch (error: unknown) {
      return rejectWithValue(getApiErrorMessage(error, 'UNKNOWN_ERROR'));
    }
  }
);

export const farmSetupSlice = createSlice({
  name: 'farmSetup',
  initialState,
  reducers: {
    clearCycleSimulation: (state) => {
      state.cycleSimulation.result = null;
      state.cycleSimulation.error = null;
      state.cycleSimulation.loading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runCycleSimulation.pending, (state) => {
        state.cycleSimulation.loading = true;
        state.cycleSimulation.error = null;
      })
      .addCase(runCycleSimulation.fulfilled, (state, action) => {
        state.cycleSimulation.loading = false;
        state.cycleSimulation.result = action.payload;
        state.cycleSimulation.error = null;
      })
      .addCase(runCycleSimulation.rejected, (state, action) => {
        state.cycleSimulation.loading = false;
        state.cycleSimulation.error = action.payload as string;
      });
  },
});

export const { clearCycleSimulation } = farmSetupSlice.actions;
export default farmSetupSlice.reducer;
