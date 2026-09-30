import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';

import { fetchNotificationsSilent } from '@/features/notifications/store/notificationSlice';
import { refreshSupportUnread } from '@/features/chat/store/chatSlice';
import type { AppDispatch, RootState } from '@/store/store';

/**
 * Rafraîchit la liste in-app (badge + liste) à intervalle lent et à chaque
 * retour au premier plan. Les notifications urgentes arrivent en push.
 * Les notifications sont liées au compte (commandes, support), pas au cycle.
 */
export function useNotificationsPolling(intervalMs: number = 60_000) {
  const dispatch = useDispatch<AppDispatch>();
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const fetchLatestNotifications = useCallback(async () => {
    if (!isAuthenticated || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    try {
      await Promise.all([
        dispatch(fetchNotificationsSilent(undefined)),
        // Badge rouge de l'onglet Support (réponses non lues du support)
        dispatch(refreshSupportUnread()),
      ]);
    } finally {
      isFetchingRef.current = false;
    }
  }, [dispatch, isAuthenticated]);

  const startPolling = useCallback(() => {
    if (!isAuthenticated || pollingRef.current) {
      return;
    }

    pollingRef.current = setInterval(() => {
      fetchLatestNotifications();
    }, intervalMs);
  }, [fetchLatestNotifications, intervalMs, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      stopPolling();
      return;
    }

    fetchLatestNotifications();
    startPolling();

    return () => {
      stopPolling();
    };
  }, [fetchLatestNotifications, startPolling, stopPolling, isAuthenticated]);

  useEffect(() => {
    const handleAppStateChange = (status: AppStateStatus) => {
      if (status === 'active' && isAuthenticated) {
        fetchLatestNotifications();
        startPolling();
      } else {
        stopPolling();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [fetchLatestNotifications, startPolling, stopPolling, isAuthenticated]);
}
