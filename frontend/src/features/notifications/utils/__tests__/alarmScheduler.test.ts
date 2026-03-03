import * as Notifications from 'expo-notifications';

import {
  FEEDING_ALARM_ACTION_FEED_NOW,
  FEEDING_ALARM_ACTION_SNOOZE_10M,
  FEEDING_ALARM_CATEGORY_ID,
  FEEDING_ALARM_RELAUNCH_SECONDS,
  formatMealTime,
  getMealTimes,
  registerFeedingAlarmCategory,
  scheduleFeedingAlarms,
} from '../alarmScheduler';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: {
    CALENDAR: 'calendar',
  },
}));

describe('alarmScheduler', () => {
  const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockNotifications.scheduleNotificationAsync.mockResolvedValue('notif-id');
  });

  it('calcule les horaires de repas attendus', () => {
    expect(getMealTimes(1)).toEqual([{ hour: 13, minute: 0 }]);
    expect(getMealTimes(2)).toEqual([
      { hour: 8, minute: 0 },
      { hour: 17, minute: 0 },
    ]);
    expect(getMealTimes(3)).toEqual([
      { hour: 8, minute: 0 },
      { hour: 13, minute: 0 },
      { hour: 18, minute: 0 },
    ]);
  });

  it('formate un horaire au format HHhMM', () => {
    expect(formatMealTime({ hour: 8, minute: 0 })).toBe('08h00');
    expect(formatMealTime({ hour: 17, minute: 5 })).toBe('17h05');
  });

  it('planifie les alarmes locales avec relances sur 2 minutes', async () => {
    const result = await scheduleFeedingAlarms(
      {
        id: 'plan-1',
        cycle: 'cycle-1',
        meals_per_day: 1,
      } as any,
      'Cycle A',
      {
        title: 'Titre',
        body: '{{cycleName}} @ {{time}}',
        actionFeedNow: 'Je nourris',
        actionSnooze10m: 'Rappeler 10 min',
      }
    );

    expect(result.permissionGranted).toBe(true);
    expect(result.ids).toHaveLength(FEEDING_ALARM_RELAUNCH_SECONDS.length);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(
      FEEDING_ALARM_RELAUNCH_SECONDS.length
    );
  });

  it('retourne permission refusée si notifications non autorisées', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as any);

    const result = await scheduleFeedingAlarms(
      {
        id: 'plan-2',
        cycle: 'cycle-2',
        meals_per_day: 2,
      } as any,
      'Cycle B',
      {
        title: 'Titre',
        body: '{{cycleName}} @ {{time}}',
        actionFeedNow: 'Je nourris',
        actionSnooze10m: 'Rappeler 10 min',
      }
    );

    expect(result).toEqual({ ids: [], permissionGranted: false });
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('configure la catégorie d actions notification', async () => {
    await registerFeedingAlarmCategory({
      actionFeedNow: 'Je nourris',
      actionSnooze10m: 'Rappeler 10 min',
    });

    expect(mockNotifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
      FEEDING_ALARM_CATEGORY_ID,
      expect.arrayContaining([
        expect.objectContaining({ identifier: FEEDING_ALARM_ACTION_FEED_NOW }),
        expect.objectContaining({ identifier: FEEDING_ALARM_ACTION_SNOOZE_10M }),
      ])
    );
  });
});
