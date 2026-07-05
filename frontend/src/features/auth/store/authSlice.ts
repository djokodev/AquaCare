import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AuthRequestError, authService } from '@/features/auth/services/authService';
import { profileService } from '@/features/profile/services/profileService';
import { sanitizeUserFacingErrorMessage } from '@/utils/errorParser';
import {
  AuthErrorPayload,
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
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
  fieldErrors: Record<string, string>;
}

const initialState: AuthState = {
  user: null,
  farmProfile: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  fieldErrors: {},
};

const normalizeAuthMessage = (message: string | null | undefined): string | null => {
  if (!message) {
    return null;
  }

  const sanitized = sanitizeUserFacingErrorMessage(message);
  return sanitized === 'UNKNOWN_ERROR' ? 'UNKNOWN_ERROR' : sanitized;
};

const normalizeFieldErrors = (fieldErrors: Record<string, string>): Record<string, string> => {
  const sanitizedFieldErrors: Record<string, string> = {};

  for (const [field, message] of Object.entries(fieldErrors)) {
    const sanitized = normalizeAuthMessage(message);
    if (sanitized) {
      sanitizedFieldErrors[field] = sanitized;
    }
  }

  return sanitizedFieldErrors;
};

const getThunkErrorPayload = (error: unknown): AuthErrorPayload => {
  if (error instanceof AuthRequestError) {
    return {
      message: normalizeAuthMessage(error.message),
      fieldErrors: normalizeFieldErrors(error.fieldErrors),
    };
  }

  if (error instanceof Error) {
    return {
      message: normalizeAuthMessage(error.message),
      fieldErrors: {},
    };
  }

  const apiError = error as {
    response?: { data?: Record<string, unknown> | string };
    message?: string;
  };
  const data = apiError.response?.data;

  if (typeof data === 'string' && data.trim()) {
    return {
      message: normalizeAuthMessage(data),
      fieldErrors: {},
    };
  }
  if (data && typeof data === 'object') {
    if (typeof data.detail === 'string') {
      return { message: normalizeAuthMessage(data.detail), fieldErrors: {} };
    }
    if (typeof data.message === 'string') {
      return { message: normalizeAuthMessage(data.message), fieldErrors: {} };
    }
    if (typeof data.error === 'string') {
      return { message: normalizeAuthMessage(data.error), fieldErrors: {} };
    }

    const firstFieldError = Object.values(data).find(Boolean);
    if (Array.isArray(firstFieldError) && firstFieldError.length > 0) {
      return {
        message: normalizeAuthMessage(String(firstFieldError[0])),
        fieldErrors: {},
      };
    }
    if (firstFieldError) {
      return {
        message: normalizeAuthMessage(String(firstFieldError)),
        fieldErrors: {},
      };
    }
  }

  return {
    message: normalizeAuthMessage(apiError.message) ?? 'UNKNOWN_ERROR',
    fieldErrors: {},
  };
};

const clearAuthErrors = (state: AuthState) => {
  state.error = null;
  state.fieldErrors = {};
};

const applyAuthError = (state: AuthState, payload?: AuthErrorPayload) => {
  const fieldErrors = normalizeFieldErrors(payload?.fieldErrors ?? {});
  state.error = normalizeAuthMessage(payload?.message) ?? (Object.keys(fieldErrors).length > 0 ? null : 'UNKNOWN_ERROR');
  state.fieldErrors = fieldErrors;
};

// Actions asynchrones
export const loginUser = createAsyncThunk<AuthResponse, LoginRequest, { rejectValue: AuthErrorPayload }>(
  'auth/login',
  async (credentials: LoginRequest, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials);
      return response;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorPayload(error));
    }
  }
);

export const registerUser = createAsyncThunk<AuthResponse, RegisterRequest, { rejectValue: AuthErrorPayload }>(
  'auth/register',
  async (userData: RegisterRequest, { rejectWithValue }) => {
    try {
      const response = await authService.register(userData);
      return response;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorPayload(error));
    }
  }
);

export const logoutUser = createAsyncThunk<boolean, void, { rejectValue: AuthErrorPayload }>(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await authService.logout();
      return true;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorPayload(error));
    }
  }
);

export const deleteAccountUser = createAsyncThunk<boolean, void, { rejectValue: AuthErrorPayload }>(
  'auth/deleteAccount',
  async (_, { rejectWithValue }) => {
    try {
      await authService.deleteAccount();
      return true;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorPayload(error));
    }
  }
);

export const checkAuthStatus = createAsyncThunk<
  { user: User | null; isAuthenticated: boolean },
  void,
  { rejectValue: AuthErrorPayload }
>(
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
      return rejectWithValue(getThunkErrorPayload(error));
    }
  }
);

export const loadUserProfile = createAsyncThunk<
  { user: User; farmProfile: FarmProfile | null },
  void,
  { rejectValue: AuthErrorPayload }
>(
  'auth/loadProfile',
  async (_, { rejectWithValue }) => {
    try {
      const [user, farmProfile] = await Promise.all([
        profileService.getProfile(),
        profileService.getFarmProfile(),
      ]);
      return { user, farmProfile };
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorPayload(error));
    }
  }
);

export const updateUserProfile = createAsyncThunk<User, UpdateUserProfilePayload, { rejectValue: AuthErrorPayload }>(
  'auth/updateProfile',
  async (profileData: UpdateUserProfilePayload, { rejectWithValue }) => {
    try {
      const updatedUser = await profileService.updateProfile(profileData);
      return updatedUser;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorPayload(error));
    }
  }
);

export const updateFarmProfile = createAsyncThunk<
  FarmProfile,
  UpdateFarmProfilePayload,
  { rejectValue: AuthErrorPayload }
>(
  'auth/updateFarmProfile',
  async (farmData: UpdateFarmProfilePayload, { rejectWithValue }) => {
    try {
      const updatedFarmProfile = await profileService.updateFarmProfile(farmData);
      return updatedFarmProfile;
    } catch (error: unknown) {
      return rejectWithValue(getThunkErrorPayload(error));
    }
  }
);

// Slice
export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      clearAuthErrors(state);
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
        clearAuthErrors(state);
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        clearAuthErrors(state);
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        applyAuthError(state, action.payload as AuthErrorPayload | undefined);
      });

    // Register
    builder
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        clearAuthErrors(state);
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        clearAuthErrors(state);
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        applyAuthError(state, action.payload as AuthErrorPayload | undefined);
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
        clearAuthErrors(state);
      })
      .addCase(logoutUser.rejected, (state, action) => {
        state.isLoading = false;
        // Even if logout fails, clear local state
        state.isAuthenticated = false;
        state.user = null;
        state.farmProfile = null;
        applyAuthError(state, action.payload as AuthErrorPayload | undefined);
      });

    // Delete account
    builder
      .addCase(deleteAccountUser.pending, (state) => {
        state.isLoading = true;
        clearAuthErrors(state);
      })
      .addCase(deleteAccountUser.fulfilled, (state) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.farmProfile = null;
        clearAuthErrors(state);
      })
      .addCase(deleteAccountUser.rejected, (state, action) => {
        state.isLoading = false;
        // En cas d'echec de suppression, on conserve la session utilisateur.
        applyAuthError(state, action.payload as AuthErrorPayload | undefined);
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
        applyAuthError(state, action.payload as AuthErrorPayload | undefined);
      });

    // Load profile
    builder
      .addCase(loadUserProfile.pending, (state) => {
        state.isLoading = true;
        clearAuthErrors(state);
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
          applyAuthError(state, action.payload as AuthErrorPayload | undefined);
        }
      });

    // Update profile
    builder
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.user = action.payload;
        clearAuthErrors(state);
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        applyAuthError(state, action.payload as AuthErrorPayload | undefined);
      });

    // Update farm profile
    builder
      .addCase(updateFarmProfile.fulfilled, (state, action) => {
        state.farmProfile = action.payload;
        clearAuthErrors(state);
      })
      .addCase(updateFarmProfile.rejected, (state, action) => {
        applyAuthError(state, action.payload as AuthErrorPayload | undefined);
      });

  },
});

export const { clearError, setUser, setFarmProfile } = authSlice.actions;
export default authSlice.reducer;
