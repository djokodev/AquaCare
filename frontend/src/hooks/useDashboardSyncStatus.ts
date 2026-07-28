import { useCallback, useEffect, useRef, useState } from 'react';

import {
  dashboardSyncService,
  type DashboardSyncContext,
  type DashboardSyncDomain,
} from '@/services/dashboardSyncService';

export function useDashboardSyncStatus(domain: DashboardSyncDomain, context?: DashboardSyncContext) {
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const requestRef = useRef(0);

  const refreshLastSyncedAt = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const value = await dashboardSyncService.get(domain, context);
    if (requestId === requestRef.current) {
      setLastSyncedAt(value);
    }
  }, [context, domain]);

  useEffect(() => {
    requestRef.current += 1;
    setLastSyncedAt(null);
    void refreshLastSyncedAt();
  }, [refreshLastSyncedAt]);

  return { lastSyncedAt, refreshLastSyncedAt };
}
