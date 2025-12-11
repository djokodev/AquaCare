import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';

import { fetchNotificationsSilent } from '@/features/notifications/store/notificationSlice';
import type { AppDispatch, RootState } from '@/store/store';

/**
 * Global polling hook to keep notifications (badge + liste) fresh
 * même lorsque l'utilisateur reste sur un écran (ex: Dashboard).
 */
export function useNotificationsPolling(intervalMs: number = 4000) {
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
      await dispatch(fetchNotificationsSilent());
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
