import { useCallback, useEffect, useState } from 'react';

import { dashboardSyncService, type DashboardSyncDomain } from '@/services/dashboardSyncService';

export function useDashboardSyncStatus(domain: DashboardSyncDomain) {
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const refreshLastSyncedAt = useCallback(async () => {
    setLastSyncedAt(await dashboardSyncService.get(domain));
  }, [domain]);

  useEffect(() => {
    void refreshLastSyncedAt();
  }, [refreshLastSyncedAt]);

  return { lastSyncedAt, refreshLastSyncedAt };
}
