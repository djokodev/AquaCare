import { useSelector, useDispatch } from 'react-redux';
import { useCallback, useEffect, useMemo } from 'react';
import { RootState, AppDispatch } from '@/store/store';
import { setLogoutCallback } from '@/services/api';
import {
  loginUser,
  registerUser,
  logoutUser,
  deleteAccountUser,
  checkAuthStatus,
  loadUserProfile,
  updateUserProfile,
  updateFarmProfile,
  clearError,
} from '@/features/auth/store/authSlice';
import { LoginRequest, RegisterRequest, User, FarmProfile } from '@/types/auth';

// Module-level tracking: survives component remounts, prevents duplicate profile loads
// across all instances of useAuth() (e.g., multiple screens mounted simultaneously).
const _profileLoad = { attempted: false, userId: null as string | null };

/**
 * Hook personnalisé pour la gestion de l'authentification
 */
export const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const authState = useSelector((state: RootState) => state.auth);

  // Configuration de la déconnexion automatique
  useEffect(() => {
    const handleAutoLogout = () => {
      dispatch(logoutUser());
    };

    setLogoutCallback(handleAutoLogout);
    // Pas de cleanup : le prochain composant monté écrase le callback.
    // Supprimer le cleanup évite la fenêtre vide pendant la transition Login → Main
    // qui causait une déconnexion automatique intempestive juste après le login.
  }, [dispatch]);

  // Auto-load farm profile once per user session
  useEffect(() => {
    const currentUserId = authState.user?.id;

    // Reset when user changes (e.g. logout → login with different account)
    if (currentUserId !== _profileLoad.userId) {
      _profileLoad.userId = currentUserId || null;
      _profileLoad.attempted = false;
    }

    if (
      authState.isAuthenticated &&
      authState.user &&
      !authState.farmProfile &&
      !authState.isLoading &&
      !_profileLoad.attempted &&
      !authState.error
    ) {
      _profileLoad.attempted = true;
      dispatch(loadUserProfile());
    }

    if (!authState.isAuthenticated) {
      _profileLoad.attempted = false;
      _profileLoad.userId = null;
    }
  }, [authState.isAuthenticated, authState.user?.id, authState.farmProfile, authState.isLoading, authState.error, dispatch]);

  // Actions
  const login = useCallback(
    (credentials: LoginRequest) => {
      return dispatch(loginUser(credentials));
    },
    [dispatch]
  );

  const register = useCallback(
    (userData: RegisterRequest) => {
      return dispatch(registerUser(userData));
    },
    [dispatch]
  );

  const logout = useCallback(() => {
    return dispatch(logoutUser());
  }, [dispatch]);

  const deleteAccount = useCallback(() => {
    return dispatch(deleteAccountUser()).unwrap();
  }, [dispatch]);

  const checkAuth = useCallback(() => {
    return dispatch(checkAuthStatus());
  }, [dispatch]);

  const loadProfile = useCallback(() => {
    return dispatch(loadUserProfile());
  }, [dispatch]);

  const updateProfile = useCallback(
    (profileData: Partial<User>) => {
      return dispatch(updateUserProfile(profileData));
    },
    [dispatch]
  );

  const updateFarm = useCallback(
    (farmData: Partial<FarmProfile>) => {
      return dispatch(updateFarmProfile(farmData));
    },
    [dispatch]
  );

  const clearAuthError = useCallback(() => {
    dispatch(clearError());
  }, [dispatch]);

  const displayName = useMemo(() => {
    const user = authState.user;
    if (!user) return '';
    if (user.display_name) return user.display_name;
    if (user.account_type === 'company' && user.business_name) return user.business_name;
    if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
    return user.phone_number || '';
  }, [authState.user?.id, authState.user?.display_name, authState.user?.business_name, authState.user?.first_name, authState.user?.last_name]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // State
    user: authState.user,
    farmProfile: authState.farmProfile,
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    error: authState.error,

    // Actions
    login,
    register,
    logout,
    deleteAccount,
    checkAuth,
    loadProfile,
    updateProfile,
    updateFarm,
    clearAuthError,

    // Computed properties
    isIndividual: authState.user?.is_individual || false,
    isCompany: authState.user?.is_company || false,
    displayName,
    isFarmCertified: authState.farmProfile?.is_certified || false,
  };
};


