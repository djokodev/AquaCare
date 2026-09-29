import { navigationRef } from '@/navigation/navigationRef';

import {
  getNotificationTarget,
  openNotificationTarget,
  resetNotificationNavigation,
  setMainNavigatorReady,
} from '../notificationNavigation';

jest.mock('@/navigation/navigationRef', () => ({
  navigationRef: { isReady: jest.fn(() => true), navigate: jest.fn() },
}));

const ref = navigationRef as unknown as { isReady: jest.Mock; navigate: jest.Mock };

describe('notificationNavigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetNotificationNavigation();
  });

  it('associe les commandes a l historique et le support au chat', () => {
    expect(getNotificationTarget({ notification_type: 'order_ready_for_pickup', metadata: { production_cycle_id: 'c1' } }))
      .toEqual({ name: 'OrdersHistory', params: { cycleId: 'c1' } });
    expect(getNotificationTarget({ notification_type: 'order_delivered', metadata: {} }))
      .toEqual({ name: 'OrdersHistory', params: undefined });
    expect(getNotificationTarget({ notification_type: 'new_message' }))
      .toEqual({ name: 'MainTabs', params: { screen: 'Support' } });
    expect(getNotificationTarget({ notification_type: 'unknown' })).toBeNull();
    expect(getNotificationTarget(null)).toBeNull();
  });

  it('attend que l espace connecte soit monte pour naviguer (tap app fermee)', () => {
    expect(openNotificationTarget({ notification_type: 'new_message' })).toBe(true);
    expect(ref.navigate).not.toHaveBeenCalled();

    setMainNavigatorReady(true);

    expect(ref.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'Support' });
  });

  it('navigue immediatement quand l app est deja ouverte', () => {
    setMainNavigatorReady(true);
    openNotificationTarget({ notification_type: 'order_confirmed' });

    expect(ref.navigate).toHaveBeenCalledWith('OrdersHistory', undefined);
  });

  it('oublie la navigation en attente a la deconnexion', () => {
    openNotificationTarget({ notification_type: 'new_message' });
    setMainNavigatorReady(false);
    setMainNavigatorReady(true);

    expect(ref.navigate).not.toHaveBeenCalled();
  });
});
