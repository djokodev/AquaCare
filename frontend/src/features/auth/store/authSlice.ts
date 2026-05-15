import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authService } from '@/features/auth/services/authService';
import { profileService } from '@/features/profile/services/profileService';
import {
  User,
  LoginRequest,
  RegisterRequest,
} from '@/features/auth/types/auth';
import {
  FarmProfile,
  UpdateFarmProfilePayload,
  UpdateUserProfilePayload,
} from '@/features/profile/types/profile';

interface AuthState {
  user: User | null;
  farmProfile: FarmProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  farmProfile: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

const getThunkErrorMessage = (error: unknown): string => {
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

// Actions asynchrones
export const loginUser = createAsyncThunk(
  'auth/login',
  async (credentials: LoginRequest, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials);
      return response;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorMessage(error));
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/register',
  async (userData: RegisterRequest, { rejectWithValue }) => {
    try {
      const response = await authService.register(userData);
      return response;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorMessage(error));
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await authService.logout();
      return true;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorMessage(error));
    }
  }
);

export const deleteAccountUser = createAsyncThunk(
  'auth/deleteAccount',
  async (_, { rejectWithValue }) => {
    try {
      await authService.deleteAccount();
      return true;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorMessage(error));
    }
  }
);

export const checkAuthStatus = createAsyncThunk(
  'auth/checkStatus',
  async (_, { rejectWithValue }) => {
    try {
      const isAuthenticated = await authService.isAuthenticated();
      if (isAuthenticated) {
        const user = await authService.getCurrentUser();
        return { user, isAuthenticated: true };
      }
      return { user: null, isAuthenticated: false };
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorMessage(error));
    }
  }
);

export const loadUserProfile = createAsyncThunk(
  'auth/loadProfile',
  async (_, { rejectWithValue }) => {
    try {
      const [user, farmProfile] = await Promise.all([
        profileService.getProfile(),
        profileService.getFarmProfile(),
      ]);
      return { user, farmProfile };
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorMessage(error));
    }
  }
);

export const updateUserProfile = createAsyncThunk(
  'auth/updateProfile',
  async (profileData: UpdateUserProfilePayload, { rejectWithValue }) => {
    try {
      const updatedUser = await profileService.updateProfile(profileData);
      return updatedUser;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorMessage(error));
    }
  }
);

export const updateFarmProfile = createAsyncThunk(
  'auth/updateFarmProfile',
  async (farmData: UpdateFarmProfilePayload, { rejectWithValue }) => {
    try {
      const updatedFarmProfile = await profileService.updateFarmProfile(farmData);
      return updatedFarmProfile;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorMessage(error));
    }
  }
);

// Slice
export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },
    setFarmProfile: (state, action: PayloadAction<FarmProfile>) => {
      state.farmProfile = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.error = action.payload as string;
      });

    // Register
    builder
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.error = null;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.error = action.payload as string;
      });

    // Logout
    builder
      .addCase(logoutUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.farmProfile = null;
        state.error = null;
      })
      .addCase(logoutUser.rejected, (state, action) => {
        state.isLoading = false;
        // Even if logout fails, clear local state
        state.isAuthenticated = false;
        state.user = null;
        state.farmProfile = null;
        state.error = action.payload as string;
      });

    // Delete account
    builder
      .addCase(deleteAccountUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteAccountUser.fulfilled, (state) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.farmProfile = null;
        state.error = null;
      })
      .addCase(deleteAccountUser.rejected, (state, action) => {
        state.isLoading = false;
        // En cas d'echec de suppression, on conserve la session utilisateur.
        state.error = action.payload as string;
      });

    // Check auth status
    builder
      .addCase(checkAuthStatus.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(checkAuthStatus.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = action.payload.isAuthenticated;
        state.user = action.payload.user;
      })
      .addCase(checkAuthStatus.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.error = action.payload as string;
      });

    // Load profile
    builder
      .addCase(loadUserProfile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadUserProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.farmProfile = action.payload.farmProfile;
      })
      .addCase(loadUserProfile.rejected, (state, action) => {
        state.isLoading = false;
        // Ne pas écraser l'erreur si l'utilisateur est déjà déconnecté :
        // les requêtes en-vol (after logout) reviennent avec 401 et ne doivent
        // pas afficher un message d'erreur sur le LoginScreen.
        if (state.isAuthenticated) {
          state.error = action.payload as string;
        }
      });

    // Update profile
    builder
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.user = action.payload;
        state.error = null;
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Update farm profile
    builder
      .addCase(updateFarmProfile.fulfilled, (state, action) => {
        state.farmProfile = action.payload;
        state.error = null;
      })
      .addCase(updateFarmProfile.rejected, (state, action) => {
        state.error = action.payload as string;
      });

  },
});

export const { clearError, setUser, setFarmProfile } = authSlice.actions;
export default authSlice.reducer;
