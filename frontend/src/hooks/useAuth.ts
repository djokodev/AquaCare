import { useSelector, useDispatch } from 'react-redux';
import { useCallback, useEffect } from 'react';
import { RootState, AppDispatch } from '@/store/store';
import { setLogoutCallback } from '@/services/api';
import {
  loginUser,
  registerUser,
  logoutUser,
  checkAuthStatus,
  loadUserProfile,
  updateUserProfile,
  updateFarmProfile,
  clearError,
} from '@/store/slices/authSlice';
import { LoginRequest, RegisterRequest, User, FarmProfile } from '@/types/auth';

/**
 * Hook personnalisé pour la gestion de l'authentification
 */
export const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const authState = useSelector((state: RootState) => state.auth);

  // Configuration de la déconnexion automatique
  useEffect(() => {
    const handleAutoLogout = () => {
      console.log('🔐 Déconnexion automatique déclenchée (token expiré)');
      dispatch(logoutUser());
    };

    // S'enregistrer pour la déconnexion automatique
    setLogoutCallback(handleAutoLogout);

    // Cleanup au démontage du composant
    return () => {
      setLogoutCallback(() => {});
    };
  }, [dispatch]);

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
    checkAuth,
    loadProfile,
    updateProfile,
    updateFarm,
    clearAuthError,

    // Computed properties
    isIndividual: authState.user?.is_individual || false,
    isCompany: authState.user?.is_company || false,
    displayName: (() => {
      const user = authState.user;
      if (!user) return '';
      
      // Priorité: display_name > business_name (pour entreprises) > first_name + last_name > phone_number
      if (user.display_name) return user.display_name;
      if (user.account_type === 'company' && user.business_name) return user.business_name;
      if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
      if (user.phone_number) return user.phone_number;
      return '';
    })(),
    isFarmCertified: authState.farmProfile?.is_certified || false,
  };
};