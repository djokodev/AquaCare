import { useSelector, useDispatch } from 'react-redux';
import { useCallback, useEffect, useState } from 'react';
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
      dispatch(logoutUser());
    };

    // S'enregistrer pour la déconnexion automatique
    setLogoutCallback(handleAutoLogout);

    // Cleanup au démontage du composant
    return () => {
      setLogoutCallback(() => {});
    };
  }, [dispatch]);

  // Chargement automatique du profil ferme lors de la connexion (une seule fois)
  const [profileLoadAttempted, setProfileLoadAttempted] = useState(false);
  const [lastUserId, setLastUserId] = useState<string | null>(null);
  
  useEffect(() => {
    // Si l'utilisateur change, reset le flag
    const currentUserId = authState.user?.id;
    if (currentUserId !== lastUserId) {
      setLastUserId(currentUserId || null);
      setProfileLoadAttempted(false);
    }
    
    // Charger le profil seulement si:
    // 1. Utilisateur authentifié ET
    // 2. Utilisateur existe ET  
    // 3. Pas de profil ferme ET
    // 4. Pas en cours de chargement ET
    // 5. Pas encore tenté pour cet utilisateur ET
    // 6. Pas d'erreur d'authentification en cours
    if (authState.isAuthenticated && 
        authState.user && 
        !authState.farmProfile && 
        !authState.isLoading && 
        !profileLoadAttempted &&
        !authState.error) {
      setProfileLoadAttempted(true);
      dispatch(loadUserProfile());
    }
    
    // Reset complètement si déconnexion
    if (!authState.isAuthenticated) {
      setProfileLoadAttempted(false);
      setLastUserId(null);
    }
  }, [authState.isAuthenticated, authState.user?.id, authState.farmProfile, authState.isLoading, authState.error, profileLoadAttempted, lastUserId, dispatch]);

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