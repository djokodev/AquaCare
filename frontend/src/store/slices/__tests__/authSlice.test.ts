/**
 * Tests unitaires pour store/slices/authSlice.ts
 *
 * Tests du state management Redux pour l'authentification.
 */

import authSliceReducer, {
  clearError,
  setUser,
  setFarmProfile,
  loginUser,
  registerUser,
  logoutUser,
  checkAuthStatus,
  loadUserProfile,
  updateUserProfile,
  updateFarmProfile,
} from '@/features/auth/store/authSlice';
import { User, FarmProfile } from '@/types/auth';

// Mock des services
jest.mock('@/features/auth/services/authService');

describe('store/slices/authSlice', () => {
  const initialState = {
    user: null,
    farmProfile: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  };

  const mockUser: User = {
    id: '123',
    phone_number: '+237670000000',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    account_type: 'individual',
    language_preference: 'fr',
    is_verified: false,
    display_name: 'John Doe',
    is_individual: true,
    is_company: false,
  };

  const mockFarmProfile: FarmProfile = {
    id: '456',
    farm_name: 'Ferme Test',
    certification_status: 'pending',
    total_ponds: 5,
    total_area_m2: 5000,
    is_certified: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  describe('reducers synchrones', () => {
    it('clearError efface l\'erreur', () => {
      const stateWithError = { ...initialState, error: 'Une erreur' };
      const newState = authSliceReducer(stateWithError, clearError());

      expect(newState.error).toBeNull();
    });

    it('setUser définit l\'utilisateur', () => {
      const newState = authSliceReducer(initialState, setUser(mockUser));

      expect(newState.user).toEqual(mockUser);
    });

    it('setFarmProfile définit le profil ferme', () => {
      const newState = authSliceReducer(initialState, setFarmProfile(mockFarmProfile));

      expect(newState.farmProfile).toEqual(mockFarmProfile);
    });
  });

  describe('loginUser thunk', () => {
    it('gère l\'état pending', () => {
      const action = { type: loginUser.pending.type };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(true);
      expect(newState.error).toBeNull();
    });

    it('gère l\'état fulfilled', () => {
      const action = {
        type: loginUser.fulfilled.type,
        payload: { user: mockUser, access: 'token', refresh: 'refresh' },
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(true);
      expect(newState.user).toEqual(mockUser);
      expect(newState.error).toBeNull();
    });

    it('gère l\'état rejected', () => {
      const action = {
        type: loginUser.rejected.type,
        payload: 'Identifiants invalides',
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
      expect(newState.error).toBe('Identifiants invalides');
    });
  });

  describe('registerUser thunk', () => {
    it('gère l\'état pending', () => {
      const action = { type: registerUser.pending.type };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(true);
      expect(newState.error).toBeNull();
    });

    it('gère l\'état fulfilled', () => {
      const action = {
        type: registerUser.fulfilled.type,
        payload: { user: mockUser, access: 'token', refresh: 'refresh' },
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(true);
      expect(newState.user).toEqual(mockUser);
      expect(newState.error).toBeNull();
    });

    it('gère l\'état rejected', () => {
      const action = {
        type: registerUser.rejected.type,
        payload: 'Numéro déjà utilisé',
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
      expect(newState.error).toBe('Numéro déjà utilisé');
    });
  });

  describe('logoutUser thunk', () => {
    const authenticatedState = {
      ...initialState,
      user: mockUser,
      farmProfile: mockFarmProfile,
      isAuthenticated: true,
    };

    it('gère l\'état pending', () => {
      const action = { type: logoutUser.pending.type };
      const newState = authSliceReducer(authenticatedState, action);

      expect(newState.isLoading).toBe(true);
    });

    it('gère l\'état fulfilled et nettoie l\'état', () => {
      const action = { type: logoutUser.fulfilled.type };
      const newState = authSliceReducer(authenticatedState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
      expect(newState.farmProfile).toBeNull();
      expect(newState.error).toBeNull();
    });

    it('gère l\'état rejected et nettoie quand même l\'état local', () => {
      const action = {
        type: logoutUser.rejected.type,
        payload: 'Erreur réseau',
      };
      const newState = authSliceReducer(authenticatedState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
      expect(newState.farmProfile).toBeNull();
      expect(newState.error).toBe('Erreur réseau');
    });
  });

  describe('checkAuthStatus thunk', () => {
    it('gère l\'état pending', () => {
      const action = { type: checkAuthStatus.pending.type };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(true);
    });

    it('gère l\'état fulfilled avec utilisateur authentifié', () => {
      const action = {
        type: checkAuthStatus.fulfilled.type,
        payload: { user: mockUser, isAuthenticated: true },
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(true);
      expect(newState.user).toEqual(mockUser);
    });

    it('gère l\'état fulfilled sans utilisateur', () => {
      const action = {
        type: checkAuthStatus.fulfilled.type,
        payload: { user: null, isAuthenticated: false },
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
    });

    it('gère l\'état rejected', () => {
      const action = {
        type: checkAuthStatus.rejected.type,
        payload: 'Token expiré',
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
      expect(newState.error).toBe('Token expiré');
    });
  });

  describe('loadUserProfile thunk', () => {
    it('gère l\'état pending', () => {
      const action = { type: loadUserProfile.pending.type };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(true);
      expect(newState.error).toBeNull();
    });

    it('gère l\'état fulfilled', () => {
      const action = {
        type: loadUserProfile.fulfilled.type,
        payload: { user: mockUser, farmProfile: mockFarmProfile },
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.user).toEqual(mockUser);
      expect(newState.farmProfile).toEqual(mockFarmProfile);
    });

    it('gère l\'état rejected', () => {
      const action = {
        type: loadUserProfile.rejected.type,
        payload: 'Erreur chargement profil',
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.error).toBe('Erreur chargement profil');
    });
  });

  describe('updateUserProfile thunk', () => {
    const stateWithUser = { ...initialState, user: mockUser };

    it('gère l\'état fulfilled et met à jour l\'utilisateur', () => {
      const updatedUser = { ...mockUser, first_name: 'Jane' };
      const action = {
        type: updateUserProfile.fulfilled.type,
        payload: updatedUser,
      };
      const newState = authSliceReducer(stateWithUser, action);

      expect(newState.user).toEqual(updatedUser);
      expect(newState.error).toBeNull();
    });

    it('gère l\'état rejected', () => {
      const action = {
        type: updateUserProfile.rejected.type,
        payload: 'Erreur mise à jour',
      };
      const newState = authSliceReducer(stateWithUser, action);

      expect(newState.error).toBe('Erreur mise à jour');
    });
  });

  describe('updateFarmProfile thunk', () => {
    const stateWithFarm = { ...initialState, farmProfile: mockFarmProfile };

    it('gère l\'état fulfilled et met à jour le profil ferme', () => {
      const updatedFarm = { ...mockFarmProfile, farm_name: 'Nouvelle Ferme' };
      const action = {
        type: updateFarmProfile.fulfilled.type,
        payload: updatedFarm,
      };
      const newState = authSliceReducer(stateWithFarm, action);

      expect(newState.farmProfile).toEqual(updatedFarm);
      expect(newState.error).toBeNull();
    });

    it('gère l\'état rejected', () => {
      const action = {
        type: updateFarmProfile.rejected.type,
        payload: 'Erreur mise à jour ferme',
      };
      const newState = authSliceReducer(stateWithFarm, action);

      expect(newState.error).toBe('Erreur mise à jour ferme');
    });
  });
});
