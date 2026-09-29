import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  DEFAULT_FEEDING_REMINDER_SETTINGS,
  FEEDING_ALARM_CHANNEL_ID,
  FEEDING_ALARM_DATA_TYPE,
  FEEDING_ALARM_SNOOZE_MINUTES,
  buildReminderBody,
  cancelAllFeedingReminders,
  loadReminderSettings,
  normalizeSettings,
  saveReminderSettings,
  savePlanSnapshotEntry,
  loadPlanSnapshot,
  scheduleFeedingReminders,
  scheduleFeedingSnooze,
} from '../feedingReminders';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  setNotificationCategoryAsync: jest.fn(),
  getNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  deleteNotificationChannelAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidAudioUsage: { ALARM: 4 },
  AndroidAudioContentType: { SONIFICATION: 4 },
  AndroidNotificationPriority: { MAX: 'max' },
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    TIME_INTERVAL: 'timeInterval',
  },
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;

const messages = {
  title: 'AquaCare, Nourrissage',
  body: 'C est l heure.',
  bodyWithPlan: 'C est l heure. {{quantities}}',
  snoozeBody: 'Rappel',
  actionFeedNow: 'Nourrir maintenant',
  actionSnooze: 'Rappeler dans 5 min',
  channelName: 'Rappels',
  channelDescription: 'Alarmes',
};

describe('feedingReminders', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  });

  it('utilise 8h30 et 16h30 tous les jours, desactives par defaut', async () => {
    const settings = await loadReminderSettings('user-1');

    expect(settings.enabled).toBe(false);
    expect(settings.times.map((time) => [time.hour, time.minute])).toEqual([[8, 30], [16, 30]]);
    expect(settings.days).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('memorise les reglages par compte et ignore les valeurs invalides', async () => {
    await saveReminderSettings('user-1', {
      enabled: true,
      times: [
        { id: 'b', hour: 17, minute: 0 },
        { id: 'a', hour: 6, minute: 15 },
        { id: 'bad', hour: 25, minute: 0 },
      ],
      days: [2, 2, 9, 4],
      bypassDnd: true,
    });

    const stored = await loadReminderSettings('user-1');
    const otherUser = await loadReminderSettings('user-2');

    expect(stored.times.map((time) => time.id)).toEqual(['a', 'b']);
    expect(stored.days).toEqual([2, 4]);
    expect(stored.bypassDnd).toBe(true);
    expect(otherUser.enabled).toBe(false);
  });

  it('affiche la ration des plans encore valides dans l alarme', () => {
    const body = buildReminderBody(
      {
        a: { unitName: 'Bac 2', feedPerMealKg: 0.8, endDate: '2026-10-05' },
        b: { unitName: 'Bac 1', feedPerMealKg: 1.25, endDate: '2026-10-05' },
        c: { unitName: 'Bac 3', feedPerMealKg: 2, endDate: '2026-09-01' },
      },
      messages,
      'fr-FR',
      '2026-09-29',
    );

    expect(body).toBe('C est l heure. Bac 1 : 1,25 kg · Bac 2 : 0,8 kg');
  });

  it('garde un texte simple sans plan d alimentation', () => {
    expect(buildReminderBody({}, messages, 'fr-FR', '2026-09-29')).toBe('C est l heure.');
  });

  it('programme une alarme quotidienne par heure quand tous les jours sont choisis', async () => {
    const result = await scheduleFeedingReminders({
      settings: { ...DEFAULT_FEEDING_REMINDER_SETTINGS, enabled: true },
      snapshot: {},
      messages,
      locale: 'fr-FR',
    });

    expect(result).toEqual({ status: 'scheduled', scheduledCount: 2 });
    const firstCall = mocked.scheduleNotificationAsync.mock.calls[0][0];
    expect(firstCall.trigger).toEqual({ type: 'daily', hour: 8, minute: 30, channelId: FEEDING_ALARM_CHANNEL_ID });
    expect(firstCall.content).toEqual(expect.objectContaining({
      sound: 'feeding_alarm.wav',
      interruptionLevel: 'timeSensitive',
      categoryIdentifier: 'feeding_alarm_actions',
      data: { type: FEEDING_ALARM_DATA_TYPE, hour: 8, minute: 30 },
    }));
  });

  it('programme une alarme hebdomadaire par jour choisi', async () => {
    const result = await scheduleFeedingReminders({
      settings: { ...DEFAULT_FEEDING_REMINDER_SETTINGS, enabled: true, days: [2, 4] },
      snapshot: {},
      messages,
      locale: 'fr-FR',
    });

    expect(result.scheduledCount).toBe(4);
    expect(mocked.scheduleNotificationAsync.mock.calls.map((call) => call[0].trigger)).toContainEqual({
      type: 'weekly',
      weekday: 4,
      hour: 16,
      minute: 30,
      channelId: FEEDING_ALARM_CHANNEL_ID,
    });
  });

  it('remplace les anciennes alarmes sans toucher aux rappels +5 min ni aux autres notifications', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'old', content: { data: { type: FEEDING_ALARM_DATA_TYPE } } },
      { identifier: 'snooze', content: { data: { type: FEEDING_ALARM_DATA_TYPE, isSnooze: true } } },
      { identifier: 'other', content: { data: { type: 'other' } } },
    ] as never);

    await scheduleFeedingReminders({
      settings: { ...DEFAULT_FEEDING_REMINDER_SETTINGS, enabled: false },
      snapshot: {},
      messages,
      locale: 'fr-FR',
    });

    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old');
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('ne demande la permission que sur une action explicite', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' } as never);

    const silent = await scheduleFeedingReminders({
      settings: { ...DEFAULT_FEEDING_REMINDER_SETTINGS, enabled: true },
      snapshot: {},
      messages,
      locale: 'fr-FR',
    });
    expect(silent.status).toBe('permission_denied');
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();

    mocked.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    const explicit = await scheduleFeedingReminders({
      settings: { ...DEFAULT_FEEDING_REMINDER_SETTINGS, enabled: true },
      snapshot: {},
      messages,
      locale: 'fr-FR',
      requestPermission: true,
    });
    expect(explicit.status).toBe('scheduled');
  });

  it('cree un canal Android d alarme et le recree si le mode Ne pas deranger change', async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    mocked.getNotificationChannelAsync.mockResolvedValue({ bypassDnd: false } as never);

    await scheduleFeedingReminders({
      settings: { ...DEFAULT_FEEDING_REMINDER_SETTINGS, enabled: true, bypassDnd: true },
      snapshot: {},
      messages,
      locale: 'fr-FR',
    });

    expect(mocked.deleteNotificationChannelAsync).toHaveBeenCalledWith(FEEDING_ALARM_CHANNEL_ID);
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(
      FEEDING_ALARM_CHANNEL_ID,
      expect.objectContaining({ importance: 5, bypassDnd: true, sound: 'feeding_alarm.wav', audioAttributes: expect.objectContaining({ usage: 4 }) }),
    );
    Object.defineProperty(Platform, 'OS', { value: originalOs, configurable: true });
  });

  it('reprogramme l alarme dans 5 minutes', async () => {
    await scheduleFeedingSnooze(
      { request: { content: { title: 'T', body: 'B', data: { type: FEEDING_ALARM_DATA_TYPE } } } } as never,
      messages,
    );

    const call = mocked.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.trigger).toEqual({ type: 'timeInterval', seconds: FEEDING_ALARM_SNOOZE_MINUTES * 60, channelId: FEEDING_ALARM_CHANNEL_ID });
    expect(FEEDING_ALARM_SNOOZE_MINUTES).toBe(5);
    expect(call.content.data).toEqual({ type: FEEDING_ALARM_DATA_TYPE, isSnooze: true });
  });

  it('annule toutes les alarmes de nourrissage a la deconnexion', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'a', content: { data: { type: FEEDING_ALARM_DATA_TYPE } } },
      { identifier: 'b', content: { data: { type: FEEDING_ALARM_DATA_TYPE, isSnooze: true } } },
    ] as never);

    await cancelAllFeedingReminders();

    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('memorise et retire la ration d une unite', async () => {
    await savePlanSnapshotEntry('user-1', 'alloc-1', { unitName: 'Bac 1', feedPerMealKg: 0.4, endDate: '2026-10-01' });
    expect(await loadPlanSnapshot('user-1')).toEqual({ 'alloc-1': { unitName: 'Bac 1', feedPerMealKg: 0.4, endDate: '2026-10-01' } });

    await savePlanSnapshotEntry('user-1', 'alloc-1', null);
    expect(await loadPlanSnapshot('user-1')).toEqual({});
  });

  it('normalise des reglages absents', () => {
    expect(normalizeSettings(undefined).times).toHaveLength(2);
  });
});
