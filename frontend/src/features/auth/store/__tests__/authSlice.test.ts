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
  loadFarmProfile,
  updateUserProfile,
  updateFarmProfile,
  deleteAccountUser,
} from '../authSlice';
import type { User } from '@/features/auth/types/auth';
import type { FarmProfile } from '@/features/profile/types/profile';

// Mock des services
jest.mock('@/features/auth/services/authService');

describe('store/slices/authSlice', () => {
  const initialState = {
    user: null,
    farmProfile: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    fieldErrors: {},
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
    is_active: true,
    date_joined: '2024-01-01T00:00:00Z',
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
      expect(newState.fieldErrors).toEqual({});
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
      expect(newState.fieldErrors).toEqual({});
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
        payload: {
          message: 'Identifiants invalides',
          fieldErrors: {},
        },
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
      expect(newState.error).toBe('Identifiants invalides');
      expect(newState.fieldErrors).toEqual({});
    });

    it('nettoie les suffixes techniques dans le message global', () => {
      const action = {
        type: loginUser.rejected.type,
        payload: {
          message: "Aucun compte n'est associé à ce nom de connexion. 400 invalid",
          fieldErrors: {},
        },
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.error).toBe("Aucun compte n'est associé à ce nom de connexion.");
    });
  });

  describe('registerUser thunk', () => {
    it('gère l\'état pending', () => {
      const action = { type: registerUser.pending.type };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(true);
      expect(newState.error).toBeNull();
      expect(newState.fieldErrors).toEqual({});
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
        payload: {
          message: null,
          fieldErrors: {
            phone_number: 'Numéro déjà utilisé',
          },
        },
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
      expect(newState.error).toBeNull();
      expect(newState.fieldErrors).toEqual({
        phone_number: 'Numéro déjà utilisé',
      });
    });

    it('nettoie les suffixes techniques des erreurs de champ', () => {
      const action = {
        type: registerUser.rejected.type,
        payload: {
          message: null,
          fieldErrors: {
            phone_number: 'Ce numéro existe déjà. 400 invalid',
          },
        },
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.error).toBeNull();
      expect(newState.fieldErrors).toEqual({
        phone_number: 'Ce numéro existe déjà.',
      });
    });

    it('ignore UNKNOWN_ERROR quand des erreurs de champ sont déjà présentes', () => {
      const action = {
        type: registerUser.rejected.type,
        payload: {
          message: 'UNKNOWN_ERROR',
          fieldErrors: {
            phone_number: 'Ce numéro est déjà utilisé.',
          },
        },
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.error).toBeNull();
      expect(newState.fieldErrors).toEqual({
        phone_number: 'Ce numéro est déjà utilisé.',
      });
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
      expect(newState.fieldErrors).toEqual({});
    });

    it('gère l\'état rejected et nettoie quand même l\'état local', () => {
      const action = {
        type: logoutUser.rejected.type,
        payload: {
          message: 'Erreur réseau',
          fieldErrors: {},
        },
      };
      const newState = authSliceReducer(authenticatedState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
      expect(newState.farmProfile).toBeNull();
      expect(newState.error).toBe('Erreur réseau');
      expect(newState.fieldErrors).toEqual({});
    });
  });

  describe('deleteAccountUser thunk', () => {
    const authenticatedState = {
      ...initialState,
      user: mockUser,
      farmProfile: mockFarmProfile,
      isAuthenticated: true,
    };

    it('gere l etat pending', () => {
      const action = { type: deleteAccountUser.pending.type };
      const newState = authSliceReducer(authenticatedState, action);

      expect(newState.isLoading).toBe(true);
      expect(newState.error).toBeNull();
      expect(newState.fieldErrors).toEqual({});
    });

    it('gere l etat fulfilled et nettoie l etat', () => {
      const action = { type: deleteAccountUser.fulfilled.type };
      const newState = authSliceReducer(authenticatedState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
      expect(newState.farmProfile).toBeNull();
      expect(newState.error).toBeNull();
      expect(newState.fieldErrors).toEqual({});
    });

    it('gere l etat rejected et conserve la session', () => {
      const action = {
        type: deleteAccountUser.rejected.type,
        payload: {
          message: 'Erreur reseau',
          fieldErrors: {},
        },
      };
      const newState = authSliceReducer(authenticatedState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(true);
      expect(newState.user).toEqual(mockUser);
      expect(newState.farmProfile).toEqual(mockFarmProfile);
      expect(newState.error).toBe('Erreur reseau');
      expect(newState.fieldErrors).toEqual({});
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
        payload: {
          message: 'Token expiré',
          fieldErrors: {},
        },
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.isAuthenticated).toBe(false);
      expect(newState.user).toBeNull();
      expect(newState.error).toBe('Token expiré');
      expect(newState.fieldErrors).toEqual({});
    });
  });

  describe('loadUserProfile thunk', () => {
    const authenticatedState = {
      ...initialState,
      user: mockUser,
      isAuthenticated: true,
    };

    it('gère l\'état pending', () => {
      const action = { type: loadUserProfile.pending.type };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(true);
      expect(newState.error).toBeNull();
      expect(newState.fieldErrors).toEqual({});
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

    it('gère l\'état fulfilled avec farmProfile null (utilisateur sans élevage)', () => {
      const action = {
        type: loadUserProfile.fulfilled.type,
        payload: { user: mockUser, farmProfile: null },
      };
      const newState = authSliceReducer(authenticatedState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.user).toEqual(mockUser);
      expect(newState.farmProfile).toBeNull();
    });

    it('gère l\'état rejected quand authentifié — affiche l\'erreur', () => {
      const action = {
        type: loadUserProfile.rejected.type,
        payload: {
          message: 'Erreur chargement profil',
          fieldErrors: {},
        },
      };
      const newState = authSliceReducer(authenticatedState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.error).toBe('Erreur chargement profil');
      expect(newState.fieldErrors).toEqual({});
    });

    it('gère l\'état rejected après logout (requête en-vol) — n\'affiche pas l\'erreur', () => {
      // Cas réel : loadUserProfile en-vol pendant le logout revient avec 401
      // après que logoutUser.fulfilled ait mis isAuthenticated = false.
      // L'erreur NE DOIT PAS s'afficher sur le LoginScreen.
      const action = {
        type: loadUserProfile.rejected.type,
        payload: {
          message: 'AUTH_INVALID_CREDENTIALS',
          fieldErrors: {},
        },
      };
      const newState = authSliceReducer(initialState, action); // isAuthenticated = false

      expect(newState.isLoading).toBe(false);
      expect(newState.error).toBeNull();
    });
  });

  describe('loadFarmProfile thunk', () => {
    const authenticatedState = {
      ...initialState,
      user: mockUser,
      isAuthenticated: true,
    };

    it('met à jour uniquement le profil ferme', () => {
      const action = {
        type: loadFarmProfile.fulfilled.type,
        payload: mockFarmProfile,
      };
      const newState = authSliceReducer(initialState, action);

      expect(newState.isLoading).toBe(false);
      expect(newState.user).toBeNull();
      expect(newState.farmProfile).toEqual(mockFarmProfile);
    });

    it('gère l\'état rejected quand authentifié — affiche l\'erreur', () => {
      const action = {
        type: loadFarmProfile.rejected.type,
        payload: {
          message: 'Erreur chargement ferme',
          fieldErrors: {},
        },
      };
      const newState = authSliceReducer(authenticatedState, action);

      expect(newState.error).toBe('Erreur chargement ferme');
      expect(newState.fieldErrors).toEqual({});
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
      expect(newState.fieldErrors).toEqual({});
    });

    it('gère l\'état rejected', () => {
      const action = {
        type: updateUserProfile.rejected.type,
        payload: {
          message: 'Erreur mise à jour',
          fieldErrors: {},
        },
      };
      const newState = authSliceReducer(stateWithUser, action);

      expect(newState.error).toBe('Erreur mise à jour');
      expect(newState.fieldErrors).toEqual({});
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
      expect(newState.fieldErrors).toEqual({});
    });

    it('gère l\'état rejected', () => {
      const action = {
        type: updateFarmProfile.rejected.type,
        payload: {
          message: 'Erreur mise à jour ferme',
          fieldErrors: {},
        },
      };
      const newState = authSliceReducer(stateWithFarm, action);

      expect(newState.error).toBe('Erreur mise à jour ferme');
      expect(newState.fieldErrors).toEqual({});
    });
  });
});
