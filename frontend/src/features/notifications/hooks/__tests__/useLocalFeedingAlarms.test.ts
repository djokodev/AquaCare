import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useLocalFeedingAlarms } from '../useLocalFeedingAlarms';
import * as alarmScheduler from '../../utils/alarmScheduler';

jest.mock('../../utils/alarmScheduler', () => ({
  scheduleFeedingAlarms: jest.fn(),
  cancelFeedingAlarms: jest.fn(),
  getMealTimes: jest.fn(() => [{ hour: 8, minute: 0 }]),
  formatMealTime: jest.fn(() => '08h00'),
}));

describe('useLocalFeedingAlarms', () => {
  const mockScheduler = alarmScheduler as jest.Mocked<typeof alarmScheduler>;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockScheduler.scheduleFeedingAlarms.mockResolvedValue({
      ids: ['id-1', 'id-2'],
      permissionGranted: true,
    } as any);
  });

  it('persiste la préférence d activation des alarmes', async () => {
    const { result } = renderHook(() => useLocalFeedingAlarms());

    await act(async () => {
      await result.current.setAlarmsEnabled(false);
    });

    let value = true;
    await act(async () => {
      value = await result.current.getAlarmsEnabled();
    });

    expect(value).toBe(false);
  });

  it('planifie les alarmes et les enregistre dans le registry', async () => {
    const { result } = renderHook(() => useLocalFeedingAlarms());

    let syncResult: any;
    await act(async () => {
      syncResult = await result.current.scheduleAlarms(
        { id: 'plan-1', cycle: 'cycle-1', meals_per_day: 2 } as any,
        'Cycle A',
        {
          title: 'Title',
          body: '{{cycleName}} @ {{time}}',
          actionFeedNow: 'Feed',
          actionSnooze10m: 'Snooze',
        }
      );
    });

    expect(syncResult.status).toBe('scheduled');
    expect(syncResult.scheduledCount).toBe(2);
    expect(mockScheduler.scheduleFeedingAlarms).toHaveBeenCalled();
  });

  it('reconcile désactive et supprime les alarmes hors plans actifs', async () => {
    const { result } = renderHook(() => useLocalFeedingAlarms());

    await act(async () => {
      await result.current.scheduleAlarms(
        { id: 'plan-old', cycle: 'cycle-1', meals_per_day: 1 } as any,
        'Cycle A',
        {
          title: 'Title',
          body: '{{cycleName}} @ {{time}}',
          actionFeedNow: 'Feed',
          actionSnooze10m: 'Snooze',
        }
      );
    });

    await act(async () => {
      await result.current.reconcileCycleAlarms({
        cycleId: 'cycle-1',
        cycleName: 'Cycle A',
        activePlans: [],
        enabled: false,
        messages: {
          title: 'Title',
          body: '{{cycleName}} @ {{time}}',
          actionFeedNow: 'Feed',
          actionSnooze10m: 'Snooze',
        },
      });
    });

    expect(mockScheduler.cancelFeedingAlarms).toHaveBeenCalled();
  });
});
