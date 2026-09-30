import { navigationRef } from '@/navigation/navigationRef';

type NotificationData = {
  notification_type?: unknown;
  metadata?: { cycle_id?: unknown; production_cycle_id?: unknown } | null;
} | null | undefined;

type Target = { name: string; params?: object };

const ORDER_TYPES = new Set(['order_confirmed', 'order_delivered', 'order_ready_for_pickup']);

/** Écran à ouvrir pour une notification serveur (push ou liste in-app). */
export const getNotificationTarget = (data: NotificationData): Target | null => {
  const type = typeof data?.notification_type === 'string' ? data.notification_type : null;
  if (!type) {
    return null;
  }
  if (ORDER_TYPES.has(type)) {
    const cycleId = data?.metadata?.production_cycle_id;
    return { name: 'OrdersHistory', params: typeof cycleId === 'string' ? { cycleId } : undefined };
  }
  if (type === 'new_message') {
    return { name: 'MainTabs', params: { screen: 'Support' } };
  }
  return null;
};

let pendingTarget: Target | null = null;
let mainReady = false;

const flush = () => {
  if (pendingTarget && mainReady && navigationRef.isReady()) {
    const target = pendingTarget;
    pendingTarget = null;
    navigationRef.navigate(target.name, target.params);
  }
};

/**
 * Ouvre l'écran lié à une notification. Si l'app démarre (tap app fermée) ou
 * si l'utilisateur n'est pas encore connecté, la navigation est différée
 * jusqu'au montage de l'espace connecté.
 */
export const openNotificationTarget = (data: NotificationData): boolean => {
  const target = getNotificationTarget(data);
  if (!target) {
    return false;
  }
  pendingTarget = target;
  flush();
  return true;
};

/** Appelé par MainNavigator : l'espace connecté est monté (ou démonté). */
export const setMainNavigatorReady = (ready: boolean) => {
  mainReady = ready;
  if (ready) {
    flush();
  } else {
    pendingTarget = null;
  }
};

/** Pour les tests. */
export const resetNotificationNavigation = () => {
  pendingTarget = null;
  mainReady = false;
};
